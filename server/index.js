const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// In-memory storage (replace with MongoDB in production)
const users = new Map();
const activeAlerts = new Map();

// Haversine formula for real distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Calculate ETA based on distance
function calculateETA(distanceKm) {
    const avgSpeedKmh = 15; // Average urban speed
    const minutes = Math.round((distanceKm / avgSpeedKmh) * 60);
    return Math.max(2, minutes); // Minimum 2 minutes
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User registration with GPS
    socket.on('register', (data) => {
        const { userId, name, phone, location } = data;
        users.set(userId, {
            socketId: socket.id,
            userId,
            name,
            phone,
            location,
            status: 'online'
        });
        socket.userId = userId;
        console.log(`User registered: ${name} at ${location.lat}, ${location.lng}`);
        
        // Send nearby helpers count
        const nearbyCount = getNearbyHelpers(location).length;
        socket.emit('registered', { nearbyCount });
    });

    // Update location in real-time
    socket.on('update-location', (data) => {
        const user = users.get(socket.userId);
        if (user) {
            user.location = data.location;
            console.log(`Location updated for ${user.name}: ${data.location.lat}, ${data.location.lng}`);
        }
    });

    // Send SOS alert
    socket.on('send-sos', (data) => {
        const sender = users.get(socket.userId);
        if (!sender) return;

        const alertId = Date.now().toString();
        const alert = {
            id: alertId,
            senderId: socket.userId,
            senderName: sender.name,
            senderPhone: sender.phone,
            location: data.location,
            emergencyType: data.emergencyType,
            timestamp: new Date(),
            status: 'active',
            responders: []
        };

        activeAlerts.set(alertId, alert);

        // Find nearby helpers within 10km
        const nearbyHelpers = getNearbyHelpers(data.location, 10);
        
        console.log(`SOS from ${sender.name}! Notifying ${nearbyHelpers.length} nearby helpers`);

        // Send alert to nearby helpers
        nearbyHelpers.forEach(helper => {
            const distance = calculateDistance(
                data.location.lat, data.location.lng,
                helper.location.lat, helper.location.lng
            );
            const eta = calculateETA(distance);

            io.to(helper.socketId).emit('incoming-alert', {
                alertId,
                senderName: sender.name,
                senderPhone: sender.phone,
                location: data.location,
                address: data.address || 'Unknown location',
                distance: distance.toFixed(1),
                eta: eta,
                emergencyType: data.emergencyType,
                timestamp: alert.timestamp
            });
        });

        socket.emit('alert-sent', {
            alertId,
            helpersNotified: nearbyHelpers.length
        });
    });

    // Responder accepts alert
    socket.on('respond-to-alert', (data) => {
        const responder = users.get(socket.userId);
        const alert = activeAlerts.get(data.alertId);
        
        if (!alert || !responder) return;

        // Calculate real-time distance and ETA
        const distance = calculateDistance(
            responder.location.lat, responder.location.lng,
            alert.location.lat, alert.location.lng
        );
        const eta = calculateETA(distance);

        alert.responders.push({
            userId: socket.userId,
            name: responder.name,
            eta: eta,
            timestamp: new Date()
        });

        // Notify sender that help is coming
        const sender = users.get(alert.senderId);
        if (sender) {
            io.to(sender.socketId).emit('help-coming', {
                responderName: responder.name,
                eta: eta,
                distance: distance.toFixed(1)
            });
        }

        // Send navigation data to responder
        socket.emit('navigation-data', {
            destination: alert.location,
            eta: eta,
            wazeUrl: `waze://?ll=${alert.location.lat},${alert.location.lng}&navigate=yes`,
            googleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${alert.location.lat},${alert.location.lng}`,
            appleMapsUrl: `http://maps.apple.com/?daddr=${alert.location.lat},${alert.location.lng}&dirflg=d`
        });
    });

    // Cancel alert
    socket.on('cancel-alert', (data) => {
        const alert = activeAlerts.get(data.alertId);
        if (alert) {
            alert.status = 'cancelled';
            
            // Notify all responders
            alert.responders.forEach(responder => {
                const user = users.get(responder.userId);
                if (user) {
                    io.to(user.socketId).emit('alert-cancelled', {
                        alertId: data.alertId
                    });
                }
            });
            
            activeAlerts.delete(data.alertId);
        }
    });

    // Disconnect handling
    socket.on('disconnect', () => {
        if (socket.userId) {
            const user = users.get(socket.userId);
            if (user) {
                user.status = 'offline';
                console.log(`User disconnected: ${user.name}`);
            }
        }
    });
});

// Helper function to find nearby users
function getNearbyHelpers(location, maxDistanceKm = 10) {
    const helpers = [];
    users.forEach((user, userId) => {
        if (user.status === 'online') {
            const distance = calculateDistance(
                location.lat, location.lng,
                user.location.lat, user.location.lng
            );
            if (distance <= maxDistanceKm) {
                helpers.push(user);
            }
        }
    });
    return helpers;
}

// REST API endpoints
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', onlineUsers: users.size, activeAlerts: activeAlerts.size });
});

app.get('/api/nearby', (req, res) => {
    const { lat, lng, radius = 10 } = req.query;
    const nearby = getNearbyHelpers({ lat: parseFloat(lat), lng: parseFloat(lng) }, parseFloat(radius));
    res.json({ count: nearby.length, users: nearby.map(u => ({ name: u.name, status: u.status })) });
});

// Serve main HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🆘 rubiSOS Server running on port ${PORT}`);
    console.log(`📱 Local: http://localhost:${PORT}`);
});
