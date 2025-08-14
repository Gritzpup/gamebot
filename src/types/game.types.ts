import { Player, GameSession, UIMessage } from './index';

// Base game interface
export interface IGame {
  // Game metadata
  id: string;
  name: string;
  description: string;
  category: GameCategory;
  minPlayers: number;
  maxPlayers: number;
  estimatedDuration: number; // in minutes
  difficulty: GameDifficulty;
  
  // Game lifecycle
  initialize(session: GameSession): Promise<void>;
  start(): Promise<void>;
  end(reason: GameEndReason): Promise<void>;
  
  // Game logic
  validateMove(playerId: string, move: any): Promise<boolean>;
  makeMove(playerId: string, move: any): Promise<MoveResult>;
  getCurrentState(): GameStateSnapshot;
  getValidMoves(playerId: string): Promise<any[]>;
  
  // UI rendering
  renderState(forPlayer?: string): UIMessage;
  renderHelp(): UIMessage;
  renderStats(): UIMessage;
  
  // AI support
  supportsAI(): boolean;
  makeAIMove(difficulty: AIDifficulty): Promise<MoveResult>;
  
  // Serialization
  serialize(): string;
  deserialize(data: string): void;
}

// Game categories
export enum GameCategory {
  WordGames = 'word_games',
  BoardGames = 'board_games',
  CardGames = 'card_games',
  TriviaGames = 'trivia_games',
  PuzzleGames = 'puzzle_games',
  ActionGames = 'action_games',
  RPGGames = 'rpg_games',
  EconomyGames = 'economy_games',
  CasinoGames = 'casino_games',
  CreativeGames = 'creative_games',
  EducationalGames = 'educational_games',
  IdleGames = 'idle_games',
}

// Game difficulty levels
export enum GameDifficulty {
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard',
  Expert = 'expert',
}

// AI difficulty levels
export enum AIDifficulty {
  Beginner = 'beginner',
  Intermediate = 'intermediate',
  Advanced = 'advanced',
  Master = 'master',
}

// Game end reasons
export enum GameEndReason {
  NormalEnd = 'normal_end',
  Timeout = 'timeout',
  PlayerQuit = 'player_quit',
  AdminStop = 'admin_stop',
  Error = 'error',
}

// Move result
export interface MoveResult {
  success: boolean;
  message?: string;
  gameEnded?: boolean;
  winner?: string;
  isDraw?: boolean;
  nextPlayer?: string;
  stateChange?: any;
  stateChanged?: boolean;
  points?: number;
  shouldMakeBotMove?: boolean;
}

// Game state snapshot
export interface GameStateSnapshot {
  gameId: string;
  turnNumber: number;
  currentPlayer?: string;
  players: PlayerGameState[];
  board?: any; // Game-specific board state
  deck?: any; // For card games
  scores?: Record<string, number>;
  timeRemaining?: number;
  lastMove?: any;
  gameSpecificData?: any;
}

// Player game state
export interface PlayerGameState {
  playerId: string;
  isActive: boolean;
  isAI: boolean;
  score: number;
  hand?: any[]; // For card games
  resources?: Record<string, number>; // For economy games
  position?: any; // For board games
  customData?: any;
}

// Game configuration
export interface GameConfiguration {
  timeLimit?: number; // in seconds
  allowSpectators?: boolean;
  autoStart?: boolean;
  customRules?: Record<string, any>;
}

// Game events
export interface GameEvent {
  type: GameEventType;
  timestamp: Date;
  playerId?: string;
  data: any;
}

export enum GameEventType {
  GameStarted = 'game_started',
  MoveMade = 'move_made',
  TurnChanged = 'turn_changed',
  PlayerJoined = 'player_joined',
  PlayerLeft = 'player_left',
  GamePaused = 'game_paused',
  GameResumed = 'game_resumed',
  GameEnded = 'game_ended',
  ChatMessage = 'chat_message',
  PowerUpUsed = 'powerup_used',
  AchievementUnlocked = 'achievement_unlocked',
}

// Game statistics
export interface GameStatistics {
  gameType: string;
  totalGames: number;
  averageDuration: number;
  averageMoves: number;
  mostPopularTimes: string[];
  winRateByPosition?: Record<string, number>;
  commonOpenings?: any[]; // For games like chess
  popularStrategies?: string[];
}

// Daily challenge
export interface DailyChallenge {
  id: string;
  date: Date;
  gameType: string;
  challenge: {
    type: 'score_target' | 'time_limit' | 'move_limit' | 'special_rules';
    target?: number;
    rules?: any;
  };
  leaderboard: DailyChallengeEntry[];
}

export interface DailyChallengeEntry {
  playerId: string;
  playerName: string;
  score: number;
  completedAt: Date;
  attempts: number;
}

// Game registry entry
export interface GameRegistryEntry {
  id: string;
  name: string;
  constructor: new () => IGame;
  aliases: string[];
  enabled: boolean;
  betaOnly?: boolean;
}