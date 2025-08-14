# Cross-Platform GameBot 🎮

A unified gaming bot that works seamlessly across Telegram and Discord platforms, featuring 50+ games with real-time multiplayer support, tournaments, leaderboards, and achievements.

## Features

- **Cross-Platform Support**: Single codebase for both Telegram and Discord
- **50+ Games**: From classic board games to trivia, puzzles, and idle games
- **Real-time Multiplayer**: Play with friends in group chats
- **Tournaments & Leaderboards**: Competitive gaming with rankings
- **Achievements System**: Unlock achievements as you play
- **AI Opponents**: Play against computer opponents of varying difficulty
- **Daily Challenges**: New challenges every day
- **Multi-language Support**: Extensible localization system

## Game Categories

### 🎯 Board Games
- Tic Tac Toe
- Connect 4
- Chess
- Checkers
- Othello/Reversi
- Backgammon
- Go

### 📝 Word Games
- Wordle
- Word Chain
- Anagrams
- Hangman

### 🃏 Card Games
- UNO
- Solitaire
- Crazy Eights
- Go Fish
- Trading Card Game

### 🧩 Puzzle Games
- Sliding Puzzle
- Jigsaw Builder
- Maze Generator/Solver
- Pattern Recognition
- Tower of Hanoi
- Rubik's Cube Simulator
- Nonogram/Picross

### 🎲 Casino Games
- Coin Flip Betting
- Wheel of Fortune
- Darts
- Bowling

### 🏃 Action Games
- Reaction Time Tester
- Simon Says
- Button Masher
- Quick Draw
- Typing Speed Test

### 🗡️ RPG Games
- Text Dungeon Crawler
- Character Creator & Battler
- Pet/Monster Collector
- Simple Pokemon-style Battles
- Choose Your Adventure

### 💰 Economy Games
- Business Tycoon
- Farm Management
- City Builder
- Resource Trading

### 🎨 Creative Games
- Emoji Rating System
- Art History Quiz
- Drawing Contests
- Meme Generator Contest
- Emoji Story Creator

### 📚 Educational Games
- Language Learning Flashcards
- Programming Challenges
- Science Trivia
- Geography Quiz
- Math Puzzles

### 🏭 Idle Games
- Cookie Clicker Clone
- Idle Factory
- Auto-RPG Progression
- Garden Growing Simulator
- Civilization Builder

## Prerequisites

- Node.js 18+ 
- Redis server
- SQLite
- Telegram Bot Token (from @BotFather)
- Discord Bot Token (from Discord Developer Portal)

## Installation

1. **Clone the repository**
   ```bash
   cd /home/ubuntumain/Documents/Github/gamebot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your bot tokens and configuration.

4. **Initialize the database**
   ```bash
   npm run db:init
   ```

5. **Start Redis** (if not already running)
   ```bash
   redis-server
   ```

6. **Run the bot**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm run build
   npm start
   ```

## Configuration

### Telegram Setup

1. Create a bot with @BotFather
2. Get your bot token
3. Add the bot to your group
4. Get the group ID (use the included script):
   ```bash
   tsx scripts/get-telegram-group-id.ts
   ```
5. Make the bot an admin in the group

### Discord Setup

1. Create a Discord application at https://discord.com/developers
2. Create a bot and get the token
3. Invite the bot to your server with these permissions:
   - Send Messages
   - Embed Links
   - Attach Files
   - Read Message History
   - Add Reactions
   - Use Slash Commands

### Environment Variables

```env
# Bot Tokens
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
DISCORD_BOT_TOKEN=your_discord_bot_token

# Telegram Configuration
TELEGRAM_GROUP_ID=your_telegram_group_id

# Discord Configuration
DISCORD_GUILD_ID=your_discord_guild_id
DISCORD_CLIENT_ID=your_discord_client_id

# Database
DATABASE_PATH=./gamebot.db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Game Settings
DEFAULT_LANGUAGE=en
MAX_GAMES_PER_PLAYER=5
GAME_TIMEOUT_MINUTES=30
```

## Usage

### Basic Commands

- `/help` - Show all available commands
- `/games` - List all available games
- `/play <game>` - Start a new game
- `/mygames` - View your active games
- `/quit` - Quit current game
- `/stats` - View your statistics
- `/leaderboard <game>` - View game leaderboard

### Playing Games

1. Start a game: `/play tictactoe`
2. Other players can join by clicking the "Join" button
3. Play using the interactive buttons/keyboards
4. Game ends when there's a winner or draw

### Examples

```
/play wordle        # Start a Wordle game
/play ttt          # Start Tic Tac Toe (using alias)
/play chess @user  # Challenge a specific user to Chess
/stats             # View your gaming statistics
/leaderboard uno   # View UNO leaderboard
```

## Architecture

### Core Components

- **GameEngine**: Central orchestrator for all games
- **Platform Adapters**: Abstract platform differences (Telegram/Discord)
- **Game Modules**: Self-contained game implementations
- **Database Layer**: SQLite for persistence, Redis for real-time state
- **UI Builders**: Platform-specific UI generation

### Directory Structure

```
src/
├── core/           # Core engine and game management
├── platforms/      # Platform-specific adapters
├── games/          # Individual game implementations
├── services/       # Database, Redis, AI, etc.
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

## Development

### Adding a New Game

1. Create a new file in the appropriate category under `src/games/`
2. Extend the `BaseGame` class
3. Implement required methods:
   - `initialize()` - Set up game state
   - `validateMove()` - Validate player moves
   - `makeMove()` - Process moves
   - `renderState()` - Render game UI
4. Register the game in `GameEngine`

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Test a specific game
npm run test -- --testNamePattern="TicTacToe"
```

### Deployment

#### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start the bot
pm2 start ecosystem.config.js

# Monitor logs
pm2 logs gamebot

# Save PM2 configuration
pm2 save
pm2 startup
```

#### Using Docker

```bash
# Build the image
docker build -t gamebot .

# Run with docker-compose
docker-compose up -d
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Troubleshooting

### Bot not responding
- Check bot tokens are correct
- Ensure bot has proper permissions in groups/channels
- Check logs for errors: `logs/gamebot-*.log`

### Games not starting
- Verify Redis is running
- Check database permissions
- Ensure group/channel IDs are correct

### Performance issues
- Adjust `MAX_CONCURRENT_GAMES` in environment
- Increase Redis memory limit
- Enable game cleanup in configuration

## License

MIT License - feel free to use this bot for your communities!

## Support

- Create an issue for bug reports
- Join our Discord server for help
- Check the docs folder for detailed guides

---

Made with ❤️ for gaming communities everywhere!