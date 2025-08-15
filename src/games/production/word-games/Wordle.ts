import { BaseGame } from '../../BaseGame';
import {
  GameCategory,
  GameEndReason,
  MoveResult,
  GameStateSnapshot,
  GameDifficulty,
} from '../../../types/game.types';
import { Player, UIMessage, GameInteraction, UIComponent } from '../../../types';
import { logger } from '../../../utils/logger';
import * as wordleAnswers from './data/wordle-answers.json';
import * as wordleAllowed from './data/wordle-allowed.json';

interface WordleState {
  targetWord: string;
  guesses: string[];
  currentRow: number;
  gameMode: 'daily' | 'random';
  dailyIndex?: number;
  keyboard: {
    [letter: string]: 'correct' | 'present' | 'absent' | 'unused';
  };
  gameOver: boolean;
  won: boolean;
  hardMode: boolean;
  hintsUsed: number;
  startTime: number;
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
  maxPlayers = 1;
  estimatedDuration = 5; // 5 minutes
  difficulty = GameDifficulty.Medium;
  acceptsTextInput = true; // Explicitly declare that Wordle accepts text input
  
  private state: WordleState = {
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
  };
  
  private readonly MAX_GUESSES = 6;
  private readonly WORD_LENGTH = 5;
  private readonly answers: string[] = wordleAnswers as unknown as string[];
  private readonly allowed: string[] = wordleAllowed as unknown as string[];
  
  async initialize(session: any): Promise<void> {
    await super.initialize(session);
    
    // Copy gameState from base class to our state
    this.state = this.gameState;
    
    // Initialize keyboard
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(letter => {
      this.state.keyboard[letter] = 'unused';
    });
    
    // Select target word
    this.selectTargetWord();
    
    logger.info(`Wordle initialized with word: ${this.state.targetWord}`);
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
    logger.info('Wordle game started');
    
    // Send initial message to clarify how to play
    if (this.session) {
      const initialMessage = {
        content: '📝 **HOW TO PLAY**: Simply type any 5-letter word in this chat and press Enter to make a guess! No buttons needed - just type your word as a regular message.',
      };
      // This message will be sent by the session handler
    }
  }
  
  async processInteraction(interaction: GameInteraction): Promise<MoveResult | null> {
    // Handle text input for word guesses
    if (interaction.type === 'text_input' && interaction.data?.text) {
      const guess = interaction.data.text.toUpperCase();
      const result = await this.processGuess(interaction.userId, guess);
      
      // After processing the guess, we need to update the UI
      if (result.success) {
        // The GameSession will handle rendering the new state
        return result;
      }
      
      // If invalid, still return the result so the error can be shown
      return result;
    }
    
    // Handle button clicks
    if (interaction.type === 'button_click') {
      const buttonId = interaction.data?.id;
      
      if (buttonId === 'new_game') {
        // Reset and start new game
        await this.initialize(this.session);
        await this.start();
        return {
          success: true,
          gameEnded: false,
        };
      }
      
      if (buttonId === 'hint' && this.state.hintsUsed < 2) {
        return this.provideHint();
      }
      
      if (buttonId === 'share') {
        // Share functionality would be handled by the platform
        return null;
      }
    }
    
    return null;
  }
  
  private processGuess(playerId: string, guess: string): MoveResult {
    // Validate game state
    if (this.state.gameOver) {
      return { success: false, message: 'Game is already over!' };
    }
    
    // Validate guess length
    if (guess.length !== this.WORD_LENGTH) {
      return { success: false, message: `Guess must be ${this.WORD_LENGTH} letters!` };
    }
    
    // Validate word exists
    const guessLower = guess.toLowerCase();
    if (!this.allowed.includes(guessLower)) {
      return { success: false, message: 'Not in word list!' };
    }
    
    // Hard mode validation
    if (this.state.hardMode && this.state.guesses.length > 0) {
      const hardModeError = this.validateHardMode(guessLower);
      if (hardModeError) {
        return { success: false, message: hardModeError };
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
      };
    }
    
    // Check loss condition
    if (this.state.currentRow >= this.MAX_GUESSES) {
      this.state.gameOver = true;
      return {
        success: true,
        gameEnded: true,
        isDraw: true, // No winner in single player
      };
    }
    
    return {
      success: true,
      gameEnded: false,
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
      return { success: false, message: 'No more hints available!' };
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
        stateChange: {
          hint: 'Think about common 5-letter words!',
        },
      };
    }
    
    return { success: true, gameEnded: false };
  }
  
  renderState(forPlayer?: string): UIMessage {
    const squares = this.renderBoard();
    const keyboard = this.renderKeyboard();
    const stats = this.renderStats();
    
    let content = `\`\`\`\n╔═══════════════════════════╗\n`;
    content += `║       WORDLE 🟩 🟨        ║\n`;
    content += `╚═══════════════════════════╝\n\n`;
    
    if (this.state.currentRow === 0 && !this.state.gameOver) {
      content += `📝 TO PLAY: Type a 5-letter word\n`;
      content += `   in this chat and press Enter!\n\n`;
    }
    
    content += squares + '\n\n';
    
    if (!this.state.gameOver) {
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
    } else {
      content += this.renderGameOver() + '\n\n';
      content += stats;
    }
    
    content += `\`\`\``;
    
    const components = this.createButtons();
    
    return {
      content,
      components,
    };
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
  
  private createButtons(): UIComponent[] | undefined {
    const components: UIComponent[] = [];
    
    if (this.state.gameOver) {
      components.push(
        { type: 'button', id: 'share', label: '📤 Share', style: 'primary' },
        { type: 'button', id: 'new_game', label: '🔄 New Game', style: 'secondary' }
      );
    } else {
      if (this.state.hintsUsed < 2 && this.state.currentRow >= 3) {
        components.push(
          { type: 'button', id: 'hint', label: `💡 Hint (${2 - this.state.hintsUsed} left)`, style: 'secondary' }
        );
      }
    }
    
    return components.length > 0 ? components : undefined;
  }
  
  // Required abstract methods
  async validateMove(playerId: string, move: any): Promise<boolean> {
    return true; // Validation happens in processGuess
  }
  
  async makeMove(playerId: string, move: any): Promise<MoveResult> {
    if (typeof move === 'string') {
      return this.processGuess(playerId, move);
    }
    return { success: false };
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
    return JSON.stringify(this.state);
  }
  
  deserialize(data: string): void {
    this.state = JSON.parse(data);
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