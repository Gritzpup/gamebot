import { CommandContext } from '../../types/platform.types';
import { CrossPlatformRelayService } from '../../relay/CrossPlatformRelayService';
import { logger } from '../../utils/logger';

export class LinkChannelsCommand {
  private relayService: CrossPlatformRelayService;
  
  constructor() {
    this.relayService = CrossPlatformRelayService.getInstance();
  }
  
  async execute(ctx: CommandContext): Promise<void> {
    // Check if user has admin permissions
    if (!ctx.isAdmin) {
      await ctx.reply({
        content: '❌ This command requires administrator permissions.',
      });
      return;
    }
    
    // Parse arguments
    if (ctx.args.length < 2) {
      await ctx.reply({
        content: '**Usage:** `/link <discord_channel_id> <telegram_channel_id>`\n\n' +
                 'Example: `/link 123456789 -1001234567890`\n\n' +
                 'To get channel IDs:\n' +
                 '• Discord: Right-click channel → Copy ID\n' +
                 '• Telegram: Use `/get-telegram-id` in the target channel',
      });
      return;
    }
    
    const discordChannelId = ctx.args[0];
    const telegramChannelId = ctx.args[1];
    
    try {
      // Link the channels
      await this.relayService.linkChannels(
        discordChannelId,
        telegramChannelId,
        ctx.userId
      );
      
      await ctx.reply({
        content: '✅ Channels successfully linked!\n\n' +
                 `Discord: <#${discordChannelId}>\n` +
                 `Telegram: ${telegramChannelId}\n\n` +
                 'Cross-platform games will now be relayed between these channels.',
      });
      
      logger.info(`Channels linked by ${ctx.userId}: Discord ${discordChannelId} ↔ Telegram ${telegramChannelId}`);
      
    } catch (error: any) {
      await ctx.reply({
        content: `❌ Failed to link channels: ${error.message}`,
      });
    }
  }
}

export class UnlinkChannelsCommand {
  private relayService: CrossPlatformRelayService;
  
  constructor() {
    this.relayService = CrossPlatformRelayService.getInstance();
  }
  
  async execute(ctx: CommandContext): Promise<void> {
    // Check if user has admin permissions
    if (!ctx.isAdmin) {
      await ctx.reply({
        content: '❌ This command requires administrator permissions.',
      });
      return;
    }
    
    // Get current channel's linked channels
    const linkedChannels = await this.relayService.getLinkedChannels(
      ctx.platform,
      ctx.channelId
    );
    
    if (linkedChannels.length === 0) {
      await ctx.reply({
        content: '❌ This channel is not linked to any other channels.',
      });
      return;
    }
    
    try {
      // Unlink all channels from current channel
      for (const linked of linkedChannels) {
        if (ctx.platform === 'discord') {
          await this.relayService.unlinkChannels(ctx.channelId, linked.telegram_channel_id);
        } else {
          await this.relayService.unlinkChannels(linked.discord_channel_id, ctx.channelId);
        }
      }
      
      await ctx.reply({
        content: '✅ Channel successfully unlinked from all connected channels.',
      });
      
      logger.info(`Channels unlinked by ${ctx.userId} for channel ${ctx.channelId}`);
      
    } catch (error: any) {
      await ctx.reply({
        content: `❌ Failed to unlink channels: ${error.message}`,
      });
    }
  }
}

export class ListLinksCommand {
  private relayService: CrossPlatformRelayService;
  
  constructor() {
    this.relayService = CrossPlatformRelayService.getInstance();
  }
  
  async execute(ctx: CommandContext): Promise<void> {
    // Check if user has admin permissions
    if (!ctx.isAdmin) {
      await ctx.reply({
        content: '❌ This command requires administrator permissions.',
      });
      return;
    }
    
    try {
      const allLinks = await this.relayService.getAllChannelMappings();
      
      if (allLinks.length === 0) {
        await ctx.reply({
          content: 'No channel links configured.',
        });
        return;
      }
      
      let message = '**📡 Channel Links**\n\n';
      
      for (const link of allLinks) {
        message += `• Discord: <#${link.discord_channel_id}> ↔ Telegram: \`${link.telegram_channel_id}\`\n`;
        message += `  Type: ${link.mapping_type} | Active: ${link.is_active ? '✅' : '❌'}\n\n`;
      }
      
      await ctx.reply({ content: message });
      
    } catch (error: any) {
      await ctx.reply({
        content: `❌ Failed to list links: ${error.message}`,
      });
    }
  }
}