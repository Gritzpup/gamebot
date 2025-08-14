import dotenv from 'dotenv';
import { PlatformConfig, GameConfig, DatabaseConfig } from '../types';

// Load environment variables
dotenv.config();

// Helper functions for environment variables
function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value !== undefined ? value : defaultValue!;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return num;
}

// Platform configurations
export const platformConfig: PlatformConfig = {
  telegram: {
    botToken: getEnvVar('TELEGRAM_BOT_TOKEN'),
    groupId: getEnvVar('TELEGRAM_GROUP_ID'),
  },
  discord: {
    botToken: getEnvVar('DISCORD_BOT_TOKEN'),
    guildId: getEnvVar('DISCORD_GUILD_ID'),
    clientId: getEnvVar('DISCORD_CLIENT_ID'),
  },
};

// Game configuration
export const gameConfig: GameConfig = {
  defaultLanguage: getEnvVar('DEFAULT_LANGUAGE', 'en'),
  maxGamesPerPlayer: getEnvNumber('MAX_GAMES_PER_PLAYER', 5),
  gameTimeoutMinutes: getEnvNumber('GAME_TIMEOUT_MINUTES', 30),
  tournamentEnabled: getEnvBool('TOURNAMENT_ENABLED', true),
  dailyChallengesEnabled: getEnvBool('DAILY_CHALLENGES_ENABLED', true),
  achievementsEnabled: getEnvBool('ACHIEVEMENTS_ENABLED', true),
  leaderboardEnabled: getEnvBool('LEADERBOARD_ENABLED', true),
  aiOpponentsEnabled: getEnvBool('AI_OPPONENTS_ENABLED', true),
};

// Database configuration
export const databaseConfig: DatabaseConfig = {
  path: getEnvVar('DATABASE_PATH', './gamebot.db'),
  redis: {
    host: getEnvVar('REDIS_HOST', 'localhost'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: getEnvVar('REDIS_PASSWORD', ''),
    db: getEnvNumber('REDIS_DB', 0),
  },
};

// Logging configuration
export const loggingConfig = {
  level: getEnvVar('LOG_LEVEL', 'info'),
  maxFiles: getEnvVar('LOG_MAX_FILES', '14d'),
  maxSize: getEnvVar('LOG_MAX_SIZE', '20m'),
};

// Performance configuration
export const performanceConfig = {
  cacheTTLSeconds: getEnvNumber('CACHE_TTL_SECONDS', 300),
  maxConcurrentGames: getEnvNumber('MAX_CONCURRENT_GAMES', 100),
};

// API configuration
export const apiConfig = {
  port: getEnvNumber('API_PORT', 3000),
  enabled: getEnvBool('API_ENABLED', false),
};

// Validate required configurations
export function validateConfig(): void {
  const requiredVars = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_GROUP_ID',
    'DISCORD_BOT_TOKEN',
    'DISCORD_GUILD_ID',
    'DISCORD_CLIENT_ID',
  ];

  const missing = requiredVars.filter((varName) => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}