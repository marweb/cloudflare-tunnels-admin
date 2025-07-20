// Cloudflare Tunnel Admin - Frontend JavaScript

// Initialize Socket.io
const socket = io();

// Global variables
let logStreaming = false;
let logLineCount = 0;

// DOM elements
const alertContainer = document.getElementById('alertContainer');
const createTunnelForm = document.getElementById('createTunnelForm');
const loadingModal = new bootstrap.Modal(document.getElementById('loadingModal'));

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    initializeSocketListeners();
    
    // Load containers if on dashboard
    if (window.location.pathname === '/') {
        refreshContainers();
    }
});

// Initialize event listeners
function initializeEventListeners() {
    // Create tunnel form submission
    if (createTunnelForm) {
        createTunnelForm.addEventListener('submit', handleCreateTunnel);
    }

    // Log page specific initialization
    if (window.location.pathname.includes('/logs/')) {
        initializeLogPage();
    }
}

// Initialize Socket.io listeners
function initializeSocketListeners() {
    socket.on('connect', function() {
        console.log('Connected to server');
        updateConnectionStatus('connected');
    });

    socket.on('disconnect', function() {
        console.log('Disconnected from server');
        updateConnectionStatus('disconnected');
    });

    socket.on('log-data', function(data) {
        appendLogLine(data.data);
    });

    socket.on('log-error', function(data) {
        showAlert('danger', 'Log Error: ' + data.error);
    });
}

// Show alert message
function showAlert(type, message, autoHide = true) {
    if (!alertContainer) return;

    const alertId = 'alert-' + Date.now();
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" id="${alertId}" role="alert">
            <i class="bi bi-${getAlertIcon(type)}"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;

    alertContainer.insertAdjacentHTML('beforeend', alertHtml);

    if (autoHide) {
        setTimeout(() => {
            const alert = document.getElementById(alertId);
            if (alert) {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }
        }, 5000);
    }
}

// Get alert icon based on type
function getAlertIcon(type) {
    const icons = {
        'success': 'check-circle',
        'danger': 'exclamation-triangle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// Handle create tunnel form submission
async function handleCreateTunnel(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const data = {
        name: formData.get('name'),
        hostname: formData.get('hostname'),
        port: formData.get('port'),
        fallback: formData.get('fallback') || null,
        autoStart: formData.has('autoStart')
    };

    // Validate required fields
    if (!data.name || !data.hostname || !data.port) {
        showAlert('danger', 'Please fill in all required fields');
        return;
    }

    // Show loading modal
    document.getElementById('loadingText').textContent = 'Creating tunnel...';
    loadingModal.show();

    try {
        const response = await fetch('/api/tunnels', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showAlert('success', result.message);
            // Close modal and reset form
            const modal = bootstrap.Modal.getInstance(document.getElementById('createTunnelModal'));
            modal.hide();
            createTunnelForm.reset();
            // Reload page to show new tunnel
            setTimeout(() => window.location.reload(), 1000);
        } else {
            showAlert('danger', result.error || 'Failed to create tunnel');
        }
    } catch (error) {
        console.error('Error creating tunnel:', error);
        showAlert('danger', 'Failed to create tunnel: ' + error.message);
    } finally {
        loadingModal.hide();
    }
}

// Start tunnel
async function startTunnel(name) {
    document.getElementById('loadingText').textContent = `Starting tunnel ${name}...`;
    loadingModal.show();

    try {
        const response = await fetch(`/api/tunnels/${name}/start`, {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            showAlert('success', result.message);
            setTimeout(() => window.location.reload(), 1000);
        } else {
            showAlert('danger', result.error || 'Failed to start tunnel');
        }
    } catch (error) {
        console.error('Error starting tunnel:', error);
        showAlert('danger', 'Failed to start tunnel: ' + error.message);
    } finally {
        loadingModal.hide();
    }
}

// Stop tunnel
async function stopTunnel(name) {
    document.getElementById('loadingText').textContent = `Stopping tunnel ${name}...`;
    loadingModal.show();

    try {
        const response = await fetch(`/api/tunnels/${name}/stop`, {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            showAlert('success', result.message);
            setTimeout(() => window.location.reload(), 1000);
        } else {
            showAlert('danger', result.error || 'Failed to stop tunnel');
        }
    } catch (error) {
        console.error('Error stopping tunnel:', error);
        showAlert('danger', 'Failed to stop tunnel: ' + error.message);
    } finally {
        loadingModal.hide();
    }
}

// Delete tunnel
async function deleteTunnel(name) {
    if (!confirm(`Are you sure you want to delete tunnel "${name}"? This action cannot be undone.`)) {
        return;
    }

    document.getElementById('loadingText').textContent = `Deleting tunnel ${name}...`;
    loadingModal.show();

    try {
        const response = await fetch(`/api/tunnels/${name}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showAlert('success', result.message);
            setTimeout(() => window.location.reload(), 1000);
        } else {
            showAlert('danger', result.error || 'Failed to delete tunnel');
        }
    } catch (error) {
        console.error('Error deleting tunnel:', error);
        showAlert('danger', 'Failed to delete tunnel: ' + error.message);
    } finally {
        loadingModal.hide();
    }
}

// View logs
function viewLogs(name) {
    window.location.href = `/logs/${name}`;
}

// Install cloudflared
async function installCloudflared() {
    document.getElementById('loadingText').textContent = 'Installing cloudflared...';
    loadingModal.show();

    try {
        const response = await fetch('/api/install-cloudflared', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            showAlert('success', result.message);
            setTimeout(() => window.location.reload(), 2000);
        } else {
            showAlert('danger', result.error || 'Failed to install cloudflared');
        }
    } catch (error) {
        console.error('Error installing cloudflared:', error);
        showAlert('danger', 'Failed to install cloudflared: ' + error.message);
    } finally {
        loadingModal.hide();
    }
}

// Refresh containers
async function refreshContainers() {
    try {
        const response = await fetch('/api/containers');
        const result = await response.json();

        if (result.success) {
            displayContainers(result.containers);
        } else {
            showAlert('warning', result.message || 'Failed to load containers');
        }
    } catch (error) {
        console.error('Error refreshing containers:', error);
        showAlert('danger', 'Failed to refresh containers: ' + error.message);
    }
}

// Display containers in grid
function displayContainers(containers) {
    const containersGrid = document.getElementById('containersGrid');
    if (!containersGrid) return;

    if (!containers || containers.length === 0) {
        containersGrid.innerHTML = `
            <div class="col-12">
                <div class="text-center py-4">
                    <i class="bi bi-box display-4 text-muted"></i>
                    <h5 class="mt-3 text-muted">No Docker Containers Found</h5>
                    <p class="text-muted">No containers with tunnel labels detected.</p>
                    <small class="text-muted">
                        Add labels to your containers:<br>
                        <code>tunnel.enable=true</code><br>
                        <code>tunnel.hostname=your.domain.com</code><br>
                        <code>tunnel.port=80</code>
                    </small>
                </div>
            </div>
        `;
        return;
    }

    const containerCards = containers.map(container => `
        <div class="col-md-6 col-lg-4 mb-4">
            <div class="card border-info">
                <div class="card-header d-flex justify-content-between align-items-center bg-light">
                    <h6 class="card-title mb-0">
                        <i class="bi bi-box"></i>
                        ${container.name}
                    </h6>
                    <span class="badge bg-info">Container</span>
                </div>
                <div class="card-body">
                    <p class="card-text">
                        <small class="text-muted">
                            <i class="bi bi-globe"></i>
                            <strong>Hostname:</strong> ${container.hostname}<br>
                            <i class="bi bi-hdd-network"></i>
                            <strong>Service:</strong> ${container.service}<br>
                            <i class="bi bi-activity"></i>
                            <strong>Status:</strong> ${container.containerStatus}
                        </small>
                    </p>
                    <div class="d-grid">
                        <button type="button" class="btn btn-info btn-sm" 
                                onclick="createTunnelFromContainer('${container.name}')">
                            <i class="bi bi-plus-circle"></i>
                            Create Tunnel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    containersGrid.innerHTML = containerCards;
}

// Create tunnel from container
async function createTunnelFromContainer(containerName) {
    document.getElementById('loadingText').textContent = `Creating tunnel for ${containerName}...`;
    loadingModal.show();

    try {
        const response = await fetch('/api/containers/create-tunnel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ containerName })
        });

        const result = await response.json();

        if (result.success) {
            showAlert('success', result.message);
            setTimeout(() => window.location.reload(), 1000);
        } else {
            showAlert('danger', result.error || 'Failed to create tunnel from container');
        }
    } catch (error) {
        console.error('Error creating tunnel from container:', error);
        showAlert('danger', 'Failed to create tunnel: ' + error.message);
    } finally {
        loadingModal.hide();
    }
}

// Log page specific functions
function initializeLogPage() {
    const toggleButton = document.getElementById('toggleLogs');
    const logTerminal = document.getElementById('logTerminal');
    const autoScrollCheckbox = document.getElementById('autoScroll');

    if (toggleButton) {
        toggleButton.addEventListener('click', toggleLogStream);
    }

    // Initialize connection status
    updateConnectionStatus('disconnected');
}

// Toggle log streaming
function toggleLogStream() {
    const toggleButton = document.getElementById('toggleLogs');
    const buttonIcon = toggleButton.querySelector('i');
    
    if (!logStreaming) {
        // Start streaming
        logStreaming = true;
        toggleButton.innerHTML = '<i class="bi bi-stop-circle"></i> Stop Live Logs';
        toggleButton.classList.remove('btn-outline-primary');
        toggleButton.classList.add('btn-outline-danger');
        
        updateConnectionStatus('connecting');
        socket.emit('start-logs', { tunnelName: window.tunnelName });
        
        // Clear terminal
        const logTerminal = document.getElementById('logTerminal');
        logTerminal.innerHTML = '';
        logLineCount = 0;
        updateLogCount();
        
    } else {
        // Stop streaming
        stopLogStream();
    }
}

// Stop log streaming
function stopLogStream() {
    logStreaming = false;
    const toggleButton = document.getElementById('toggleLogs');
    
    toggleButton.innerHTML = '<i class="bi bi-play-circle"></i> Start Live Logs';
    toggleButton.classList.remove('btn-outline-danger');
    toggleButton.classList.add('btn-outline-primary');
    
    socket.emit('stop-logs');
    updateConnectionStatus('disconnected');
}

// Update connection status
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('connectionStatus');
    const statusText = document.getElementById('statusText');
    
    if (!statusElement || !statusText) return;

    statusElement.style.display = 'block';
    statusElement.className = 'alert';

    switch (status) {
        case 'connected':
            statusElement.classList.add('alert-success');
            statusText.innerHTML = '<i class="bi bi-check-circle status-connected"></i> Connected - Streaming logs';
            break;
        case 'connecting':
            statusElement.classList.add('alert-warning');
            statusText.innerHTML = '<i class="bi bi-arrow-clockwise status-connecting pulse"></i> Connecting...';
            break;
        case 'disconnected':
            statusElement.classList.add('alert-secondary');
            statusText.innerHTML = '<i class="bi bi-x-circle status-disconnected"></i> Disconnected';
            break;
    }
}

// Append log line to terminal
function appendLogLine(data) {
    const logTerminal = document.getElementById('logTerminal');
    if (!logTerminal) return;

    // Create log line element
    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    
    // Detect log level and apply styling
    const line = data.toString();
    if (line.toLowerCase().includes('error')) {
        logLine.classList.add('error');
    } else if (line.toLowerCase().includes('warning') || line.toLowerCase().includes('warn')) {
        logLine.classList.add('warning');
    } else if (line.toLowerCase().includes('info')) {
        logLine.classList.add('info');
    } else if (line.toLowerCase().includes('success')) {
        logLine.classList.add('success');
    }
    
    // Add timestamp
    const timestamp = new Date().toLocaleTimeString();
    logLine.textContent = `[${timestamp}] ${line}`;
    
    logTerminal.appendChild(logLine);
    logLineCount++;
    updateLogCount();
    
    // Auto-scroll if enabled
    const autoScroll = document.getElementById('autoScroll');
    if (autoScroll && autoScroll.checked) {
        logTerminal.scrollTop = logTerminal.scrollHeight;
    }
    
    // Update connection status to connected when we receive data
    updateConnectionStatus('connected');
}

// Clear logs
function clearLogs() {
    const logTerminal = document.getElementById('logTerminal');
    if (logTerminal) {
        logTerminal.innerHTML = '';
        logLineCount = 0;
        updateLogCount();
    }
}

// Update log count display
function updateLogCount() {
    const logCount = document.getElementById('logCount');
    if (logCount) {
        logCount.textContent = `${logLineCount} lines`;
    }
}
