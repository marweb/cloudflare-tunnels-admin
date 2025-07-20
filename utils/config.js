const fs = require('fs-extra');
const path = require('path');
const yaml = require('yaml');
const { exec } = require('child_process');

class ConfigManager {
  constructor() {
    this.configDir = '/etc/cloudflared';
    this.systemdDir = '/etc/systemd/system';
  }

  // Ensure config directory exists
  async ensureConfigDir() {
    return new Promise((resolve, reject) => {
      exec(`sudo mkdir -p ${this.configDir}`, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  // Generate config.yml for a tunnel
  generateConfig(tunnelName, hostname, port, tunnelUuid = null, fallback = null) {
    // Use UUID if provided, otherwise fall back to name (for backwards compatibility)
    const tunnelId = tunnelUuid || tunnelName;
    const credentialsPath = tunnelUuid 
      ? `/home/appuser/.cloudflared/${tunnelUuid}.json`  // Use UUID-based path
      : `/etc/cloudflared/${tunnelName}.json`;           // Fallback to name-based path
  
    console.log(`📝 Generating config for tunnel: ${tunnelName}`);
    console.log(`📝 Tunnel ID (UUID): ${tunnelId}`);
    console.log(`📝 Credentials file: ${credentialsPath}`);
  
    const config = {
      tunnel: tunnelId,  // Use UUID instead of name
      'credentials-file': credentialsPath,
      ingress: [
        {
          hostname: hostname,
          service: `http://localhost:${port}`
        }
      ]
    };

    // Add fallback service if provided
    if (fallback) {
      config.ingress.push({
        service: fallback
      });
    } else {
      config.ingress.push({
        service: 'http_status:404'
      });
    }

    const yamlConfig = yaml.stringify(config);
    console.log(`📝 Generated YAML config:`);
    console.log(yamlConfig);
  
    return yamlConfig;
  }

  // Write config file
  async writeConfig(tunnelName, configContent) {
    await this.ensureConfigDir();
    const configPath = path.join(this.configDir, `${tunnelName}.yml`);
    
    return new Promise((resolve, reject) => {
      // Write config file with sudo
      const tempFile = `/tmp/${tunnelName}.yml`;
      
      fs.writeFile(tempFile, configContent)
        .then(() => {
          exec(`sudo mv "${tempFile}" "${configPath}" && sudo chown root:root "${configPath}" && sudo chmod 644 "${configPath}"`, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve(configPath);
            }
          });
        })
        .catch(reject);
    });
  }

  // Generate systemd service file
  generateSystemdService(tunnelName) {
    return `[Unit]
Description=Cloudflare Tunnel - ${tunnelName}
After=network.target

[Service]
Type=notify
User=root
ExecStart=/usr/local/bin/cloudflared tunnel --config /etc/cloudflared/${tunnelName}.yml run
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target`;
  }

  // Write systemd service file (Docker-compatible version)
  async writeSystemdService(tunnelName) {
    const serviceContent = this.generateSystemdService(tunnelName);
    const servicePath = path.join(this.systemdDir, `cloudflared-${tunnelName}.service`);
  
    try {
      // In Docker, we'll create the service file directly without systemctl
      return new Promise((resolve, reject) => {
        const createFileCmd = `mkdir -p "${this.systemdDir}" && cat > "${servicePath}" << 'EOF'\n${serviceContent}EOF && chmod 644 "${servicePath}"`;
        
        exec(createFileCmd, (error, stdout, stderr) => {
          if (error) {
            console.warn('Could not create systemd service file (not critical in Docker):', error.message);
            // In Docker, this is not critical, so we'll succeed anyway
            resolve(servicePath);
          } else {
            console.log(`Systemd service file created: ${servicePath}`);
            resolve(servicePath);
          }
        });
      });
    } catch (error) {
      console.warn('Error writing systemd service file (not critical in Docker):', error);
      // In Docker, systemd service files are not critical
      return servicePath;
    }
  }

  // Remove config and service files (Docker-compatible version)
  async removeFiles(tunnelName) {
    const configPath = path.join(this.configDir, `${tunnelName}.yml`);
    const servicePath = path.join(this.systemdDir, `cloudflared-${tunnelName}.service`);
    
    return new Promise((resolve, reject) => {
      // Use sudo to remove files since they were created with root permissions
      const removeCmd = `sudo rm -f "${configPath}" "${servicePath}"`;
      
      exec(removeCmd, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error removing files for tunnel ${tunnelName}:`, error.message);
          reject(error);
        } else {
          console.log(`Successfully removed files for tunnel: ${tunnelName}`);
          if (stdout) console.log('Remove output:', stdout);
          resolve(true);
        }
      });
    });
  }

  // Check if config exists
  async configExists(tunnelName) {
    const configPath = path.join(this.configDir, `${tunnelName}.yml`);
    try {
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  // Read existing config
  async readConfig(tunnelName) {
    const configPath = path.join(this.configDir, `${tunnelName}.yml`);
    try {
      const content = await fs.readFile(configPath, 'utf8');
      return yaml.parse(content);
    } catch (error) {
      throw new Error(`Failed to read config for ${tunnelName}: ${error.message}`);
    }
  }
}

module.exports = ConfigManager;
