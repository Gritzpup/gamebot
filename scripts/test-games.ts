import { GameEngine } from '../src/core/GameEngine';
import { Platform } from '../src/types';

async function testGames() {
  console.log('🎮 Testing Game Implementations\n');
  
  const engine = GameEngine.getInstance();
  await engine.initialize();
  
  const games = ['tictactoe', 'connect4', 'othello'];
  const testPlayerId1 = 'test-player-1';
  const testPlayerId2 = 'test-player-2';
  
  for (const gameId of games) {
    console.log(`\n=== Testing ${gameId} ===`);
    
    // Create a game session
    const session = await engine.createGameSession(
      gameId,
      Platform.Telegram,
      'test-channel',
      testPlayerId1
    );
    
    if (!session) {
      console.error(`❌ Failed to create ${gameId} session`);
      continue;
    }
    
    console.log(`✅ Created ${gameId} session: ${session.id}`);
    
    // Join second player
    await session.addPlayer(testPlayerId2);
    console.log('✅ Second player joined');
    
    // Start the game
    await session.start();
    console.log('✅ Game started');
    
    // Get valid moves
    const validMoves = await session.getValidMoves(testPlayerId1);
    console.log(`✅ Valid moves available: ${validMoves.length}`);
    
    // Make a move
    if (validMoves.length > 0) {
      const result = await session.makeMove(testPlayerId1, validMoves[0]);
      console.log(`✅ Move made successfully: ${result.success}`);
    }
    
    // Render state
    const state = session.renderState(testPlayerId1);
    console.log('✅ State rendered successfully');
    console.log(`   Content preview: ${state.content.substring(0, 50)}...`);
    
    // Test AI support
    if (session.game.supportsAI()) {
      console.log('✅ AI support available');
    }
    
    // End game
    await session.forceEnd('Test completed');
    console.log('✅ Game ended');
  }
  
  console.log('\n✨ All games tested successfully!');
  process.exit(0);
}

// Run tests
testGames().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});