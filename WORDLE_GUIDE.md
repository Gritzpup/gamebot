# How to Play Wordle in GameBot

## Starting the Game
1. Type `/play wordle` in Discord or Telegram
2. The bot will display the game board

## Game Display Explanation
```
╔═══════════════════════════╗
║       WORDLE 🟩 🟨        ║
╚═══════════════════════════╝

  _  _  _  _  _
 ⬜ ⬜ ⬜ ⬜ ⬜

[... more empty rows ...]

Attempts: 0/6

💭 TYPE A 5-LETTER WORD TO GUESS!
Example: CRANE, SLATE, AUDIO
```

## How to Play
1. **Type a 5-letter word** directly in the chat (e.g., "CRANE")
2. Press Enter to submit your guess
3. The bot will show feedback:
   - 🟩 Green = Correct letter in correct position
   - 🟨 Yellow = Correct letter in wrong position
   - ⬜ Gray = Letter not in the word

## Example Game Flow
```
You: /play wordle
Bot: [Shows game board with instructions]
You: crane
Bot: [Shows board with colored feedback]
You: slate
Bot: [Shows updated board]
... continue until you guess the word or run out of attempts
```

## Tips
- Start with common vowel-heavy words like CRANE, SLATE, or AUDIO
- The keyboard display shows which letters you've already tried
- You have 6 attempts to guess the word
- Words must be valid English words from the dictionary

## Commands
- `/play wordle` - Start a new game
- `/quit` - Quit current game
- Type any 5-letter word to make a guess