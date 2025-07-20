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
      console.log('Starting terminal shell...');
      
      // Use bash without -i flag for better Docker compatibility
      this.shell = spawn('/bin/bash', [], {
        stdio: 'pipe',
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          PS1: 'cloudflared-admin:/app# ',
          HOME: '/root',
          USER: 'root',
          SHELL: '/bin/bash',
          PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
        },
        cwd: '/app'
      });

      this.isActive = true;

      // Handle shell output
      this.shell.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Shell stdout:', JSON.stringify(output));
        this.socket.emit('terminal-output', { data: output });
        
        // If output doesn't end with a prompt, add one
        if (!output.includes('#') && !output.includes('$')) {
          setTimeout(() => {
            this.socket.emit('terminal-output', { data: 'cloudflared-admin:/app# ' });
          }, 100);
        }
      });

      this.shell.stderr.on('data', (data) => {
        const output = data.toString();
        console.log('Shell stderr:', JSON.stringify(output));
        this.socket.emit('terminal-output', { data: output });
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

      // Send initial welcome and prompt immediately
      this.socket.emit('terminal-ready', { 
        message: '\r\n🚀 Cloudflare Tunnel Admin Terminal\r\n' +
                '📁 Current directory: /app\r\n' +
                '💡 Type "cloudflared tunnel login" to authenticate\r\n' +
                '\r\ncloudflared-admin:/app# '
      });
      
      // Also send a newline to the shell to trigger initial prompt
      setTimeout(() => {
        if (this.shell && this.shell.stdin) {
          this.shell.stdin.write('\n');
        }
      }, 100);

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
      console.log('Terminal input received:', JSON.stringify(data));
      
      // Handle special keys
      if (data === '\r') {
        // Enter key - execute command and show new prompt
        this.shell.stdin.write('\n');
        // Echo the enter to terminal
        this.socket.emit('terminal-output', { data: '\r\n' });
      } else if (data === '\u007f' || data === '\b') {
        // Backspace - send backspace sequence
        this.shell.stdin.write('\b');
        this.socket.emit('terminal-output', { data: '\b \b' });
      } else if (data === '\u0003') {
        // Ctrl+C - send interrupt signal
        this.shell.stdin.write('\u0003');
        this.socket.emit('terminal-output', { data: '^C\r\ncloudflared-admin:/app# ' });
      } else {
        // Regular character input - echo to terminal and send to shell
        this.socket.emit('terminal-output', { data: data });
        this.shell.stdin.write(data);
      }
    } catch (error) {
      console.error('Terminal input error:', error);
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
