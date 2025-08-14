import { Platform, UIMessage } from '../types';

export interface ChannelMapping {
  id: string;
  telegramChannelId?: string;
  discordChannelId?: string;
  createdAt: Date;
  active: boolean;
}

export interface LinkedPlayer {
  id: string;
  telegramUserId?: string;
  discordUserId?: string;
  createdAt: Date;
}

export interface RelayMessage {
  sourcePlatform: Platform;
  sourceChannelId: string;
  targetPlatform: Platform;
  targetChannelId: string;
  message: UIMessage;
  gameSessionId?: string;
  metadata?: Record<string, any>;
}

export interface PlatformFormatter {
  formatContent(content: string, sourcePlatform: Platform): string;
  transformComponents(components: any[], sourcePlatform: Platform): any[];
  formatUserMention(userId: string, username: string): string;
  formatGameBoard(board: string): string;
}

export interface RelayConfig {
  enabled: boolean;
  defaultMappings: Array<{
    telegram?: string;
    discord?: string;
  }>;
  messagePrefix: {
    showPlatform: boolean;
    showUsername: boolean;
    format: string; // e.g., "[{platform}] {username}: "
  };
}