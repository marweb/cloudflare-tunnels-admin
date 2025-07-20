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
  generateConfig(tunnelName, hostname, port, fallback = null) {
    const config = {
      tunnel: tunnelName,
      'credentials-file': `/etc/cloudflared/${tunnelName}.json`,
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

    return yaml.stringify(config);
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

  // Write systemd service file
  async writeSystemdService(tunnelName) {
    const serviceContent = this.generateSystemdService(tunnelName);
    const servicePath = path.join(this.systemdDir, `cloudflared-${tunnelName}.service`);
    const tempFile = `/tmp/cloudflared-${tunnelName}.service`;
    
    return new Promise((resolve, reject) => {
      fs.writeFile(tempFile, serviceContent)
        .then(() => {
          exec(`sudo mv "${tempFile}" "${servicePath}" && sudo chown root:root "${servicePath}" && sudo chmod 644 "${servicePath}"`, (error) => {
            if (error) {
              reject(error);
            } else {
              // Reload systemd
              exec('sudo systemctl daemon-reload', (reloadError) => {
                if (reloadError) {
                  console.warn('Warning: Failed to reload systemd:', reloadError.message);
                }
                resolve(servicePath);
              });
            }
          });
        })
        .catch(reject);
    });
  }

  // Remove config and service files
  async removeFiles(tunnelName) {
    const configPath = path.join(this.configDir, `${tunnelName}.yml`);
    const servicePath = path.join(this.systemdDir, `cloudflared-${tunnelName}.service`);
    
    return new Promise((resolve, reject) => {
      exec(`sudo rm -f "${configPath}" "${servicePath}" && sudo systemctl daemon-reload`, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
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
