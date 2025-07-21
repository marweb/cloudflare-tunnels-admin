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
# Give write permissions to appuser (UID 1000) for tunnel state management
sudo chown -R appuser:appuser /etc/cloudflared
sudo chmod 775 /etc/cloudflared

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

# Initialize and start robust tunnel auto-start system
echo "🔄 Initializing robust tunnel auto-start system..."

# Create a Node.js script to handle tunnel auto-start
cat > /tmp/tunnel-autostart.js << 'EOF'
const TunnelAutoStart = require('/app/utils/tunnelAutoStart');

async function main() {
    const autoStart = new TunnelAutoStart();
    
    try {
        console.log('🔧 Initializing tunnel auto-start system...');
        await autoStart.initialize();
        
        console.log('🚀 Starting all enabled tunnels...');
        const result = await autoStart.startAllEnabledTunnels();
        
        console.log(`✅ Auto-start completed: ${result.started} started, ${result.failed} failed`);
        
        // Start health monitoring
        console.log('💓 Starting tunnel health monitoring...');
        autoStart.startHealthMonitoring(30000); // Check every 30 seconds
        
        // Show tunnel statuses
        console.log('📊 Current tunnel statuses:');
        const statuses = await autoStart.getTunnelStatuses();
        statuses.forEach(status => {
            const statusIcon = status.running ? '✅' : (status.enabled ? '⚠️' : 'ℹ️');
            const runningText = status.running ? `(PID: ${status.pid})` : 'stopped';
            console.log(`${statusIcon} ${status.name}: ${status.enabled ? 'enabled' : 'disabled'}, ${runningText}`);
        });
        
        // Keep the process alive for health monitoring
        process.on('SIGTERM', () => {
            console.log('🛑 Stopping tunnel health monitoring...');
            autoStart.stopHealthMonitoring();
            process.exit(0);
        });
        
        // Don't exit - keep monitoring
        console.log('🔄 Tunnel auto-start system is now running in background...');
        
    } catch (error) {
        console.error('❌ Failed to initialize tunnel auto-start:', error);
        process.exit(1);
    }
}

main();
EOF

# Run the tunnel auto-start system in background
echo "🚀 Starting tunnel auto-start system..."
node /tmp/tunnel-autostart.js &
TUNNEL_AUTOSTART_PID=$!
echo "✅ Tunnel auto-start system running (PID: $TUNNEL_AUTOSTART_PID)"

# Wait a moment for tunnels to initialize
echo "⏳ Waiting 5 seconds for tunnels to initialize..."
sleep 5

# Start the Node.js application
echo "✅ Starting Node.js application on port ${PORT:-3033}..."
exec npm start
