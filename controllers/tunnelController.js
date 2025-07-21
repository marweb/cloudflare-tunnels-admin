const CloudflaredManager = require('../utils/cloudflared');
const ConfigManager = require('../utils/config');
const SystemdManager = require('../utils/systemd');
const DockerManager = require('../utils/docker');

class TunnelController {
  constructor() {
    this.cloudflared = new CloudflaredManager();
    this.config = new ConfigManager();
    this.systemd = new SystemdManager();
    this.docker = new DockerManager();
    this.containerMode = process.env.CONTAINER_MODE === 'true';
  }

  // Get dashboard data
  async getDashboard(req, res) {
    try {
      // Ensure cloudflared is installed
      await this.cloudflared.ensureInstalled();
      
      let tunnels = [];
      let cloudflaredInstalled = true;
      let needsAuth = false;
      let error = null;
      
      try {
        // Try to get tunnels and their status
        tunnels = await this.cloudflared.listTunnels();
      } catch (tunnelError) {
        console.log('Could not list tunnels:', tunnelError.message);
        
        // Check if it's an authentication error
        if (tunnelError.message.includes('origin cert') || 
            tunnelError.message.includes('origincert') ||
            tunnelError.message.includes('cert.pem')) {
          needsAuth = true;
          error = 'Cloudflared needs to be authenticated with your Cloudflare account.';
        } else {
          error = tunnelError.message;
        }
      }
      
      const services = await this.systemd.getAllTunnelServices();
      
      // Merge tunnel data with service status
      const tunnelData = tunnels.map(tunnel => {
        const service = services.find(s => s.name === tunnel.name);
        return {
          ...tunnel,
          status: service ? service.status : 'inactive',
          active: service ? service.active : false,
          running: service ? service.running : false,
          hasConfig: false // Will be checked individually if needed
        };
      });

      res.render('dashboard', {
        title: 'Cloudflare Tunnel Admin',
        tunnels: tunnelData,
        cloudflaredInstalled: cloudflaredInstalled,
        needsAuth: needsAuth,
        error: error
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.render('dashboard', {
        title: 'Cloudflare Tunnel Admin',
        tunnels: [],
        cloudflaredInstalled: false,
        needsAuth: false,
        error: error.message
      });
    }
  }

  // Create new tunnel
  async createTunnel(req, res) {
    try {
      const { name, hostname, port, fallback, autoStart } = req.body;
      
      // Validate input
      if (!name || !hostname || !port) {
        return res.status(400).json({ 
          success: false, 
          error: 'Name, hostname, and port are required' 
        });
      }

      // Validate port number
      const portNum = parseInt(port);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return res.status(400).json({ 
          success: false, 
          error: 'Port must be a valid number between 1 and 65535' 
        });
      }

      // Validate hostname
      const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
      if (!hostnameRegex.test(hostname)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid hostname format' 
        });
      }

      // Ensure cloudflared is installed
      await this.cloudflared.ensureInstalled();

      // Create the tunnel and capture UUID
      console.log(`🚇 Creating tunnel: ${name}`);
      const tunnelResult = await this.cloudflared.createTunnel(name);
      
      if (!tunnelResult.success || !tunnelResult.uuid) {
        throw new Error('Failed to create tunnel or extract UUID');
      }
      
      const tunnelUuid = tunnelResult.uuid;
      console.log(`🚇 Tunnel created with UUID: ${tunnelUuid}`);

      // Create DNS route for the tunnel
      console.log(`🌐 Creating DNS route: ${hostname} -> ${name}`);
      await this.cloudflared.createDNSRoute(name, hostname);

      // Generate and write config with UUID
      console.log(`📝 Generating config for tunnel: ${name} (UUID: ${tunnelUuid})`);
      const configContent = this.config.generateConfig(name, hostname, portNum, tunnelUuid, fallback);
      await this.config.writeConfig(name, configContent);

      // Create systemd service
      console.log(`⚙️ Creating systemd service for tunnel: ${name}`);
      await this.config.writeSystemdService(name);

      // Enable and start service if requested
      console.log(`🔄 Auto-start requested:`, autoStart);
      if (autoStart) {
        console.log(`✅ Enabling service for tunnel: ${name}`);
        await this.systemd.enableService(name);
        
        console.log(`🚀 Starting service for tunnel: ${name}`);
        const startResult = await this.systemd.startService(name);
        console.log(`🚀 Start service result:`, startResult);
      } else {
        console.log(`⏸️ Auto-start not requested, tunnel created but not started`);
      }

      res.json({ 
        success: true, 
        message: `Tunnel "${name}" created successfully`,
        tunnel: { name, hostname, port: portNum }
      });

    } catch (error) {
      console.error('Create tunnel error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // Start tunnel service
  async startTunnel(req, res) {
    try {
      const { name } = req.params;
      
      if (!name) {
        return res.status(400).json({ 
          success: false, 
          error: 'Tunnel name is required' 
        });
      }

      const result = await this.systemd.startService(name);
      res.json(result);

    } catch (error) {
      console.error('Start tunnel error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // Stop tunnel service
  async stopTunnel(req, res) {
    console.log('🔴 stopTunnel method called!');
    console.log('🔴 Request params:', req.params);
    console.log('🔴 Request URL:', req.url);
    console.log('🔴 Request method:', req.method);
    
    try {
      const { name } = req.params;
      console.log('🔴 Tunnel name to stop:', name);
      
      if (!name) {
        console.log('🔴 No tunnel name provided');
        return res.status(400).json({ 
          success: false, 
          error: 'Tunnel name is required' 
        });
      }

      console.log('🔴 Calling systemd.stopService for:', name);
      const result = await this.systemd.stopService(name);
      console.log('🔴 stopService result:', result);
      
      res.json(result);

    } catch (error) {
      console.error('🔴 Stop tunnel error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // Delete tunnel
  async deleteTunnel(req, res) {
    try {
      const { name } = req.params;
      
      if (!name) {
        return res.status(400).json({ 
          success: false, 
          error: 'Tunnel name is required' 
        });
      }

      // Get hostname from config before deleting files (for DNS cleanup)
      const hostname = await this.cloudflared.getHostnameFromConfig(name);
      console.log(`🗑️ Found hostname for tunnel ${name}: ${hostname}`);

      // Stop and disable service first
      try {
        await this.systemd.stopService(name);
        await this.systemd.disableService(name);
      } catch (error) {
        console.warn('Warning: Could not stop/disable service:', error.message);
      }

      // Delete DNS route if hostname was found
      if (hostname) {
        try {
          console.log(`🗑️ Attempting to delete DNS route: ${hostname}`);
          await this.cloudflared.deleteDNSRoute(name, hostname);
        } catch (error) {
          console.warn('Warning: Could not delete DNS route:', error.message);
          // Continue with tunnel deletion even if DNS cleanup fails
        }
      } else {
        console.warn('Warning: Could not find hostname for DNS cleanup');
      }

      // Remove config and service files
      await this.config.removeFiles(name);

      // Delete the tunnel
      await this.cloudflared.deleteTunnel(name);

      res.json({ 
        success: true, 
        message: `Tunnel "${name}" deleted successfully${hostname ? ' (DNS route also removed)' : ''}` 
      });

    } catch (error) {
      console.error('Delete tunnel error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // Get tunnel logs
  async getTunnelLogs(req, res) {
    try {
      const { name } = req.params;
      const lines = parseInt(req.query.lines) || 50;
      
      if (!name) {
        return res.status(400).json({ 
          success: false, 
          error: 'Tunnel name is required' 
        });
      }

      const logs = await this.systemd.getServiceLogs(name, lines);
      res.json({ 
        success: true, 
        logs: logs 
      });

    } catch (error) {
      console.error('Get logs error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // Stream tunnel logs via WebSocket
  streamTunnelLogs(socket, tunnelName) {
    try {
      const logStream = this.systemd.streamServiceLogs(tunnelName, (error, data) => {
        if (error) {
          socket.emit('log-error', { error: error.message });
        } else if (data) {
          socket.emit('log-data', { data: data });
        }
      });

      // Handle client disconnect
      socket.on('disconnect', () => {
        if (logStream && logStream.kill) {
          logStream.kill();
        }
      });

      // Handle stop log stream
      socket.on('stop-logs', () => {
        if (logStream && logStream.kill) {
          logStream.kill();
        }
      });

      return logStream;

    } catch (error) {
      socket.emit('log-error', { error: error.message });
    }
  }

  // Get tunnel status
  async getTunnelStatus(req, res) {
    try {
      const { name } = req.params;
      
      if (!name) {
        return res.status(400).json({ 
          success: false, 
          error: 'Tunnel name is required' 
        });
      }

      const status = await this.systemd.getServiceStatus(name);
      res.json({ 
        success: true, 
        status: status 
      });

    } catch (error) {
      console.error('Get status error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // Install cloudflared
  async installCloudflared(req, res) {
    try {
      await this.cloudflared.install();
      res.json({ 
        success: true, 
        message: 'Cloudflared installed successfully' 
      });

    } catch (error) {
      console.error('Install cloudflared error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // Execute terminal command (simplified terminal)
  async executeTerminalCommand(req, res) {
    try {
      const { command } = req.body;
      
      if (!command) {
        return res.status(400).json({ 
          success: false, 
          error: 'Command is required' 
        });
      }

      // Security: Only allow specific safe commands
      const allowedCommands = [
        'cloudflared tunnel login',
        'cloudflared tunnel list',
        'cloudflared version',
        'cloudflared --version',
        'ls -la /etc/cloudflared/',
        'ls -la /home/appuser/.cloudflared/',
        'whoami',
        'pwd',
        'date',
        'uname -a'
      ];

      // Check if command starts with any allowed command
      const isAllowed = allowedCommands.some(allowed => 
        command.trim().toLowerCase().startsWith(allowed.toLowerCase())
      );

      if (!isAllowed) {
        return res.json({
          success: false,
          error: `Command not allowed. Allowed commands: ${allowedCommands.join(', ')}`
        });
      }

      // Execute the command
      const output = await this.executeCommand(command);
      
      res.json({
        success: true,
        output: output,
        command: command
      });

    } catch (error) {
      console.error('Execute terminal command error:', error);
      res.json({
        success: false,
        error: error.message,
        output: `Error executing command: ${error.message}`
      });
    }
  }

  // Helper method to execute commands safely
  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      
      // Set timeout for command execution
      const timeout = 30000; // 30 seconds
      
      exec(command, { 
        timeout: timeout,
        cwd: '/app',
        env: {
          ...process.env,
          HOME: '/home/appuser',
          USER: 'appuser'
        }
      }, (error, stdout, stderr) => {
        if (error) {
          // Handle timeout specifically
          if (error.code === 'ETIMEDOUT') {
            reject(new Error('Command timed out after 30 seconds'));
          } else {
            reject(new Error(`Command failed: ${error.message}`));
          }
          return;
        }
        
        // Combine stdout and stderr for complete output
        let output = '';
        if (stdout) output += stdout;
        if (stderr) output += stderr;
        
        // If no output, provide a default message
        if (!output.trim()) {
          output = 'Command executed successfully (no output)';
        }
        
        resolve(output);
      });
    });
  }

}

module.exports = TunnelController;
