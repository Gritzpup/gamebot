import { Database } from '../src/services/database/Database';
import { logger } from '../src/utils/logger';
import { databaseConfig } from '../src/config';
import fs from 'fs';
import path from 'path';

async function setup() {
  console.log('🎮 GameBot Database Setup\n');
  
  try {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log('✅ Created logs directory');
    }
    
    // Initialize database
    console.log('📊 Initializing database...');
    const database = Database.getInstance();
    await database.initialize();
    console.log('✅ Database initialized successfully');
    
    // Create sample data (optional)
    console.log('\n📝 Database schema created:');
    console.log('  - players');
    console.log('  - player_stats');
    console.log('  - game_sessions');
    console.log('  - game_players');
    
    await database.close();
    
    console.log('\n✨ Setup complete! Your GameBot is ready to use.');
    console.log('\n📋 Next steps:');
    console.log('  1. Make sure Redis is running: redis-server');
    console.log('  2. Complete your .env configuration');
    console.log('  3. Run the bot: npm run dev');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run setup
setup();