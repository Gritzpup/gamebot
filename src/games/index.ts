// Board Games
export { Connect4 } from './board-games/Connect4';
export { TicTacToe } from './board-games/TicTacToe';
export { Othello } from './board-games/Othello';

// Word Games
export { Wordle } from './word-games/Wordle';

// Card Games
export { UnoEnhanced } from './card-games/UnoEnhanced';
export { UnoEnhanced as Uno } from './card-games/UnoEnhanced'; // For compatibility

// Game metadata for registration
export const games = [
  // Board Games
  {
    id: 'connect-4',
    name: 'Connect 4',
    category: 'board-games',
    description: 'Classic Connect 4 game',
    minPlayers: 2,
    maxPlayers: 2,
  },
  {
    id: 'tictactoe',
    name: 'Tic Tac Toe',
    category: 'board-games',
    description: 'Classic Tic Tac Toe game',
    minPlayers: 1,
    maxPlayers: 2,
  },
  {
    id: 'othello',
    name: 'Othello',
    category: 'board-games',
    description: 'Strategic board game also known as Reversi',
    minPlayers: 2,
    maxPlayers: 2,
  },
  // Word Games
  {
    id: 'wordle',
    name: 'Wordle',
    category: 'word-games',
    description: 'Guess the 5-letter word in 6 tries',
    minPlayers: 1,
    maxPlayers: 1,
  },
  // Card Games
  {
    id: 'uno',
    name: 'UNO',
    category: 'card-games',
    description: 'Classic card game - match colors and numbers!',
    minPlayers: 2,
    maxPlayers: 10,
  },
];