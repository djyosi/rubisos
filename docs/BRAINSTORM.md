# 🧠 rubiSOS Brainstorming Document

## Core Questions

### 1. How does the SOS button work?
**Option A:** App must be open (tap icon → tap SOS)
**Option B:** Widget on home screen (one tap)
**Option C:** Hardware button (volume button combo)
**Option D:** Voice activation ("Hey Siri, rubiSOS")

**Decision:** Start with B (widget) + C (volume combo)

---

### 2. Who gets the alert?
**Option A:** All app users in radius
**Option B:** Verified "helper" users only
**Option C:** Emergency contacts first, then public
**Option D:** Paid subscribers get priority

**Decision:** Start with C (contacts first, then 1km radius)

---

### 3. What info is shared?
**Basic:**
- Name
- Photo
- GPS location
- Emergency type

**Advanced (Phase 2):**
- Live video
- Medical info
- Emergency contact number
- Safe word / password

---

### 4. How to prevent false alarms?
- Require 3-second hold on SOS button
- PIN confirmation for cancel
- Strike system for false reporters
- Community reporting

---

### 5. Legal considerations?
- Good Samaritan law protection for helpers
- Terms of service (not liable for outcomes)
- Data retention policy
- GDPR compliance

---

## Feature Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| SOS Button | High | Low | P0 |
| Location Sharing | High | Low | P0 |
| Push Notifications | High | Medium | P0 |
| User Profiles | High | Low | P0 |
| Nearby Map | Medium | Medium | P1 |
| Video Streaming | High | High | P2 |
| Police Integration | High | High | P2 |
| Chat | Medium | Medium | P2 |

---

## Competitor Research

**bSafe**
- Follow-me feature
- Fake call
- Timer alarm
- ❌ Expensive

**Life360**
- Family tracking
- Crash detection
- ❌ No public SOS

**Noonlight**
- Professional monitoring
- ❌ Paid only
- ❌ No community

**Our Advantage:**
✅ Free tier
✅ Community-based (real people nearby)
✅ One-tap simplicity
