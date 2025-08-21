import { 
  IGame, 
  GameEndReason,
  MoveResult,
  GameStateSnapshot 
} from '../types/game.types';
import { 
  Platform,
  Player,
  GameSession as GameSessionType,
  GameState,
  UIMessage,
  GameInteraction
} from '../types';
import { logger } from '../utils/logger';
import { DBGameSession } from '../types/database.types';
import { Database } from '../services/database/Database';

export class GameSession {
  private id: string;
  private game: IGame;
  private platform: Platform;
  private channelId: string;
  private players: Map<string, Player> = new Map();
  private state: GameState;
  private createdAt: Date;
  private updatedAt: Date;
  private endedAt?: Date;
  private winner?: string;
  private isDraw?: boolean;
  private lastActivity: Date;
  private messageIds: Map<Platform, string> = new Map();
  private version: number = 0;

  constructor(
    id: string,
    game: IGame,
    platform: Platform,
    channelId: string
  ) {
    this.id = id;
    this.game = game;
    this.platform = platform;
    this.channelId = channelId;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.lastActivity = new Date();
    
    this.state = {
      turnCount: 0,
      gameData: {},
    };
  }
  
  // Version management
  getVersion(): number {
    return this.version;
  }
  
  setVersion(version: number): void {
    this.version = version;
  }
  
  // Additional getters for Redis state management
  getCreatedAt(): Date {
    return this.createdAt;
  }
  
  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  async initialize(): Promise<void> {
    await this.game.initialize(this as any);
  }

  async addPlayer(player: Player): Promise<boolean> {
    if (this.players.size >= this.game.maxPlayers) {
      return false;
    }
    
    if (this.players.has(player.id)) {
      return false;
    }
    
    this.players.set(player.id, player);
    this.lastActivity = new Date();
    
    // Save player to database
    try {
      await Database.getInstance().addGamePlayer(this.id, player.id);
    } catch (error) {
      logger.error(`Failed to save player ${player.id} to game ${this.id}:`, error);
      // Remove from map if database save failed
      this.players.delete(player.id);
      return false;
    }
    
    // Start game if we have minimum players
    if (this.players.size >= this.game.minPlayers && this.state.turnCount === 0) {
      await this.startGame();
    }
    
    return true;
  }

  async removePlayer(playerId: string): Promise<void> {
    this.players.delete(playerId);
    this.lastActivity = new Date();
    
    // End game if not enough players
    if (this.players.size < this.game.minPlayers && !this.endedAt) {
      await this.endGame(GameEndReason.PlayerQuit);
    }
  }

  private async startGame(): Promise<void> {
    await this.game.start();
    this.state.turnCount = 1;
    
    // Set first player's turn
    const playerIds = Array.from(this.players.keys());
    this.state.currentTurn = playerIds[0];
    
    this.updatedAt = new Date();
    this.lastActivity = new Date();
    
    logger.info(`Game started: ${this.id}`);
  }

  async endGame(reason: GameEndReason): Promise<void> {
    if (this.endedAt) {
      return;
    }
    
    await this.game.end(reason);
    this.endedAt = new Date();
    this.updatedAt = new Date();
    
    logger.info(`Game ended: ${this.id} (${reason})`);
  }

  async handleInteraction(interaction: GameInteraction): Promise<void> {
    this.lastActivity = new Date();
    
    // First check if game has a processInteraction method
    if ('processInteraction' in this.game && typeof this.game.processInteraction === 'function') {
      // For games with processInteraction, let them handle player validation
      const result = await (this.game as any).processInteraction(interaction);
      if (result) {
        this.handleMoveResult(result);
        this.updatedAt = new Date();
        
        // Check if we need to make a bot move
        if (result.shouldMakeBotMove && 'makeBotMove' in this.game) {
          // Schedule bot move after a short delay
          setTimeout(async () => {
            // Create a timeout promise that rejects after 5 seconds
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Bot move timeout after 5 seconds')), 5000);
            });
            
            try {
              logger.info(`[GameSession] Bot starting move calculation for session ${this.id}`);
              
              // Race between bot move and timeout
              const botResult = await Promise.race([
                (this.game as any).makeBotMove(),
                timeoutPromise
              ]);
              
              logger.info(`[GameSession] Bot move completed for session ${this.id}`);
              this.handleMoveResult(botResult);
              this.updatedAt = new Date();
              
              // Emit an event to trigger UI update
              if ((this as any).onBotMove) {
                await (this as any).onBotMove();
              }
            } catch (error) {
              logger.error(`[GameSession] Bot move failed for session ${this.id}:`, error);
              
              // If bot move times out or fails, try to continue the game
              if (error instanceof Error && error.message && error.message.includes('timeout')) {
                // Log detailed error for debugging
                logger.error(`[GameSession] Bot move timed out - game state may be stuck`);
                
                // Optional: Force end the bot's turn or make a random move
                // For now, just log the error and continue
              }
            }
          }, 100);
        }
        return;
      }
    }
    
    // Fallback to normal move handling
    const player = this.players.get(interaction.userId);
    if (!player) {
      logger.warn(`Player not in game: ${interaction.userId}`);
      return;
    }
    
    // Check if it's player's turn
    if (this.state.currentTurn && this.state.currentTurn !== player.id) {
      logger.warn(`Not player's turn: ${player.id}`);
      return;
    }
    
    // Process the interaction based on type
    let move: any;
    
    switch (interaction.type) {
      case 'button_click':
        move = interaction.data;
        break;
      case 'select_option':
        move = interaction.data;
        break;
      case 'text_input':
        move = interaction.data;
        break;
      default:
        logger.warn(`Unknown interaction type: ${interaction.type}`);
        return;
    }
    
    // Validate and make the move
    const isValid = await this.game.validateMove(player.id, move);
    if (!isValid) {
      logger.warn(`Invalid move by ${player.id}:`, move);
      // TODO: Send error message to player
      return;
    }
    
    const result = await this.game.makeMove(player.id, move);
    this.handleMoveResult(result);
    
    this.state.turnCount++;
    this.updatedAt = new Date();
  }

  private handleMoveResult(result: MoveResult): void {
    if (result.gameEnded) {
      this.endedAt = new Date();
      
      if (result.winner) {
        this.winner = result.winner;
      } else if (result.isDraw) {
        this.isDraw = true;
      }
    }
    
    if (result.nextPlayer) {
      this.state.currentTurn = result.nextPlayer;
    }
    
    if (result.stateChange) {
      this.state.gameData = {
        ...this.state.gameData,
        ...result.stateChange,
      };
    }
  }

  async renderGameState(forPlayer?: string): Promise<UIMessage> {
    return this.game.renderState(forPlayer);
  }

  toGameSession(): GameSessionType {
    return {
      id: this.id,
      gameType: this.game.id,
      players: Array.from(this.players.values()),
      state: this.state,
      platform: this.platform,
      channelId: this.channelId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      endedAt: this.endedAt,
      winner: this.winner,
      isDraw: this.isDraw,
    };
  }

  toDatabase(): DBGameSession {
    return {
      id: this.id,
      game_type: this.game.id,
      platform: this.platform,
      channel_id: this.channelId,
      state: this.game.serialize(),
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
      ended_at: this.endedAt?.toISOString(),
      winner_id: this.winner,
      is_draw: this.isDraw ? 1 : 0,
    };
  }

  // Getters
  getId(): string {
    return this.id;
  }
  
  isEnded(): boolean {
    return this.endedAt !== undefined;
  }
  
  getWinner(): string | undefined {
    return this.winner;
  }
  
  getIsDraw(): boolean {
    return this.isDraw || false;
  }

  getGameType(): string {
    return this.game.id;
  }

  getGameName(): string {
    return this.game.name;
  }

  getPlatform(): Platform {
    return this.platform;
  }

  getChannelId(): string {
    return this.channelId;
  }

  getPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  getPlayersMap(): Map<string, Player> {
    return this.players;
  }

  getState(): GameStateSnapshot {
    return this.game.getCurrentState();
  }

  getCurrentTurn(): string | undefined {
    return this.state.currentTurn;
  }

  getLastActivity(): Date {
    return this.lastActivity;
  }

  setMessageId(platform: Platform, messageId: string): void {
    this.messageIds.set(platform, messageId);
  }

  getMessageId(platform: Platform): string | undefined {
    return this.messageIds.get(platform);
  }
}