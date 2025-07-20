const { spawn } = require('child_process');
const os = require('os');

class WebTerminal {
  constructor(socket) {
    this.socket = socket;
    this.shell = null;
    this.isActive = false;
  }

  // Start a new shell session
  start() {
    if (this.isActive) {
      this.socket.emit('terminal-error', { error: 'Terminal session already active' });
      return;
    }

    try {
      // Determine shell based on OS
      const shell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash';
      const args = os.platform() === 'win32' ? [] : ['-i'];

      // Spawn shell process
      this.shell = spawn(shell, args, {
        stdio: 'pipe',
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          PS1: '\\[\\033[01;32m\\]cloudflared-admin\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ '
        },
        cwd: process.cwd()
      });

      this.isActive = true;

      // Handle shell output
      this.shell.stdout.on('data', (data) => {
        this.socket.emit('terminal-output', { data: data.toString() });
      });

      this.shell.stderr.on('data', (data) => {
        this.socket.emit('terminal-output', { data: data.toString() });
      });

      // Handle shell exit
      this.shell.on('exit', (code) => {
        this.isActive = false;
        this.socket.emit('terminal-exit', { code });
      });

      this.shell.on('error', (error) => {
        this.isActive = false;
        this.socket.emit('terminal-error', { error: error.message });
      });

      // Send initial prompt
      this.socket.emit('terminal-ready', { message: 'Terminal ready. Type commands below.\n' });

    } catch (error) {
      this.socket.emit('terminal-error', { error: error.message });
    }
  }

  // Send input to shell
  write(data) {
    if (!this.isActive || !this.shell) {
      this.socket.emit('terminal-error', { error: 'No active terminal session' });
      return;
    }

    try {
      this.shell.stdin.write(data);
    } catch (error) {
      this.socket.emit('terminal-error', { error: error.message });
    }
  }

  // Resize terminal
  resize(cols, rows) {
    if (this.shell && this.shell.pid) {
      try {
        process.kill(this.shell.pid, 'SIGWINCH');
      } catch (error) {
        // Ignore resize errors
      }
    }
  }

  // Kill terminal session
  kill() {
    if (this.shell && this.shell.pid) {
      try {
        this.shell.kill('SIGTERM');
        setTimeout(() => {
          if (this.shell && this.shell.pid) {
            this.shell.kill('SIGKILL');
          }
        }, 5000);
      } catch (error) {
        // Ignore kill errors
      }
    }
    this.isActive = false;
  }

  // Execute a specific command (for automation)
  executeCommand(command) {
    return new Promise((resolve, reject) => {
      if (!this.isActive) {
        this.start();
        
        // Wait for terminal to be ready
        setTimeout(() => {
          this.write(command + '\n');
        }, 1000);
      } else {
        this.write(command + '\n');
      }

      // Set timeout for command execution
      const timeout = setTimeout(() => {
        reject(new Error('Command execution timeout'));
      }, 30000);

      // Listen for command completion (simplified)
      const outputHandler = (data) => {
        if (data.data.includes('$') || data.data.includes('>')) {
          clearTimeout(timeout);
          this.socket.off('terminal-output', outputHandler);
          resolve(data.data);
        }
      };

      this.socket.on('terminal-output', outputHandler);
    });
  }

  // Quick authentication helper
  async authenticateCloudflared() {
    try {
      this.socket.emit('terminal-output', { 
        data: '\n🔐 Starting Cloudflared authentication...\n' 
      });
      
      await this.executeCommand('cloudflared tunnel login');
      
      this.socket.emit('terminal-output', { 
        data: '\n✅ Authentication process started. Follow the URL above to complete authentication.\n' 
      });
      
    } catch (error) {
      this.socket.emit('terminal-error', { 
        error: 'Failed to start authentication: ' + error.message 
      });
    }
  }
}

module.exports = WebTerminal;
