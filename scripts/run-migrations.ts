#!/usr/bin/env tsx
import * as fs from 'fs/promises';
import * as path from 'path';
import { Database } from '../src/services/database/Database';
import { logger } from '../src/utils/logger';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  logger.info('Starting database migrations...');
  
  const db = Database.getInstance();
  await db.initialize();
  
  // Create migrations table if it doesn't exist
  await db.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Get list of migration files
  const migrationFiles = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = migrationFiles
    .filter(f => f.endsWith('.sql'))
    .sort(); // Ensure they run in order
  
  logger.info(`Found ${sqlFiles.length} migration files`);
  
  for (const file of sqlFiles) {
    // Check if migration has already been run
    const existing = await db.get(
      'SELECT * FROM migrations WHERE filename = ?',
      [file]
    );
    
    if (existing) {
      logger.info(`Skipping ${file} - already executed`);
      continue;
    }
    
    logger.info(`Running migration: ${file}`);
    
    try {
      // Read and execute migration
      const sql = await fs.readFile(
        path.join(MIGRATIONS_DIR, file),
        'utf-8'
      );
      
      // Split by semicolon to handle multiple statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      for (const statement of statements) {
        await db.run(statement);
      }
      
      // Record migration as completed
      await db.run(
        'INSERT INTO migrations (filename) VALUES (?)',
        [file]
      );
      
      logger.info(`✅ Migration ${file} completed successfully`);
      
    } catch (error) {
      logger.error(`❌ Migration ${file} failed:`, error);
      throw error;
    }
  }
  
  logger.info('All migrations completed successfully');
}

// Run migrations
runMigrations()
  .then(() => {
    logger.info('Migration script completed');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Migration script failed:', error);
    process.exit(1);
  });