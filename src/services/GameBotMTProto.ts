import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';

// Load MTProto-specific env
dotenv.config({ path: path.join(__dirname, '../../mtproto/.env.mtproto') });

export class GameBotMTProto {
  private client: TelegramClient | null = null;
  private sessionPath = path.join(__dirname, '../../mtproto/sessions/gamebot_main.session');
  private apiId = 21719550;
  private apiHash = 'e7665e0d065642b4d5d8cead6e113b07';
  private isConnected = false;
  
  async initialize(): Promise<void> {
    try {
      const sessionString = this.loadSession();
      const session = new StringSession(sessionString);
      
      this.client = new TelegramClient(session, this.apiId, this.apiHash, {
        connectionRetries: 5,
        // Disable verbose network logging
        baseLogger: {
          log: () => {},  // Suppress regular logs
          error: (msg: string) => {
            // Only log critical errors
            if (msg.includes('FLOOD_WAIT') || msg.includes('AUTH_KEY')) {
              logger.error('MTProto critical:', msg);
            }
          },
          warn: () => {},  // Suppress warnings
          info: () => {},  // Suppress info
          debug: () => {},  // Suppress debug
        } as any,
      });
      
      // Connect as bot
      await this.client.start({
        botAuthToken: process.env.GAMEBOT_BOT_TOKEN!,
        onError: (err) => logger.error('MTProto error:', err),
      });
      
      this.isConnected = true;
      logger.info('GameBot MTProto connected successfully!');
      this.saveSession(this.client.session.save() as string);
    } catch (error) {
      logger.error('Failed to initialize MTProto:', error);
      throw error;
    }
  }
  
  // Ultra-fast message editing
  async rapidEdit(chatId: string | number, messageId: number, text: string, parseMode: 'html' | 'markdown' = 'html'): Promise<void> {
    if (!this.client || !this.isConnected) throw new Error('MTProto not initialized');
    
    try {
      await this.client.invoke(
        new Api.messages.EditMessage({
          peer: chatId,
          id: messageId,
          message: text,
          parseMode: parseMode,
          noWebpage: true,
        })
      );
    } catch (error) {
      logger.error('Failed to rapid edit message:', error);
      throw error;
    }
  }
  
  // Send ephemeral message (appears then edits away)
  async sendEphemeral(chatId: string | number, text: string, durationMs: number = 3000): Promise<void> {
    if (!this.client || !this.isConnected) throw new Error('MTProto not initialized');
    
    try {
      const result = await this.client.sendMessage(chatId, { 
        message: text,
        parseMode: 'html'
      });
      
      setTimeout(async () => {
        try {
          await this.rapidEdit(chatId, result.id, '🎮 Game in progress...');
        } catch (error) {
          logger.error('Failed to edit ephemeral message:', error);
        }
      }, durationMs);
    } catch (error) {
      logger.error('Failed to send ephemeral message:', error);
      throw error;
    }
  }
  
  // Get user's input entity for private messaging
  async getUserEntity(userId: string | number): Promise<Api.User | null> {
    if (!this.client || !this.isConnected) return null;
    
    try {
      const entity = await this.client.getEntity(userId);
      return entity as Api.User;
    } catch (error) {
      logger.debug(`Failed to get user entity for ${userId}:`, error);
      return null;
    }
  }
  
  // Send message with inline keyboard
  async sendMessageWithButtons(chatId: string | number, text: string, buttons: Api.KeyboardButton[][]): Promise<Api.Message> {
    if (!this.client || !this.isConnected) throw new Error('MTProto not initialized');
    
    const markup = new Api.ReplyInlineMarkup({
      rows: buttons.map(row => 
        new Api.KeyboardButtonRow({
          buttons: row
        })
      )
    });
    
    return await this.client.sendMessage(chatId, {
      message: text,
      buttons: markup,
      parseMode: 'html'
    });
  }
  
  // Edit message with inline keyboard
  async editMessageWithButtons(chatId: string | number, messageId: number, text: string, buttons: Api.KeyboardButton[][]): Promise<void> {
    if (!this.client || !this.isConnected) throw new Error('MTProto not initialized');
    
    const markup = new Api.ReplyInlineMarkup({
      rows: buttons.map(row => 
        new Api.KeyboardButtonRow({
          buttons: row
        })
      )
    });
    
    await this.client.invoke(
      new Api.messages.EditMessage({
        peer: chatId,
        id: messageId,
        message: text,
        replyMarkup: markup,
        parseMode: 'html',
        noWebpage: true,
      })
    );
  }
  
  // Disconnect safely
  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
      logger.info('MTProto disconnected');
    }
  }
  
  // Check if connected
  getIsConnected(): boolean {
    return this.isConnected;
  }
  
  private loadSession(): string {
    if (fs.existsSync(this.sessionPath)) {
      return fs.readFileSync(this.sessionPath, 'utf-8').trim();
    }
    return '';
  }
  
  private saveSession(session: string): void {
    const dir = path.dirname(this.sessionPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.sessionPath, session);
  }
}