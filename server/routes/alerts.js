// routes/alerts.js - SOS Alert Routes
const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const User = require('../models/User');
const GeoService = require('../services/geolocation');
const NotificationService = require('../services/notifications');
const { v4: uuidv4 } = require('uuid');

// Send SOS Alert
router.post('/send', async (req, res) => {
    try {
        const { senderPhone, type, location, description, images } = req.body;

        // Get sender
        const sender = await User.findOne({ phone: senderPhone });
        if (!sender) {
            return res.status(404).json({ success: false, error: 'Sender not found' });
        }

        // Create alert
        const alert = new Alert({
            alertId: uuidv4(),
            type: type || 'other',
            priority: type === 'medical' ? 'critical' : 'high',
            senderId: sender._id,
            senderName: sender.name,
            senderPhone: sender.phone,
            location: {
                lat: location.lat,
                lng: location.lng,
                accuracy: location.accuracy,
                address: location.address || 'Unknown location'
            },
            description,
            images,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000) // Expires in 1 hour
        });

        // Find nearby users who can receive alerts
        const nearbyQuery = GeoService.getNearbyQuery(location.lat, location.lng, sender.alertRadius || 10);
        nearbyQuery._id = { $ne: sender._id }; // Exclude sender
        nearbyQuery.canReceiveAlerts = true;
        nearbyQuery.isOnline = true;
        nearbyQuery.pushEnabled = true;

        const recipients = await User.find(nearbyQuery);

        // Send push notifications
        const notificationResults = await NotificationService.sendMulticast(
            recipients,
            '🆘 SOS ALERT!',
            `${sender.name} needs help! ${type || 'Emergency'} - ${location.address || 'Nearby'}`,
            {
                alertId: alert.alertId,
                type: 'sos',
                senderName: sender.name,
                lat: location.lat,
                lng: location.lng
            }
        );

        // Record recipients
        recipients.forEach((recipient, index) => {
            alert.recipients.push({
                userId: recipient._id,
                notificationMethod: 'push',
                notifiedAt: new Date()
            });
        });

        alert.totalNotified = recipients.length;
        await alert.save();

        // Update sender stats
        sender.alertsSent += 1;
        await sender.save();

        res.json({
            success: true,
            alertId: alert.alertId,
            notified: recipients.length,
            recipients: recipients.map(r => ({
                name: r.name,
                distance: GeoService.calculateDistance(
                    location.lat, location.lng,
                    r.currentLocation.lat, r.currentLocation.lng
                ).toFixed(1)
            }))
        });

    } catch (error) {
        console.error('Send alert error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Respond to alert (accept)
router.post('/respond', async (req, res) => {
    try {
        const { alertId, responderPhone, location } = req.body;

        const alert = await Alert.findOne({ alertId });
        if (!alert) {
            return res.status(404).json({ success: false, error: 'Alert not found' });
        }

        if (alert.status !== 'active') {
            return res.status(400).json({ success: false, error: 'Alert is no longer active' });
        }

        const responder = await User.findOne({ phone: responderPhone });
        if (!responder) {
            return res.status(404).json({ success: false, error: 'Responder not found' });
        }

        // Check if already responded
        const existingResponse = alert.responders.find(r => r.userId.toString() === responder._id.toString());
        if (existingResponse) {
            return res.status(400).json({ success: false, error: 'Already responded to this alert' });
        }

        // Calculate distance and ETA
        const distance = GeoService.calculateDistance(
            location.lat, location.lng,
            alert.location.lat, alert.location.lng
        );
        const eta = GeoService.calculateETA(distance, 'driving');

        // Add responder
        alert.responders.push({
            userId: responder._id,
            name: responder.name,
            phone: responder.phone,
            distance: distance,
            eta: eta.minutes,
            location: location,
            status: 'coming'
        });

        alert.totalResponded += 1;
        await alert.save();

        // Update responder stats
        responder.alertsResponded += 1;
        await responder.save();

        // Notify sender
        const sender = await User.findById(alert.senderId);
        if (sender && sender.fcmToken) {
            await NotificationService.sendPushNotification(
                sender.fcmToken,
                '✅ Help is coming!',
                `${responder.name} is on the way (ETA: ${eta.formatted})`,
                { alertId, type: 'responder_update' }
            );
        }

        // Get navigation URLs
        const navUrls = GeoService.getNavigationUrls(
            alert.location.lat,
            alert.location.lng,
            alert.location.address
        );

        res.json({
            success: true,
            eta: eta,
            distance: distance.toFixed(1),
            navigation: navUrls
        });

    } catch (error) {
        console.error('Respond error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark as arrived
router.post('/arrived', async (req, res) => {
    try {
        const { alertId, responderPhone } = req.body;

        const alert = await Alert.findOne({ alertId });
        if (!alert) {
            return res.status(404).json({ success: false, error: 'Alert not found' });
        }

        const responder = await User.findOne({ phone: responderPhone });
        const responderEntry = alert.responders.find(
            r => r.userId.toString() === responder._id.toString()
        );

        if (responderEntry) {
            responderEntry.status = 'arrived';
            responderEntry.arrivedAt = new Date();
            await alert.save();

            // Notify sender
            const sender = await User.findById(alert.senderId);
            if (sender && sender.fcmToken) {
                await NotificationService.sendPushNotification(
                    sender.fcmToken,
                    '🎉 Help arrived!',
                    `${responder.name} has arrived at your location`,
                    { alertId, type: 'responder_arrived' }
                );
            }
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get alert details
router.get('/:alertId', async (req, res) => {
    try {
        const alert = await Alert.findOne({ alertId: req.params.alertId })
            .populate('senderId', 'name phone bloodType medicalNotes')
            .populate('responders.userId', 'name phone');

        if (!alert) {
            return res.status(404).json({ success: false, error: 'Alert not found' });
        }

        res.json({
            success: true,
            alert: {
                id: alert.alertId,
                type: alert.type,
                priority: alert.priority,
                status: alert.status,
                sender: alert.senderId,
                location: alert.location,
                description: alert.description,
                createdAt: alert.createdAt,
                responders: alert.responders.map(r => ({
                    name: r.name,
                    eta: r.eta,
                    status: r.status,
                    distance: r.distance.toFixed(1)
                })),
                averageETA: alert.calculateAverageETA()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get user's active alerts (sent or responded)
router.get('/user/:phone', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.params.phone });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const alerts = await Alert.find({
            $or: [
                { senderId: user._id },
                { 'responders.userId': user._id }
            ],
            status: 'active'
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            alerts: alerts.map(a => ({
                id: a.alertId,
                type: a.type,
                status: a.status,
                senderName: a.senderName,
                location: a.location,
                responderCount: a.getResponderCount(),
                createdAt: a.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Resolve/Cancel alert
router.post('/resolve', async (req, res) => {
    try {
        const { alertId, phone, notes } = req.body;

        const user = await User.findOne({ phone });
        const alert = await Alert.findOne({ alertId });

        if (!alert) {
            return res.status(404).json({ success: false, error: 'Alert not found' });
        }

        // Only sender or responders can resolve
        const isAuthorized = alert.senderId.toString() === user._id.toString() ||
            alert.responders.some(r => r.userId.toString() === user._id.toString());

        if (!isAuthorized) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        alert.status = 'resolved';
        alert.resolvedAt = new Date();
        alert.resolvedBy = user._id;
        alert.resolutionNotes = notes;
        await alert.save();

        // Notify all responders
        for (const responder of alert.responders) {
            const responderUser = await User.findById(responder.userId);
            if (responderUser && responderUser.fcmToken) {
                await NotificationService.sendPushNotification(
                    responderUser.fcmToken,
                    '✅ Alert Resolved',
                    `The emergency has been resolved`,
                    { alertId, type: 'alert_resolved' }
                );
            }
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get nearby active alerts (for Live Alerts screen)
router.get('/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 50 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ success: false, error: 'lat and lng required' });
        }

        // Get alerts from last 1 hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        // Find alerts near location
        const query = {
            createdAt: { $gte: oneHourAgo },
            status: { $in: ['active', 'resolved'] },
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(lng), parseFloat(lat)]
                    },
                    $maxDistance: parseFloat(radius) * 1000 // Convert to meters
                }
            }
        };

        const alerts = await Alert.find(query)
            .sort({ createdAt: -1 })
            .limit(20)
            .select('alertId type status senderName senderPhone location description createdAt responders');

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
                responderCount: a.responders ? a.responders.filter(r => r.status === 'coming' || r.status === 'arrived').length : 0
            }))
        });
    } catch (error) {
        console.error('Get nearby alerts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
