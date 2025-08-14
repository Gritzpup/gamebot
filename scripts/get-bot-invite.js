#!/usr/bin/env node

require('dotenv').config();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_CLIENT_ID) {
  console.error('DISCORD_CLIENT_ID not found in .env file');
  process.exit(1);
}

// Permissions:
// - Send Messages
// - Read Message History
// - Add Reactions
// - Use Slash Commands
// - Embed Links
// - Attach Files
// - View Channels
const permissions = '378944';

const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&permissions=${permissions}&scope=bot%20applications.commands`;

console.log('\n=== Discord Bot Invite Link ===');
console.log('\nClick this link to add the bot to your Discord server:');
console.log(inviteUrl);
console.log('\nAfter adding the bot, run "npm run get-discord-id" to get your server ID.');
console.log('\nIMPORTANT: You need to enable these intents in Discord Developer Portal:');
console.log('1. Go to https://discord.com/developers/applications/1405220501957120120/bot');
console.log('2. Scroll to "Privileged Gateway Intents"');
console.log('3. Enable "MESSAGE CONTENT INTENT"');
console.log('4. Save changes');