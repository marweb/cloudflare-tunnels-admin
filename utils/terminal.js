const { spawn } = require('child_process');
const os = require('os');

class WebTerminal {
  constructor(socket) {
    this.socket = socket;
    this.shell = null;
    this.isActive = false;
    this.commandQueue = [];
  }

  // Start a new shell session
  start() {
    if (this.isActive) {
      this.socket.emit('terminal-error', { error: 'Terminal session already active' });
      return;
    }

    try {
      // Use bash with interactive mode
      this.shell = spawn('/bin/bash', ['-i'], {
        stdio: 'pipe',
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          PS1: '\\[\\033[01;32m\\]cloudflared-admin\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ ',
          HOME: '/root',
          USER: 'root',
          SHELL: '/bin/bash'
        },
        cwd: '/app'
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

      // Send initial welcome and prompt
      setTimeout(() => {
        this.socket.emit('terminal-ready', { 
          message: '\r\n🚀 Cloudflare Tunnel Admin Terminal\r\n' +
                  '📁 Current directory: /app\r\n' +
                  '💡 Type "cloudflared tunnel login" to authenticate\r\n' +
                  '\r\nroot@cloudflared-admin:/app# '
        });
      }, 500);

    } catch (error) {
      this.socket.emit('terminal-error', { error: error.message });
    }
  }

  // Send input to shell
  sendInput(data) {
    if (!this.isActive || !this.shell) {
      this.socket.emit('terminal-error', { error: 'No active terminal session' });
      return;
    }

    try {
      // Handle special keys
      if (data === '\r') {
        // Enter key - add newline and execute command
        this.shell.stdin.write('\n');
      } else if (data === '\u007f' || data === '\b') {
        // Backspace - send backspace sequence
        this.shell.stdin.write('\b');
      } else if (data === '\u0003') {
        // Ctrl+C - send interrupt signal
        this.shell.stdin.write('\u0003');
      } else {
        // Regular character input
        this.shell.stdin.write(data);
      }
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
