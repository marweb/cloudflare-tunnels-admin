const { spawn, exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

class SystemdManager {
  constructor() {
    this.servicePrefix = 'cloudflared-';
    this.runningProcesses = new Map(); // Track running processes
  }

  // Get service name for tunnel
  getServiceName(tunnelName) {
    return `${this.servicePrefix}${tunnelName}`;
  }

  // Check if service exists (Docker-compatible version)
  async serviceExists(tunnelName) {
    const serviceName = this.getServiceName(tunnelName);
    
    try {
      // Check if service file exists
      const serviceFile = `/etc/systemd/system/${serviceName}.service`;
      return await fs.pathExists(serviceFile);
    } catch (error) {
      console.log('Service check error:', error.message);
      return false;
    }
  }

  // Get service status (Docker-compatible version)
  async getServiceStatus(tunnelName) {
    const serviceName = this.getServiceName(tunnelName);
    
    try {
      // Check if process is running using multiple detection methods
      return new Promise((resolve) => {
        console.log(`🔍 Checking status for tunnel ${tunnelName}`);
        
        // First, let's see all cloudflared processes
        exec('ps aux | grep cloudflared | grep -v grep', (psError, psStdout) => {
          console.log(`🔍 All cloudflared processes:`);
          console.log(psStdout || 'No cloudflared processes found');
          
          // Try multiple pgrep patterns
          const patterns = [
            `pgrep -f "cloudflared.*${tunnelName}"`,
            `pgrep -f "cloudflared.*tunnel.*${tunnelName}"`,
            `pgrep -f "${tunnelName}"`
          ];
          
          let foundProcess = false;
          let processCount = 0;
          
          const checkPattern = (patternIndex) => {
            if (patternIndex >= patterns.length) {
              // No patterns worked, tunnel is inactive
              console.log(`🔍 No active processes found for tunnel ${tunnelName} with any pattern`);
              resolve({
                name: tunnelName,
                service: serviceName,
                active: false,
                running: false,
                status: 'inactive'
              });
              return;
            }
            
            const pgrepCommand = patterns[patternIndex];
            console.log(`🔍 Trying pattern ${patternIndex + 1}: ${pgrepCommand}`);
            
            exec(pgrepCommand, (error, stdout, stderr) => {
              console.log(`🔍 Pattern ${patternIndex + 1} result:`, { error: error?.code, stdout: stdout.trim() });
              
              if (!error && stdout.trim()) {
                const pids = stdout.trim().split('\n').filter(pid => pid && pid.match(/^\d+$/));
                if (pids.length > 0) {
                  console.log(`✅ Found ${pids.length} active processes for tunnel ${tunnelName}:`, pids);
                  resolve({
                    name: tunnelName,
                    service: serviceName,
                    active: true,
                    running: true,
                    status: 'active',
                    pids: pids
                  });
                  return;
                }
              }
              
              // Try next pattern
              checkPattern(patternIndex + 1);
            });
          };
          
          checkPattern(0);
        });
      });
    } catch (error) {
      console.error('Error getting service status:', error);
      return {
        name: tunnelName,
        service: serviceName,
        active: false,
        running: false,
        status: 'error'
      };
    }
  }

  // Start service (Docker-compatible version)
  async startService(tunnelName) {
    console.log('🚀 startService method called!');
    console.log('🚀 Tunnel name to start:', tunnelName);
    
    try {
      // First, check if tunnel is already running
      const checkRunning = () => {
        return new Promise((resolve) => {
          // Use more specific pattern and check actual process list
          exec(`ps aux | grep "cloudflared.*${tunnelName}" | grep -v grep`, (error, stdout) => {
            const processes = stdout ? stdout.trim().split('\n').filter(line => line.includes('cloudflared') && line.includes(tunnelName)) : [];
            const isRunning = processes.length > 0;
            console.log(`🚀 Checking if ${tunnelName} is running: ${isRunning} (found ${processes.length} processes)`);
            if (processes.length > 0) {
              console.log(`🚀 Running processes:`, processes);
            }
            resolve(isRunning);
          });
        });
      };
      
      const alreadyRunning = await checkRunning();
      if (alreadyRunning) {
        console.log('🚀 Tunnel is already running, skipping start');
        return { success: true, message: `Tunnel ${tunnelName} is already running` };
      }

      // Verify config file exists
      const configPath = `/etc/cloudflared/${tunnelName}.yml`;
      console.log('🚀 Config path:', configPath);
      
      const configExists = await fs.pathExists(configPath);
      console.log('🚀 Config file exists:', configExists);
      
      if (!configExists) {
        console.log('🚀 ERROR: Configuration file not found!');
        throw new Error(`Configuration file not found: ${configPath}`);
      }

      // Read tunnel UUID from config file
      console.log('🚀 Reading tunnel UUID from config file...');
      
      return new Promise((resolve, reject) => {
        exec(`grep "^tunnel:" ${configPath}`, (grepError, grepStdout) => {
          if (grepError) {
            console.error('🚀 Failed to read tunnel UUID from config:', grepError);
            reject(new Error(`Failed to read tunnel UUID from config: ${grepError.message}`));
            return;
          }
          
          const tunnelUuid = grepStdout.trim().split(':')[1]?.trim();
          if (!tunnelUuid) {
            console.error('🚀 Could not extract tunnel UUID from config file');
            reject(new Error('Could not extract tunnel UUID from config file'));
            return;
          }
          
          console.log('🚀 Extracted tunnel UUID:', tunnelUuid);
          console.log('🚀 Starting cloudflared tunnel...');
          
          // Use spawn for better process management
          const { spawn } = require('child_process');
          const fs = require('fs');
          const logFile = `/home/appuser/logs/cloudflared-${tunnelName}.log`;
          
          // Ensure log directory exists
          const logDir = '/home/appuser/logs';
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }
          
          console.log('🚀 Spawning cloudflared process...');
          console.log('🚀 Command: cloudflared tunnel --config', configPath, 'run', tunnelUuid);
          console.log('🚀 Log file:', logFile);
          
          // Open log file for writing
          const logFd = fs.openSync(logFile, 'a');
          
          // Spawn the process
          const tunnelProcess = spawn('cloudflared', [
            'tunnel',
            '--config', configPath,
            'run', tunnelUuid
          ], {
            detached: true,
            stdio: ['ignore', logFd, logFd]
          });
          
          // Detach the process so it continues running
          tunnelProcess.unref();
          
          // Close the file descriptor after spawning
          fs.closeSync(logFd);
          
          // Wait a moment for the process to start
          setTimeout(async () => {
            console.log('🚀 Checking if tunnel started...');
            const stillRunning = await checkRunning();
            if (stillRunning) {
              console.log(`🚀 ✅ Tunnel ${tunnelName} started successfully and is running`);
              resolve({ 
                success: true, 
                message: `Tunnel ${tunnelName} started successfully`
              });
            } else {
              console.log('🚀 ❌ Tunnel process not found after start attempt');
              // Check logs for error
              exec(`tail -n 10 ${logFile}`, (logError, logOutput) => {
                console.log('🚀 Recent logs:', logOutput || 'No logs found');
                reject(new Error(`Tunnel failed to start. Logs: ${logOutput || 'No logs available'}`));
              });
            }
          }, 3000);
        });
      });
    } catch (error) {
      console.error('🚀 Error starting service:', error);
      throw new Error(`Failed to start service: ${error.message}`);
    }
  }

  // Stop service (Docker-compatible version)
  async stopService(tunnelName) {
    console.log(`🛑 stopService method called for tunnel: ${tunnelName}`);
    
    try {
      // First, check if tunnel is actually running
      const checkRunning = () => {
        return new Promise((resolve) => {
          exec(`pgrep -f "cloudflared.*${tunnelName}"`, (error, stdout) => {
            const pids = !error && stdout.trim() ? stdout.trim().split('\n') : [];
            resolve(pids);
          });
        });
      };
      
      const runningPids = await checkRunning();
      console.log(`🛑 Found ${runningPids.length} running processes for tunnel ${tunnelName}:`, runningPids);
      
      if (runningPids.length === 0) {
        console.log(`🛑 No running processes found for tunnel ${tunnelName}`);
        return { success: true, message: `Tunnel ${tunnelName} is not running` };
      }

      // Kill all cloudflared processes for this tunnel
      return new Promise((resolve, reject) => {
        // Use pkill with exact pattern matching
        const killCommand = `pkill -f "cloudflared.*${tunnelName}"`;
        console.log(`🛑 Executing kill command: ${killCommand}`);
        
        exec(killCommand, (error, stdout, stderr) => {
          console.log(`🛑 Kill command result:`, { error: error?.code, stdout, stderr });
          
          // Wait a moment and verify processes are stopped
          setTimeout(async () => {
            const stillRunning = await checkRunning();
            console.log(`🛑 Processes still running after kill: ${stillRunning.length}`);
            
            if (stillRunning.length === 0) {
              console.log(`🛑 ✅ Tunnel ${tunnelName} stopped successfully`);
              resolve({ 
                success: true, 
                message: `Tunnel ${tunnelName} stopped successfully`,
                killedPids: runningPids
              });
            } else {
              // Force kill if still running
              console.log(`🛑 Force killing remaining processes...`);
              exec(`pkill -9 -f "cloudflared.*${tunnelName}"`, (forceError) => {
                console.log(`🛑 Force kill result:`, forceError?.code || 'success');
                resolve({ 
                  success: true, 
                  message: `Tunnel ${tunnelName} force stopped`,
                  killedPids: runningPids
                });
              });
            }
          }, 1000);
        });
      });
    } catch (error) {
      console.error(`🛑 Error stopping service ${tunnelName}:`, error);
      throw new Error(`Failed to stop service: ${error.message}`);
    }
  }

  // Enable service (Docker-compatible version - creates service file)
  async enableService(tunnelName) {
    const serviceName = this.getServiceName(tunnelName);
    
    try {
      // In Docker, we don't really need systemd service files, but create one for reference
      const serviceContent = this.generateServiceFile(tunnelName);
      const serviceFile = `/etc/systemd/system/${serviceName}.service`;
      
      return new Promise((resolve, reject) => {
        // Use exec to create the file with proper permissions
        const createFileCmd = `mkdir -p /etc/systemd/system && cat > "${serviceFile}" << 'EOF'\n${serviceContent}EOF`;
        
        exec(createFileCmd, (error, stdout, stderr) => {
          if (error) {
            console.warn('Could not create systemd service file (not critical in Docker):', error.message);
            // In Docker, this is not critical, so we'll succeed anyway
            resolve({ success: true, message: `Service ${serviceName} enabled (systemd file creation skipped in Docker)` });
          } else {
            console.log(`Service file created: ${serviceFile}`);
            resolve({ success: true, message: `Service ${serviceName} enabled (service file created)` });
          }
        });
      });
    } catch (error) {
      console.warn('Error enabling service (not critical in Docker):', error);
      // In Docker, systemd service files are not critical
      return { success: true, message: `Service ${serviceName} enabled (systemd not required in Docker)` };
    }
  }

  // Disable service (Docker-compatible version - removes service file)
  async disableService(tunnelName) {
    const serviceName = this.getServiceName(tunnelName);
    
    try {
      const serviceFile = `/etc/systemd/system/${serviceName}.service`;
      
      if (await fs.pathExists(serviceFile)) {
        await fs.remove(serviceFile);
        console.log(`Service file removed: ${serviceFile}`);
      }
      
      return { success: true, message: `Service ${serviceName} disabled (service file removed)` };
    } catch (error) {
      console.error('Error disabling service:', error);
      throw new Error(`Failed to disable service: ${error.message}`);
    }
  }

  // Get service logs (Docker-compatible version)
  async getServiceLogs(tunnelName, lines = 50) {
    try {
      const logFile = `/home/appuser/logs/cloudflared-${tunnelName}.log`;
      console.log(`📄 Reading logs from: ${logFile}`);
      
      // Check if log file exists
      const logExists = await fs.pathExists(logFile);
      if (!logExists) {
        console.log(`📄 No log file found for tunnel ${tunnelName}`);
        return `No log file found for tunnel ${tunnelName}. Tunnel may not have been started yet.`;
      }
      
      // Read last N lines from log file
      return new Promise((resolve, reject) => {
        exec(`tail -n ${lines} "${logFile}"`, (error, stdout, stderr) => {
          if (error) {
            console.error(`📄 Error reading logs:`, error);
            resolve('Error reading logs');
            return;
          }
          
          if (!stdout.trim()) {
            resolve(`Log file exists but is empty for tunnel ${tunnelName}`);
          } else {
            console.log(`📄 Successfully read ${lines} lines from ${tunnelName} logs`);
            resolve(stdout);
          }
        });
      });
    } catch (error) {
      console.error(`📄 Error getting service logs:`, error);
      return 'Error retrieving logs';
    }
  }

  // Stream service logs in real-time (Docker-compatible version)
  streamServiceLogs(tunnelName, callback) {
    // In Docker environment, we'll simulate log streaming
    const serviceName = this.getServiceName(tunnelName);
    
    // Check if tunnel is running
    this.getServiceStatus(tunnelName).then(status => {
      if (status.active) {
        callback(null, `Streaming logs for tunnel ${tunnelName}...\n`);
        callback(null, `Tunnel is active with PID(s): ${status.pids ? status.pids.join(', ') : 'unknown'}\n`);
        
        // Simulate periodic status updates
        const interval = setInterval(() => {
          callback(null, `[${new Date().toISOString()}] Tunnel ${tunnelName} is running\n`);
        }, 5000);
        
        // Return a mock process object
        return {
          kill: () => clearInterval(interval),
          pid: status.pids ? status.pids[0] : null
        };
      } else {
        callback(null, `Tunnel ${tunnelName} is not running\n`);
      }
    }).catch(error => {
      callback(error, null);
    });
  }

  // Get all tunnel services status (Docker-compatible version)
  async getAllTunnelServices() {
    try {
      console.log(`📋 Getting all tunnel services...`);
      
      // Find all cloudflared config files
      const configDir = '/etc/cloudflared';
      if (!await fs.pathExists(configDir)) {
        console.log(`📋 Config directory ${configDir} does not exist`);
        return [];
      }
      
      const files = await fs.readdir(configDir);
      const configFiles = files.filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));
      console.log(`📋 Found ${configFiles.length} config files:`, configFiles);
      
      // Get all running cloudflared processes at once
      const getAllRunningProcesses = () => {
        return new Promise((resolve) => {
          exec('ps aux | grep cloudflared | grep -v grep', (error, stdout) => {
            if (error || !stdout.trim()) {
              resolve([]);
              return;
            }
            
            const processes = stdout.trim().split('\n').map(line => {
              const parts = line.trim().split(/\s+/);
              const pid = parts[1];
              const command = parts.slice(10).join(' ');
              return { pid, command };
            });
            resolve(processes);
          });
        });
      };
      
      const runningProcesses = await getAllRunningProcesses();
      console.log(`📋 Found ${runningProcesses.length} running cloudflared processes`);
      
      const services = [];
      for (const configFile of configFiles) {
        const tunnelName = path.basename(configFile, path.extname(configFile));
        
        // Check if this tunnel has running processes
        const tunnelProcesses = runningProcesses.filter(proc => 
          proc.command.includes(tunnelName)
        );
        
        const isActive = tunnelProcesses.length > 0;
        const pids = tunnelProcesses.map(proc => proc.pid);
        
        services.push({
          name: tunnelName,
          service: this.getServiceName(tunnelName),
          active: isActive,
          running: isActive,
          status: isActive ? 'active' : 'inactive',
          pids: pids
        });
      }
      
      console.log(`📋 Returning ${services.length} tunnel services`);
      return services;
    } catch (error) {
      console.error('📋 Error getting all tunnel services:', error);
      return [];
    }
  }

  // Generate systemd service file content
  generateServiceFile(tunnelName) {
    const serviceName = this.getServiceName(tunnelName);
    const configPath = `/etc/cloudflared/${tunnelName}.yml`;
    
    return `[Unit]
Description=Cloudflare Tunnel - ${tunnelName}
After=network.target

[Service]
Type=simple
User=root
# Fix ping_group_range to enable ICMP proxy (prevents GID warnings)
ExecStartPre=/bin/bash -c 'echo "0 2000" > /proc/sys/net/ipv4/ping_group_range || true'
ExecStart=/usr/local/bin/cloudflared tunnel --config ${configPath} run
Restart=always
RestartSec=10
KillMode=mixed
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
`;
  }
}

module.exports = SystemdManager;
