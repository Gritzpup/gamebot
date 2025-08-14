import { BaseGame } from '../BaseGame';
import {
  GameCategory,
  GameDifficulty,
  MoveResult,
  AIDifficulty
} from '../../types/game.types';
import { UIMessage } from '../../types';

interface TicTacToeState {
  board: (string | null)[][];
  currentPlayer: 'X' | 'O';
  players: {
    X: string;
    O: string;
  };
}

export class TicTacToe extends BaseGame {
  id = 'tictactoe';
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
      }
    };
  }

  protected onGameStart(): void {
    const players = this.getPlayers();
    this.gameState.players.X = players[0];
    this.gameState.players.O = players[1];
  }

  async validateMove(playerId: string, move: any): Promise<boolean> {
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
    const { row, col } = move;
    const symbol = this.getPlayerSymbol(playerId);

    // Make the move
    this.gameState.board[row][col] = symbol;
    this.advanceTurn();

    // Check for win
    if (this.checkWin(symbol)) {
      return {
        success: true,
        gameEnded: true,
        winner: playerId,
        message: `${this.getSafePlayerName(playerId)} wins!`
      };
    }

    // Check for draw
    if (this.checkDraw()) {
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

    return {
      success: true,
      nextPlayer: nextPlayerId,
      message: `${this.getSafePlayerName(nextPlayerId)}'s turn`
    };
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
    const board = this.gameState.board;
    const currentPlayerId = this.gameState.players[this.gameState.currentPlayer];
    const isYourTurn = forPlayer === currentPlayerId;

    // Create board display
    let boardDisplay = '```\n';
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cell = board[row][col] || '·';
        boardDisplay += ` ${cell} `;
        if (col < 2) boardDisplay += '│';
      }
      if (row < 2) boardDisplay += '\n───┼───┼───\n';
    }
    boardDisplay += '\n```';

    // Create message
    let content = `**Tic Tac Toe**\n\n`;
    content += boardDisplay + '\n\n';
    
    if (this.isEnded) {
      content += '**Game Over!**\n';
    } else {
      content += `**Current Turn: ${this.getSafePlayerName(currentPlayerId)} (${this.gameState.currentPlayer})**\n`;
      if (isYourTurn) {
        content += '**Your turn!** Click a button to make your move.';
      }
    }

    // Create button grid for moves
    const components = [];
    if (!this.isEnded && isYourTurn) {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (board[row][col] === null) {
            components.push({
              type: 'button' as const,
              id: `move_${row}_${col}`,
              label: '·',
              style: 'secondary' as const,
            });
          } else {
            components.push({
              type: 'button' as const,
              id: `occupied_${row}_${col}`,
              label: board[row][col]!,
              style: board[row][col] === 'X' ? 'primary' as const : 'success' as const,
              disabled: true,
            });
          }
        }
      }
    }

    return {
      content,
      components: components.length > 0 ? components : undefined,
    };
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
    const aiPlayerId = this.gameState.players[this.gameState.currentPlayer];
    
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

    return this.makeMove(aiPlayerId, move);
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