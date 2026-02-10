// Live Alerts and Incident Detail JavaScript Module

// Global variables (add to existing globals)
let currentLiveFilter = 'all';
let currentIncidentId = null;
let myResponses = new Map();

// Load saved responses from localStorage on init
function loadSavedResponses() {
    const saved = localStorage.getItem('rubisos_responses');
    if (saved) {
        myResponses = new Map(JSON.parse(saved));
    }
}

// Load ALL active alerts (not filtered by location)
async function loadLiveAlerts() {
    showToast('Loading alerts...', '');
    
    try {
        // Get ALL alerts from the system
        const response = await fetch(`${API_URL}/api/alerts/all-active`);
        const data = await response.json();
        
        activeLiveAlerts = data.alerts || [];
        
        // Update counts
        const activeCount = activeLiveAlerts.filter(a => a.status === 'active').length;
        document.getElementById('liveActiveCount').textContent = activeCount;
        document.getElementById('liveTotalCount').textContent = activeLiveAlerts.length;
        
        // Update badge
        if (activeCount > 0) {
            updateBadge('liveAlertBadge');
        }
        
        renderLiveAlerts();
    } catch (error) {
        console.error('Failed to load live alerts:', error);
        document.getElementById('liveAlertsList').innerHTML = `
            <div class="stat-card" style="text-align: center; padding: 40px;">
                <p style="color: #ff4444;">Failed to load alerts</p>
                <button class="btn btn-secondary" onclick="loadLiveAlerts()" style="margin-top: 10px;">Retry</button>
            </div>
        `;
    }
}

function filterLiveAlerts(filter) {
    currentLiveFilter = filter;
    renderLiveAlerts();
}

function renderLiveAlerts() {
    const container = document.getElementById('liveAlertsList');
    
    let filtered = activeLiveAlerts;
    
    if (currentLiveFilter === 'active') {
        filtered = activeLiveAlerts.filter(a => a.status === 'active');
    } else if (currentLiveFilter === 'my-responses') {
        filtered = activeLiveAlerts.filter(a => myResponses.has(a.alertId));
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="stat-card" style="text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
                <p style="color: #888;">No ${currentLiveFilter === 'my-responses' ? 'responses' : 'alerts'}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(alert => {
        const timeAgo = getTimeAgo(new Date(alert.createdAt));
        const isActive = alert.status === 'active';
        const statusColor = isActive ? '#ff4444' : '#44ff44';
        const typeIcon = { medical: '🏥', fire: '🔥', security: '🛡️', accident: '🚗', other: '🚨' }[alert.type] || '🚨';
        
        const hasResponded = myResponses.has(alert.alertId);
        const myResponse = hasResponded ? myResponses.get(alert.alertId) : null;
        
        return `
            <div class="stat-card" style="margin-bottom: 15px; text-align: left; border-left: 4px solid ${statusColor}; cursor: pointer;"
                 onclick="viewIncidentDetail('${alert.alertId}')">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-weight: 600; font-size: 18px;">${typeIcon} ${alert.type.toUpperCase()}</span>
                    <span style="color: ${statusColor}; font-weight: 600; font-size: 12px;">
                        ${isActive ? '🔴 ACTIVE' : '✅ RESOLVED'}
                    </span>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #888;">From:</span>
                    <span>${alert.senderName}</span>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #888;">When:</span>
                    <span>${timeAgo}</span>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #888;">Location:</span>
                    <span style="text-align: right; max-width: 60%;">${alert.location?.address || 'Unknown'}</span>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span style="color: #888;">Responders:</span>
                    <span style="color: #44ff44;">${alert.responderCount || 0} attending</span>
                </div>
                
                ${hasResponded ? `
                    <div style="padding: 8px 12px; background: ${myResponse === 'attending' ? '#44ff4422' : '#ff444422'}; 
                                border-radius: 8px; margin-top: 10px;">
                        <span style="color: ${myResponse === 'attending' ? '#44ff44' : '#ff4444'}; font-weight: 600;">
                            ${myResponse === 'attending' ? '✅ You are attending' : '❌ You declined'}
                        </span>
                    </div>
                ` : ''}
                
                <p style="color: #888; font-size: 12px; margin-top: 10px; text-align: center;">
                    Tap to view details and respond →
                </p>
            </div>
        `;
    }).join('');
}

function viewIncidentDetail(alertId) {
    const alert = activeLiveAlerts.find(a => a.alertId === alertId);
    if (!alert) {
        showToast('Alert not found', 'error');
        return;
    }
    
    currentIncidentId = alertId;
    
    document.getElementById('incidentDetailType').textContent = `${alert.type.toUpperCase()} EMERGENCY`;
    
    const timeAgo = getTimeAgo(new Date(alert.createdAt));
    const typeIcon = { medical: '🏥', fire: '🔥', security: '🛡️', accident: '🚗', other: '🚨' }[alert.type] || '🚨';
    
    document.getElementById('incidentDetailContent').innerHTML = `
        <div class="stat-card" style="background: #ff444422; border: 2px solid #ff4444; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                <span style="font-size: 48px;">${typeIcon}</span>
                <div>
                    <div style="font-size: 24px; font-weight: 700; color: #ff4444;">${alert.type.toUpperCase()}</div>
                    <div style="color: #ff6666;">${alert.status === 'active' ? '🔴 ACTIVE EMERGENCY' : '✅ RESOLVED'}</div>
                </div>
            </div>
        </div>
        
        <div class="stat-card" style="margin-bottom: 15px;">
            <h3 style="margin-bottom: 15px; color: #888; font-size: 14px;">INCIDENT DETAILS</h3>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #333;">
                <span style="color: #888;">Sender:</span>
                <span style="font-weight: 600;">${alert.senderName}</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #333;">
                <span style="color: #888;">Phone:</span>
                <span>${alert.senderPhone}</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #333;">
                <span style="color: #888;">Time:</span>
                <span>${timeAgo}</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #333;">
                <span style="color: #888;">Location:</span>
                <span style="text-align: right; max-width: 60%;">${alert.location?.address || 'Unknown address'}</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span style="color: #888;">Responders:</span>
                <span style="color: #44ff44; font-weight: 600;">${alert.responderCount || 0} people responding</span>
            </div>
        </div>
        
        ${alert.description ? `
            <div class="stat-card" style="margin-bottom: 15px;">
                <h3 style="margin-bottom: 10px; color: #888; font-size: 14px;">DESCRIPTION</h3>
                <p style="color: #ccc; line-height: 1.5;">${alert.description}</p>
            </div>
        ` : ''}
        
        <div class="stat-card">
            <h3 style="margin-bottom: 10px; color: #888; font-size: 14px;">NAVIGATION</h3>
            <p style="color: #ccc; margin-bottom: 15px;">${alert.location?.address || 'Address not available'}</p>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                <a href="https://waze.com/ul?ll=${alert.location?.lat},${alert.location?.lng}&navigate=yes" 
                   target="_blank" class="btn btn-secondary" style="text-decoration: none; text-align: center; font-size: 14px; padding: 12px;">🗺️ Waze</a>
                <a href="https://www.google.com/maps/dir/?api=1&destination=${alert.location?.lat},${alert.location?.lng}" 
                   target="_blank" class="btn btn-secondary" style="text-decoration: none; text-align: center; font-size: 14px; padding: 12px;">🌐 Google</a>
                <a href="http://maps.apple.com/?daddr=${alert.location?.lat},${alert.location?.lng}&dirflg=d" 
                   target="_blank" class="btn btn-secondary" style="text-decoration: none; text-align: center; font-size: 14px; padding: 12px;">🍎 Apple</a>
            </div>
        </div>
    `;
    
    const hasResponded = myResponses.has(alertId);
    if (hasResponded) {
        const response = myResponses.get(alertId);
        if (response === 'attending') {
            document.getElementById('incidentResponseButtons').style.display = 'none';
            document.getElementById('incidentMyResponse').style.display = 'block';
            document.getElementById('incidentDeclined').style.display = 'none';
            document.getElementById('detailWazeLink').href = `https://waze.com/ul?ll=${alert.location?.lat},${alert.location?.lng}&navigate=yes`;
            document.getElementById('detailGoogleLink').href = `https://www.google.com/maps/dir/?api=1&destination=${alert.location?.lat},${alert.location?.lng}`;
        } else {
            document.getElementById('incidentResponseButtons').style.display = 'none';
            document.getElementById('incidentMyResponse').style.display = 'none';
            document.getElementById('incidentDeclined').style.display = 'block';
        }
    } else {
        document.getElementById('incidentResponseButtons').style.display = 'block';
        document.getElementById('incidentMyResponse').style.display = 'none';
        document.getElementById('incidentDeclined').style.display = 'none';
    }
    
    renderIncidentResponders(alert);
    showScreen('screen-incident-detail');
}

function renderIncidentResponders(alert) {
    const container = document.getElementById('incidentRespondersList');
    
    if (!alert.responders || alert.responders.length === 0) {
        container.innerHTML = '<p style="color: #888; font-size: 14px;">No responders yet. Be the first!</p>';
        return;
    }
    
    container.innerHTML = alert.responders.map(r => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; 
                    background: #1a1a2e; border-radius: 8px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">👤</span>
                <span>${r.name}</span>
            </div>
            <div style="text-align: right;">
                <div style="color: #44ff44; font-size: 12px;">${r.status === 'arrived' ? '📍 Arrived' : 'En route'}</div>
                ${r.eta ? `<div style="color: #888; font-size: 12px;">ETA: ${r.eta} min</div>` : ''}
            </div>
        </div>
    `).join('');
}

function respondToIncident(response) {
    if (!currentIncidentId) return;
    
    const alert = activeLiveAlerts.find(a => a.alertId === currentIncidentId);
    if (!alert) return;
    
    myResponses.set(currentIncidentId, response);
    
    if (response === 'attending') {
        const distance = Math.random() * 5 + 1;
        const eta = Math.round(distance * 3);
        
        if (socket) {
            socket.emit('respond-to-alert', { alertId: currentIncidentId });
        }
        
        document.getElementById('incidentResponseButtons').style.display = 'none';
        document.getElementById('incidentMyResponse').style.display = 'block';
        document.getElementById('incidentDeclined').style.display = 'none';
        document.getElementById('myResponseETA').textContent = `ETA: ${eta} minutes`;
        
        if (!alert.responders) alert.responders = [];
        alert.responders.push({ name: currentUser?.name || 'You', status: 'coming', eta: eta });
        renderIncidentResponders(alert);
        alert.responderCount = (alert.responderCount || 0) + 1;
        renderLiveAlerts();
        
        showToast('You are now attending this incident!', 'success');
        
        addNotification({
            type: 'response',
            title: '✅ You Are Attending',
            message: `You are responding to ${alert.senderName}'s ${alert.type} emergency`,
            data: { alertId: currentIncidentId },
            timestamp: new Date()
        });
    } else {
        document.getElementById('incidentResponseButtons').style.display = 'none';
        document.getElementById('incidentMyResponse').style.display = 'none';
        document.getElementById('incidentDeclined').style.display = 'block';
        showToast('You declined this incident', '');
    }
    
    localStorage.setItem('rubisos_responses', JSON.stringify(Array.from(myResponses.entries())));
}

function changeResponse() {
    document.getElementById('incidentResponseButtons').style.display = 'block';
    document.getElementById('incidentMyResponse').style.display = 'none';
    document.getElementById('incidentDeclined').style.display = 'none';
}

function markArrivedAtIncident() {
    if (!currentIncidentId) return;
    
    const alert = activeLiveAlerts.find(a => a.alertId === currentIncidentId);
    if (!alert) return;
    
    myResponses.set(currentIncidentId, 'arrived');
    document.getElementById('myResponseETA').textContent = '📍 You have arrived!';
    
    const myResponder = alert.responders?.find(r => r.name === (currentUser?.name || 'You'));
    if (myResponder) myResponder.status = 'arrived';
    renderIncidentResponders(alert);
    
    showToast('You have arrived at the incident!', 'success');
    
    if (socket) socket.emit('mark-arrived', { alertId: currentIncidentId });
    localStorage.setItem('rubisos_responses', JSON.stringify(Array.from(myResponses.entries())));
}

// Add to initApp function:
// loadSavedResponses();