// models/User.js - User Management System
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Basic Info
    phone: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    dateOfBirth: {
        type: Date,
        required: true
    },
    
    // Home Address (for emergency location)
    homeAddress: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String },
        zipCode: { type: String },
        country: { type: String, default: 'Israel' },
        coordinates: {
            lat: { type: Number, required: true },
            lng: { type: Number, required: true }
        }
    },
    
    // Profile
    email: { type: String },
    bloodType: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    medicalNotes: { type: String },
    emergencyContact: {
        name: String,
        phone: String,
        relationship: String
    },
    
    // Push Notifications
    fcmToken: { type: String }, // Firebase Cloud Messaging token
    pushEnabled: { type: Boolean, default: true },
    
    // Location (Real-time)
    currentLocation: {
        lat: Number,
        lng: Number,
        accuracy: Number,
        timestamp: Date
    },
    
    // Status
    isOnline: { type: Boolean, default: false },
    socketId: { type: String },
    lastActive: { type: Date, default: Date.now },
    
    // Settings
    alertRadius: { type: Number, default: 10 }, // km
    canReceiveAlerts: { type: Boolean, default: true },
    alertTypes: [{ type: String }], // ['medical', 'fire', 'security', 'other']
    
    // Verification
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String },
    verificationExpiry: { type: Date },
    
    // Stats
    alertsSent: { type: Number, default: 0 },
    alertsResponded: { type: Number, default: 0 },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Indexes for geospatial queries
userSchema.index({ 'homeAddress.coordinates': '2dsphere' });
userSchema.index({ 'currentLocation': '2dsphere' });

// Pre-save middleware
userSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Methods
userSchema.methods.getAge = function() {
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

userSchema.methods.isWithinRadius = function(targetLat, targetLng, radiusKm) {
    const R = 6371; // Earth's radius in km
    const dLat = (targetLat - this.currentLocation.lat) * Math.PI / 180;
    const dLng = (targetLng - this.currentLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.currentLocation.lat * Math.PI / 180) * Math.cos(targetLat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance <= radiusKm;
};

module.exports = mongoose.model('User', userSchema);
