import { 
  Client, 
  GatewayIntentBits, 
  TextChannel, 
  Message,
  Interaction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  CommandInteraction,
  MessageCreateOptions,
  MessageEditOptions,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonStyle,
  Partials
} from 'discord.js';
import { PlatformAdapter } from '../common/PlatformAdapter';
import { 
  Platform, 
  Player, 
  UIMessage,
  GameInteraction 
} from '../../types';
import { 
  CommandContext,
  DiscordContext,
} from '../../types/platform.types';
import { platformConfig } from '../../config';
import { logger, logPlatformEvent } from '../../utils/logger';
import { buildMessageOptions, buildEditOptions } from './embeds';

export class DiscordAdapter extends PlatformAdapter {
  platform = Platform.Discord;
  private client: Client;
  private guildId: string;

  constructor() {
    super();
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
      partials: [Partials.Message, Partials.Channel],
    });
    this.guildId = platformConfig.discord.guildId;
    
    this.setupEventHandlers();
  }

  async connect(): Promise<void> {
    try {
      await this.client.login(platformConfig.discord.botToken);
      // Connection success is handled in the 'ready' event
    } catch (error) {
      logger.error('Failed to connect to Discord:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.destroy();
    this.isConnectedFlag = false;
    logPlatformEvent('discord', 'disconnected');
  }

  async sendMessage(channelId: string, message: UIMessage): Promise<string> {
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Discord channel ${channelId} not found or not text-based`);
    }
    
    const messageOptions = buildMessageOptions(message);
    
    try {
      const sentMessage = await (channel as TextChannel).send(messageOptions);
      return sentMessage.id;
    } catch (error) {
      logger.error('Error sending Discord message:', error);
      throw error;
    }
  }

  async editMessage(channelId: string, messageId: string, message: UIMessage): Promise<void> {
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Discord channel ${channelId} not found or not text-based`);
    }
    
    try {
      const messageToEdit = await (channel as TextChannel).messages.fetch(messageId);
      const editOptions = buildEditOptions(message);
      await messageToEdit.edit(editOptions);
    } catch (error) {
      logger.error('Error editing Discord message:', error);
      throw error;
    }
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Discord channel ${channelId} not found or not text-based`);
    }
    
    try {
      const messageToDelete = await (channel as TextChannel).messages.fetch(messageId);
      await messageToDelete.delete();
    } catch (error) {
      logger.error('Error deleting Discord message:', error);
      throw error;
    }
  }

  getChannelName(channelId: string): string {
    const channel = this.client.channels.cache.get(channelId);
    if (channel && 'name' in channel) {
      return `#${channel.name}`;
    }
    return `Channel ${channelId}`;
  }

  isPrivateChannel(channelId: string): boolean {
    const channel = this.client.channels.cache.get(channelId);
    return channel?.type === 1; // DM channel
  }

  protected async createPlayer(userId: string): Promise<Player | null> {
    try {
      const guild = this.client.guilds.cache.get(this.guildId);
      if (!guild) {
        throw new Error('Guild not found');
      }
      
      const member = await guild.members.fetch(userId);
      const user = member.user;
      
      const player: Player = {
        id: userId,
        platform: Platform.Discord,
        platformId: userId,
        username: user.username,
        displayName: member.displayName || user.username,
        avatar: user.avatarURL() || undefined,
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
      logger.error('Error creating Discord player:', error);
      return null;
    }
  }

  private setupEventHandlers(): void {
    // Bot ready event
    this.client.on('ready', () => {
      logger.info(`Discord bot logged in as ${this.client.user?.tag}`);
      this.isConnectedFlag = true;
      logPlatformEvent('discord', 'connected');
      
      // Register slash commands
      this.registerSlashCommands();
    });
    
    // Message create event (for traditional commands)
    this.client.on('messageCreate', async (message: Message) => {
      // Ignore bot messages
      if (message.author.bot) {
        return;
      }
      
      // Only process messages from the configured guild
      if (message.guild?.id !== this.guildId) {
        return;
      }
      
      const text = message.content;
      if (!text) {
        return;
      }
      
      // Parse command
      const parsed = this.parseCommand(text);
      if (!parsed) {
        return;
      }
      
      // Create context
      const context: DiscordContext = {
        platform: Platform.Discord,
        command: parsed.command,
        args: parsed.args,
        userId: message.author.id,
        channelId: message.channel.id,
        messageId: message.id,
        guildId: message.guild.id,
        member: {
          id: message.author.id,
          displayName: message.member?.displayName || message.author.username,
          avatar: message.author.avatarURL() || undefined,
          roles: message.member?.roles.cache.map(r => r.id) || [],
        },
        reply: this.createReplyFunction(async (msg) => {
          return this.sendMessage(message.channel.id, msg);
        }),
        react: this.createReactFunction(async (emoji) => {
          await message.react(emoji);
        }),
      };
      
      // Update player activity
      await this.updatePlayerActivity(message.author.id);
      
      // Handle command
      await this.handleCommand(parsed.command, parsed.args, context);
    });
    
    // Interaction create event (for buttons, select menus, slash commands)
    this.client.on('interactionCreate', async (interaction: Interaction) => {
      // Update player activity
      await this.updatePlayerActivity(interaction.user.id);
      
      if (interaction.isCommand()) {
        await this.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await this.handleSelectMenuInteraction(interaction);
      }
    });
    
    // Error event
    this.client.on('error', (error: Error) => {
      logger.error('Discord client error:', error);
    });
  }

  private async registerSlashCommands(): Promise<void> {
    // TODO: Implement slash command registration
    // This would typically be done once when the bot starts
    // or through a separate deployment script
  }

  private async handleSlashCommand(interaction: CommandInteraction): Promise<void> {
    const context: DiscordContext = {
      platform: Platform.Discord,
      command: interaction.commandName,
      args: [], // Parse from interaction.options
      userId: interaction.user.id,
      channelId: interaction.channelId,
      messageId: interaction.id,
      guildId: interaction.guildId || '',
      member: {
        id: interaction.user.id,
        displayName: interaction.member?.user.username || interaction.user.username,
        avatar: interaction.user.avatarURL() || undefined,
        roles: [], // TODO: Get roles from member
      },
      interaction: {
        type: 'slash_command',
      },
      reply: this.createReplyFunction(async (msg) => {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: msg.content,
            ephemeral: msg.ephemeral,
          });
          return interaction.id;
        } else {
          await interaction.reply({
            content: msg.content,
            ephemeral: msg.ephemeral,
          });
          return interaction.id;
        }
      }),
      react: this.createReactFunction(async (emoji) => {
        // Can't react to interactions
      }),
    };
    
    await this.handleCommand(interaction.commandName, [], context);
  }

  private async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    // Parse custom ID to get game session info
    const data = JSON.parse(interaction.customId);
    
    const gameInteraction: GameInteraction = {
      id: interaction.id,
      type: 'button_click',
      platform: Platform.Discord,
      userId: interaction.user.id,
      gameSessionId: data.sessionId || '',
      data: data,
      timestamp: new Date(),
    };
    
    // Acknowledge the interaction
    await interaction.deferUpdate();
    
    // Handle the game interaction
    await this.handleInteraction(gameInteraction);
  }

  private async handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
    // Parse custom ID to get game session info
    const data = JSON.parse(interaction.customId);
    
    const gameInteraction: GameInteraction = {
      id: interaction.id,
      type: 'select_option',
      platform: Platform.Discord,
      userId: interaction.user.id,
      gameSessionId: data.sessionId || '',
      data: {
        ...data,
        values: interaction.values,
      },
      timestamp: new Date(),
    };
    
    // Acknowledge the interaction
    await interaction.deferUpdate();
    
    // Handle the game interaction
    await this.handleInteraction(gameInteraction);
  }

  protected formatUserMention(userId: string): string {
    return `<@${userId}>`;
  }
}