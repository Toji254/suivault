#!/bin/bash
# Visual Theme Assets & Dependency Setup Script
set -e

echo "=== 1. Creating directories in dashboard public/ ==="
mkdir -p public/images public/videos

echo "=== 2. Migrating static images and looping videos ==="
cp -rv "/home/lowkey/Downloads/Kimi_Agent_SuiVault Blue Theme/app/public/images/"* public/images/
cp -rv "/home/lowkey/Downloads/Kimi_Agent_SuiVault Blue Theme/app/public/videos/"* public/videos/

echo "=== 3. Installing dependencies (ogl, gsap, tailwindcss) ==="
npm install

echo "=== Asset Setup Complete! ==="
