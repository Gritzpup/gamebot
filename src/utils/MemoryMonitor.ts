import { logger } from './logger';
import { RedisClient } from '../services/redis/RedisClient';
import { Database } from '../services/database/Database';

export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private monitorInterval?: NodeJS.Timeout;
  private maxMemoryMB: number = 2048; // 2GB limit
  private warningThresholdMB: number = 1536; // 1.5GB warning
  private lastMemoryUsage: number = 0;
  private memoryTrend: number[] = [];
  private readonly TREND_SIZE = 10;
  
  private constructor() {}
  
  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }
  
  start(): void {
    if (this.monitorInterval) {
      return;
    }
    
    this.monitorInterval = setInterval(() => {
      this.checkMemory();
    }, 30000); // Check every 30 seconds
    
    this.checkMemory();
    logger.info('Memory monitor started');
  }
  
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
    logger.info('Memory monitor stopped');
  }
  
  private async checkMemory(): Promise<void> {
    const memUsage = process.memoryUsage();
    const totalMemoryMB = (memUsage.heapUsed + memUsage.external) / 1024 / 1024;
    
    this.memoryTrend.push(totalMemoryMB);
    if (this.memoryTrend.length > this.TREND_SIZE) {
      this.memoryTrend.shift();
    }
    
    const avgMemory = this.memoryTrend.reduce((a, b) => a + b, 0) / this.memoryTrend.length;
    const memoryGrowthRate = this.calculateGrowthRate();
    
    logger.debug(`Memory Usage: ${totalMemoryMB.toFixed(2)}MB / ${this.maxMemoryMB}MB (${(totalMemoryMB / this.maxMemoryMB * 100).toFixed(1)}%)`);
    logger.debug(`Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    logger.debug(`RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`);
    
    if (totalMemoryMB > this.maxMemoryMB) {
      logger.error(`CRITICAL: Memory usage (${totalMemoryMB.toFixed(2)}MB) exceeds limit (${this.maxMemoryMB}MB)`);
      await this.performEmergencyCleanup();
    } else if (totalMemoryMB > this.warningThresholdMB) {
      logger.warn(`WARNING: Memory usage (${totalMemoryMB.toFixed(2)}MB) approaching limit`);
      await this.performAggressiveCleanup();
    } else if (memoryGrowthRate > 50 && avgMemory > 1024) {
      logger.warn(`Memory growing rapidly: ${memoryGrowthRate.toFixed(2)}MB/min`);
      await this.performPreventiveCleanup();
    }
    
    await this.checkRedisMemory();
    
    this.lastMemoryUsage = totalMemoryMB;
  }
  
  private calculateGrowthRate(): number {
    if (this.memoryTrend.length < 2) return 0;
    
    const recent = this.memoryTrend.slice(-5);
    const older = this.memoryTrend.slice(0, 5);
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    return (recentAvg - olderAvg) * 2; // MB per minute (30 sec checks)
  }
  
  private async performEmergencyCleanup(): Promise<void> {
    logger.warn('Performing emergency memory cleanup...');
    
    try {
      const redis = RedisClient.getInstance();
      const stateManager = redis.getStateManager();
      
      const activeSessions = await stateManager.getActiveSessions();
      logger.info(`Found ${activeSessions.length} active sessions to clean`);
      
      for (const sessionId of activeSessions) {
        const gameState = await stateManager.getGameState(sessionId);
        if (gameState) {
          const ageMs = Date.now() - gameState.lastActivity;
          if (ageMs > 5 * 60 * 1000) {
            await stateManager.deleteGameState(sessionId);
            logger.info(`Deleted inactive session: ${sessionId} (age: ${(ageMs / 60000).toFixed(1)} min)`);
          }
        }
      }
      
      if (global.gc) {
        global.gc();
        logger.info('Forced garbage collection');
      }
      
      const memAfter = process.memoryUsage();
      const totalAfterMB = (memAfter.heapUsed + memAfter.external) / 1024 / 1024;
      logger.info(`Memory after cleanup: ${totalAfterMB.toFixed(2)}MB`);
      
    } catch (error) {
      logger.error('Error during emergency cleanup:', error);
    }
  }
  
  private async performAggressiveCleanup(): Promise<void> {
    logger.info('Performing aggressive memory cleanup...');
    
    try {
      const redis = RedisClient.getInstance();
      const stateManager = redis.getStateManager();
      
      const activeSessions = await stateManager.getActiveSessions();
      
      for (const sessionId of activeSessions) {
        const gameState = await stateManager.getGameState(sessionId);
        if (gameState) {
          const ageMs = Date.now() - gameState.lastActivity;
          if (ageMs > 15 * 60 * 1000) {
            await stateManager.deleteGameState(sessionId);
            logger.info(`Deleted stale session: ${sessionId} (age: ${(ageMs / 60000).toFixed(1)} min)`);
          }
        }
      }
      
      const messageMap = await redis['client'].hgetall('message:session:map');
      const validSessions = new Set(await stateManager.getActiveSessions());
      
      for (const [messageId, sessionId] of Object.entries(messageMap)) {
        if (!validSessions.has(sessionId)) {
          await redis['client'].hdel('message:session:map', messageId);
        }
      }
      
      if (global.gc) {
        global.gc();
      }
      
    } catch (error) {
      logger.error('Error during aggressive cleanup:', error);
    }
  }
  
  private async performPreventiveCleanup(): Promise<void> {
    logger.info('Performing preventive memory cleanup...');
    
    try {
      const redis = RedisClient.getInstance();
      const stateManager = redis.getStateManager();
      
      const activeSessions = await stateManager.getActiveSessions();
      
      for (const sessionId of activeSessions) {
        const gameState = await stateManager.getGameState(sessionId);
        if (gameState && gameState.ended) {
          await stateManager.deleteGameState(sessionId);
          logger.info(`Deleted ended session: ${sessionId}`);
        }
      }
      
      const patterns = [
        'queue:interactions:*',
        'lock:*'
      ];
      
      for (const pattern of patterns) {
        const keys = await redis['client'].keys(pattern);
        if (keys.length > 100) {
          logger.warn(`Found ${keys.length} keys matching ${pattern}, cleaning old ones`);
          
          for (const key of keys) {
            const ttl = await redis['client'].ttl(key);
            if (ttl === -1) {
              await redis['client'].expire(key, 3600);
            }
          }
        }
      }
      
    } catch (error) {
      logger.error('Error during preventive cleanup:', error);
    }
  }
  
  private async checkRedisMemory(): Promise<void> {
    try {
      const redis = RedisClient.getInstance();
      const info = await redis['client'].info('memory');
      
      const usedMemoryMatch = info.match(/used_memory_human:(\d+\.?\d*)([KMG])/);
      if (usedMemoryMatch) {
        const value = parseFloat(usedMemoryMatch[1]);
        const unit = usedMemoryMatch[2];
        
        let memoryMB = value;
        if (unit === 'K') memoryMB = value / 1024;
        else if (unit === 'G') memoryMB = value * 1024;
        
        logger.debug(`Redis Memory: ${value}${unit} (${memoryMB.toFixed(2)}MB)`);
        
        if (memoryMB > 500) {
          logger.warn(`Redis using significant memory: ${memoryMB.toFixed(2)}MB`);
          await this.cleanupRedisData();
        }
      }
      
      const keyCount = await redis['client'].dbsize();
      logger.debug(`Redis Keys: ${keyCount}`);
      
      if (keyCount > 10000) {
        logger.warn(`High number of Redis keys: ${keyCount}`);
        await this.cleanupRedisData();
      }
      
    } catch (error) {
      logger.error('Error checking Redis memory:', error);
    }
  }
  
  private async cleanupRedisData(): Promise<void> {
    try {
      const redis = RedisClient.getInstance();
      
      const patterns = [
        { pattern: 'game:*', maxAge: 3600 },
        { pattern: 'session:*', maxAge: 3600 },
        { pattern: 'queue:interactions:*', maxAge: 1800 },
        { pattern: 'lock:*', maxAge: 300 },
        { pattern: 'rate:*', maxAge: 60 }
      ];
      
      for (const { pattern, maxAge } of patterns) {
        const keys = await redis['client'].keys(pattern);
        let cleanedCount = 0;
        
        for (const key of keys) {
          const ttl = await redis['client'].ttl(key);
          
          if (ttl === -1) {
            await redis['client'].expire(key, maxAge);
            cleanedCount++;
          } else if (ttl > maxAge * 2) {
            await redis['client'].expire(key, maxAge);
            cleanedCount++;
          }
        }
        
        if (cleanedCount > 0) {
          logger.info(`Set TTL for ${cleanedCount} ${pattern} keys`);
        }
      }
      
      const leaderboardKeys = await redis['client'].keys('leaderboard:*');
      for (const key of leaderboardKeys) {
        const size = await redis['client'].zcard(key);
        if (size > 100) {
          await redis['client'].zremrangebyrank(key, 0, -101);
          logger.info(`Trimmed leaderboard ${key} to top 100`);
        }
      }
      
    } catch (error) {
      logger.error('Error cleaning Redis data:', error);
    }
  }
  
  getMemoryStats(): {
    currentMB: number;
    maxMB: number;
    percentage: number;
    trend: 'stable' | 'growing' | 'shrinking';
    trendRate: number;
  } {
    const memUsage = process.memoryUsage();
    const currentMB = (memUsage.heapUsed + memUsage.external) / 1024 / 1024;
    const percentage = (currentMB / this.maxMemoryMB) * 100;
    
    const growthRate = this.calculateGrowthRate();
    let trend: 'stable' | 'growing' | 'shrinking' = 'stable';
    
    if (Math.abs(growthRate) < 5) {
      trend = 'stable';
    } else if (growthRate > 0) {
      trend = 'growing';
    } else {
      trend = 'shrinking';
    }
    
    return {
      currentMB,
      maxMB: this.maxMemoryMB,
      percentage,
      trend,
      trendRate: growthRate
    };
  }
}