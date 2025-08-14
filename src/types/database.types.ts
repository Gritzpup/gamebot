// Database schema types

export interface DBPlayer {
  id: string;
  platform: string;
  platform_id: string;
  username: string;
  display_name: string;
  avatar?: string;
  created_at: string;
  last_active_at: string;
}

export interface DBPlayerStats {
  player_id: string;
  games_played: number;
  games_won: number;
  games_lost: number;
  games_draw: number;
  win_streak: number;
  best_win_streak: number;
  total_score: number;
  updated_at: string;
}

export interface DBGameSession {
  id: string;
  game_type: string;
  platform: string;
  channel_id: string;
  state: string; // JSON string
  created_at: string;
  updated_at: string;
  ended_at?: string;
  winner_id?: string;
  is_draw: number; // 0 or 1
}

export interface DBGamePlayer {
  game_session_id: string;
  player_id: string;
  position: number;
  score: number;
  is_active: number; // 0 or 1
  is_ai: number; // 0 or 1
  joined_at: string;
  left_at?: string;
}

export interface DBGameMove {
  id: number;
  game_session_id: string;
  player_id: string;
  move_number: number;
  move_data: string; // JSON string
  timestamp: string;
}

export interface DBLeaderboard {
  id: number;
  game_type: string;
  player_id: string;
  score: number;
  period: string; // 'daily', 'weekly', 'monthly', 'alltime'
  date: string;
  created_at: string;
}

export interface DBAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  condition_type: string;
  condition_value: number;
  game_type?: string;
  created_at: string;
}

export interface DBPlayerAchievement {
  player_id: string;
  achievement_id: string;
  unlocked_at: string;
}

export interface DBTournament {
  id: string;
  name: string;
  game_type: string;
  max_participants: number;
  start_date: string;
  end_date: string;
  bracket_data?: string; // JSON string
  winner_id?: string;
  created_at: string;
  updated_at: string;
}

export interface DBTournamentParticipant {
  tournament_id: string;
  player_id: string;
  seed: number;
  eliminated_round?: number;
  final_position?: number;
  joined_at: string;
}

export interface DBDailyChallenge {
  id: string;
  date: string;
  game_type: string;
  challenge_type: string;
  challenge_data: string; // JSON string
  created_at: string;
}

export interface DBDailyChallengeScore {
  challenge_id: string;
  player_id: string;
  score: number;
  attempts: number;
  completed_at: string;
}

export interface DBGameConfig {
  key: string;
  value: string;
  updated_at: string;
}

export interface DBPlatformMessage {
  id: number;
  platform: string;
  channel_id: string;
  message_id: string;
  game_session_id: string;
  type: string; // 'game_state', 'game_invite', 'game_result'
  created_at: string;
}

// Cache types for Redis
export interface CacheGameState {
  sessionId: string;
  gameType: string;
  state: any;
  players: string[];
  currentTurn?: string;
  lastActivity: number;
  ttl?: number;
}

export interface CachePlayerSession {
  playerId: string;
  platform: string;
  activeGames: string[];
  lastSeen: number;
  preferences?: any;
}

export interface CacheLeaderboard {
  gameType: string;
  period: string;
  entries: Array<{
    playerId: string;
    playerName: string;
    score: number;
    rank: number;
  }>;
  lastUpdated: number;
}