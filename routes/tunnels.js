const express = require('express');
const router = express.Router();
const TunnelController = require('../controllers/tunnelController');

const tunnelController = new TunnelController();

// Dashboard route
router.get('/', async (req, res) => {
  await tunnelController.getDashboard(req, res);
});

// Logs page route
router.get('/logs/:name', (req, res) => {
  const { name } = req.params;
  res.render('logs', {
    title: `Logs - ${name}`,
    tunnelName: name
  });
});

// Terminal page route
router.get('/terminal', (req, res) => {
  res.render('terminal', {
    title: 'Web Terminal'
  });
});

module.exports = router;
