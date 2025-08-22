# UNO - Enhanced with MTProto Features

## Overview

The UNO game in GameBot now includes enhanced features that leverage Telegram's MTProto API to provide private card views and quick card peeks on Telegram.

## Features

### 1. Quick Card Peek (3 seconds)
- Click the "👁️ Quick Peek (3s)" button to briefly view your cards
- Cards will display for 3 seconds then revert to the game state
- Rate limited to once every 5 seconds per player

### 2. Private Card View
- Click the "📱 Private View" button to receive your cards via private message
- Requires you to have started a chat with the bot first
- Shows full hand with play indicators (✅ playable, ❌ not playable)
- Includes helpful tips and reminders

### 3. Flash Notifications
- Brief messages that appear and disappear automatically
- Used for bot thinking indicators and quick alerts

## Setup

1. **Run the MTProto setup** (already completed):
   ```bash
   npx ts-node mtproto/setup.ts
   ```

2. **Start the bot**:
   ```bash
   npm start
   ```

3. **Play UNO**:
   - In your Telegram group: `/play uno`
   - Enhanced features are automatically available on Telegram

## How It Works

### For Players:
1. Join a game as normal
2. When it's your turn, use the view buttons to see your cards
3. Click card buttons in the group chat to play them
4. For private view: Make sure you've started a chat with @gritzgamebot first

### Technical Details:
- Uses GramJS (Telegram MTProto library) for enhanced features
- Falls back gracefully to regular Bot API if MTProto is unavailable
- Session files are stored in `mtproto/sessions/` (gitignored)
- Credentials are in `mtproto/.env.mtproto` (gitignored)

## Troubleshooting

### "Private message failed"
- Start a private chat with the bot: Search for @gritzgamebot and click "Start"
- Then try the private view button again

### Quick peek not working
- Check if you've used it in the last 5 seconds
- Ensure the bot has MTProto initialized (check logs)

### MTProto connection issues
- Re-run the setup script: `npx ts-node mtproto/setup.ts`
- Check your API credentials in `mtproto/.env.mtproto`
- Ensure you're using the correct bot token

## Security

- API credentials and session files are gitignored
- Each player can only view their own cards
- Rate limiting prevents spam

## Future Enhancements

- Voice message support: "Play red five"
- Image recognition: Photo of card to play
- Tournament mode with spectator view
- AI assistance for optimal plays