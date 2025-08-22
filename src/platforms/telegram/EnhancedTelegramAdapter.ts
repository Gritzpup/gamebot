import { TelegramAdapter } from './TelegramAdapter';
import { GameBotMTProto } from '../../services/GameBotMTProto';
import { UIMessage } from '../../types';
import { logger } from '../../utils/logger';
import { Api } from 'telegram';

export class EnhancedTelegramAdapter extends TelegramAdapter {
  private mtproto: GameBotMTProto | null = null;
  private quickViewTimers: Map<string, NodeJS.Timeout> = new Map();
  
  async initialize(): Promise<void> {
    try {
      // Initialize MTProto
      this.mtproto = new GameBotMTProto();
      await this.mtproto.initialize();
      logger.info('Enhanced Telegram Adapter with MTProto initialized');
    } catch (error) {
      logger.error('Failed to initialize MTProto, falling back to standard adapter:', error);
      // Continue without MTProto - graceful degradation
      this.mtproto = null;
    }
  }
  
  // Quick card view - shows cards for 3 seconds
  async showQuickCards(chatId: string, messageId: number, userId: string, cards: string[], originalContent: string): Promise<void> {
    if (!this.mtproto || !this.mtproto.getIsConnected()) {
      logger.warn('MTProto not available for quick cards');
      return;
    }
    
    // Cancel any existing timer for this message
    const timerKey = `${chatId}-${messageId}`;
    const existingTimer = this.quickViewTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    try {
      const cardDisplay = `<b>🎴 ${userId}'s cards:</b>\n${cards.join(' ')}\n\n<i>This message will disappear in 3 seconds...</i>`;
      await this.mtproto.rapidEdit(chatId, messageId, cardDisplay);
      
      // Set timer to revert
      const timer = setTimeout(async () => {
        try {
          await this.mtproto!.rapidEdit(chatId, messageId, originalContent);
          this.quickViewTimers.delete(timerKey);
        } catch (error) {
          logger.error('Failed to revert quick view:', error);
        }
      }, 3000);
      
      this.quickViewTimers.set(timerKey, timer);
    } catch (error) {
      logger.error('Failed to show quick cards:', error);
    }
  }
  
  // Flash message - brief notification
  async flashNotification(chatId: string, text: string, durationMs: number = 2000): Promise<void> {
    if (!this.mtproto || !this.mtproto.getIsConnected()) {
      // Fallback to regular message
      const message = await this.sendMessage(chatId, { content: text });
      setTimeout(() => {
        this.deleteMessage(chatId, message).catch(err => 
          logger.error('Failed to delete flash message:', err)
        );
      }, durationMs);
      return;
    }
    
    try {
      await this.mtproto.sendEphemeral(chatId, text, durationMs);
    } catch (error) {
      logger.error('Failed to send flash notification:', error);
    }
  }
  
  // Try private message with fallback
  async sendPrivateWithFallback(userId: string, content: UIMessage): Promise<boolean> {
    try {
      // First, try to send using normal bot API
      await this.sendMessage(userId, content);
      return true;
    } catch (error: any) {
      // Check if error is because user hasn't started the bot
      if (error.message?.includes('bot can\'t initiate conversation') ||
          error.message?.includes('chat not found')) {
        logger.debug(`User ${userId} hasn't started the bot`);
        return false;
      }
      // Other errors should be thrown
      throw error;
    }
  }
  
  // Enhanced message editing with MTProto for speed
  async rapidEditMessage(channelId: string, messageId: string, message: UIMessage): Promise<void> {
    if (!this.mtproto || !this.mtproto.getIsConnected()) {
      // Fallback to regular edit
      return this.editMessage(channelId, messageId, message);
    }
    
    try {
      // Use MTProto for ultra-fast edit
      await this.mtproto.rapidEdit(channelId, parseInt(messageId), this.formatContent(message.content));
    } catch (error) {
      logger.error('MTProto rapid edit failed, falling back to regular edit:', error);
      return this.editMessage(channelId, messageId, message);
    }
  }
  
  // Create inline keyboard buttons for MTProto
  private createMTProtoButtons(components: any[]): Api.KeyboardButton[][] {
    const rows: Api.KeyboardButton[][] = [];
    
    for (const component of components) {
      if (component.type === 'BUTTON_ROW') {
        const row: Api.KeyboardButton[] = [];
        for (const element of component.elements) {
          if (element.type === 'BUTTON') {
            row.push(new Api.KeyboardButtonCallback({
              text: element.label,
              data: Buffer.from(element.id)
            }));
          }
        }
        if (row.length > 0) {
          rows.push(row);
        }
      }
    }
    
    return rows;
  }
  
  // Send message with MTProto buttons for better performance
  async sendMessageWithMTProtoButtons(channelId: string, text: string, buttons: Api.KeyboardButton[][]): Promise<string | null> {
    if (!this.mtproto || !this.mtproto.getIsConnected()) {
      return null;
    }
    
    try {
      const result = await this.mtproto.sendMessageWithButtons(channelId, text, buttons);
      return result.id.toString();
    } catch (error) {
      logger.error('Failed to send message with MTProto buttons:', error);
      return null;
    }
  }
  
  // Cleanup on shutdown
  async shutdown(): Promise<void> {
    // Clear all quick view timers
    for (const timer of this.quickViewTimers.values()) {
      clearTimeout(timer);
    }
    this.quickViewTimers.clear();
    
    // Disconnect MTProto
    if (this.mtproto) {
      await this.mtproto.disconnect();
    }
  }
  
  // Check if MTProto is available
  isMTProtoAvailable(): boolean {
    return this.mtproto !== null && this.mtproto.getIsConnected();
  }
}