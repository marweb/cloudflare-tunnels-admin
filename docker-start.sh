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
sudo chmod 755 /etc/systemd/system
sudo chmod 755 /var/log/cloudflared

# Check if systemd is available
if ! command -v systemctl &> /dev/null; then
    echo "⚠️  Warning: systemctl not found. Some features may not work properly."
fi

# Start the Node.js application
echo "✅ Starting Node.js application on port ${PORT:-3000}..."
exec npm start
