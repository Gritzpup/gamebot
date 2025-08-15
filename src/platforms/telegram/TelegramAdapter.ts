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
import { messageEditRateLimiter } from '../../utils/RateLimiter';

export class TelegramAdapter extends PlatformAdapter {
  platform = Platform.Telegram;
  private bot: TelegramBot;
  private groupId: string;
  private editQueue: Map<string, {
    message: UIMessage;
    retries: number;
    nextRetryAt: number;
    createdAt: number;
  }> = new Map();
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly MAX_RETRIES = 5;
  private readonly MAX_QUEUE_AGE = 60000; // 1 minute

  constructor() {
    super();
    this.bot = new TelegramBot(platformConfig.telegram.botToken, {
      polling: true,
    });
    this.groupId = platformConfig.telegram.groupId;
    
    this.setupEventHandlers();
    this.startMessageProcessor();
  }

  private startMessageProcessor(): void {
    setInterval(async () => {
      await this.processEditQueue();
    }, 100);
  }

  private async processEditQueue(): Promise<void> {
    const now = Date.now();
    
    // Clean up old entries first
    for (const [key, item] of this.editQueue.entries()) {
      // Remove entries that are too old
      if (now - item.createdAt > this.MAX_QUEUE_AGE) {
        this.editQueue.delete(key);
        logger.debug(`Removed stale edit queue entry: ${key}`);
        continue;
      }
      
      // Remove entries that have exceeded max retries
      if (item.retries >= this.MAX_RETRIES) {
        this.editQueue.delete(key);
        logger.warn(`Removed edit queue entry after max retries: ${key}`);
        continue;
      }
    }
    
    // Enforce max queue size
    if (this.editQueue.size > this.MAX_QUEUE_SIZE) {
      // Remove oldest entries
      const sortedEntries = Array.from(this.editQueue.entries())
        .sort(([, a], [, b]) => a.createdAt - b.createdAt);
      
      const entriesToRemove = sortedEntries.slice(0, this.editQueue.size - this.MAX_QUEUE_SIZE);
      for (const [key] of entriesToRemove) {
        this.editQueue.delete(key);
        logger.warn(`Removed edit queue entry due to size limit: ${key}`);
      }
    }
    
    // Process ready entries
    for (const [key, item] of this.editQueue.entries()) {
      if (now >= item.nextRetryAt) {
        const [channelId, messageId] = key.split(':');
        const rateLimitKey = `edit-${channelId}-${messageId}`;
        
        if (messageEditRateLimiter.isAllowed(rateLimitKey)) {
          this.editQueue.delete(key);
          this.editMessage(channelId, messageId, item.message).catch(err => {
            // If error, re-queue with exponential backoff
            if (!err.message?.includes('message is not modified')) {
              const newRetries = item.retries + 1;
              if (newRetries < this.MAX_RETRIES) {
                const backoffDelay = Math.min(500 * Math.pow(2, newRetries), 10000);
                this.editQueue.set(key, {
                  ...item,
                  retries: newRetries,
                  nextRetryAt: now + backoffDelay
                });
                logger.debug(`Re-queued edit with backoff ${backoffDelay}ms: ${key}`);
              }
            }
          });
        }
      }
    }
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
      parse_mode: 'HTML',
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
    // Check rate limit first
    const rateLimitKey = `edit-${channelId}-${messageId}`;
    if (!messageEditRateLimiter.isAllowed(rateLimitKey)) {
      // Queue the message for later
      const queueKey = `${channelId}:${messageId}`;
      const now = Date.now();
      this.editQueue.set(queueKey, {
        message,
        retries: 0,
        nextRetryAt: now + 500,
        createdAt: now
      });
      logger.debug('Message edit rate limited, queued for later');
      return;
    }

    const options: TelegramBot.EditMessageTextOptions = {
      chat_id: channelId,
      message_id: parseInt(messageId),
      parse_mode: 'HTML',
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
      // Ignore "message is not modified" errors - this is expected when game state hasn't changed
      if (error.message && error.message.includes('message is not modified')) {
        logger.debug('Message content unchanged, skipping edit');
        return;
      }
      
      // Handle rate limit errors (429)
      if (error.response && error.response.statusCode === 429) {
        const retryAfter = error.response.body?.parameters?.retry_after || 1;
        logger.warn(`Telegram API rate limit hit, retry after ${retryAfter}s`);
        
        // Queue with exponential backoff
        const queueKey = `${channelId}:${messageId}`;
        const existing = this.editQueue.get(queueKey);
        const retries = (existing?.retries || 0) + 1;
        
        this.editQueue.set(queueKey, {
          message,
          retries,
          nextRetryAt: Date.now() + (retryAfter * 1000 * Math.pow(2, Math.min(retries - 1, 5))),
          createdAt: existing?.createdAt || Date.now()
        });
        return;
      }
      
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

  async clearEditQueue(channelId: string, messageId: string): Promise<void> {
    const queueKey = `${channelId}:${messageId}`;
    if (this.editQueue.has(queueKey)) {
      this.editQueue.delete(queueKey);
      logger.debug(`Cleared edit queue for message: ${queueKey}`);
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
      
      if (!msg.from) {
        return;
      }
      const userId = msg.from.id.toString();
      
      // Parse command
      const parsed = this.parseCommand(text);
      
      // If not a command, check if it's a Wordle guess
      if (!parsed) {
        // Check if it's a 5-letter word (potential Wordle guess)
        // Make text validation more forgiving - remove spaces, punctuation, etc.
        const cleanText = text.trim().toUpperCase().replace(/[^A-Z]/g, '');
        logger.info(`[Wordle] Text input received: "${text}" -> cleaned: "${cleanText}" (length: ${cleanText.length})`);
        
        if (cleanText.length === 5) {
          logger.info(`[Wordle] Valid 5-letter word detected: ${cleanText} from user ${userId} in channel ${msg.chat.id}`);
          
          // Find if user has an active Wordle game
          const gameSessionId = await this.findActiveWordleSession(userId, msg.chat.id.toString());
          logger.info(`[Wordle] Active session lookup for user ${userId}: ${gameSessionId ? `Found (${gameSessionId})` : 'NOT FOUND'}`);
          
          if (gameSessionId) {
            logger.info(`[Wordle] Processing guess "${cleanText}" for session ${gameSessionId}`);
            
            // Create a text input interaction for Wordle
            const interaction: GameInteraction = {
              id: msg.message_id.toString(),
              type: 'text_input',
              platform: Platform.Telegram,
              userId,
              channelId: msg.chat.id.toString(),
              gameSessionId,
              messageId: undefined, // Text inputs don't have a specific game message
              data: { text: cleanText },
              timestamp: new Date(),
            };
            
            // Update player activity
            await this.updatePlayerActivity(userId);
            
            // Handle the guess
            await this.handleInteraction(interaction);
            return;
          } else {
            // No active session found - provide helpful feedback
            logger.warn(`[Wordle] User ${userId} tried to guess "${cleanText}" but has no active game`);
            await this.bot.sendMessage(
              msg.chat.id, 
              `❌ No active Wordle game found!\n\n👉 Start a new game with: /play wordle\n\nThen type your 5-letter guesses directly in the chat.`,
              { reply_to_message_id: msg.message_id }
            );
            return;
          }
        } else if (cleanText.length > 0 && cleanText.length < 10 && /^[A-Z]+$/.test(cleanText)) {
          // User might be trying to play Wordle but word is wrong length
          logger.debug(`[Wordle] Possible Wordle attempt with wrong length: "${cleanText}" (${cleanText.length} letters)`);
        }
        return;
      }
      
      // Check if user is admin
      let isAdmin = false;
      try {
        const chatMember = await this.bot.getChatMember(msg.chat.id, msg.from.id);
        isAdmin = ['creator', 'administrator'].includes(chatMember.status);
      } catch (error) {
        // If we can't check admin status, default to false
        logger.debug('Could not check admin status:', error);
      }
      
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
        isAdmin,
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
        channelId: chatId,
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
    return `<a href="tg://user?id=${userId}">User</a>`;
  }
  
  private async findActiveWordleSession(userId: string, channelId: string): Promise<string | null> {
    try {
      // Get Redis state manager to find active games
      const redis = (await import('../../services/redis/RedisClient')).RedisClient.getInstance();
      const stateManager = redis.getStateManager();
      
      // Get player's active games
      const playerGames = await stateManager.getPlayerGames(userId);
      logger.info(`[Wordle] Player ${userId} has ${playerGames.length} active games: ${playerGames.join(', ')}`);
      
      // Check each game to see if it's a Wordle game
      for (const sessionId of playerGames) {
        const gameState = await stateManager.getGameState(sessionId);
        logger.info(`[Wordle] Checking game ${sessionId}:`, {
          gameType: gameState?.gameType,
          channelId: gameState?.channelId,
          ended: gameState?.ended,
          players: gameState?.players,
          actualChannelId: channelId
        });
        
        if (gameState && gameState.gameType === 'wordle' && gameState.channelId === channelId && !gameState.ended) {
          logger.info(`[Wordle] Found active Wordle session: ${sessionId}`);
          return sessionId;
        }
      }
      
      logger.info(`[Wordle] No active Wordle session found for user ${userId} in channel ${channelId}`);
      return null;
    } catch (error) {
      logger.error('Error finding active Wordle session:', error);
      return null;
    }
  }


  private formatContent(content: string): string {
    try {
      // Escape HTML entities
      content = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      // Convert markdown to HTML
      // Bold: **text** -> <b>text</b>
      content = content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      
      // Italic: *text* or _text_ -> <i>text</i>
      content = content.replace(/\*(.*?)\*/g, '<i>$1</i>');
      content = content.replace(/_(.*?)_/g, '<i>$1</i>');
      
      // Code blocks: ```text``` -> <pre>text</pre>
      content = content.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');
      
      // Inline code: `text` -> <code>text</code>
      content = content.replace(/`([^`\n]+)`/g, '<code>$1</code>');
      
      // Links: [text](url) -> <a href="url">text</a>
      content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
      
      return content;
    } catch (error) {
      logger.error('Error formatting content for Telegram:', error);
      // Return escaped content if formatting fails
      return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  }
}