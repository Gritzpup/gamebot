import { BaseGame } from '../BaseGame';
import {
  GameCategory,
  GameEndReason,
  MoveResult,
  GameStateSnapshot,
  GameDifficulty,
} from '../../types/game.types';
import { Player, UIMessage, GameInteraction, UIComponent } from '../../types';
import { logger } from '../../utils/logger';

// Load word lists using require for better compatibility
const wordleAnswersData = require('./data/wordle-answers.json');
const wordleAllowedData = require('./data/wordle-allowed.json');

enum WordleGameState {
  MODE_SELECTION = 'mode_selection',
  WAITING_FOR_WORD = 'waiting_for_word',
  WAITING_FOR_PLAYER = 'waiting_for_player',
  PLAYING = 'playing',
  GAME_OVER = 'game_over'
}

interface WordleState {
  targetWord: string;
  guesses: string[];
  currentRow: number;
  gameMode: 'daily' | 'random' | 'custom';
  dailyIndex?: number;
  keyboard: {
    [letter: string]: 'correct' | 'present' | 'absent' | 'unused';
  };
  gameOver: boolean;
  won: boolean;
  hardMode: boolean;
  hintsUsed: number;
  startTime: number;
  gameState: WordleGameState;
  creatorId?: string;
  creatorName?: string;
  guesserId?: string;
  guesserName?: string;
  customMode: boolean;
}

interface LetterResult {
  letter: string;
  status: 'correct' | 'present' | 'absent';
}

export class Wordle extends BaseGame {
  id = 'wordle';
  name = 'Wordle';
  description = 'Guess the 5-letter word in 6 tries!';
  category = GameCategory.WordGames;
  minPlayers = 1;
  maxPlayers = 2; // Allow 2 players for custom mode
  estimatedDuration = 5; // 5 minutes
  difficulty = GameDifficulty.Medium;
  acceptsTextInput = true; // Explicitly declare that Wordle accepts text input
  
  // State is managed by BaseGame's gameState property
  // Helper getter for type-safe access
  private get state(): WordleState {
    return this.gameState as WordleState;
  }
  
  private readonly MAX_GUESSES = 6;
  private readonly WORD_LENGTH = 5;
  private readonly answers: string[] = wordleAnswersData as string[];
  private readonly allowed: string[] = wordleAllowedData as string[];
  
  async initialize(session: any): Promise<void> {
    await super.initialize(session);
    
    // Debug log to check if word lists are loaded
    logger.info(`[Wordle] Word lists loaded - Answers: ${this.answers?.length || 0}, Allowed: ${this.allowed?.length || 0}`);
    
    // Validate word lists are loaded
    if (!Array.isArray(this.answers) || this.answers.length === 0) {
      logger.error('[Wordle] Word answers list not loaded properly!');
      throw new Error('Wordle word answers list not loaded');
    }
    
    if (!Array.isArray(this.allowed) || this.allowed.length === 0) {
      logger.error('[Wordle] Allowed words list not loaded properly!');
      throw new Error('Wordle allowed words list not loaded');
    }
    
    // Properly initialize gameState with all required properties
    this.gameState = {
      targetWord: '',
      guesses: [],
      currentRow: 0,
      gameMode: 'random',
      keyboard: {},
      gameOver: false,
      won: false,
      hardMode: false,
      hintsUsed: 0,
      startTime: Date.now(),
      gameState: WordleGameState.MODE_SELECTION,
      customMode: false,
      creatorId: undefined,
      creatorName: undefined,
      guesserId: undefined,
      guesserName: undefined,
    } as WordleState;
    
    // Initialize keyboard
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(letter => {
      this.state.keyboard[letter] = 'unused';
    });
    
    // Store creator info
    const players = this.getPlayers();
    if (players.length > 0) {
      this.state.creatorId = players[0];
      this.state.creatorName = this.getPlayerName(players[0]);
    }
    
    logger.info(`[Wordle] Initialized in mode selection - Creator: ${this.state.creatorName} (${this.state.creatorId})`);
  }
  
  private selectTargetWord(): void {
    if (this.state.gameMode === 'daily') {
      // Use date-based seed for daily word
      const today = new Date();
      const daysSinceEpoch = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
      this.state.dailyIndex = daysSinceEpoch % this.answers.length;
      this.state.targetWord = this.answers[this.state.dailyIndex];
    } else {
      // Random word
      const randomIndex = Math.floor(Math.random() * this.answers.length);
      this.state.targetWord = this.answers[randomIndex];
    }
  }
  
  async start(): Promise<void> {
    await super.start();
    logger.info(`[Wordle] Game started - Current state: ${this.state.gameState}`);
    
    // Ensure we're in the correct initial state
    if (!this.state.gameState) {
      logger.warn('[Wordle] Game state was undefined, setting to MODE_SELECTION');
      this.state.gameState = WordleGameState.MODE_SELECTION;
    }
  }
  
  async processInteraction(interaction: GameInteraction): Promise<MoveResult | null> {
    try {
      logger.info(`[Wordle] Processing interaction - State: ${this.state.gameState}, Type: ${interaction.type}, User: ${interaction.userId}`);
      
      // Handle mode selection
      if (this.state.gameState === WordleGameState.MODE_SELECTION) {
        if (interaction.type === 'button_click') {
          const buttonId = interaction.data?.id;
          logger.info(`[Wordle] Mode selection button clicked: ${buttonId}`);
          
          if (buttonId === 'mode_single') {
            this.state.gameMode = 'random';
            this.state.customMode = false;
            this.selectTargetWord();
            this.state.gameState = WordleGameState.PLAYING;
            this.state.startTime = Date.now();
            logger.info(`[Wordle] Single player mode selected - Word: ${this.state.targetWord}`);
            return { success: true, stateChanged: true };
          }
          
          if (buttonId === 'mode_custom') {
            this.state.gameMode = 'custom';
            this.state.customMode = true;
            this.state.gameState = WordleGameState.WAITING_FOR_WORD;
            logger.info(`[Wordle] Custom mode selected - Waiting for word from ${this.state.creatorName}`);
            return { success: true, stateChanged: true };
          }
          
          if (buttonId === 'mode_daily') {
            this.state.gameMode = 'daily';
            this.state.customMode = false;
            this.selectTargetWord();
            this.state.gameState = WordleGameState.PLAYING;
            this.state.startTime = Date.now();
            logger.info(`[Wordle] Daily mode selected - Word: ${this.state.targetWord}`);
            return { success: true, stateChanged: true };
          }
        }
        return null;
      }
    
    // Handle waiting for word (custom mode)
    if (this.state.gameState === WordleGameState.WAITING_FOR_WORD) {
      if (interaction.type === 'text_input' && interaction.data?.text) {
        // Only creator can set the word
        if (interaction.userId !== this.state.creatorId) {
          return { success: false, message: 'Only the game creator can set the word!', stateChanged: false };
        }
        
        const word = interaction.data.text.trim().toLowerCase();
        
        // Validate word
        if (word.length !== this.WORD_LENGTH) {
          return { success: false, message: `Word must be exactly ${this.WORD_LENGTH} letters!`, stateChanged: false };
        }
        
        if (!this.allowed.includes(word)) {
          return { success: false, message: 'Not a valid word! Try another.', stateChanged: false };
        }
        
        // Set the word and move to waiting for player
        this.state.targetWord = word;
        this.state.gameState = WordleGameState.WAITING_FOR_PLAYER;
        logger.info(`Custom word set for Wordle game`);
        
        return { success: true, stateChanged: true };
      }
      
      if (interaction.type === 'button_click' && interaction.data?.id === 'cancel_word') {
        return { success: true, gameEnded: true, stateChanged: false };
      }
      
      return null;
    }
    
    // Handle waiting for player (custom mode)
    if (this.state.gameState === WordleGameState.WAITING_FOR_PLAYER) {
      if (interaction.type === 'button_click' && interaction.data?.id === 'join_game') {
        // Can't be the word setter
        if (interaction.userId === this.state.creatorId) {
          return { success: false, message: "You can't guess your own word!", stateChanged: false };
        }
        
        // Set the guesser
        this.state.guesserId = interaction.userId;
        this.state.guesserName = this.getPlayerName(interaction.userId);
        this.state.gameState = WordleGameState.PLAYING;
        this.state.startTime = Date.now();
        
        return { success: true, stateChanged: true };
      }
      
      if (interaction.type === 'button_click' && interaction.data?.id === 'cancel_game') {
        if (interaction.userId === this.state.creatorId) {
          return { success: true, gameEnded: true, stateChanged: false };
        }
      }
      
      return null;
    }
    
    // Handle playing state
    if (this.state.gameState === WordleGameState.PLAYING) {
      // In custom mode, only the guesser can make guesses
      if (this.state.customMode && interaction.userId !== this.state.guesserId) {
        return null; // Silently ignore guesses from non-guesser
      }
      
      // Handle text input for word guesses
      if (interaction.type === 'text_input' && interaction.data?.text) {
        const guess = interaction.data.text.toUpperCase();
        const result = await this.processGuess(interaction.userId, guess);
        
        // Check if game ended
        if (result.success && (this.state.won || this.state.gameOver)) {
          this.state.gameState = WordleGameState.GAME_OVER;
        }
        
        return result;
      }
      
      // Handle hint button
      if (interaction.type === 'button_click' && interaction.data?.id === 'hint' && this.state.hintsUsed < 2) {
        return this.provideHint();
      }
    }
    
    // Handle game over state
    if (this.state.gameState === WordleGameState.GAME_OVER) {
      if (interaction.type === 'button_click') {
        const buttonId = interaction.data?.id;
        
        if (buttonId === 'new_game') {
          // Reset and start new game
          await this.initialize(this.session);
          await this.start();
          return { success: true, gameEnded: false, stateChanged: false };
        }
        
        if (buttonId === 'share') {
          // Share functionality would be handled by the platform
          return null;
        }
      }
    }
    
    return null;
    
    } catch (error) {
      logger.error(`[Wordle] Error in processInteraction:`, error);
      return { success: false, message: 'An error occurred processing your action', stateChanged: false };
    }
  }
  
  private processGuess(playerId: string, guess: string): MoveResult {
    // Validate game state
    if (this.state.gameOver || this.state.gameState !== WordleGameState.PLAYING) {
      return { success: false, message: 'Game is not in playing state!', stateChanged: false };
    }
    
    // In custom mode, only the guesser can make guesses
    if (this.state.customMode && playerId !== this.state.guesserId) {
      return { success: false, message: 'Only the designated guesser can make guesses!', stateChanged: false };
    }
    
    // Validate guess length
    if (guess.length !== this.WORD_LENGTH) {
      return { success: false, message: `Guess must be ${this.WORD_LENGTH} letters!`, stateChanged: false };
    }
    
    // Validate word exists
    const guessLower = guess.toLowerCase();
    
    // Debug check for allowed list
    if (!Array.isArray(this.allowed)) {
      logger.error(`[Wordle] this.allowed is not an array! Type: ${typeof this.allowed}`);
      return { success: false, message: 'Word list error - please restart the game', stateChanged: false };
    }
    
    if (!this.allowed.includes(guessLower)) {
      return { success: false, message: 'Not in word list!', stateChanged: false };
    }
    
    // Hard mode validation
    if (this.state.hardMode && this.state.guesses.length > 0) {
      const hardModeError = this.validateHardMode(guessLower);
      if (hardModeError) {
        return { success: false, message: hardModeError, stateChanged: false };
      }
    }
    
    // Process the guess
    this.state.guesses.push(guessLower);
    this.state.currentRow++;
    
    // Update keyboard based on guess results
    this.updateKeyboard(guessLower);
    
    // Check win condition
    if (guessLower === this.state.targetWord) {
      this.state.won = true;
      this.state.gameOver = true;
      return {
        success: true,
        gameEnded: true,
        winner: playerId,
        stateChanged: true,
      };
    }
    
    // Check loss condition
    if (this.state.currentRow >= this.MAX_GUESSES) {
      this.state.gameOver = true;
      return {
        success: true,
        gameEnded: true,
        isDraw: true, // No winner in single player
        stateChanged: true,
      };
    }
    
    return {
      success: true,
      gameEnded: false,
      stateChanged: true,
    };
  }
  
  private validateHardMode(guess: string): string | null {
    // In hard mode, must use all revealed clues
    const lastGuessResults = this.getGuessResults(
      this.state.guesses[this.state.guesses.length - 1]
    );
    
    for (let i = 0; i < lastGuessResults.length; i++) {
      const result = lastGuessResults[i];
      if (result.status === 'correct' && guess[i] !== result.letter) {
        return `Must use ${result.letter.toUpperCase()} in position ${i + 1}`;
      }
    }
    
    // Check that all present letters are included
    const presentLetters = lastGuessResults
      .filter(r => r.status === 'present')
      .map(r => r.letter);
    
    for (const letter of presentLetters) {
      if (!guess.includes(letter)) {
        return `Must use ${letter.toUpperCase()} somewhere in the word`;
      }
    }
    
    return null;
  }
  
  private getGuessResults(guess: string): LetterResult[] {
    const results: LetterResult[] = [];
    const targetLetters = this.state.targetWord.split('');
    const guessLetters = guess.split('');
    const used = new Array(this.WORD_LENGTH).fill(false);
    
    // First pass: mark correct positions
    for (let i = 0; i < this.WORD_LENGTH; i++) {
      if (guessLetters[i] === targetLetters[i]) {
        results[i] = { letter: guessLetters[i], status: 'correct' };
        used[i] = true;
      }
    }
    
    // Second pass: mark present letters
    for (let i = 0; i < this.WORD_LENGTH; i++) {
      if (results[i]) continue;
      
      let found = false;
      for (let j = 0; j < this.WORD_LENGTH; j++) {
        if (!used[j] && guessLetters[i] === targetLetters[j]) {
          results[i] = { letter: guessLetters[i], status: 'present' };
          used[j] = true;
          found = true;
          break;
        }
      }
      
      if (!found) {
        results[i] = { letter: guessLetters[i], status: 'absent' };
      }
    }
    
    return results;
  }
  
  private updateKeyboard(guess: string): void {
    const results = this.getGuessResults(guess);
    
    for (const result of results) {
      const letter = result.letter.toUpperCase();
      const currentStatus = this.state.keyboard[letter];
      
      // Update keyboard status (correct > present > absent > unused)
      if (currentStatus === 'unused' || 
          (currentStatus === 'absent' && result.status !== 'absent') ||
          (currentStatus === 'present' && result.status === 'correct')) {
        this.state.keyboard[letter] = result.status;
      }
    }
  }
  
  private provideHint(): MoveResult {
    if (this.state.hintsUsed >= 2) {
      return { success: false, message: 'No more hints available!', stateChanged: false };
    }
    
    this.state.hintsUsed++;
    
    // Hint 1: Reveal a random correct letter position
    if (this.state.hintsUsed === 1) {
      const unusedPositions: number[] = [];
      for (let i = 0; i < this.WORD_LENGTH; i++) {
        let positionUsed = false;
        for (const guess of this.state.guesses) {
          if (guess[i] === this.state.targetWord[i]) {
            positionUsed = true;
            break;
          }
        }
        if (!positionUsed) {
          unusedPositions.push(i);
        }
      }
      
      if (unusedPositions.length > 0) {
        const randomPos = unusedPositions[Math.floor(Math.random() * unusedPositions.length)];
        const letter = this.state.targetWord[randomPos].toUpperCase();
        return {
          success: true,
          gameEnded: false,
          stateChanged: true,
          stateChange: {
            hint: `The letter at position ${randomPos + 1} is ${letter}`,
          },
        };
      }
    }
    
    // Hint 2: Reveal the word type/category
    if (this.state.hintsUsed === 2) {
      // This would require a word categorization system
      return {
        success: true,
        gameEnded: false,
        stateChanged: true,
        stateChange: {
          hint: 'Think about common 5-letter words!',
        },
      };
    }
    
    return { success: true, gameEnded: false, stateChanged: true };
  }
  
  renderState(forPlayer?: string): UIMessage {
    try {
      logger.info(`[Wordle] Rendering state: ${this.state.gameState} for player: ${forPlayer}`);
      
      // Ensure state is valid
      if (!this.state.gameState) {
        logger.error('[Wordle] Game state is undefined! Setting to MODE_SELECTION');
        this.state.gameState = WordleGameState.MODE_SELECTION;
      }
      
      let content = '';
      let components: UIComponent[] | undefined;
    
    // Mode selection state
    if (this.state.gameState === WordleGameState.MODE_SELECTION) {
      content = `\`\`\`\n╔═══════════════════════════╗\n`;
      content += `║       WORDLE 🟩 🟨        ║\n`;
      content += `╚═══════════════════════════╝\n\n`;
      content += `Choose your game mode:\n\n`;
      content += `🎲 SINGLE PLAYER - Classic Wordle\n`;
      content += `   Guess a random 5-letter word\n\n`;
      content += `👥 CUSTOM WORD - Challenge a friend!\n`;
      content += `   Set a word for someone else to guess\n\n`;
      content += `📅 DAILY CHALLENGE - Today's word\n`;
      content += `   Everyone gets the same word\n`;
      content += `\`\`\``;
      
      components = [
        { type: 'button', id: 'mode_single', label: '🎲 Single Player', style: 'primary' },
        { type: 'button', id: 'mode_custom', label: '👥 Custom Word', style: 'success' },
        { type: 'button', id: 'mode_daily', label: '📅 Daily Challenge', style: 'secondary' },
      ];
      
      return { content, components };
    }
    
    // Waiting for word state (custom mode)
    if (this.state.gameState === WordleGameState.WAITING_FOR_WORD) {
      const isCreator = forPlayer === this.state.creatorId;
      
      content = `\`\`\`\n╔═══════════════════════════╗\n`;
      content += `║   WORDLE - CUSTOM MODE    ║\n`;
      content += `╚═══════════════════════════╝\n\n`;
      
      if (isCreator) {
        content += `📝 YOU are setting the word!\n\n`;
        content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        content += `TYPE A 5-LETTER WORD IN THE CHAT\n`;
        content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        content += `Requirements:\n`;
        content += `• Must be exactly 5 letters\n`;
        content += `• Must be a valid English word\n`;
        content += `• Keep it secret! 🤫\n\n`;
        content += `Example: CRANE, SLATE, AUDIO\n`;
      } else {
        content += `⏳ Waiting for ${this.state.creatorName}\n`;
        content += `   to set the secret word...\n\n`;
        content += `Once they set the word,\n`;
        content += `you'll be able to join and guess!\n`;
      }
      content += `\`\`\``;
      
      components = isCreator ? [
        { type: 'button', id: 'cancel_word', label: '❌ Cancel', style: 'danger' }
      ] : undefined;
      
      return { content, components };
    }
    
    // Waiting for player state (custom mode)
    if (this.state.gameState === WordleGameState.WAITING_FOR_PLAYER) {
      const isCreator = forPlayer === this.state.creatorId;
      
      content = `\`\`\`\n╔═══════════════════════════╗\n`;
      content += `║   WORDLE - CUSTOM MODE    ║\n`;
      content += `╚═══════════════════════════╝\n\n`;
      content += `✅ Word has been set!\n\n`;
      
      if (isCreator) {
        content += `Waiting for someone to join...\n\n`;
        content += `Share this game with a friend\n`;
        content += `so they can try to guess your word!\n`;
      } else {
        content += `${this.state.creatorName} has set a word!\n\n`;
        content += `Click JOIN to start guessing!\n`;
      }
      content += `\`\`\``;
      
      components = [];
      if (!isCreator) {
        components.push({ type: 'button', id: 'join_game', label: '🎮 Join Game', style: 'success' });
      }
      if (isCreator) {
        components.push({ type: 'button', id: 'cancel_game', label: '❌ Cancel', style: 'danger' });
      }
      
      return { content, components };
    }
    
    // Playing state
    if (this.state.gameState === WordleGameState.PLAYING) {
      const squares = this.renderBoard();
      const keyboard = this.renderKeyboard();
      
      content = `\`\`\`\n╔═══════════════════════════╗\n`;
      content += `║       WORDLE 🟩 🟨        ║\n`;
      content += `╚═══════════════════════════╝\n\n`;
      
      // Show who's playing in custom mode
      if (this.state.customMode) {
        const isGuesser = forPlayer === this.state.guesserId;
        const isCreator = forPlayer === this.state.creatorId;
        
        content += `👤 Word set by: ${this.state.creatorName}\n`;
        content += `🎯 Guesser: ${this.state.guesserName}\n\n`;
        
        if (!isGuesser && !isCreator) {
          content += `(Spectating)\n\n`;
        }
      }
      
      if (this.state.currentRow === 0 && !this.state.gameOver) {
        // Only show input instructions to the guesser in custom mode
        if (!this.state.customMode || forPlayer === this.state.guesserId) {
          content += `📝 TO PLAY: Type a 5-letter word\n`;
          content += `   in this chat and press Enter!\n\n`;
        }
      }
      
      content += squares + '\n\n';
      content += keyboard + '\n\n';
      content += `Attempts: ${this.state.currentRow}/${this.MAX_GUESSES}\n`;
      
      if (this.state.hardMode) {
        content += `🔴 HARD MODE\n`;
      }
      
      // Only show guess instructions to the active player
      if (!this.state.customMode || forPlayer === this.state.guesserId) {
        content += `\n`;
        content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        content += `👇 TYPE YOUR GUESS IN THE CHAT BELOW! 👇\n`;
        content += `Just type any 5-letter word and press Enter\n`;
        content += `Examples: CRANE, SLATE, AUDIO\n`;
        content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      }
      
      content += `\`\`\``;
      
      components = this.createPlayingButtons();
      return { content, components };
    }
    
    // Game over state
    if (this.state.gameState === WordleGameState.GAME_OVER) {
      const squares = this.renderBoard();
      const stats = this.renderStats();
      
      content = `\`\`\`\n╔═══════════════════════════╗\n`;
      content += `║       WORDLE 🟩 🟨        ║\n`;
      content += `╚═══════════════════════════╝\n\n`;
      
      // Show who played in custom mode
      if (this.state.customMode) {
        content += `👤 Word set by: ${this.state.creatorName}\n`;
        content += `🎯 Guesser: ${this.state.guesserName}\n\n`;
      }
      
      content += squares + '\n\n';
      content += this.renderGameOver() + '\n\n';
      content += stats;
      content += `\`\`\``;
      
      components = this.createGameOverButtons();
      return { content, components };
    }
    
    // Fallback
    return { content: 'Game state error' };
    
    } catch (error) {
      logger.error(`[Wordle] Error in renderState:`, error);
      return { 
        content: `\`\`\`\nError rendering game state.\nPlease try restarting the game.\n\`\`\``,
        components: [
          { type: 'button', id: 'new_game', label: '🔄 Restart', style: 'danger' }
        ]
      };
    }
  }
  
  private renderBoard(): string {
    let board = '';
    
    // Render completed guesses
    for (let i = 0; i < this.state.guesses.length; i++) {
      const guess = this.state.guesses[i];
      const results = this.getGuessResults(guess);
      
      // Letters row
      board += '  ';
      for (const letter of guess) {
        board += letter.toUpperCase() + '  ';
      }
      board += '\n';
      
      // Emoji row
      board += ' ';
      for (const result of results) {
        if (result.status === 'correct') board += '🟩 ';
        else if (result.status === 'present') board += '🟨 ';
        else board += '⬜ ';
      }
      board += '\n\n';
    }
    
    // Render empty rows
    for (let i = this.state.currentRow; i < this.MAX_GUESSES; i++) {
      board += '  _  _  _  _  _\n';
      board += ' ⬜ ⬜ ⬜ ⬜ ⬜\n\n';
    }
    
    return board.trim();
  }
  
  private renderKeyboard(): string {
    const rows = [
      'QWERTYUIOP',
      'ASDFGHJKL',
      'ZXCVBNM',
    ];
    
    let keyboard = '';
    
    for (const row of rows) {
      // Letters
      const letters = row.split('');
      keyboard += letters.join(' ') + '\n';
      
      // Status indicators
      for (const letter of letters) {
        const status = this.state.keyboard[letter];
        if (status === 'correct') keyboard += '🟩 ';
        else if (status === 'present') keyboard += '🟨 ';
        else if (status === 'absent') keyboard += '⬜ ';
        else keyboard += '  '; // unused
      }
      keyboard += '\n\n';
    }
    
    return keyboard.trim();
  }
  
  private renderGameOver(): string {
    if (this.state.won) {
      const attempts = this.state.currentRow;
      const messages = [
        'Genius!',
        'Magnificent!',
        'Impressive!',
        'Splendid!',
        'Great!',
        'Phew!',
      ];
      return `🎉 ${messages[attempts - 1]} Got it in ${attempts}!`;
    } else {
      return `💔 The word was: ${this.state.targetWord.toUpperCase()}`;
    }
  }
  
  renderStats(): UIMessage {
    // This would connect to actual stats from database
    return {
      content: 'Stats: Games: 0 | Win %: 0 | Streak: 0',
    };
  }
  
  renderHelp(): UIMessage {
    const helpText = `
**How to Play Wordle**

🎯 **Objective**: Guess the secret 5-letter word in 6 tries or less!

**How to Play**:
1. 📝 **TYPE YOUR GUESSES DIRECTLY IN THE CHAT** - no buttons needed!
2. Just type any 5-letter word in this chat channel and press Enter
3. After each guess, the color of the tiles will change:
   - 🟩 Green: Letter is in the word and in the correct spot
   - 🟨 Yellow: Letter is in the word but in the wrong spot
   - ⬜ Gray: Letter is not in the word

**Example**: Just type "CRANE" in the chat and send the message!

**Tips**:
- Start with words that have common vowels (A, E, I, O, U)
- Use the keyboard display to track which letters you've tried
- Hard Mode: You must use all revealed hints in subsequent guesses

**Remember**: This is a text-based game - simply type your guesses as regular chat messages!
`;
    
    return {
      content: helpText,
    };
  }
  
  async getValidMoves(playerId: string): Promise<any[]> {
    if (this.state.gameOver) {
      return [];
    }
    
    // In Wordle, any 5-letter word from the allowed list is a valid move
    return this.allowed.map(word => word.toUpperCase());
  }
  
  // Protected abstract methods
  protected createInitialState(): any {
    return {
      targetWord: '',
      guesses: [],
      currentRow: 0,
      gameMode: 'random',
      keyboard: {},
      gameOver: false,
      won: false,
      hardMode: false,
      hintsUsed: 0,
      startTime: Date.now(),
      gameState: WordleGameState.MODE_SELECTION,
      customMode: false,
      creatorId: undefined,
      creatorName: undefined,
      guesserId: undefined,
      guesserName: undefined,
    };
  }
  
  protected getCurrentPlayer(): string | undefined {
    const players = this.getPlayers();
    return players[0]; // Single player game
  }
  
  protected getPlayerStates(): any[] {
    const players = this.getPlayers();
    return players.map(playerId => ({
      playerId,
      isActive: true,
      isAI: false,
      score: this.state.won ? 1 : 0,
    }));
  }
  
  protected getScores(): Record<string, number> {
    const players = this.getPlayers();
    const scores: Record<string, number> = {};
    if (players[0]) {
      scores[players[0]] = this.state.won ? 1 : 0;
    }
    return scores;
  }
  
  private createPlayingButtons(): UIComponent[] | undefined {
    const components: UIComponent[] = [];
    
    if (this.state.hintsUsed < 2 && this.state.currentRow >= 3) {
      components.push(
        { type: 'button', id: 'hint', label: `💡 Hint (${2 - this.state.hintsUsed} left)`, style: 'secondary' }
      );
    }
    
    return components.length > 0 ? components : undefined;
  }
  
  private createGameOverButtons(): UIComponent[] | undefined {
    const components: UIComponent[] = [];
    
    components.push(
      { type: 'button', id: 'share', label: '📤 Share', style: 'primary' },
      { type: 'button', id: 'new_game', label: '🔄 New Game', style: 'secondary' }
    );
    
    return components;
  }
  
  // Required abstract methods
  async validateMove(playerId: string, move: any): Promise<boolean> {
    return true; // Validation happens in processGuess
  }
  
  async makeMove(playerId: string, move: any): Promise<MoveResult> {
    if (typeof move === 'string') {
      return this.processGuess(playerId, move);
    }
    return { success: false, stateChanged: false };
  }
  
  async end(reason: GameEndReason): Promise<void> {
    this.state.gameOver = true;
    await super.end(reason);
  }
  
  getCurrentState(): GameStateSnapshot {
    const players = this.getPlayers();
    return {
      gameId: this.id,
      turnNumber: this.state.currentRow,
      currentPlayer: players[0],
      players: players.map(playerId => ({
        playerId,
        isActive: true,
        isAI: false,
        score: this.state.won ? 1 : 0,
      })),
      board: this.state.guesses,
      gameSpecificData: {
        targetWord: this.state.gameOver ? this.state.targetWord : undefined,
        keyboard: this.state.keyboard,
        won: this.state.won,
        hintsUsed: this.state.hintsUsed,
      },
    };
  }
  
  serialize(): string {
    return JSON.stringify(this.gameState);
  }
  
  deserialize(data: string): void {
    this.gameState = JSON.parse(data);
  }
  
  getShareableResult(): string {
    if (!this.state.gameOver) return '';
    
    const title = `Wordle ${this.state.dailyIndex || 'Practice'} ${
      this.state.won ? this.state.currentRow : 'X'
    }/6${this.state.hardMode ? '*' : ''}`;
    
    let grid = '';
    for (const guess of this.state.guesses) {
      const results = this.getGuessResults(guess);
      for (const result of results) {
        if (result.status === 'correct') grid += '🟩';
        else if (result.status === 'present') grid += '🟨';
        else grid += '⬜';
      }
      grid += '\n';
    }
    
    return `${title}\n\n${grid}`;
  }
}