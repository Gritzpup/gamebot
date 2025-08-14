// Export all production-ready games
export { Connect4 } from './board-games/Connect4';
export { TicTacToe } from './board-games/TicTacToe';

// Game metadata for easy registration
export const productionGames = [
  { id: 'connect4', name: 'Connect 4', path: './board-games/Connect4' },
  { id: 'tictactoe', name: 'Tic Tac Toe', path: './board-games/TicTacToe' },
];