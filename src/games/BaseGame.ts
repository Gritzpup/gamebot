import { 
  IGame, 
  GameCategory, 
  GameDifficulty,
  GameEndReason,
  MoveResult,
  GameStateSnapshot,
  AIDifficulty
} from '../types/game.types';
import { GameSession as GameSessionType, UIMessage } from '../types';
import { GameSession } from '../core/GameSession';
import { logger } from '../utils/logger';

export abstract class BaseGame implements IGame {
  // Abstract properties that must be defined by subclasses
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract category: GameCategory;
  abstract minPlayers: number;
  abstract maxPlayers: number;
  abstract estimatedDuration: number;
  abstract difficulty: GameDifficulty;

  // Protected properties available to subclasses
  protected session?: GameSession; // The actual GameSession instance
  protected sessionData?: GameSessionType; // The interface data
  protected gameState: any = {};
  protected turnCount: number = 0;
  protected isStarted: boolean = false;
  protected isEnded: boolean = false;

  // Initialize the game with a session
  async initialize(session: any): Promise<void> {
    this.session = session; // Store the actual GameSession instance
    this.gameState = this.createInitialState();
    logger.info(`Game initialized: ${this.name} (${session.getId()})`);
  }

  // Start the game
  async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error('Game already started');
    }
    
    this.isStarted = true;
    this.onGameStart();
    logger.info(`Game started: ${this.name}`);
  }

  // End the game
  async end(reason: GameEndReason): Promise<void> {
    if (this.isEnded) {
      return;
    }
    
    this.isEnded = true;
    this.onGameEnd(reason);
    logger.info(`Game ended: ${this.name} (${reason})`);
  }

  // Get current game state snapshot
  getCurrentState(): GameStateSnapshot {
    return {
      gameId: this.session ? (this.session as any).id : '',
      turnNumber: this.turnCount,
      currentPlayer: this.getCurrentPlayer(),
      players: this.getPlayerStates(),
      scores: this.getScores(),
      gameSpecificData: this.gameState,
    };
  }

  // Check if the game supports AI opponents
  supportsAI(): boolean {
    return false; // Override in games that support AI
  }

  // Make an AI move (override in games that support AI)
  async makeAIMove(difficulty: AIDifficulty): Promise<MoveResult> {
    throw new Error('AI not supported for this game');
  }

  // Serialize game state to string
  serialize(): string {
    return JSON.stringify({
      id: this.id,
      gameState: this.gameState,
      turnCount: this.turnCount,
      isStarted: this.isStarted,
      isEnded: this.isEnded,
    });
  }

  // Deserialize game state from string
  deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.gameState = parsed.gameState || {};
      this.turnCount = parsed.turnCount || 0;
      this.isStarted = parsed.isStarted || false;
      this.isEnded = parsed.isEnded || false;
    } catch (error) {
      logger.error('Failed to deserialize game state:', error);
      throw new Error('Invalid game state data');
    }
  }

  // Abstract methods that must be implemented by subclasses
  abstract validateMove(playerId: string, move: any): Promise<boolean>;
  abstract makeMove(playerId: string, move: any): Promise<MoveResult>;
  abstract getValidMoves(playerId: string): Promise<any[]>;
  abstract renderState(forPlayer?: string): UIMessage;
  abstract renderHelp(): UIMessage;
  abstract renderStats(): UIMessage;

  // Protected methods that can be overridden by subclasses
  protected abstract createInitialState(): any;
  protected abstract getCurrentPlayer(): string | undefined;
  protected abstract getPlayerStates(): any[];
  protected abstract getScores(): Record<string, number>;

  // Hook methods that can be overridden
  protected onGameStart(): void {
    // Override in subclass if needed
  }

  protected onGameEnd(reason: GameEndReason): void {
    // Override in subclass if needed
  }

  // Utility methods for subclasses
  protected getPlayers(): string[] {
    if (!this.session) {
      return [];
    }
    return this.session.getPlayers().map(p => p.id);
  }

  protected getPlayerCount(): number {
    if (!this.session) {
      return 0;
    }
    return this.session.getPlayerCount();
  }

  protected getPlayerName(playerId: string): string {
    if (!playerId) {
      return 'Player';
    }
    
    if (!this.session) {
      return 'Player';
    }
    
    const player = this.session.getPlayer(playerId);
    
    if (!player) {
      // For bot players, return a friendly name
      if (playerId === 'bot' || playerId.startsWith('bot_')) {
        return '🤖 WordleBot';
      }
      // Return a more friendly default with partial ID
      return `Player_${playerId.slice(-4)}`;
    }
    
    return player.displayName || player.username || `Player_${playerId.slice(-4)}`;
  }

  protected escapeMarkdown(text: string): string {
    // Handle null/undefined text
    if (!text || typeof text !== 'string') {
      return '';
    }
    // Escape special markdown characters that could break formatting
    return text.replace(/[*_`\[\]()~>#+=|{}.!-]/g, '\\$&');
  }

  protected getSafePlayerName(playerId: string): string {
    const name = this.getPlayerName(playerId);
    // Handle null/undefined names
    if (!name || name === 'Unknown') {
      return 'Unknown Player';
    }
    return this.escapeMarkdown(name);
  }

  protected isPlayerTurn(playerId: string): boolean {
    return this.getCurrentPlayer() === playerId;
  }

  protected advanceTurn(): void {
    this.turnCount++;
  }

  protected getNextPlayer(currentPlayerId: string): string {
    const players = this.getPlayers();
    const currentIndex = players.indexOf(currentPlayerId);
    const nextIndex = (currentIndex + 1) % players.length;
    return players[nextIndex];
  }

  // Helper method to create a simple text-based grid
  protected createTextGrid(
    rows: number,
    cols: number,
    cellRenderer: (row: number, col: number) => string
  ): string {
    const lines: string[] = [];
    
    for (let row = 0; row < rows; row++) {
      const cells: string[] = [];
      for (let col = 0; col < cols; col++) {
        cells.push(cellRenderer(row, col));
      }
      lines.push(cells.join(' '));
    }
    
    return '```\n' + lines.join('\n') + '\n```';
  }

  // Helper method to create a progress bar
  protected createProgressBar(current: number, total: number, width: number = 10): string {
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  // Helper method to format time
  protected formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}