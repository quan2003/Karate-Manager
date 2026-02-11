#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo ">>> STARTING VPS SETUP FOR POSTGRESQL LICENSE SERVER <<<"

# 1. Update & Upgrade System
echo "[1/6] Updating system packages..."
apt-get update && apt-get upgrade -y

# 2. Install Node.js (if not installed)
if ! command -v node &> /dev/null; then
    echo "[2/6] Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
else
    echo "[2/6] Node.js already installed."
fi

# 3. Install PM2
if ! command -v pm2 &> /dev/null; then
    echo "[3/6] Installing PM2..."
    npm install -g pm2
else
    echo "[3/6] PM2 already installed."
fi

# 4. Install & Configure PostgreSQL
echo "[4/6] Installing PostgreSQL..."
apt-get install -y postgresql postgresql-contrib

# Start PostgreSQL service
systemctl start postgresql
systemctl enable postgresql

# Create Database and User (Idempotent)
echo "Configuring Database..."
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = 'karate_license_db'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE DATABASE karate_license_db;"

sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname = 'postgres'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE USER postgres WITH PASSWORD 'postgres';" 

# Note: We are using the default 'postgres' user for simplicity in this script, 
# but in production, you should create a dedicated user.
# Let's verify password for 'postgres' user is set to something known or configured via env
# For now, we will assume standard config or allow "peer" auth for local connections if configured.
# Force password set:
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"

echo "PostgreSQL installed and configured."

# 5. Firewall Setup (UFW)
echo "[5/6] Configuring Firewall..."
ufw allow OpenSSH
ufw allow 2000/tcp # API Port
ufw allow 80/tcp
ufw allow 443/tcp
# ufw enable # Uncomment to auto-enable (warning: might drop ssh if not careful)
echo "Firewall rules updated. Run 'ufw enable' manually if needed."

# 6. Setup Project Directory
APP_DIR="/root/karate-license-server"
if [ ! -d "$APP_DIR" ]; then
    echo "[6/6] Creating app directory..."
    mkdir -p "$APP_DIR"
fi

echo ">>> SETUP COMPLETE! <<<"
echo "Make sure to update your .env file with PG_CONNECTION details!"
echo "Recommended .env content:"
echo "PG_USER=postgres"
echo "PG_HOST=localhost"
echo "PG_DATABASE=karate_license_db"
echo "PG_PASSWORD=postgres"
echo "PG_PORT=5432"
