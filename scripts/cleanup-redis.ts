#!/usr/bin/env tsx

import Redis from 'ioredis';
import { databaseConfig } from '../src/config';

async function cleanupRedis() {
  console.log('🧹 Starting Redis cleanup...');
  
  const redis = new Redis({
    host: databaseConfig.redis.host,
    port: databaseConfig.redis.port,
    password: databaseConfig.redis.password || undefined,
    db: databaseConfig.redis.db,
  });
  
  try {
    // Get memory info
    const info = await redis.info('memory');
    const usedMemoryMatch = info.match(/used_memory_human:(\S+)/);
    const keyCount = await redis.dbsize();
    
    console.log(`📊 Current status:`);
    console.log(`   - Memory: ${usedMemoryMatch ? usedMemoryMatch[1] : 'unknown'}`);
    console.log(`   - Keys: ${keyCount}`);
    
    // Clean up expired keys
    const patterns = [
      { pattern: 'game:*', description: 'Game states', maxAge: 3600 },
      { pattern: 'session:*', description: 'Sessions', maxAge: 3600 },
      { pattern: 'queue:interactions:*', description: 'Interaction queues', maxAge: 1800 },
      { pattern: 'lock:*', description: 'Locks', maxAge: 300 },
      { pattern: 'rate:*', description: 'Rate limits', maxAge: 60 },
      { pattern: 'player:*:games', description: 'Player games', maxAge: 7200 },
      { pattern: 'channel:*:sessions', description: 'Channel sessions', maxAge: 7200 }
    ];
    
    console.log('\n🔍 Scanning for cleanup opportunities...');
    
    for (const { pattern, description, maxAge } of patterns) {
      const keys = await redis.keys(pattern);
      
      if (keys.length === 0) {
        console.log(`   ✓ ${description}: No keys found`);
        continue;
      }
      
      let expiredCount = 0;
      let noTTLCount = 0;
      let deletedCount = 0;
      
      for (const key of keys) {
        const ttl = await redis.ttl(key);
        
        if (ttl === -2) {
          // Key doesn't exist (expired between scan and check)
          expiredCount++;
        } else if (ttl === -1) {
          // No TTL set
          noTTLCount++;
          await redis.expire(key, maxAge);
        } else if (ttl > maxAge * 2) {
          // TTL too long
          await redis.expire(key, maxAge);
        }
        
        // For game states, check if they're stale
        if (pattern === 'game:*') {
          try {
            const data = await redis.get(key);
            if (data) {
              const parsed = JSON.parse(data);
              const ageMs = Date.now() - (parsed.lastActivity || parsed.updatedAt || 0);
              if (ageMs > 2 * 60 * 60 * 1000) { // 2 hours
                await redis.del(key);
                deletedCount++;
              }
            }
          } catch {}
        }
      }
      
      console.log(`   📦 ${description}: ${keys.length} keys`);
      if (noTTLCount > 0) console.log(`      - Set TTL for ${noTTLCount} keys`);
      if (deletedCount > 0) console.log(`      - Deleted ${deletedCount} stale keys`);
    }
    
    // Clean up orphaned data
    console.log('\n🔗 Checking for orphaned data...');
    
    // Check message mappings
    const messageMap = await redis.hgetall('message:session:map');
    const activeSessions = await redis.smembers('sessions:active');
    const activeSessionSet = new Set(activeSessions);
    
    let orphanedMessages = 0;
    for (const [messageId, sessionId] of Object.entries(messageMap)) {
      if (!activeSessionSet.has(sessionId)) {
        await redis.hdel('message:session:map', messageId);
        orphanedMessages++;
      }
    }
    
    if (orphanedMessages > 0) {
      console.log(`   ✓ Removed ${orphanedMessages} orphaned message mappings`);
    }
    
    // Trim leaderboards
    console.log('\n🏆 Trimming leaderboards...');
    const leaderboardKeys = await redis.keys('leaderboard:*');
    
    for (const key of leaderboardKeys) {
      const size = await redis.zcard(key);
      if (size > 100) {
        await redis.zremrangebyrank(key, 0, -101);
        console.log(`   ✓ Trimmed ${key} from ${size} to 100 entries`);
      }
    }
    
    // Clean up scheduled bot moves
    const botMoves = await redis.zrange('scheduled:botmoves', 0, -1);
    const now = Date.now();
    let cleanedBotMoves = 0;
    
    for (const move of botMoves) {
      try {
        const parsed = JSON.parse(move);
        if (parsed.executeAt && parsed.executeAt < now - 3600000) {
          await redis.zrem('scheduled:botmoves', move);
          cleanedBotMoves++;
        }
      } catch {
        // Old format or invalid, remove it
        await redis.zrem('scheduled:botmoves', move);
        cleanedBotMoves++;
      }
    }
    
    if (cleanedBotMoves > 0) {
      console.log(`   ✓ Removed ${cleanedBotMoves} old bot moves`);
    }
    
    // Final stats
    const finalInfo = await redis.info('memory');
    const finalMemoryMatch = finalInfo.match(/used_memory_human:(\S+)/);
    const finalKeyCount = await redis.dbsize();
    
    console.log('\n✅ Cleanup complete!');
    console.log(`📊 Final status:`);
    console.log(`   - Memory: ${finalMemoryMatch ? finalMemoryMatch[1] : 'unknown'}`);
    console.log(`   - Keys: ${finalKeyCount} (${keyCount - finalKeyCount} removed)`);
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    redis.disconnect();
  }
}

// Run cleanup
cleanupRedis().catch(console.error);