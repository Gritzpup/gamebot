#!/bin/bash

echo "🎮 Starting GameBot..."
echo ""

# Check if Redis is running
if ! pgrep -x "redis-server" > /dev/null
then
    echo "⚠️  Redis is not running. Starting Redis..."
    redis-server --daemonize yes
    sleep 2
    echo "✅ Redis started"
else
    echo "✅ Redis is already running"
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "Please copy .env.example to .env and configure it"
    exit 1
fi

# Check if database exists
if [ ! -f "gamebot.db" ]; then
    echo "🗄️  Initializing database..."
    npm run db:init
fi

echo ""
echo "🚀 Starting bot in development mode..."
echo "Press Ctrl+C to stop"
echo ""

npm run dev