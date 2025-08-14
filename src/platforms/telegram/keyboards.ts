import { UIComponent } from '../../types';
import { TelegramInlineKeyboard, TelegramInlineButton } from '../../types/platform.types';

export function buildInlineKeyboard(components: UIComponent[]): TelegramInlineKeyboard {
  const keyboard: TelegramInlineButton[][] = [];
  let currentRow: TelegramInlineButton[] = [];
  
  for (const component of components) {
    if (component.type === 'button') {
      const callbackData: any = {
        id: component.id,
        type: 'button',
      };
      
      // Include additional data if provided
      if (component.data) {
        Object.assign(callbackData, component.data);
      }
      
      const button: TelegramInlineButton = {
        text: component.label || 'Button',
        callback_data: JSON.stringify(callbackData),
      };
      
      // Add emoji if provided
      if (component.emoji) {
        button.text = `${component.emoji} ${button.text}`;
      }
      
      currentRow.push(button);
      
      // Telegram allows max 8 buttons per row, but 3-4 looks better
      if (currentRow.length >= 3) {
        keyboard.push(currentRow);
        currentRow = [];
      }
    }
  }
  
  // Add remaining buttons
  if (currentRow.length > 0) {
    keyboard.push(currentRow);
  }
  
  return {
    inline_keyboard: keyboard,
  };
}

export function parseCallbackData(data: string): any {
  try {
    return JSON.parse(data);
  } catch {
    // Fallback for simple string data
    return { id: data };
  }
}

// Helper to create a grid keyboard (e.g., for Tic Tac Toe)
export function createGridKeyboard(
  rows: number,
  cols: number,
  cellData: (row: number, col: number) => { text: string; id: string; disabled?: boolean }
): TelegramInlineKeyboard {
  const keyboard: TelegramInlineButton[][] = [];
  
  for (let row = 0; row < rows; row++) {
    const keyboardRow: TelegramInlineButton[] = [];
    
    for (let col = 0; col < cols; col++) {
      const cell = cellData(row, col);
      
      const button: TelegramInlineButton = {
        text: cell.text,
        callback_data: JSON.stringify({
          id: cell.id,
          row,
          col,
        }),
      };
      
      keyboardRow.push(button);
    }
    
    keyboard.push(keyboardRow);
  }
  
  return {
    inline_keyboard: keyboard,
  };
}

// Helper to create a menu keyboard
export function createMenuKeyboard(
  options: Array<{ label: string; value: string; emoji?: string }>
): TelegramInlineKeyboard {
  const keyboard: TelegramInlineButton[][] = [];
  
  for (const option of options) {
    const button: TelegramInlineButton = {
      text: option.emoji ? `${option.emoji} ${option.label}` : option.label,
      callback_data: JSON.stringify({
        id: option.value,
        type: 'menu',
      }),
    };
    
    keyboard.push([button]); // One option per row for menus
  }
  
  return {
    inline_keyboard: keyboard,
  };
}

// Helper to create pagination keyboard
export function createPaginationKeyboard(
  currentPage: number,
  totalPages: number,
  baseId: string
): TelegramInlineKeyboard {
  const buttons: TelegramInlineButton[] = [];
  
  // Previous button
  if (currentPage > 1) {
    buttons.push({
      text: '◀️ Previous',
      callback_data: JSON.stringify({
        id: `${baseId}_prev`,
        page: currentPage - 1,
      }),
    });
  }
  
  // Page indicator
  buttons.push({
    text: `${currentPage}/${totalPages}`,
    callback_data: JSON.stringify({
      id: `${baseId}_page`,
      page: currentPage,
    }),
  });
  
  // Next button
  if (currentPage < totalPages) {
    buttons.push({
      text: 'Next ▶️',
      callback_data: JSON.stringify({
        id: `${baseId}_next`,
        page: currentPage + 1,
      }),
    });
  }
  
  return {
    inline_keyboard: [buttons],
  };
}

// Helper to create yes/no confirmation keyboard
export function createConfirmationKeyboard(
  confirmId: string,
  cancelId: string
): TelegramInlineKeyboard {
  return {
    inline_keyboard: [[
      {
        text: '✅ Yes',
        callback_data: JSON.stringify({
          id: confirmId,
          type: 'confirm',
          value: true,
        }),
      },
      {
        text: '❌ No',
        callback_data: JSON.stringify({
          id: cancelId,
          type: 'confirm',
          value: false,
        }),
      },
    ]],
  };
}