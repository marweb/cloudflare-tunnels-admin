const TunnelStateManager = require('./tunnelStateManager');
const SystemdManager = require('./systemd');
const { spawn, exec } = require('child_process');
const fs = require('fs-extra');
const TunnelController = require('../controllers/tunnelController');

/**
 * TunnelAutoStart - Robust auto-start system for cloudflared tunnels
 * Ensures tunnels are automatically restarted after container/host restarts
 */
class TunnelAutoStart {
  constructor() {
    this.stateManager = new TunnelStateManager();
    this.systemdManager = new SystemdManager();
    this.runningProcesses = new Map();
    this.healthCheckInterval = null;
    this.tunnelController = new TunnelController();
  }

  /**
   * Initialize the auto-start system
   */
  async initialize() {
    console.log('🔄 Initializing tunnel auto-start system...');
    await this.stateManager.initialize();
    
    // Cleanup any orphaned states
    await this.stateManager.cleanupOrphanedStates();
    
    console.log('✅ Tunnel auto-start system initialized');
  }

  /**
   * Start all enabled tunnels
   */
  async startAllEnabledTunnels() {
    console.log('🚀 Starting all enabled tunnels...');
    
    try {
      const enabledTunnels = await this.stateManager.getEnabledTunnels();
      console.log(`📋 Found ${enabledTunnels.length} enabled tunnels`);
      
      if (enabledTunnels.length === 0) {
        console.log('ℹ️  No tunnels enabled for auto-start');
        return { started: 0, failed: 0 };
      }

      let started = 0;
      let failed = 0;

      for (const tunnel of enabledTunnels) {
        try {
          console.log(`🚀 Starting tunnel: ${tunnel.name}`);
          const result = await this.startTunnel(tunnel.name, tunnel.configFile);
          
          if (result.success) {
            started++;
            console.log(`✅ Successfully started tunnel: ${tunnel.name}`);
          } else {
            failed++;
            console.error(`❌ Failed to start tunnel: ${tunnel.name} - ${result.error}`);
          }
        } catch (error) {
          failed++;
          console.error(`❌ Error starting tunnel ${tunnel.name}:`, error);
        }
        
        // Small delay between starts to avoid overwhelming the system
        await this.delay(1000);
      }

      console.log(`🎉 Auto-start completed: ${started} started, ${failed} failed`);
      return { started, failed };
      
    } catch (error) {
      console.error('❌ Failed to start enabled tunnels:', error);
      return { started: 0, failed: 0 };
    }
  }

  /**
   * Start a specific tunnel
   */
  async startTunnel(tunnelName, configFile) {
    try {
      // Check if tunnel is already running
      const isRunning = await this.isTunnelRunning(tunnelName);
      if (isRunning) {
        console.log(`ℹ️  Tunnel ${tunnelName} is already running`);
        return { success: true, message: 'Already running' };
      }

      // Verify config file exists
      if (!await fs.pathExists(configFile)) {
        throw new Error(`Config file not found: ${configFile}`);
      }

      console.log(`🚀 Starting tunnel ${tunnelName} using unified controller logic`);
      
      // Use the controller's method to start the tunnel via systemd
      // This ensures consistent behavior between web UI and auto-start
      const result = await this.tunnelController.startTunnelInternal(tunnelName);
      
      if (result.success) {
        console.log(`✅ Tunnel ${tunnelName} started successfully via controller`);
      } else {
        console.error(`❌ Controller failed to start tunnel ${tunnelName}: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      console.error(`❌ Failed to start tunnel ${tunnelName}:`, error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Stop a specific tunnel
   */
  async stopTunnel(tunnelName) {
    try {
      console.log(`🛑 Stopping tunnel: ${tunnelName}`);

      // Check if we have the process reference
      const processInfo = this.runningProcesses.get(tunnelName);
      if (processInfo) {
        try {
          process.kill(processInfo.pid, 'SIGTERM');
          this.runningProcesses.delete(tunnelName);
          console.log(`✅ Sent SIGTERM to tunnel ${tunnelName} (PID: ${processInfo.pid})`);
        } catch (killError) {
          console.warn(`⚠️  Could not kill process ${processInfo.pid}:`, killError);
        }
      }

      // Also try to find and kill any running cloudflared processes for this tunnel
      return new Promise((resolve) => {
        exec(`pkill -f "cloudflared.*${tunnelName}"`, (error, stdout, stderr) => {
          if (error && error.code !== 1) { // code 1 means no processes found, which is OK
            console.warn(`⚠️  Error killing tunnel processes:`, error);
          } else {
            console.log(`✅ Tunnel ${tunnelName} stopped`);
          }
          resolve({ success: true });
        });
      });

    } catch (error) {
      console.error(`❌ Failed to stop tunnel ${tunnelName}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if a tunnel is currently running
   */
  async isTunnelRunning(tunnelName) {
    return new Promise((resolve) => {
      exec(`pgrep -f "cloudflared.*${tunnelName}"`, (error, stdout) => {
        resolve(!error && stdout.trim().length > 0);
      });
    });
  }

  /**
   * Restart a tunnel if it's enabled
   */
  async restartTunnelIfEnabled(tunnelName) {
    try {
      const isEnabled = await this.stateManager.isTunnelEnabled(tunnelName);
      if (isEnabled) {
        console.log(`🔄 Auto-restarting tunnel: ${tunnelName}`);
        // Use the same unified logic for restarts
        await this.tunnelController.startTunnelInternal(tunnelName);
        console.log(`✅ Tunnel ${tunnelName} restarted successfully via controller`);
      }
    } catch (error) {
      console.error(`❌ Failed to restart tunnel ${tunnelName}:`, error);
    }
  }

  /**
   * Get status of all tunnels
   */
  async getTunnelStatuses() {
    try {
      const allStates = await this.stateManager.getAllTunnelStates();
      const statuses = [];

      for (const [tunnelName, state] of Object.entries(allStates)) {
        const isRunning = await this.isTunnelRunning(tunnelName);
        const processInfo = this.runningProcesses.get(tunnelName);
        
        statuses.push({
          name: tunnelName,
          enabled: state.enabled,
          running: isRunning,
          pid: processInfo?.pid || null,
          startTime: processInfo?.startTime || null,
          logFile: processInfo?.logFile || `/var/log/cloudflared-${tunnelName}.log`
        });
      }

      return statuses;
    } catch (error) {
      console.error('❌ Failed to get tunnel statuses:', error);
      return [];
    }
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring(intervalMs = 30000) {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    console.log(`💓 Starting tunnel health monitoring (interval: ${intervalMs}ms)`);
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const enabledTunnels = await this.stateManager.getEnabledTunnels();
        
        for (const tunnel of enabledTunnels) {
          const isRunning = await this.isTunnelRunning(tunnel.name);
          if (!isRunning) {
            console.log(`💔 Tunnel ${tunnel.name} is not running but should be - restarting...`);
            await this.restartTunnelIfEnabled(tunnel.name);
          }
        }
      } catch (error) {
        console.error('❌ Health check error:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('💓 Stopped tunnel health monitoring');
    }
  }

  /**
   * Utility function for delays
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TunnelAutoStart;
