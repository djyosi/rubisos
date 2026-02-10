const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

// Services
const connectDB = require('./services/database');
const GeoService = require('./services/geolocation');
const NotificationService = require('./services/notifications');

// Models
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

// In-memory storage (for when MongoDB is not available)
const inMemoryUsers = new Map();
const inMemoryAlerts = new Map();

// Connect to database (non-blocking)
connectDB().catch(err => {
    console.log('⚠️ MongoDB not available, using in-memory storage');
});

// Fallback login endpoint (in-memory mode) - MUST be defined BEFORE app.use routes
app.post('/api/users/login', async (req, res) => {
    try {
        const { phone } = req.body;
        console.log('Login attempt:', phone);
        
        // Try MongoDB first if connected
        let user;
        if (mongoose.connection.readyState === 1) {
            user = await User.findOne({ phone });
        } else {
            // Use in-memory
            user = inMemoryUsers.get(phone);
        }
        
        if (!user) {
            console.log('User not found:', phone);
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        console.log('User found:', user.name);
        res.json({
            success: true,
            user: {
                id: user._id || user.id || 'user_' + phone,
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

// Fallback register endpoint (in-memory mode)
app.post('/api/users/register', async (req, res) => {
    try {
        const { phone, name, dateOfBirth, homeAddress, bloodType } = req.body;
        console.log('Register attempt:', phone, name);
        
        // Check if user exists
        let existingUser;
        if (mongoose.connection.readyState === 1) {
            existingUser = await User.findOne({ phone });
        } else {
            existingUser = inMemoryUsers.get(phone);
        }
        
        if (existingUser) {
            console.log('User already exists:', phone);
            return res.json({
                success: true,
                message: 'User already exists',
                user: {
                    id: existingUser._id || existingUser.id || 'user_' + phone,
                    phone: existingUser.phone,
                    name: existingUser.name
                }
            });
        }

        // Create new user
        const userData = {
            phone,
            name,
            dateOfBirth: new Date(dateOfBirth),
            homeAddress,
            bloodType,
            isOnline: false,
            canReceiveAlerts: true,
            alertRadius: 10
        };

        let user;
        if (mongoose.connection.readyState === 1) {
            const newUser = new User(userData);
            await newUser.save();
            user = newUser;
        } else {
            user = { ...userData, _id: 'user_' + Date.now(), createdAt: new Date() };
            inMemoryUsers.set(phone, user);
        }

        const age = Math.floor((new Date() - new Date(dateOfBirth)) / 31536000000);
        console.log('User created:', name, age);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: user._id || user.id,
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

// API Routes (these will be overridden by the specific endpoints above if needed)
app.use('/api/users', userRoutes);
app.use('/api/alerts', alertRoutes);

// In-memory storage for active socket connections
const activeSockets = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // User registration with socket
    socket.on('register', async (data) => {
        try {
            const { phone, name, location, fcmToken } = data;
            
            // Update user in database
            const user = await User.findOneAndUpdate(
                { phone },
                {
                    socketId: socket.id,
                    isOnline: true,
                    lastActive: new Date(),
                    ...(location && { currentLocation: { ...location, timestamp: new Date() } }),
                    ...(fcmToken && { fcmToken })
                },
                { new: true }
            );

            if (user) {
                socket.userId = user._id.toString();
                socket.userPhone = user.phone;
                activeSockets.set(user._id.toString(), socket.id);
                
                console.log(`✅ User registered: ${user.name} (${phone})`);
                
                // Send nearby helpers count
                const nearbyQuery = GeoService.getNearbyQuery(location.lat, location.lng, user.alertRadius || 10);
                nearbyQuery._id = { $ne: user._id };
                nearbyQuery.isOnline = true;
                const nearbyCount = await User.countDocuments(nearbyQuery);
                
                socket.emit('registered', { 
                    success: true, 
                    userId: user._id,
                    nearbyCount 
                });
            } else {
                socket.emit('registered', { 
                    success: false, 
                    error: 'User not found. Please register first.' 
                });
            }
        } catch (error) {
            console.error('Registration error:', error);
            socket.emit('registered', { success: false, error: error.message });
        }
    });

    // Update location in real-time
    socket.on('update-location', async (data) => {
        try {
            if (socket.userId) {
                await User.findByIdAndUpdate(socket.userId, {
                    'currentLocation': { ...data.location, timestamp: new Date() },
                    lastActive: new Date()
                });
                
                console.log(`📍 Location updated for ${socket.userPhone}`);
            }
        } catch (error) {
            console.error('Location update error:', error);
        }
    });

    // Send SOS alert via Socket.io (real-time)
    socket.on('send-sos', async (data) => {
        try {
            if (!socket.userId) {
                socket.emit('alert-error', { error: 'Not registered' });
                return;
            }

            const sender = await User.findById(socket.userId);
            if (!sender) return;

            // Create alert in DB
            const { v4: uuidv4 } = require('uuid');
            const alert = new Alert({
                alertId: uuidv4(),
                type: data.type || 'other',
                priority: data.type === 'medical' ? 'critical' : 'high',
                senderId: sender._id,
                senderName: sender.name,
                senderPhone: sender.phone,
                location: {
                    lat: data.location.lat,
                    lng: data.location.lng,
                    address: data.address || 'Unknown location'
                },
                description: data.description,
                expiresAt: new Date(Date.now() + 60 * 60 * 1000)
            });

            // Find nearby users
            const nearbyQuery = GeoService.getNearbyQuery(
                data.location.lat, 
                data.location.lng, 
                sender.alertRadius || 10
            );
            nearbyQuery._id = { $ne: sender._id };
            nearbyQuery.isOnline = true;
            nearbyQuery.canReceiveAlerts = true;

            const nearbyUsers = await User.find(nearbyQuery);

            // Send real-time alerts via socket.io
            let notifiedCount = 0;
            for (const user of nearbyUsers) {
                const distance = GeoService.calculateDistance(
                    data.location.lat, data.location.lng,
                    user.currentLocation?.lat || 0, user.currentLocation?.lng || 0
                );
                const eta = GeoService.calculateETA(distance);

                // Send to user's socket if online
                if (user.socketId) {
                    io.to(user.socketId).emit('incoming-alert', {
                        alertId: alert.alertId,
                        senderId: sender._id,
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

                // Record recipient
                alert.recipients.push({
                    userId: user._id,
                    notifiedAt: new Date(),
                    notificationMethod: user.socketId ? 'socket' : 'push'
                });
            }

            // Send push notifications to those not online via socket
            const offlineUsers = nearbyUsers.filter(u => !u.socketId && u.fcmToken);
            if (offlineUsers.length > 0) {
                await NotificationService.sendMulticast(
                    offlineUsers,
                    '🆘 SOS ALERT!',
                    `${sender.name} needs help!`,
                    { alertId: alert.alertId, type: 'sos' }
                );
            }

            alert.totalNotified = nearbyUsers.length;
            await alert.save();

            // Update sender stats
            sender.alertsSent += 1;
            await sender.save();

            socket.emit('alert-sent', {
                success: true,
                alertId: alert.alertId,
                helpersNotified: nearbyUsers.length,
                onlineNotified: notifiedCount
            });

            console.log(`🚨 SOS from ${sender.name}! Notified ${nearbyUsers.length} nearby users`);

        } catch (error) {
            console.error('Send SOS error:', error);
            socket.emit('alert-error', { error: error.message });
        }
    });

    // Responder accepts alert
    socket.on('respond-to-alert', async (data) => {
        try {
            const { alertId } = data;
            const responder = await User.findById(socket.userId);
            const alert = await Alert.findOne({ alertId });

            if (!alert || !responder) return;

            // Calculate distance and ETA
            const distance = GeoService.calculateDistance(
                responder.currentLocation?.lat || 0, responder.currentLocation?.lng || 0,
                alert.location.lat, alert.location.lng
            );
            const eta = GeoService.calculateETA(distance);

            // Add responder to alert
            alert.responders.push({
                userId: responder._id,
                name: responder.name,
                phone: responder.phone,
                distance: distance,
                eta: eta.minutes,
                location: responder.currentLocation,
                status: 'coming'
            });
            await alert.save();

            // Update responder stats
            responder.alertsResponded += 1;
            await responder.save();

            // Notify sender
            const sender = await User.findById(alert.senderId);
            if (sender) {
                // Socket notification
                if (sender.socketId) {
                    io.to(sender.socketId).emit('help-coming', {
                        alertId: alert.alertId,
                        responderName: responder.name,
                        responderPhone: responder.phone,
                        eta: eta.formatted,
                        distance: distance.toFixed(1)
                    });
                }
                
                // Push notification
                if (sender.fcmToken) {
                    await NotificationService.sendPushNotification(
                        sender.fcmToken,
                        '✅ Help is coming!',
                        `${responder.name} is on the way (ETA: ${eta.formatted})`,
                        { alertId, type: 'responder_update' }
                    );
                }
            }

            // Send navigation data to responder
            const navUrls = GeoService.getNavigationUrls(
                alert.location.lat, 
                alert.location.lng, 
                alert.location.address
            );

            socket.emit('navigation-data', {
                alertId: alert.alertId,
                destination: alert.location,
                eta: eta,
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
    socket.on('mark-arrived', async (data) => {
        try {
            const { alertId } = data;
            const responder = await User.findById(socket.userId);
            const alert = await Alert.findOne({ alertId });

            if (!alert || !responder) return;

            const responderEntry = alert.responders.find(
                r => r.userId.toString() === responder._id.toString()
            );

            if (responderEntry) {
                responderEntry.status = 'arrived';
                responderEntry.arrivedAt = new Date();
                await alert.save();

                // Notify sender
                const sender = await User.findById(alert.senderId);
                if (sender) {
                    if (sender.socketId) {
                        io.to(sender.socketId).emit('responder-arrived', {
                            alertId,
                            responderName: responder.name
                        });
                    }
                    
                    if (sender.fcmToken) {
                        await NotificationService.sendPushNotification(
                            sender.fcmToken,
                            '🎉 Help arrived!',
                            `${responder.name} has arrived`,
                            { alertId, type: 'responder_arrived' }
                        );
                    }
                }

                socket.emit('arrived-confirmed', { alertId });
                console.log(`🎉 ${responder.name} arrived at alert ${alertId}`);
            }
        } catch (error) {
            console.error('Mark arrived error:', error);
        }
    });

    // Cancel alert
    socket.on('cancel-alert', async (data) => {
        try {
            const { alertId } = data;
            const user = await User.findById(socket.userId);
            const alert = await Alert.findOne({ alertId });

            if (!alert || alert.senderId.toString() !== socket.userId) return;

            alert.status = 'cancelled';
            await alert.save();

            // Notify all responders
            for (const responder of alert.responders) {
                const responderUser = await User.findById(responder.userId);
                if (responderUser?.socketId) {
                    io.to(responderUser.socketId).emit('alert-cancelled', { alertId });
                }
                if (responderUser?.fcmToken) {
                    await NotificationService.sendPushNotification(
                        responderUser.fcmToken,
                        '❌ Alert Cancelled',
                        'The emergency has been cancelled',
                        { alertId, type: 'alert_cancelled' }
                    );
                }
            }

            socket.emit('alert-cancelled-confirmed', { alertId });
            console.log(`❌ Alert ${alertId} cancelled by ${user?.name}`);

        } catch (error) {
            console.error('Cancel alert error:', error);
        }
    });

    // Disconnect handling
    socket.on('disconnect', async () => {
        console.log('🔌 User disconnected:', socket.id);
        
        if (socket.userId) {
            try {
                await User.findByIdAndUpdate(socket.userId, {
                    isOnline: false,
                    socketId: null,
                    lastActive: new Date()
                });
                activeSockets.delete(socket.userId);
            } catch (error) {
                console.error('Disconnect update error:', error);
            }
        }
    });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        const onlineUsers = await User.countDocuments({ isOnline: true });
        const activeAlerts = await Alert.countDocuments({ status: 'active' });
        
        res.json({ 
            status: 'ok', 
            timestamp: new Date(),
            onlineUsers,
            activeAlerts,
            mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
        });
    } catch (error) {
        res.json({ status: 'ok', error: error.message });
    }
});

// Get online users count (for dashboard)
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isOnline: true }),
            Alert.countDocuments(),
            Alert.countDocuments({ status: 'active' }),
            Alert.countDocuments({ status: 'resolved' })
        ]);

        res.json({
            totalUsers: stats[0],
            onlineUsers: stats[1],
            totalAlerts: stats[2],
            activeAlerts: stats[3],
            resolvedAlerts: stats[4]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
