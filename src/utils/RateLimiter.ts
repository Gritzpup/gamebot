import { logger } from './logger';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 5, windowMs: number = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    
    // Clean up old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if an action is allowed for a given key
   * @param key Unique identifier (e.g., userId-action)
   * @returns true if allowed, false if rate limited
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now > entry.resetTime) {
      // New entry or window expired
      this.limits.set(key, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      const waitTime = entry.resetTime - now;
      logger.debug(`Rate limit hit for ${key}, wait ${waitTime}ms`);
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Get remaining time until rate limit resets
   * @param key Unique identifier
   * @returns milliseconds until reset, or 0 if not rate limited
   */
  getResetTime(key: string): number {
    const now = Date.now();
    const entry = this.limits.get(key);
    
    if (!entry || now > entry.resetTime) {
      return 0;
    }
    
    return entry.resetTime - now;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key: string): void {
    this.limits.delete(key);
  }
}

// Global rate limiters
export const interactionRateLimiter = new RateLimiter(3, 1000); // 3 interactions per second
export const messageEditRateLimiter = new RateLimiter(1, 500); // 1 edit per 500ms