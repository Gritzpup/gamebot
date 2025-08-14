import { Platform, UIMessage } from '../types';
import { IPlatformAdapter } from '../types/platform.types';
import { ChannelMappingService } from './ChannelMappingService';
import { MessageTransformer } from './MessageTransformer';
import { RelayMessage, RelayConfig } from './types';
import { logger } from '../utils/logger';
import { Database } from '../services/database/Database';

export class CrossPlatformRelayService {
  private static instance: CrossPlatformRelayService;
  private platformAdapters = new Map<Platform, IPlatformAdapter>();
  private channelMappingService: ChannelMappingService;
  private messageTransformer: MessageTransformer;
  private config: RelayConfig;
  private messageCache = new Map<string, Date>(); // Prevent relay loops
  private database: Database;

  private constructor(database: Database) {
    this.database = database;
    this.channelMappingService = ChannelMappingService.getInstance(database);
    this.messageTransformer = new MessageTransformer();
    this.config = {
      enabled: true,
      defaultMappings: [],
      messagePrefix: {
        showPlatform: true,
        showUsername: true,
        format: '[{platform}] {username}: '
      }
    };
  }

  static getInstance(database: Database): CrossPlatformRelayService {
    if (!CrossPlatformRelayService.instance) {
      CrossPlatformRelayService.instance = new CrossPlatformRelayService(database);
    }
    return CrossPlatformRelayService.instance;
  }

  async initialize(): Promise<void> {
    await this.channelMappingService.initialize();
    logger.info('Cross-platform relay service initialized');
    
    // Clean up old cache entries every minute
    setInterval(() => this.cleanupMessageCache(), 60000);
  }

  registerAdapter(platform: Platform, adapter: IPlatformAdapter): void {
    this.platformAdapters.set(platform, adapter);
    logger.info(`Registered ${platform} adapter for relay service`);
  }

  async relayGameMessage(
    sourcePlatform: Platform,
    sourceChannelId: string,
    message: UIMessage,
    gameSessionId: string,
    metadata?: {
      userId?: string;
      username?: string;
    }
  ): Promise<void> {
    if (!this.config.enabled) return;

    // Check if this channel has linked channels
    const linkedChannels = this.channelMappingService.getLinkedChannels(
      sourcePlatform, 
      sourceChannelId
    );
    
    if (linkedChannels.length === 0) {
      logger.debug(`No linked channels for ${sourcePlatform} channel ${sourceChannelId}`);
      return;
    }

    // Create a cache key to prevent relay loops
    const cacheKey = `${gameSessionId}-${message.content.substring(0, 50)}`;
    if (this.messageCache.has(cacheKey)) {
      logger.debug('Skipping duplicate relay message');
      return;
    }
    this.messageCache.set(cacheKey, new Date());

    // Relay to each linked channel
    for (const mapping of linkedChannels) {
      const targetPlatform = sourcePlatform === Platform.Telegram 
        ? Platform.Discord 
        : Platform.Telegram;
      
      const targetChannelId = sourcePlatform === Platform.Telegram
        ? mapping.discordChannelId
        : mapping.telegramChannelId;
      
      if (!targetChannelId) continue;

      try {
        await this.relayToChannel(
          sourcePlatform,
          targetPlatform,
          targetChannelId,
          message,
          metadata
        );
      } catch (error) {
        logger.error(`Failed to relay message to ${targetPlatform}:`, error);
      }
    }
  }

  private async relayToChannel(
    sourcePlatform: Platform,
    targetPlatform: Platform,
    targetChannelId: string,
    message: UIMessage,
    metadata?: any
  ): Promise<void> {
    const targetAdapter = this.platformAdapters.get(targetPlatform);
    if (!targetAdapter) {
      logger.error(`No adapter registered for platform: ${targetPlatform}`);
      return;
    }

    // Transform the message for the target platform
    const transformedMessage = this.messageTransformer.transformGameMessage(
      message,
      sourcePlatform,
      targetPlatform
    );

    // Add platform prefix if configured
    if (this.config.messagePrefix.showPlatform && metadata) {
      const prefix = this.formatPrefix(sourcePlatform, metadata);
      if (!transformedMessage.content.includes('[Game Update]')) {
        transformedMessage.content = prefix + transformedMessage.content;
      }
    }

    try {
      await targetAdapter.sendMessage(targetChannelId, transformedMessage);
      logger.debug(`Relayed message from ${sourcePlatform} to ${targetPlatform}`);
    } catch (error) {
      logger.error(`Error relaying message to ${targetPlatform}:`, error);
      throw error;
    }
  }

  async relayUserMessage(
    sourcePlatform: Platform,
    sourceChannelId: string,
    userId: string,
    username: string,
    content: string
  ): Promise<void> {
    if (!this.config.enabled) return;

    // Check if this is a game command - if so, don't relay
    if (content.startsWith('/play') || content.startsWith('!play')) {
      return;
    }

    const linkedChannels = this.channelMappingService.getLinkedChannels(
      sourcePlatform,
      sourceChannelId
    );

    for (const mapping of linkedChannels) {
      const targetPlatform = sourcePlatform === Platform.Telegram 
        ? Platform.Discord 
        : Platform.Telegram;
      
      const targetChannelId = sourcePlatform === Platform.Telegram
        ? mapping.discordChannelId
        : mapping.telegramChannelId;
      
      if (!targetChannelId) continue;

      const targetAdapter = this.platformAdapters.get(targetPlatform);
      if (!targetAdapter) continue;

      const prefix = `[${sourcePlatform}] ${username}: `;
      const message: UIMessage = {
        content: prefix + content
      };

      try {
        await targetAdapter.sendMessage(targetChannelId, message);
      } catch (error) {
        logger.error(`Failed to relay user message to ${targetPlatform}:`, error);
      }
    }
  }

  private formatPrefix(platform: Platform, metadata: any): string {
    let prefix = this.config.messagePrefix.format;
    
    prefix = prefix.replace('{platform}', platform);
    prefix = prefix.replace('{username}', metadata.username || 'Unknown');
    
    return prefix;
  }

  private cleanupMessageCache(): void {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    for (const [key, timestamp] of this.messageCache.entries()) {
      if (timestamp < fiveMinutesAgo) {
        this.messageCache.delete(key);
      }
    }
  }

  isRelayEnabled(): boolean {
    return this.config.enabled;
  }

  setRelayEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    logger.info(`Cross-platform relay ${enabled ? 'enabled' : 'disabled'}`);
  }

  async linkChannels(
    discordChannelId: string,
    telegramChannelId: string,
    createdBy?: string
  ): Promise<void> {
    try {
      await this.database.createChannelMapping(
        discordChannelId,
        telegramChannelId,
        createdBy
      );
      
      // Reload mappings
      await this.channelMappingService.initialize();
      
      logger.info(`Linked channels: Discord ${discordChannelId} <-> Telegram ${telegramChannelId}`);
    } catch (error) {
      logger.error('Failed to link channels:', error);
      throw error;
    }
  }

  async unlinkChannels(
    discordChannelId: string,
    telegramChannelId: string
  ): Promise<void> {
    try {
      await this.database.deleteChannelMapping(
        discordChannelId,
        telegramChannelId
      );
      
      // Reload mappings
      await this.channelMappingService.initialize();
      
      logger.info(`Unlinked channels: Discord ${discordChannelId} <-> Telegram ${telegramChannelId}`);
    } catch (error) {
      logger.error('Failed to unlink channels:', error);
      throw error;
    }
  }

  async getLinkedChannels(
    platform: Platform,
    channelId: string
  ): Promise<any[]> {
    if (platform === Platform.Discord) {
      return this.database.getChannelMappingsByDiscord(channelId);
    } else {
      return this.database.getChannelMappingsByTelegram(channelId);
    }
  }

  async getAllChannelMappings(): Promise<any[]> {
    return this.database.getAllChannelMappings();
  }
}