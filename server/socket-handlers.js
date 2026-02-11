// Socket.io connection handling with in-memory fallback
io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // User registration with socket
    socket.on('register', async (data) => {
        try {
            const { phone, name, location, fcmToken } = data;
            
            let user;
            
            // Try MongoDB first, fallback to in-memory
            if (mongoose.connection.readyState === 1) {
                user = await User.findOneAndUpdate(
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
            } else {
                // In-memory fallback
                user = inMemoryUsers.get(phone);
                if (user) {
                    user.socketId = socket.id;
                    user.isOnline = true;
                    user.lastActive = new Date();
                    if (location) user.currentLocation = { ...location, timestamp: new Date() };
                    if (fcmToken) user.fcmToken = fcmToken;
                    inMemoryUsers.set(phone, user);
                }
            }

            if (user) {
                socket.userId = user._id || user.id || phone;
                socket.userPhone = user.phone;
                activeSockets.set(socket.userId, socket.id);
                
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
                    userId: socket.userId,
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
                if (mongoose.connection.readyState === 1) {
                    await User.findByIdAndUpdate(socket.userId, {
                        'currentLocation': { ...data.location, timestamp: new Date() },
                        lastActive: new Date()
                    });
                } else {
                    // In-memory update
                    const user = inMemoryUsers.get(socket.userPhone);
                    if (user) {
                        user.currentLocation = { ...data.location, timestamp: new Date() };
                        user.lastActive = new Date();
                    }
                }
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

            // Get sender from memory
            const sender = inMemoryUsers.get(socket.userPhone);
            if (!sender) {
                socket.emit('alert-error', { error: 'Sender not found' });
                return;
            }

            // Create alert
            const { v4: uuidv4 } = require('uuid');
            const alertId = uuidv4();
            
            const alert = {
                alertId: alertId,
                type: data.type || 'other',
                priority: data.type === 'medical' ? 'critical' : 'high',
                senderId: socket.userId,
                senderName: sender.name,
                senderPhone: sender.phone,
                location: {
                    lat: data.location.lat,
                    lng: data.location.lng,
                    address: data.address || 'Unknown location'
                },
                description: data.description,
                timestamp: new Date(),
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                status: 'active',
                recipients: [],
                responders: [],
                totalNotified: 0
            };

            // Store in memory
            inMemoryAlerts.set(alertId, alert);
            
            console.log(`🚨 SOS Alert created: ${alertId} by ${sender.name}`);

            // Find nearby users from in-memory
            let notifiedCount = 0;
            inMemoryUsers.forEach((user, phone) => {
                if (phone !== sender.phone && user.isOnline && user.canReceiveAlerts !== false) {
                    const distance = GeoService.calculateDistance(
                        data.location.lat, data.location.lng,
                        user.currentLocation?.lat || data.location.lat, 
                        user.currentLocation?.lng || data.location.lng
                    );
                    
                    const radius = user.alertRadius || sender.alertRadius || 10;
                    
                    if (distance <= radius) {
                        const eta = GeoService.calculateETA(distance);

                        // Send to user's socket if online
                        if (user.socketId) {
                            io.to(user.socketId).emit('incoming-alert', {
                                alertId: alert.alertId,
                                senderId: sender.id || sender._id,
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
                            userId: user.id || user._id || phone,
                            phone: phone,
                            notifiedAt: new Date(),
                            notificationMethod: user.socketId ? 'socket' : 'push'
                        });
                    }
                }
            });

            alert.totalNotified = notifiedCount;
            
            // Update sender stats
            sender.alertsSent = (sender.alertsSent || 0) + 1;
            
            console.log(`🚨 SOS from ${sender.name}! Notified ${notifiedCount} nearby users`);

            socket.emit('alert-sent', {
                success: true,
                alertId: alert.alertId,
                helpersNotified: notifiedCount,
                onlineNotified: notifiedCount
            });

        } catch (error) {
            console.error('Send SOS error:', error);
            socket.emit('alert-error', { error: error.message });
        }
    });

    // Responder accepts alert
    socket.on('respond-to-alert', async (data) => {
        try {
            const { alertId } = data;
            const responder = inMemoryUsers.get(socket.userPhone);
            const alert = inMemoryAlerts.get(alertId);
            
            if (!alert || !responder) {
                socket.emit('response-error', { error: 'Alert or responder not found' });
                return;
            }

            // Calculate distance and ETA
            const distance = GeoService.calculateDistance(
                responder.currentLocation?.lat || 0, responder.currentLocation?.lng || 0,
                alert.location.lat, alert.location.lng
            );
            const eta = GeoService.calculateETA(distance);

            // Add responder to alert
            alert.responders.push({
                userId: responder.id || responder._id || socket.userPhone,
                name: responder.name,
                phone: responder.phone,
                distance: distance,
                eta: eta.minutes,
                location: responder.currentLocation,
                status: 'coming'
            });

            // Update responder stats
            responder.alertsResponded = (responder.alertsResponded || 0) + 1;

            // Notify sender
            const sender = inMemoryUsers.get(alert.senderPhone);
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
            const responder = inMemoryUsers.get(socket.userPhone);
            const alert = inMemoryAlerts.get(alertId);

            if (!alert || !responder) return;

            const responderEntry = alert.responders.find(
                r => (r.userId === (responder.id || responder._id || socket.userPhone)) || 
                     r.phone === responder.phone
            );

            if (responderEntry) {
                responderEntry.status = 'arrived';
                responderEntry.arrivedAt = new Date();

                // Notify sender
                const sender = inMemoryUsers.get(alert.senderPhone);
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
            const user = inMemoryUsers.get(socket.userPhone);
            const alert = inMemoryAlerts.get(alertId);

            if (!alert || alert.senderPhone !== socket.userPhone) return;

            alert.status = 'cancelled';

            // Notify all responders
            for (const responder of alert.responders) {
                const responderUser = inMemoryUsers.get(responder.phone);
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
                if (mongoose.connection.readyState === 1) {
                    await User.findByIdAndUpdate(socket.userId, {
                        isOnline: false,
                        socketId: null,
                        lastActive: new Date()
                    });
                } else {
                    // In-memory update
                    const user = inMemoryUsers.get(socket.userPhone);
                    if (user) {
                        user.isOnline = false;
                        user.socketId = null;
                        user.lastActive = new Date();
                    }
                }
                activeSockets.delete(socket.userId);
            } catch (error) {
                console.error('Disconnect update error:', error);
            }
        }
    });
});

// In-memory storage for active socket connections
const activeSockets = new Map();

// Export in-memory storage for use in routes
module.exports = { inMemoryUsers, inMemoryAlerts };