const { spawn, exec } = require('child_process');

class SystemdManager {
  constructor() {
    this.servicePrefix = 'cloudflared-';
  }

  // Get service name for tunnel
  getServiceName(tunnelName) {
    return `${this.servicePrefix}${tunnelName}`;
  }

  // Check if service exists
  async serviceExists(tunnelName) {
    const serviceName = this.getServiceName(tunnelName);
    
    return new Promise((resolve) => {
      exec(`systemctl list-unit-files ${serviceName}.service`, (error, stdout) => {
        resolve(!error && stdout.includes(serviceName));
      });
    });
  }

  // Get service status
  async getServiceStatus(tunnelName) {
    const serviceName = this.getServiceName(tunnelName);
    
    return new Promise((resolve, reject) => {
      exec(`systemctl is-active ${serviceName}`, (error, stdout) => {
        const status = stdout.trim();
        resolve({
          name: tunnelName,
          service: serviceName,
          active: status === 'active',
          status: status
        });
      });
    });
  }

  // Start service
  async startService(tunnelName) {
    const serviceName = this.getServiceName(tunnelName);
    
    return new Promise((resolve, reject) => {
      exec(`sudo systemctl start ${serviceName}`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to start service: ${stderr || error.message}`));
        } else {
          resolve({ success: true, message: `Service ${serviceName} started` });
        }
      });
    });
  }

  // Stop service
  async stopService(tunnelName) {
    const serviceName = this.getServiceName(tunnelName);
    
    return new Promise((resolve, reject) => {
      exec(`sudo systemctl stop ${serviceName}`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to stop service: ${stderr || error.message}`));
        } else {
          resolve({ success: true, message: `Service ${serviceName} stopped` });
        }
      });
    });
  }

  // Enable service (start on boot)
  async enableService(tunnelName) {
    const serviceName = this.getServiceName(tunnelName);
    
    return new Promise((resolve, reject) => {
      exec(`sudo systemctl enable ${serviceName}`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to enable service: ${stderr || error.message}`));
        } else {
          resolve({ success: true, message: `Service ${serviceName} enabled` });
        }
      });
    });
  }

  // Disable service
  async disableService(tunnelName) {
    const serviceName = this.getServiceName(tunnelName);
    
    return new Promise((resolve, reject) => {
      exec(`sudo systemctl disable ${serviceName}`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to disable service: ${stderr || error.message}`));
        } else {
          resolve({ success: true, message: `Service ${serviceName} disabled` });
        }
      });
    });
  }

  // Get service logs
  async getServiceLogs(tunnelName, lines = 50) {
    const serviceName = this.getServiceName(tunnelName);
    
    return new Promise((resolve, reject) => {
      exec(`journalctl -u ${serviceName} -n ${lines} --no-pager`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to get logs: ${stderr || error.message}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  // Stream service logs in real-time
  streamServiceLogs(tunnelName, callback) {
    const serviceName = this.getServiceName(tunnelName);
    
    const process = spawn('journalctl', ['-u', serviceName, '-f', '--no-pager'], {
      stdio: 'pipe'
    });

    process.stdout.on('data', (data) => {
      callback(null, data.toString());
    });

    process.stderr.on('data', (data) => {
      callback(null, data.toString());
    });

    process.on('error', (error) => {
      callback(error, null);
    });

    process.on('close', (code) => {
      callback(null, `Log stream ended with code ${code}`);
    });

    return process;
  }

  // Get all tunnel services status
  async getAllTunnelServices() {
    return new Promise((resolve, reject) => {
      exec(`systemctl list-units ${this.servicePrefix}* --all --no-pager`, (error, stdout) => {
        if (error) {
          resolve([]); // Return empty array if no services found
          return;
        }

        const services = [];
        const lines = stdout.split('\n');
        
        for (const line of lines) {
          const match = line.match(new RegExp(`${this.servicePrefix}([^\\s]+)\\.service`));
          if (match) {
            const tunnelName = match[1];
            const isActive = line.includes('active');
            const isRunning = line.includes('running');
            
            services.push({
              name: tunnelName,
              service: `${this.servicePrefix}${tunnelName}`,
              active: isActive,
              running: isRunning,
              status: isActive ? (isRunning ? 'running' : 'active') : 'inactive'
            });
          }
        }
        
        resolve(services);
      });
    });
  }
}

module.exports = SystemdManager;
