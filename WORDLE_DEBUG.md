# Wordle Debug Guide

## Changes Made to Fix "Bot Stuck Thinking" Issue

### 1. Fixed State Initialization
- The game was copying `this.gameState` which didn't have all required properties
- Now properly initializes all state properties in `initialize()`

### 2. Added Comprehensive Error Handling
- Added try-catch blocks in `processInteraction()` and `renderState()`
- All errors are now logged with `[Wordle]` prefix

### 3. Added Debug Logging
- Every state transition is logged
- Every interaction is logged with state info
- Render calls log the current game state

### 4. Added State Validation
- If state is undefined, it defaults to MODE_SELECTION
- Prevents the game from being stuck in an invalid state

## To Debug When Bot Gets Stuck

1. Check logs for `[Wordle]` entries
2. Look for the last state transition
3. Check for any error messages
4. The game should always show mode selection first

## Quick Test Commands

1. Start game: `/play wordle`
2. Should see 3 buttons: Single Player, Custom Word, Daily Challenge
3. Click "Single Player" to test basic functionality
4. Type any 5-letter word like "CRANE"

## If Still Stuck

1. Use `/forcequit` (admin only) to clear all games
2. Restart the bot
3. Check Redis is running: `npm run redis:start`
4. Check logs for any startup errors