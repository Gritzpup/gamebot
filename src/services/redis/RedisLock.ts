import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

export interface LockOptions {
  ttl?: number; // Time to live in milliseconds
  retryInterval?: number; // Retry interval in milliseconds
  maxRetries?: number; // Maximum number of retries
}

export class RedisLock {
  private client: Redis;
  private lockId: string;
  private defaultTTL = 30000; // 30 seconds
  private defaultRetryInterval = 100; // 100ms
  private defaultMaxRetries = 50; // 5 seconds total

  constructor(client: Redis) {
    this.client = client;
    this.lockId = uuidv4();
  }

  /**
   * Acquire a lock on a resource
   * @param key The resource key to lock
   * @param options Lock options
   * @returns True if lock acquired, false otherwise
   */
  async acquire(key: string, options: LockOptions = {}): Promise<boolean> {
    const ttl = options.ttl || this.defaultTTL;
    const retryInterval = options.retryInterval || this.defaultRetryInterval;
    const maxRetries = options.maxRetries || this.defaultMaxRetries;
    
    const lockKey = `lock:${key}`;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // Try to set the lock with NX (only if not exists) and PX (with expiry)
        const result = await this.client.set(lockKey, this.lockId, 'PX', ttl, 'NX');
        
        if (result === 'OK') {
          logger.debug(`Lock acquired: ${lockKey} by ${this.lockId}`);
          return true;
        }

        // Lock is held by someone else, wait and retry
        await this.sleep(retryInterval);
        retries++;
      } catch (error) {
        logger.error(`Error acquiring lock ${lockKey}:`, error);
        return false;
      }
    }

    logger.warn(`Failed to acquire lock ${lockKey} after ${maxRetries} retries`);
    return false;
  }

  /**
   * Release a lock
   * @param key The resource key to unlock
   * @returns True if lock released, false otherwise
   */
  async release(key: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    
    // Lua script to ensure we only delete our own lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await this.client.eval(script, 1, lockKey, this.lockId) as number;
      
      if (result === 1) {
        logger.debug(`Lock released: ${lockKey} by ${this.lockId}`);
        return true;
      } else {
        logger.warn(`Failed to release lock ${lockKey} - not owned by ${this.lockId}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error releasing lock ${lockKey}:`, error);
      return false;
    }
  }

  /**
   * Extend a lock's TTL
   * @param key The resource key
   * @param ttl New TTL in milliseconds
   * @returns True if extended, false otherwise
   */
  async extend(key: string, ttl: number): Promise<boolean> {
    const lockKey = `lock:${key}`;
    
    // Lua script to ensure we only extend our own lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    try {
      const result = await this.client.eval(script, 1, lockKey, this.lockId, ttl) as number;
      
      if (result === 1) {
        logger.debug(`Lock extended: ${lockKey} by ${this.lockId} for ${ttl}ms`);
        return true;
      } else {
        logger.warn(`Failed to extend lock ${lockKey} - not owned by ${this.lockId}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error extending lock ${lockKey}:`, error);
      return false;
    }
  }

  /**
   * Execute a function with a lock
   * @param key The resource key to lock
   * @param fn The function to execute
   * @param options Lock options
   * @returns The result of the function or null if lock not acquired
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T | null> {
    const acquired = await this.acquire(key, options);
    
    if (!acquired) {
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.release(key);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create a lock
 */
export function createLock(client: Redis): RedisLock {
  return new RedisLock(client);
}