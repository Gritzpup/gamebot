import sqlite3 from 'sqlite3';
import { open, Database as SqliteDatabase } from 'sqlite';
import path from 'path';
import { databaseConfig } from '../../config';
import { logger } from '../../utils/logger';
import { Player } from '../../types';
import { 
  DBPlayer, 
  DBPlayerStats, 
  DBGameSession,
  DBGamePlayer 
} from '../../types/database.types';

export class Database {
  private static instance: Database;
  private db?: SqliteDatabase<sqlite3.Database, sqlite3.Statement>;

  private constructor() {}

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  async initialize(): Promise<void> {
    const dbPath = path.resolve(databaseConfig.path);
    
    try {
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
      });
      
      logger.info(`Database connected at: ${dbPath}`);
      
      // Run migrations
      await this.runMigrations();
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      logger.info('Database connection closed');
    }
  }

  private async runMigrations(): Promise<void> {
    // TODO: Implement proper migration system
    // For now, create tables if they don't exist
    
    // Players table
    await this.db!.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        platform_id TEXT NOT NULL,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar TEXT,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        UNIQUE(platform, platform_id)
      );
    `);
    
    // Player stats table
    await this.db!.exec(`
      CREATE TABLE IF NOT EXISTS player_stats (
        player_id TEXT PRIMARY KEY,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        games_lost INTEGER DEFAULT 0,
        games_draw INTEGER DEFAULT 0,
        win_streak INTEGER DEFAULT 0,
        best_win_streak INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (player_id) REFERENCES players(id)
      );
    `);
    
    // Game sessions table
    await this.db!.exec(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        game_type TEXT NOT NULL,
        platform TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        ended_at TEXT,
        winner_id TEXT,
        is_draw INTEGER DEFAULT 0,
        FOREIGN KEY (winner_id) REFERENCES players(id)
      );
    `);
    
    // Game players table
    await this.db!.exec(`
      CREATE TABLE IF NOT EXISTS game_players (
        game_session_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        score INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        is_ai INTEGER DEFAULT 0,
        joined_at TEXT NOT NULL,
        left_at TEXT,
        PRIMARY KEY (game_session_id, player_id),
        FOREIGN KEY (game_session_id) REFERENCES game_sessions(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      );
    `);
    
    logger.info('Database migrations completed');
  }

  // Player methods
  async createPlayer(player: Player): Promise<void> {
    const dbPlayer: DBPlayer = {
      id: player.id,
      platform: player.platform,
      platform_id: player.platformId,
      username: player.username,
      display_name: player.displayName,
      avatar: player.avatar,
      created_at: player.createdAt.toISOString(),
      last_active_at: player.lastActiveAt.toISOString(),
    };
    
    await this.db!.run(
      `INSERT INTO players (id, platform, platform_id, username, display_name, avatar, created_at, last_active_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dbPlayer.id,
        dbPlayer.platform,
        dbPlayer.platform_id,
        dbPlayer.username,
        dbPlayer.display_name,
        dbPlayer.avatar,
        dbPlayer.created_at,
        dbPlayer.last_active_at,
      ]
    );
    
    // Initialize stats
    await this.db!.run(
      `INSERT INTO player_stats (player_id, updated_at) VALUES (?, ?)`,
      [player.id, new Date().toISOString()]
    );
  }

  async getPlayer(playerId: string): Promise<Player | null> {
    const dbPlayer = await this.db!.get<DBPlayer>(
      'SELECT * FROM players WHERE id = ?',
      playerId
    );
    
    if (!dbPlayer) {
      return null;
    }
    
    const stats = await this.db!.get<DBPlayerStats>(
      'SELECT * FROM player_stats WHERE player_id = ?',
      playerId
    );
    
    return {
      id: dbPlayer.id,
      platform: dbPlayer.platform as any,
      platformId: dbPlayer.platform_id,
      username: dbPlayer.username,
      displayName: dbPlayer.display_name,
      avatar: dbPlayer.avatar || undefined,
      stats: {
        gamesPlayed: stats?.games_played || 0,
        gamesWon: stats?.games_won || 0,
        gamesLost: stats?.games_lost || 0,
        gamesDraw: stats?.games_draw || 0,
        winStreak: stats?.win_streak || 0,
        bestWinStreak: stats?.best_win_streak || 0,
        totalScore: stats?.total_score || 0,
        achievements: [], // TODO: Load from achievements table
      },
      createdAt: new Date(dbPlayer.created_at),
      lastActiveAt: new Date(dbPlayer.last_active_at),
    };
  }

  async updatePlayerActivity(playerId: string): Promise<void> {
    await this.db!.run(
      'UPDATE players SET last_active_at = ? WHERE id = ?',
      [new Date().toISOString(), playerId]
    );
  }

  // Game session methods
  async saveGameSession(session: DBGameSession): Promise<void> {
    await this.db!.run(
      `INSERT OR REPLACE INTO game_sessions 
       (id, game_type, platform, channel_id, state, created_at, updated_at, ended_at, winner_id, is_draw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.game_type,
        session.platform,
        session.channel_id,
        session.state,
        session.created_at,
        session.updated_at,
        session.ended_at,
        session.winner_id,
        session.is_draw,
      ]
    );
  }

  async getActiveSessions(): Promise<DBGameSession[]> {
    return this.db!.all<DBGameSession[]>(
      'SELECT * FROM game_sessions WHERE ended_at IS NULL'
    );
  }

  async endGameSession(sessionId: string): Promise<void> {
    await this.db!.run(
      'UPDATE game_sessions SET ended_at = ?, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), new Date().toISOString(), sessionId]
    );
  }

  async getGamePlayers(sessionId: string): Promise<DBGamePlayer[]> {
    return this.db!.all<DBGamePlayer[]>(
      'SELECT * FROM game_players WHERE game_session_id = ? AND is_active = 1',
      sessionId
    );
  }

  async addGamePlayer(sessionId: string, playerId: string): Promise<void> {
    // Check if player already exists in this session
    const existing = await this.db!.get<DBGamePlayer>(
      'SELECT * FROM game_players WHERE game_session_id = ? AND player_id = ?',
      [sessionId, playerId]
    );
    
    if (existing) {
      // Reactivate if inactive
      if (!existing.is_active) {
        await this.db!.run(
          'UPDATE game_players SET is_active = 1, left_at = NULL WHERE game_session_id = ? AND player_id = ?',
          [sessionId, playerId]
        );
      }
      return;
    }
    
    // Get the next position
    const result = await this.db!.get<{ max_position: number | null }>(
      'SELECT MAX(position) as max_position FROM game_players WHERE game_session_id = ?',
      sessionId
    );
    const nextPosition = (result?.max_position ?? -1) + 1;
    
    // Determine if this is an AI/bot player
    const isAi = playerId.startsWith('bot_') ? 1 : 0;
    
    // Insert new game player
    await this.db!.run(
      `INSERT INTO game_players (game_session_id, player_id, position, score, is_active, is_ai, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, playerId, nextPosition, 0, 1, isAi, new Date().toISOString()]
    );
  }
}