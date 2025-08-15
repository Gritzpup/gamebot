import { BaseGame } from '../../BaseGame';
import {
  GameCategory,
  GameDifficulty,
  MoveResult,
  AIDifficulty,
  GameEndReason
} from '../../../types/game.types';
import { UIMessage } from '../../../types';

enum TicTacToeGameState {
  WAITING_FOR_PLAYER = 'waiting_for_player',
  PLAYING = 'playing',
  GAME_OVER = 'game_over'
}

interface TicTacToeState {
  board: (string | null)[][];
  currentPlayer: 'X' | 'O';
  players: {
    X: string;
    O: string;
  };
  gameState: TicTacToeGameState;
  waitingStartTime?: number;
  isVsBot?: boolean;
  botDifficulty?: AIDifficulty;
  creatorId?: string;
  winnerId?: string;
  isDraw?: boolean;
}

export class TicTacToe extends BaseGame {
  id = 'tic-tac-toe';
  name = 'Tic Tac Toe';
  description = 'Classic 3x3 grid game. Get three in a row to win!';
  category = GameCategory.BoardGames;
  minPlayers = 2;
  maxPlayers = 2;
  estimatedDuration = 5;
  difficulty = GameDifficulty.Easy;

  protected createInitialState(): TicTacToeState {
    return {
      board: [
        [null, null, null],
        [null, null, null],
        [null, null, null]
      ],
      currentPlayer: 'X',
      players: {
        X: '',
        O: ''
      },
      gameState: TicTacToeGameState.WAITING_FOR_PLAYER,
      waitingStartTime: Date.now(),
      creatorId: ''
    };
  }

  protected onGameStart(): void {
    const players = this.getPlayers();
    
    // Set first player if not already set
    if (players.length > 0 && !this.gameState.players.X) {
      this.gameState.players.X = players[0];
      this.gameState.creatorId = players[0];
    }
    
    // Set second player if we have one
    if (players.length > 1) {
      this.gameState.players.O = players[1];
      this.gameState.gameState = TicTacToeGameState.PLAYING;
    }
  }

  // Method to handle second player joining or bot activation
  async handlePlayerJoin(playerId: string): Promise<void> {
    if (this.gameState.gameState === TicTacToeGameState.WAITING_FOR_PLAYER) {
      this.gameState.players.O = playerId;
      this.gameState.gameState = TicTacToeGameState.PLAYING;
      this.gameState.isVsBot = false;
    }
  }

  // Method to start bot game
  async startBotGame(difficulty: AIDifficulty = AIDifficulty.Intermediate): Promise<void> {
    if (this.gameState.gameState === TicTacToeGameState.WAITING_FOR_PLAYER) {
      const botId = 'bot_' + Date.now();
      this.gameState.players.O = botId;
      this.gameState.gameState = TicTacToeGameState.PLAYING;
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
    if (this.gameState.gameState !== TicTacToeGameState.WAITING_FOR_PLAYER) {
      return 0;
    }
    const elapsed = Date.now() - (this.gameState.waitingStartTime || 0);
    const remaining = Math.max(0, 10000 - elapsed);
    return Math.ceil(remaining / 1000);
  }

  async processInteraction(interaction: any): Promise<MoveResult | null> {
    // Handle waiting room buttons
    if (this.gameState.gameState === TicTacToeGameState.WAITING_FOR_PLAYER) {
      if (interaction.data?.id === 'join_game') {
        // Check if player is not the creator
        if (interaction.userId === this.gameState.players.X) {
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
      if (playerId !== this.gameState.players.X && playerId !== this.gameState.players.O) {
        return {
          success: false,
          message: "You're not in this game!"
        };
      }
      
      const cancellingPlayer = this.getSafePlayerName(playerId);
      this.gameState.gameState = TicTacToeGameState.GAME_OVER;
      await this.end(GameEndReason.PlayerQuit);
      return {
        success: true,
        gameEnded: true,
        message: `Game cancelled by ${cancellingPlayer}`,
        stateChanged: true
      };
    }
    
    // Handle move buttons during game
    if (interaction.data?.id && interaction.data.id.startsWith('move_')) {
      const [_, row, col] = interaction.data.id.split('_');
      return this.makeMove(interaction.userId, { row: parseInt(row), col: parseInt(col) });
    }
    
    return null;
  }

  async validateMove(playerId: string, move: any): Promise<boolean> {
    // Check if game is in playing state
    if (this.gameState.gameState !== TicTacToeGameState.PLAYING) {
      return false;
    }

    // Check if it's the player's turn
    if (!this.isPlayerTurn(playerId)) {
      return false;
    }

    // Check if move has valid coordinates
    if (!move || typeof move.row !== 'number' || typeof move.col !== 'number') {
      return false;
    }

    const { row, col } = move;

    // Check bounds
    if (row < 0 || row > 2 || col < 0 || col > 2) {
      return false;
    }

    // Check if cell is empty
    return this.gameState.board[row][col] === null;
  }

  async makeMove(playerId: string, move: any): Promise<MoveResult> {
    // Check if game is in playing state
    if (this.gameState.gameState !== TicTacToeGameState.PLAYING) {
      return {
        success: false,
        message: 'Game is not in playing state'
      };
    }

    const { row, col } = move;
    const symbol = this.getPlayerSymbol(playerId);

    // Make the move
    this.gameState.board[row][col] = symbol;
    this.advanceTurn();

    // Check for win
    if (this.checkWin(symbol)) {
      this.gameState.gameState = TicTacToeGameState.GAME_OVER;
      this.gameState.winnerId = playerId;
      await this.end(GameEndReason.NormalEnd);
      return {
        success: true,
        gameEnded: true,
        winner: playerId,
        message: `${this.getSafePlayerName(playerId)} wins!`
      };
    }

    // Check for draw
    if (this.checkDraw()) {
      this.gameState.gameState = TicTacToeGameState.GAME_OVER;
      this.gameState.isDraw = true;
      await this.end(GameEndReason.NormalEnd);
      return {
        success: true,
        gameEnded: true,
        isDraw: true,
        message: "It's a draw!"
      };
    }

    // Switch players
    this.gameState.currentPlayer = this.gameState.currentPlayer === 'X' ? 'O' : 'X';
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

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (this.gameState.board[row][col] === null) {
          moves.push({ row, col });
        }
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
        this.gameState.players.X = playerIds[0];
      }
    }

    // Ensure game state is initialized
    if (!this.gameState || !this.gameState.board) {
      return {
        content: '**Tic Tac Toe**\n\nGame is initializing...',
      };
    }

    // Handle waiting state
    if (this.gameState.gameState === TicTacToeGameState.WAITING_FOR_PLAYER) {
      const timeLeft = this.getWaitingTimeLeft();
      let content = '```\n';
      content += '      ╔═══════════════════════════╗\n';
      content += '      ║     TIC TAC TOE ❌ ⭕    ║\n';
      content += '      ║                           ║\n';
      content += '      ║   Waiting for player...   ║\n';
      content += `      ║      ⏱️  0:${timeLeft.toString().padStart(2, '0')} left        ║\n`;
      content += '      ║                           ║\n';
      content += '      ╚═══════════════════════════╝\n';
      content += '```\n\n';
      const creatorId = this.gameState.creatorId || this.gameState.players.X || '';
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
    let content = '🎮 TIC TAC TOE ❌ ⭕\n\n';

    // Add player info at the top
    const xPlayer = this.getSafePlayerName(this.gameState.players.X);
    const oPlayer = this.gameState.players.O ? 
      (this.isPlayerBot(this.gameState.players.O) ? '🤖 Bot' : this.getSafePlayerName(this.gameState.players.O)) : 
      'Waiting...';
    content += `❌ ${xPlayer}  vs  ⭕ ${oPlayer}\n`;

    // Add turn info
    if (this.isEnded || this.gameState.gameState === TicTacToeGameState.GAME_OVER) {
      content += '🏆 Game Over! ';
      
      // Check who won
      if (this.gameState.isDraw) {
        content += "It's a draw!\n";
      } else if (this.gameState.winnerId) {
        const winnerSymbol = this.gameState.winnerId === this.gameState.players.X ? '❌' : '⭕';
        const winnerName = this.getSafePlayerName(this.gameState.winnerId);
        content += `${winnerSymbol} ${winnerName} wins!\n`;
      } else {
        // Game was cancelled or ended without a winner
        content += '\n';
      }
    } else {
      const currentSymbol = this.gameState.currentPlayer === 'X' ? '❌' : '⭕';
      const currentName = this.isPlayerBot(currentPlayerId) ? '🤖 Bot' : this.getSafePlayerName(currentPlayerId);
      content += `Current Turn: ${currentSymbol} ${currentName}`;
      
      if (isYourTurn) {
        content += ' - Your turn!';
      } else if (this.isPlayerBot(currentPlayerId)) {
        content += ' - ⏳ Thinking...';
      }
      content += '\n';
    }

    // Add a line break before the board
    content += '\n';

    // Create board display
    let boardDisplay = '```\n';
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cell = board[row][col];
        const symbol = cell === 'X' ? '❌' : cell === 'O' ? '⭕' : '⬜';
        boardDisplay += ` ${symbol} `;
        if (col < 2) boardDisplay += '│';
      }
      if (row < 2) boardDisplay += '\n───┼───┼───\n';
    }
    boardDisplay += '\n```';
    content += boardDisplay;

    // Create button grid for moves
    const components = [];
    if (!this.isEnded && this.gameState.gameState === TicTacToeGameState.PLAYING) {
      // Show buttons for human players only (not when bot is thinking)
      const showButtons = !this.isPlayerBot(currentPlayerId);
      
      if (showButtons) {
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            if (board[row][col] === null) {
              components.push({
                type: 'button' as const,
                id: `move_${row}_${col}`,
                label: '⬜',
                style: isYourTurn ? 'success' as const : 'secondary' as const,
                disabled: !isYourTurn,
              });
            } else {
              components.push({
                type: 'button' as const,
                id: `occupied_${row}_${col}`,
                label: board[row][col] === 'X' ? '❌' : '⭕',
                style: board[row][col] === 'X' ? 'primary' as const : 'danger' as const,
                disabled: true,
              });
            }
          }
        }

        // Add cancel button
        components.push({
          type: 'button' as const,
          id: 'cancel_game',
          label: '❌ Cancel',
          style: 'danger' as const,
          disabled: false,
        });
      }
    }

    return {
      content,
      components: components.length > 0 ? components : undefined,
    };
  }

  async makeBotMove(): Promise<MoveResult> {
    const botPlayerId = this.gameState.players[this.gameState.currentPlayer];
    const difficulty = this.gameState.botDifficulty || AIDifficulty.Intermediate;
    
    // Small delay to simulate thinking
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
    
    let move;
    switch (difficulty) {
      case AIDifficulty.Beginner:
        move = this.getRandomMove();
        break;
      case AIDifficulty.Intermediate:
        move = Math.random() < 0.5 ? this.getRandomMove() : this.getBestMove();
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

    return this.makeMove(botPlayerId, move);
  }

  renderHelp(): UIMessage {
    return {
      content: `**How to Play Tic Tac Toe**\n\n` +
        `• Players take turns placing their symbol (X or O) on a 3x3 grid\n` +
        `• The first player to get 3 of their symbols in a row wins\n` +
        `• Rows can be horizontal, vertical, or diagonal\n` +
        `• If all spaces are filled and no one has won, it's a draw\n\n` +
        `**Commands**\n` +
        `• Click on an empty space to make your move\n` +
        `• Use \`/quit\` to leave the game`,
    };
  }

  renderStats(): UIMessage {
    const players = this.getPlayers();
    const scores = this.getScores();

    return {
      content: `**Game Statistics**\n\n` +
        `**Players**\n` +
        players.map(id => `• ${this.getSafePlayerName(id)}: ${scores[id] || 0} points`).join('\n') +
        `\n\n**Turns Played: ${this.turnCount}**`,
    };
  }

  supportsAI(): boolean {
    return true;
  }

  async makeAIMove(difficulty: AIDifficulty): Promise<MoveResult> {
    return this.makeBotMove();
  }

  protected getCurrentPlayer(): string | undefined {
    return this.gameState.players[this.gameState.currentPlayer];
  }

  protected getPlayerStates(): any[] {
    return Object.entries(this.gameState.players).map(([symbol, playerId]) => ({
      playerId,
      symbol,
      isActive: true,
    }));
  }

  protected getScores(): Record<string, number> {
    // TicTacToe doesn't have scores during the game
    return {};
  }

  private getPlayerSymbol(playerId: string): 'X' | 'O' {
    return this.gameState.players.X === playerId ? 'X' : 'O';
  }

  private checkWin(symbol: string): boolean {
    const board = this.gameState.board;

    // Check rows
    for (let row = 0; row < 3; row++) {
      if (board[row][0] === symbol && board[row][1] === symbol && board[row][2] === symbol) {
        return true;
      }
    }

    // Check columns
    for (let col = 0; col < 3; col++) {
      if (board[0][col] === symbol && board[1][col] === symbol && board[2][col] === symbol) {
        return true;
      }
    }

    // Check diagonals
    if (board[0][0] === symbol && board[1][1] === symbol && board[2][2] === symbol) {
      return true;
    }
    if (board[0][2] === symbol && board[1][1] === symbol && board[2][0] === symbol) {
      return true;
    }

    return false;
  }

  private checkDraw(): boolean {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (this.gameState.board[row][col] === null) {
          return false;
        }
      }
    }
    return true;
  }

  private getRandomMove(): { row: number; col: number } | null {
    const validMoves: { row: number; col: number }[] = [];

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (this.gameState.board[row][col] === null) {
          validMoves.push({ row, col });
        }
      }
    }

    if (validMoves.length === 0) {
      return null;
    }

    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  private getBestMove(): { row: number; col: number } | null {
    // Simple AI: Try to win, block opponent, or take center/corners
    const symbol = this.gameState.currentPlayer;
    const opponentSymbol = symbol === 'X' ? 'O' : 'X';

    // Try to win
    const winMove = this.findWinningMove(symbol);
    if (winMove) return winMove;

    // Try to block opponent
    const blockMove = this.findWinningMove(opponentSymbol);
    if (blockMove) return blockMove;

    // Take center
    if (this.gameState.board[1][1] === null) {
      return { row: 1, col: 1 };
    }

    // Take corners
    const corners = [
      { row: 0, col: 0 },
      { row: 0, col: 2 },
      { row: 2, col: 0 },
      { row: 2, col: 2 }
    ];
    const availableCorners = corners.filter(c => 
      this.gameState.board[c.row][c.col] === null
    );
    if (availableCorners.length > 0) {
      return availableCorners[Math.floor(Math.random() * availableCorners.length)];
    }

    // Take any available space
    return this.getRandomMove();
  }

  private findWinningMove(symbol: string): { row: number; col: number } | null {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (this.gameState.board[row][col] === null) {
          // Simulate move
          this.gameState.board[row][col] = symbol;
          const wins = this.checkWin(symbol);
          this.gameState.board[row][col] = null;

          if (wins) {
            return { row, col };
          }
        }
      }
    }
    return null;
  }
}