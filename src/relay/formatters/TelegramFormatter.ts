import { PlatformFormatter } from '../types';
import { Platform } from '../../types';

export class TelegramFormatter implements PlatformFormatter {
  formatContent(content: string, sourcePlatform: Platform): string {
    if (sourcePlatform === Platform.Telegram) {
      return content; // No transformation needed
    }
    
    // Convert from Discord format to Telegram format
    let formatted = content;
    
    // Discord uses markdown, but we need to be careful with the conversion
    // since Telegram's formatContent will handle the markdown to HTML conversion
    
    // Convert Discord user mentions to a readable format
    formatted = formatted.replace(/<@!?(\d+)>/g, '@User');
    
    // Convert Discord channel mentions
    formatted = formatted.replace(/<#(\d+)>/g, '#channel');
    
    // Convert Discord role mentions
    formatted = formatted.replace(/<@&(\d+)>/g, '@role');
    
    // Discord custom emojis (just show the name)
    formatted = formatted.replace(/<a?:(\w+):\d+>/g, ':$1:');
    
    return formatted;
  }

  transformComponents(components: any[], sourcePlatform: Platform): any[] {
    if (!components || components.length === 0) return [];
    
    // Transform Discord buttons to Telegram inline keyboards
    if (sourcePlatform === Platform.Discord) {
      // Group buttons into rows (Telegram prefers max 3 buttons per row)
      const rows: any[][] = [];
      let currentRow: any[] = [];
      
      components.forEach((component, index) => {
        if (component.type === 2) { // Discord button
          const button = {
            type: 'button',
            id: this.extractButtonId(component.custom_id),
            label: component.label || 'Button',
            style: this.mapButtonStyle(component.style),
            disabled: component.disabled || false
          };
          
          currentRow.push(button);
          
          // Start new row after 3 buttons
          if (currentRow.length >= 3 || index === components.length - 1) {
            rows.push([...currentRow]);
            currentRow = [];
          }
        }
      });
      
      // Flatten rows back to single array for Telegram
      return rows.flat();
    }
    
    return components;
  }

  formatUserMention(userId: string, username: string): string {
    return `[${username}](tg://user?id=${userId})`;
  }

  formatGameBoard(board: string): string {
    // Ensure game boards maintain their formatting
    return board;
  }

  private extractButtonId(customId: string): string {
    try {
      const data = JSON.parse(customId);
      return data.id || customId;
    } catch {
      return customId;
    }
  }

  private mapButtonStyle(style: number): string {
    const styleMap: Record<number, string> = {
      1: 'primary',    // Blurple -> Primary
      2: 'secondary',  // Grey -> Secondary
      3: 'success',    // Green -> Success
      4: 'danger',     // Red -> Danger
      5: 'primary'     // Link -> Primary (Telegram doesn't have link style)
    };
    return styleMap[style] || 'secondary';
  }
}