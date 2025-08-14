import { validateConfig } from './config';
import { logger } from './utils/logger';
import { GameEngine } from './core/GameEngine';
import { TelegramAdapter } from './platforms/telegram/TelegramAdapter';
import { DiscordAdapter } from './platforms/discord/DiscordAdapter';
import { Database } from './services/database/Database';
import { RedisClient } from './services/redis/RedisClient';

// ASCII art banner
const banner = `
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║    ██████╗  █████╗ ███╗   ███╗███████╗██████╗  ██████╗ ████████╗
║   ██╔════╝ ██╔══██╗████╗ ████║██╔════╝██╔══██╗██╔═══██╗╚══██╔══╝
║   ██║  ███╗███████║██╔████╔██║█████╗  ██████╔╝██║   ██║   ██║   
║   ██║   ██║██╔══██║██║╚██╔╝██║██╔══╝  ██╔══██╗██║   ██║   ██║   
║   ╚██████╔╝██║  ██║██║ ╚═╝ ██║███████╗██████╔╝╚██████╔╝   ██║   
║    ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚═════╝  ╚═════╝    ╚═╝   
║                                                       ║
║           Cross-Platform Gaming Bot v1.0.0            ║
╚═══════════════════════════════════════════════════════╝
`;

async function main() {
  try {
    console.log(banner);
    
    logger.info('Starting GameBot...');
    
    // Validate configuration
    logger.info('Validating configuration...');
    validateConfig();
    logger.info('Configuration validated successfully');
    
    // Initialize database
    logger.info('Initializing database...');
    const database = Database.getInstance();
    await database.initialize();
    logger.info('Database initialized successfully');
    
    // Initialize Redis
    logger.info('Connecting to Redis...');
    const redis = RedisClient.getInstance();
    await redis.connect();
    logger.info('Redis connected successfully');
    
    // Initialize game engine
    logger.info('Initializing game engine...');
    const gameEngine = GameEngine.getInstance();
    await gameEngine.initialize();
    logger.info('Game engine initialized successfully');
    
    // Initialize platform adapters
    logger.info('Initializing platform adapters...');
    
    // Telegram adapter
    const telegramAdapter = new TelegramAdapter();
    await gameEngine.registerPlatform(telegramAdapter);
    
    // Discord adapter
    const discordAdapter = new DiscordAdapter();
    await gameEngine.registerPlatform(discordAdapter);
    
    logger.info('Platform adapters registered successfully');
    
    // Connect to platforms
    logger.info('Connecting to platforms...');
    const platformConnections = await Promise.allSettled([
      telegramAdapter.connect(),
      discordAdapter.connect(),
    ]);
    
    // Check connection results
    const connectedPlatforms: string[] = [];
    const failedPlatforms: string[] = [];
    
    if (platformConnections[0].status === 'fulfilled') {
      connectedPlatforms.push('Telegram');
    } else {
      failedPlatforms.push('Telegram');
      logger.error('Failed to connect to Telegram:', platformConnections[0].reason);
    }
    
    if (platformConnections[1].status === 'fulfilled') {
      connectedPlatforms.push('Discord');
    } else {
      failedPlatforms.push('Discord');
      logger.error('Failed to connect to Discord:', platformConnections[1].reason);
    }
    
    if (connectedPlatforms.length === 0) {
      throw new Error('Failed to connect to any platform');
    }
    
    logger.info(`Connected to platforms: ${connectedPlatforms.join(', ')}`);
    if (failedPlatforms.length > 0) {
      logger.warn(`Failed to connect to: ${failedPlatforms.join(', ')}`);
    }
    
    // Start game engine
    await gameEngine.start();
    logger.info('Game engine started successfully');
    
    logger.info('GameBot is now running!');
    logger.info(`Active games: ${gameEngine.getActiveGameCount()}`);
    logger.info(`Registered games: ${gameEngine.getRegisteredGames().length}`);
    
    // Setup graceful shutdown
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    async function shutdown() {
      logger.info('Shutting down GameBot...');
      
      try {
        // Stop game engine
        await gameEngine.stop();
        
        // Disconnect platforms
        await Promise.allSettled([
          telegramAdapter.disconnect(),
          discordAdapter.disconnect(),
        ]);
        
        // Close database connections
        await database.close();
        await redis.disconnect();
        
        logger.info('GameBot shut down successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    }
    
  } catch (error) {
    logger.error('Failed to start GameBot:', error);
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  logger.error('Unhandled error in main:', error);
  process.exit(1);
});