# 🧪 rubiSOS Test Database

## Test Users

### User 1: Tami
- **Name:** Tami
- **Email:** tami@test.com
- **Phone:** +44 7700 900001
- **Address:** NW11 7NA, London, UK
- **Coordinates:** 51.5883°N, 0.1964°W (Golders Green area)
- **Blood Type:** O+
- **Emergency Contact:** +44 7700 900002 (Mom)
- **Medical Notes:** None
- **Photo:** 👩 (female avatar)

### User 2: Yosi
- **Name:** Yosi
- **Email:** yosi@test.com
- **Phone:** +44 7700 900003
- **Address:** N3 3DP, London, UK
- **Coordinates:** 51.6056°N, 0.1876°W (Finchley Central area)
- **Blood Type:** A+
- **Emergency Contact:** +44 7700 900004 (Partner)
- **Medical Notes:** None
- **Photo:** 👨 (male avatar)

---

## 📍 Location Data

### Distance Between Users
- **Tami (NW11 7NA)** to **Yosi (N3 3DP)**
- Distance: ~2.1 km (1.3 miles)
- Walking time: ~25 minutes
- Driving time: ~8 minutes

### Broadcast Radius Test
- 1 km radius: Only covers immediate neighborhood
- 2 km radius: ✅ Tami and Yosi can see each other
- 5 km radius: ✅ Covers both + surrounding areas

---

## 🧪 Test Scenarios

### Scenario 1: Tami Needs Help
1. Tami presses SOS button
2. Alert broadcasts to 2 km radius
3. Yosi receives notification (2.1 km away)
4. Yosi sees Tami's profile + location
5. Yosi can navigate to help

### Scenario 2: Yosi Medical Emergency
1. Yosi selects "Medical" emergency type
2. SOS activated
3. Tami receives alert with "Medical" tag
4. Tami sees Yosi's blood type (A+)
5. Tami can provide informed help

---

## 🔧 Implementation Notes

### Coordinates for Mock GPS
```javascript
// Tami's location (NW11 7NA)
const tamiLocation = {
    lat: 51.5883,
    lng: -0.1964
};

// Yosi's location (N3 3DP)
const yosiLocation = {
    lat: 51.6056,
    lng: -0.1876
};
```

### Distance Calculation
```javascript
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
}

// Distance: 2.1 km
```

---

## 📱 Mock User Profiles for UI

Use these for testing the "Nearby Helpers" display:

```javascript
const mockUsers = [
    {
        id: "user_tami_001",
        name: "Tami",
        photo: "👩",
        distance: 2.1,
        eta: "8 min",
        bloodType: "O+",
        location: { lat: 51.5883, lng: -0.1964 }
    },
    {
        id: "user_yosi_002",
        name: "Yosi",
        photo: "👨",
        distance: 2.1,
        eta: "8 min",
        bloodType: "A+",
        location: { lat: 51.6056, lng: -0.1876 }
    }
];
```
