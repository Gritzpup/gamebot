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
  gameMode: 'daily' | 'random' | 'custom' | 'versus';
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
  // For versus mode (two-player random word)
  versusMode?: boolean;
  player1Id?: string;
  player1Name?: string;
  player1Guesses?: string[];
  player1Won?: boolean;
  player2Id?: string;
  player2Name?: string;
  player2Guesses?: string[];
  player2Won?: boolean;
  currentGuesser?: string; // Track whose turn it is in versus mode
  waitingStartTime?: number; // When we started waiting for opponent
  player2IsBot?: boolean; // Whether player 2 is a bot
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
      versusMode: false,
      player1Id: undefined,
      player1Name: undefined,
      player1Guesses: undefined,
      player1Won: false,
      player2Id: undefined,
      player2Name: undefined,
      player2Guesses: undefined,
      player2Won: false,
      currentGuesser: undefined,
      waitingStartTime: undefined,
      player2IsBot: false,
    } as WordleState;
    
    // Initialize keyboard
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(letter => {
      this.state.keyboard[letter] = 'unused';
    });
    
    // Creator info will be set when a mode is selected
    
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
            this.state.creatorId = interaction.userId;
            this.state.creatorName = this.getPlayerName(interaction.userId);
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
          
          if (buttonId === 'mode_versus') {
            this.state.gameMode = 'versus';
            this.state.customMode = false;
            this.state.versusMode = true;
            this.state.player1Id = interaction.userId;
            this.state.player1Name = this.getPlayerName(interaction.userId);
            this.state.player1Guesses = [];
            this.state.player1Won = false;
            this.state.waitingStartTime = Date.now();
            this.state.gameState = WordleGameState.WAITING_FOR_PLAYER;
            logger.info(`[Wordle] Versus mode selected - Waiting for second player`);
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
    
    // Handle waiting for player (custom mode or versus mode)
    if (this.state.gameState === WordleGameState.WAITING_FOR_PLAYER) {
      if (interaction.type === 'button_click' && interaction.data?.id === 'join_game') {
        // In versus mode
        if (this.state.versusMode) {
          // Can't join your own versus game
          if (interaction.userId === this.state.player1Id) {
            return { success: false, message: "You can't play against yourself!", stateChanged: false };
          }
          
          // Set player 2
          this.state.player2Id = interaction.userId;
          this.state.player2Name = this.getPlayerName(interaction.userId);
          this.state.player2Guesses = [];
          this.state.player2Won = false;
          
          // Log for debugging
          logger.info(`[Wordle] Player 2 joined - ID: ${interaction.userId}, Name: ${this.state.player2Name}`);
          
          // Generate random word for versus mode
          this.selectTargetWord();
          
          // Start with player 1's turn
          this.state.currentGuesser = this.state.player1Id;
          this.state.gameState = WordleGameState.PLAYING;
          this.state.startTime = Date.now();
          
          logger.info(`[Wordle] Versus mode started - ${this.state.player1Name} vs ${this.state.player2Name}, Word: ${this.state.targetWord}`);
          return { success: true, stateChanged: true };
        }
        
        // In custom mode
        else {
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
      }
      
      if (interaction.type === 'button_click' && interaction.data?.id === 'cancel_game') {
        if (interaction.userId === this.state.creatorId || interaction.userId === this.state.player1Id) {
          return { success: true, gameEnded: true, stateChanged: false };
        }
      }
      
      if (interaction.type === 'button_click' && interaction.data?.id === 'play_bot') {
        if (this.state.versusMode && (interaction.userId === this.state.player1Id)) {
          // Start game with bot immediately
          this.state.player2Id = 'bot';
          this.state.player2Name = '🤖 WordleBot';
          this.state.player2IsBot = true;
          this.state.player2Guesses = [];
          this.state.player2Won = false;
          this.selectTargetWord();
          this.state.currentGuesser = this.state.player1Id;
          this.state.gameState = WordleGameState.PLAYING;
          this.state.startTime = Date.now();
          logger.info(`[Wordle] Player chose to play versus bot - Word: ${this.state.targetWord}`);
          return { success: true, stateChanged: true };
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
    
    // In versus mode, check if it's the player's turn
    if (this.state.versusMode) {
      if (playerId !== this.state.currentGuesser) {
        const currentPlayerName = playerId === this.state.player1Id ? this.state.player1Name : this.state.player2Name;
        const otherPlayerName = this.state.currentGuesser === this.state.player1Id ? this.state.player1Name : this.state.player2Name;
        return { success: false, message: `It's ${otherPlayerName}'s turn!`, stateChanged: false };
      }
    }
    // In single player mode, only the creator can make guesses
    else if (!this.state.customMode && playerId !== this.state.creatorId) {
      return { success: false, message: 'This is not your game! Start your own with /play wordle', stateChanged: false };
    }
    // In custom mode, only the guesser can make guesses
    else if (this.state.customMode && playerId !== this.state.guesserId) {
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
    
    // Process the guess for versus mode
    if (this.state.versusMode) {
      const isPlayer1 = playerId === this.state.player1Id;
      
      // Add guess to the appropriate player's list
      if (isPlayer1) {
        if (!this.state.player1Guesses) this.state.player1Guesses = [];
        this.state.player1Guesses.push(guessLower);
      } else {
        if (!this.state.player2Guesses) this.state.player2Guesses = [];
        this.state.player2Guesses.push(guessLower);
      }
      
      // Check if player won
      if (guessLower === this.state.targetWord) {
        if (isPlayer1) {
          this.state.player1Won = true;
        } else {
          this.state.player2Won = true;
        }
        
        // Check if both players have finished
        const player1Finished = this.state.player1Won || (this.state.player1Guesses?.length || 0) >= this.MAX_GUESSES;
        const player2Finished = this.state.player2Won || (this.state.player2Guesses?.length || 0) >= this.MAX_GUESSES;
        
        if (player1Finished && player2Finished) {
          // Game over - determine winner
          this.state.gameOver = true;
          
          if (this.state.player1Won && !this.state.player2Won) {
            return { success: true, gameEnded: true, winner: this.state.player1Id, stateChanged: true };
          } else if (!this.state.player1Won && this.state.player2Won) {
            return { success: true, gameEnded: true, winner: this.state.player2Id, stateChanged: true };
          } else if (this.state.player1Won && this.state.player2Won) {
            // Both won - check who won in fewer guesses
            const p1Guesses = this.state.player1Guesses?.length || 0;
            const p2Guesses = this.state.player2Guesses?.length || 0;
            if (p1Guesses < p2Guesses) {
              return { success: true, gameEnded: true, winner: this.state.player1Id, stateChanged: true };
            } else if (p2Guesses < p1Guesses) {
              return { success: true, gameEnded: true, winner: this.state.player2Id, stateChanged: true };
            } else {
              return { success: true, gameEnded: true, isDraw: true, stateChanged: true };
            }
          } else {
            // Neither won
            return { success: true, gameEnded: true, isDraw: true, stateChanged: true };
          }
        } else {
          // Switch turns if current player hasn't won and hasn't used all guesses
          if (!((isPlayer1 && this.state.player1Won) || (!isPlayer1 && this.state.player2Won))) {
            const currentPlayerGuesses = isPlayer1 ? this.state.player1Guesses?.length || 0 : this.state.player2Guesses?.length || 0;
            if (currentPlayerGuesses < this.MAX_GUESSES) {
              this.state.currentGuesser = isPlayer1 ? this.state.player2Id : this.state.player1Id;
            }
          }
          
          return { success: true, gameEnded: false, stateChanged: true };
        }
      }
      
      // Check if player used all guesses
      const currentPlayerGuesses = isPlayer1 ? this.state.player1Guesses?.length || 0 : this.state.player2Guesses?.length || 0;
      if (currentPlayerGuesses >= this.MAX_GUESSES) {
        // Switch to other player if they haven't finished
        const otherPlayerFinished = isPlayer1 
          ? (this.state.player2Won || (this.state.player2Guesses?.length || 0) >= this.MAX_GUESSES)
          : (this.state.player1Won || (this.state.player1Guesses?.length || 0) >= this.MAX_GUESSES);
          
        if (!otherPlayerFinished) {
          this.state.currentGuesser = isPlayer1 ? this.state.player2Id : this.state.player1Id;
          
          // Trigger bot move if it's now bot's turn
          if (this.state.player2IsBot && this.state.currentGuesser === 'bot') {
            this.makeBotMove().catch(err => {
              logger.error(`[Wordle] Error in bot move after max guesses:`, err);
            });
          }
          
          return { success: true, gameEnded: false, stateChanged: true };
        } else {
          // Both players finished - game over
          this.state.gameOver = true;
          
          if (this.state.player1Won && !this.state.player2Won) {
            return { success: true, gameEnded: true, winner: this.state.player1Id, stateChanged: true };
          } else if (!this.state.player1Won && this.state.player2Won) {
            return { success: true, gameEnded: true, winner: this.state.player2Id, stateChanged: true };
          } else {
            return { success: true, gameEnded: true, isDraw: true, stateChanged: true };
          }
        }
      }
      
      // Normal turn switch
      this.state.currentGuesser = isPlayer1 ? this.state.player2Id : this.state.player1Id;
      
      // Trigger bot move if it's now bot's turn
      if (this.state.player2IsBot && this.state.currentGuesser === 'bot') {
        // Use a promise to handle the async bot move
        this.makeBotMove().catch(err => {
          logger.error(`[Wordle] Error in bot move:`, err);
        });
      }
      
      return { success: true, gameEnded: false, stateChanged: true };
    }
    
    // Regular single-player or custom mode processing
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
      content += `⚔️ VERSUS MODE - Compete with a friend!\n`;
      content += `   Both guess the same random word\n\n`;
      content += `📅 DAILY CHALLENGE - Today's word\n`;
      content += `   Everyone gets the same word\n`;
      content += `\`\`\``;
      
      components = [
        { type: 'button', id: 'mode_single', label: '🎲 Single Player', style: 'primary' },
        { type: 'button', id: 'mode_custom', label: '👥 Custom Word', style: 'success' },
        { type: 'button', id: 'mode_versus', label: '⚔️ Versus Mode', style: 'danger' },
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
    
    // Waiting for player state (custom mode or versus mode)
    if (this.state.gameState === WordleGameState.WAITING_FOR_PLAYER) {
      const isCreator = forPlayer === this.state.creatorId || forPlayer === this.state.player1Id;
      
      if (this.state.versusMode) {
        // Check if 10 seconds have passed
        const waitTime = Date.now() - (this.state.waitingStartTime || 0);
        const timeRemaining = Math.max(0, 10 - Math.floor(waitTime / 1000));
        
        // Don't auto-start in renderState - this should be handled by user interaction
        
        // Versus mode
        content = `\`\`\`\n╔═══════════════════════════╗\n`;
        content += `║   WORDLE - VERSUS MODE    ║\n`;
        content += `╚═══════════════════════════╝\n\n`;
        content += `⚔️ ${this.state.player1Name} is ready!\n\n`;
        content += `Waiting for an opponent...\n`;
        content += `⏱️ Bot joins in: ${timeRemaining}s\n\n`;
        content += `First to guess the word wins!\n`;
        content += `Or whoever guesses in fewer tries.\n`;
      } else {
        // Custom mode
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
      }
      content += `\`\`\``;
      
      components = [];
      if (!isCreator) {
        components.push({ type: 'button', id: 'join_game', label: '🎮 Join Game', style: 'success' });
      }
      if (isCreator) {
        if (this.state.versusMode) {
          components.push({ type: 'button', id: 'play_bot', label: '🤖 Play vs Bot', style: 'primary' });
        }
        components.push({ type: 'button', id: 'cancel_game', label: '❌ Cancel', style: 'danger' });
      }
      
      return { content, components };
    }
    
    // Playing state
    if (this.state.gameState === WordleGameState.PLAYING) {
      content = `\`\`\`\n╔═══════════════════════════╗\n`;
      content += `║       WORDLE 🟩 🟨        ║\n`;
      content += `╚═══════════════════════════╝\n\n`;
      
      // Versus mode
      if (this.state.versusMode) {
        content += `⚔️ VERSUS MODE - ${this.state.player1Name} vs ${this.state.player2Name}\n\n`;
        
        // Show whose turn it is
        const currentPlayerName = this.state.currentGuesser === this.state.player1Id ? this.state.player1Name : this.state.player2Name;
        content += `🎯 Current turn: ${currentPlayerName}\n\n`;
        
        // Player 1 board
        content += `${this.state.player1Name}:\n`;
        content += this.renderBoardForPlayer(this.state.player1Guesses || [], this.state.player1Won || false) + '\n\n';
        
        // Player 2 board
        content += `${this.state.player2Name}:\n`;
        content += this.renderBoardForPlayer(this.state.player2Guesses || [], this.state.player2Won || false) + '\n\n';
        
        // Show instructions only to the current player
        if (forPlayer === this.state.currentGuesser) {
          content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          content += `👇 IT'S YOUR TURN! TYPE YOUR GUESS! 👇\n`;
          content += `Just type any 5-letter word and press Enter\n`;
          content += `Examples: CRANE, SLATE, AUDIO\n`;
          content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        }
      }
      // Custom mode
      else if (this.state.customMode) {
        const isGuesser = forPlayer === this.state.guesserId;
        const isCreator = forPlayer === this.state.creatorId;
        
        content += `👤 Word set by: ${this.state.creatorName}\n`;
        content += `🎯 Guesser: ${this.state.guesserName}\n\n`;
        
        if (!isGuesser && !isCreator) {
          content += `(Spectating)\n\n`;
        }
        
        if (this.state.currentRow === 0 && !this.state.gameOver) {
          // Only show input instructions to the guesser in custom mode
          if (forPlayer === this.state.guesserId) {
            content += `📝 TO PLAY: Type a 5-letter word\n`;
            content += `   in this chat and press Enter!\n\n`;
          }
        }
        
        const squares = this.renderBoard();
        const keyboard = this.renderKeyboard();
        
        content += squares + '\n\n';
        content += keyboard + '\n\n';
        content += `Attempts: ${this.state.currentRow}/${this.MAX_GUESSES}\n`;
        
        if (this.state.hardMode) {
          content += `🔴 HARD MODE\n`;
        }
        
        // Only show guess instructions to the active player
        if (forPlayer === this.state.guesserId) {
          content += `\n`;
          content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          content += `👇 TYPE YOUR GUESS IN THE CHAT BELOW! 👇\n`;
          content += `Just type any 5-letter word and press Enter\n`;
          content += `Examples: CRANE, SLATE, AUDIO\n`;
          content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        }
      }
      // Single player mode
      else {
        if (this.state.currentRow === 0 && !this.state.gameOver) {
          content += `📝 TO PLAY: Type a 5-letter word\n`;
          content += `   in this chat and press Enter!\n\n`;
        }
        
        const squares = this.renderBoard();
        const keyboard = this.renderKeyboard();
        
        content += squares + '\n\n';
        content += keyboard + '\n\n';
        content += `Attempts: ${this.state.currentRow}/${this.MAX_GUESSES}\n`;
        
        if (this.state.hardMode) {
          content += `🔴 HARD MODE\n`;
        }
        
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
      content = `\`\`\`\n╔═══════════════════════════╗\n`;
      content += `║       WORDLE 🟩 🟨        ║\n`;
      content += `╚═══════════════════════════╝\n\n`;
      
      // Versus mode
      if (this.state.versusMode) {
        content += `⚔️ VERSUS MODE - GAME OVER\n\n`;
        content += `The word was: ${this.state.targetWord.toUpperCase()}\n\n`;
        
        // Player 1 board
        content += `${this.state.player1Name}: ${this.state.player1Won ? '🏆 WON' : '❌ LOST'}\n`;
        content += this.renderBoardForPlayer(this.state.player1Guesses || [], this.state.player1Won || false) + '\n\n';
        
        // Player 2 board
        content += `${this.state.player2Name}: ${this.state.player2Won ? '🏆 WON' : '❌ LOST'}\n`;
        content += this.renderBoardForPlayer(this.state.player2Guesses || [], this.state.player2Won || false) + '\n\n';
        
        // Determine winner
        if (this.state.player1Won && this.state.player2Won) {
          const p1Guesses = this.state.player1Guesses?.length || 0;
          const p2Guesses = this.state.player2Guesses?.length || 0;
          if (p1Guesses < p2Guesses) {
            content += `🎉 ${this.state.player1Name} WINS! (Fewer guesses: ${p1Guesses} vs ${p2Guesses})\n`;
          } else if (p2Guesses < p1Guesses) {
            content += `🎉 ${this.state.player2Name} WINS! (Fewer guesses: ${p2Guesses} vs ${p1Guesses})\n`;
          } else {
            content += `🤝 IT'S A TIE! Both solved in ${p1Guesses} guesses!\n`;
          }
        } else if (this.state.player1Won) {
          content += `🎉 ${this.state.player1Name} WINS!\n`;
        } else if (this.state.player2Won) {
          content += `🎉 ${this.state.player2Name} WINS!\n`;
        } else {
          content += `😢 Neither player guessed the word!\n`;
        }
      }
      // Custom mode
      else if (this.state.customMode) {
        content += `👤 Word set by: ${this.state.creatorName}\n`;
        content += `🎯 Guesser: ${this.state.guesserName}\n\n`;
        
        const squares = this.renderBoard();
        content += squares + '\n\n';
        content += this.renderGameOver() + '\n\n';
      }
      // Single player mode
      else {
        const squares = this.renderBoard();
        content += squares + '\n\n';
        content += this.renderGameOver() + '\n\n';
      }
      
      content += `\`\`\``;
      
      components = this.createGameOverButtons();
      return { content, components };
    }
    
    // Note: Bot moves are now triggered after human moves in processGuess
    
    // Fallback
    return { content: 'Game state error' };
    
    } catch (error) {
      logger.error(`[Wordle] Error in renderState:`, error);
      return { 
        content: `\`\`\`\nError rendering game state.\nPlease start a new game.\n\`\`\``
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
  
  private renderBoardForPlayer(guesses: string[], hasWon: boolean): string {
    let board = '';
    
    // Render completed guesses
    for (let i = 0; i < guesses.length; i++) {
      const guess = guesses[i];
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
    
    // Render empty rows if player hasn't finished
    if (!hasWon && guesses.length < this.MAX_GUESSES) {
      for (let i = guesses.length; i < this.MAX_GUESSES; i++) {
        board += '  _  _  _  _  _\n';
        board += ' ⬜ ⬜ ⬜ ⬜ ⬜\n\n';
      }
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
      { type: 'button', id: 'share', label: '📤 Share', style: 'primary' }
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
  
  isGameOver(): boolean {
    return this.state.gameState === WordleGameState.GAME_OVER || this.state.gameOver;
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
  
  private generateBotGuess(): string {
    // Get previous bot guesses
    const botGuesses = this.state.player2Guesses || [];
    
    if (botGuesses.length === 0) {
      // First guess - use a common starting word
      const startWords = ['crane', 'slate', 'crate', 'stare', 'trace', 'raise', 'adieu', 'roast'];
      return startWords[Math.floor(Math.random() * startWords.length)];
    }
    
    // If we've already made 5 guesses, just try any valid word
    if (botGuesses.length >= 5) {
      const remainingWords = this.allowed.filter(word => !botGuesses.includes(word));
      if (remainingWords.length > 0) {
        return remainingWords[Math.floor(Math.random() * remainingWords.length)];
      }
    }
    
    // Simplified constraints - just track which letters must be in specific positions
    const mustBeAt: { [pos: number]: string } = {};
    const mustInclude: Set<string> = new Set();
    const cannotInclude: Set<string> = new Set();
    
    // Get the most recent guess results only (simpler logic)
    const lastGuess = botGuesses[botGuesses.length - 1];
    const results = this.getGuessResults(lastGuess);
    
    for (let i = 0; i < results.length; i++) {
      const letter = lastGuess[i];
      if (results[i].status === 'correct') {
        mustBeAt[i] = letter;
      } else if (results[i].status === 'present') {
        mustInclude.add(letter);
      } else if (results[i].status === 'absent') {
        // Only exclude if it's not already known to be in the word
        if (!mustInclude.has(letter) && !Object.values(mustBeAt).includes(letter)) {
          cannotInclude.add(letter);
        }
      }
    }
    
    logger.info(`[Wordle] Bot constraints - mustBeAt: ${JSON.stringify(mustBeAt)}, mustInclude: ${Array.from(mustInclude)}, cannotInclude: ${Array.from(cannotInclude)}`);
    
    // Find valid words that match constraints
    const validWords = this.allowed.filter(word => {
      // Skip already guessed words
      if (botGuesses.includes(word)) return false;
      
      // Check letters that must be in specific positions
      for (const [pos, letter] of Object.entries(mustBeAt)) {
        if (word[Number(pos)] !== letter) return false;
      }
      
      // Check letters that must be included (but not where we last tried them)
      for (const letter of mustInclude) {
        if (!word.includes(letter)) return false;
      }
      
      // Check letters that cannot be in the word
      for (const letter of cannotInclude) {
        if (word.includes(letter)) return false;
      }
      
      return true;
    });
    
    logger.info(`[Wordle] Bot found ${validWords.length} valid words`);
    
    // Choose from valid words (prefer common words/answers)
    if (validWords.length > 0) {
      // Prefer words that are in the answers list
      const answerWords = validWords.filter(w => this.answers.includes(w));
      if (answerWords.length > 0) {
        const chosen = answerWords[Math.floor(Math.random() * Math.min(3, answerWords.length))];
        logger.info(`[Wordle] Bot choosing from ${answerWords.length} answer words: ${chosen}`);
        return chosen;
      }
      const chosen = validWords[Math.floor(Math.random() * Math.min(5, validWords.length))];
      logger.info(`[Wordle] Bot choosing from valid words: ${chosen}`);
      return chosen;
    }
    
    // Fallback - shouldn't happen with valid game state
    logger.warn(`[Wordle] Bot using fallback - no valid words found!`);
    return this.allowed[Math.floor(Math.random() * this.allowed.length)];
  }
  
  private async makeBotMove(): Promise<void> {
    logger.info(`[Wordle] makeBotMove called - player2IsBot: ${this.state.player2IsBot}, currentGuesser: ${this.state.currentGuesser}, gameOver: ${this.state.gameOver}`);
    
    if (!this.state.player2IsBot || this.state.currentGuesser !== 'bot' || this.state.gameOver) {
      logger.info(`[Wordle] Bot move skipped - conditions not met`);
      return;
    }
    
    // Add a small delay to make it feel more natural
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const botGuess = this.generateBotGuess();
    logger.info(`[Wordle] Bot guessing: ${botGuess}`);
    
    // Process the bot's guess
    const result = this.processGuess('bot', botGuess);
    logger.info(`[Wordle] Bot guess result: ${JSON.stringify(result)}`);
    
    // Check if game ended
    if (result.success && (this.state.player2Won || this.state.gameOver)) {
      this.state.gameState = WordleGameState.GAME_OVER;
    }
    
    // The state should automatically update when processGuess is called
    // No need to manually trigger update
  }
}