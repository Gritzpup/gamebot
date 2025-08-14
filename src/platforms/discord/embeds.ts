import {
  MessageCreateOptions,
  MessageEditOptions,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonStyle,
  APIActionRowComponent,
} from 'discord.js';
import { UIMessage, UIComponent } from '../../types';

export function buildMessageOptions(message: UIMessage): MessageCreateOptions {
  const options: MessageCreateOptions = {
    content: message.content || undefined,
  };
  
  // Build embed if provided
  if (message.embed) {
    const embed = new EmbedBuilder();
    
    if (message.embed.title) {
      embed.setTitle(message.embed.title);
    }
    if (message.embed.description) {
      embed.setDescription(message.embed.description);
    }
    if (message.embed.color) {
      embed.setColor(message.embed.color);
    }
    if (message.embed.footer) {
      embed.setFooter({ text: message.embed.footer });
    }
    if (message.embed.thumbnail) {
      embed.setThumbnail(message.embed.thumbnail);
    }
    if (message.embed.image) {
      embed.setImage(message.embed.image);
    }
    if (message.embed.fields) {
      embed.addFields(message.embed.fields);
    }
    
    options.embeds = [embed];
  }
  
  // Build components (buttons, select menus)
  if (message.components && message.components.length > 0) {
    options.components = buildActionRows(message.components);
  }
  
  return options;
}

export function buildEditOptions(message: UIMessage): MessageEditOptions {
  const options: MessageEditOptions = {
    content: message.content || undefined,
  };
  
  // Build embed if provided
  if (message.embed) {
    const embed = new EmbedBuilder();
    
    if (message.embed.title) {
      embed.setTitle(message.embed.title);
    }
    if (message.embed.description) {
      embed.setDescription(message.embed.description);
    }
    if (message.embed.color) {
      embed.setColor(message.embed.color);
    }
    if (message.embed.footer) {
      embed.setFooter({ text: message.embed.footer });
    }
    if (message.embed.thumbnail) {
      embed.setThumbnail(message.embed.thumbnail);
    }
    if (message.embed.image) {
      embed.setImage(message.embed.image);
    }
    if (message.embed.fields) {
      embed.addFields(message.embed.fields);
    }
    
    options.embeds = [embed];
  }
  
  // Build components (buttons, select menus)
  if (message.components && message.components.length > 0) {
    options.components = buildActionRows(message.components);
  }
  
  return options;
}

function buildActionRows(components: UIComponent[]): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();
  let buttonCount = 0;
  
  for (const component of components) {
    if (component.type === 'button') {
      const button = new ButtonBuilder()
        .setCustomId(JSON.stringify({ id: component.id }))
        .setLabel(component.label || 'Button')
        .setDisabled(component.disabled || false);
      
      // Set button style
      switch (component.style) {
        case 'primary':
          button.setStyle(ButtonStyle.Primary);
          break;
        case 'secondary':
          button.setStyle(ButtonStyle.Secondary);
          break;
        case 'success':
          button.setStyle(ButtonStyle.Success);
          break;
        case 'danger':
          button.setStyle(ButtonStyle.Danger);
          break;
        default:
          button.setStyle(ButtonStyle.Secondary);
      }
      
      // Add emoji if provided
      if (component.emoji) {
        button.setEmoji(component.emoji);
      }
      
      currentRow.addComponents(button);
      buttonCount++;
      
      // Discord allows max 5 buttons per row
      if (buttonCount >= 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
        buttonCount = 0;
      }
    } else if (component.type === 'select' && component.options) {
      // Finish current button row if any
      if (buttonCount > 0) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
        buttonCount = 0;
      }
      
      // Create select menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(JSON.stringify({ id: component.id }))
        .setPlaceholder(component.label || 'Select an option')
        .setDisabled(component.disabled || false);
      
      // Add options
      for (const option of component.options) {
        const menuOption: any = {
          label: option.label,
          value: option.value,
        };
        
        if (option.description) {
          menuOption.description = option.description;
        }
        if (option.emoji) {
          menuOption.emoji = option.emoji;
        }
        
        selectMenu.addOptions(menuOption);
      }
      
      const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      rows.push(selectRow);
    }
  }
  
  // Add remaining buttons
  if (buttonCount > 0) {
    rows.push(currentRow);
  }
  
  // Discord allows max 5 action rows
  return rows.slice(0, 5);
}

// Helper to create a grid of buttons (e.g., for Tic Tac Toe)
export function createGridButtons(
  rows: number,
  cols: number,
  sessionId: string,
  cellData: (row: number, col: number) => { label: string; style?: ButtonStyle; disabled?: boolean }
): ActionRowBuilder<ButtonBuilder>[] {
  const actionRows: ActionRowBuilder<ButtonBuilder>[] = [];
  
  for (let row = 0; row < rows; row++) {
    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    
    for (let col = 0; col < cols; col++) {
      const cell = cellData(row, col);
      
      const button = new ButtonBuilder()
        .setCustomId(JSON.stringify({
          sessionId,
          row,
          col,
        }))
        .setLabel(cell.label)
        .setStyle(cell.style || ButtonStyle.Secondary)
        .setDisabled(cell.disabled || false);
      
      actionRow.addComponents(button);
    }
    
    actionRows.push(actionRow);
  }
  
  return actionRows;
}

// Helper to create a game status embed
export function createGameEmbed(
  title: string,
  description: string,
  fields?: Array<{ name: string; value: string; inline?: boolean }>,
  color?: number,
  footer?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color || 0x0099FF)
    .setTimestamp();
  
  if (fields) {
    embed.addFields(fields);
  }
  
  if (footer) {
    embed.setFooter({ text: footer });
  }
  
  return embed;
}

// Helper to create a leaderboard embed
export function createLeaderboardEmbed(
  gameType: string,
  entries: Array<{ rank: number; name: string; score: number }>,
  period: string = 'All Time'
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${gameType} Leaderboard`)
    .setDescription(`Top players for ${period}`)
    .setColor(0xFFD700) // Gold color
    .setTimestamp();
  
  const leaderboardText = entries
    .map(entry => {
      const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `**${entry.rank}.**`;
      return `${medal} ${entry.name} - ${entry.score} points`;
    })
    .join('\n');
  
  embed.addFields([
    {
      name: 'Rankings',
      value: leaderboardText || 'No entries yet',
    }
  ]);
  
  return embed;
}

// Helper to create player stats embed
export function createStatsEmbed(
  player: { username: string; avatar?: string },
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    gamesDraw: number;
    winRate: number;
    winStreak: number;
    bestWinStreak: number;
  }
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${player.username}'s Statistics`)
    .setColor(0x00AE86)
    .setTimestamp();
  
  if (player.avatar) {
    embed.setThumbnail(player.avatar);
  }
  
  embed.addFields([
    {
      name: 'Games Played',
      value: stats.gamesPlayed.toString(),
      inline: true,
    },
    {
      name: 'Wins',
      value: stats.gamesWon.toString(),
      inline: true,
    },
    {
      name: 'Losses',
      value: stats.gamesLost.toString(),
      inline: true,
    },
    {
      name: 'Draws',
      value: stats.gamesDraw.toString(),
      inline: true,
    },
    {
      name: 'Win Rate',
      value: `${stats.winRate.toFixed(1)}%`,
      inline: true,
    },
    {
      name: 'Current Streak',
      value: stats.winStreak.toString(),
      inline: true,
    },
    {
      name: 'Best Win Streak',
      value: stats.bestWinStreak.toString(),
      inline: true,
    },
  ]);
  
  return embed;
}