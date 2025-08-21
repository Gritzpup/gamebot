import { BaseGame } from '../BaseGame';
import {
  GameCategory,
  GameEndReason,
  MoveResult,
  GameStateSnapshot,
  GameDifficulty,
} from '../../types/game.types';
import { Player, UIMessage, GameInteraction, UIComponent } from '../../types';
import { logger } from '../../utils/logger';

// Card types
enum CardColor {
  RED = 'red',
  YELLOW = 'yellow',
  GREEN = 'green',
  BLUE = 'blue',
  WILD = 'wild',
}

enum CardType {
  NUMBER = 'number',
  SKIP = 'skip',
  REVERSE = 'reverse',
  DRAW_TWO = 'draw_two',
  WILD = 'wild',
  WILD_DRAW_FOUR = 'wild_draw_four',
}

interface UnoCard {
  color: CardColor;
  type: CardType;
  value?: number; // For number cards (0-9)
  id: string; // Unique identifier for each card
}

interface PlayerHand {
  playerId: string;
  playerName: string;
  cards: UnoCard[];
  calledUno: boolean;
  isBot: boolean;
  leftGame?: boolean;
}

enum UnoGameState {
  WAITING_FOR_PLAYERS = 'waiting_for_players',
  PLAYING = 'playing',
  CHOOSING_COLOR = 'choosing_color',
  GAME_OVER = 'game_over',
}

interface UnoState {
  gameState: UnoGameState;
  players: PlayerHand[];
  currentPlayerIndex: number;
  direction: 1 | -1; // 1 for clockwise, -1 for counter-clockwise
  deck: UnoCard[];
  discardPile: UnoCard[];
  currentColor: CardColor;
  currentValue?: number;
  currentType?: CardType;
  lastPlayedCard?: UnoCard;
  drawPending: number; // Number of cards to draw (stacking draw 2s)
  winner?: string;
  scores: { [playerId: string]: number };
  roundNumber: number;
  waitingStartTime: number;
  maxPlayers: number;
  minPlayers: number;
  botJoinDelay: number; // Seconds before bots join
  creatorId: string;
  creatorName: string;
}

export class Uno extends BaseGame {
  id = 'uno';
  name = 'UNO';
  description = 'The classic card game of matching colors and numbers!';
  category = GameCategory.CardGames;
  minPlayers = 2;
  maxPlayers = 10;
  estimatedDuration = 15; // 15 minutes
  difficulty = GameDifficulty.Easy;
  acceptsTextInput = true;
  
  private get state(): UnoState {
    return this.gameState as UnoState;
  }
  
  private readonly BOT_JOIN_DELAY = 20; // 20 seconds wait time
  private readonly IDEAL_PLAYERS = 4; // Ideal number of players
  
  async initialize(session: any): Promise<void> {
    await super.initialize(session);
    
    const players = this.getPlayers();
    const creatorId = players[0];
    
    this.gameState = {
      gameState: UnoGameState.WAITING_FOR_PLAYERS,
      players: [{
        playerId: creatorId,
        playerName: this.getPlayerName(creatorId),
        cards: [],
        calledUno: false,
        isBot: false,
      }],
      currentPlayerIndex: 0,
      direction: 1,
      deck: [],
      discardPile: [],
      currentColor: CardColor.RED,
      currentValue: undefined,
      currentType: undefined,
      lastPlayedCard: undefined,
      drawPending: 0,
      winner: undefined,
      scores: {},
      roundNumber: 1,
      waitingStartTime: Date.now(),
      maxPlayers: 6, // Default to 6 players max
      minPlayers: 2,
      botJoinDelay: this.BOT_JOIN_DELAY,
      creatorId: creatorId,
      creatorName: this.getPlayerName(creatorId),
    } as UnoState;
    
    // Initialize scores for creator
    this.state.scores[creatorId] = 0;
    
    logger.info(`[UNO] Game initialized by ${this.state.creatorName} (${creatorId})`);
  }
  
  async start(): Promise<void> {
    await super.start();
    logger.info('[UNO] Game started - waiting for players');
  }
  
  private createDeck(): UnoCard[] {
    const deck: UnoCard[] = [];
    let cardId = 0;
    
    // Create number cards (0-9) for each color
    for (const color of [CardColor.RED, CardColor.YELLOW, CardColor.GREEN, CardColor.BLUE]) {
      // One 0 card per color
      deck.push({
        id: `card_${cardId++}`,
        color,
        type: CardType.NUMBER,
        value: 0,
      });
      
      // Two of each 1-9 per color
      for (let value = 1; value <= 9; value++) {
        for (let i = 0; i < 2; i++) {
          deck.push({
            id: `card_${cardId++}`,
            color,
            type: CardType.NUMBER,
            value,
          });
        }
      }
      
      // Two of each action card per color
      for (const type of [CardType.SKIP, CardType.REVERSE, CardType.DRAW_TWO]) {
        for (let i = 0; i < 2; i++) {
          deck.push({
            id: `card_${cardId++}`,
            color,
            type,
          });
        }
      }
    }
    
    // Add 4 Wild cards and 4 Wild Draw Four cards
    for (let i = 0; i < 4; i++) {
      deck.push({
        id: `card_${cardId++}`,
        color: CardColor.WILD,
        type: CardType.WILD,
      });
      deck.push({
        id: `card_${cardId++}`,
        color: CardColor.WILD,
        type: CardType.WILD_DRAW_FOUR,
      });
    }
    
    return deck;
  }
  
  private shuffleDeck(deck: UnoCard[]): void {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  
  private dealCards(): void {
    // Create and shuffle deck
    this.state.deck = this.createDeck();
    this.shuffleDeck(this.state.deck);
    
    // Deal 7 cards to each player
    for (const player of this.state.players) {
      player.cards = [];
      for (let i = 0; i < 7; i++) {
        const card = this.state.deck.pop();
        if (card) {
          player.cards.push(card);
        }
      }
    }
    
    // Set up first discard card (must not be a Wild Draw Four)
    let firstCard: UnoCard | undefined;
    do {
      firstCard = this.state.deck.pop();
      if (firstCard && firstCard.type === CardType.WILD_DRAW_FOUR) {
        // Put it back in the deck and shuffle
        this.state.deck.unshift(firstCard);
        this.shuffleDeck(this.state.deck);
      }
    } while (firstCard && firstCard.type === CardType.WILD_DRAW_FOUR);
    
    if (firstCard) {
      this.state.discardPile = [firstCard];
      this.state.lastPlayedCard = firstCard;
      
      // Set current state based on first card
      if (firstCard.color !== CardColor.WILD) {
        this.state.currentColor = firstCard.color;
        this.state.currentValue = firstCard.value;
        this.state.currentType = firstCard.type;
      } else {
        // If it's a wild card, randomly choose a color
        const colors = [CardColor.RED, CardColor.YELLOW, CardColor.GREEN, CardColor.BLUE];
        this.state.currentColor = colors[Math.floor(Math.random() * colors.length)];
      }
      
      // Handle special first cards
      if (firstCard.type === CardType.SKIP) {
        this.state.currentPlayerIndex = this.getNextPlayerIndex();
      } else if (firstCard.type === CardType.REVERSE) {
        this.state.direction *= -1;
      } else if (firstCard.type === CardType.DRAW_TWO) {
        this.state.drawPending = 2;
      }
    }
  }
  
  private getNextPlayerIndex(): number {
    let nextIndex = this.state.currentPlayerIndex + this.state.direction;
    const playerCount = this.state.players.filter(p => !p.leftGame).length;
    
    // Wrap around
    if (nextIndex >= playerCount) {
      nextIndex = 0;
    } else if (nextIndex < 0) {
      nextIndex = playerCount - 1;
    }
    
    // Skip players who left
    while (this.state.players[nextIndex]?.leftGame) {
      nextIndex += this.state.direction;
      if (nextIndex >= playerCount) {
        nextIndex = 0;
      } else if (nextIndex < 0) {
        nextIndex = playerCount - 1;
      }
    }
    
    return nextIndex;
  }
  
  private canPlayCard(card: UnoCard): boolean {
    // Wild cards can always be played
    if (card.type === CardType.WILD) {
      return true;
    }
    
    // Wild Draw Four has special rules (only if no other playable cards)
    if (card.type === CardType.WILD_DRAW_FOUR) {
      // For simplicity, we'll allow it anytime (house rules)
      return true;
    }
    
    // Check if there are pending draws (must draw or play draw card)
    if (this.state.drawPending > 0) {
      return card.type === CardType.DRAW_TWO;
    }
    
    // Match color
    if (card.color === this.state.currentColor) {
      return true;
    }
    
    // Match number
    if (card.type === CardType.NUMBER && 
        this.state.currentType === CardType.NUMBER &&
        card.value === this.state.currentValue) {
      return true;
    }
    
    // Match action type
    if (card.type === this.state.currentType && 
        card.type !== CardType.NUMBER) {
      return true;
    }
    
    return false;
  }
  
  private drawCards(player: PlayerHand, count: number): UnoCard[] {
    const drawnCards: UnoCard[] = [];
    
    for (let i = 0; i < count; i++) {
      if (this.state.deck.length === 0) {
        // Reshuffle discard pile into deck
        const topCard = this.state.discardPile.pop();
        this.state.deck = this.state.discardPile;
        this.state.discardPile = topCard ? [topCard] : [];
        this.shuffleDeck(this.state.deck);
      }
      
      const card = this.state.deck.pop();
      if (card) {
        player.cards.push(card);
        drawnCards.push(card);
      }
    }
    
    // Reset UNO call when drawing
    player.calledUno = false;
    
    return drawnCards;
  }
  
  async processInteraction(interaction: GameInteraction): Promise<MoveResult | null> {
    try {
      logger.info(`[UNO] Processing interaction - State: ${this.state.gameState}, Type: ${interaction.type}, User: ${interaction.userId}`);
      
      // Handle waiting for players
      if (this.state.gameState === UnoGameState.WAITING_FOR_PLAYERS) {
        if (interaction.type === 'button_click') {
          const buttonId = interaction.data?.id;
          
          if (buttonId === 'join_game') {
            // Check if player already joined
            if (this.state.players.find(p => p.playerId === interaction.userId)) {
              return { success: false, message: "You already joined!", stateChanged: false };
            }
            
            // Check max players
            if (this.state.players.length >= this.state.maxPlayers) {
              return { success: false, message: "Game is full!", stateChanged: false };
            }
            
            // Add player
            this.state.players.push({
              playerId: interaction.userId,
              playerName: this.getPlayerName(interaction.userId),
              cards: [],
              calledUno: false,
              isBot: false,
            });
            
            this.state.scores[interaction.userId] = 0;
            
            logger.info(`[UNO] ${this.getPlayerName(interaction.userId)} joined - ${this.state.players.length}/${this.state.maxPlayers} players`);
            
            return { success: true, stateChanged: true };
          }
          
          if (buttonId === 'start_game' && interaction.userId === this.state.creatorId) {
            if (this.state.players.length < this.state.minPlayers) {
              return { success: false, message: `Need at least ${this.state.minPlayers} players!`, stateChanged: false };
            }
            
            this.startRound();
            return { success: true, stateChanged: true };
          }
          
          if (buttonId === 'add_bots' && interaction.userId === this.state.creatorId) {
            this.addBots();
            this.startRound();
            return { success: true, stateChanged: true };
          }
          
          if (buttonId === 'cancel_game' && interaction.userId === this.state.creatorId) {
            return { success: true, gameEnded: true, stateChanged: false };
          }
        }
        
        return null;
      }
      
      // Handle playing state
      if (this.state.gameState === UnoGameState.PLAYING) {
        const currentPlayer = this.state.players[this.state.currentPlayerIndex];
        
        // Check if it's the player's turn
        if (currentPlayer.playerId !== interaction.userId) {
          // Allow UNO calls from other players
          if (interaction.type === 'button_click' && interaction.data?.id?.startsWith('call_uno_')) {
            return this.handleUnoPenalty(interaction);
          }
          return { success: false, message: "Not your turn!", stateChanged: false };
        }
        
        if (interaction.type === 'button_click') {
          const buttonId = interaction.data?.id;
          
          // Play a card
          if (buttonId?.startsWith('play_')) {
            const cardId = buttonId.substring(5);
            return this.playCard(currentPlayer, cardId);
          }
          
          // Draw a card
          if (buttonId === 'draw_card') {
            return this.handleDrawCard(currentPlayer);
          }
          
          // Call UNO
          if (buttonId === 'call_uno') {
            currentPlayer.calledUno = true;
            logger.info(`[UNO] ${currentPlayer.playerName} called UNO!`);
            return { success: true, stateChanged: true };
          }
        }
        
        // Bot's turn
        if (currentPlayer.isBot) {
          this.makeBotMove();
          return { success: true, stateChanged: true };
        }
      }
      
      // Handle color selection
      if (this.state.gameState === UnoGameState.CHOOSING_COLOR) {
        const currentPlayer = this.state.players[this.state.currentPlayerIndex];
        
        if (currentPlayer.playerId !== interaction.userId) {
          return { success: false, message: "Not your turn to choose color!", stateChanged: false };
        }
        
        if (interaction.type === 'button_click' && interaction.data?.id?.startsWith('color_')) {
          const color = interaction.data.id.substring(6) as CardColor;
          this.state.currentColor = color;
          this.state.gameState = UnoGameState.PLAYING;
          
          // Move to next player
          this.state.currentPlayerIndex = this.getNextPlayerIndex();
          
          // Handle bot turn if next player is bot
          const nextPlayer = this.state.players[this.state.currentPlayerIndex];
          if (nextPlayer.isBot) {
            setTimeout(() => this.makeBotMove(), 1500);
          }
          
          return { success: true, stateChanged: true };
        }
      }
      
      // Handle game over
      if (this.state.gameState === UnoGameState.GAME_OVER) {
        if (interaction.type === 'button_click') {
          const buttonId = interaction.data?.id;
          
          if (buttonId === 'new_round' && interaction.userId === this.state.creatorId) {
            this.state.roundNumber++;
            this.startRound();
            return { success: true, stateChanged: true };
          }
          
          if (buttonId === 'end_game') {
            return { success: true, gameEnded: true, stateChanged: false };
          }
        }
      }
      
      return null;
      
    } catch (error) {
      logger.error(`[UNO] Error in processInteraction:`, error);
      return { success: false, message: 'An error occurred', stateChanged: false };
    }
  }
  
  private startRound(): void {
    logger.info(`[UNO] Starting round ${this.state.roundNumber}`);
    
    // Reset round-specific state
    this.state.currentPlayerIndex = 0;
    this.state.direction = 1;
    this.state.drawPending = 0;
    this.state.winner = undefined;
    
    // Reset player states
    for (const player of this.state.players) {
      player.cards = [];
      player.calledUno = false;
    }
    
    // Deal cards
    this.dealCards();
    
    this.state.gameState = UnoGameState.PLAYING;
    
    // If first player is bot, make move
    const firstPlayer = this.state.players[0];
    if (firstPlayer.isBot) {
      setTimeout(() => this.makeBotMove(), 2000);
    }
  }
  
  private addBots(): void {
    const botsNeeded = Math.min(
      this.IDEAL_PLAYERS - this.state.players.length,
      this.state.maxPlayers - this.state.players.length
    );
    
    const botNames = ['🤖 UnoBot', '🤖 CardMaster', '🤖 ColorBot', '🤖 DrawBot', '🤖 SkipBot'];
    
    for (let i = 0; i < botsNeeded; i++) {
      const botId = `bot_${Date.now()}_${i}`;
      this.state.players.push({
        playerId: botId,
        playerName: botNames[i % botNames.length],
        cards: [],
        calledUno: false,
        isBot: true,
      });
      this.state.scores[botId] = 0;
    }
    
    logger.info(`[UNO] Added ${botsNeeded} bots - Total players: ${this.state.players.length}`);
  }
  
  private playCard(player: PlayerHand, cardId: string): MoveResult {
    const cardIndex = player.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return { success: false, message: "Card not found!", stateChanged: false };
    }
    
    const card = player.cards[cardIndex];
    
    if (!this.canPlayCard(card)) {
      return { success: false, message: "Can't play that card!", stateChanged: false };
    }
    
    // Handle draw pending
    if (this.state.drawPending > 0 && card.type === CardType.DRAW_TWO) {
      this.state.drawPending += 2;
    } else if (this.state.drawPending > 0) {
      // Must play draw two or draw cards
      return { success: false, message: "Must play Draw Two or draw cards!", stateChanged: false };
    }
    
    // Remove card from hand
    player.cards.splice(cardIndex, 1);
    
    // Add to discard pile
    this.state.discardPile.push(card);
    this.state.lastPlayedCard = card;
    
    // Update current state
    if (card.color !== CardColor.WILD) {
      this.state.currentColor = card.color;
      this.state.currentValue = card.value;
      this.state.currentType = card.type;
    }
    
    // Handle special cards
    let skipNext = false;
    
    switch (card.type) {
      case CardType.SKIP:
        skipNext = true;
        break;
        
      case CardType.REVERSE:
        if (this.state.players.filter(p => !p.leftGame).length > 2) {
          this.state.direction *= -1;
        } else {
          // In 2-player, reverse acts like skip
          skipNext = true;
        }
        break;
        
      case CardType.DRAW_TWO:
        if (this.state.drawPending === 0) {
          this.state.drawPending = 2;
        }
        break;
        
      case CardType.WILD:
      case CardType.WILD_DRAW_FOUR:
        if (card.type === CardType.WILD_DRAW_FOUR) {
          this.state.drawPending = 4;
        }
        
        // Need to choose color
        if (!player.isBot) {
          this.state.gameState = UnoGameState.CHOOSING_COLOR;
          return { success: true, stateChanged: true };
        } else {
          // Bot chooses color based on hand
          const colorCounts: Record<CardColor, number> = {
            [CardColor.RED]: 0,
            [CardColor.YELLOW]: 0,
            [CardColor.GREEN]: 0,
            [CardColor.BLUE]: 0,
            [CardColor.WILD]: 0,
          };
          
          for (const c of player.cards) {
            if (c.color !== CardColor.WILD) {
              colorCounts[c.color]++;
            }
          }
          
          // Choose color with most cards
          let maxColor = CardColor.RED;
          let maxCount = 0;
          for (const [color, count] of Object.entries(colorCounts)) {
            if (color !== CardColor.WILD && count > maxCount) {
              maxCount = count;
              maxColor = color as CardColor;
            }
          }
          
          this.state.currentColor = maxColor;
        }
        break;
    }
    
    // Check for win
    if (player.cards.length === 0) {
      this.handleRoundEnd(player);
      return { success: true, gameEnded: false, stateChanged: true };
    }
    
    // Check UNO penalty
    if (player.cards.length === 1 && !player.calledUno) {
      // Give other players a chance to catch them
      setTimeout(() => {
        if (!player.calledUno && player.cards.length === 1) {
          logger.info(`[UNO] ${player.playerName} forgot to call UNO!`);
          this.drawCards(player, 2);
        }
      }, 3000);
    }
    
    // Move to next player
    if (skipNext) {
      this.state.currentPlayerIndex = this.getNextPlayerIndex();
    }
    this.state.currentPlayerIndex = this.getNextPlayerIndex();
    
    // Handle bot turn
    const nextPlayer = this.state.players[this.state.currentPlayerIndex];
    if (nextPlayer.isBot && this.state.gameState === UnoGameState.PLAYING) {
      setTimeout(() => this.makeBotMove(), 1500);
    }
    
    return { success: true, stateChanged: true };
  }
  
  private handleDrawCard(player: PlayerHand): MoveResult {
    const drawCount = this.state.drawPending > 0 ? this.state.drawPending : 1;
    const drawnCards = this.drawCards(player, drawCount);
    
    logger.info(`[UNO] ${player.playerName} drew ${drawCount} cards`);
    
    // Reset draw pending
    this.state.drawPending = 0;
    
    // Check if drawn card can be played (only if drew 1 card)
    if (drawCount === 1 && drawnCards.length > 0) {
      const drawnCard = drawnCards[0];
      if (this.canPlayCard(drawnCard)) {
        // Player can choose to play it or pass
        return { success: true, stateChanged: true };
      }
    }
    
    // Move to next player
    this.state.currentPlayerIndex = this.getNextPlayerIndex();
    
    // Handle bot turn
    const nextPlayer = this.state.players[this.state.currentPlayerIndex];
    if (nextPlayer.isBot) {
      setTimeout(() => this.makeBotMove(), 1500);
    }
    
    return { success: true, stateChanged: true };
  }
  
  private handleUnoPenalty(interaction: GameInteraction): MoveResult {
    const targetId = interaction.data?.id?.substring(9); // Remove 'call_uno_' prefix
    const targetPlayer = this.state.players.find(p => p.playerId === targetId);
    
    if (!targetPlayer) {
      return { success: false, message: "Player not found!", stateChanged: false };
    }
    
    if (targetPlayer.cards.length === 1 && !targetPlayer.calledUno) {
      logger.info(`[UNO] ${this.getPlayerName(interaction.userId)} caught ${targetPlayer.playerName} not calling UNO!`);
      this.drawCards(targetPlayer, 2);
      return { success: true, stateChanged: true };
    }
    
    return { success: false, message: "Can't penalize that player!", stateChanged: false };
  }
  
  private handleRoundEnd(winner: PlayerHand): void {
    this.state.winner = winner.playerId;
    this.state.gameState = UnoGameState.GAME_OVER;
    
    // Calculate scores
    let roundScore = 0;
    for (const player of this.state.players) {
      if (player.playerId !== winner.playerId) {
        for (const card of player.cards) {
          if (card.type === CardType.NUMBER) {
            roundScore += card.value || 0;
          } else if (card.type === CardType.WILD || card.type === CardType.WILD_DRAW_FOUR) {
            roundScore += 50;
          } else {
            roundScore += 20;
          }
        }
      }
    }
    
    this.state.scores[winner.playerId] = (this.state.scores[winner.playerId] || 0) + roundScore;
    
    logger.info(`[UNO] Round ${this.state.roundNumber} won by ${winner.playerName} - Score: ${roundScore}`);
    
    // Check for game winner (500 points)
    const gameWinner = Object.entries(this.state.scores).find(([_, score]) => score >= 500);
    if (gameWinner) {
      logger.info(`[UNO] Game won by ${this.getPlayerName(gameWinner[0])} with ${gameWinner[1]} points!`);
    }
  }
  
  private makeBotMove(): void {
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (!currentPlayer.isBot || this.state.gameState !== UnoGameState.PLAYING) {
      return;
    }
    
    logger.info(`[UNO] Bot ${currentPlayer.playerName} is making a move`);
    
    // Find playable cards
    const playableCards = currentPlayer.cards.filter(card => this.canPlayCard(card));
    
    // Call UNO if needed
    if (currentPlayer.cards.length === 2 && playableCards.length > 0) {
      currentPlayer.calledUno = true;
      logger.info(`[UNO] Bot ${currentPlayer.playerName} called UNO!`);
    }
    
    if (playableCards.length > 0) {
      // Choose card strategically
      let cardToPlay: UnoCard;
      
      // Prefer non-wild cards
      const nonWildCards = playableCards.filter(c => c.color !== CardColor.WILD);
      
      if (nonWildCards.length > 0) {
        // Prefer action cards
        const actionCards = nonWildCards.filter(c => c.type !== CardType.NUMBER);
        cardToPlay = actionCards.length > 0 
          ? actionCards[Math.floor(Math.random() * actionCards.length)]
          : nonWildCards[Math.floor(Math.random() * nonWildCards.length)];
      } else {
        // Play wild card
        cardToPlay = playableCards[0];
      }
      
      const result = this.playCard(currentPlayer, cardToPlay.id);
      if (!result.success) {
        // Fallback to drawing
        this.handleDrawCard(currentPlayer);
      }
    } else {
      // Must draw
      this.handleDrawCard(currentPlayer);
    }
  }
  
  renderState(forPlayer?: string): UIMessage {
    try {
      let content = '';
      let components: UIComponent[] = [];
      
      // Waiting for players
      if (this.state.gameState === UnoGameState.WAITING_FOR_PLAYERS) {
        const waitTime = Date.now() - this.state.waitingStartTime;
        const timeRemaining = Math.max(0, this.state.botJoinDelay - Math.floor(waitTime / 1000));
        
        content = `\`\`\`\n╔═══════════════════════════╗\n`;
        content += `║         UNO! 🎴           ║\n`;
        content += `╚═══════════════════════════╝\n\n`;
        content += `👥 Players (${this.state.players.length}/${this.state.maxPlayers}):\n`;
        
        for (const player of this.state.players) {
          content += `  • ${player.playerName}\n`;
        }
        
        content += `\n⏱️ Bot auto-join in: ${timeRemaining}s\n`;
        content += `\n📋 Rules:\n`;
        content += `  • Match color or number\n`;
        content += `  • Say UNO at 1 card!\n`;
        content += `  • First to 500 points wins\n`;
        content += `\`\`\``;
        
        components = [];
        
        // Show join button to non-players
        const isPlayer = this.state.players.find(p => p.playerId === forPlayer);
        if (!isPlayer && this.state.players.length < this.state.maxPlayers) {
          components.push({ type: 'button', id: 'join_game', label: '🎮 Join Game', style: 'success' });
        }
        
        // Creator controls
        if (forPlayer === this.state.creatorId) {
          if (this.state.players.length >= this.state.minPlayers) {
            components.push({ type: 'button', id: 'start_game', label: '▶️ Start Game', style: 'primary' });
          }
          components.push({ type: 'button', id: 'add_bots', label: '🤖 Add Bots & Start', style: 'secondary' });
          components.push({ type: 'button', id: 'cancel_game', label: '❌ Cancel', style: 'danger' });
        }
        
        // Auto-add bots after delay
        if (waitTime > this.state.botJoinDelay * 1000 && this.state.players.length < this.IDEAL_PLAYERS) {
          this.addBots();
          this.startRound();
        }
        
        return { content, components };
      }
      
      // Playing state
      if (this.state.gameState === UnoGameState.PLAYING || this.state.gameState === UnoGameState.CHOOSING_COLOR) {
        const currentPlayer = this.state.players[this.state.currentPlayerIndex];
        const viewingPlayer = this.state.players.find(p => p.playerId === forPlayer);
        
        content = `\`\`\`\n╔═══════════════════════════╗\n`;
        content += `║         UNO! 🎴           ║\n`;
        content += `╚═══════════════════════════╝\n\n`;
        
        // Current card
        const currentCard = this.state.lastPlayedCard;
        if (currentCard) {
          content += `🎯 Current: ${this.renderCard(currentCard)}\n`;
          content += `🎨 Color: ${this.getColorEmoji(this.state.currentColor)} ${this.state.currentColor.toUpperCase()}\n`;
        }
        
        if (this.state.drawPending > 0) {
          content += `⚠️ DRAW ${this.state.drawPending} PENDING!\n`;
        }
        
        content += `\n🎮 Turn: ${currentPlayer.playerName}\n`;
        content += `📦 Deck: ${this.state.deck.length} cards\n\n`;
        
        // Players overview
        content += `👥 Players:\n`;
        for (let i = 0; i < this.state.players.length; i++) {
          const p = this.state.players[i];
          if (p.leftGame) continue;
          
          const isCurrent = i === this.state.currentPlayerIndex;
          const prefix = isCurrent ? '▶️' : '  ';
          const unoWarning = p.cards.length === 1 && p.calledUno ? ' 🚨UNO!' : '';
          const cardCount = p.cards.length === 1 && !p.calledUno ? ' ⚠️' : '';
          
          content += `${prefix} ${p.playerName}: ${p.cards.length} cards${unoWarning}${cardCount}\n`;
        }
        
        // Show hand if viewing player
        if (viewingPlayer && !viewingPlayer.leftGame) {
          content += `\n📋 Your Hand (${viewingPlayer.cards.length}):\n`;
          
          // Group cards by color
          const cardsByColor: Record<string, UnoCard[]> = {};
          for (const card of viewingPlayer.cards) {
            const key = card.color;
            if (!cardsByColor[key]) cardsByColor[key] = [];
            cardsByColor[key].push(card);
          }
          
          // Sort colors
          const colorOrder = [CardColor.RED, CardColor.YELLOW, CardColor.GREEN, CardColor.BLUE, CardColor.WILD];
          for (const color of colorOrder) {
            const cards = cardsByColor[color];
            if (cards && cards.length > 0) {
              // Sort by type then value
              cards.sort((a, b) => {
                if (a.type === CardType.NUMBER && b.type === CardType.NUMBER) {
                  return (a.value || 0) - (b.value || 0);
                }
                return 0;
              });
              
              for (const card of cards) {
                const canPlay = this.canPlayCard(card) ? '✓' : ' ';
                content += `  ${canPlay} ${this.renderCard(card)}\n`;
              }
            }
          }
        }
        
        content += `\`\`\``;
        
        // Components
        components = [];
        
        if (this.state.gameState === UnoGameState.CHOOSING_COLOR && currentPlayer.playerId === forPlayer) {
          content = `\`\`\`\n🎨 CHOOSE A COLOR:\n\`\`\``;
          components = [
            { type: 'button', id: 'color_red', label: '🔴 Red', style: 'danger' },
            { type: 'button', id: 'color_yellow', label: '🟡 Yellow', style: 'secondary' },
            { type: 'button', id: 'color_green', label: '🟢 Green', style: 'success' },
            { type: 'button', id: 'color_blue', label: '🔵 Blue', style: 'primary' },
          ];
        } else if (currentPlayer.playerId === forPlayer && !currentPlayer.isBot) {
          // Current player's controls
          const playableCards = viewingPlayer!.cards.filter(card => this.canPlayCard(card));
          
          if (playableCards.length > 0) {
            // Show up to 5 playable cards as buttons
            const cardsToShow = playableCards.slice(0, 5);
            for (const card of cardsToShow) {
              components.push({
                type: 'button',
                id: `play_${card.id}`,
                label: this.renderCard(card),
                style: 'primary',
              });
            }
            
            if (playableCards.length > 5) {
              // TODO: Add card selection UI for more cards
            }
          }
          
          components.push({
            type: 'button',
            id: 'draw_card',
            label: this.state.drawPending > 0 ? `📥 Draw ${this.state.drawPending}` : '📥 Draw Card',
            style: 'secondary',
          });
          
          if (viewingPlayer!.cards.length === 1 && !viewingPlayer!.calledUno) {
            components.push({
              type: 'button',
              id: 'call_uno',
              label: '🚨 UNO!',
              style: 'danger',
            });
          }
        } else if (viewingPlayer && !currentPlayer.isBot) {
          // Other players can catch UNO
          for (const player of this.state.players) {
            if (player.cards.length === 1 && !player.calledUno && !player.isBot && player.playerId !== forPlayer) {
              components.push({
                type: 'button',
                id: `call_uno_${player.playerId}`,
                label: `🚨 Catch ${player.playerName}!`,
                style: 'danger',
              });
            }
          }
        }
        
        return { content, components };
      }
      
      // Game over
      if (this.state.gameState === UnoGameState.GAME_OVER) {
        const winner = this.state.players.find(p => p.playerId === this.state.winner);
        
        content = `\`\`\`\n╔═══════════════════════════╗\n`;
        content += `║       ROUND OVER! 🏁      ║\n`;
        content += `╚═══════════════════════════╝\n\n`;
        content += `🏆 Winner: ${winner?.playerName}\n\n`;
        content += `📊 Scores:\n`;
        
        // Sort by score
        const sortedScores = Object.entries(this.state.scores)
          .sort(([, a], [, b]) => b - a);
        
        for (const [playerId, score] of sortedScores) {
          const player = this.state.players.find(p => p.playerId === playerId);
          if (player) {
            const isWinner = score >= 500 ? ' 👑' : '';
            content += `  ${player.playerName}: ${score} points${isWinner}\n`;
          }
        }
        
        content += `\`\`\``;
        
        components = [];
        
        if (forPlayer === this.state.creatorId && !sortedScores.some(([, score]) => score >= 500)) {
          components.push({ type: 'button', id: 'new_round', label: '🔄 Next Round', style: 'primary' });
        }
        
        components.push({ type: 'button', id: 'end_game', label: '🏁 End Game', style: 'danger' });
        
        return { content, components };
      }
      
      return { content: 'Unknown game state' };
      
    } catch (error) {
      logger.error(`[UNO] Error in renderState:`, error);
      return { content: `\`\`\`\nError rendering game state.\n\`\`\`` };
    }
  }
  
  private renderCard(card: UnoCard): string {
    const colorEmoji = this.getColorEmoji(card.color);
    
    if (card.type === CardType.NUMBER) {
      return `${colorEmoji} ${card.value}`;
    }
    
    const typeEmojis: Record<CardType, string> = {
      [CardType.NUMBER]: '',
      [CardType.SKIP]: '⛔',
      [CardType.REVERSE]: '🔄',
      [CardType.DRAW_TWO]: '+2',
      [CardType.WILD]: '🌈',
      [CardType.WILD_DRAW_FOUR]: '🌈+4',
    };
    
    return `${colorEmoji} ${typeEmojis[card.type]}`;
  }
  
  private getColorEmoji(color: CardColor): string {
    const emojis: Record<CardColor, string> = {
      [CardColor.RED]: '🔴',
      [CardColor.YELLOW]: '🟡',
      [CardColor.GREEN]: '🟢',
      [CardColor.BLUE]: '🔵',
      [CardColor.WILD]: '🌈',
    };
    
    return emojis[color];
  }
  
  isGameOver(): boolean {
    return this.state.gameState === UnoGameState.GAME_OVER && 
           Object.values(this.state.scores).some(score => score >= 500);
  }
  
  async end(reason: GameEndReason): Promise<void> {
    logger.info(`[UNO] Game ended - Reason: ${reason}`);
    await super.end(reason);
  }
  
  getCurrentState(): GameStateSnapshot {
    const players = this.state.players.map(p => ({
      playerId: p.playerId,
      isActive: !p.leftGame,
      isAI: p.isBot,
      score: this.state.scores[p.playerId] || 0,
    }));
    
    return {
      gameId: this.id,
      turnNumber: 0, // Not really applicable for UNO
      currentPlayer: this.state.players[this.state.currentPlayerIndex]?.playerId,
      players,
      board: null,
      gameSpecificData: {
        roundNumber: this.state.roundNumber,
        currentColor: this.state.currentColor,
        cardsInDeck: this.state.deck.length,
      },
    };
  }
  
  async validateMove(playerId: string, move: any): Promise<boolean> {
    return true; // Validation happens in processInteraction
  }
  
  async makeMove(playerId: string, move: any): Promise<MoveResult> {
    return { success: false, stateChanged: false };
  }
  
  async getValidMoves(playerId: string): Promise<any[]> {
    const player = this.state.players.find(p => p.playerId === playerId);
    if (!player) return [];
    
    return player.cards.filter(card => this.canPlayCard(card));
  }
  
  renderHelp(): UIMessage {
    const content = `\`\`\`
╔═══════════════════════════╗
║      UNO! HELP 📖        ║
╚═══════════════════════════╝

🎯 OBJECTIVE:
Be the first to play all your cards!
First to 500 points wins the game.

🎴 CARD TYPES:
• Number Cards (0-9): Match color/number
• Skip ⛔: Next player loses turn
• Reverse 🔄: Change direction
• Draw Two +2: Next player draws 2
• Wild 🌈: Choose any color
• Wild Draw Four 🌈+4: Choose color + next draws 4

📋 RULES:
1. Match the top card by color or number
2. Special cards have immediate effects
3. Say UNO when you have 1 card left!
4. Forget UNO = Draw 2 penalty cards
5. Can't play? Draw a card

💯 SCORING:
• Number cards: Face value
• Action cards: 20 points
• Wild cards: 50 points

💡 TIPS:
• Save Wild cards for emergencies
• Watch for players with 1 card
• Call them out if they forget UNO!
\`\`\``;
    
    return { content };
  }
  
  renderStats(): UIMessage {
    const sortedScores = Object.entries(this.state.scores)
      .sort(([, a], [, b]) => b - a);
    
    let content = `\`\`\`
╔═══════════════════════════╗
║      GAME STATS 📊        ║
╚═══════════════════════════╝

Round: ${this.state.roundNumber}

LEADERBOARD:
`;
    
    for (const [playerId, score] of sortedScores) {
      const player = this.state.players.find(p => p.playerId === playerId);
      if (player) {
        const trophy = score >= 500 ? ' 👑' : '';
        const rank = sortedScores.indexOf([playerId, score]) + 1;
        content += `${rank}. ${player.playerName}: ${score} points${trophy}\n`;
      }
    }
    
    content += `\nGAME TO: 500 points\n`;
    content += `\`\`\``;
    
    return { content };
  }
  
  protected createInitialState(): UnoState {
    return {
      gameState: UnoGameState.WAITING_FOR_PLAYERS,
      players: [],
      currentPlayerIndex: 0,
      direction: 1,
      deck: [],
      discardPile: [],
      currentColor: CardColor.RED,
      currentValue: undefined,
      currentType: undefined,
      lastPlayedCard: undefined,
      drawPending: 0,
      winner: undefined,
      scores: {},
      roundNumber: 1,
      waitingStartTime: Date.now(),
      maxPlayers: 6,
      minPlayers: 2,
      botJoinDelay: this.BOT_JOIN_DELAY,
      creatorId: '',
      creatorName: '',
    };
  }
  
  protected getCurrentPlayer(): string | undefined {
    if (this.state.gameState !== UnoGameState.PLAYING && 
        this.state.gameState !== UnoGameState.CHOOSING_COLOR) {
      return undefined;
    }
    
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    return currentPlayer?.playerId;
  }
  
  protected getPlayerStates(): any[] {
    return this.state.players.map(player => ({
      playerId: player.playerId,
      isActive: !player.leftGame,
      isAI: player.isBot,
      score: this.state.scores[player.playerId] || 0,
      hand: player.cards,
      customData: {
        playerName: player.playerName,
        calledUno: player.calledUno,
      }
    }));
  }
  
  protected getScores(): Record<string, number> {
    return this.state.scores;
  }
}