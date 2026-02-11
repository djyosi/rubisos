const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Services
const connectDB = require('./services/database');
const GeoService = require('./services/geolocation');
const NotificationService = require('./services/notifications');

// Models (for when MongoDB is available)
const User = require('./models/User');
const Alert = require('./models/Alert');

// Routes
const userRoutes = require('./routes/users');
const alertRoutes = require('./routes/alerts');

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
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../client')));

// In-memory storage (primary storage when MongoDB is not available)
const inMemoryUsers = new Map();
const inMemoryAlerts = new Map();
const activeSockets = new Map();

// Export for routes
app.locals.inMemoryUsers = inMemoryUsers;
app.locals.inMemoryAlerts = inMemoryAlerts;

// Connect to database (non-blocking)
connectDB().catch(err => {
    console.log('⚠️ MongoDB not available, using in-memory storage only');
});

// ============ API ENDPOINTS ============

// Login
app.post('/api/users/login', async (req, res) => {
    try {
        const { phone } = req.body;
        console.log('Login attempt:', phone);
        
        let user = inMemoryUsers.get(phone);
        
        if (!user) {
            console.log('User not found:', phone);
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        console.log('User found:', user.name);
        res.json({
            success: true,
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name,
                dateOfBirth: user.dateOfBirth,
                homeAddress: user.homeAddress,
                bloodType: user.bloodType,
                age: user.dateOfBirth ? Math.floor((new Date() - new Date(user.dateOfBirth)) / 31536000000) : null
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Register
app.post('/api/users/register', async (req, res) => {
    try {
        const { phone, name, dateOfBirth, homeAddress, bloodType } = req.body;
        console.log('Register attempt:', phone, name);
        
        let existingUser = inMemoryUsers.get(phone);
        
        if (existingUser) {
            console.log('User already exists:', phone);
            return res.json({
                success: true,
                message: 'User already exists',
                user: {
                    id: existingUser.id,
                    phone: existingUser.phone,
                    name: existingUser.name
                }
            });
        }

        const user = {
            id: 'user_' + Date.now(),
            phone,
            name,
            dateOfBirth: new Date(dateOfBirth),
            homeAddress,
            bloodType,
            isOnline: false,
            canReceiveAlerts: true,
            alertRadius: 10,
            alertsSent: 0,
            alertsResponded: 0,
            createdAt: new Date()
        };

        inMemoryUsers.set(phone, user);

        const age = Math.floor((new Date() - new Date(dateOfBirth)) / 31536000000);
        console.log('User created:', name, age);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name,
                age
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get ALL active alerts
app.get('/api/alerts/all-active', (req, res) => {
    try {
        const alerts = Array.from(inMemoryAlerts.values())
            .filter(a => a.status === 'active')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            success: true,
            count: alerts.length,
            alerts: alerts.map(a => ({
                alertId: a.alertId,
                type: a.type,
                status: a.status,
                senderName: a.senderName,
                senderPhone: a.senderPhone,
                location: a.location,
                description: a.description,
                createdAt: a.createdAt,
                responderCount: a.responders ? a.responders.filter(r => r.status === 'coming' || r.status === 'arrived').length : 0,
                responders: a.responders || []
            }))
        });
    } catch (error) {
        console.error('Get all active alerts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Other routes
app.use('/api/users', userRoutes);
app.use('/api/alerts', alertRoutes);

// ============ SOCKET.IO ============

io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // Register user with socket
    socket.on('register', (data) => {
        try {
            const { phone, location } = data;
            const user = inMemoryUsers.get(phone);
            
            if (!user) {
                socket.emit('registered', { 
                    success: false, 
                    error: 'User not found. Please register first.' 
                });
                return;
            }

            user.socketId = socket.id;
            user.isOnline = true;
            user.lastActive = new Date();
            if (location) user.currentLocation = { ...location, timestamp: new Date() };
            
            socket.userId = user.id;
            socket.userPhone = user.phone;
            activeSockets.set(user.id, socket.id);
            
            console.log(`✅ User registered: ${user.name} (${phone})`);
            
            // Count nearby helpers
            let nearbyCount = 0;
            if (location) {
                inMemoryUsers.forEach((u, p) => {
                    if (p !== phone && u.isOnline && u.currentLocation) {
                        const dist = GeoService.calculateDistance(
                            location.lat, location.lng,
                            u.currentLocation.lat, u.currentLocation.lng
                        );
                        if (dist <= (user.alertRadius || 10)) nearbyCount++;
                    }
                });
            }
            
            socket.emit('registered', { 
                success: true, 
                userId: user.id,
                nearbyCount 
            });
        } catch (error) {
            console.error('Registration error:', error);
            socket.emit('registered', { success: false, error: error.message });
        }
    });

    // Update location
    socket.on('update-location', (data) => {
        if (socket.userPhone) {
            const user = inMemoryUsers.get(socket.userPhone);
            if (user) {
                user.currentLocation = { ...data.location, timestamp: new Date() };
                user.lastActive = new Date();
            }
        }
    });

    // Send SOS alert
    socket.on('send-sos', (data) => {
        try {
            if (!socket.userPhone) {
                socket.emit('alert-error', { error: 'Not registered' });
                return;
            }

            const sender = inMemoryUsers.get(socket.userPhone);
            if (!sender) {
                socket.emit('alert-error', { error: 'Sender not found' });
                return;
            }

            const alertId = uuidv4();
            const alert = {
                alertId,
                type: data.type || 'other',
                priority: data.type === 'medical' ? 'critical' : 'high',
                senderId: sender.id,
                senderName: sender.name,
                senderPhone: sender.phone,
                location: {
                    lat: data.location.lat,
                    lng: data.location.lng,
                    address: data.address || 'Unknown location'
                },
                description: data.description,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                status: 'active',
                recipients: [],
                responders: [],
                totalNotified: 0
            };

            // Store alert
            inMemoryAlerts.set(alertId, alert);
            console.log(`🚨 SOS Alert created: ${alertId} by ${sender.name}`);

            // Find and notify nearby users
            let notifiedCount = 0;
            inMemoryUsers.forEach((user, phone) => {
                if (phone !== sender.phone && user.isOnline && user.canReceiveAlerts !== false) {
                    const distance = GeoService.calculateDistance(
                        data.location.lat, data.location.lng,
                        user.currentLocation?.lat || data.location.lat, 
                        user.currentLocation?.lng || data.location.lng
                    );
                    
                    const radius = user.alertRadius || sender.alertRadius || 50; // 50km default for testing
                    
                    if (distance <= radius) {
                        const eta = GeoService.calculateETA(distance);

                        if (user.socketId) {
                            io.to(user.socketId).emit('incoming-alert', {
                                alertId,
                                senderId: sender.id,
                                senderName: sender.name,
                                senderPhone: sender.phone,
                                location: data.location,
                                address: data.address || 'Unknown location',
                                distance: distance.toFixed(1),
                                eta: eta.formatted,
                                emergencyType: data.type || 'emergency',
                                timestamp: new Date(),
                                priority: alert.priority
                            });
                            notifiedCount++;
                        }

                        alert.recipients.push({
                            userId: user.id,
                            phone: phone,
                            notifiedAt: new Date(),
                            notificationMethod: user.socketId ? 'socket' : 'push'
                        });
                    }
                }
            });

            alert.totalNotified = notifiedCount;
            sender.alertsSent = (sender.alertsSent || 0) + 1;
            
            console.log(`🚨 SOS from ${sender.name}! Notified ${notifiedCount} nearby users`);

            socket.emit('alert-sent', {
                success: true,
                alertId,
                helpersNotified: notifiedCount,
                onlineNotified: notifiedCount
            });
        } catch (error) {
            console.error('Send SOS error:', error);
            socket.emit('alert-error', { error: error.message });
        }
    });

    // Respond to alert
    socket.on('respond-to-alert', (data) => {
        try {
            const { alertId } = data;
            const responder = inMemoryUsers.get(socket.userPhone);
            const alert = inMemoryAlerts.get(alertId);
            
            if (!alert || !responder) {
                socket.emit('response-error', { error: 'Alert or responder not found' });
                return;
            }

            const distance = GeoService.calculateDistance(
                responder.currentLocation?.lat || 0, responder.currentLocation?.lng || 0,
                alert.location.lat, alert.location.lng
            );
            const eta = GeoService.calculateETA(distance);

            alert.responders.push({
                userId: responder.id,
                name: responder.name,
                phone: responder.phone,
                distance: distance,
                eta: eta.minutes,
                location: responder.currentLocation,
                status: 'coming'
            });

            responder.alertsResponded = (responder.alertsResponded || 0) + 1;

            // Notify sender
            const sender = inMemoryUsers.get(alert.senderPhone);
            if (sender && sender.socketId) {
                io.to(sender.socketId).emit('help-coming', {
                    alertId,
                    responderName: responder.name,
                    responderPhone: responder.phone,
                    eta: eta.formatted,
                    distance: distance.toFixed(1)
                });
            }

            // Send navigation to responder
            const navUrls = GeoService.getNavigationUrls(
                alert.location.lat, 
                alert.location.lng, 
                alert.location.address
            );

            socket.emit('navigation-data', {
                alertId,
                destination: alert.location,
                eta,
                distance: distance.toFixed(1),
                ...navUrls
            });

            console.log(`🚗 ${responder.name} is responding to alert ${alertId}`);
        } catch (error) {
            console.error('Respond error:', error);
            socket.emit('response-error', { error: error.message });
        }
    });

    // Mark as arrived
    socket.on('mark-arrived', (data) => {
        try {
            const { alertId } = data;
            const responder = inMemoryUsers.get(socket.userPhone);
            const alert = inMemoryAlerts.get(alertId);

            if (!alert || !responder) return;

            const responderEntry = alert.responders.find(
                r => r.userId === responder.id || r.phone === responder.phone
            );

            if (responderEntry) {
                responderEntry.status = 'arrived';
                responderEntry.arrivedAt = new Date();

                const sender = inMemoryUsers.get(alert.senderPhone);
                if (sender && sender.socketId) {
                    io.to(sender.socketId).emit('responder-arrived', {
                        alertId,
                        responderName: responder.name
                    });
                }

                socket.emit('arrived-confirmed', { alertId });
                console.log(`🎉 ${responder.name} arrived at alert ${alertId}`);
            }
        } catch (error) {
            console.error('Mark arrived error:', error);
        }
    });

    // Cancel alert
    socket.on('cancel-alert', (data) => {
        try {
            const { alertId } = data;
            const user = inMemoryUsers.get(socket.userPhone);
            const alert = inMemoryAlerts.get(alertId);

            if (!alert || alert.senderPhone !== socket.userPhone) return;

            alert.status = 'cancelled';

            alert.responders.forEach(responder => {
                const responderUser = inMemoryUsers.get(responder.phone);
                if (responderUser?.socketId) {
                    io.to(responderUser.socketId).emit('alert-cancelled', { alertId });
                }
            });

            socket.emit('alert-cancelled-confirmed', { alertId });
            console.log(`❌ Alert ${alertId} cancelled by ${user?.name}`);
        } catch (error) {
            console.error('Cancel alert error:', error);
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('🔌 User disconnected:', socket.id);
        
        if (socket.userPhone) {
            const user = inMemoryUsers.get(socket.userPhone);
            if (user) {
                user.isOnline = false;
                user.socketId = null;
                user.lastActive = new Date();
            }
            activeSockets.delete(socket.userId);
        }
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date(),
        onlineUsers: Array.from(inMemoryUsers.values()).filter(u => u.isOnline).length,
        activeAlerts: Array.from(inMemoryAlerts.values()).filter(a => a.status === 'active').length,
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Stats
app.get('/api/stats', (req, res) => {
    const users = Array.from(inMemoryUsers.values());
    const alerts = Array.from(inMemoryAlerts.values());
    
    res.json({
        totalUsers: users.length,
        onlineUsers: users.filter(u => u.isOnline).length,
        totalAlerts: alerts.length,
        activeAlerts: alerts.filter(a => a.status === 'active').length,
        resolvedAlerts: alerts.filter(a => a.status === 'resolved').length
    });
});

// Serve main HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('🆘 ╔══════════════════════════════════════╗');
    console.log('🆘 ║     rubiSOS Server Running!          ║');
    console.log('🆘 ╠══════════════════════════════════════╣');
    console.log(`🆘 ║  Port: ${PORT}                          ║`);
    console.log(`🆘 ║  Local: http://localhost:${PORT}        ║`);
    console.log('🆘 ╚══════════════════════════════════════╝');
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});