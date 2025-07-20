# Cloudflare Tunnel Admin Panel

A complete web-based administration panel for managing Cloudflare tunnels (`cloudflared`) on Ubuntu Linux systems. Built with Node.js, Express, EJS, Bootstrap 5, and vanilla JavaScript.

## Features

### Backend Capabilities
- **Auto-detection and Installation**: Automatically detects if `cloudflared` is installed and installs it from GitHub if needed
- **Tunnel Management**: Create, start, stop, and delete Cloudflare tunnels
- **Configuration Management**: Generates and manages `config.yml` files for each tunnel
- **SystemD Integration**: Creates and manages systemd services for tunnel lifecycle management
- **Real-time Logs**: Stream tunnel logs in real-time using WebSockets (Socket.io)
- **Security**: Input validation and protection against arbitrary command execution

### Frontend Features
- **Responsive Design**: Mobile-first responsive interface using Bootstrap 5
- **Dashboard**: Clean dashboard showing all tunnels with status indicators
- **Tunnel Creation**: Modal form for creating new tunnels with validation
- **Live Logs**: Terminal-style log viewer with real-time streaming
- **Status Management**: Start, stop, and delete tunnels with visual feedback
- **Modern UI**: Clean, professional interface with Bootstrap components

## Project Structure

```
cloudflare-tunnel-admin/
├── app.js                 # Main Express server
├── package.json           # Dependencies and scripts
├── README.md             # This file
├── controllers/          # Business logic
│   └── tunnelController.js
├── routes/               # Express routes
│   ├── api.js           # API endpoints
│   └── tunnels.js       # Web routes
├── utils/                # Utility modules
│   ├── cloudflared.js   # Cloudflared management
│   ├── config.js        # Configuration file management
│   └── systemd.js       # SystemD service management
├── views/                # EJS templates
│   ├── dashboard.ejs    # Main dashboard
│   ├── logs.ejs         # Log viewer page
│   ├── 404.ejs          # Error page
│   └── partials/        # Reusable components
│       ├── header.ejs
│       └── footer.ejs
└── public/               # Static assets
    ├── css/
    │   └── style.css    # Custom styles
    └── js/
        └── app.js       # Frontend JavaScript
```

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd cloudflare-tunnel-admin
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the application**:
   ```bash
   # Production
   npm start
   
   # Development (with auto-reload)
   npm run dev
   ```

4. **Access the panel**:
   Open your browser and navigate to `http://localhost:3000`

## Requirements

- **Operating System**: Ubuntu Linux (tested on Ubuntu 18.04+)
- **Node.js**: Version 14 or higher
- **System Permissions**: The application requires `sudo` access to:
  - Install cloudflared binary to `/usr/local/bin/`
  - Create configuration files in `/etc/cloudflared/`
  - Create systemd service files in `/etc/systemd/system/`
  - Manage systemd services

## Usage

### First Time Setup
1. Access the web panel at `http://localhost:3000`
2. If cloudflared is not installed, click "Install Cloudflared" button
3. Wait for the installation to complete

### Creating a Tunnel
1. Click "Create Tunnel" button on the dashboard
2. Fill in the required information:
   - **Tunnel Name**: Unique identifier (letters, numbers, hyphens, underscores only)
   - **Hostname**: The domain that will point to your tunnel (e.g., `app.yourdomain.com`)
   - **Local Port**: The port your local service is running on (e.g., `8080`)
   - **Fallback Service** (optional): Alternative service when main service is unavailable
   - **Auto Start**: Check to automatically start the tunnel after creation
3. Click "Create Tunnel"

### Managing Tunnels
- **Start**: Click the "Start" button to activate a tunnel
- **Stop**: Click the "Stop" button to deactivate a tunnel
- **View Logs**: Click "Logs" to view real-time tunnel logs
- **Delete**: Click "Delete" to permanently remove a tunnel (requires confirmation)

### Viewing Logs
1. Click the "Logs" button for any tunnel
2. Click "Start Live Logs" to begin streaming real-time logs
3. Use "Clear" to clear the log display
4. Toggle "Auto-scroll to bottom" to control scroll behavior

## Configuration Files

The application automatically creates and manages:

- **Tunnel configs**: `/etc/cloudflared/<tunnel-name>.yml`
- **SystemD services**: `/etc/systemd/system/cloudflared-<tunnel-name>.service`
- **Credentials**: `/etc/cloudflared/<tunnel-name>.json` (created by cloudflared)

## API Endpoints

- `POST /api/tunnels` - Create a new tunnel
- `POST /api/tunnels/:name/start` - Start a tunnel
- `POST /api/tunnels/:name/stop` - Stop a tunnel
- `DELETE /api/tunnels/:name` - Delete a tunnel
- `GET /api/tunnels/:name/status` - Get tunnel status
- `GET /api/tunnels/:name/logs` - Get tunnel logs
- `POST /api/install-cloudflared` - Install cloudflared

## Security Considerations

- Input validation on all user inputs
- Protection against command injection
- Proper file permissions on configuration files
- SystemD service isolation
- No hardcoded credentials or API keys

## Troubleshooting

### Common Issues

1. **Permission Denied**: Ensure the Node.js process has sudo access
2. **Port Already in Use**: Change the PORT environment variable
3. **Cloudflared Not Found**: Use the "Install Cloudflared" button or install manually
4. **Service Won't Start**: Check logs for configuration errors

### Logs Location
- Application logs: Console output
- Tunnel logs: `journalctl -u cloudflared-<tunnel-name>`
- SystemD logs: `journalctl -u cloudflared-<tunnel-name>`

## Development

### Running in Development Mode
```bash
npm run dev
```

### Project Dependencies
- **express**: Web framework
- **ejs**: Template engine
- **socket.io**: Real-time communication
- **yaml**: YAML file handling
- **fs-extra**: Enhanced file system operations
- **axios**: HTTP client for downloads
- **tar**: Archive extraction

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on Ubuntu Linux
5. Submit a pull request

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the logs for error messages
3. Ensure all system requirements are met
4. Verify sudo permissions are available
