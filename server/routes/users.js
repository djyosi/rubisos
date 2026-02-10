// routes/users.js - User Management Routes
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const GeoService = require('../services/geolocation');

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { phone, name, dateOfBirth, homeAddress, email, bloodType, medicalNotes, emergencyContact, fcmToken } = req.body;

        // Validation
        if (!phone || !name || !dateOfBirth || !homeAddress) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: phone, name, dateOfBirth, homeAddress' 
            });
        }

        // Validate phone format (Israeli format)
        const phoneRegex = /^\+972[0-9]{9}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone format. Use +972XXXXXXXXX'
            });
        }

        // Validate coordinates
        if (!GeoService.isValidCoordinates(homeAddress.coordinates.lat, homeAddress.coordinates.lng)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid coordinates'
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            // Update FCM token if provided
            if (fcmToken) {
                existingUser.fcmToken = fcmToken;
                await existingUser.save();
            }
            return res.json({
                success: true,
                message: 'User already exists',
                user: {
                    id: existingUser._id,
                    phone: existingUser.phone,
                    name: existingUser.name
                }
            });
        }

        // Create new user
        const user = new User({
            phone,
            name,
            dateOfBirth: new Date(dateOfBirth),
            homeAddress: {
                street: homeAddress.street,
                city: homeAddress.city,
                country: homeAddress.country || 'Israel',
                zipCode: homeAddress.postcode || homeAddress.zipCode,
                coordinates: {
                    lat: homeAddress.coordinates.lat,
                    lng: homeAddress.coordinates.lng
                }
            },
            email,
            bloodType,
            medicalNotes,
            emergencyContact,
            fcmToken,
            currentLocation: homeAddress.coordinates // Default to home
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: user._id,
                phone: user.phone,
                name: user.name,
                age: user.getAge()
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Login / Get user by phone
router.post('/login', async (req, res) => {
    try {
        const { phone, fcmToken } = req.body;

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Update FCM token if provided
        if (fcmToken) {
            user.fcmToken = fcmToken;
            await user.save();
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                phone: user.phone,
                name: user.name,
                dateOfBirth: user.dateOfBirth,
                homeAddress: user.homeAddress,
                bloodType: user.bloodType,
                medicalNotes: user.medicalNotes,
                emergencyContact: user.emergencyContact,
                alertRadius: user.alertRadius,
                alertTypes: user.alertTypes,
                age: user.getAge()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update user location
router.post('/location', async (req, res) => {
    try {
        const { phone, lat, lng, accuracy } = req.body;

        const user = await User.findOneAndUpdate(
            { phone },
            {
                currentLocation: { lat, lng, accuracy, timestamp: new Date() },
                lastActive: new Date(),
                isOnline: true
            },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update user settings
router.patch('/settings', async (req, res) => {
    try {
        const { phone, alertRadius, alertTypes, pushEnabled } = req.body;

        const updates = {};
        if (alertRadius !== undefined) updates.alertRadius = alertRadius;
        if (alertTypes !== undefined) updates.alertTypes = alertTypes;
        if (pushEnabled !== undefined) updates.pushEnabled = pushEnabled;

        const user = await User.findOneAndUpdate(
            { phone },
            updates,
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({ success: true, settings: updates });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update profile
router.patch('/profile', async (req, res) => {
    try {
        const { phone, ...updates } = req.body;

        // Don't allow updating phone
        delete updates.phone;

        const user = await User.findOneAndUpdate(
            { phone },
            updates,
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                phone: user.phone,
                name: user.name,
                email: user.email,
                bloodType: user.bloodType,
                medicalNotes: user.medicalNotes,
                emergencyContact: user.emergencyContact
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get nearby users (for testing/admin)
router.get('/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 10 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ success: false, error: 'lat and lng required' });
        }

        const query = GeoService.getNearbyQuery(parseFloat(lat), parseFloat(lng), parseFloat(radius));
        query.isOnline = true;
        query.canReceiveAlerts = true;

        const users = await User.find(query).select('name phone currentLocation');

        res.json({
            success: true,
            count: users.length,
            users: users.map(u => ({
                id: u._id,
                name: u.name,
                distance: GeoService.calculateDistance(
                    parseFloat(lat), parseFloat(lng),
                    u.currentLocation.lat, u.currentLocation.lng
                ).toFixed(1)
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
