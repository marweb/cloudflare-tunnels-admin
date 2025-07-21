#!/bin/bash

# Fix cloudflared ping_group_range issue
# This script ensures that the user running cloudflared (GID 1000) can use ICMP

echo "🔧 Fixing ping_group_range for cloudflared..."

# Check current ping_group_range
current_range=$(cat /proc/sys/net/ipv4/ping_group_range 2>/dev/null || echo "1 0")
echo "📋 Current ping_group_range: $current_range"

# Check if GID 1000 is already in range
if echo "$current_range" | grep -q "^0 "; then
    # Range starts from 0, check if it includes 1000
    max_gid=$(echo "$current_range" | awk '{print $2}')
    if [ "$max_gid" -ge 1000 ]; then
        echo "✅ GID 1000 is already within ping_group_range ($current_range)"
        exit 0
    fi
fi

# Update ping_group_range to include GID 1000
echo "🔧 Updating ping_group_range to include GID 1000..."

# Try to update the range
if echo '0 2000' > /proc/sys/net/ipv4/ping_group_range 2>/dev/null; then
    echo "✅ Successfully updated ping_group_range to: 0 2000"
    echo "📋 New range: $(cat /proc/sys/net/ipv4/ping_group_range)"
else
    echo "❌ Failed to update ping_group_range (may require root privileges)"
    echo "💡 You may need to run this as root or add it to your system startup"
    exit 1
fi

echo "🎉 ping_group_range fix completed!"
