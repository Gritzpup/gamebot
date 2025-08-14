import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger, logGameEvent } from '../utils/logger';
import { Database } from '../services/database/Database';
import { RedisClient } from '../services/redis/RedisClient';
import { GameSession } from './GameSession';
import { 
  IGame, 
  GameRegistryEntry, 
  GameCategory,
  GameEvent,
  GameEventType 
} from '../types/game.types';
import { 
  Platform, 
  Player, 
  GameSession as GameSessionType,
  UIMessage 
} from '../types';
import { IPlatformAdapter, CommandContext } from '../types/platform.types';
import { performanceConfig } from '../config';

// Import game implementations
import { TicTacToe } from '../games/board-games/TicTacToe';
import { Connect4 } from '../games/board-games/Connect4';
import { Othello } from '../games/board-games/Othello';
import { Wordle } from '../games/word-games/Wordle';
// TODO: Import more games as they're implemented

export class GameEngine extends EventEmitter {
  private static instance: GameEngine;
  private platforms: Map<Platform, IPlatformAdapter> = new Map();
  private activeSessions: Map<string, GameSession> = new Map();
  private gameRegistry: Map<string, GameRegistryEntry> = new Map();
  private playerGames: Map<string, Set<string>> = new Map();
  private messageToSession: Map<string, string> = new Map(); // messageId -> sessionId
  private database: Database;
  private redis: RedisClient;
  private isRunning: boolean = false;
  private cleanupInterval?: NodeJS.Timeout;

  private constructor() {
    super();
    this.database = Database.getInstance();
    this.redis = RedisClient.getInstance();
  }

  static getInstance(): GameEngine {
    if (!GameEngine.instance) {
      GameEngine.instance = new GameEngine();
    }
    return GameEngine.instance;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing GameEngine...');
    
    // Register built-in games
    this.registerGame({
      id: 'tictactoe',
      name: 'Tic Tac Toe',
      constructor: TicTacToe,
      aliases: ['ttt', 'xo'],
      enabled: true,
    });
    
    this.registerGame({
      id: 'wordle',
      name: 'Wordle',
      constructor: Wordle,
      aliases: ['word'],
      enabled: true,
    });
    
    this.registerGame({
      id: 'connect4',
      name: 'Connect 4',
      constructor: Connect4,
      aliases: ['c4', 'four'],
      enabled: true,
    });
    
    this.registerGame({
      id: 'othello',
      name: 'Othello',
      constructor: Othello,
      aliases: ['reversi'],
      enabled: true,
    });
    
    // TODO: Register more games
    
    logger.info(`Registered ${this.gameRegistry.size} games`);
    
    // Load active sessions from database
    await this.loadActiveSessions();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('GameEngine is already running');
      return;
    }
    
    this.isRunning = true;
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 60000); // Every minute
    
    logger.info('GameEngine started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('GameEngine is not running');
      return;
    }
    
    this.isRunning = false;
    
    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Save all active sessions
    await this.saveAllSessions();
    
    logger.info('GameEngine stopped');
  }

  async registerPlatform(adapter: IPlatformAdapter): Promise<void> {
    logger.info(`Registering platform: ${adapter.platform}`);
    
    this.platforms.set(adapter.platform, adapter);
    
    // Register command handlers
    this.setupPlatformCommands(adapter);
    
    // Register interaction handler
    adapter.onInteraction(async (interaction) => {
      await this.handleInteraction(interaction);
    });
  }

  registerGame(entry: GameRegistryEntry): void {
    this.gameRegistry.set(entry.id, entry);
    
    // Also register aliases
    for (const alias of entry.aliases) {
      this.gameRegistry.set(alias, entry);
    }
    
    logger.info(`Registered game: ${entry.name} (${entry.id})`);
  }

  async createGameSession(
    gameType: string,
    platform: Platform,
    channelId: string,
    creatorId: string
  ): Promise<GameSession | null> {
    const gameEntry = this.gameRegistry.get(gameType.toLowerCase());
    if (!gameEntry || !gameEntry.enabled) {
      return null;
    }
    
    // Check if creator has too many active games
    const playerGames = this.playerGames.get(creatorId) || new Set();
    if (playerGames.size >= 5) {
      throw new Error('You have too many active games. Please finish some before starting new ones.');
    }
    
    // Check concurrent game limit
    if (this.activeSessions.size >= performanceConfig.maxConcurrentGames) {
      throw new Error('Too many active games. Please try again later.');
    }
    
    // Create game instance
    const game = new gameEntry.constructor();
    
    // Create session
    const sessionId = uuidv4();
    const session = new GameSession(sessionId, game, platform, channelId);
    
    // Initialize the session
    await session.initialize();
    
    // Get creator player data
    const adapter = this.platforms.get(platform);
    if (!adapter) {
      throw new Error('Platform adapter not found');
    }
    
    const creator = await adapter.getPlayer(creatorId);
    if (!creator) {
      throw new Error('Player not found');
    }
    
    // Add creator to session
    await session.addPlayer(creator);
    
    // Store session
    this.activeSessions.set(sessionId, session);
    this.addPlayerGame(creatorId, sessionId);
    
    // Set up bot move callback to update UI
    (session as any).onBotMove = async () => {
      // Find message ID for this session
      let messageId: string | undefined;
      for (const [msgId, sessId] of this.messageToSession.entries()) {
        if (sessId === sessionId) {
          messageId = msgId;
          break;
        }
      }
      
      if (messageId) {
        try {
          // Get the human player (first player, creator)
          const players = session.getPlayers();
          const humanPlayerId = players.length > 0 ? players[0].id : undefined;
          const newState = await session.renderGameState(humanPlayerId);
          await adapter.editMessage(channelId, messageId, newState);
        } catch (error) {
          logger.error('Error updating message after bot move:', error);
        }
      }
    };
    
    // Save to database
    await this.saveSession(session);
    
    // Emit event
    this.emitGameEvent(sessionId, GameEventType.GameStarted, {
      gameType: gameEntry.id,
      creatorId,
    });
    
    logger.info(`Created game session: ${sessionId} (${gameEntry.name})`);
    
    // For Connect4, set up auto-bot timer
    if (gameEntry.id === 'connect4') {
      this.setupAutoBot(sessionId, session);
    }
    
    return session;
  }

  async joinGameSession(
    sessionId: string,
    playerId: string
  ): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }
    
    // Get player data
    const adapter = this.platforms.get(session.getPlatform());
    if (!adapter) {
      return false;
    }
    
    const player = await adapter.getPlayer(playerId);
    if (!player) {
      return false;
    }
    
    // Try to add player
    const added = await session.addPlayer(player);
    if (added) {
      this.addPlayerGame(playerId, sessionId);
      await this.saveSession(session);
      
      this.emitGameEvent(sessionId, GameEventType.PlayerJoined, {
        playerId,
      });
    }
    
    return added;
  }

  async removePlayerFromSession(
    sessionId: string,
    playerId: string
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }
    
    await session.removePlayer(playerId);
    this.removePlayerGame(playerId, sessionId);
    
    // Check if session should be ended
    if (session.getPlayerCount() === 0) {
      await this.endGameSession(sessionId, 'all_players_left');
    } else {
      await this.saveSession(session);
      
      this.emitGameEvent(sessionId, GameEventType.PlayerLeft, {
        playerId,
      });
    }
  }

  private async endGameSession(
    sessionId: string,
    reason: string
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }
    
    // End the game
    await session.endGame(reason as any);
    
    // Clear any auto-bot timer
    if ((session as any).__autoBotTimer) {
      clearInterval((session as any).__autoBotTimer);
    }
    
    // Remove from active sessions
    this.activeSessions.delete(sessionId);
    
    // Remove from player games
    for (const player of session.getPlayers()) {
      this.removePlayerGame(player.id, sessionId);
    }
    
    // Update database
    await this.database.endGameSession(sessionId);
    
    // Clear from Redis
    await this.redis.deleteGameState(sessionId);
    
    this.emitGameEvent(sessionId, GameEventType.GameEnded, {
      reason,
    });
    
    logger.info(`Ended game session: ${sessionId} (${reason})`);
  }

  private setupPlatformCommands(adapter: IPlatformAdapter): void {
    // Game list command
    adapter.onCommand('games', async (ctx) => {
      const games = this.getAvailableGames();
      const categories = this.groupGamesByCategory(games);
      
      const message: UIMessage = {
        content: '🎮 **Available Games**\n\n' +
          Object.entries(categories).map(([category, games]) => 
            `**${this.formatCategoryName(category)}**\n` +
            games.map(g => `• ${g.name} - \`/${g.id}\``).join('\n')
          ).join('\n\n'),
      };
      
      await ctx.reply(message);
    });
    
    // Active games command
    adapter.onCommand('mygames', async (ctx) => {
      const playerGames = this.getPlayerGames(ctx.userId);
      
      if (playerGames.length === 0) {
        await ctx.reply({
          content: 'You have no active games. Start one with `/play <game>`!',
        });
        return;
      }
      
      const gameList = playerGames.map((session, i) => 
        `${i + 1}. ${session.getGameName()} - ${session.getPlayerCount()} players`
      ).join('\n');
      
      await ctx.reply({
        content: `**Your Active Games**\n${gameList}`,
      });
    });
    
    // Play game command
    adapter.onCommand('play', async (ctx) => {
      if (ctx.args.length === 0) {
        await ctx.reply({
          content: 'Please specify a game. Example: `/play tictactoe`',
        });
        return;
      }
      
      const gameType = ctx.args[0];
      
      try {
        const session = await this.createGameSession(
          gameType,
          ctx.platform,
          ctx.channelId,
          ctx.userId
        );
        
        if (!session) {
          await ctx.reply({
            content: `Game "${gameType}" not found. Use \`/games\` to see available games.`,
          });
          return;
        }
        
        // Send initial game state
        const gameMessage = await session.renderGameState();
        const messageId = await ctx.reply(gameMessage);
        
        // Track message to session mapping
        if (messageId) {
          this.messageToSession.set(messageId, session.getId());
        }
        
      } catch (error: any) {
        // Escape error message to prevent markdown parsing issues
        const safeMessage = error.message
          .replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
          .replace(/:/g, '\\:');
        
        await ctx.reply({
          content: `❌ ${safeMessage}`,
        });
      }
    });
    
    // Quit game command
    adapter.onCommand('quit', async (ctx) => {
      const playerGames = this.getPlayerGames(ctx.userId);
      
      if (playerGames.length === 0) {
        await ctx.reply({
          content: 'You have no active games.',
        });
        return;
      }
      
      if (playerGames.length === 1) {
        // Quit the only game
        await this.removePlayerFromSession(playerGames[0].getId(), ctx.userId);
        await ctx.reply({
          content: 'You have quit the game.',
        });
      } else {
        // TODO: Show game selection UI
        await ctx.reply({
          content: 'You have multiple active games. Please select which one to quit.',
        });
      }
    });
    
    // Help command
    adapter.onCommand('help', async (ctx) => {
      const helpMessage: UIMessage = {
        content: '📚 **GameBot Commands**\n\n' +
          '**General Commands**\n' +
          '• `/games` - List all available games\n' +
          '• `/play <game>` - Start a new game\n' +
          '• `/mygames` - View your active games\n' +
          '• `/quit` - Quit current game\n' +
          '• `/stats` - View your statistics\n' +
          '• `/leaderboard <game>` - View game leaderboard\n\n' +
          '**During a Game**\n' +
          '• Click buttons or use game-specific commands\n' +
          '• `/help <game>` - Get help for a specific game\n\n' +
          '**Examples**\n' +
          '• `/play tictactoe` - Start Tic Tac Toe\n' +
          '• `/play wordle` - Start Wordle\n',
      };
      
      await ctx.reply(helpMessage);
    });
  }

  private async handleInteraction(interaction: any): Promise<void> {
    // Extract session ID from interaction data
    let sessionId = interaction.data?.sessionId || 
                   interaction.gameSessionId;
    
    // If no session ID in data, try to find it from message ID
    if (!sessionId && interaction.messageId) {
      sessionId = this.messageToSession.get(interaction.messageId);
    }
    
    if (!sessionId) {
      logger.warn('Interaction without session ID', interaction);
      return;
    }
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      logger.warn(`Session not found: ${sessionId}`);
      return;
    }
    
    try {
      await session.handleInteraction(interaction);
      await this.saveSession(session);
      
      // Update the game message with new state
      if (interaction.messageId && interaction.platform) {
        const adapter = this.platforms.get(interaction.platform);
        if (adapter) {
          const channelId = session.getChannelId();
          const newState = await session.renderGameState(interaction.userId);
          
          try {
            await adapter.editMessage(channelId, interaction.messageId, newState);
            // Update message mapping if edit was successful
            this.messageToSession.set(interaction.messageId, sessionId);
          } catch (error) {
            logger.error('Error updating message:', error);
          }
        }
      }
    } catch (error) {
      logger.error('Error handling interaction:', error);
    }
  }

  private async loadActiveSessions(): Promise<void> {
    const sessions = await this.database.getActiveSessions();
    
    for (const dbSession of sessions) {
      try {
        // Recreate game instance
        const gameEntry = this.gameRegistry.get(dbSession.game_type);
        if (!gameEntry) {
          logger.warn(`Game type not found: ${dbSession.game_type}`);
          continue;
        }
        
        const game = new gameEntry.constructor();
        game.deserialize(dbSession.state);
        
        // Recreate session
        const session = new GameSession(
          dbSession.id,
          game,
          dbSession.platform as Platform,
          dbSession.channel_id
        );
        
        // Load players
        const players = await this.database.getGamePlayers(dbSession.id);
        if (players.length > 0) {
          for (const dbPlayer of players) {
            const player = await this.database.getPlayer(dbPlayer.player_id);
            if (player) {
              await session.addPlayer(player as any);
            }
          }
        } else {
          // Fallback: Try to reconstruct players from game state for backwards compatibility
          const gameState = game.serialize();
          const parsedState = JSON.parse(gameState);
          
          if (parsedState.gameState?.players) {
            // For Connect4 and similar games
            const playerIds = Object.values(parsedState.gameState.players)
              .filter((id): id is string => typeof id === 'string' && id !== '');
            
            for (const playerId of playerIds) {
              if (!playerId.startsWith('bot_')) {
                const player = await this.database.getPlayer(playerId);
                if (player) {
                  await session.addPlayer(player as any);
                  // Also add to game_players table for future loads
                  await this.database.addGamePlayer(dbSession.id, playerId);
                }
              }
            }
          }
        }
        
        this.activeSessions.set(dbSession.id, session);
        
        logger.info(`Loaded session: ${dbSession.id}`);
      } catch (error) {
        logger.error(`Failed to load session ${dbSession.id}:`, error);
      }
    }
    
    logger.info(`Loaded ${this.activeSessions.size} active sessions`);
  }

  private async saveSession(session: GameSession): Promise<void> {
    await this.database.saveGameSession(session.toDatabase());
    
    // Save all players to game_players table
    const players = session.getPlayers();
    for (const player of players) {
      try {
        await this.database.addGamePlayer(session.getId(), player.id);
      } catch (error) {
        logger.error(`Failed to save player ${player.id} to game ${session.getId()}:`, error);
      }
    }
    
    await this.redis.saveGameState({
      sessionId: session.getId(),
      gameType: session.getGameType(),
      state: session.getState(),
      players: session.getPlayers().map(p => p.id),
      currentTurn: session.getCurrentTurn(),
      lastActivity: Date.now(),
    });
  }

  private async saveAllSessions(): Promise<void> {
    const promises = Array.from(this.activeSessions.values()).map(session =>
      this.saveSession(session)
    );
    await Promise.all(promises);
  }

  private async cleanupInactiveSessions(): Promise<void> {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes
    
    for (const [sessionId, session] of this.activeSessions) {
      const lastActivity = session.getLastActivity();
      if (now - lastActivity.getTime() > timeout) {
        logger.info(`Cleaning up inactive session: ${sessionId}`);
        await this.endGameSession(sessionId, 'timeout');
      }
    }
  }

  private setupAutoBot(sessionId: string, session: GameSession): void {
    // Set up a timer to check if we should start with bot
    const checkTimer = setInterval(async () => {
      const currentSession = this.activeSessions.get(sessionId);
      
      // If session no longer exists, clear timer
      if (!currentSession) {
        clearInterval(checkTimer);
        return;
      }
      
      // Get the game instance
      const game = (currentSession as any).game;
      
      // Check if game is Connect4 and still waiting
      if (game && 'isWaitingTimeExpired' in game && typeof game.isWaitingTimeExpired === 'function') {
        if (game.isWaitingTimeExpired()) {
          // Start bot game
          logger.info(`Auto-starting bot game for session ${sessionId}`);
          
          if ('startBotGame' in game && typeof game.startBotGame === 'function') {
            await game.startBotGame();
            await this.saveSession(currentSession);
            
            // Update the game message to show bot has joined
            // Find the message ID for this session
            let messageId: string | undefined;
            let platform: string | undefined;
            
            for (const [msgId, sessId] of this.messageToSession.entries()) {
              if (sessId === sessionId) {
                messageId = msgId;
                platform = currentSession.getPlatform();
                break;
              }
            }
            
            if (messageId && platform) {
              const adapter = this.platforms.get(platform as Platform);
              if (adapter) {
                const channelId = currentSession.getChannelId();
                // Render for the creator (first player)
                const players = currentSession.getPlayers();
                const creatorId = players.length > 0 ? players[0].id : undefined;
                const newState = await currentSession.renderGameState(creatorId);
                
                try {
                  await adapter.editMessage(channelId, messageId, newState);
                  logger.info(`Updated game message after auto-starting bot for session ${sessionId}`);
                  
                  // Check if it's bot's turn and make the first move
                  if ('makeBotMove' in game && typeof game.makeBotMove === 'function') {
                    const currentPlayer = game.gameState?.currentPlayer;
                    const botPlayerId = game.gameState?.players?.[currentPlayer];
                    
                    if (botPlayerId && botPlayerId.startsWith('bot_')) {
                      // Small delay before bot's first move
                      setTimeout(async () => {
                        try {
                          await game.makeBotMove();
                          await this.saveSession(currentSession);
                          
                          // Update message again after bot move
                          const afterMoveState = await currentSession.renderGameState(creatorId);
                          await adapter.editMessage(channelId, messageId, afterMoveState);
                        } catch (error) {
                          logger.error('Error making bot first move:', error);
                        }
                      }, 1500);
                    }
                  }
                } catch (error) {
                  logger.error('Error updating message after auto-bot start:', error);
                }
              }
            }
            
            // Clear the timer
            clearInterval(checkTimer);
          }
        }
      } else {
        // Not a waiting game, clear timer
        clearInterval(checkTimer);
      }
    }, 1000); // Check every second
    
    // Store timer reference for cleanup if needed
    (session as any).__autoBotTimer = checkTimer;
  }

  private addPlayerGame(playerId: string, sessionId: string): void {
    if (!this.playerGames.has(playerId)) {
      this.playerGames.set(playerId, new Set());
    }
    this.playerGames.get(playerId)!.add(sessionId);
  }

  private removePlayerGame(playerId: string, sessionId: string): void {
    const games = this.playerGames.get(playerId);
    if (games) {
      games.delete(sessionId);
      if (games.size === 0) {
        this.playerGames.delete(playerId);
      }
    }
  }

  private getPlayerGames(playerId: string): GameSession[] {
    const gameIds = this.playerGames.get(playerId) || new Set();
    return Array.from(gameIds)
      .map(id => this.activeSessions.get(id))
      .filter((s): s is GameSession => s !== undefined);
  }

  private getAvailableGames(): GameRegistryEntry[] {
    const games = new Map<string, GameRegistryEntry>();
    
    for (const [key, entry] of this.gameRegistry) {
      if (!entry.aliases.includes(key) && entry.enabled) {
        games.set(entry.id, entry);
      }
    }
    
    return Array.from(games.values());
  }

  private groupGamesByCategory(games: GameRegistryEntry[]): Record<string, GameRegistryEntry[]> {
    const grouped: Record<string, GameRegistryEntry[]> = {};
    
    // TODO: Get category from game instance
    // For now, hardcode categories
    const gameCategories: Record<string, GameCategory> = {
      'tictactoe': GameCategory.BoardGames,
      'wordle': GameCategory.WordGames,
    };
    
    for (const game of games) {
      const category = gameCategories[game.id] || GameCategory.BoardGames;
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(game);
    }
    
    return grouped;
  }

  private formatCategoryName(category: string): string {
    return category
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  private emitGameEvent(sessionId: string, type: GameEventType, data: any): void {
    const event: GameEvent = {
      type,
      timestamp: new Date(),
      data: { sessionId, ...data },
    };
    
    this.emit('gameEvent', event);
    logGameEvent(sessionId, type, data);
  }

  // Public getters
  getActiveGameCount(): number {
    return this.activeSessions.size;
  }

  getRegisteredGames(): string[] {
    return Array.from(new Set(
      Array.from(this.gameRegistry.values()).map(g => g.name)
    ));
  }

  getSession(sessionId: string): GameSession | undefined {
    return this.activeSessions.get(sessionId);
  }
}