# rubiSOS Deployment Guide

## Option 1: Manual Web Service (Recommended)

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect **GitHub** → Select **djyosi/rubisos**
4. Fill in these exact settings:

### Build Settings:
- **Name**: `rubisos`
- **Region**: `Oregon (US West)` or `Frankfurt (EU)`
- **Branch**: `main`
- **Runtime**: `Node`
- **Build Command**: `cd server && npm install`
- **Start Command**: `cd server && npm start`

### Environment Variables:
```
NODE_ENV=production
PORT=10000
```

5. Click **"Create Web Service"**

---

## Option 2: Fix Blueprint

Delete the broken blueprint and recreate:

1. Go to https://dashboard.render.com/blueprints
2. Delete the rubiSOS blueprint
3. Go to https://dashboard.render.com/new
4. Click **"Blueprint"**
5. Paste: `https://github.com/djyosi/rubisos`
6. Click **"Connect