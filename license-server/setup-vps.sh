#!/bin/bash

# --- CONFIG ---
APP_DIR="/root/karate-license-server"
NODE_VERSION="20"
PM2_APP_NAME="karate-license-api"

echo ">>> DEPLOYING LICENSE SERVER TO VPS (Simplified) <<<"

# 1. Update system & Install Requirements
echo ">>> Updating system..."
apt-get update -y
apt-get install -y curl git ufw

# 2. Install NodeJS (if not present)
if ! command -v node &> /dev/null; then
    echo ">>> Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
else
    echo ">>> Node.js already installed: $(node -v)"
fi

# 3. Setup UFW Firewall
echo ">>> Configuring Firewall (ufw)..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 2000/tcp  # License API Port
echo "y" | ufw enable
ufw status

# 4. Install Global Tools
echo ">>> Installing PM2..."
npm install -g pm2 pnpm

# 5. Setup Application Directory
echo ">>> Setting up application directory at ${APP_DIR}..."
mkdir -p "${APP_DIR}"

# 6. Copy Files (You should scp/upload files separately or git clone)
# For this script, assume files are present or will be uploaded. 
# Better: Just prepare the environment.

# 7. Install Dependencies & Start
cd "${APP_DIR}" || exit
if [ -f "package.json" ]; then
    echo ">>> Installing dependencies..."
    npm install --production

    echo ">>> Starting Server with PM2..."
    pm2 delete "${PM2_APP_NAME}" || true
    pm2 start ecosystem.config.cjs --env production

    echo ">>> Saving PM2 list..."
    pm2 save
    pm2 startup
else
    echo ">>> WARN: No package.json found in ${APP_DIR}. Upload your code first!"
fi

echo ">>> SETUP COMPLETE! <<<"
echo "Make sure to create a .env file with your ADMIN_SECRET!"
