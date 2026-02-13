#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "============================================="
echo "  KARATE ADMIN - VPS DEPLOYMENT SCRIPT"
echo "============================================="

# --- Configuration ---
APP_DIR="/root/karate-app/license-server"
WEB_DIR="/var/www/karate-admin/dist"
VPS_IP="103.82.194.186"

# 1. Update System
echo ""
echo "[1/7] Updating system packages..."
apt-get update && apt-get upgrade -y

# 2. Install Node.js
if ! command -v node &> /dev/null; then
    echo "[2/7] Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "[2/7] Node.js already installed: $(node -v)"
fi

# 3. Install PM2
if ! command -v pm2 &> /dev/null; then
    echo "[3/7] Installing PM2..."
    npm install -g pm2
else
    echo "[3/7] PM2 already installed."
fi

# 4. Install & Configure PostgreSQL
echo "[4/7] Installing PostgreSQL..."
apt-get install -y postgresql postgresql-contrib

systemctl start postgresql
systemctl enable postgresql

# Create Database (idempotent)
echo "Configuring Database..."
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'quan2003';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'karate_license_db'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE karate_license_db;"

echo "PostgreSQL configured."

# 5. Install Nginx
echo "[5/7] Installing Nginx..."
apt-get install -y nginx

# Configure Nginx for Karate Admin
cat > /etc/nginx/sites-available/karate-admin << 'NGINX_CONF'
server {
    listen 80;
    server_name 103.82.194.186.nip.io 103.82.194.186;

    # Serve Admin Web (Static Files from Vite build)
    location / {
        root /var/www/karate-admin/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Node.js License Server
    location /api/ {
        proxy_pass http://127.0.0.1:2000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy Auth requests
    location /auth/ {
        proxy_pass http://127.0.0.1:2000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_CONF

# Enable site
ln -sf /etc/nginx/sites-available/karate-admin /etc/nginx/sites-enabled/karate-admin
rm -f /etc/nginx/sites-enabled/default

# Test and restart Nginx
nginx -t
systemctl restart nginx
echo "Nginx configured."

# 6. Firewall
echo "[6/7] Configuring Firewall..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 2000/tcp
echo "Firewall rules added. Run 'ufw enable' manually if needed."

# 7. Setup App Directory & .env
echo "[7/7] Setting up app directories..."
mkdir -p "$APP_DIR"
mkdir -p "$WEB_DIR"

# Create .env if not exists
if [ ! -f "$APP_DIR/.env" ]; then
cat > "$APP_DIR/.env" << 'ENV_FILE'
# Server Configuration
PORT=2000
NODE_ENV=production

# Security
ADMIN_SECRET=b3f9a2c7e8d1f6a4b9c2e7d5f8a1c3e6b4d9a7f2c1e8b6d3a5f7c9e1b2d4f6a
JWT_SECRET=karate_jwt_secret_2026_change_me

# CORS Configuration
ALLOWED_ORIGINS=http://103.82.194.186,http://103.82.194.186.nip.io

# Rate Limiting
WINDOW_MS=900000
MAX_REQUESTS=100

# PostgreSQL
PG_USER=postgres
PG_HOST=localhost
PG_DATABASE=karate_license_db
PG_PASSWORD=quan2003
PG_PORT=5432

# Google OAuth
GOOGLE_CLIENT_ID=371569491012-d7qfkghaooven40n6kqbfh1gmvtqs558.apps.googleusercontent.com
ENV_FILE
    echo ".env file created."
else
    echo ".env file already exists, skipping."
fi

echo ""
echo "============================================="
echo "  SETUP COMPLETE!"
echo "============================================="
echo ""
echo "NEXT STEPS:"
echo "1. Upload files from Windows using WinSCP:"
echo "   - license-server/* (no node_modules) -> $APP_DIR/"
echo "   - admin-web/dist/*                   -> $WEB_DIR/"
echo ""
echo "2. Then run:"
echo "   cd $APP_DIR"
echo "   npm install"
echo "   node init-full-db.js"
echo "   pm2 start server.js --name karate-server"
echo "   pm2 startup && pm2 save"
echo ""
echo "3. Access: http://$VPS_IP.nip.io"
echo "============================================="
