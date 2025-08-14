# Gamebot Setup Guide

## Quick Setup

1. **Discord Setup**
   - Enable Message Content Intent:
     1. Go to https://discord.com/developers/applications/1405220501957120120/bot
     2. Scroll to "Privileged Gateway Intents"
     3. Enable "MESSAGE CONTENT INTENT"
     4. Save changes
   
   - Add bot to your server:
     ```bash
     npm run get-invite
     ```
     Click the generated link and add the bot to your server.
   
   - Get your Discord Guild ID:
     ```bash
     npm run get-discord-id
     ```
     Copy the Guild ID and add it to your .env file.

2. **Telegram Setup**
   - Add @gritzgamebot to your Telegram group
   - Make the bot an admin (required for inline keyboards)
   - Get your Telegram Group ID:
     ```bash
     npm run get-telegram-id
     ```
     Send a message in the main group chat (NOT in a forum topic)
     Copy the Group ID (negative number) and add it to your .env file.

3. **Update .env file**
   ```
   TELEGRAM_GROUP_ID=-1001234567890  # Your actual group ID
   DISCORD_GUILD_ID=1234567890123456  # Your actual guild ID
   ```

4. **Start the bot**
   ```bash
   npm run dev
   ```

## Available Commands

Both platforms support:
- `/play <game>` - Start a new game
- `/games` - List all available games
- `/stats` - View your statistics
- `/leaderboard` - View game leaderboards
- `/help` - Get help

## Current Games

- **TicTacToe** - Classic 3x3 grid game
- **Connect4** - Drop discs to connect four in a row
- **Othello** - Strategic disc-flipping game

## Troubleshooting

- **"#topic-4680" is not a valid Telegram ID**: This appears to be a forum topic. Send a message in the main group chat when running `npm run get-telegram-id`.

- **Discord bot shows as offline**: Make sure MESSAGE CONTENT INTENT is enabled in the developer portal.

- **Bot doesn't respond to commands**: Ensure the bot has proper permissions in your Discord server and is an admin in your Telegram group.