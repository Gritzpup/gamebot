import { EventEmitter } from 'events';
import { 
  IPlatformAdapter, 
  CommandContext,
  PlatformEvent 
} from '../../types/platform.types';
import { 
  Platform, 
  Player, 
  UIMessage,
  GameInteraction 
} from '../../types';
import { logger } from '../../utils/logger';
import { Database } from '../../services/database/Database';

export abstract class PlatformAdapter extends EventEmitter implements IPlatformAdapter {
  abstract platform: Platform;
  protected database: Database;
  protected commandHandlers: Map<string, (context: CommandContext) => Promise<void>> = new Map();
  protected interactionHandler?: (interaction: GameInteraction) => Promise<void>;
  protected isConnectedFlag: boolean = false;

  constructor() {
    super();
    this.database = Database.getInstance();
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendMessage(channelId: string, message: UIMessage): Promise<string>;
  abstract editMessage(channelId: string, messageId: string, message: UIMessage): Promise<void>;
  abstract deleteMessage(channelId: string, messageId: string): Promise<void>;
  abstract getChannelName(channelId: string): string;
  abstract isPrivateChannel(channelId: string): boolean;

  isConnected(): boolean {
    return this.isConnectedFlag;
  }

  onInteraction(handler: (interaction: GameInteraction) => Promise<void>): void {
    this.interactionHandler = handler;
  }

  onCommand(command: string, handler: (context: CommandContext) => Promise<void>): void {
    this.commandHandlers.set(command.toLowerCase(), handler);
    logger.debug(`Registered command: ${command} for ${this.platform}`);
  }

  async getPlayer(userId: string): Promise<Player | null> {
    // First, try to get from database
    let player = await this.database.getPlayer(userId);
    
    if (!player) {
      // Create new player if not exists
      player = await this.createPlayer(userId);
    }
    
    return player;
  }

  async updatePlayerActivity(userId: string): Promise<void> {
    await this.database.updatePlayerActivity(userId);
  }

  protected abstract createPlayer(userId: string): Promise<Player | null>;

  protected async handleCommand(
    command: string,
    args: string[],
    context: Omit<CommandContext, 'command' | 'args'>
  ): Promise<void> {
    const handler = this.commandHandlers.get(command.toLowerCase());
    
    if (!handler) {
      // Command not handled by game engine
      return;
    }
    
    const fullContext: CommandContext = {
      ...context,
      command,
      args,
    };
    
    try {
      await handler(fullContext);
    } catch (error) {
      logger.error(`Error handling command ${command}:`, error);
      await context.reply({
        content: '❌ An error occurred while processing your command.',
      });
    }
  }

  protected async handleInteraction(interaction: GameInteraction): Promise<void> {
    if (!this.interactionHandler) {
      logger.warn('No interaction handler registered');
      return;
    }
    
    try {
      await this.interactionHandler(interaction);
    } catch (error) {
      logger.error('Error handling interaction:', error);
    }
  }

  protected emitPlatformEvent(event: PlatformEvent): void {
    this.emit('platformEvent', event);
  }

  // Helper method to parse command from message
  protected parseCommand(message: string): { command: string; args: string[] } | null {
    if (!message.startsWith('/')) {
      return null;
    }
    
    const parts = message.slice(1).split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    
    return { command, args };
  }

  // Helper method to format user mention
  protected abstract formatUserMention(userId: string): string;

  // Helper method to create reply function
  protected createReplyFunction(
    sendMessage: (message: UIMessage) => Promise<string>
  ): (message: UIMessage) => Promise<string> {
    return async (message: UIMessage) => {
      try {
        return await sendMessage(message);
      } catch (error) {
        logger.error('Error sending reply:', error);
        throw error;
      }
    };
  }

  // Helper method to create react function
  protected createReactFunction(
    addReaction: (emoji: string) => Promise<void>
  ): (emoji: string) => Promise<void> {
    return async (emoji: string) => {
      try {
        await addReaction(emoji);
      } catch (error) {
        logger.error('Error adding reaction:', error);
        throw error;
      }
    };
  }
}