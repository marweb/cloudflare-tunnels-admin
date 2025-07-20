const { exec } = require('child_process');
const fs = require('fs-extra');

class DockerManager {
  constructor() {
    this.dockerSocket = '/var/run/docker.sock';
    this.containerMode = process.env.CONTAINER_MODE === 'true';
    this.dockerNetwork = process.env.DOCKER_NETWORK || 'tunnel-network';
  }

  // Check if Docker is available
  async isDockerAvailable() {
    return new Promise((resolve) => {
      exec('docker --version', (error) => {
        resolve(!error);
      });
    });
  }

  // Check if running inside a container
  async isRunningInContainer() {
    try {
      const cgroup = await fs.readFile('/proc/1/cgroup', 'utf8');
      return cgroup.includes('docker') || cgroup.includes('containerd');
    } catch {
      return false;
    }
  }

  // Get container IP by name
  async getContainerIP(containerName) {
    return new Promise((resolve, reject) => {
      const cmd = `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerName}`;
      
      exec(cmd, (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          const ip = stdout.trim();
          resolve(ip || null);
        }
      });
    });
  }

  // Get container IP in specific network
  async getContainerNetworkIP(containerName, networkName = null) {
    const network = networkName || this.dockerNetwork;
    
    return new Promise((resolve, reject) => {
      const cmd = `docker inspect -f '{{.NetworkSettings.Networks.${network}.IPAddress}}' ${containerName}`;
      
      exec(cmd, (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          const ip = stdout.trim();
          resolve(ip || null);
        }
      });
    });
  }

  // List containers with tunnel labels
  async getTunnelEnabledContainers() {
    return new Promise((resolve, reject) => {
      const cmd = `docker ps --filter "label=tunnel.enable=true" --format "table {{.Names}}\\t{{.Ports}}\\t{{.Status}}"`;
      
      exec(cmd, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        const lines = stdout.trim().split('\n');
        const containers = [];

        // Skip header line
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line) {
            const parts = line.split('\t');
            if (parts.length >= 3) {
              containers.push({
                name: parts[0],
                ports: parts[1],
                status: parts[2]
              });
            }
          }
        }

        resolve(containers);
      });
    });
  }

  // Get container labels
  async getContainerLabels(containerName) {
    return new Promise((resolve, reject) => {
      const cmd = `docker inspect -f '{{json .Config.Labels}}' ${containerName}`;
      
      exec(cmd, (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          try {
            const labels = JSON.parse(stdout.trim());
            resolve(labels || {});
          } catch (parseError) {
            reject(parseError);
          }
        }
      });
    });
  }

  // Get tunnel configuration from container labels
  async getTunnelConfigFromContainer(containerName) {
    try {
      const labels = await this.getContainerLabels(containerName);
      const ip = await this.getContainerNetworkIP(containerName);

      if (!labels['tunnel.enable'] || labels['tunnel.enable'] !== 'true') {
        return null;
      }

      const hostname = labels['tunnel.hostname'];
      const port = labels['tunnel.port'] || '80';
      const fallback = labels['tunnel.fallback'] || null;

      if (!hostname || !ip) {
        return null;
      }

      return {
        name: containerName,
        hostname: hostname,
        service: `http://${ip}:${port}`,
        port: port,
        fallback: fallback,
        containerIP: ip,
        labels: labels
      };
    } catch (error) {
      console.error(`Error getting tunnel config for ${containerName}:`, error);
      return null;
    }
  }

  // Get all tunnel configurations from containers
  async getAllTunnelConfigs() {
    try {
      const containers = await this.getTunnelEnabledContainers();
      const configs = [];

      for (const container of containers) {
        const config = await this.getTunnelConfigFromContainer(container.name);
        if (config) {
          configs.push({
            ...config,
            containerStatus: container.status,
            containerPorts: container.ports
          });
        }
      }

      return configs;
    } catch (error) {
      console.error('Error getting tunnel configs:', error);
      return [];
    }
  }

  // Generate service URL for container
  generateContainerServiceURL(containerName, port, protocol = 'http') {
    if (this.containerMode) {
      // In container mode, use container name as hostname (Docker DNS)
      return `${protocol}://${containerName}:${port}`;
    } else {
      // In host mode, try to get container IP
      return this.getContainerNetworkIP(containerName)
        .then(ip => ip ? `${protocol}://${ip}:${port}` : `${protocol}://${containerName}:${port}`)
        .catch(() => `${protocol}://${containerName}:${port}`);
    }
  }

  // Watch for container changes
  watchContainerChanges(callback) {
    if (!this.isDockerAvailable()) {
      console.warn('Docker not available, cannot watch container changes');
      return null;
    }

    const cmd = 'docker events --filter type=container --filter event=start --filter event=stop --filter event=die --format "{{.Actor.Attributes.name}}"';
    
    const process = exec(cmd);
    
    process.stdout.on('data', (data) => {
      const containerName = data.toString().trim();
      if (containerName) {
        callback('container-changed', containerName);
      }
    });

    process.on('error', (error) => {
      console.error('Docker events error:', error);
    });

    return process;
  }
}

module.exports = DockerManager;
