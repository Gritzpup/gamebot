import Redis from 'ioredis';
import { logger } from '../../utils/logger';
import { RedisLock, createLock } from './RedisLock';
import { GameSession } from '../../core/GameSession';
import { Platform } from '../../types';

export interface GameStateData {
  sessionId: string;
  gameType: string;
  platform: Platform;
  channelId: string;
  state: any;
  players: string[];
  currentTurn?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  lastActivity: number;
  winner?: string;
  isDraw?: boolean;
  ended?: boolean;
}

export class RedisStateManager {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  constructor(client: Redis, subscriber: Redis, publisher: Redis) {
    this.client = client;
    this.subscriber = subscriber;
    this.publisher = publisher;
  }

  /**
   * Create a lock for a specific resource
   */
  createLock(): RedisLock {
    return createLock(this.client);
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(): Promise<string[]> {
    return await this.client.smembers('sessions:active');
  }

  /**
   * Add session to active set
   */
  async addActiveSession(sessionId: string): Promise<void> {
    await this.client.sadd('sessions:active', sessionId);
  }

  /**
   * Remove session from active set
   */
  async removeActiveSession(sessionId: string): Promise<void> {
    await this.client.srem('sessions:active', sessionId);
  }

  /**
   * Save game state with versioning
   */
  async saveGameState(sessionId: string, data: GameStateData): Promise<boolean> {
    const key = `game:${sessionId}`;
    const lock = this.createLock();
    
    return await lock.withLock(`game:${sessionId}`, async () => {
      // Get current version
      const currentData = await this.client.get(key);
      let currentVersion = 0;
      
      if (currentData) {
        const parsed = JSON.parse(currentData);
        currentVersion = parsed.version || 0;
        
        // Check version conflict
        if (data.version !== currentVersion) {
          logger.warn(`Version conflict for session ${sessionId}: expected ${data.version}, got ${currentVersion}`);
          return false;
        }
      }
      
      // Increment version
      data.version = currentVersion + 1;
      data.updatedAt = Date.now();
      
      // Save with transaction
      const multi = this.client.multi();
      multi.setex(key, 3600, JSON.stringify(data)); // 1 hour TTL
      multi.sadd('sessions:active', sessionId);
      
      const results = await multi.exec();
      return results !== null && results.every(([err]) => !err);
    }, { ttl: 5000 }) || false;
  }

  /**
   * Get game state
   */
  async getGameState(sessionId: string): Promise<GameStateData | null> {
    const key = `game:${sessionId}`;
    const data = await this.client.get(key);
    
    if (!data) {
      return null;
    }
    
    return JSON.parse(data);
  }

  /**
   * Delete game state and all related data
   */
  async deleteGameState(sessionId: string): Promise<void> {
    const lock = this.createLock();
    
    await lock.withLock(`game:${sessionId}`, async () => {
      const multi = this.client.multi();
      
      // Get all related keys
      const gameData = await this.getGameState(sessionId);
      if (gameData) {
        // Remove from player games
        for (const playerId of gameData.players) {
          multi.srem(`player:${playerId}:games`, sessionId);
        }
        
        // Remove from channel sessions
        multi.srem(`channel:${gameData.channelId}:sessions`, sessionId);
      }
      
      // Remove from message mappings
      const messageMappings = await this.client.hgetall('message:session:map');
      for (const [messageId, sid] of Object.entries(messageMappings)) {
        if (sid === sessionId) {
          multi.hdel('message:session:map', messageId);
        }
      }
      
      // Remove game state and from active sessions
      multi.del(`game:${sessionId}`);
      multi.del(`queue:interactions:${sessionId}`);
      multi.srem('sessions:active', sessionId);
      
      await multi.exec();
    }, { ttl: 5000 });
  }

  /**
   * Player-game mapping operations
   */
  async addPlayerGame(playerId: string, sessionId: string): Promise<void> {
    await this.client.sadd(`player:${playerId}:games`, sessionId);
  }

  async removePlayerGame(playerId: string, sessionId: string): Promise<void> {
    await this.client.srem(`player:${playerId}:games`, sessionId);
  }

  async getPlayerGames(playerId: string): Promise<string[]> {
    return await this.client.smembers(`player:${playerId}:games`);
  }

  async getPlayerGameCount(playerId: string): Promise<number> {
    return await this.client.scard(`player:${playerId}:games`);
  }

  /**
   * Channel-session mapping operations
   */
  async addChannelSession(channelId: string, sessionId: string): Promise<void> {
    await this.client.sadd(`channel:${channelId}:sessions`, sessionId);
  }

  async removeChannelSession(channelId: string, sessionId: string): Promise<void> {
    await this.client.srem(`channel:${channelId}:sessions`, sessionId);
  }

  async getChannelSessions(channelId: string): Promise<string[]> {
    return await this.client.smembers(`channel:${channelId}:sessions`);
  }

  /**
   * Message-session mapping operations
   */
  async setMessageSession(messageId: string, sessionId: string): Promise<void> {
    await this.client.hset('message:session:map', messageId, sessionId);
  }

  async getMessageSession(messageId: string): Promise<string | null> {
    return await this.client.hget('message:session:map', messageId);
  }

  async deleteMessageSession(messageId: string): Promise<void> {
    await this.client.hdel('message:session:map', messageId);
  }
  
  async getSessionMessageId(sessionId: string): Promise<string | null> {
    // Find the messageId for a given session
    const messageMappings = await this.client.hgetall('message:session:map');
    for (const [messageId, sid] of Object.entries(messageMappings)) {
      if (sid === sessionId) {
        return messageId;
      }
    }
    return null;
  }

  /**
   * Interaction queue operations
   */
  async pushInteraction(sessionId: string, interaction: any): Promise<void> {
    const key = `queue:interactions:${sessionId}`;
    await this.client.rpush(key, JSON.stringify(interaction));
    await this.client.expire(key, 3600); // 1 hour TTL
  }

  async popInteraction(sessionId: string): Promise<any | null> {
    const key = `queue:interactions:${sessionId}`;
    const data = await this.client.lpop(key);
    
    if (!data) {
      return null;
    }
    
    return JSON.parse(data);
  }

  async getInteractionQueueLength(sessionId: string): Promise<number> {
    const key = `queue:interactions:${sessionId}`;
    return await this.client.llen(key);
  }

  /**
   * Bot move scheduling
   */
  async scheduleBotMove(sessionId: string, executeAt: number, messageId?: string): Promise<void> {
    // Store bot move with metadata
    const data = { sessionId, messageId, executeAt };
    await this.client.zadd('scheduled:botmoves', executeAt, JSON.stringify(data));
  }

  async getScheduledBotMoves(maxTimestamp: number): Promise<Array<{sessionId: string, messageId?: string}>> {
    const items = await this.client.zrangebyscore('scheduled:botmoves', 0, maxTimestamp);
    return items.map(item => {
      try {
        // Try parsing as JSON first (new format)
        const parsed = JSON.parse(item);
        return { sessionId: parsed.sessionId, messageId: parsed.messageId };
      } catch {
        // Fallback to string sessionId (old format)
        return { sessionId: item };
      }
    });
  }

  async removeBotMove(sessionId: string): Promise<void> {
    // Remove all entries that contain this sessionId
    const allMoves = await this.client.zrange('scheduled:botmoves', 0, -1);
    for (const move of allMoves) {
      try {
        const parsed = JSON.parse(move);
        if (parsed.sessionId === sessionId) {
          await this.client.zrem('scheduled:botmoves', move);
        }
      } catch {
        // Old format
        if (move === sessionId) {
          await this.client.zrem('scheduled:botmoves', move);
        }
      }
    }
  }

  /**
   * Clear all game data (for startup cleanup)
   */
  async clearAllGameData(): Promise<void> {
    const activeSessionIds = await this.getActiveSessions();
    
    // Delete each game state
    for (const sessionId of activeSessionIds) {
      await this.deleteGameState(sessionId);
    }
    
    // Clear other keys
    const patterns = [
      'player:*:games',
      'channel:*:sessions',
      'queue:interactions:*',
      'lock:*'
    ];
    
    for (const pattern of patterns) {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    }
    
    // Clear hash and sorted sets
    await this.client.del('message:session:map');
    await this.client.del('scheduled:botmoves');
    await this.client.del('sessions:active');
    
    logger.info('Cleared all game data from Redis');
  }

  /**
   * Atomic increment for turn counter
   */
  async incrementTurnCount(sessionId: string): Promise<number> {
    const key = `game:${sessionId}:turns`;
    const count = await this.client.incr(key);
    await this.client.expire(key, 3600); // 1 hour TTL
    return count;
  }

  /**
   * Check if a session exists
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    return await this.client.sismember('sessions:active', sessionId) === 1;
  }
}