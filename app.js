const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');

// Import authentication middleware
const { 
  initializeSession, 
  isAuthenticated, 
  addSessionToViews 
} = require('./middleware/auth');

// Import routes
const tunnelRoutes = require('./routes/tunnels');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize session middleware for authentication
app.use(initializeSession());

// Add session info to all views
app.use(addSessionToViews);

// Debug middleware for static files
app.use((req, res, next) => {
  if (req.url.startsWith('/css/') || req.url.startsWith('/js/')) {
    console.log(`Static file request: ${req.url}`);
    console.log(`Looking in: ${path.join(__dirname, 'public')}`);
    console.log(`Full path: ${path.join(__dirname, 'public', req.url)}`);
    console.log(`File exists: ${fs.existsSync(path.join(__dirname, 'public', req.url))}`);
  }
  next();
});

// Static files middleware
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Explicit static file routes as fallback
app.get('/css/:file', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'css', req.params.file);
  console.log(`Explicit CSS route: ${filePath}`);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('CSS file not found');
  }
});

app.get('/js/:file', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'js', req.params.file);
  console.log(`Explicit JS route: ${filePath}`);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('JS file not found');
  }
});

// Authentication routes (public)
app.use('/auth', authRoutes);

// Protected routes (require authentication)
app.use('/', isAuthenticated, tunnelRoutes);
app.use('/api', isAuthenticated, apiRoutes);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

const PORT = process.env.PORT || 3033;
server.listen(PORT, () => {
  console.log(`Cloudflare Tunnel Admin Panel running on port ${PORT}`);
  console.log(`Access the panel at: http://localhost:${PORT}`);
});

module.exports = { app, io };
