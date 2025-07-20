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

      // Create the tunnel
      console.log(`🚇 Creating tunnel: ${name}`);
      await this.cloudflared.createTunnel(name);

      // Create DNS route for the tunnel
      console.log(`🌐 Creating DNS route: ${hostname} -> ${name}`);
      await this.cloudflared.createDNSRoute(name, hostname);

      // Generate and write config
      console.log(`📝 Generating config for tunnel: ${name}`);
      const configContent = this.config.generateConfig(name, hostname, portNum, fallback);
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

      // Stop and disable service first
      try {
        await this.systemd.stopService(name);
        await this.systemd.disableService(name);
      } catch (error) {
        console.warn('Warning: Could not stop/disable service:', error.message);
      }

      // Remove config and service files
      await this.config.removeFiles(name);

      // Delete the tunnel
      await this.cloudflared.deleteTunnel(name);

      res.json({ 
        success: true, 
        message: `Tunnel "${name}" deleted successfully` 
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

  // Get Docker containers with tunnel labels
  async getContainerTunnels(req, res) {
    try {
      const dockerAvailable = await this.docker.isDockerAvailable();
      if (!dockerAvailable) {
        return res.json({ 
          success: true, 
          containers: [],
          message: 'Docker not available' 
        });
      }

      const containers = await this.docker.getAllTunnelConfigs();
      res.json({ 
        success: true, 
        containers: containers 
      });

    } catch (error) {
      console.error('Get container tunnels error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // Create tunnel from container configuration
  async createTunnelFromContainer(req, res) {
    try {
      const { containerName } = req.body;
      
      if (!containerName) {
        return res.status(400).json({ 
          success: false, 
          error: 'Container name is required' 
        });
      }

      // Get container tunnel configuration
      const config = await this.docker.getTunnelConfigFromContainer(containerName);
      if (!config) {
        return res.status(400).json({ 
          success: false, 
          error: 'Container does not have tunnel configuration or is not running' 
        });
      }

      // Ensure cloudflared is installed
      await this.cloudflared.ensureInstalled();

      // Create the tunnel with container name
      const tunnelName = `container-${containerName}`;
      await this.cloudflared.createTunnel(tunnelName);

      // Generate config pointing to container service
      const configContent = this.config.generateConfig(
        tunnelName, 
        config.hostname, 
        config.port,
        config.fallback
      );

      // Replace localhost with container IP or name
      const containerServiceUrl = this.containerMode 
        ? `http://${containerName}:${config.port}`
        : config.service;
      
      const updatedConfig = configContent.replace(
        `http://localhost:${config.port}`,
        containerServiceUrl
      );

      await this.config.writeConfig(tunnelName, updatedConfig);

      // Create systemd service
      await this.config.writeSystemdService(tunnelName);

      // Auto-start the tunnel
      await this.systemd.enableService(tunnelName);
      await this.systemd.startService(tunnelName);

      res.json({ 
        success: true, 
        message: `Tunnel "${tunnelName}" created for container "${containerName}"`,
        tunnel: { 
          name: tunnelName, 
          hostname: config.hostname, 
          service: containerServiceUrl,
          container: containerName
        }
      });

    } catch (error) {
      console.error('Create tunnel from container error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
}

module.exports = TunnelController;
