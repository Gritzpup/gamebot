import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in .env file');
  process.exit(1);
}

console.log('🤖 Starting Telegram Group ID Finder...');
console.log('📝 Instructions:');
console.log('1. Add your bot (@gritzgamebot) to your Telegram group');
console.log('2. Make the bot an admin in the group');
console.log('3. Send any message in the group');
console.log('4. The group ID will appear below');
console.log('5. Press Ctrl+C to stop\n');

const bot = new TelegramBot(token, { polling: true });

bot.on('message', (msg) => {
  console.log('📨 Message received!');
  console.log(`👤 From: ${msg.from?.username || msg.from?.first_name || 'Unknown'}`);
  console.log(`💬 Chat Type: ${msg.chat.type}`);
  console.log(`📍 Chat Title: ${msg.chat.title || 'Direct Message'}`);
  console.log(`🆔 Chat ID: ${msg.chat.id}`);
  
  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
    console.log('\n✅ Found your group ID!');
    console.log(`📝 Add this to your .env file:`);
    console.log(`TELEGRAM_GROUP_ID=${msg.chat.id}`);
    console.log('\n💡 You can now press Ctrl+C to stop this script');
  }
  
  console.log('-------------------\n');
});

bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.message);
});

console.log('✅ Bot is running and waiting for messages...');