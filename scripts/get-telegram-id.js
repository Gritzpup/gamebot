#!/usr/bin/env node

const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

console.log('Bot started! Send a message in your Telegram group to get the chat ID.');
console.log('Make sure the bot is added to the group first.');
console.log('\nIMPORTANT: Send a message in the main group chat, not in a forum topic!');

bot.on('message', (msg) => {
  console.log('\n=== Telegram Chat Info ===');
  console.log('Chat ID:', msg.chat.id);
  console.log('Chat Type:', msg.chat.type);
  console.log('Chat Title:', msg.chat.title || 'Direct Message');
  
  // Check if this is a forum topic
  if (msg.message_thread_id) {
    console.log('Forum Topic ID:', msg.message_thread_id);
    console.log('\nNOTE: This is a forum topic. The bot needs the main group ID.');
  }
  
  console.log('\nAdd this to your .env file:');
  console.log(`TELEGRAM_GROUP_ID=${msg.chat.id}`);
  console.log('\nPress Ctrl+C to exit.');
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nStopping bot...');
  bot.stopPolling();
  process.exit(0);
});