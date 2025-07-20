# Docker Deployment Guide

This guide explains how to run the Cloudflare Tunnel Admin Panel using Docker and Docker Compose.

## Quick Start

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd cloudflare-tunnel-admin
   ```

2. **Build and run with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

3. **Access the application**:
   Open your browser and navigate to `http://localhost:3000`

## Docker Configuration

### Dockerfile Features
- Based on Ubuntu 22.04 for full systemd support
- Node.js 18.x LTS installation
- Proper user permissions with sudo access
- Health checks included
- Optimized for production use

### Docker Compose Features
- **Privileged mode**: Required for systemd and service management
- **Host network**: Allows direct access to system services
- **Volume mounts**: 
  - `/etc/cloudflared` - Tunnel configurations
  - `/etc/systemd/system` - Service files
  - `/var/log` - Log access
- **Auto-restart**: Container restarts unless manually stopped
- **Health checks**: Monitors application health

## Environment Variables

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

Available variables:
- `NODE_ENV` - Environment (production/development)
- `PORT` - Application port (default: 3000)
- `SESSION_SECRET` - Session encryption key
- `CLOUDFLARED_PATH` - Path to cloudflared binary
- `CONFIG_DIR` - Configuration directory
- `SYSTEMD_DIR` - SystemD services directory

## Docker Commands

### Build the image
```bash
docker build -t cloudflare-tunnel-admin .
```

### Run with Docker Compose
```bash
# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up --build -d
```

### Run with Docker directly
```bash
docker run -d \
  --name cloudflare-tunnel-admin \
  --privileged \
  --network host \
  -v /etc/cloudflared:/etc/cloudflared:rw \
  -v /etc/systemd/system:/etc/systemd/system:rw \
  -v /var/log:/var/log:rw \
  -p 3000:3000 \
  cloudflare-tunnel-admin
```

## Security Considerations

### Privileged Mode
The container runs in privileged mode because it needs to:
- Install cloudflared system-wide
- Create and manage systemd services
- Access system directories (`/etc/cloudflared`, `/etc/systemd/system`)
- Execute sudo commands for service management

### Volume Mounts
The following host directories are mounted:
- `/etc/cloudflared` - Stores tunnel configurations
- `/etc/systemd/system` - Stores service definitions
- `/var/log` - Access to system logs

### Network Mode
Uses `host` network mode to:
- Allow tunnels to access local services
- Enable proper systemd service management
- Simplify port management

## Troubleshooting

### Common Issues

1. **Permission Denied**:
   ```bash
   # Ensure proper permissions on host
   sudo chown -R 1000:1000 /etc/cloudflared
   sudo chmod 755 /etc/cloudflared
   ```

2. **SystemD Not Available**:
   ```bash
   # Check if systemd is running on host
   systemctl status
   ```

3. **Port Already in Use**:
   ```bash
   # Change port in docker-compose.yml or .env
   PORT=3001
   ```

4. **Container Won't Start**:
   ```bash
   # Check logs
   docker-compose logs cloudflare-tunnel-admin
   
   # Check container status
   docker ps -a
   ```

### Debugging

1. **Access container shell**:
   ```bash
   docker-compose exec cloudflare-tunnel-admin bash
   ```

2. **Check application logs**:
   ```bash
   docker-compose logs -f cloudflare-tunnel-admin
   ```

3. **Monitor system resources**:
   ```bash
   docker stats cloudflare-tunnel-admin
   ```

## Production Deployment

### Using Docker Swarm
```yaml
version: '3.8'
services:
  cloudflare-tunnel-admin:
    image: cloudflare-tunnel-admin:latest
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
    ports:
      - "3000:3000"
    volumes:
      - /etc/cloudflared:/etc/cloudflared:rw
      - /etc/systemd/system:/etc/systemd/system:rw
    networks:
      - tunnel-admin
networks:
  tunnel-admin:
    external: true
```

### Using Kubernetes
A Kubernetes deployment would require:
- Privileged security context
- Host path volumes for system directories
- Service account with appropriate permissions
- ConfigMaps for environment variables

### Reverse Proxy Setup
For production, consider using a reverse proxy:

```nginx
server {
    listen 80;
    server_name tunnel-admin.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Maintenance

### Updates
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose up --build -d
```

### Backup
```bash
# Backup tunnel configurations
sudo tar -czf tunnel-backup-$(date +%Y%m%d).tar.gz /etc/cloudflared/

# Backup service files
sudo tar -czf services-backup-$(date +%Y%m%d).tar.gz /etc/systemd/system/cloudflared-*.service
```

### Monitoring
Consider adding monitoring tools:
- Prometheus for metrics
- Grafana for dashboards
- ELK stack for log analysis
- Uptime monitoring for tunnel health
