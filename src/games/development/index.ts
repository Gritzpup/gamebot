// Export all games in development
// Add new games here as you develop them

// Example:
// export { Chess } from './board-games/Chess';
// export { Poker } from './card-games/Poker';

export { TicTacToe } from './board-games/TicTacToe';

export const developmentGames: Array<{ id: string; name: string; path: string }> = [
  { id: 'tic-tac-toe', name: 'Tic Tac Toe', path: './board-games/TicTacToe' },
  // { id: 'chess', name: 'Chess', path: './board-games/Chess' },
  // { id: 'poker', name: 'Poker', path: './card-games/Poker' },
];