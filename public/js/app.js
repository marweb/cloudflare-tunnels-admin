// Cloudflare Tunnel Admin - Frontend JavaScript

// Initialize Socket.io
const socket = io();

// Global variables
let logStreaming = false;
let logLineCount = 0;

// DOM elements
const alertContainer = document.getElementById('alertContainer');
const createTunnelForm = document.getElementById('createTunnelForm');

// Initialize Bootstrap Modal only if element exists
let loadingModal = null;
const loadingModalElement = document.getElementById('loadingModal');
if (loadingModalElement) {
    loadingModal = new bootstrap.Modal(loadingModalElement);
}

// Helper functions for safe modal operations
function showLoadingModal(text) {
    const loadingText = document.getElementById('loadingText');
    if (loadingText && text) {
        loadingText.textContent = text;
    }
    if (loadingModal) {
        loadingModal.show();
    }
}

function hideLoadingModal() {
    if (loadingModal) {
        loadingModal.hide();
    }
}

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
    showLoadingModal('Creating tunnel...');

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
            const createTunnelModalElement = document.getElementById('createTunnelModal');
            if (createTunnelModalElement) {
                const modal = bootstrap.Modal.getInstance(createTunnelModalElement);
                if (modal) {
                    modal.hide();
                }
            }
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
        hideLoadingModal();
    }
}

// Start tunnel
async function startTunnel(name) {
    showLoadingModal(`Starting tunnel ${name}...`);

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
        hideLoadingModal();
    }
}

// Stop tunnel
async function stopTunnel(name) {
    const loadingText = document.getElementById('loadingText');
    if (loadingText) {
        loadingText.textContent = `Stopping tunnel ${name}...`;
    }
    if (loadingModal) {
        loadingModal.show();
    }

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

// Toggle auto-start for tunnel
async function toggleAutoStart(name, enabled) {
    try {
        console.log(`🔄 Toggling auto-start for ${name}: ${enabled}`);
        
        const response = await fetch(`/api/tunnels/${name}/autostart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enabled: enabled })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('success', result.message);
            console.log(`✅ Auto-start ${enabled ? 'enabled' : 'disabled'} for ${name}`);
        } else {
            // Revert the toggle if the request failed
            const toggle = document.getElementById(`autoStart-${name}`);
            if (toggle) {
                toggle.checked = !enabled;
            }
            showAlert('danger', result.error || 'Failed to toggle auto-start');
        }
    } catch (error) {
        console.error('Toggle auto-start error:', error);
        
        // Revert the toggle if there was an error
        const toggle = document.getElementById(`autoStart-${name}`);
        if (toggle) {
            toggle.checked = !enabled;
        }
        showAlert('danger', 'Error toggling auto-start: ' + error.message);
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



// Log page specific functions
let logUpdateInterval = null;

function initializeLogPage() {
    const toggleButton = document.getElementById('toggleLogs');
    
    if (toggleButton) {
        toggleButton.addEventListener('click', toggleLogStream);
    }

    // Initialize connection status
    updateConnectionStatus('disconnected');
}

// Toggle log streaming
function toggleLogStream() {
    const toggleButton = document.getElementById('toggleLogs');
    
    if (!logStreaming) {
        // Start streaming
        logStreaming = true;
        toggleButton.innerHTML = '<i class="bi bi-stop-circle"></i> Stop Live Logs';
        toggleButton.classList.remove('btn-outline-primary');
        toggleButton.classList.add('btn-outline-danger');
        
        updateConnectionStatus('connecting');
        startLogPolling();
        
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
    
    if (logUpdateInterval) {
        clearInterval(logUpdateInterval);
        logUpdateInterval = null;
    }
    
    updateConnectionStatus('disconnected');
}

// Start polling log file for updates
function startLogPolling() {
    // Clear existing logs
    const logDisplay = document.getElementById('logDisplay');
    if (logDisplay) {
        logDisplay.value = '';
        logLineCount = 0;
        updateLogCount();
    }
    
    // Initial load
    loadLogContent();
    
    // Poll every 2 seconds for updates
    logUpdateInterval = setInterval(loadLogContent, 2000);
}

// Load log content from server
async function loadLogContent() {
    try {
        const response = await fetch(`/api/tunnels/${window.tunnelName}/logs`);
        const result = await response.json();
        
        if (result.success) {
            const logDisplay = document.getElementById('logDisplay');
            if (logDisplay && result.logs) {
                // Update textarea content
                logDisplay.value = result.logs;
                
                // Count lines
                logLineCount = result.logs.split('\n').filter(line => line.trim()).length;
                updateLogCount();
                
                // Auto-scroll to bottom if enabled
                const autoScroll = document.getElementById('autoScroll');
                if (autoScroll && autoScroll.checked) {
                    logDisplay.scrollTop = logDisplay.scrollHeight;
                }
                
                // Update last update time
                updateLastUpdateTime();
                
                // Update connection status
                updateConnectionStatus('connected');
            }
        } else {
            console.warn('Failed to load logs:', result.error);
            updateConnectionStatus('disconnected');
        }
    } catch (error) {
        console.error('Error loading logs:', error);
        updateConnectionStatus('disconnected');
    }
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
            statusText.innerHTML = '<i class="bi bi-check-circle"></i> Connected - Live logs active';
            break;
        case 'connecting':
            statusElement.classList.add('alert-warning');
            statusText.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Loading logs...';
            break;
        case 'disconnected':
            statusElement.classList.add('alert-secondary');
            statusText.innerHTML = '<i class="bi bi-x-circle"></i> Disconnected';
            break;
    }
}

// Update last update time
function updateLastUpdateTime() {
    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate) {
        const now = new Date();
        lastUpdate.textContent = `Updated: ${now.toLocaleTimeString()}`;
    }
}

// Clear logs
function clearLogs() {
    const logDisplay = document.getElementById('logDisplay');
    if (logDisplay) {
        logDisplay.value = '';
        logLineCount = 0;
        updateLogCount();
        
        // Update last update time
        updateLastUpdateTime();
    }
}

// Update log count display
function updateLogCount() {
    const logCount = document.getElementById('logCount');
    if (logCount) {
        logCount.textContent = `${logLineCount} lines`;
    }
}
