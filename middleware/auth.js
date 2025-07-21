const session = require('express-session');
const crypto = require('crypto');

/**
 * Authentication middleware for Cloudflare Tunnel Admin Panel
 * Uses environment variables for credentials and session management
 */

// Generate a secure session secret if not provided
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');

// Get credentials from environment variables
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Session configuration
const sessionConfig = {
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

/**
 * Initialize session middleware
 */
function initializeSession() {
  console.log('🔐 Initializing authentication system...');
  console.log(`👤 Admin username: ${ADMIN_USERNAME}`);
  console.log(`🔑 Password configured: ${ADMIN_PASSWORD ? 'Yes' : 'No'}`);
  
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    console.warn('⚠️  WARNING: Using default credentials! Set ADMIN_USERNAME and ADMIN_PASSWORD environment variables.');
  }
  
  return session(sessionConfig);
}

/**
 * Check if user is authenticated
 */
function isAuthenticated(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  
  // For API requests, return JSON error
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required',
      redirectTo: '/login'
    });
  }
  
  // For regular requests, redirect to login
  res.redirect('/login');
}

/**
 * Authenticate user with credentials
 */
function authenticateUser(username, password) {
  // Simple credential check (you could enhance this with hashing)
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

/**
 * Login handler
 */
function handleLogin(req, res) {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required'
    });
  }
  
  if (authenticateUser(username, password)) {
    req.session.authenticated = true;
    req.session.username = username;
    req.session.loginTime = new Date().toISOString();
    
    console.log(`✅ User authenticated: ${username} at ${req.session.loginTime}`);
    
    res.json({
      success: true,
      message: 'Authentication successful',
      redirectTo: '/'
    });
  } else {
    console.log(`❌ Failed login attempt for username: ${username}`);
    
    res.status(401).json({
      success: false,
      error: 'Invalid username or password'
    });
  }
}

/**
 * Logout handler
 */
function handleLogout(req, res) {
  const username = req.session?.username || 'unknown';
  
  req.session.destroy((err) => {
    if (err) {
      console.error('❌ Error destroying session:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to logout'
      });
    }
    
    console.log(`👋 User logged out: ${username}`);
    
    // Clear the session cookie
    res.clearCookie('connect.sid');
    
    // For API requests
    if (req.path.startsWith('/api/')) {
      return res.json({
        success: true,
        message: 'Logged out successfully',
        redirectTo: '/login'
      });
    }
    
    // For regular requests
    res.redirect('/login');
  });
}

/**
 * Get current session info
 */
function getSessionInfo(req) {
  if (req.session && req.session.authenticated) {
    return {
      authenticated: true,
      username: req.session.username,
      loginTime: req.session.loginTime
    };
  }
  
  return {
    authenticated: false
  };
}

/**
 * Middleware to add session info to all views
 */
function addSessionToViews(req, res, next) {
  res.locals.session = getSessionInfo(req);
  next();
}

/**
 * Check if login page should be accessible
 */
function loginPageAccess(req, res, next) {
  // If already authenticated, redirect to dashboard
  if (req.session && req.session.authenticated) {
    return res.redirect('/');
  }
  next();
}

module.exports = {
  initializeSession,
  isAuthenticated,
  authenticateUser,
  handleLogin,
  handleLogout,
  getSessionInfo,
  addSessionToViews,
  loginPageAccess,
  ADMIN_USERNAME,
  ADMIN_PASSWORD
};
