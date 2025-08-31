#!/bin/bash

# Script to set up automatic Redis cleanup cron job

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔧 Setting up automatic Redis cleanup cron job..."

# Create the cron job command
CRON_CMD="cd $PROJECT_DIR && /usr/bin/npm run cleanup:redis > $PROJECT_DIR/logs/redis-cleanup.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "cleanup:redis"; then
    echo "⚠️  Cleanup cron job already exists"
    echo "Current cron jobs:"
    crontab -l | grep "cleanup:redis"
else
    # Add cron job to run every hour
    (crontab -l 2>/dev/null; echo "0 * * * * $CRON_CMD") | crontab -
    echo "✅ Added hourly Redis cleanup cron job"
    echo "Run 'crontab -l' to view all cron jobs"
fi

echo ""
echo "📝 You can modify the schedule by running 'crontab -e'"
echo "Current schedule: Every hour at minute 0"
echo ""
echo "Common cron schedules:"
echo "  */30 * * * *  - Every 30 minutes"
echo "  0 * * * *     - Every hour"
echo "  0 */6 * * *   - Every 6 hours"
echo "  0 2 * * *     - Daily at 2 AM"