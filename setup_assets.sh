#!/bin/bash
# Root Assets & Dependency Setup Script
set -e

echo "=== 1. Creating directories in dashboard public/ ==="
mkdir -p dashboard/public/images dashboard/public/videos

echo "=== 2. Migrating static images and looping videos ==="
cp -rv "/home/lowkey/Downloads/Kimi_Agent_SuiVault Blue Theme/app/public/images/"* dashboard/public/images/
cp -rv "/home/lowkey/Downloads/Kimi_Agent_SuiVault Blue Theme/app/public/videos/"* dashboard/public/videos/

echo "=== 3. Navigating to dashboard and installing dependencies ==="
cd dashboard
npm install

echo "=== Asset Setup Complete! Run 'npm run dev' inside 'dashboard/' to start the server. ==="
