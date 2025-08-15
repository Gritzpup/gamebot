// Export all production-ready games
export { Connect4 } from './board-games/Connect4';
export { TicTacToe } from './board-games/TicTacToe';
export { Wordle } from './word-games/Wordle';

// Game metadata for easy registration
export const productionGames = [
  { id: 'connect-4', name: 'Connect 4', path: './board-games/Connect4' },
  { id: 'tic-tac-toe', name: 'Tic Tac Toe', path: './board-games/TicTacToe' },
  { id: 'wordle', name: 'Wordle', path: './word-games/Wordle' },
];