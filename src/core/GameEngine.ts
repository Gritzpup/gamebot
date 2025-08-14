import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger, logGameEvent } from '../utils/logger';
import { Database } from '../services/database/Database';
import { RedisClient } from '../services/redis/RedisClient';
import { GameSession } from './GameSession';
import { GameRegistry } from './GameRegistry';
import { CrossPlatformRelayService } from '../relay/CrossPlatformRelayService';
import { 
  LinkChannelsCommand, 
  UnlinkChannelsCommand, 
  ListLinksCommand 
} from '../commands/admin/LinkChannelsCommand';
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
import { interactionRateLimiter } from '../utils/RateLimiter';

export class GameEngine extends EventEmitter {
  private static instance: GameEngine;
  private platforms: Map<Platform, IPlatformAdapter> = new Map();
  private activeSessions: Map<string, GameSession> = new Map();
  private playerGames: Map<string, Set<string>> = new Map();
  private messageToSession: Map<string, string> = new Map(); // messageId -> sessionId
  private channelToSession: Map<string, Set<string>> = new Map(); // channelId -> sessionIds
  private database: Database;
  private redis: RedisClient;
  private gameRegistry: GameRegistry;
  private relayService: CrossPlatformRelayService;
  private isRunning: boolean = false;
  private cleanupInterval?: NodeJS.Timeout;
  private updateQueue: Map<string, {
    session: GameSession;
    channelId: string;
    platform: Platform;
    messageId?: string;
    timestamp: number;
  }> = new Map();
  private updateProcessor?: NodeJS.Timeout;

  private constructor() {
    super();
    this.database = Database.getInstance();
    this.redis = RedisClient.getInstance();
    this.gameRegistry = GameRegistry.getInstance();
    this.relayService = CrossPlatformRelayService.getInstance(this.database);
  }

  static getInstance(): GameEngine {
    if (!GameEngine.instance) {
      GameEngine.instance = new GameEngine();
    }
    return GameEngine.instance;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing GameEngine...');
    
    // Load games based on environment
    await this.gameRegistry.loadGames();
    
    // Initialize relay service
    await this.relayService.initialize();
    
    logger.info(`Loaded ${this.gameRegistry.getAvailableGames().length} games`);
    
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
    
    // Start update processor for debouncing UI updates
    this.updateProcessor = setInterval(() => {
      this.processUpdateQueue();
    }, 100); // Process every 100ms
    
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
    
    // Stop update processor
    if (this.updateProcessor) {
      clearInterval(this.updateProcessor);
    }
    
    // Save all active sessions
    await this.saveAllSessions();
    
    logger.info('GameEngine stopped');
  }

  async registerPlatform(adapter: IPlatformAdapter): Promise<void> {
    logger.info(`Registering platform: ${adapter.platform}`);
    
    this.platforms.set(adapter.platform, adapter);
    
    // Register adapter with relay service
    this.relayService.registerAdapter(adapter.platform, adapter);
    
    // Register command handlers
    this.setupPlatformCommands(adapter);
    
    // Register interaction handler
    adapter.onInteraction(async (interaction) => {
      await this.handleInteraction(interaction);
    });
  }

  async createGameSession(
    gameType: string,
    platform: Platform,
    channelId: string,
    creatorId: string
  ): Promise<GameSession | null> {
    const gameInfo = this.gameRegistry.getGame(gameType.toLowerCase());
    const GameClass = this.gameRegistry.getGameClass(gameType.toLowerCase());
    
    if (!gameInfo || !GameClass) {
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
    const game = new (GameClass as any)();
    
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
    this.addChannelSession(channelId, sessionId);
    
    // Set up bot move callback to update UI across platforms
    // This will be called by GameSession when bot actually makes a move
    (session as any).onBotMove = async () => {
      // Find the message ID for this session
      let messageId: string | undefined;
      for (const [msgId, sessId] of this.messageToSession.entries()) {
        if (sessId === sessionId) {
          messageId = msgId;
          break;
        }
      }
      
      // Only update if we have a message ID (avoid creating duplicate messages)
      if (messageId) {
        await this.updateGameUI(session, channelId, platform, messageId);
      }
    };
    
    // Save to database
    await this.saveSession(session);
    
    // Emit event
    this.emitGameEvent(sessionId, GameEventType.GameStarted, {
      gameType: gameInfo.id,
      creatorId,
    });
    
    logger.info(`Created game session: ${sessionId} (${gameInfo.name})`);
    
    // For Connect4, set up auto-bot timer
    if (gameInfo.id === 'connect4') {
      this.setupAutoBot(sessionId, session);
    }
    
    return session;
  }

  private async updateGameUI(
    session: GameSession,
    sourceChannelId: string,
    sourcePlatform: Platform,
    specificMessageId?: string
  ): Promise<void> {
    // Queue the update for debouncing
    const updateKey = `${session.getId()}-${sourcePlatform}-${sourceChannelId}`;
    this.updateQueue.set(updateKey, {
      session,
      channelId: sourceChannelId,
      platform: sourcePlatform,
      messageId: specificMessageId,
      timestamp: Date.now()
    });
  }

  private async processUpdateQueue(): Promise<void> {
    const now = Date.now();
    const DEBOUNCE_DELAY = 200; // 200ms debounce

    for (const [key, update] of this.updateQueue.entries()) {
      if (now - update.timestamp >= DEBOUNCE_DELAY) {
        this.updateQueue.delete(key);
        this.performUIUpdate(update).catch(error => {
          logger.error('Error processing queued UI update:', error);
        });
      }
    }
  }

  private async performUIUpdate(update: {
    session: GameSession;
    channelId: string;
    platform: Platform;
    messageId?: string;
  }): Promise<void> {
    const { session, channelId, platform, messageId } = update;
    const sessionId = session.getId();
    const adapter = this.platforms.get(platform);
    
    if (!adapter) {
      logger.error(`Platform adapter not found for ${platform}`);
      return;
    }
    
    try {
      const players = session.getPlayers();
      const humanPlayerId = players.find(p => !p.id.startsWith('bot_'))?.id;
      const newState = await session.renderGameState(humanPlayerId);
      
      // Update on source platform
      if (messageId) {
        // Edit existing message
        await adapter.editMessage(channelId, messageId, newState);
      }
    } catch (error) {
      logger.error('Error updating game UI:', error);
    }
    
    // Relay to other platforms if enabled
    if (this.relayService.isRelayEnabled()) {
      const players = session.getPlayers();
      const humanPlayerId = players.find(p => !p.id.startsWith('bot_'))?.id;
      const gameState = await session.renderGameState(humanPlayerId);
      
      await this.relayService.relayGameMessage(
        platform,
        channelId,
        gameState,
        sessionId,
        {
          userId: humanPlayerId,
          username: session.getGameName()
        }
      );
    }
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
    
    // Remove from channel sessions
    const channelId = session.getChannelId();
    this.removeChannelSession(channelId, sessionId);
    
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
      const games = this.gameRegistry.getAvailableGames();
      
      const message: UIMessage = {
        content: '🎮 **Available Games**\n\n' +
          games.map(g => `• ${g.name} - \`/play ${g.id}\``).join('\n') +
          '\n\n_Environment: ' + (process.env.NODE_ENV || 'production') + '_',
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
        // Show available games with commands
        const games = this.gameRegistry.getAvailableGames();
        
        const gameList = games.map(g => `• **${g.name}** - \`/play ${g.id}\``).join('\n');
        
        await ctx.reply({
          content: `🎮 **Available Games**\n\n${gameList}\n\nExample: \`/play tictactoe\``,
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
        
        // Relay to linked channels if enabled
        if (this.relayService.isRelayEnabled()) {
          await this.relayService.relayGameMessage(
            ctx.platform,
            ctx.channelId,
            gameMessage,
            session.getId(),
            {
              userId: ctx.userId,
              username: session.getGameName()
            }
          );
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
          '**Cross-Platform Gaming**\n' +
          '• Games can be played across Discord and Telegram!\n' +
          '• Join from either platform\n\n' +
          '**Examples**\n' +
          '• `/play connect4` - Start Connect 4\n' +
          '• `/play tictactoe` - Start Tic Tac Toe\n',
      };
      
      await ctx.reply(helpMessage);
    });
    
    // Admin commands
    const linkCommand = new LinkChannelsCommand();
    adapter.onCommand('link', async (ctx) => {
      await linkCommand.execute(ctx);
    });
    
    const unlinkCommand = new UnlinkChannelsCommand();
    adapter.onCommand('unlink', async (ctx) => {
      await unlinkCommand.execute(ctx);
    });
    
    const listLinksCommand = new ListLinksCommand();
    adapter.onCommand('links', async (ctx) => {
      await listLinksCommand.execute(ctx);
    });
  }

  private async handleInteraction(interaction: any): Promise<void> {
    // Rate limit check - prevent button spam
    const rateLimitKey = `${interaction.userId}-${interaction.messageId || 'global'}`;
    if (!interactionRateLimiter.isAllowed(rateLimitKey)) {
      logger.debug(`Rate limited interaction from ${interaction.userId}`);
      return;
    }
    
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
      // Special handling for join_game - ensure player is added to session
      if (interaction.data?.id === 'join_game') {
        const players = session.getPlayers();
        const isPlayerInGame = players.some(p => p.id === interaction.userId);
        
        if (!isPlayerInGame) {
          // Get player from adapter and add to session
          const adapter = this.platforms.get(interaction.platform);
          if (adapter) {
            const player = await adapter.getPlayer(interaction.userId);
            if (player) {
              await session.addPlayer(player);
              logger.info(`Added player ${player.displayName} to game session ${sessionId}`);
            }
          }
        }
      }
      
      await session.handleInteraction(interaction);
      
      // Check if the game has ended
      if (session.isEnded()) {
        // Save the final state
        await this.saveSession(session);
        
        // Update UI one last time with the final game state
        if (interaction.messageId && interaction.platform) {
          await this.updateGameUI(
            session,
            session.getChannelId(),
            interaction.platform,
            interaction.messageId
          );
        }
        
        // Get winner information for logging
        const winner = session.getWinner();
        const isDraw = session.getIsDraw();
        let endMessage = `Game ${sessionId} ended - `;
        
        if (isDraw) {
          endMessage += "It's a draw!";
        } else if (winner) {
          const winnerName = session.getPlayers().find(p => p.id === winner)?.displayName || winner;
          endMessage += `Winner: ${winnerName}`;
        } else {
          endMessage += "No winner";
        }
        
        logger.info(endMessage);
        
        // Properly end the game session
        await this.endGameSession(sessionId, 'game_over');
      } else {
        // Normal save for ongoing game
        await this.saveSession(session);
        
        // Update the game message with new state
        if (interaction.messageId && interaction.platform) {
          await this.updateGameUI(
            session,
            session.getChannelId(),
            interaction.platform,
            interaction.messageId
          );
        }
      }
    } catch (error) {
      logger.error('Error handling interaction:', error);
    }
  }

  private async loadActiveSessions(): Promise<void> {
    const sessions = await this.database.getActiveSessions();
    
    // Clean up old sessions (older than 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    for (const dbSession of sessions) {
      try {
        // Check if session is too old
        const updatedAt = new Date(dbSession.updated_at);
        if (updatedAt < twentyFourHoursAgo) {
          logger.info(`Cleaning up stale session: ${dbSession.id} (last updated: ${dbSession.updated_at})`);
          await this.database.endGameSession(dbSession.id);
          continue;
        }
        // Get game class from registry
        const GameClass = this.gameRegistry.getGameClass(dbSession.game_type);
        if (!GameClass) {
          logger.warn(`Game type not found: ${dbSession.game_type}`);
          continue;
        }
        
        const game = new (GameClass as any)();
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
        for (const dbPlayer of players) {
          const player = await this.database.getPlayer(dbPlayer.player_id);
          if (player) {
            await session.addPlayer(player as any);
            this.addPlayerGame(player.id, dbSession.id);
          }
        }
        
        this.activeSessions.set(dbSession.id, session);
        this.addChannelSession(dbSession.channel_id, dbSession.id);
        
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
    // Similar to original but with cross-platform support
    const checkTimer = setInterval(async () => {
      const currentSession = this.activeSessions.get(sessionId);
      
      if (!currentSession) {
        clearInterval(checkTimer);
        return;
      }
      
      const game = (currentSession as any).game;
      
      // Check if we're still in waiting state
      if (game && game.getWaitingTimeLeft && game.getWaitingTimeLeft() <= 0) {
        logger.info(`Auto-starting bot game for session ${sessionId}`);
        
        if (game.startBotGame) {
          await game.startBotGame();
          await this.saveSession(currentSession);
          
          // Update UI only if we have a tracked message
          // Find the message ID for this session
          let messageId: string | undefined;
          for (const [msgId, sessId] of this.messageToSession.entries()) {
            if (sessId === sessionId) {
              messageId = msgId;
              break;
            }
          }
          
          if (messageId) {
            await this.updateGameUI(
              currentSession,
              currentSession.getChannelId(),
              currentSession.getPlatform(),
              messageId
            );
          }
          
          clearInterval(checkTimer);
        }
      }
    }, 1000);
    
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

  private addChannelSession(channelId: string, sessionId: string): void {
    if (!this.channelToSession.has(channelId)) {
      this.channelToSession.set(channelId, new Set());
    }
    this.channelToSession.get(channelId)!.add(sessionId);
  }

  private removeChannelSession(channelId: string, sessionId: string): void {
    const sessions = this.channelToSession.get(channelId);
    if (sessions) {
      sessions.delete(sessionId);
      if (sessions.size === 0) {
        this.channelToSession.delete(channelId);
      }
    }
  }

  private getPlayerGames(playerId: string): GameSession[] {
    const gameIds = this.playerGames.get(playerId) || new Set();
    return Array.from(gameIds)
      .map(id => this.activeSessions.get(id))
      .filter((s): s is GameSession => s !== undefined);
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
    return this.gameRegistry.getAvailableGames().map(g => g.name);
  }

  getSession(sessionId: string): GameSession | undefined {
    return this.activeSessions.get(sessionId);
  }
}