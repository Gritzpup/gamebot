#!/bin/bash

# Start Redis on custom port 23847 for gamebot
echo "Starting Redis on port 23847..."
redis-server --port 23847 --daemonize yes

# Check if Redis started successfully
sleep 1
if redis-cli -p 23847 ping > /dev/null 2>&1; then
    echo "Redis started successfully on port 23847"
else
    echo "Failed to start Redis. Please check if Redis is installed."
    exit 1
fi