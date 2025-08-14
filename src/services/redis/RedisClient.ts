import Redis from 'ioredis';
import { databaseConfig } from '../../config';
import { logger } from '../../utils/logger';
import { CacheGameState } from '../../types/database.types';

export class RedisClient {
  private static instance: RedisClient;
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  private constructor() {
    const config = {
      host: databaseConfig.redis.host,
      port: databaseConfig.redis.port,
      password: databaseConfig.redis.password || undefined,
      db: databaseConfig.redis.db,
    };
    
    this.client = new Redis(config);
    this.subscriber = new Redis(config);
    this.publisher = new Redis(config);
    
    this.setupEventHandlers();
  }

  static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  async connect(): Promise<void> {
    try {
      await this.client.ping();
      logger.info('Redis connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.client.quit(),
      this.subscriber.quit(),
      this.publisher.quit(),
    ]);
    logger.info('Redis disconnected');
  }

  private setupEventHandlers(): void {
    this.client.on('error', (error) => {
      logger.error('Redis client error:', error);
    });
    
    this.subscriber.on('error', (error) => {
      logger.error('Redis subscriber error:', error);
    });
    
    this.publisher.on('error', (error) => {
      logger.error('Redis publisher error:', error);
    });
  }

  // Game state management
  async saveGameState(state: CacheGameState): Promise<void> {
    const key = `game:${state.sessionId}`;
    const ttl = state.ttl || 3600; // 1 hour default
    
    await this.client.setex(
      key,
      ttl,
      JSON.stringify(state)
    );
  }

  async getGameState(sessionId: string): Promise<CacheGameState | null> {
    const key = `game:${sessionId}`;
    const data = await this.client.get(key);
    
    if (!data) {
      return null;
    }
    
    return JSON.parse(data);
  }

  async deleteGameState(sessionId: string): Promise<void> {
    const key = `game:${sessionId}`;
    await this.client.del(key);
  }

  // Pub/Sub for real-time events
  async publish(channel: string, data: any): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(data));
  }

  async subscribe(channel: string, handler: (data: any) => void): Promise<void> {
    await this.subscriber.subscribe(channel);
    
    this.subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const data = JSON.parse(message);
          handler(data);
        } catch (error) {
          logger.error('Error parsing Redis message:', error);
        }
      }
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  // Leaderboard management
  async updateLeaderboard(
    gameType: string,
    playerId: string,
    score: number,
    period: string = 'alltime'
  ): Promise<void> {
    const key = `leaderboard:${gameType}:${period}`;
    await this.client.zadd(key, score, playerId);
  }

  async getLeaderboard(
    gameType: string,
    period: string = 'alltime',
    limit: number = 10
  ): Promise<Array<{ playerId: string; score: number; rank: number }>> {
    const key = `leaderboard:${gameType}:${period}`;
    const results = await this.client.zrevrange(key, 0, limit - 1, 'WITHSCORES');
    
    const leaderboard: Array<{ playerId: string; score: number; rank: number }> = [];
    for (let i = 0; i < results.length; i += 2) {
      leaderboard.push({
        playerId: results[i],
        score: parseInt(results[i + 1]),
        rank: Math.floor(i / 2) + 1,
      });
    }
    
    return leaderboard;
  }

  // Rate limiting
  async checkRateLimit(key: string, limit: number, window: number): Promise<boolean> {
    const current = await this.client.incr(key);
    
    if (current === 1) {
      await this.client.expire(key, window);
    }
    
    return current <= limit;
  }

  // Session management
  async setSession(sessionId: string, data: any, ttl: number = 3600): Promise<void> {
    await this.client.setex(`session:${sessionId}`, ttl, JSON.stringify(data));
  }

  async getSession(sessionId: string): Promise<any> {
    const data = await this.client.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.del(`session:${sessionId}`);
  }
}