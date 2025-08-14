import { Platform, UIMessage, GameInteraction, Player } from './index';

// Platform adapter interface
export interface IPlatformAdapter {
  platform: Platform;
  
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // Message handling
  sendMessage(channelId: string, message: UIMessage): Promise<string>;
  editMessage(channelId: string, messageId: string, message: UIMessage): Promise<void>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  
  // Interaction handling
  onInteraction(handler: (interaction: GameInteraction) => Promise<void>): void;
  onCommand(command: string, handler: (context: CommandContext) => Promise<void>): void;
  
  // Player management
  getPlayer(userId: string): Promise<Player | null>;
  updatePlayerActivity(userId: string): Promise<void>;
  
  // Channel management
  getChannelName(channelId: string): string;
  isPrivateChannel(channelId: string): boolean;
}

// Command context
export interface CommandContext {
  platform: Platform;
  command: string;
  args: string[];
  userId: string;
  channelId: string;
  messageId: string;
  player?: Player;
  reply: (message: UIMessage) => Promise<string>;
  react: (emoji: string) => Promise<void>;
}

// Platform-specific event types
export interface PlatformEvent {
  type: 'message' | 'interaction' | 'member_join' | 'member_leave';
  platform: Platform;
  data: any;
  timestamp: Date;
}

// Telegram-specific types
export interface TelegramContext extends CommandContext {
  chatId: number;
  messageThreadId?: number;
  from: {
    id: number;
    firstName: string;
    lastName?: string;
    username?: string;
  };
}

export interface TelegramInlineKeyboard {
  inline_keyboard: TelegramInlineButton[][];
}

export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
  switch_inline_query?: string;
  switch_inline_query_current_chat?: string;
}

// Discord-specific types
export interface DiscordContext extends CommandContext {
  guildId: string;
  member: {
    id: string;
    displayName: string;
    avatar?: string;
    roles: string[];
  };
  interaction?: {
    type: 'slash_command' | 'button' | 'select_menu';
    customId?: string;
    values?: string[];
  };
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
    icon_url?: string;
  };
  thumbnail?: {
    url: string;
  };
  image?: {
    url: string;
  };
  timestamp?: string;
}

export interface DiscordActionRow {
  type: 1; // ACTION_ROW
  components: DiscordComponent[];
}

export type DiscordComponent = DiscordButton | DiscordSelectMenu;

export interface DiscordButton {
  type: 2; // BUTTON
  custom_id?: string;
  label: string;
  style: 1 | 2 | 3 | 4 | 5; // PRIMARY, SECONDARY, SUCCESS, DANGER, LINK
  emoji?: {
    name?: string;
    id?: string;
  };
  url?: string;
  disabled?: boolean;
}

export interface DiscordSelectMenu {
  type: 3; // SELECT_MENU
  custom_id: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  options: DiscordSelectOption[];
  disabled?: boolean;
}

export interface DiscordSelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: {
    name?: string;
    id?: string;
  };
  default?: boolean;
}

// Platform notification types
export interface PlatformNotification {
  platform: Platform;
  type: 'game_invite' | 'turn_reminder' | 'game_end' | 'achievement' | 'tournament';
  userId: string;
  data: any;
}