import { Platform, UIMessage } from '../types';
import { PlatformFormatter } from './types';
import { DiscordFormatter } from './formatters/DiscordFormatter';
import { TelegramFormatter } from './formatters/TelegramFormatter';
import { logger } from '../utils/logger';

export class MessageTransformer {
  private formatters: Map<Platform, PlatformFormatter>;

  constructor() {
    this.formatters = new Map();
    this.formatters.set(Platform.Discord, new DiscordFormatter());
    this.formatters.set(Platform.Telegram, new TelegramFormatter());
  }

  transform(
    message: UIMessage, 
    sourcePlatform: Platform, 
    targetPlatform: Platform,
    options?: {
      showPlatformPrefix?: boolean;
      showUsername?: boolean;
      username?: string;
    }
  ): UIMessage {
    logger.debug(`Transforming message from ${sourcePlatform} to ${targetPlatform}`);
    
    const formatter = this.formatters.get(targetPlatform);
    if (!formatter) {
      logger.error(`No formatter found for platform: ${targetPlatform}`);
      return message;
    }

    let content = message.content;
    
    // Add platform prefix if requested
    if (options?.showPlatformPrefix || options?.showUsername) {
      const prefix = this.buildPrefix(sourcePlatform, options);
      if (prefix && !content.startsWith(prefix)) {
        content = prefix + content;
      }
    }
    
    // Format content for target platform
    const formattedContent = formatter.formatContent(content, sourcePlatform);
    
    // Transform components (buttons, etc.)
    const transformedComponents = message.components 
      ? formatter.transformComponents(message.components, sourcePlatform)
      : undefined;
    
    return {
      content: formattedContent,
      components: transformedComponents,
      ephemeral: message.ephemeral
    };
  }

  transformGameMessage(
    message: UIMessage,
    sourcePlatform: Platform,
    targetPlatform: Platform
  ): UIMessage {
    const formatter = this.formatters.get(targetPlatform);
    if (!formatter) {
      return message;
    }

    // Special handling for game boards to preserve formatting
    let content = message.content;
    
    // Extract and format game board sections
    const boardPattern = /```([\s\S]*?)```/g;
    content = content.replace(boardPattern, (match, board) => {
      return formatter.formatGameBoard(match);
    });

    // Format the rest of the content
    content = formatter.formatContent(content, sourcePlatform);
    
    // Transform components
    const components = message.components 
      ? formatter.transformComponents(message.components, sourcePlatform)
      : undefined;

    return {
      content,
      components,
      ephemeral: message.ephemeral
    };
  }

  private buildPrefix(platform: Platform, options: any): string {
    const parts: string[] = [];
    
    if (options.showPlatformPrefix) {
      parts.push(`[${platform}]`);
    }
    
    if (options.showUsername && options.username) {
      parts.push(options.username + ':');
    }
    
    return parts.length > 0 ? parts.join(' ') + ' ' : '';
  }

  formatUserMention(
    userId: string, 
    username: string, 
    targetPlatform: Platform
  ): string {
    const formatter = this.formatters.get(targetPlatform);
    return formatter ? formatter.formatUserMention(userId, username) : username;
  }
}