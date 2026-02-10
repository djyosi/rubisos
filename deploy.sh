#!/bin/bash

# rubiSOS Deployment Script for Render.com
# Run this after creating your Render account

echo "🚀 rubiSOS Deployment Helper"
echo ""

# Check if we're in the right directory
if [ ! -f "server/index.js" ]; then
    echo "❌ Error: Run this from the rubisos project root"
    exit 1
fi

echo "📦 Preparing files for deployment..."

# Create render.yaml for Blueprint deployment
cat > render.yaml << 'EOF'
services:
  - type: web
    name: rubisos-server
    runtime: node
    buildCommand: cd server && npm install
    startCommand: cd server && npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
EOF

echo "✅ Created render.yaml"

# Create a README for deployment
cat > DEPLOY_TO_RENDER.md << 'EOF'
# Deploy rubiSOS to Render.com

## Step 1: Push to GitHub

```bash
cd /Users/yosi/clawd/projects/rubisos
git init
git add .
git commit -m "Initial rubiSOS deployment"
```

Create a new GitHub repo and push:
```bash
git remote add origin https://github.com/YOUR_USERNAME/rubisos.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy on Render

1. Go to https://dashboard.render.com
2. Click "New +" → "Blueprint"
3. Connect your GitHub account
4. Select the rubisos repository
5. Click "Apply"

Render will automatically:
- Install dependencies
- Build the app
- Deploy with public URL

## Step 3: Get Your URL

After deployment, you'll get a URL like:
```
https://rubisos-server.onrender.com
```

## Step 4: Test on Mobile

Open the URL on your iPhone:
1. Allow location permissions
2. Register with your name
3. Test SOS button

Done! 🎉
EOF

echo "✅ Created DEPLOY_TO_RENDER.md"

echo ""
echo "═══════════════════════════════════════════════════"
echo "📋 NEXT STEPS:"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Option 1: Manual Deploy (Easiest)"
echo "───────────────────────────────────────"
echo "1. Go to https://dashboard.render.com"
echo "2. Click 'New +' → 'Web Service'"
echo "3. Connect your GitHub"
echo "4. Select this project"
echo "5. Settings:"
echo "   - Build Command: cd server && npm install"
echo "   - Start Command: cd server && npm start"
echo "6. Click 'Create Web Service'"
echo ""
echo "Option 2: Blueprint Deploy (Auto)"
echo "───────────────────────────────────────"
echo "1. Push this folder to GitHub"
echo "2. Use the render.yaml file I created"
echo "3. Render will auto-deploy"
echo ""
echo "═══════════════════════════════════════════════════"
