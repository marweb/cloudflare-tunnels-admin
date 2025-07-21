const fs = require('fs-extra');
const path = require('path');

/**
 * TunnelStateManager - Manages persistent state of tunnels for auto-restart
 * This ensures tunnels are automatically restarted after container/host restarts
 */
class TunnelStateManager {
  constructor() {
    this.stateFile = '/etc/cloudflared/tunnel-state.json';
    this.configDir = '/etc/cloudflared';
  }

  /**
   * Initialize state manager and ensure directories exist
   */
  async initialize() {
    try {
      await fs.ensureDir(this.configDir);
      
      // Create state file if it doesn't exist
      if (!await fs.pathExists(this.stateFile)) {
        await this.saveState({});
        console.log('📋 Initialized tunnel state file');
      }
    } catch (error) {
      console.error('❌ Failed to initialize tunnel state manager:', error);
    }
  }

  /**
   * Load current tunnel state
   */
  async loadState() {
    try {
      if (await fs.pathExists(this.stateFile)) {
        const state = await fs.readJson(this.stateFile);
        return state || {};
      }
    } catch (error) {
      console.error('❌ Failed to load tunnel state:', error);
    }
    return {};
  }

  /**
   * Save tunnel state to persistent storage
   */
  async saveState(state) {
    try {
      await fs.writeJson(this.stateFile, state, { spaces: 2 });
      console.log('💾 Tunnel state saved');
    } catch (error) {
      console.error('❌ Failed to save tunnel state:', error);
    }
  }

  /**
   * Mark a tunnel as enabled (should auto-start)
   */
  async enableTunnel(tunnelName, config = {}) {
    try {
      const state = await this.loadState();
      state[tunnelName] = {
        enabled: true,
        lastEnabled: new Date().toISOString(),
        config: config,
        autoRestart: true
      };
      await this.saveState(state);
      console.log(`✅ Tunnel ${tunnelName} marked as enabled for auto-start`);
    } catch (error) {
      console.error(`❌ Failed to enable tunnel ${tunnelName}:`, error);
    }
  }

  /**
   * Mark a tunnel as disabled (should not auto-start)
   */
  async disableTunnel(tunnelName) {
    try {
      const state = await this.loadState();
      if (state[tunnelName]) {
        state[tunnelName].enabled = false;
        state[tunnelName].lastDisabled = new Date().toISOString();
        await this.saveState(state);
        console.log(`⏸️ Tunnel ${tunnelName} marked as disabled`);
      }
    } catch (error) {
      console.error(`❌ Failed to disable tunnel ${tunnelName}:`, error);
    }
  }

  /**
   * Remove a tunnel from state (when deleted)
   */
  async removeTunnel(tunnelName) {
    try {
      const state = await this.loadState();
      if (state[tunnelName]) {
        delete state[tunnelName];
        await this.saveState(state);
        console.log(`🗑️ Tunnel ${tunnelName} removed from state`);
      }
    } catch (error) {
      console.error(`❌ Failed to remove tunnel ${tunnelName}:`, error);
    }
  }

  /**
   * Get list of tunnels that should be auto-started
   */
  async getEnabledTunnels() {
    try {
      const state = await this.loadState();
      const enabled = [];
      
      for (const [tunnelName, tunnelState] of Object.entries(state)) {
        if (tunnelState.enabled) {
          // Verify config file still exists
          const configFile = path.join(this.configDir, `${tunnelName}.yml`);
          if (await fs.pathExists(configFile)) {
            enabled.push({
              name: tunnelName,
              state: tunnelState,
              configFile: configFile
            });
          } else {
            console.warn(`⚠️ Config file missing for enabled tunnel: ${tunnelName}`);
          }
        }
      }
      
      return enabled;
    } catch (error) {
      console.error('❌ Failed to get enabled tunnels:', error);
      return [];
    }
  }

  /**
   * Check if a tunnel is enabled for auto-start
   */
  async isTunnelEnabled(tunnelName) {
    try {
      const state = await this.loadState();
      return state[tunnelName]?.enabled === true;
    } catch (error) {
      console.error(`❌ Failed to check if tunnel ${tunnelName} is enabled:`, error);
      return false;
    }
  }

  /**
   * Update tunnel configuration in state
   */
  async updateTunnelConfig(tunnelName, config) {
    try {
      const state = await this.loadState();
      if (state[tunnelName]) {
        state[tunnelName].config = { ...state[tunnelName].config, ...config };
        state[tunnelName].lastUpdated = new Date().toISOString();
        await this.saveState(state);
        console.log(`🔄 Updated config for tunnel ${tunnelName}`);
      }
    } catch (error) {
      console.error(`❌ Failed to update tunnel config ${tunnelName}:`, error);
    }
  }

  /**
   * Get tunnel state information
   */
  async getTunnelState(tunnelName) {
    try {
      const state = await this.loadState();
      return state[tunnelName] || null;
    } catch (error) {
      console.error(`❌ Failed to get tunnel state ${tunnelName}:`, error);
      return null;
    }
  }

  /**
   * Get all tunnel states
   */
  async getAllTunnelStates() {
    try {
      return await this.loadState();
    } catch (error) {
      console.error('❌ Failed to get all tunnel states:', error);
      return {};
    }
  }

  /**
   * Cleanup orphaned tunnel states (configs that no longer exist)
   */
  async cleanupOrphanedStates() {
    try {
      const state = await this.loadState();
      const cleaned = {};
      let removedCount = 0;

      for (const [tunnelName, tunnelState] of Object.entries(state)) {
        const configFile = path.join(this.configDir, `${tunnelName}.yml`);
        if (await fs.pathExists(configFile)) {
          cleaned[tunnelName] = tunnelState;
        } else {
          console.log(`🧹 Removing orphaned state for tunnel: ${tunnelName}`);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        await this.saveState(cleaned);
        console.log(`🧹 Cleaned up ${removedCount} orphaned tunnel states`);
      }

      return removedCount;
    } catch (error) {
      console.error('❌ Failed to cleanup orphaned states:', error);
      return 0;
    }
  }
}

module.exports = TunnelStateManager;
