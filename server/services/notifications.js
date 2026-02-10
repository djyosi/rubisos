// services/notifications.js - Push Notification Service
const axios = require('axios');

class NotificationService {
    constructor() {
        this.fcmServerKey = process.env.FCM_SERVER_KEY;
        this.enabled = !!this.fcmServerKey;
    }

    // Send push notification via Firebase Cloud Messaging
    async sendPushNotification(fcmToken, title, body, data = {}) {
        if (!this.enabled) {
            console.log('Push notifications disabled (no FCM key)');
            return { success: false, reason: 'not_configured' };
        }

        try {
            const response = await axios.post(
                'https://fcm.googleapis.com/fcm/send',
                {
                    to: fcmToken,
                    notification: {
                        title,
                        body,
                        sound: 'sos_alert', // Custom sound file
                        priority: 'high',
                        vibrate: [500, 1000, 500, 1000, 500], // SOS vibration pattern
                        icon: 'ic_sos_notification',
                        color: '#FF0000',
                        channel_id: 'sos_alerts'
                    },
                    data: {
                        ...data,
                        type: 'sos_alert',
                        click_action: 'OPEN_ALERT'
                    },
                    priority: 'high',
                    time_to_live: 0 // Immediate delivery
                },
                {
                    headers: {
                        'Authorization': `key=${this.fcmServerKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Push notification sent:', response.data);
            return { success: true, messageId: response.data.message_id };
        } catch (error) {
            console.error('Push notification failed:', error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }

    // Send to multiple users
    async sendMulticast(recipients, title, body, data = {}) {
        const results = [];
        for (const recipient of recipients) {
            if (recipient.fcmToken && recipient.pushEnabled) {
                const result = await this.sendPushNotification(
                    recipient.fcmToken,
                    title,
                    body,
                    { ...data, alertId: data.alertId }
                );
                results.push({ userId: recipient._id, ...result });
            }
        }
        return results;
    }

    // SMS fallback (using Twilio or similar)
    async sendSMS(phoneNumber, message) {
        // TODO: Implement SMS using Twilio
        console.log(`SMS to ${phoneNumber}: ${message}`);
        return { success: true };
    }
}

module.exports = new NotificationService();
