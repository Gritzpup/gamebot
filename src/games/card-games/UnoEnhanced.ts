import { Uno } from './Uno';
import { EnhancedTelegramAdapter } from '../../platforms/telegram/EnhancedTelegramAdapter';
import { Platform, UIMessage, GameInteraction, UIComponent } from '../../types';
import { MoveResult } from '../../types/game.types';
import { logger } from '../../utils/logger';

interface EnhancedUnoState {
  lastQuickView: Map<string, number>;
  privateMessagesSent: Set<string>;
  lastMessageId?: string;
  publicGameMessage?: string;
}

export class UnoEnhanced extends Uno {
  id = 'uno';
  name = 'UNO';
  description = 'The classic card game of matching colors and numbers!';
  
  private enhancedState: EnhancedUnoState = {
    lastQuickView: new Map(),
    privateMessagesSent: new Set(),
  };
  
  async initialize(session: any): Promise<void> {
    await super.initialize(session);
    
    // Initialize enhanced adapter if on Telegram
    if (session.platform === Platform.Telegram && session.adapter instanceof EnhancedTelegramAdapter) {
      await session.adapter.initialize();
      logger.info('[UNO] MTProto features initialized');
    }
  }
  
  async renderState(forPlayer?: string): Promise<UIMessage> {
    // Get base render from parent
    const baseMessage = await super.renderState(forPlayer);
    
    // Check if we're on enhanced Telegram
    const isEnhanced = this.session?.platform === Platform.Telegram && 
                      this.session.adapter instanceof EnhancedTelegramAdapter &&
                      this.session.adapter.isMTProtoAvailable();
    
    if (!isEnhanced || this.state.gameState !== 'playing') {
      return baseMessage;
    }
    
    // Store public game message for quick view revert
    if (!forPlayer) {
      this.enhancedState.publicGameMessage = baseMessage.content;
    }
    
    // Enhance components for playing state
    const components: UIComponent[] = baseMessage.components || [];
    const viewingPlayer = this.state.players.find(p => p.playerId === forPlayer);
    
    if (viewingPlayer && !viewingPlayer.leftGame) {
      // Add enhanced view buttons
      const enhancedButtons: UIComponent[] = [
        { 
          type: 'button', 
          id: 'view_cards_quick', 
          label: '👁️ Quick Peek (3s)', 
          style: 'secondary' 
        },
        { 
          type: 'button', 
          id: 'view_cards_private', 
          label: '📱 Private View', 
          style: 'primary' 
        },
      ];
      
      // Insert enhanced buttons at the beginning
      components.unshift(...enhancedButtons);
      
      // Remove hand display from public message if we can send privately
      if (!forPlayer && this.enhancedState.privateMessagesSent.has(viewingPlayer.playerId)) {
        // Remove the hand section from content
        let content = baseMessage.content;
        const handIndex = content.indexOf('📋 Your Hand');
        if (handIndex > -1) {
          content = content.substring(0, handIndex) + '\`\`\`';
          baseMessage.content = content;
        }
      }
    }
    
    return { ...baseMessage, components };
  }
  
  async handleInteraction(interaction: GameInteraction): Promise<MoveResult> {
    const adapter = this.session?.adapter as EnhancedTelegramAdapter;
    
    // Handle enhanced interactions
    if (interaction.buttonId === 'view_cards_quick') {
      await this.handleQuickView(interaction.playerId);
      return { 
        success: true, 
        message: '👁️ Showing your cards...',
        continue: true 
      };
    }
    
    if (interaction.buttonId === 'view_cards_private') {
      await this.handlePrivateView(interaction.playerId);
      return { 
        success: true, 
        message: '📱 Check your private messages!',
        continue: true 
      };
    }
    
    // Pass other interactions to parent
    return super.handleInteraction(interaction);
  }
  
  private async handleQuickView(userId: string): Promise<void> {
    const adapter = this.session?.adapter as EnhancedTelegramAdapter;
    if (!adapter || !adapter.isMTProtoAvailable()) return;
    
    // Rate limit quick views (once per 5 seconds)
    const lastView = this.enhancedState.lastQuickView.get(userId) || 0;
    if (Date.now() - lastView < 5000) {
      await adapter.flashNotification(
        this.session!.channelId,
        '⏱️ Please wait before viewing cards again'
      );
      return;
    }
    
    const player = this.state.players.find(p => p.playerId === userId);
    if (!player || player.leftGame) return;
    
    // Get the last message ID from session
    const lastMessageId = this.session?.lastMessageId;
    if (!lastMessageId) return;
    
    // Create card display
    const cards: string[] = [];
    const cardsByColor: Record<string, any[]> = {};
    
    for (const card of player.cards) {
      const key = card.color;
      if (!cardsByColor[key]) cardsByColor[key] = [];
      cardsByColor[key].push(card);
    }
    
    const colorOrder = ['red', 'yellow', 'green', 'blue', 'wild'];
    for (const color of colorOrder) {
      const colorCards = cardsByColor[color];
      if (colorCards) {
        colorCards.sort((a, b) => {
          if (a.type === 'number' && b.type === 'number') {
            return (a.value || 0) - (b.value || 0);
          }
          return 0;
        });
        
        for (const card of colorCards) {
          cards.push(this.renderCard(card));
        }
      }
    }
    
    // Show quick view
    await adapter.showQuickCards(
      this.session!.channelId,
      parseInt(lastMessageId),
      player.playerName,
      cards,
      this.enhancedState.publicGameMessage || 'UNO Game'
    );
    
    this.enhancedState.lastQuickView.set(userId, Date.now());
  }
  
  private async handlePrivateView(userId: string): Promise<void> {
    const adapter = this.session?.adapter as EnhancedTelegramAdapter;
    if (!adapter) return;
    
    const player = this.state.players.find(p => p.playerId === userId);
    if (!player || player.leftGame) return;
    
    // Create private hand message
    const privateMessage = this.createPrivateHandMessage(player);
    
    // Try to send private message
    const sent = await adapter.sendPrivateWithFallback(userId, privateMessage);
    
    if (sent) {
      this.enhancedState.privateMessagesSent.add(userId);
      await adapter.flashNotification(
        this.session!.channelId,
        `📱 Private message sent to ${player.playerName}!`
      );
    } else {
      // Fallback to quick view
      await this.handleQuickView(userId);
      await adapter.flashNotification(
        this.session!.channelId,
        `⚠️ ${player.playerName}, please start a chat with the bot first!`
      );
    }
  }
  
  private createPrivateHandMessage(player: any): UIMessage {
    let content = `<b>🎴 Your UNO Hand</b>\n\n`;
    content += `<b>Game Status:</b>\n`;
    
    const currentCard = this.state.lastPlayedCard;
    if (currentCard) {
      content += `Current: ${this.renderCard(currentCard)}\n`;
      content += `Color: ${this.getColorEmoji(this.state.currentColor)} ${this.state.currentColor.toUpperCase()}\n`;
    }
    
    if (this.state.drawPending > 0) {
      content += `⚠️ DRAW ${this.state.drawPending} PENDING!\n`;
    }
    
    const isYourTurn = this.state.players[this.state.currentPlayerIndex].playerId === player.playerId;
    content += `\n${isYourTurn ? '▶️ YOUR TURN!' : '⏳ Wait for your turn'}\n\n`;
    
    content += `<b>Your Cards (${player.cards.length}):</b>\n`;
    
    // Group and display cards
    const cardsByColor: Record<string, any[]> = {};
    for (const card of player.cards) {
      const key = card.color;
      if (!cardsByColor[key]) cardsByColor[key] = [];
      cardsByColor[key].push(card);
    }
    
    const colorOrder = ['red', 'yellow', 'green', 'blue', 'wild'];
    for (const color of colorOrder) {
      const cards = cardsByColor[color];
      if (cards && cards.length > 0) {
        cards.sort((a, b) => {
          if (a.type === 'number' && b.type === 'number') {
            return (a.value || 0) - (b.value || 0);
          }
          return 0;
        });
        
        for (const card of cards) {
          const canPlay = this.canPlayCard(card) ? '✅' : '❌';
          content += `${canPlay} ${this.renderCard(card)}\n`;
        }
      }
    }
    
    content += `\n<i>💡 Tip: ${isYourTurn ? 'Click a playable card (✅) in the group chat!' : 'Cards marked ✅ will be playable on your turn.'}</i>`;
    
    if (player.cards.length === 2) {
      content += `\n\n<b>⚠️ Remember to call UNO when you play your second-to-last card!</b>`;
    }
    
    // Add components for easy actions
    const components: UIComponent[] = [];
    
    if (isYourTurn) {
      components.push({
        type: 'button',
        id: 'return_to_game',
        label: '🎮 Return to Game',
        style: 'primary'
      });
      
      if (player.cards.length === 1 && !player.calledUno) {
        components.push({
          type: 'button',
          id: 'call_uno',
          label: '🚨 Call UNO!',
          style: 'danger'
        });
      }
    }
    
    return { content, components };
  }
  
  // Helper to render card with emoji
  private renderCard(card: any): string {
    const colorEmoji = this.getColorEmoji(card.color);
    
    if (card.type === 'number') {
      return `${colorEmoji}${card.value}`;
    } else if (card.type === 'skip') {
      return `${colorEmoji}⛔`;
    } else if (card.type === 'reverse') {
      return `${colorEmoji}🔄`;
    } else if (card.type === 'draw_two') {
      return `${colorEmoji}+2`;
    } else if (card.type === 'wild') {
      return `🌈Wild`;
    } else if (card.type === 'wild_draw_four') {
      return `🌈+4`;
    }
    
    return '?';
  }
  
  private getColorEmoji(color: string): string {
    switch (color) {
      case 'red': return '🔴';
      case 'yellow': return '🟡';
      case 'green': return '🟢';
      case 'blue': return '🔵';
      case 'wild': return '🌈';
      default: return '⚪';
    }
  }
  
  // Override to handle bot turns with flash notifications
  async processBotTurn(): Promise<void> {
    const adapter = this.session?.adapter as EnhancedTelegramAdapter;
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    
    if (adapter?.isMTProtoAvailable()) {
      await adapter.flashNotification(
        this.session!.channelId,
        `🤖 ${currentPlayer.playerName} is thinking...`,
        1500
      );
    }
    
    // Call parent bot logic
    await super.processBotTurn();
  }
}