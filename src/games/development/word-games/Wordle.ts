import { BaseGame } from '../../BaseGame';
import {
  GameCategory,
  GameDifficulty,
  MoveResult
} from '../../../types/game.types';
import { UIMessage } from '../../../types';

interface WordleState {
  targetWord: string;
  guesses: string[];
  results: ('correct' | 'present' | 'absent')[][];
  maxGuesses: number;
  isComplete: boolean;
  winner?: string;
}

// Sample word list (in production, load from a file)
const WORD_LIST = [
  'ABOUT', 'ABOVE', 'ABUSE', 'ACTOR', 'ACUTE', 'ADMIT', 'ADOPT', 'ADULT', 'AFTER', 'AGAIN',
  'AGENT', 'AGREE', 'AHEAD', 'ALARM', 'ALBUM', 'ALERT', 'ALIEN', 'ALIGN', 'ALIKE', 'ALIVE',
  'ALLOW', 'ALONE', 'ALONG', 'ALTER', 'ANGEL', 'ANGER', 'ANGLE', 'ANGRY', 'APART', 'APPLE',
  'APPLY', 'ARENA', 'ARGUE', 'ARISE', 'ARMED', 'ARMOR', 'ARRAY', 'ARROW', 'ASIDE', 'ASSET',
  'AVOID', 'AWARD', 'AWARE', 'BADLY', 'BAKER', 'BASES', 'BASIC', 'BEACH', 'BEGAN', 'BEING',
  'BELOW', 'BENCH', 'BILLY', 'BIRTH', 'BLACK', 'BLAME', 'BLIND', 'BLOCK', 'BLOOD', 'BOARD',
  'BOOST', 'BOOTH', 'BOUND', 'BRAIN', 'BRAND', 'BRAVE', 'BREAD', 'BREAK', 'BREED', 'BRIEF',
  'BRING', 'BROAD', 'BROKE', 'BROWN', 'BUILD', 'BUILT', 'BUYER', 'CABLE', 'CALIF', 'CARRY',
  'CATCH', 'CAUSE', 'CHAIN', 'CHAIR', 'CHAOS', 'CHARM', 'CHART', 'CHASE', 'CHEAP', 'CHECK',
  'CHEST', 'CHIEF', 'CHILD', 'CHINA', 'CHOSE', 'CIVIL', 'CLAIM', 'CLASS', 'CLEAN', 'CLEAR',
  'CLIMB', 'CLOCK', 'CLOSE', 'CLOUD', 'COACH', 'COAST', 'COULD', 'COUNT', 'COURT', 'COVER',
  'CRAFT', 'CRASH', 'CRAZY', 'CREAM', 'CRIME', 'CROSS', 'CROWD', 'CROWN', 'CRUDE', 'CURVE',
  'CYCLE', 'DAILY', 'DANCE', 'DATED', 'DEALT', 'DEATH', 'DEBUT', 'DELAY', 'DEPTH', 'DOING',
  'DOUBT', 'DOZEN', 'DRAFT', 'DRAMA', 'DRANK', 'DRAWN', 'DREAM', 'DRESS', 'DRILL', 'DRINK',
  'DRIVE', 'DROVE', 'DYING', 'EAGER', 'EARLY', 'EARTH', 'EIGHT', 'ELDER', 'ELECT', 'ELITE',
  'EMPTY', 'ENEMY', 'ENJOY', 'ENTER', 'ENTRY', 'EQUAL', 'ERROR', 'EVENT', 'EVERY', 'EXACT',
  'EXIST', 'EXTRA', 'FAITH', 'FALSE', 'FAULT', 'FEAST', 'FIBER', 'FIELD', 'FIFTH', 'FIFTY',
  'FIGHT', 'FINAL', 'FIRST', 'FIXED', 'FLASH', 'FLEET', 'FLESH', 'FLIGHT', 'FLOOR', 'FLUID',
  'FOCUS', 'FORCE', 'FORTH', 'FORTY', 'FORUM', 'FOUND', 'FRAME', 'FRANK', 'FRAUD', 'FRESH',
  'FRONT', 'FRUIT', 'FULLY', 'FUNNY', 'GIANT', 'GIVEN', 'GLASS', 'GLOBE', 'GOING', 'GRACE',
  'GRADE', 'GRAIN', 'GRAND', 'GRANT', 'GRASS', 'GRAVE', 'GREAT', 'GREEN', 'GROSS', 'GROUP',
  'GROWN', 'GUARD', 'GUESS', 'GUEST', 'GUIDE', 'HABIT', 'HAPPY', 'HARSH', 'HEART', 'HEAVY',
  'HEDGE', 'HELPS', 'HENRY', 'HORSE', 'HOTEL', 'HOUSE', 'HUMAN', 'IDEAL', 'IMAGE', 'IMPLY',
  'INDEX', 'INNER', 'INPUT', 'ISSUE', 'JAPAN', 'JIMMY', 'JOINT', 'JONES', 'JUDGE', 'KNOWN',
  'LABEL', 'LARGE', 'LASER', 'LATER', 'LAUGH', 'LAYER', 'LEARN', 'LEASE', 'LEAST', 'LEAVE',
  'LEGAL', 'LEMON', 'LEVEL', 'LIGHT', 'LIMIT', 'LINKS', 'LIVES', 'LOCAL', 'LOGIC', 'LOOSE',
  'LOWER', 'LUCKY', 'LUNCH', 'LYING', 'MAGIC', 'MAJOR', 'MAKER', 'MARCH', 'MARIA', 'MATCH',
  'MAYBE', 'MAYOR', 'MEANT', 'MEDIA', 'METAL', 'MIGHT', 'MINOR', 'MINUS', 'MIXED', 'MODEL',
  'MONEY', 'MONTH', 'MORAL', 'MOTOR', 'MOUNT', 'MOUSE', 'MOUTH', 'MOVED', 'MUSIC', 'NEEDS',
  'NEVER', 'NEWLY', 'NIGHT', 'NOISE', 'NORTH', 'NOTED', 'NOVEL', 'NURSE', 'OCCUR', 'OCEAN',
  'OFFER', 'OFTEN', 'ORDER', 'OTHER', 'OUGHT', 'OUTER', 'OWNER', 'PAINT', 'PANEL', 'PAPER',
  'PARIS', 'PARTY', 'PEACE', 'PENNY', 'PETER', 'PHASE', 'PHONE', 'PHOTO', 'PIANO', 'PIECE',
  'PILOT', 'PITCH', 'PLACE', 'PLAIN', 'PLANE', 'PLANT', 'PLATE', 'PLAZA', 'POINT', 'POUND',
  'POWER', 'PRESS', 'PRICE', 'PRIDE', 'PRIME', 'PRINT', 'PRIOR', 'PRIZE', 'PROOF', 'PROUD',
  'PROVE', 'QUEEN', 'QUICK', 'QUIET', 'QUITE', 'RADIO', 'RAISE', 'RANGE', 'RAPID', 'RARELY',
  'REACH', 'READY', 'REALM', 'REFER', 'RELAX', 'REPLY', 'RIDER', 'RIDGE', 'RIFLE', 'RIGHT',
  'RIGID', 'RIVER', 'ROBIN', 'ROCKY', 'ROGER', 'ROMAN', 'ROUGH', 'ROUND', 'ROUTE', 'ROYAL',
  'RURAL', 'SCALE', 'SCENE', 'SCOPE', 'SCORE', 'SCREW', 'SENSE', 'SERVE', 'SEVEN', 'SHALL',
  'SHAPE', 'SHARE', 'SHARP', 'SHEER', 'SHEET', 'SHELF', 'SHELL', 'SHIFT', 'SHINE', 'SHIRT',
  'SHOCK', 'SHOOT', 'SHORE', 'SHORT', 'SHOWN', 'SIDED', 'SIGHT', 'SILLY', 'SINCE', 'SIXTH',
  'SIXTY', 'SIZED', 'SKILL', 'SLASH', 'SLEEP', 'SLIDE', 'SLING', 'SMALL', 'SMART', 'SMILE',
  'SMITH', 'SMOKE', 'SNAKE', 'SOLID', 'SOLVE', 'SORRY', 'SOUND', 'SOUTH', 'SPACE', 'SPARE',
  'SPEAK', 'SPEED', 'SPEND', 'SPENT', 'SPLIT', 'SPOKE', 'SPORT', 'SQUAD', 'STAFF', 'STAGE',
  'STAKE', 'STAND', 'START', 'STATE', 'STAYS', 'STEAM', 'STEEL', 'STEEP', 'STEER', 'STICK',
  'STILL', 'STOCK', 'STONE', 'STOOD', 'STORE', 'STORM', 'STORY', 'STRIP', 'STUCK', 'STUDY',
  'STUFF', 'STYLE', 'SUGAR', 'SUITE', 'SUNNY', 'SUPER', 'SURGE', 'SWEET', 'SWIFT', 'SWING',
  'SWORD', 'TABLE', 'TAKEN', 'TASTE', 'TAXES', 'TEACH', 'TEENS', 'TEETH', 'TEMPO', 'TENDS',
  'TENTH', 'TEXAS', 'THANK', 'THEFT', 'THEIR', 'THEME', 'THERE', 'THESE', 'THICK', 'THING',
  'THINK', 'THIRD', 'THOSE', 'THREE', 'THREW', 'THROW', 'THUMB', 'TIGHT', 'TIMER', 'TIRED',
  'TITLE', 'TODAY', 'TOMMY', 'TOPIC', 'TOTAL', 'TOUCH', 'TOUGH', 'TOWER', 'TRACK', 'TRADE',
  'TRAIN', 'TRASH', 'TREAT', 'TREND', 'TRIAL', 'TRIBE', 'TRICK', 'TRIED', 'TRIES', 'TROOP',
  'TRUCK', 'TRULY', 'TRUMP', 'TRUST', 'TRUTH', 'TWICE', 'TWINS', 'TYPED', 'UNCLE', 'UNDER',
  'UNDUE', 'UNION', 'UNITY', 'UNTIL', 'UPPER', 'UPSET', 'URBAN', 'USAGE', 'USUAL', 'VALID',
  'VALUE', 'VENUE', 'VIDEO', 'VIRUS', 'VISIT', 'VITAL', 'VOCAL', 'VOICE', 'WAGON', 'WASTE',
  'WATCH', 'WATER', 'WAVED', 'WHEEL', 'WHERE', 'WHICH', 'WHILE', 'WHITE', 'WHOLE', 'WHOSE',
  'WIDOW', 'WIDER', 'WOMAN', 'WOMEN', 'WORLD', 'WORRY', 'WORSE', 'WORST', 'WORTH', 'WOULD',
  'WOUND', 'WRITE', 'WRONG', 'WROTE', 'YIELD', 'YOUNG', 'YOURS', 'YOUTH'
];

export class Wordle extends BaseGame {
  id = 'wordle';
  name = 'Wordle';
  description = 'Guess the 5-letter word in 6 tries. After each guess, letters are marked green (correct position), yellow (wrong position), or gray (not in word).';
  category = GameCategory.WordGames;
  minPlayers = 1;
  maxPlayers = 1;
  estimatedDuration = 10;
  difficulty = GameDifficulty.Medium;

  protected createInitialState(): WordleState {
    return {
      targetWord: this.selectRandomWord(),
      guesses: [],
      results: [],
      maxGuesses: 6,
      isComplete: false,
    };
  }

  async validateMove(playerId: string, move: any): Promise<boolean> {
    // Check if game is already complete
    if (this.gameState.isComplete) {
      return false;
    }

    // Check if move is a string
    if (typeof move !== 'string') {
      return false;
    }

    const guess = move.toUpperCase().trim();

    // Check length
    if (guess.length !== 5) {
      return false;
    }

    // Check if it's a valid word (in production, use a proper dictionary)
    if (!WORD_LIST.includes(guess)) {
      return false;
    }

    // Check if already guessed
    if (this.gameState.guesses.includes(guess)) {
      return false;
    }

    return true;
  }

  async makeMove(playerId: string, move: any): Promise<MoveResult> {
    const guess = move.toUpperCase().trim();
    
    // Add guess to list
    this.gameState.guesses.push(guess);
    
    // Check each letter
    const result = this.checkGuess(guess);
    this.gameState.results.push(result);
    
    this.advanceTurn();

    // Check if won
    if (guess === this.gameState.targetWord) {
      this.gameState.isComplete = true;
      this.gameState.winner = playerId;
      return {
        success: true,
        gameEnded: true,
        winner: playerId,
        message: `🎉 Congratulations! You found the word in ${this.gameState.guesses.length} ${this.gameState.guesses.length === 1 ? 'try' : 'tries'}!`,
        points: this.calculateScore()
      };
    }

    // Check if out of guesses
    if (this.gameState.guesses.length >= this.gameState.maxGuesses) {
      this.gameState.isComplete = true;
      return {
        success: true,
        gameEnded: true,
        message: `Game over! The word was **${this.gameState.targetWord}**`
      };
    }

    return {
      success: true,
      message: `${this.gameState.maxGuesses - this.gameState.guesses.length} guesses remaining`
    };
  }

  async getValidMoves(playerId: string): Promise<any[]> {
    // In Wordle, any 5-letter word is potentially valid
    return [];
  }

  renderState(forPlayer?: string): UIMessage {
    let content = '**🔤 WORDLE**\n\n';

    // Show guesses with results
    for (let i = 0; i < this.gameState.guesses.length; i++) {
      const guess = this.gameState.guesses[i];
      const results = this.gameState.results[i];
      
      content += this.renderGuess(guess, results) + '\n';
    }

    // Show empty rows
    const remainingRows = this.gameState.maxGuesses - this.gameState.guesses.length;
    for (let i = 0; i < remainingRows; i++) {
      content += '⬜ ⬜ ⬜ ⬜ ⬜\n';
    }

    content += '\n';

    // Show keyboard with used letters
    content += this.renderKeyboard();

    // Add status message
    if (this.gameState.isComplete) {
      if (this.gameState.winner) {
        content += `\n\n✅ **You won in ${this.gameState.guesses.length} ${this.gameState.guesses.length === 1 ? 'try' : 'tries'}!**`;
      } else {
        content += `\n\n❌ **The word was: ${this.gameState.targetWord}**`;
      }
    } else {
      content += `\n\n**Guesses remaining: ${this.gameState.maxGuesses - this.gameState.guesses.length}**`;
      content += '\n**Type a 5-letter word to guess!**';
    }

    return { content };
  }

  renderHelp(): UIMessage {
    return {
      content: `**How to Play Wordle**\n\n` +
        `• Guess the 5-letter word in 6 tries\n` +
        `• After each guess, the color of the tiles will change:\n` +
        `  🟩 Green = Letter is in the word and in the correct spot\n` +
        `  🟨 Yellow = Letter is in the word but in the wrong spot\n` +
        `  ⬜ Gray = Letter is not in the word\n\n` +
        `**Commands**\n` +
        `• Type any 5-letter word to make a guess\n` +
        `• Use \`/quit\` to give up and see the answer`,
    };
  }

  renderStats(): UIMessage {
    const player = this.getPlayers()[0];
    
    return {
      content: `**Game Statistics**\n\n` +
        `**Player: ${this.getSafePlayerName(player)}**\n` +
        `**Guesses Made: ${this.gameState.guesses.length}/${this.gameState.maxGuesses}**\n` +
        `**Game Status: ${this.gameState.isComplete ? (this.gameState.winner ? 'Won' : 'Lost') : 'In Progress'}**`,
    };
  }

  protected getCurrentPlayer(): string | undefined {
    return this.getPlayers()[0];
  }

  protected getPlayerStates(): any[] {
    return [{
      playerId: this.getPlayers()[0],
      guesses: this.gameState.guesses.length,
      isActive: !this.gameState.isComplete,
    }];
  }

  protected getScores(): Record<string, number> {
    if (this.gameState.winner) {
      return {
        [this.gameState.winner]: this.calculateScore()
      };
    }
    return {};
  }

  private selectRandomWord(): string {
    return WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
  }

  private checkGuess(guess: string): ('correct' | 'present' | 'absent')[] {
    const result: ('correct' | 'present' | 'absent')[] = [];
    const targetLetters = this.gameState.targetWord.split('');
    const guessLetters = guess.split('');
    
    // First pass: mark correct letters
    for (let i = 0; i < 5; i++) {
      if (guessLetters[i] === targetLetters[i]) {
        result[i] = 'correct';
        targetLetters[i] = '*'; // Mark as used
      }
    }
    
    // Second pass: mark present letters
    for (let i = 0; i < 5; i++) {
      if (result[i] === 'correct') continue;
      
      const letterIndex = targetLetters.indexOf(guessLetters[i]);
      if (letterIndex !== -1) {
        result[i] = 'present';
        targetLetters[letterIndex] = '*'; // Mark as used
      } else {
        result[i] = 'absent';
      }
    }
    
    return result;
  }

  private renderGuess(guess: string, results: ('correct' | 'present' | 'absent')[]): string {
    let rendered = '';
    
    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i];
      const result = results[i];
      
      switch (result) {
        case 'correct':
          rendered += `🟩`;
          break;
        case 'present':
          rendered += `🟨`;
          break;
        case 'absent':
          rendered += `⬜`;
          break;
      }
    }
    
    rendered += `  ${guess}`;
    return rendered;
  }

  private renderKeyboard(): string {
    const keyboard = [
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
      ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
    ];
    
    const usedLetters = new Map<string, 'correct' | 'present' | 'absent'>();
    
    // Collect letter statuses
    for (let i = 0; i < this.gameState.guesses.length; i++) {
      const guess = this.gameState.guesses[i];
      const results = this.gameState.results[i];
      
      for (let j = 0; j < guess.length; j++) {
        const letter = guess[j];
        const result = results[j];
        
        // Update status (prioritize correct > present > absent)
        if (!usedLetters.has(letter) || 
            (result === 'correct') ||
            (result === 'present' && usedLetters.get(letter) !== 'correct')) {
          usedLetters.set(letter, result);
        }
      }
    }
    
    let keyboardDisplay = '```\n';
    for (const row of keyboard) {
      keyboardDisplay += row.map(letter => {
        const status = usedLetters.get(letter);
        if (!status) return letter;
        
        switch (status) {
          case 'correct': return `[${letter}]`;
          case 'present': return `(${letter})`;
          case 'absent': return `·${letter}·`;
        }
      }).join(' ') + '\n';
    }
    keyboardDisplay += '```';
    
    return keyboardDisplay;
  }

  private calculateScore(): number {
    // Higher score for fewer guesses
    return (7 - this.gameState.guesses.length) * 100;
  }
}