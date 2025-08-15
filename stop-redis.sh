#!/bin/bash

# Stop Redis on custom port 23847
echo "Stopping Redis on port 23847..."
redis-cli -p 23847 shutdown

if [ $? -eq 0 ]; then
    echo "Redis stopped successfully"
else
    echo "Failed to stop Redis or Redis was not running"
fi