// services/database.js
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rubisos';
        
        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        console.log('✅ MongoDB Connected');
        
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.warn('MongoDB disconnected. Attempting to reconnect...');
        });
        
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        // Don't exit - let the app run without DB for now
        console.log('⚠️ Running without database (in-memory mode)');
    }
};

module.exports = connectDB;
