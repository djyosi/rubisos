// models/Alert.js - SOS Alert System
const mongoose = require('mongoose');

const responderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    distance: { type: Number, required: true }, // km
    eta: { type: Number, required: true }, // minutes
    status: { 
        type: String, 
        enum: ['coming', 'arrived', 'cancelled'], 
        default: 'coming' 
    },
    location: {
        lat: Number,
        lng: Number
    },
    respondedAt: { type: Date, default: Date.now },
    arrivedAt: { type: Date }
});

const alertSchema = new mongoose.Schema({
    // Alert Info
    alertId: { type: String, required: true, unique: true, index: true },
    type: { 
        type: String, 
        required: true,
        enum: ['medical', 'fire', 'security', 'accident', 'other']
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'high'
    },
    
    // Sender Info
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    senderPhone: { type: String, required: true },
    
    // Location
    location: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        accuracy: Number,
        address: String // Human-readable address
    },
    
    // Details
    description: { type: String },
    images: [{ type: String }], // URLs to uploaded images
    
    // Recipients (who received the alert)
    recipients: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        notifiedAt: { type: Date, default: Date.now },
        notificationMethod: { type: String, enum: ['push', 'sms', 'both'] },
        receivedAt: { type: Date }
    }],
    
    // Responders (who accepted)
    responders: [responderSchema],
    
    // Status
    status: {
        type: String,
        enum: ['active', 'resolved', 'cancelled', 'expired'],
        default: 'active'
    },
    
    // Timestamps
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
    expiresAt: { type: Date }, // Auto-expire alerts
    
    // Resolution
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolutionNotes: { type: String },
    
    // Metrics
    totalNotified: { type: Number, default: 0 },
    totalResponded: { type: Number, default: 0 },
    averageResponseTime: { type: Number } // seconds
});

// Indexes
alertSchema.index({ location: '2dsphere' });
alertSchema.index({ createdAt: -1 });
alertSchema.index({ status: 1 });
alertSchema.index({ senderId: 1 });

// Methods
alertSchema.methods.getResponderCount = function() {
    return this.responders.filter(r => r.status === 'coming' || r.status === 'arrived').length;
};

alertSchema.methods.calculateAverageETA = function() {
    const activeResponders = this.responders.filter(r => r.status === 'coming');
    if (activeResponders.length === 0) return null;
    const totalETA = activeResponders.reduce((sum, r) => sum + r.eta, 0);
    return Math.round(totalETA / activeResponders.length);
};

alertSchema.methods.isExpired = function() {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
};

module.exports = mongoose.model('Alert', alertSchema);
