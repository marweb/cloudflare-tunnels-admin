# Use Ubuntu 22.04 as base image for better systemd support
FROM ubuntu:22.04

# Set environment variables
ENV NODE_VERSION=18.17.1
ENV DEBIAN_FRONTEND=noninteractive
ENV PORT=3033

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    sudo \
    systemd \
    systemd-sysv \
    ca-certificates \
    gnupg \
    lsb-release \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Explicitly copy public directory first
COPY public/ ./public/

# Copy rest of application code
COPY . .

# Debug: Check what was copied
RUN echo "=== Checking copied files ===" && ls -la /app/

# Ensure public directory exists and has correct permissions
RUN if [ -d "/app/public" ]; then \
        echo "Public directory found, setting permissions..." && \
        chmod -R 755 /app/public/ && \
        ls -la /app/public/; \
    else \
        echo "Public directory not found, creating it..." && \
        mkdir -p /app/public/css /app/public/js && \
        echo "Created empty public directory structure"; \
    fi

# Make startup script executable
RUN chmod +x docker-start.sh

# Create necessary directories with proper permissions
RUN mkdir -p /etc/cloudflared \
    && mkdir -p /etc/systemd/system \
    && mkdir -p /var/log/cloudflared \
    && chmod 755 /etc/cloudflared \
    && chmod 755 /etc/systemd/system

# Create a non-root user for the app but with sudo privileges
RUN useradd -m -s /bin/bash appuser \
    && usermod -aG sudo appuser \
    && echo 'appuser ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Change ownership of app directory
RUN chown -R appuser:appuser /app

# Switch to app user
USER appuser

# Expose port
EXPOSE 3033

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3033/ || exit 1

# Start the application using the startup script
CMD ["./docker-start.sh"]
