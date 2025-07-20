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

// Get Docker containers with tunnel labels
router.get('/containers', async (req, res) => {
  await tunnelController.getContainerTunnels(req, res);
});

// Create tunnel from container
router.post('/containers/create-tunnel', async (req, res) => {
  await tunnelController.createTunnelFromContainer(req, res);
});

// WebSocket handling for real-time logs
router.use((req, res, next) => {
  if (req.io) {
    req.io.on('connection', (socket) => {
      socket.on('start-logs', (data) => {
        const { tunnelName } = data;
        if (tunnelName) {
          tunnelController.streamTunnelLogs(socket, tunnelName);
        }
      });
    });
  }
  next();
});

module.exports = router;
