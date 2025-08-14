#!/usr/bin/env node

const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});

client.once('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}!`);
  console.log('\n=== Discord Server Info ===');
  console.log('Servers the bot is in:');
  
  client.guilds.cache.forEach((guild) => {
    console.log(`\nServer Name: ${guild.name}`);
    console.log(`Server ID: ${guild.id}`);
    console.log(`Member Count: ${guild.memberCount}`);
    console.log('\nAdd this to your .env file:');
    console.log(`DISCORD_GUILD_ID=${guild.id}`);
  });
  
  console.log('\nPress Ctrl+C to exit.');
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
  console.error('Failed to login:', error);
  console.log('\nMake sure your DISCORD_BOT_TOKEN is correct in the .env file.');
  process.exit(1);
});