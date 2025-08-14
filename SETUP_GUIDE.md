# 🎮 GameBot Setup Guide

## ✅ Current Status

Your `.env` file has been created with:
- ✅ Telegram Bot Token (from @gritzgamebot)
- ✅ Discord Application ID
- ⏳ Discord Bot Token (needs to be created)
- ⏳ Telegram Group ID (needs to be obtained)
- ⏳ Discord Guild ID (needs to be obtained)

## 📱 Telegram Setup

### Step 1: Get Your Telegram Group ID

1. **Add the bot to your group:**
   - Open your Telegram group
   - Click group name → Add Members
   - Search for `@gritzgamebot`
   - Add the bot to the group

2. **Make the bot an admin:**
   - Click group name → Administrators
   - Add Administrator → Search for your bot
   - Give it these permissions:
     - Delete messages
     - Pin messages
     - Manage topics (if using forum groups)

3. **Get the Group ID:**
   ```bash
   cd /home/ubuntumain/Documents/Github/gamebot
   npm install  # If you haven't already
   tsx scripts/get-telegram-group-id.ts
   ```
   - Send a message in your group
   - Copy the group ID that appears
   - Add it to your `.env` file

## 🎮 Discord Setup

### Step 1: Create Your Discord Bot

1. **Go to Discord Developer Portal:**
   - Visit: https://discord.com/developers/applications/1405220501957120120/bot
   - You should see your application

2. **Create the Bot User:**
   - Click "Bot" in the left sidebar
   - Click "Reset Token" or "Add Bot" if you haven't created one
   - Copy the token that appears
   - Add it to `.env` as `DISCORD_BOT_TOKEN`

3. **Configure Bot Settings:**
   - Enable these Privileged Gateway Intents:
     - MESSAGE CONTENT INTENT
     - SERVER MEMBERS INTENT
   - Save changes

### Step 2: Invite Bot to Your Server

1. **Generate Invite Link:**
   - Go to OAuth2 → URL Generator
   - Select these scopes:
     - `bot`
     - `applications.commands`
   - Select these permissions:
     - Send Messages
     - Embed Links
     - Attach Files
     - Read Message History
     - Add Reactions
     - Use Slash Commands
     - Manage Messages
   - Copy the generated URL

2. **Add to Server:**
   - Open the URL in your browser
   - Select your server
   - Authorize the bot

3. **Get Your Guild ID:**
   - In Discord, right-click your server name
   - Click "Copy Server ID"
   - Add it to `.env` as `DISCORD_GUILD_ID`
   - Note: You may need to enable Developer Mode in Discord settings

## 🚀 Final Setup Steps

### 1. Install Dependencies
```bash
cd /home/ubuntumain/Documents/Github/gamebot
npm install
```

### 2. Start Redis
```bash
# In a new terminal
redis-server
```

### 3. Initialize Database
```bash
npm run db:init
```

### 4. Start the Bot
```bash
# Development mode with auto-reload
npm run dev

# Or production mode
npm run build
npm start
```

## 🧪 Testing Your Bot

### Telegram
1. In your group, type: `/help`
2. Try: `/games` to see available games
3. Start a game: `/play tictactoe`

### Discord
1. In your server, type: `/help`
2. Try: `/games` to see available games
3. Start a game: `/play wordle`

## 🔒 Security Reminders

⚠️ **IMPORTANT**: 
- Never share your bot tokens publicly
- Keep your `.env` file secure
- Don't commit `.env` to Git (it's already in .gitignore)
- Consider using environment variables in production

## 🐛 Troubleshooting

### Bot not responding in Telegram?
- Check bot is added as admin
- Verify group ID is correct
- Check logs for errors

### Bot not responding in Discord?
- Verify bot has proper permissions
- Check bot token is correct
- Ensure intents are enabled

### Redis connection error?
- Make sure Redis is installed: `sudo apt install redis-server`
- Start Redis: `redis-server`

### View Logs
```bash
# Check console output
# Or check log files in logs/ directory
tail -f logs/gamebot-*.log
```

## 📞 Need Help?

Check the logs first - they usually contain helpful error messages!

---

Happy gaming! 🎮