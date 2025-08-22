import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.mtproto') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function setup() {
  console.log('🚀 Setting up GameBot MTProto...\n');
  
  const apiId = 21719550;
  const apiHash = 'e7665e0d065642b4d5d8cead6e113b07';
  const botToken = process.env.GAMEBOT_BOT_TOKEN;
  
  if (!botToken) {
    console.error('❌ Error: GAMEBOT_BOT_TOKEN not found in environment variables!');
    console.error('Please check your mtproto/.env.mtproto file');
    process.exit(1);
  }
  
  console.log(`📋 Configuration:`);
  console.log(`   API ID: ${apiId}`);
  console.log(`   API Hash: ${apiHash.substring(0, 8)}...`);
  console.log(`   Bot Token: ${botToken.substring(0, 20)}...`);
  console.log('');
  
  // Check if session already exists
  const sessionPath = path.join(__dirname, 'sessions', 'gamebot_main.session');
  if (fs.existsSync(sessionPath)) {
    const answer = await question('⚠️  Session file already exists. Overwrite? (y/N): ');
    if (answer.toLowerCase() !== 'y') {
      console.log('❌ Setup cancelled.');
      rl.close();
      return;
    }
  }
  
  console.log('🔄 Connecting to Telegram...');
  
  const client = new TelegramClient(
    new StringSession(''),
    apiId,
    apiHash,
    { 
      connectionRetries: 5
    }
  );
  
  try {
    await client.start({
      botAuthToken: botToken,
      onError: (err) => {
        console.error('❌ Error:', err);
        throw err;
      },
    });
    
    console.log('✅ Connected successfully!');
    
    // Get bot info
    const me = await client.getMe();
    console.log(`\n🤖 Bot Information:`);
    console.log(`   Username: @${me.username}`);
    console.log(`   Name: ${me.firstName || 'GameBot'}`);
    console.log(`   ID: ${me.id}`);
    
    // Save session
    const sessionString = (client.session as StringSession).save();
    
    if (!sessionString) {
      throw new Error('Failed to save session');
    }
    
    // Ensure sessions directory exists
    const sessionsDir = path.dirname(sessionPath);
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
    
    // Save to file
    fs.writeFileSync(sessionPath, sessionString);
    console.log(`\n✅ Session saved to: ${sessionPath}`);
    
    console.log('\n🎉 MTProto setup complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Register the enhanced UNO game in your game registry');
    console.log('   2. Update your bot to use EnhancedTelegramAdapter');
    console.log('   3. Test the new features with /play uno-enhanced');
    
    await client.disconnect();
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run setup
setup().catch(console.error);