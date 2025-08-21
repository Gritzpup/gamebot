import { BaseGame } from '../BaseGame';
import {
  GameCategory,
  GameDifficulty,
  MoveResult,
  AIDifficulty
} from '../../types/game.types';
import { UIMessage } from '../../types';

interface OthelloState {
  board: (string | null)[][];
  currentPlayer: 'B' | 'W'; // Black or White
  players: {
    B: string;
    W: string;
  };
  validMoves: { row: number; col: number }[];
  lastMove?: { row: number; col: number };
  passCount: number;
}

export class Othello extends BaseGame {
  id = 'othello';
  name = 'Othello';
  description = 'Capture opponent pieces by surrounding them. Most pieces wins!';
  category = GameCategory.BoardGames;
  minPlayers = 2;
  maxPlayers = 2;
  estimatedDuration = 20;
  difficulty = GameDifficulty.Medium;

  private readonly SIZE = 8;

  protected createInitialState(): OthelloState {
    // Create empty board
    const board: (string | null)[][] = [];
    for (let row = 0; row < this.SIZE; row++) {
      board.push(new Array(this.SIZE).fill(null));
    }

    // Set starting positions
    const mid = Math.floor(this.SIZE / 2);
    board[mid - 1][mid - 1] = 'W';
    board[mid - 1][mid] = 'B';
    board[mid][mid - 1] = 'B';
    board[mid][mid] = 'W';

    return {
      board,
      currentPlayer: 'B',
      players: {
        B: '',
        W: ''
      },
      validMoves: [],
      passCount: 0
    };
  }

  protected onGameStart(): void {
    const players = this.getPlayers();
    this.gameState.players.B = players[0];
    this.gameState.players.W = players[1];
    this.updateValidMoves();
  }

  async validateMove(playerId: string, move: any): Promise<boolean> {
    // Check if it's the player's turn
    if (!this.isPlayerTurn(playerId)) {
      return false;
    }

    // Check if move is pass
    if (move && move.pass === true) {
      return this.gameState.validMoves.length === 0;
    }

    // Check if move has valid coordinates
    if (typeof move !== 'object' || typeof move.row !== 'number' || typeof move.col !== 'number') {
      return false;
    }

    const { row, col } = move;

    // Check if move is in valid moves list
    return this.gameState.validMoves.some((vm: any) => vm.row === row && vm.col === col);
  }

  async makeMove(playerId: string, move: any): Promise<MoveResult> {
    // Handle pass
    if (move && move.pass === true) {
      this.gameState.passCount++;
      
      // If both players pass consecutively, game ends
      if (this.gameState.passCount >= 2) {
        const winner = this.determineWinner();
        return {
          success: true,
          gameEnded: true,
          winner: winner.winner,
          isDraw: winner.isDraw,
          message: winner.message
        };
      }

      // Switch to other player
      this.gameState.currentPlayer = this.gameState.currentPlayer === 'B' ? 'W' : 'B';
      this.updateValidMoves();
      this.advanceTurn();

      const nextPlayerId = this.gameState.players[this.gameState.currentPlayer];
      return {
        success: true,
        nextPlayer: nextPlayerId,
        message: `${this.getSafePlayerName(playerId)} passed. ${this.getSafePlayerName(nextPlayerId)}'s turn`
      };
    }

    // Reset pass count on normal move
    this.gameState.passCount = 0;

    const { row, col } = move;
    const color = this.getPlayerColor(playerId);

    // Place the piece
    this.gameState.board[row][col] = color;
    this.gameState.lastMove = { row, col };

    // Flip pieces in all directions
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1], [1, 0], [1, 1]
    ];

    for (const [dr, dc] of directions) {
      this.flipPieces(row, col, dr, dc, color);
    }

    this.advanceTurn();

    // Switch players
    this.gameState.currentPlayer = this.gameState.currentPlayer === 'B' ? 'W' : 'B';
    this.updateValidMoves();

    // Check if next player has valid moves
    if (this.gameState.validMoves.length === 0) {
      // Current player must pass
      this.gameState.passCount++;
      
      // Switch back to other player
      this.gameState.currentPlayer = this.gameState.currentPlayer === 'B' ? 'W' : 'B';
      this.updateValidMoves();
      
      // If they also have no moves, game ends
      if (this.gameState.validMoves.length === 0) {
        const winner = this.determineWinner();
        return {
          success: true,
          gameEnded: true,
          winner: winner.winner,
          isDraw: winner.isDraw,
          message: winner.message
        };
      }
    }

    const nextPlayerId = this.gameState.players[this.gameState.currentPlayer];
    return {
      success: true,
      nextPlayer: nextPlayerId,
      message: `${this.getSafePlayerName(nextPlayerId)}'s turn`
    };
  }

  async getValidMoves(playerId: string): Promise<any[]> {
    if (!this.isPlayerTurn(playerId)) {
      return [];
    }

    return this.gameState.validMoves.map((move: any) => ({
      row: move.row,
      col: move.col
    }));
  }

  renderState(forPlayer?: string): UIMessage {
    const board = this.gameState.board;
    const currentPlayerId = this.gameState.players[this.gameState.currentPlayer];
    const isYourTurn = forPlayer === currentPlayerId;

    // Create board display
    let boardDisplay = '```\n';
    boardDisplay += '  A B C D E F G H\n';
    
    for (let row = 0; row < this.SIZE; row++) {
      boardDisplay += (row + 1) + ' ';
      for (let col = 0; col < this.SIZE; col++) {
        const cell = board[row][col];
        let piece = '·';
        
        if (cell === 'B') piece = '⚫';
        else if (cell === 'W') piece = '⚪';
        else if (this.gameState.validMoves.some((m: any) => m.row === row && m.col === col)) {
          piece = '◯'; // Show valid moves
        }
        
        if (this.gameState.lastMove && 
            this.gameState.lastMove.row === row && 
            this.gameState.lastMove.col === col) {
          piece = cell === 'B' ? '🔵' : '⚪'; // Highlight last move
        }
        
        boardDisplay += piece + ' ';
      }
      boardDisplay += '\n';
    }
    
    boardDisplay += '```';

    // Count pieces
    const counts = this.countPieces();

    // Create message
    let content = `**Othello**\n\n`;
    content += boardDisplay + '\n';
    
    // Player info
    const blackPlayer = this.getSafePlayerName(this.gameState.players.B);
    const whitePlayer = this.getSafePlayerName(this.gameState.players.W);
    content += `⚫ **${blackPlayer}**: ${counts.B} pieces\n`;
    content += `⚪ **${whitePlayer}**: ${counts.W} pieces\n\n`;
    
    if (this.isEnded) {
      content += '**Game Over!**\n';
    } else {
      const currentColor = this.gameState.currentPlayer === 'B' ? '⚫' : '⚪';
      content += `**Current Turn: ${currentColor} ${this.getSafePlayerName(currentPlayerId)}**\n`;
      
      if (isYourTurn) {
        if (this.gameState.validMoves.length === 0) {
          content += '**No valid moves!** You must pass.';
        } else {
          content += `**Your turn!** ${this.gameState.validMoves.length} valid moves available.`;
        }
      }
    }

    // Create move buttons
    const components = [];
    if (!this.isEnded && isYourTurn) {
      if (this.gameState.validMoves.length === 0) {
        // Pass button
        components.push({
          type: 'button' as const,
          id: 'pass',
          label: 'Pass Turn',
          style: 'primary' as const,
        });
      } else {
        // Create buttons for each valid move
        for (const move of this.gameState.validMoves.slice(0, 9)) {
          const col = String.fromCharCode(65 + move.col);
          const row = move.row + 1;
          components.push({
            type: 'button' as const,
            id: `move_${move.row}_${move.col}`,
            label: `${col}${row}`,
            style: 'primary' as const,
          });
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
      content: `**How to Play Othello**\n\n` +
        `• Each player takes turns placing discs on the board\n` +
        `• You must place a disc to capture opponent pieces\n` +
        `• Capture by surrounding opponent pieces in any direction\n` +
        `• All surrounded pieces flip to your color\n` +
        `• If you can't make a valid move, you must pass\n` +
        `• Game ends when no more moves are possible\n` +
        `• Player with the most pieces wins!\n\n` +
        `**Commands**\n` +
        `• Click a position (like A1 or D4) to place your disc\n` +
        `• Use \`/quit\` to leave the game`,
    };
  }

  renderStats(): UIMessage {
    const counts = this.countPieces();

    return {
      content: `**Game Statistics**\n\n` +
        `**Current Pieces**\n` +
        `⚫ ${this.getSafePlayerName(this.gameState.players.B)}: ${counts.B} pieces\n` +
        `⚪ ${this.getSafePlayerName(this.gameState.players.W)}: ${counts.W} pieces\n` +
        `\n**Turns Played: ${this.turnCount}**`,
    };
  }

  supportsAI(): boolean {
    return true;
  }

  async makeAIMove(difficulty: AIDifficulty): Promise<MoveResult> {
    const aiPlayerId = this.gameState.players[this.gameState.currentPlayer];
    
    // If no valid moves, must pass
    if (this.gameState.validMoves.length === 0) {
      return this.makeMove(aiPlayerId, { pass: true });
    }
    
    let move;
    switch (difficulty) {
      case AIDifficulty.Beginner:
        move = this.getRandomMove();
        break;
      case AIDifficulty.Intermediate:
        move = this.getGreedyMove();
        break;
      case AIDifficulty.Advanced:
      case AIDifficulty.Master:
        move = this.getStrategicMove();
        break;
      default:
        move = this.getRandomMove();
    }

    if (!move) {
      return this.makeMove(aiPlayerId, { pass: true });
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
    const counts = this.countPieces();
    return {
      [this.gameState.players.B]: counts.B,
      [this.gameState.players.W]: counts.W
    };
  }

  private getPlayerColor(playerId: string): 'B' | 'W' {
    return this.gameState.players.B === playerId ? 'B' : 'W';
  }

  private updateValidMoves(): void {
    this.gameState.validMoves = [];
    const color = this.gameState.currentPlayer;

    for (let row = 0; row < this.SIZE; row++) {
      for (let col = 0; col < this.SIZE; col++) {
        if (this.isValidMove(row, col, color)) {
          this.gameState.validMoves.push({ row, col });
        }
      }
    }
  }

  private isValidMove(row: number, col: number, color: string): boolean {
    // Must be empty
    if (this.gameState.board[row][col] !== null) {
      return false;
    }

    // Check all directions
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1], [1, 0], [1, 1]
    ];

    for (const [dr, dc] of directions) {
      if (this.canFlipInDirection(row, col, dr, dc, color)) {
        return true;
      }
    }

    return false;
  }

  private canFlipInDirection(row: number, col: number, dr: number, dc: number, color: string): boolean {
    const opponentColor = color === 'B' ? 'W' : 'B';
    let r = row + dr;
    let c = col + dc;
    let foundOpponent = false;

    while (r >= 0 && r < this.SIZE && c >= 0 && c < this.SIZE) {
      const cell = this.gameState.board[r][c];
      
      if (cell === null) {
        return false;
      }
      
      if (cell === opponentColor) {
        foundOpponent = true;
      } else if (cell === color && foundOpponent) {
        return true;
      } else {
        return false;
      }
      
      r += dr;
      c += dc;
    }

    return false;
  }

  private flipPieces(row: number, col: number, dr: number, dc: number, color: string): void {
    const toFlip: { row: number; col: number }[] = [];
    const opponentColor = color === 'B' ? 'W' : 'B';
    let r = row + dr;
    let c = col + dc;

    while (r >= 0 && r < this.SIZE && c >= 0 && c < this.SIZE) {
      const cell = this.gameState.board[r][c];
      
      if (cell === null) {
        return;
      }
      
      if (cell === opponentColor) {
        toFlip.push({ row: r, col: c });
      } else if (cell === color) {
        // Flip all pieces in between
        for (const pos of toFlip) {
          this.gameState.board[pos.row][pos.col] = color;
        }
        return;
      }
      
      r += dr;
      c += dc;
    }
  }

  private countPieces(): { B: number; W: number } {
    let black = 0;
    let white = 0;

    for (let row = 0; row < this.SIZE; row++) {
      for (let col = 0; col < this.SIZE; col++) {
        const cell = this.gameState.board[row][col];
        if (cell === 'B') black++;
        else if (cell === 'W') white++;
      }
    }

    return { B: black, W: white };
  }

  private determineWinner(): { winner?: string; isDraw: boolean; message: string } {
    const counts = this.countPieces();
    
    if (counts.B > counts.W) {
      return {
        winner: this.gameState.players.B,
        isDraw: false,
        message: `${this.getSafePlayerName(this.gameState.players.B)} wins with ${counts.B} pieces!`
      };
    } else if (counts.W > counts.B) {
      return {
        winner: this.gameState.players.W,
        isDraw: false,
        message: `${this.getSafePlayerName(this.gameState.players.W)} wins with ${counts.W} pieces!`
      };
    } else {
      return {
        isDraw: true,
        message: `It's a draw! Both players have ${counts.B} pieces.`
      };
    }
  }

  private getRandomMove(): { row: number; col: number } | null {
    if (this.gameState.validMoves.length === 0) {
      return null;
    }

    const index = Math.floor(Math.random() * this.gameState.validMoves.length);
    return this.gameState.validMoves[index];
  }

  private getGreedyMove(): { row: number; col: number } | null {
    if (this.gameState.validMoves.length === 0) {
      return null;
    }

    // Choose move that flips the most pieces
    let bestMove = this.gameState.validMoves[0];
    let maxFlips = 0;

    for (const move of this.gameState.validMoves) {
      const flips = this.countFlips(move.row, move.col, this.gameState.currentPlayer);
      if (flips > maxFlips) {
        maxFlips = flips;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private getStrategicMove(): { row: number; col: number } | null {
    if (this.gameState.validMoves.length === 0) {
      return null;
    }

    // Prioritize corners, then edges, then maximize flips
    const corners = [[0, 0], [0, 7], [7, 0], [7, 7]];
    
    // Check for corner moves
    for (const move of this.gameState.validMoves) {
      for (const [cr, cc] of corners) {
        if (move.row === cr && move.col === cc) {
          return move;
        }
      }
    }

    // Check for edge moves (avoiding X-squares near corners)
    const dangerZones = [[1, 1], [1, 6], [6, 1], [6, 6]];
    const edgeMoves = this.gameState.validMoves.filter((move: any) => {
      const isEdge = move.row === 0 || move.row === 7 || move.col === 0 || move.col === 7;
      const isDanger = dangerZones.some(([dr, dc]) => move.row === dr && move.col === dc);
      return isEdge && !isDanger;
    });

    if (edgeMoves.length > 0) {
      // Choose edge move that flips most pieces
      return this.getBestMoveByFlips(edgeMoves);
    }

    // Otherwise, choose move that flips most pieces
    return this.getGreedyMove();
  }

  private getBestMoveByFlips(moves: { row: number; col: number }[]): { row: number; col: number } {
    let bestMove = moves[0];
    let maxFlips = 0;

    for (const move of moves) {
      const flips = this.countFlips(move.row, move.col, this.gameState.currentPlayer);
      if (flips > maxFlips) {
        maxFlips = flips;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private countFlips(row: number, col: number, color: string): number {
    let total = 0;
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1], [1, 0], [1, 1]
    ];

    for (const [dr, dc] of directions) {
      total += this.countFlipsInDirection(row, col, dr, dc, color);
    }

    return total;
  }

  private countFlipsInDirection(row: number, col: number, dr: number, dc: number, color: string): number {
    const opponentColor = color === 'B' ? 'W' : 'B';
    let r = row + dr;
    let c = col + dc;
    let count = 0;

    while (r >= 0 && r < this.SIZE && c >= 0 && c < this.SIZE) {
      const cell = this.gameState.board[r][c];
      
      if (cell === null) {
        return 0;
      }
      
      if (cell === opponentColor) {
        count++;
      } else if (cell === color) {
        return count;
      }
      
      r += dr;
      c += dc;
    }

    return 0;
  }
}