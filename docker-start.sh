#!/bin/bash

# Docker startup script for Cloudflare Tunnel Admin
# This script handles initialization and starts the application

set -e

echo "🚀 Starting Cloudflare Tunnel Admin Panel..."

# Ensure proper permissions
sudo chown -R appuser:appuser /app
sudo chmod +x /app/docker-start.sh

# Create necessary directories if they don't exist
sudo mkdir -p /etc/cloudflared
sudo mkdir -p /etc/systemd/system
sudo mkdir -p /var/log/cloudflared

# Set proper permissions
sudo chmod 755 /etc/cloudflared

# Fix ping_group_range for cloudflared ICMP proxy
echo "🔧 Fixing ping_group_range for cloudflared ICMP proxy..."
current_range=$(cat /proc/sys/net/ipv4/ping_group_range 2>/dev/null || echo "1 0")
echo "📋 Current ping_group_range: $current_range"

# Check if GID 1000 is already in range
if ! echo "$current_range" | grep -q "^0 " || [ "$(echo "$current_range" | awk '{print $2}')" -lt 1000 ]; then
    echo "🔧 Updating ping_group_range to include GID 1000..."
    if echo '0 2000' > /proc/sys/net/ipv4/ping_group_range 2>/dev/null; then
        echo "✅ Successfully updated ping_group_range to: 0 2000"
    else
        echo "⚠️  Could not update ping_group_range (may need privileged container)"
        echo "💡 ICMP proxy will be disabled but tunnels will still work"
    fi
else
    echo "✅ GID 1000 is already within ping_group_range"
fi
sudo chmod 755 /etc/systemd/system
sudo chmod 755 /var/log/cloudflared

# Check if systemd is available
if ! command -v systemctl &> /dev/null; then
    echo "⚠️  Warning: systemctl not found. Some features may not work properly."
fi

# Auto-start tunnels that should be running
echo "🔄 Checking for tunnels to auto-start..."
if [ -d "/etc/cloudflared" ]; then
    # Find all tunnel config files
    for config_file in /etc/cloudflared/*.yml; do
        if [ -f "$config_file" ]; then
            tunnel_name=$(basename "$config_file" .yml)
            service_file="/etc/systemd/system/cloudflared-${tunnel_name}.service"
            
            # Check if service file exists (indicates tunnel should be enabled)
            if [ -f "$service_file" ]; then
                echo "🚀 Auto-starting tunnel: $tunnel_name"
                
                # Extract tunnel UUID from config file
                tunnel_uuid=$(grep "^tunnel:" "$config_file" | awk '{print $2}')
                credentials_file=$(grep "^credentials-file:" "$config_file" | awk '{print $2}')
                
                if [ -n "$tunnel_uuid" ] && [ -f "$credentials_file" ]; then
                    # Start tunnel as true daemon process
                    setsid cloudflared tunnel --config "$config_file" run "$tunnel_uuid" > "/var/log/cloudflared-${tunnel_name}.log" 2>&1 < /dev/null &
                    tunnel_pid=$!
                    disown $tunnel_pid  # Completely detach from shell
                    echo "✅ Started tunnel $tunnel_name with UUID $tunnel_uuid (PID: $tunnel_pid)"
                else
                    echo "⚠️  Skipping tunnel $tunnel_name - missing UUID or credentials file"
                fi
            else
                echo "ℹ️  Tunnel $tunnel_name not enabled for auto-start"
            fi
        fi
    done
else
    echo "ℹ️  No tunnels directory found, skipping auto-start"
fi

# Wait a moment for tunnels to initialize
if [ -d "/etc/cloudflared" ] && [ "$(ls -A /etc/cloudflared/*.yml 2>/dev/null)" ]; then
    echo "⏳ Waiting 3 seconds for tunnels to initialize..."
    sleep 3
    
    # Show status of started tunnels
    echo "📊 Tunnel status:"
    ps aux | grep cloudflared | grep -v grep || echo "No tunnels currently running"
fi

# Start the Node.js application
echo "✅ Starting Node.js application on port ${PORT:-3033}..."
exec npm start
