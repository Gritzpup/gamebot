# Cross-Platform Gaming Guide

This guide explains how to set up and use the cross-platform gaming functionality that allows Discord and Telegram users to play games together.

## Overview

The gamebot supports cross-platform gaming through a relay system that synchronizes game states between Discord and Telegram channels. When configured, users from both platforms can join and play the same game together.

## Setup

### 1. Run Database Migrations

First, ensure your database has the necessary tables for cross-platform functionality:

```bash
npm run db:migrate
```

### 2. Configure Environment Variables

Add the following to your `.env` file:

```env
# Cross-Platform Relay Configuration
RELAY_ENABLED=true
RELAY_SHOW_PLATFORM=true
RELAY_SHOW_USERNAME=true
```

### 3. Link Channels

To enable cross-platform gaming between specific Discord and Telegram channels, an administrator must link them using the `/link` command.

#### Getting Channel IDs

**Discord Channel ID:**
1. Enable Developer Mode in Discord (Settings → Advanced → Developer Mode)
2. Right-click on the channel → Copy ID

**Telegram Channel ID:**
1. Add the bot to your Telegram group
2. Use the `/get-telegram-id` command in the group
3. The bot will respond with the channel ID

#### Linking Channels

Once you have both channel IDs, use the link command in either Discord or Telegram:

```
/link <discord_channel_id> <telegram_channel_id>
```

Example:
```
/link 1234567890123456789 -1001234567890
```

## Admin Commands

### `/link <discord_id> <telegram_id>`
Links a Discord channel with a Telegram channel for cross-platform gaming.
- Requires administrator permissions
- Creates a bidirectional link between channels

### `/unlink`
Unlinks the current channel from all connected channels.
- Requires administrator permissions
- Removes all cross-platform connections for the current channel

### `/links`
Lists all active channel links.
- Requires administrator permissions
- Shows all configured cross-platform connections

## How It Works

1. **Game Creation**: When a user starts a game with `/play <game>`, it appears in both linked channels
2. **Joining Games**: Users from either platform can join by clicking the join button
3. **Making Moves**: All game interactions are synchronized across platforms
4. **Game State**: The game state is maintained centrally and updated on both platforms

## Features

- **Platform Indicators**: Messages show which platform a user is from (e.g., `[Discord]` or `[Telegram]`)
- **Username Display**: Player usernames are shown with their moves
- **Real-time Sync**: All game actions are instantly reflected on both platforms
- **UI Adaptation**: Buttons and interfaces are automatically adapted for each platform

## Supported Games

All games in the production environment support cross-platform play:
- Connect 4
- Tic Tac Toe
- (Add more as they're promoted to production)

## Troubleshooting

### Games not appearing in linked channel
- Verify channels are properly linked with `/links`
- Check that `RELAY_ENABLED=true` in your environment
- Ensure the bot has proper permissions in both channels

### Cannot link channels
- Verify you have administrator permissions
- Check that channel IDs are correct
- Ensure the bot is present in both channels

### Performance issues
- Check Redis connection for caching
- Monitor the number of active games
- Review logs for any relay errors

## Best Practices

1. **Channel Pairing**: Link channels with similar purposes (e.g., gaming channels)
2. **Moderation**: Both platform's moderators should coordinate rules
3. **Testing**: Test the link with a simple game before heavy usage
4. **Monitoring**: Regularly check `/links` to ensure connections are active

## Technical Details

The cross-platform system uses:
- **Relay Service**: Manages message synchronization between platforms
- **Message Transformer**: Converts platform-specific formats (Markdown ↔ HTML)
- **Channel Mappings**: Database table storing linked channels
- **Game Registry**: Ensures only production games are available cross-platform