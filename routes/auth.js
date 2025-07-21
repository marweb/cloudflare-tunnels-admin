const express = require('express');
const router = express.Router();
const { 
  handleLogin, 
  handleLogout, 
  getSessionInfo, 
  loginPageAccess 
} = require('../middleware/auth');

/**
 * Authentication Routes for Cloudflare Tunnel Admin Panel
 */

// Login page
router.get('/login', loginPageAccess, (req, res) => {
  res.render('login', { 
    title: 'Login - Cloudflare Tunnel Admin',
    error: null 
  });
});

// Login POST handler
router.post('/login', handleLogin);

// Logout handler (both GET and POST)
router.get('/logout', handleLogout);
router.post('/logout', handleLogout);

// Session info API endpoint
router.get('/session', (req, res) => {
  const sessionInfo = getSessionInfo(req);
  res.json(sessionInfo);
});

// Check authentication status (for AJAX calls)
router.get('/check', (req, res) => {
  const sessionInfo = getSessionInfo(req);
  res.json({
    authenticated: sessionInfo.authenticated,
    username: sessionInfo.username || null
  });
});

module.exports = router;
