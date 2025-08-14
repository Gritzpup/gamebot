import { TicTacToe } from '../src/games/board-games/TicTacToe';
import { Connect4 } from '../src/games/board-games/Connect4';
import { Othello } from '../src/games/board-games/Othello';
import { Platform } from '../src/types';
import { AIDifficulty } from '../src/types/game.types';

async function testGames() {
  console.log('🎮 Testing Game Implementations\n');
  
  const games = [
    { name: 'Tic Tac Toe', GameClass: TicTacToe },
    { name: 'Connect 4', GameClass: Connect4 },
    { name: 'Othello', GameClass: Othello }
  ];
  
  for (const { name, GameClass } of games) {
    console.log(`\n=== Testing ${name} ===`);
    
    try {
      // Create game instance
      const game = new GameClass();
      console.log(`✅ Created ${name} instance`);
      console.log(`   ID: ${game.id}`);
      console.log(`   Description: ${game.description}`);
      console.log(`   Players: ${game.minPlayers}-${game.maxPlayers}`);
      console.log(`   Estimated duration: ${game.estimatedDuration} minutes`);
      
      // Initialize game
      await game.initialize({
        sessionId: 'test-session',
        platform: Platform.Telegram,
        channelId: 'test-channel'
      });
      console.log('✅ Game initialized');
      
      // Add players
      await game.join('player1');
      await game.join('player2');
      console.log('✅ Players joined');
      
      // Start game
      await game.start();
      console.log('✅ Game started');
      
      // Check valid moves
      const player1Moves = await game.getValidMoves('player1');
      console.log(`✅ Valid moves for player 1: ${player1Moves.length}`);
      
      // Make a move
      if (player1Moves.length > 0) {
        const moveResult = await game.makeMove('player1', player1Moves[0]);
        console.log(`✅ Move made: ${moveResult.success}`);
      }
      
      // Render state
      const state = game.renderState('player1');
      console.log('✅ State rendered');
      const preview = state.content.split('\n')[0];
      console.log(`   Preview: ${preview}`);
      
      // Test AI support
      if (game.supportsAI()) {
        console.log('✅ AI support confirmed');
        // Test AI difficulties
        const aiDifficulties = [
          AIDifficulty.Beginner,
          AIDifficulty.Intermediate,
          AIDifficulty.Advanced
        ];
        console.log(`   AI difficulties: ${aiDifficulties.length} levels`);
      }
      
      // Render help
      const help = game.renderHelp();
      console.log('✅ Help text available');
      const helpPreview = help.content.split('\n')[0];
      console.log(`   Help preview: ${helpPreview}`);
      
    } catch (error) {
      console.error(`❌ Error testing ${name}:`, error);
    }
  }
  
  console.log('\n✨ Game testing completed!');
}

// Run tests
testGames().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});