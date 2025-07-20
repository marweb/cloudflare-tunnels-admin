const { spawn, exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const tar = require('tar');
const os = require('os');

class CloudflaredManager {
  constructor() {
    this.cloudflaredPath = '/usr/local/bin/cloudflared';
    this.configDir = '/etc/cloudflared';
    this.systemdDir = '/etc/systemd/system';
  }

  // Check if cloudflared is installed
  async isInstalled() {
    return new Promise((resolve) => {
      exec('which cloudflared', (error, stdout) => {
        if (error) {
          resolve(false);
        } else {
          this.cloudflaredPath = stdout.trim();
          resolve(true);
        }
      });
    });
  }

  // Install cloudflared from GitHub releases
  async install() {
    try {
      console.log('Installing cloudflared...');
      
      // Get the latest release info
      const response = await axios.get('https://api.github.com/repos/cloudflare/cloudflared/releases/latest');
      const release = response.data;
      
      // Find the Linux AMD64 asset
      const asset = release.assets.find(asset => 
        asset.name.includes('linux-amd64') && asset.name.endsWith('.tgz')
      );
      
      if (!asset) {
        throw new Error('Could not find Linux AMD64 release');
      }

      // Download the binary
      const downloadUrl = asset.browser_download_url;
      const tempDir = os.tmpdir();
      const downloadPath = path.join(tempDir, 'cloudflared.tgz');
      
      console.log(`Downloading from: ${downloadUrl}`);
      const downloadResponse = await axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream'
      });

      const writer = fs.createWriteStream(downloadPath);
      downloadResponse.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Extract the binary
      const extractDir = path.join(tempDir, 'cloudflared-extract');
      await fs.ensureDir(extractDir);
      
      await tar.x({
        file: downloadPath,
        cwd: extractDir
      });

      // Find the cloudflared binary in extracted files
      const files = await fs.readdir(extractDir);
      const binaryFile = files.find(file => file === 'cloudflared' || file.endsWith('/cloudflared'));
      
      if (!binaryFile) {
        throw new Error('Could not find cloudflared binary in extracted files');
      }

      const binaryPath = path.join(extractDir, binaryFile);
      
      // Move to /usr/local/bin and make executable
      return new Promise((resolve, reject) => {
        exec(`sudo cp "${binaryPath}" /usr/local/bin/cloudflared && sudo chmod +x /usr/local/bin/cloudflared`, (error) => {
          if (error) {
            reject(error);
          } else {
            console.log('Cloudflared installed successfully');
            this.cloudflaredPath = '/usr/local/bin/cloudflared';
            resolve(true);
          }
        });
      });

    } catch (error) {
      console.error('Failed to install cloudflared:', error);
      throw error;
    }
  }

  // Ensure cloudflared is available
  async ensureInstalled() {
    const installed = await this.isInstalled();
    if (!installed) {
      await this.install();
    }
    return true;
  }

  // Execute cloudflared command
  executeCommand(args, options = {}) {
    return spawn(this.cloudflaredPath, args, {
      stdio: options.stdio || 'pipe',
      ...options
    });
  }

  // Get list of tunnels
  async listTunnels() {
    return new Promise((resolve, reject) => {
      const process = this.executeCommand(['tunnel', 'list']);
      let output = '';
      let error = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        error += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          const tunnels = this.parseTunnelList(output);
          resolve(tunnels);
        } else {
          reject(new Error(error || 'Failed to list tunnels'));
        }
      });
    });
  }

  // Parse tunnel list output
  parseTunnelList(output) {
    const lines = output.split('\n').filter(line => line.trim());
    const tunnels = [];
    
    // Skip header lines and parse tunnel data
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('ID') && line.includes('NAME')) continue; // Skip header
      if (line.includes('---')) continue; // Skip separator
      if (!line) continue;
      
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        tunnels.push({
          id: parts[0],
          name: parts[1],
          created: parts.slice(2).join(' ')
        });
      }
    }
    
    return tunnels;
  }

  // Create a new tunnel
  async createTunnel(name) {
    return new Promise((resolve, reject) => {
      // Validate tunnel name
      if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
        reject(new Error('Invalid tunnel name. Use only letters, numbers, hyphens, and underscores.'));
        return;
      }

      const process = this.executeCommand(['tunnel', 'create', name]);
      let output = '';
      let error = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        error += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output });
        } else {
          reject(new Error(error || 'Failed to create tunnel'));
        }
      });
    });
  }

  // Delete a tunnel
  async deleteTunnel(name) {
    return new Promise((resolve, reject) => {
      const process = this.executeCommand(['tunnel', 'delete', name]);
      let output = '';
      let error = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        error += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output });
        } else {
          reject(new Error(error || 'Failed to delete tunnel'));
        }
      });
    });
  }
}

module.exports = CloudflaredManager;
