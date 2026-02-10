// rubiSOS Client Application
const SERVER_URL = window.location.origin;
let socket = null;
let currentUser = null;
let userLocation = null;
let watchId = null;
let sosTimer = null;
let currentEmergencyType = 'medical';
let currentAlertId = null;
let navigationData = null;

// DOM Elements
const screens = {
    register: document.getElementById('screen-register'),
    main: document.getElementById('screen-main'),
    waiting: document.getElementById('screen-waiting'),
    helpComing: document.getElementById('screen-help-coming'),
    navigation: document.getElementById('screen-navigation')
};

const connectionBar = document.getElementById('connectionBar');
const statusDot = document.getElementById('statusDot');
const connectionText = document.getElementById('connectionText');

// Initialize
window.addEventListener('load', () => {
    console.log('🆘 rubiSOS initializing...');
    initSocket();
    getLocation();
});

// Socket.io connection
function initSocket() {
    socket = io(SERVER_URL);
    
    socket.on('connect', () => {
        console.log('Connected to server');
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus(false);
    });
    
    // Registration confirmation
    socket.on('registered', (data) => {
        console.log('Registered successfully:', data);
        document.getElementById('nearbyBadge').textContent = `${data.nearbyCount} nearby`;
    });
    
    // Alert sent confirmation
    socket.on('alert-sent', (data) => {
        console.log('Alert sent:', data);
        showScreen('waiting');
    });
    
    // Incoming alert (receiver)
    socket.on('incoming-alert', (data) => {
        console.log('Incoming alert:', data);
        showIncomingAlert(data);
    });
    
    // Help is coming (sender)
    socket.on('help-coming', (data) => {
        console.log('Help coming:', data);
        showHelpComing(data);
    });
    
    // Navigation data (responder)
    socket.on('navigation-data', (data) => {
        console.log('Navigation data:', data);
        navigationData = data;
        showNavigation(data);
    });
    
    // Alert cancelled
    socket.on('alert-cancelled', () => {
        alert('Emergency has been cancelled by the sender');
        hideAlertOverlay();
        showScreen('main');
    });
}

// Update connection status UI
function updateConnectionStatus(connected) {
    if (connected) {
        statusDot.classList.add('connected');
        connectionText.textContent = 'Connected';
        connectionBar.style.background = 'rgba(34,197,94,0.2)';
    } else {
        statusDot.classList.remove('connected');
        connectionText.textContent = 'Reconnecting...';
        connectionBar.style.background = 'rgba(239,68,68,0.2)';
    }
}

// Get GPS location
function getLocation() {
    const locStatus = document.getElementById('locationStatus');
    const locText = document.getElementById('locText');
    const registerBtn = document.getElementById('registerBtn');
    
    if (!navigator.geolocation) {
        locStatus.classList.add('error');
        locText.textContent = 'GPS not supported on this device';
        registerBtn.disabled = true;
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            
            locText.textContent = `GPS location acquired (±${Math.round(position.coords.accuracy)}m)`;
            registerBtn.disabled = false;
            
            // Start watching location
            watchLocation();
        },
        (error) => {
            console.error('GPS error:', error);
            locStatus.classList.add('error');
            locText.textContent = 'Could not get GPS location. Please enable location services.';
            registerBtn.disabled = true;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// Watch location continuously
function watchLocation() {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    
    watchId = navigator.geolocation.watchPosition(
        (position) => {
            userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            
            // Send location update to server
            if (socket && socket.connected && currentUser) {
                socket.emit('update-location', { location: userLocation });
            }
        },
        (error) => console.error('Location watch error:', error),
        { enableHighAccuracy: true, maximumAge: 10000 }
    );
}

// Register user
function registerUser() {
    const name = document.getElementById('userName').value.trim();
    const phone = document.getElementById('userPhone').value.trim();
    const bloodType = document.getElementById('bloodType').value;
    
    if (!name) {
        alert('Please enter your name');
        return;
    }
    
    if (!userLocation) {
        alert('Please wait for GPS location');
        return;
    }
    
    currentUser = {
        userId: 'user_' + Date.now(),
        name: name,
        phone: phone,
        bloodType: bloodType,
        location: userLocation
    };
    
    // Update UI
    document.getElementById('displayName').textContent = name;
    document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
    
    // Register with server
    socket.emit('register', currentUser);
    
    // Show main screen
    showScreen('main');
}

// Select emergency type
function selectEmergency(type) {
    currentEmergencyType = type;
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.querySelector(`[data-type="${type}"]`).classList.add('selected');
}

// SOS Button handling
function startSOS(e) {
    if (e && e.preventDefault) e.preventDefault();
    
    const btn = document.getElementById('sosBtn');
    btn.classList.add('holding');
    
    let count = 3;
    btn.innerHTML = `<span class="sos-text">${count}</span><span class="sos-hint">HOLD...</span>`;
    
    sosTimer = setInterval(() => {
        count--;
        if (count > 0) {
            btn.innerHTML = `<span class="sos-text">${count}</span><span class="sos-hint">HOLD...</span>`;
        } else {
            clearInterval(sosTimer);
            sendSOS();
        }
    }, 1000);
}

function endSOS() {
    clearInterval(sosTimer);
    const btn = document.getElementById('sosBtn');
    btn.classList.remove('holding');
    btn.innerHTML = '<span class="sos-text">SOS</span><span class="sos-hint">HOLD 3 SECONDS</span>';
}

// Send SOS alert
function sendSOS() {
    if (!userLocation) {
        alert('GPS location not available');
        return;
    }
    
    // Vibrate
    if (navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 1000]);
    }
    
    // Get address from coordinates (simplified - in production use geocoding API)
    const address = `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`;
    
    socket.emit('send-sos', {
        location: userLocation,
        address: address,
        emergencyType: currentEmergencyType
    });
}

// Show incoming alert (receiver)
function showIncomingAlert(data) {
    currentAlertId = data.alertId;
    
    // Update alert info
    document.getElementById('overlayEmergencyType').textContent = 
        getEmergencyLabel(data.emergencyType);
    document.getElementById('alertSenderName').textContent = data.senderName;
    document.getElementById('alertAddress').textContent = data.address;
    document.getElementById('alertDistance').textContent = `${data.distance} km`;
    document.getElementById('alertETA').textContent = `${data.eta} min`;
    
    // Show overlay
    document.getElementById('alertOverlay').classList.add('active');
    
    // Vibrate
    if (navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 1000, 200, 1000]);
    }
}

// Get emergency type label
function getEmergencyLabel(type) {
    const labels = {
        medical: '🚑 Medical',
        crime: '🦹 Crime',
        fire: '🔥 Fire',
        other: '⚠️ Emergency'
    };
    return labels[type] || '⚠️ Emergency';
}

// Accept alert (responder)
function acceptAlert() {
    if (!currentAlertId) return;
    
    socket.emit('respond-to-alert', {
        alertId: currentAlertId,
        response: 'coming'
    });
    
    document.getElementById('alertOverlay').classList.remove('active');
}

// Decline alert (responder)
function declineAlert() {
    document.getElementById('alertOverlay').classList.remove('active');
}

// Show help coming (sender)
function showHelpComing(data) {
    document.getElementById('responderName').textContent = data.responderName;
    document.getElementById('responderETA').textContent = `${data.eta} min`;
    showScreen('helpComing');
}

// Show navigation screen (responder)
function showNavigation(data) {
    document.getElementById('navETA').textContent = `${data.eta} minutes`;
    showScreen('navigation');
}

// Navigation functions
function openWaze() {
    if (navigationData) {
        window.location.href = navigationData.wazeUrl;
    }
}

function openGoogleMaps() {
    if (navigationData) {
        window.location.href = navigationData.googleMapsUrl;
    }
}

function openAppleMaps() {
    if (navigationData) {
        window.location.href = navigationData.appleMapsUrl;
    }
}

// Call sender
function callSender() {
    // In production, this would use the actual phone number
    alert('Calling: +44 7700 900003');
}

// Cancel alert
function cancelAlert() {
    if (currentAlertId && confirm('Cancel this emergency?')) {
        socket.emit('cancel-alert', { alertId: currentAlertId });
        showScreen('main');
    }
}

// Screen management
function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        if (screen) screen.classList.remove('active');
    });
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    }
}

function hideAlertOverlay() {
    document.getElementById('alertOverlay').classList.remove('active');
}

function backToMain() {
    showScreen('main');
}

function logout() {
    if (confirm('Log out?')) {
        currentUser = null;
        showScreen('register');
    }
}
