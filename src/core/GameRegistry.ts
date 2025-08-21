import { BaseGame } from '../games/BaseGame';
import { logger } from '../utils/logger';

export interface GameInfo {
  id: string;
  name: string;
  gameClass: typeof BaseGame;
}

export class GameRegistry {
  private static instance: GameRegistry;
  private games = new Map<string, GameInfo>();

  private constructor() {
    // No longer need environment check
  }

  static getInstance(): GameRegistry {
    if (!GameRegistry.instance) {
      GameRegistry.instance = new GameRegistry();
    }
    return GameRegistry.instance;
  }

  async loadGames(): Promise<void> {
    logger.info('Loading games...');
    
    try {
      // Load all games from the unified games folder
      const gamesModule = await import('../games');
      const { games: gameList, ...gameClasses } = gamesModule;
      
      for (const gameInfo of gameList) {
        const className = this.getClassName(gameInfo.id);
        const GameClass = (gameClasses as any)[className];
        if (GameClass) {
          this.registerGame(gameInfo.id, gameInfo.name, GameClass);
        } else {
          logger.warn(`Game class not found for ${gameInfo.id} (expected class name: ${className})`);
        }
      }
      
      logger.info(`Loaded ${this.games.size} games`);
    } catch (error) {
      logger.error('Error loading games:', error);
      throw error;
    }
  }

  private getClassName(gameId: string): string {
    // Convert game-id to GameId format
    return gameId.split('-').map(part => 
      part.charAt(0).toUpperCase() + part.slice(1)
    ).join('');
  }

  registerGame(id: string, name: string, gameClass: typeof BaseGame): void {
    this.games.set(id, { id, name, gameClass });
    logger.info(`Registered game: ${name} (${id})`);
  }

  getGame(id: string): GameInfo | undefined {
    return this.games.get(id);
  }

  getAvailableGames(): GameInfo[] {
    return Array.from(this.games.values());
  }

  getGameClass(id: string): typeof BaseGame | undefined {
    return this.games.get(id)?.gameClass;
  }

  isGameAvailable(id: string): boolean {
    return this.games.has(id);
  }
}