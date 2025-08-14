import { PlatformFormatter } from '../types';
import { Platform } from '../../types';

export class DiscordFormatter implements PlatformFormatter {
  formatContent(content: string, sourcePlatform: Platform): string {
    if (sourcePlatform === Platform.Discord) {
      return content; // No transformation needed
    }
    
    // Convert from Telegram format to Discord format
    let formatted = content;
    
    // Convert HTML to Markdown (from Telegram)
    formatted = formatted
      .replace(/<b>(.*?)<\/b>/g, '**$1**')
      .replace(/<i>(.*?)<\/i>/g, '*$1*')
      .replace(/<u>(.*?)<\/u>/g, '__$1__')
      .replace(/<code>(.*?)<\/code>/g, '`$1`')
      .replace(/<pre>(.*?)<\/pre>/gs, '```\n$1\n```')
      .replace(/<a href="(.*?)">(.*?)<\/a>/g, '[$2]($1)');
    
    // Handle user mentions - convert Telegram format to Discord
    formatted = formatted.replace(/\[User\]\(tg:\/\/user\?id=(\d+)\)/g, '<@$1>');
    
    return formatted;
  }

  transformComponents(components: any[], sourcePlatform: Platform): any[] {
    if (!components || components.length === 0) return [];
    
    // Transform Telegram inline keyboards to Discord buttons
    if (sourcePlatform === Platform.Telegram) {
      return components.map(component => {
        if (component.type === 'button') {
          return {
            type: 2, // Discord button type
            style: this.mapButtonStyle(component.style),
            label: component.label,
            custom_id: JSON.stringify({
              id: component.id,
              sessionId: component.sessionId || ''
            }),
            disabled: component.disabled || false
          };
        }
        return component;
      });
    }
    
    return components;
  }

  formatUserMention(userId: string, username: string): string {
    return `<@${userId}>`;
  }

  formatGameBoard(board: string): string {
    // Ensure game boards are properly formatted for Discord
    if (board.includes('```')) {
      return board; // Already formatted
    }
    return '```\n' + board + '\n```';
  }

  private mapButtonStyle(style: string): number {
    const styleMap: Record<string, number> = {
      'primary': 1,    // Blurple
      'secondary': 2,  // Grey
      'success': 3,    // Green
      'danger': 4,     // Red
      'link': 5        // Link button
    };
    return styleMap[style] || 2; // Default to grey
  }
}