#!/bin/bash

# Deploy script for aitovideo on VPS

set -e

PROJECT_DIR="/var/www/aitovideo"
DOMAIN="ra.nov.ru"

echo "🚀 Deploying AitoVideo..."

# Create directories
mkdir -p $PROJECT_DIR/data

# Copy backend
echo "📁 Copying backend..."
cp -r backend $PROJECT_DIR/

# Build miniapp
echo "🔨 Building Mini App..."
cd miniapp
npm install
npm run build
mkdir -p $PROJECT_DIR/miniapp
cp -r dist/* $PROJECT_DIR/miniapp/

# Install backend dependencies
echo "📦 Installing dependencies..."
cd $PROJECT_DIR/backend
npm install

# Setup PM2
echo "🔄 Setting up PM2..."
pm2 delete aitovideo-api 2>/dev/null || true
pm2 delete aitovideo-bot 2>/dev/null || true
pm2 start src/api/index.ts --name aitovideo-api
pm2 start src/bot/index.ts --name aitovideo-bot
pm2 save

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Ensure nginx is configured for $DOMAIN"
echo "2. Test bot: send /start to @VideoQueueBot"
