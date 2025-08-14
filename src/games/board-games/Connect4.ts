import { BaseGame } from '../BaseGame';
import {
  GameCategory,
  GameDifficulty,
  MoveResult,
  AIDifficulty
} from '../../types/game.types';
import { UIMessage } from '../../types';

enum Connect4GameState {
  WAITING_FOR_PLAYER = 'waiting_for_player',
  PLAYING = 'playing',
  GAME_OVER = 'game_over'
}

interface Connect4State {
  board: (string | null)[][];
  currentPlayer: 'R' | 'Y'; // Red or Yellow
  players: {
    R: string;
    Y: string;
  };
  lastMove?: { row: number; col: number };
  gameState: Connect4GameState;
  waitingStartTime?: number;
  isVsBot?: boolean;
  botDifficulty?: AIDifficulty;
  creatorId?: string;
}

export class Connect4 extends BaseGame {
  id = 'connect4';
  name = 'Connect 4';
  description = 'Drop colored discs into a 7x6 grid. First to get 4 in a row wins!';
  category = GameCategory.BoardGames;
  minPlayers = 2;
  maxPlayers = 2;
  estimatedDuration = 15;
  difficulty = GameDifficulty.Easy;

  private readonly ROWS = 6;
  private readonly COLS = 7;

  protected createInitialState(): Connect4State {
    // Create empty board
    const board: (string | null)[][] = [];
    for (let row = 0; row < this.ROWS; row++) {
      board.push(new Array(this.COLS).fill(null));
    }

    return {
      board,
      currentPlayer: 'R',
      players: {
        R: '',
        Y: ''
      },
      gameState: Connect4GameState.WAITING_FOR_PLAYER,
      waitingStartTime: Date.now(),
      creatorId: '' // Track the creator
    };
  }

  protected onGameStart(): void {
    // Get players from the session
    const playerIds = this.getPlayers();
    
    // Set first player if not already set
    if (playerIds.length > 0 && !this.gameState.players.R) {
      this.gameState.players.R = playerIds[0];
      this.gameState.creatorId = playerIds[0];
    }
    
    // Set second player if we have one
    if (playerIds.length > 1) {
      this.gameState.players.Y = playerIds[1];
      this.gameState.gameState = Connect4GameState.PLAYING;
    }
  }

  // Method to handle second player joining or bot activation
  async handlePlayerJoin(playerId: string): Promise<void> {
    if (this.gameState.gameState === Connect4GameState.WAITING_FOR_PLAYER) {
      this.gameState.players.Y = playerId;
      this.gameState.gameState = Connect4GameState.PLAYING;
      this.gameState.isVsBot = false;
    }
  }

  // Method to start bot game
  async startBotGame(difficulty: AIDifficulty = AIDifficulty.Intermediate): Promise<void> {
    if (this.gameState.gameState === Connect4GameState.WAITING_FOR_PLAYER) {
      const botId = 'bot_' + Date.now();
      this.gameState.players.Y = botId;
      this.gameState.gameState = Connect4GameState.PLAYING;
      this.gameState.isVsBot = true;
      this.gameState.botDifficulty = difficulty;
      
      // Add bot as a player to the session
      if (this.session) {
        const botPlayer = {
          id: botId,
          platform: this.session.getPlatform(),
          platformId: botId,
          username: 'Bot',
          displayName: '🤖 Bot',
          avatar: undefined,
          stats: {
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            gamesDraw: 0,
            winStreak: 0,
            bestWinStreak: 0,
            totalScore: 0,
            achievements: []
          },
          createdAt: new Date(),
          lastActiveAt: new Date()
        };
        
        await this.session.addPlayer(botPlayer);
      }
    }
  }

  getWaitingTimeLeft(): number {
    if (this.gameState.gameState !== Connect4GameState.WAITING_FOR_PLAYER) {
      return 0;
    }
    const elapsed = Date.now() - (this.gameState.waitingStartTime || 0);
    const remaining = Math.max(0, 10000 - elapsed);
    return Math.ceil(remaining / 1000);
  }

  async processInteraction(interaction: any): Promise<MoveResult | null> {
    // Handle waiting room buttons
    if (this.gameState.gameState === Connect4GameState.WAITING_FOR_PLAYER) {
      if (interaction.data?.id === 'join_game') {
        // Check if player is not the creator
        if (interaction.userId === this.gameState.players.R) {
          return {
            success: false,
            message: "You can't join your own game!"
          };
        }
        
        // Add player and start game
        await this.handlePlayerJoin(interaction.userId);
        return {
          success: true,
          message: 'Game started!',
          stateChanged: true
        };
      } else if (interaction.data?.id === 'start_bot') {
        // Start bot game
        await this.startBotGame(AIDifficulty.Intermediate);
        return {
          success: true,
          message: 'Game started vs Bot!',
          stateChanged: true
        };
      }
    }
    
    // Handle cancel button
    if (interaction.data?.id === 'cancel_game') {
      // Check if the player is in the game
      const playerId = interaction.userId;
      if (playerId !== this.gameState.players.R && playerId !== this.gameState.players.Y) {
        return {
          success: false,
          message: "You're not in this game!"
        };
      }
      
      const cancellingPlayer = this.getSafePlayerName(playerId);
      this.gameState.gameState = Connect4GameState.GAME_OVER;
      return {
        success: true,
        gameEnded: true,
        message: `Game cancelled by ${cancellingPlayer}`,
        stateChanged: true
      };
    }
    
    // Handle column buttons during game
    if (interaction.data?.id && interaction.data.id.startsWith('col_')) {
      const col = parseInt(interaction.data.id.split('_')[1]);
      return this.makeMove(interaction.userId, { col });
    }
    
    return null;
  }

  async validateMove(playerId: string, move: any): Promise<boolean> {
    // Check if it's the player's turn
    if (!this.isPlayerTurn(playerId)) {
      return false;
    }

    // Check if move has valid column
    if (typeof move !== 'object' || typeof move.col !== 'number') {
      return false;
    }

    const { col } = move;

    // Check bounds
    if (col < 0 || col >= this.COLS) {
      return false;
    }

    // Check if column has space (top row must be empty)
    return this.gameState.board[0][col] === null;
  }

  async makeMove(playerId: string, move: any): Promise<MoveResult> {
    // Check if game is in playing state
    if (this.gameState.gameState !== Connect4GameState.PLAYING) {
      return {
        success: false,
        message: 'Game is not in playing state'
      };
    }

    const { col } = move;
    const color = this.getPlayerColor(playerId);

    // Find the lowest empty row in the column (gravity)
    let row = -1;
    for (let r = this.ROWS - 1; r >= 0; r--) {
      if (this.gameState.board[r][col] === null) {
        row = r;
        break;
      }
    }

    if (row === -1) {
      return {
        success: false,
        message: 'Column is full!'
      };
    }

    // Make the move
    this.gameState.board[row][col] = color;
    this.gameState.lastMove = { row, col };
    this.advanceTurn();

    // Check for win
    if (this.checkWin(row, col, color)) {
      this.gameState.gameState = Connect4GameState.GAME_OVER;
      return {
        success: true,
        gameEnded: true,
        winner: playerId,
        message: `${this.getSafePlayerName(playerId)} wins!`
      };
    }

    // Check for draw
    if (this.checkDraw()) {
      this.gameState.gameState = Connect4GameState.GAME_OVER;
      return {
        success: true,
        gameEnded: true,
        isDraw: true,
        message: "It's a draw!"
      };
    }

    // Switch players
    this.gameState.currentPlayer = this.gameState.currentPlayer === 'R' ? 'Y' : 'R';
    const nextPlayerId = this.gameState.players[this.gameState.currentPlayer];

    // Check if next player is bot
    const shouldMakeBotMove = this.gameState.isVsBot && this.isPlayerBot(nextPlayerId);

    return {
      success: true,
      nextPlayer: nextPlayerId,
      message: `${this.getSafePlayerName(nextPlayerId)}'s turn`,
      shouldMakeBotMove
    };
  }

  private isPlayerBot(playerId: string): boolean {
    return playerId.startsWith('bot_');
  }

  async getValidMoves(playerId: string): Promise<any[]> {
    const moves: any[] = [];

    // Check each column
    for (let col = 0; col < this.COLS; col++) {
      if (this.gameState.board[0][col] === null) {
        moves.push({ col });
      }
    }

    return moves;
  }

  renderState(forPlayer?: string): UIMessage {
    // Set creator if not set yet
    if (!this.gameState.creatorId && this.session) {
      const playerIds = this.getPlayers();
      if (playerIds.length > 0) {
        this.gameState.creatorId = playerIds[0];
        this.gameState.players.R = playerIds[0];
      }
    }
    // Ensure game state is initialized
    if (!this.gameState || !this.gameState.board) {
      return {
        content: '**Connect 4**\n\nGame is initializing...',
      };
    }

    // Handle waiting state
    if (this.gameState.gameState === Connect4GameState.WAITING_FOR_PLAYER) {
      const timeLeft = this.getWaitingTimeLeft();
      let content = '```\n';
      content += '      ╔═══════════════════════════╗\n';
      content += '      ║      CONNECT 4 🔴 🟡     ║\n';
      content += '      ║                           ║\n';
      content += '      ║   Waiting for player...   ║\n';
      content += `      ║      ⏱️  0:${timeLeft.toString().padStart(2, '0')} left        ║\n`;
      content += '      ║                           ║\n';
      content += '      ╚═══════════════════════════╝\n';
      content += '```\n\n';
      const creatorId = this.gameState.creatorId || this.gameState.players.R || '';
      const creatorName = creatorId ? this.getSafePlayerName(creatorId) : 'Unknown Player';
      content += `Created by: ${creatorName}\n\n`;
      content += 'Waiting for another player to join...\n';
      content += 'Game will start with bot if no one joins.\n';

      const components = [
        {
          type: 'button' as const,
          id: 'join_game',
          label: '🎮 Join Game',
          style: 'primary' as const,
        },
        {
          type: 'button' as const,
          id: 'start_bot',
          label: '🤖 Play vs Bot',
          style: 'secondary' as const,
        },
        {
          type: 'button' as const,
          id: 'cancel_game',
          label: '❌',
          style: 'danger' as const,
        }
      ];

      return { content, components };
    }
    
    const board = this.gameState.board;
    const currentPlayerId = this.gameState.players[this.gameState.currentPlayer];
    const isYourTurn = forPlayer === currentPlayerId && !this.isPlayerBot(currentPlayerId);
    
    // Start with title
    let content = '🎮 CONNECT 4 🔴 🟡\n\n';
    
    // Add player info at the top
    const redPlayer = this.getSafePlayerName(this.gameState.players.R);
    const yellowPlayer = this.gameState.players.Y ? 
      (this.isPlayerBot(this.gameState.players.Y) ? '🤖 Bot' : this.getSafePlayerName(this.gameState.players.Y)) : 
      'Waiting...';
    content += `🔴 ${redPlayer}  vs  🟡 ${yellowPlayer}\n`;
    
    // Add turn info
    if (this.isEnded || this.gameState.gameState === Connect4GameState.GAME_OVER) {
      content += '🏆 Game Over!\n';
    } else {
      const currentColor = this.gameState.currentPlayer === 'R' ? '🔴' : '🟡';
      const currentName = this.isPlayerBot(currentPlayerId) ? '🤖 Bot' : this.getSafePlayerName(currentPlayerId);
      content += `Current Turn: ${currentColor} ${currentName}`;
      
      if (isYourTurn) {
        content += ' - Your turn!';
      } else if (this.isPlayerBot(currentPlayerId)) {
        content += ' - ⏳ Thinking...';
      }
      content += '\n';
    }
    
    // Create column buttons here (always visible during gameplay)
    const components = [];
    if (!this.isEnded && this.gameState.gameState === Connect4GameState.PLAYING) {
      // Show buttons for human players only (not when bot is thinking)
      const showButtons = !this.isPlayerBot(currentPlayerId);
      
      if (showButtons) {
        // Unicode button emojis for better button styling
        const unicodeButtons = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];
        
        for (let col = 0; col < this.COLS; col++) {
          const isFull = board[0][col] !== null;
          const buttonStyle = isFull ? 'secondary' : (isYourTurn ? 'success' : 'primary');
          components.push({
            type: 'button' as const,
            id: `col_${col}`,
            label: unicodeButtons[col],
            style: buttonStyle as any,
            disabled: isFull || !isYourTurn,
          });
        }
        
        // Add cancel button on a new row
        components.push({
          type: 'button' as const,
          id: 'cancel_game',
          label: '❌',
          style: 'danger' as const,
          disabled: false,
        });
      }
    }
    
    // Add a line break before the board
    content += '\n';

    // Create board display
    let boardDisplay = '```\n';
    
    // Board rows (no borders on sides)
    for (let row = 0; row < this.ROWS; row++) {
      boardDisplay += '       ';  // Add 7 spaces prefix
      for (let col = 0; col < this.COLS; col++) {
        const cell = board[row][col];
        let disc = '⚫';
        
        if (cell === 'R') disc = '🔴';
        else if (cell === 'Y') disc = '🟡';
        
        boardDisplay += disc;
        if (col < this.COLS - 1) boardDisplay += ' ';
      }
      boardDisplay += '\n';
    }
    
    boardDisplay += '      ╠═══════════════════════╣\n';
    boardDisplay += '      ║  1  2  3  4  5  6  7  ║\n';
    boardDisplay += '      ╚═══════════════════════╝\n';
    boardDisplay += '```';


    // Add board to content
    content += boardDisplay;
    
    // Last move indicator
    if (this.gameState.lastMove) {
      content += `\n_Last move: Column ${this.gameState.lastMove.col + 1}_`;
    }

    return {
      content,
      components: components.length > 0 ? components : undefined,
    };
  }

  renderHelp(): UIMessage {
    return {
      content: `**How to Play Connect 4**\n\n` +
        `• Players take turns dropping colored discs into a 7-column, 6-row grid\n` +
        `• Discs fall to the lowest available position in the column\n` +
        `• The first player to get 4 discs in a row wins!\n` +
        `• Rows can be horizontal, vertical, or diagonal\n` +
        `• If the grid fills up with no winner, it's a draw\n\n` +
        `**Commands**\n` +
        `• Click a column number (1-7) to drop your disc\n` +
        `• Use \`/quit\` to leave the game`,
    };
  }

  renderStats(): UIMessage {
    const scores = this.getScores();

    return {
      content: `**Game Statistics**\n\n` +
        `**Players**\n` +
        `🔴 ${this.getSafePlayerName(this.gameState.players.R)}: ${scores[this.gameState.players.R] || 0} points\n` +
        `🟡 ${this.getSafePlayerName(this.gameState.players.Y)}: ${scores[this.gameState.players.Y] || 0} points\n` +
        `\n**Turns Played: ${this.turnCount}**`,
    };
  }

  supportsAI(): boolean {
    return true;
  }

  async makeBotMove(): Promise<MoveResult> {
    // Use the stored bot difficulty or default to intermediate
    const difficulty = this.gameState.botDifficulty || AIDifficulty.Intermediate;
    
    // Small delay to make bot feel more natural
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return this.makeAIMove(difficulty);
  }

  async makeAIMove(difficulty: AIDifficulty): Promise<MoveResult> {
    const aiPlayerId = this.gameState.players[this.gameState.currentPlayer];
    
    let move;
    switch (difficulty) {
      case AIDifficulty.Beginner:
        move = this.getRandomMove();
        break;
      case AIDifficulty.Intermediate:
        move = this.getIntermediateMove();
        break;
      case AIDifficulty.Advanced:
      case AIDifficulty.Master:
        move = this.getBestMove();
        break;
      default:
        move = this.getRandomMove();
    }

    if (!move) {
      throw new Error('No valid moves available');
    }

    return this.makeMove(aiPlayerId, move);
  }

  protected getCurrentPlayer(): string | undefined {
    return this.gameState.players[this.gameState.currentPlayer];
  }

  protected getPlayerStates(): any[] {
    return Object.entries(this.gameState.players).map(([color, playerId]) => ({
      playerId,
      color,
      isActive: true,
    }));
  }

  protected getScores(): Record<string, number> {
    // Connect4 doesn't have scores during the game
    return {};
  }

  private getPlayerColor(playerId: string): 'R' | 'Y' {
    return this.gameState.players.R === playerId ? 'R' : 'Y';
  }

  override getPlayerName(playerId: string): string {
    if (this.isPlayerBot(playerId)) {
      return '🤖 Bot';
    }
    return super.getPlayerName(playerId);
  }

  private checkWin(row: number, col: number, color: string): boolean {
    const board = this.gameState.board;

    // Check all four directions
    const directions = [
      [[0, 1], [0, -1]], // Horizontal
      [[1, 0], [-1, 0]], // Vertical
      [[1, 1], [-1, -1]], // Diagonal \
      [[1, -1], [-1, 1]] // Diagonal /
    ];

    for (const direction of directions) {
      let count = 1; // Include the piece just placed

      // Check both directions
      for (const [dr, dc] of direction) {
        let r = row + dr;
        let c = col + dc;

        while (r >= 0 && r < this.ROWS && c >= 0 && c < this.COLS && board[r][c] === color) {
          count++;
          r += dr;
          c += dc;
        }
      }

      if (count >= 4) {
        return true;
      }
    }

    return false;
  }

  private checkDraw(): boolean {
    // Check if top row is full
    for (let col = 0; col < this.COLS; col++) {
      if (this.gameState.board[0][col] === null) {
        return false;
      }
    }
    return true;
  }

  private getRandomMove(): { col: number } | null {
    const validCols: number[] = [];

    for (let col = 0; col < this.COLS; col++) {
      if (this.gameState.board[0][col] === null) {
        validCols.push(col);
      }
    }

    if (validCols.length === 0) {
      return null;
    }

    return { col: validCols[Math.floor(Math.random() * validCols.length)] };
  }

  private getIntermediateMove(): { col: number } | null {
    const color = this.gameState.currentPlayer;
    const opponentColor = color === 'R' ? 'Y' : 'R';

    // Try to win
    const winMove = this.findWinningMove(color);
    if (winMove !== null) return { col: winMove };

    // Try to block opponent
    const blockMove = this.findWinningMove(opponentColor);
    if (blockMove !== null) return { col: blockMove };

    // Otherwise random
    return this.getRandomMove();
  }

  private getBestMove(): { col: number } | null {
    const color = this.gameState.currentPlayer;
    const opponentColor = color === 'R' ? 'Y' : 'R';

    // Try to win
    const winMove = this.findWinningMove(color);
    if (winMove !== null) return { col: winMove };

    // Try to block opponent
    const blockMove = this.findWinningMove(opponentColor);
    if (blockMove !== null) return { col: blockMove };

    // Prefer center columns
    const centerCols = [3, 2, 4, 1, 5, 0, 6];
    for (const col of centerCols) {
      if (this.gameState.board[0][col] === null) {
        return { col };
      }
    }

    return this.getRandomMove();
  }

  private findWinningMove(color: string): number | null {
    for (let col = 0; col < this.COLS; col++) {
      if (this.gameState.board[0][col] !== null) continue;

      // Find where the piece would land
      let row = -1;
      for (let r = this.ROWS - 1; r >= 0; r--) {
        if (this.gameState.board[r][col] === null) {
          row = r;
          break;
        }
      }

      if (row === -1) continue;

      // Simulate move
      this.gameState.board[row][col] = color;
      const wins = this.checkWin(row, col, color);
      this.gameState.board[row][col] = null;

      if (wins) {
        return col;
      }
    }
    return null;
  }
}