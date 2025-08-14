// Core type definitions for the gaming bot

// Platform types
export enum Platform {
  Telegram = 'telegram',
  Discord = 'discord',
}

// Platform configuration types
export interface PlatformConfig {
  telegram: {
    botToken: string;
    groupId: string;
  };
  discord: {
    botToken: string;
    guildId: string;
    clientId: string;
  };
}

// Game configuration types
export interface GameConfig {
  defaultLanguage: string;
  maxGamesPerPlayer: number;
  gameTimeoutMinutes: number;
  tournamentEnabled: boolean;
  dailyChallengesEnabled: boolean;
  achievementsEnabled: boolean;
  leaderboardEnabled: boolean;
  aiOpponentsEnabled: boolean;
}

// Database configuration types
export interface DatabaseConfig {
  path: string;
  redis: {
    host: string;
    port: number;
    password: string;
    db: number;
  };
}

// Player types
export interface Player {
  id: string;
  platform: Platform;
  platformId: string;
  username: string;
  displayName: string;
  avatar?: string;
  stats: PlayerStats;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
  winStreak: number;
  bestWinStreak: number;
  totalScore: number;
  achievements: string[];
}

// Game session types
export interface GameSession {
  id: string;
  gameType: string;
  players: Player[];
  state: GameState;
  platform: Platform;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
  endedAt?: Date;
  winner?: string;
  isDraw?: boolean;
}

export interface GameState {
  currentTurn?: string;
  turnCount: number;
  gameData: any; // Game-specific data
  timeRemaining?: number;
}

// UI types
export interface UIMessage {
  content: string;
  components?: UIComponent[];
  embed?: UIEmbed;
  ephemeral?: boolean;
}

export interface UIComponent {
  type: 'button' | 'select' | 'text';
  id: string;
  label?: string;
  style?: 'primary' | 'secondary' | 'success' | 'danger';
  options?: UISelectOption[];
  disabled?: boolean;
  emoji?: string;
  data?: any; // Additional data to include in callbacks
}

export interface UISelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
}

export interface UIEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: UIEmbedField[];
  footer?: string;
  thumbnail?: string;
  image?: string;
}

export interface UIEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

// Platform message types
export interface PlatformMessage {
  id: string;
  platform: Platform;
  channelId: string;
  userId: string;
  content: string;
  timestamp: Date;
  replyToId?: string;
  attachments?: MessageAttachment[];
}

export interface MessageAttachment {
  id: string;
  filename: string;
  url: string;
  contentType?: string;
  size?: number;
}

// Game interaction types
export interface GameInteraction {
  id: string;
  type: 'button_click' | 'select_option' | 'text_input' | 'command';
  platform: Platform;
  userId: string;
  channelId?: string;
  gameSessionId: string;
  messageId?: string;
  data: any;
  timestamp: Date;
}

// Leaderboard types
export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  score: number;
  rank: number;
  gameType: string;
  period: 'daily' | 'weekly' | 'monthly' | 'alltime';
}

// Achievement types
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  condition: AchievementCondition;
}

export interface AchievementCondition {
  type: 'games_won' | 'win_streak' | 'perfect_game' | 'speed_win' | 'participation';
  value: number;
  gameType?: string;
}

// Tournament types
export interface Tournament {
  id: string;
  name: string;
  gameType: string;
  startDate: Date;
  endDate: Date;
  maxParticipants: number;
  participants: string[];
  bracket?: TournamentBracket;
  winner?: string;
  prizes?: TournamentPrize[];
}

export interface TournamentBracket {
  rounds: TournamentRound[];
}

export interface TournamentRound {
  matches: TournamentMatch[];
}

export interface TournamentMatch {
  id: string;
  player1Id: string;
  player2Id: string;
  winnerId?: string;
  gameSessionId?: string;
}

export interface TournamentPrize {
  position: number;
  prize: string;
}