-- Migration: Add channel_mappings table for cross-platform relay
-- Created: 2025-08-14

CREATE TABLE IF NOT EXISTS channel_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_channel_id TEXT NOT NULL,
  telegram_channel_id TEXT NOT NULL,
  mapping_type TEXT NOT NULL DEFAULT 'bidirectional',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  is_active BOOLEAN DEFAULT 1,
  UNIQUE(discord_channel_id, telegram_channel_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_channel_mappings_discord ON channel_mappings(discord_channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_mappings_telegram ON channel_mappings(telegram_channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_mappings_active ON channel_mappings(is_active);

-- Add relay messages tracking table
CREATE TABLE IF NOT EXISTS relay_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_platform TEXT NOT NULL,
  source_channel_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  target_platform TEXT NOT NULL,
  target_channel_id TEXT NOT NULL,
  target_message_id TEXT NOT NULL,
  game_session_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_platform, source_message_id, target_platform)
);

-- Create indexes for relay messages
CREATE INDEX IF NOT EXISTS idx_relay_messages_source ON relay_messages(source_platform, source_channel_id);
CREATE INDEX IF NOT EXISTS idx_relay_messages_session ON relay_messages(game_session_id);