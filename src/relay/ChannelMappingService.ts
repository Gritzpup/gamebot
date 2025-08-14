import { ChannelMapping, LinkedPlayer } from './types';
import { Platform } from '../types';
import { Database } from '../services/database/Database';
import { logger } from '../utils/logger';

export class ChannelMappingService {
  private static instance: ChannelMappingService;
  private mappings = new Map<string, ChannelMapping>();
  private linkedPlayers = new Map<string, LinkedPlayer>();
  private database: Database;

  private constructor(database: Database) {
    this.database = database;
  }

  static getInstance(database: Database): ChannelMappingService {
    if (!ChannelMappingService.instance) {
      ChannelMappingService.instance = new ChannelMappingService(database);
    }
    return ChannelMappingService.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Load mappings from database
      await this.loadMappings();
      await this.loadLinkedPlayers();
      logger.info(`Loaded ${this.mappings.size} channel mappings`);
    } catch (error) {
      logger.error('Failed to initialize channel mappings:', error);
    }
  }

  private async loadMappings(): Promise<void> {
    try {
      const mappings = await this.database.getAllChannelMappings();
      
      this.mappings.clear();
      
      for (const dbMapping of mappings) {
        const mapping: ChannelMapping = {
          id: `${dbMapping.discord_channel_id}-${dbMapping.telegram_channel_id}`,
          telegramChannelId: dbMapping.telegram_channel_id,
          discordChannelId: dbMapping.discord_channel_id,
          createdAt: new Date(dbMapping.created_at),
          active: dbMapping.is_active === 1
        };
        
        this.mappings.set(mapping.id, mapping);
      }
      
      // Also check environment variables for backwards compatibility
      const telegramChannel = process.env.TELEGRAM_GAME_CHANNEL;
      const discordChannel = process.env.DISCORD_GAME_CHANNEL;
      
      if (telegramChannel && discordChannel) {
        const envMappingId = `${discordChannel}-${telegramChannel}`;
        if (!this.mappings.has(envMappingId)) {
          // Create this mapping in the database
          try {
            await this.database.createChannelMapping(
              discordChannel,
              telegramChannel,
              'system'
            );
            
            const mapping: ChannelMapping = {
              id: envMappingId,
              telegramChannelId: telegramChannel,
              discordChannelId: discordChannel,
              createdAt: new Date(),
              active: true
            };
            this.mappings.set(envMappingId, mapping);
          } catch (error) {
            // Mapping might already exist, ignore
            logger.debug('Environment mapping may already exist:', error);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to load channel mappings from database:', error);
      
      // Fall back to environment variables
      const telegramChannel = process.env.TELEGRAM_GAME_CHANNEL;
      const discordChannel = process.env.DISCORD_GAME_CHANNEL;
      
      if (telegramChannel && discordChannel) {
        const mapping: ChannelMapping = {
          id: 'default',
          telegramChannelId: telegramChannel,
          discordChannelId: discordChannel,
          createdAt: new Date(),
          active: true
        };
        this.mappings.set('default', mapping);
      }
    }
  }

  private async loadLinkedPlayers(): Promise<void> {
    // Linked players functionality not implemented yet
    // This would load player account links from database
  }

  async linkChannels(
    telegramChannelId: string, 
    discordChannelId: string
  ): Promise<ChannelMapping> {
    const mapping: ChannelMapping = {
      id: `${telegramChannelId}-${discordChannelId}`,
      telegramChannelId,
      discordChannelId,
      createdAt: new Date(),
      active: true
    };
    
    this.mappings.set(mapping.id, mapping);
    
    logger.info(`Linked channels: Telegram ${telegramChannelId} <-> Discord ${discordChannelId}`);
    return mapping;
  }

  async unlinkChannels(mappingId: string): Promise<void> {
    const mapping = this.mappings.get(mappingId);
    if (mapping) {
      mapping.active = false;
      this.mappings.delete(mappingId);
      logger.info(`Unlinked channels: ${mappingId}`);
    }
  }

  getLinkedChannels(platform: Platform, channelId: string): ChannelMapping[] {
    const linkedChannels: ChannelMapping[] = [];
    
    for (const mapping of this.mappings.values()) {
      if (!mapping.active) continue;
      
      if (platform === Platform.Telegram && mapping.telegramChannelId === channelId) {
        linkedChannels.push(mapping);
      } else if (platform === Platform.Discord && mapping.discordChannelId === channelId) {
        linkedChannels.push(mapping);
      }
    }
    
    return linkedChannels;
  }

  getTargetChannel(sourcePlatform: Platform, sourceChannelId: string): string | null {
    for (const mapping of this.mappings.values()) {
      if (!mapping.active) continue;
      
      if (sourcePlatform === Platform.Telegram && mapping.telegramChannelId === sourceChannelId) {
        return mapping.discordChannelId || null;
      } else if (sourcePlatform === Platform.Discord && mapping.discordChannelId === sourceChannelId) {
        return mapping.telegramChannelId || null;
      }
    }
    
    return null;
  }

  async linkPlayers(telegramUserId: string, discordUserId: string): Promise<LinkedPlayer> {
    const player: LinkedPlayer = {
      id: `${telegramUserId}-${discordUserId}`,
      telegramUserId,
      discordUserId,
      createdAt: new Date()
    };
    
    this.linkedPlayers.set(player.id, player);
    
    logger.info(`Linked players: Telegram ${telegramUserId} <-> Discord ${discordUserId}`);
    return player;
  }

  getLinkedPlayer(platform: Platform, userId: string): LinkedPlayer | null {
    for (const player of this.linkedPlayers.values()) {
      if (platform === Platform.Telegram && player.telegramUserId === userId) {
        return player;
      } else if (platform === Platform.Discord && player.discordUserId === userId) {
        return player;
      }
    }
    return null;
  }

  isChannelLinked(platform: Platform, channelId: string): boolean {
    return this.getLinkedChannels(platform, channelId).length > 0;
  }
}