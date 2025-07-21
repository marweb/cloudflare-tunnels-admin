const express = require('express');
const router = express.Router();
const TunnelController = require('../controllers/tunnelController');

const tunnelController = new TunnelController();

// Create tunnel
router.post('/tunnels', async (req, res) => {
  await tunnelController.createTunnel(req, res);
});

// Start tunnel
router.post('/tunnels/:name/start', async (req, res) => {
  await tunnelController.startTunnel(req, res);
});

// Stop tunnel
router.post('/tunnels/:name/stop', async (req, res) => {
  await tunnelController.stopTunnel(req, res);
});

// Delete tunnel
router.delete('/tunnels/:name', async (req, res) => {
  await tunnelController.deleteTunnel(req, res);
});

// Toggle auto-start for tunnel
router.post('/tunnels/:name/autostart', async (req, res) => {
  await tunnelController.toggleAutoStart(req, res);
});

// Get tunnel status
router.get('/tunnels/:name/status', async (req, res) => {
  await tunnelController.getTunnelStatus(req, res);
});

// Get tunnel logs
router.get('/tunnels/:name/logs', async (req, res) => {
  await tunnelController.getTunnelLogs(req, res);
});

// Install cloudflared
router.post('/install-cloudflared', async (req, res) => {
  await tunnelController.installCloudflared(req, res);
});

// Execute terminal command
router.post('/terminal/execute', async (req, res) => {
  await tunnelController.executeTerminalCommand(req, res);
});

// WebSocket handling for real-time logs and terminal
router.use((req, res, next) => {
  if (req.io) {
    req.io.on('connection', (socket) => {
      // Existing log streaming
      socket.on('start-logs', (data) => {
        const { tunnelName } = data;
        if (tunnelName) {
          tunnelController.streamTunnelLogs(socket, tunnelName);
        }
      });

      // Terminal WebSocket handling
      const WebTerminal = require('../utils/terminal');
      let terminal = null;

      socket.on('terminal-start', () => {
        if (terminal) {
          terminal.kill();
        }
        terminal = new WebTerminal(socket);
        terminal.start();
      });

      socket.on('terminal-input', (data) => {
        if (terminal) {
          terminal.sendInput(data.input);
        }
      });

      socket.on('terminal-resize', (data) => {
        if (terminal) {
          terminal.resize(data.cols, data.rows);
        }
      });

      socket.on('terminal-auth', () => {
        if (terminal) {
          terminal.authenticateCloudflared();
        }
      });

      socket.on('terminal-kill', () => {
        if (terminal) {
          terminal.kill();
          terminal = null;
        }
      });

      socket.on('disconnect', () => {
        if (terminal) {
          terminal.kill();
          terminal = null;
        }
      });
    });
  }
  next();
});

module.exports = router;
