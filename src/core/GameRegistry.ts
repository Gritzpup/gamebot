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
  private environment: 'production' | 'development' | 'all';

  private constructor() {
    this.environment = (process.env.NODE_ENV as any) || 'production';
  }

  static getInstance(): GameRegistry {
    if (!GameRegistry.instance) {
      GameRegistry.instance = new GameRegistry();
    }
    return GameRegistry.instance;
  }

  async loadGames(): Promise<void> {
    logger.info(`Loading games for environment: ${this.environment}`);
    
    try {
      // Load production games
      if (this.environment === 'production' || this.environment === 'all') {
        const prodModule = await import('../games/production');
        const { productionGames, ...gameClasses } = prodModule;
        
        for (const gameInfo of productionGames) {
          const GameClass = gameClasses[this.getClassName(gameInfo.id)];
          if (GameClass) {
            this.registerGame(gameInfo.id, gameInfo.name, GameClass);
          }
        }
      }
      
      // Load development games
      if (this.environment === 'development' || this.environment === 'all') {
        const devModule = await import('../games/development');
        const { developmentGames, ...gameClasses } = devModule;
        
        for (const gameInfo of developmentGames) {
          const GameClass = gameClasses[this.getClassName(gameInfo.id)];
          if (GameClass) {
            this.registerGame(gameInfo.id, gameInfo.name, GameClass);
          }
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