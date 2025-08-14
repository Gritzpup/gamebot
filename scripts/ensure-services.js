const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🎮 GameBot Pre-Dev Setup\n');

// Check if Redis is running
function checkRedis() {
  try {
    execSync('pgrep -x redis-server', { stdio: 'ignore' });
    console.log('✅ Redis is already running');
    return true;
  } catch {
    return false;
  }
}

// Start Redis
function startRedis() {
  console.log('⚠️  Redis is not running. Starting Redis...');
  try {
    execSync('redis-server --daemonize yes --port 6379');
    console.log('✅ Redis started on port 6379');
    return true;
  } catch (error) {
    console.error('❌ Failed to start Redis:', error.message);
    console.log('\nPlease install Redis: sudo apt install redis-server');
    return false;
  }
}

// Check if database exists
function checkDatabase() {
  const dbPath = path.join(process.cwd(), 'gamebot.db');
  return fs.existsSync(dbPath);
}

// Initialize database
async function initDatabase() {
  console.log('🗄️  Initializing database...');
  try {
    execSync('npm run db:init', { stdio: 'inherit' });
    console.log('✅ Database initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize database:', error.message);
    return false;
  }
}

// Check if .env exists
function checkEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('\n❌ .env file not found!');
    console.log('Please copy .env.example to .env and configure it');
    console.log('Run: cp .env.example .env');
    return false;
  }
  console.log('✅ .env file found');
  return true;
}

// Check logs directory
function ensureLogsDir() {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('✅ Created logs directory');
  }
}

// Main setup function
async function main() {
  let allGood = true;

  // Check environment file
  if (!checkEnv()) {
    process.exit(1);
  }

  // Ensure logs directory exists
  ensureLogsDir();

  // Check and start Redis
  if (!checkRedis()) {
    if (!startRedis()) {
      allGood = false;
    }
  }

  // Check and initialize database
  if (!checkDatabase()) {
    if (!await initDatabase()) {
      allGood = false;
    }
  } else {
    console.log('✅ Database already exists');
  }

  if (allGood) {
    console.log('\n✨ All services ready! Starting GameBot...\n');
  } else {
    console.log('\n⚠️  Some services failed to start. Please check the errors above.');
    process.exit(1);
  }
}

main();