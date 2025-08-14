import TelegramBot from 'node-telegram-bot-api';
import { PlatformAdapter } from '../common/PlatformAdapter';
import { 
  Platform, 
  Player, 
  UIMessage,
  GameInteraction 
} from '../../types';
import { 
  CommandContext,
  TelegramContext,
  TelegramInlineKeyboard,
  TelegramInlineButton 
} from '../../types/platform.types';
import { platformConfig } from '../../config';
import { logger, logPlatformEvent } from '../../utils/logger';
import { buildInlineKeyboard, parseCallbackData } from './keyboards';

export class TelegramAdapter extends PlatformAdapter {
  platform = Platform.Telegram;
  private bot: TelegramBot;
  private groupId: string;

  constructor() {
    super();
    this.bot = new TelegramBot(platformConfig.telegram.botToken, {
      polling: true,
    });
    this.groupId = platformConfig.telegram.groupId;
    
    this.setupEventHandlers();
  }

  async connect(): Promise<void> {
    try {
      const me = await this.bot.getMe();
      logger.info(`Telegram bot connected as @${me.username}`);
      
      // Verify group access
      try {
        const chat = await this.bot.getChat(this.groupId);
        logger.info(`Connected to Telegram group: ${chat.title || 'Unknown'}`);
      } catch (error) {
        logger.error('Failed to access Telegram group:', error);
      }
      
      this.isConnectedFlag = true;
      logPlatformEvent('telegram', 'connected');
    } catch (error) {
      logger.error('Failed to connect to Telegram:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.bot.stopPolling();
    this.isConnectedFlag = false;
    logPlatformEvent('telegram', 'disconnected');
  }

  async sendMessage(channelId: string, message: UIMessage): Promise<string> {
    const options: TelegramBot.SendMessageOptions = {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    };
    
    // Disable markdown for error messages to prevent parsing issues
    if (message.content.startsWith('❌')) {
      delete options.parse_mode;
    }
    
    // Add inline keyboard if components are provided
    if (message.components && message.components.length > 0) {
      options.reply_markup = buildInlineKeyboard(message.components);
    }
    
    try {
      const formattedContent = message.content.startsWith('❌') 
        ? message.content 
        : this.formatContent(message.content);
      
      // Debug logging to see exact message content
      logger.debug('Telegram message content:', {
        raw: message.content,
        formatted: formattedContent,
        byteLength: Buffer.byteLength(formattedContent, 'utf8'),
        first20Bytes: Buffer.from(formattedContent, 'utf8').slice(0, 20).toString('hex')
      });
      
      const sentMessage = await this.bot.sendMessage(
        channelId,
        formattedContent,
        options
      );
      
      return sentMessage.message_id.toString();
    } catch (error: any) {
      logger.error('Error sending Telegram message:', error);
      logger.error('Failed message content:', message.content);
      
      // If it's a parsing error, try sending without formatting
      if (error.message && error.message.includes('parse entities')) {
        logger.warn('Retrying message without markdown formatting...');
        try {
          // Remove parse_mode and send as plain text
          delete options.parse_mode;
          const sentMessage = await this.bot.sendMessage(
            channelId,
            message.content,
            options
          );
          return sentMessage.message_id.toString();
        } catch (retryError) {
          logger.error('Failed to send message even without formatting:', retryError);
          throw retryError;
        }
      }
      
      throw error;
    }
  }

  async editMessage(channelId: string, messageId: string, message: UIMessage): Promise<void> {
    const options: TelegramBot.EditMessageTextOptions = {
      chat_id: channelId,
      message_id: parseInt(messageId),
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    };
    
    // Disable markdown for error messages to prevent parsing issues
    if (message.content.startsWith('❌')) {
      delete options.parse_mode;
    }
    
    // Add inline keyboard if components are provided
    if (message.components && message.components.length > 0) {
      options.reply_markup = buildInlineKeyboard(message.components);
    }
    
    try {
      const formattedContent = message.content.startsWith('❌') 
        ? message.content 
        : this.formatContent(message.content);
        
      await this.bot.editMessageText(
        formattedContent,
        options
      );
    } catch (error: any) {
      logger.error('Error editing Telegram message:', error);
      
      // If it's a parsing error, try editing without formatting
      if (error.message && error.message.includes('parse entities')) {
        logger.warn('Retrying edit without markdown formatting...');
        try {
          // Remove parse_mode and edit as plain text
          delete options.parse_mode;
          await this.bot.editMessageText(
            message.content,
            options
          );
          return;
        } catch (retryError) {
          logger.error('Failed to edit message even without formatting:', retryError);
          throw retryError;
        }
      }
      
      throw error;
    }
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    try {
      await this.bot.deleteMessage(channelId, parseInt(messageId));
    } catch (error) {
      logger.error('Error deleting Telegram message:', error);
      throw error;
    }
  }

  getChannelName(channelId: string): string {
    // For Telegram, we'll use the group title or ID
    return `Telegram Group ${channelId}`;
  }

  isPrivateChannel(channelId: string): boolean {
    // Check if it's a private chat (positive ID) vs group (negative ID)
    return parseInt(channelId) > 0;
  }

  protected async createPlayer(userId: string): Promise<Player | null> {
    try {
      const member = await this.bot.getChatMember(this.groupId, parseInt(userId));
      const user = member.user;
      
      const player: Player = {
        id: userId,
        platform: Platform.Telegram,
        platformId: userId,
        username: user.username || `user_${userId}`,
        displayName: user.first_name + (user.last_name ? ` ${user.last_name}` : ''),
        stats: {
          gamesPlayed: 0,
          gamesWon: 0,
          gamesLost: 0,
          gamesDraw: 0,
          winStreak: 0,
          bestWinStreak: 0,
          totalScore: 0,
          achievements: [],
        },
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      
      await this.database.createPlayer(player);
      return player;
    } catch (error) {
      logger.error('Error creating Telegram player:', error);
      return null;
    }
  }

  private setupEventHandlers(): void {
    // Handle text messages
    this.bot.on('message', async (msg) => {
      // Only process messages from the configured group
      if (msg.chat.id.toString() !== this.groupId) {
        return;
      }
      
      // Ignore bot messages
      if (msg.from?.is_bot) {
        return;
      }
      
      const text = msg.text;
      if (!text) {
        return;
      }
      
      // Parse command
      const parsed = this.parseCommand(text);
      if (!parsed) {
        return;
      }
      
      if (!msg.from) {
        return;
      }
      const userId = msg.from.id.toString();
      
      // Create context
      const context: TelegramContext = {
        platform: Platform.Telegram,
        command: parsed.command,
        args: parsed.args,
        userId,
        channelId: msg.chat.id.toString(),
        messageId: msg.message_id.toString(),
        chatId: msg.chat.id,
        messageThreadId: msg.message_thread_id,
        from: {
          id: msg.from.id,
          firstName: msg.from.first_name,
          lastName: msg.from.last_name,
          username: msg.from.username,
        },
        reply: this.createReplyFunction(async (message) => {
          return this.sendMessage(msg.chat.id.toString(), message);
        }),
        react: this.createReactFunction(async (emoji) => {
          // Telegram doesn't have reactions in groups, ignore
        }),
      };
      
      // Update player activity
      await this.updatePlayerActivity(userId);
      
      // Handle command
      await this.handleCommand(parsed.command, parsed.args, context);
    });
    
    // Handle callback queries (button clicks)
    this.bot.on('callback_query', async (query) => {
      const userId = query.from.id.toString();
      const messageId = query.message?.message_id.toString();
      const chatId = query.message?.chat.id.toString();
      
      if (!messageId || !chatId) {
        return;
      }
      
      // Parse callback data
      const data = parseCallbackData(query.data || '');
      
      // Create game interaction
      const interaction: GameInteraction = {
        id: query.id,
        type: 'button_click',
        platform: Platform.Telegram,
        userId,
        gameSessionId: data.sessionId || '',
        messageId,
        data: data,
        timestamp: new Date(),
      };
      
      // Answer callback query to remove loading state
      await this.bot.answerCallbackQuery(query.id);
      
      // Update player activity
      await this.updatePlayerActivity(userId);
      
      // Handle interaction
      await this.handleInteraction(interaction);
    });
    
    // Handle errors
    this.bot.on('polling_error', (error) => {
      logger.error('Telegram polling error:', error);
    });
    
    this.bot.on('error', (error) => {
      logger.error('Telegram error:', error);
    });
  }

  protected formatUserMention(userId: string): string {
    return `[User](tg://user?id=${userId})`;
  }


  private formatContent(content: string): string {
    try {
      // First, protect code blocks from processing
      const codeBlocks: string[] = [];
      content = content.replace(/```[\s\S]*?```/g, (match) => {
        codeBlocks.push(match);
        return `__CODEBLOCK_${codeBlocks.length - 1}__`;
      });
      
      // Protect inline code from processing
      const inlineCodes: string[] = [];
      content = content.replace(/`[^`\n]+`/g, (match) => {
        inlineCodes.push(match);
        return `__INLINECODE_${inlineCodes.length - 1}__`;
      });
      
      // Escape special characters that can break Telegram's parser
      content = content.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
      
      // Convert markdown formatting (after escaping)
      // Bold: **text** -> *text*
      content = content.replace(/\\\*\\\*(.*?)\\\*\\\*/g, '*$1*');
      // Italic: __text__ -> _text_  
      content = content.replace(/\\_\\_(.*?)\\_\\_/g, '_$1_');
      // Remove escaping from converted formatting
      content = content.replace(/\*([^*]+)\*/g, (match, p1) => {
        return '*' + p1.replace(/\\/g, '') + '*';
      });
      content = content.replace(/_([^_]+)_/g, (match, p1) => {
        return '_' + p1.replace(/\\/g, '') + '_';
      });
      
      // Restore code blocks and inline code (these should not be escaped)
      codeBlocks.forEach((block, i) => {
        content = content.replace(`__CODEBLOCK_${i}__`, block);
      });
      inlineCodes.forEach((code, i) => {
        content = content.replace(`__INLINECODE_${i}__`, code);
      });
      
      return content;
    } catch (error) {
      logger.error('Error formatting content for Telegram:', error);
      // Return original content if formatting fails
      return content;
    }
  }
}