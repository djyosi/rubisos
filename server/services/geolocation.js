// services/geolocation.js - Distance and ETA calculations
class GeoService {
    // Haversine formula - calculate distance between two points
    static calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    static toRadians(degrees) {
        return degrees * Math.PI / 180;
    }

    // Calculate ETA based on distance and transport mode
    static calculateETA(distanceKm, mode = 'driving') {
        const speeds = {
            walking: 5,      // km/h
            cycling: 15,     // km/h
            driving: 30,     // km/h (urban average)
            emergency: 45    // km/h (emergency response)
        };

        const speed = speeds[mode] || speeds.driving;
        const minutes = Math.round((distanceKm / speed) * 60);
        
        return {
            minutes: Math.max(1, minutes),
            formatted: this.formatDuration(minutes)
        };
    }

    static formatDuration(minutes) {
        if (minutes < 60) {
            return `${minutes} min`;
        }
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }

    // Generate navigation URLs
    static getNavigationUrls(lat, lng, address = '') {
        const encodedAddress = encodeURIComponent(address);
        return {
            waze: `waze://?ll=${lat},${lng}&navigate=yes`,
            googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
            appleMaps: `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`,
            // Universal fallback
            universal: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        };
    }

    // Find users within radius (for MongoDB)
    static getNearbyQuery(lat, lng, radiusKm) {
        return {
            'currentLocation': {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [lng, lat] // MongoDB uses [lng, lat]
                    },
                    $maxDistance: radiusKm * 1000 // Convert to meters
                }
            }
        };
    }

    // Validate coordinates
    static isValidCoordinates(lat, lng) {
        return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }
}

module.exports = GeoService;
