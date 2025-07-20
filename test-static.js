// Quick test script to verify static files are accessible
const express = require('express');
const path = require('path');
const fs = require('fs-extra');

const app = express();

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Static files middleware
app.use(express.static(path.join(__dirname, 'public')));

// Test route to check file system
app.get('/test-files', (req, res) => {
  const publicDir = path.join(__dirname, 'public');
  const cssDir = path.join(publicDir, 'css');
  const jsDir = path.join(publicDir, 'js');
  
  const result = {
    publicExists: fs.existsSync(publicDir),
    cssExists: fs.existsSync(cssDir),
    jsExists: fs.existsSync(jsDir),
    publicContents: fs.existsSync(publicDir) ? fs.readdirSync(publicDir) : [],
    cssContents: fs.existsSync(cssDir) ? fs.readdirSync(cssDir) : [],
    jsContents: fs.existsSync(jsDir) ? fs.readdirSync(jsDir) : [],
    workingDirectory: process.cwd(),
    __dirname: __dirname
  };
  
  res.json(result);
});

// Simple HTML test page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Static Files Test</title>
      <link rel="stylesheet" href="/css/style.css">
    </head>
    <body>
      <h1>Static Files Test</h1>
      <p>If this page loads with styling, CSS is working.</p>
      <button onclick="testJS()">Test JavaScript</button>
      <div id="js-test"></div>
      
      <h2>File System Info</h2>
      <div id="file-info"></div>
      
      <script src="/js/app.js"></script>
      <script>
        function testJS() {
          document.getElementById('js-test').innerHTML = '<p style="color: green;">JavaScript is working!</p>';
        }
        
        // Load file system info
        fetch('/test-files')
          .then(r => r.json())
          .then(data => {
            document.getElementById('file-info').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
          })
          .catch(err => {
            document.getElementById('file-info').innerHTML = '<p style="color: red;">Error: ' + err.message + '</p>';
          });
      </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3033;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to test static files`);
  console.log(`Visit http://localhost:${PORT}/test-files for file system info`);
});
