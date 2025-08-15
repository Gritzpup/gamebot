import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger, logGameEvent } from '../utils/logger';
import { Database } from '../services/database/Database';
import { RedisClient } from '../services/redis/RedisClient';
import { RedisStateManager, GameStateData } from '../services/redis/RedisStateManager';
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
  private sessionCache: Map<string, GameSession> = new Map(); // Local cache for performance
  private database: Database;
  private redis: RedisClient;
  private stateManager: RedisStateManager;
  private gameRegistry: GameRegistry;
  private relayService: CrossPlatformRelayService;
  private isRunning: boolean = false;
  private cleanupInterval?: NodeJS.Timeout;
  private interactionProcessor?: NodeJS.Timeout;
  private botMoveProcessor?: NodeJS.Timeout;
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
    this.stateManager = this.redis.getStateManager();
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
    
    // WIPE ALL ACTIVE SESSIONS ON STARTUP
    const environment = process.env.NODE_ENV || 'production';
    logger.info(`🧹 Cleaning up all active game sessions on startup (${environment} mode)...`);
    
    try {
      // Count existing sessions before cleanup
      const activeCount = await this.database.get('SELECT COUNT(*) as count FROM game_sessions WHERE ended_at IS NULL');
      
      // Clear database
      await this.database.run('UPDATE game_sessions SET ended_at = datetime("now") WHERE ended_at IS NULL');
      await this.database.run('DELETE FROM game_players WHERE game_session_id IN (SELECT id FROM game_sessions WHERE ended_at IS NOT NULL)');
      
      // Clear Redis game states
      await this.redis.clearAllGameStates();
      
      // Clear all Redis state
      await this.stateManager.clearAllGameData();
      
      // Clear local caches
      this.sessionCache.clear();
      this.updateQueue.clear();
      
      logger.info(`✅ Successfully cleaned up ${activeCount?.count || 0} active game sessions and cleared all caches`);
      
      if (environment === 'development') {
        logger.info('💡 Development mode: All previous games have been cleared to prevent orphaned sessions');
      }
    } catch (error) {
      logger.error('Failed to wipe active sessions:', error);
    }
    
    // Load games based on environment
    await this.gameRegistry.loadGames();
    
    // Initialize relay service
    await this.relayService.initialize();
    
    logger.info(`Loaded ${this.gameRegistry.getAvailableGames().length} games`);
    
    // DO NOT load active sessions - they've been wiped!
    // await this.loadActiveSessions();
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
    
    // Start interaction processor
    this.interactionProcessor = setInterval(() => {
      this.processInteractionQueues();
    }, 50); // Process every 50ms
    
    // Start bot move processor
    this.botMoveProcessor = setInterval(() => {
      this.processBotMoves();
    }, 1000); // Check every second
    
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
    
    // Stop interaction processor
    if (this.interactionProcessor) {
      clearInterval(this.interactionProcessor);
    }
    
    // Stop bot move processor
    if (this.botMoveProcessor) {
      clearInterval(this.botMoveProcessor);
    }
    
    // End all active sessions before stopping
    logger.info('Ending all active game sessions...');
    const sessionIds = await this.stateManager.getActiveSessions();
    for (const sessionId of sessionIds) {
      await this.endGameSession(sessionId, 'bot_shutdown');
    }
    
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
    const playerGameCount = await this.stateManager.getPlayerGameCount(creatorId);
    if (playerGameCount >= 5) {
      throw new Error('You have too many active games. Please finish some before starting new ones.');
    }
    
    // Check concurrent game limit
    const activeSessions = await this.stateManager.getActiveSessions();
    if (activeSessions.length >= performanceConfig.maxConcurrentGames) {
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
    
    // Store session in cache and Redis
    this.sessionCache.set(sessionId, session);
    await this.stateManager.addActiveSession(sessionId);
    await this.stateManager.addPlayerGame(creatorId, sessionId);
    await this.stateManager.addChannelSession(channelId, sessionId);
    
    // Set up bot move callback to update UI across platforms
    // This will be called by GameSession when bot actually makes a move
    (session as any).onBotMove = async () => {
      // Find the messageId for this session
      const messageId = await this.stateManager.getSessionMessageId(sessionId);
      logger.debug(`Bot move triggered for session ${sessionId}, messageId: ${messageId}`);
      // Schedule bot move for processing with messageId
      await this.stateManager.scheduleBotMove(sessionId, Date.now(), messageId || undefined);
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
    logger.debug(`Queueing UI update for session ${session.getId()}, messageId: ${specificMessageId}`);
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
        logger.debug(`Processing UI update for session ${update.session.getId()}`);
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
    const session = await this.getOrLoadSession(sessionId);
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
      await this.stateManager.addPlayerGame(playerId, sessionId);
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
    const session = await this.getOrLoadSession(sessionId);
    if (!session) {
      return;
    }
    
    await session.removePlayer(playerId);
    await this.stateManager.removePlayerGame(playerId, sessionId);
    
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
    const session = await this.getOrLoadSession(sessionId);
    if (!session) {
      return;
    }
    
    // End the game
    await session.endGame(reason as any);
    
    // Clear any auto-bot timer
    if ((session as any).__autoBotTimer) {
      clearInterval((session as any).__autoBotTimer);
      delete (session as any).__autoBotTimer;
    }
    
    // Clear any pending UI updates for this session
    const sessionUpdateKeys = Array.from(this.updateQueue.keys()).filter(key => 
      key.startsWith(`${sessionId}-`)
    );
    for (const key of sessionUpdateKeys) {
      this.updateQueue.delete(key);
    }
    
    // Clear edit queues in platform adapters
    const channelId = session.getChannelId();
    const platform = session.getPlatform();
    const adapter = this.platforms.get(platform);
    if (adapter && 'clearEditQueue' in adapter) {
      // Get all message IDs from Redis
      const messageMappings = await this.redis.getStateManager().getMessageSession(sessionId);
      // Note: We'll need to update this to get all messages for a session
    }
    
    // Remove from cache
    this.sessionCache.delete(sessionId);
    
    // Update database
    await this.database.endGameSession(sessionId);
    
    // Clear all session data from Redis
    await this.stateManager.deleteGameState(sessionId);
    
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
      const playerGames = await this.getPlayerGames(ctx.userId);
      
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
          await this.stateManager.setMessageSession(messageId, session.getId());
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
      const playerGames = await this.getPlayerGames(ctx.userId);
      
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
      sessionId = await this.stateManager.getMessageSession(interaction.messageId);
    }
    
    if (!sessionId) {
      logger.warn('Interaction without session ID', interaction);
      return;
    }
    
    // Add interaction to queue for processing
    await this.stateManager.pushInteraction(sessionId, interaction);
  }
  
  private async processInteractionQueues(): Promise<void> {
    const activeSessions = await this.stateManager.getActiveSessions();
    
    for (const sessionId of activeSessions) {
      const queueLength = await this.stateManager.getInteractionQueueLength(sessionId);
      if (queueLength === 0) continue;
      
      // Process one interaction per session per cycle
      await this.processSessionInteraction(sessionId);
    }
  }
  
  private async processSessionInteraction(sessionId: string): Promise<void> {
    const lock = this.stateManager.createLock();
    
    await lock.withLock(`session:${sessionId}`, async () => {
      const interaction = await this.stateManager.popInteraction(sessionId);
      if (!interaction) return;
      
      logger.debug(`Processing interaction for session ${sessionId}:`, interaction);
      
      const session = await this.getOrLoadSession(sessionId);
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
        
        // Update UI one last time with the final game state - IMMEDIATELY, no debounce
        if (interaction.messageId && interaction.platform) {
          const adapter = this.platforms.get(interaction.platform);
          if (adapter) {
            try {
              const players = session.getPlayers();
              const humanPlayerId = players.find(p => !p.id.startsWith('bot_'))?.id;
              const finalState = await session.renderGameState(humanPlayerId);
              
              // Edit the message immediately with the final game state
              await adapter.editMessage(session.getChannelId(), interaction.messageId, finalState);
              logger.info(`Updated UI with final game state for session ${sessionId}`);
            } catch (error) {
              logger.error('Error updating final game UI:', error);
            }
          }
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
        
        // Small delay to ensure UI update completes before cleanup
        setTimeout(async () => {
          // Properly end the game session
          await this.endGameSession(sessionId, 'game_over');
        }, 500);
      } else {
        // Normal save for ongoing game
        await this.saveSession(session);
        
        // Update the game message with new state
        logger.debug(`Game continues - updating UI for messageId: ${interaction.messageId}, platform: ${interaction.platform}`);
        if (interaction.messageId && interaction.platform) {
          await this.updateGameUI(
            session,
            session.getChannelId(),
            interaction.platform,
            interaction.messageId
          );
        } else {
          logger.warn(`Missing messageId or platform for UI update: messageId=${interaction.messageId}, platform=${interaction.platform}`);
        }
      }
      } catch (error) {
        logger.error('Error handling interaction:', error);
      }
    }, { ttl: 30000 }); // 30 second lock timeout
  }
  
  private async processBotMoves(): Promise<void> {
    const now = Date.now();
    const scheduledMoves = await this.stateManager.getScheduledBotMoves(now);
    
    for (const moveData of scheduledMoves) {
      const { sessionId, messageId } = moveData;
      await this.stateManager.removeBotMove(sessionId);
      
      const session = await this.getOrLoadSession(sessionId);
      if (session && !session.isEnded()) {
        const gameState = await this.stateManager.getGameState(sessionId);
        if (gameState) {
          logger.debug(`Processing bot move for session ${sessionId}, messageId: ${messageId}`);
          await this.updateGameUI(
            session,
            session.getChannelId(),
            session.getPlatform(),
            messageId
          );
        }
      }
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
            await this.stateManager.addPlayerGame(player.id, dbSession.id);
          }
        }
        
        this.sessionCache.set(dbSession.id, session);
        await this.stateManager.addChannelSession(dbSession.channel_id, dbSession.id);
        
        logger.info(`Loaded session: ${dbSession.id}`);
      } catch (error) {
        logger.error(`Failed to load session ${dbSession.id}:`, error);
      }
    }
    
    logger.info(`Loaded ${this.sessionCache.size} active sessions`);
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
    
    // Save to Redis with versioning
    const gameState: GameStateData = {
      sessionId: session.getId(),
      gameType: session.getGameType(),
      platform: session.getPlatform(),
      channelId: session.getChannelId(),
      state: session.getState(),
      players: session.getPlayers().map(p => p.id),
      currentTurn: session.getCurrentTurn(),
      version: (session as any).version || 0,
      createdAt: session.getCreatedAt().getTime(),
      updatedAt: Date.now(),
      lastActivity: session.getLastActivity().getTime(),
      winner: session.getWinner(),
      isDraw: session.getIsDraw(),
      ended: session.isEnded()
    };
    
    const saved = await this.stateManager.saveGameState(session.getId(), gameState);
    if (saved) {
      // Update session version
      (session as any).version = gameState.version;
    }
  }

  private async saveAllSessions(): Promise<void> {
    const promises = Array.from(this.sessionCache.values()).map(session =>
      this.saveSession(session as GameSession)
    );
    await Promise.all(promises);
  }

  private async cleanupInactiveSessions(): Promise<void> {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes
    const activeSessions = await this.stateManager.getActiveSessions();
    
    for (const sessionId of activeSessions) {
      const gameState = await this.stateManager.getGameState(sessionId);
      if (gameState && (now - gameState.lastActivity > timeout)) {
        logger.info(`Cleaning up inactive session: ${sessionId}`);
        await this.endGameSession(sessionId, 'timeout');
      }
    }
  }

  private setupAutoBot(sessionId: string, session: GameSession): void {
    // Schedule bot moves through Redis
    const checkTimer = setInterval(async () => {
      const currentSession = await this.getOrLoadSession(sessionId);
      
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
          
          // Update UI - bot moves are now scheduled through Redis
          const messageId = await this.stateManager.getSessionMessageId(sessionId);
          await this.stateManager.scheduleBotMove(sessionId, Date.now(), messageId || undefined);
          
          clearInterval(checkTimer);
        }
      }
    }, 1000);
    
    (session as any).__autoBotTimer = checkTimer;
  }

  private async getPlayerGames(playerId: string): Promise<GameSession[]> {
    const gameIds = await this.stateManager.getPlayerGames(playerId);
    const sessions: GameSession[] = [];
    
    for (const sessionId of gameIds) {
      const session = await this.getOrLoadSession(sessionId);
      if (session) {
        sessions.push(session);
      }
    }
    
    return sessions;
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
  async getActiveGameCount(): Promise<number> {
    const sessions = await this.stateManager.getActiveSessions();
    return sessions.length;
  }

  getRegisteredGames(): string[] {
    return this.gameRegistry.getAvailableGames().map(g => g.name);
  }

  async getSession(sessionId: string): Promise<GameSession | undefined> {
    const session = await this.getOrLoadSession(sessionId);
    return session || undefined;
  }
  
  private async getOrLoadSession(sessionId: string): Promise<GameSession | null> {
    // Check cache first
    let session = this.sessionCache.get(sessionId);
    if (session) {
      return session;
    }
    
    // Load from Redis
    const gameState = await this.stateManager.getGameState(sessionId);
    if (!gameState) {
      return null;
    }
    
    // Recreate session
    const GameClass = this.gameRegistry.getGameClass(gameState.gameType);
    if (!GameClass) {
      logger.warn(`Game type not found: ${gameState.gameType}`);
      return null;
    }
    
    const game = new (GameClass as any)();
    if (gameState.state) {
      game.deserialize(gameState.state);
    }
    
    session = new GameSession(
      sessionId,
      game,
      gameState.platform,
      gameState.channelId
    );
    
    // Cache it
    this.sessionCache.set(sessionId, session);
    
    // Set version
    (session as any).version = gameState.version;
    
    return session;
  }
}