import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Đang chuẩn bị gói Deploy VPS...');

const deployDir = path.join(rootDir, 'deploy_vps_temp');
if (fs.existsSync(deployDir)) {
  fs.rmSync(deployDir, { recursive: true, force: true });
}
fs.mkdirSync(deployDir, { recursive: true });

// 1. Copy License Server backend files
const serverDest = path.join(deployDir, 'license-server');
fs.mkdirSync(serverDest, { recursive: true });

const serverFilesToCopy = [
  'server.js',
  'package.json',
  'ecosystem.config.cjs',
  'setup-vps.sh',
  '.env.example'
];

for (const file of serverFilesToCopy) {
  const src = path.join(rootDir, 'license-server', file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(serverDest, file));
  }
}

// 2. Copy Admin Web Dist
const adminWebDistSrc = path.join(rootDir, 'admin-web', 'dist');
const adminWebDistDest = path.join(deployDir, 'admin-web-dist');

if (fs.existsSync(adminWebDistSrc)) {
  fs.cpSync(adminWebDistSrc, adminWebDistDest, { recursive: true });
  console.log('✅ Đã copy build của admin-web');
} else {
  console.error('❌ Chưa tìm thấy thư mục admin-web/dist!');
}

// 3. Tạo script tự động cài đặt trên VPS (deploy_on_vps.sh)
const deployScriptContent = `#!/bin/bash
echo "🚀 Đang triển khai Karate Cloud & Super Admin trên VPS..."

# 1. Cập nhật License Server
echo "📦 Cập nhật License Server..."
mkdir -p /root/license-server
cp -r ./license-server/* /root/license-server/
cp -r ./license-server/* /root/ 2>/dev/null || true
cd /root/license-server

# Sửa lỗi password postgres trên VPS & Đảm bảo DB karate_license_db tồn tại
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE karate_license_db;" 2>/dev/null || true

cat > /root/license-server/.env << 'ENV_FILE'
PORT=2000
NODE_ENV=production
JWT_SECRET=karate_license_server_super_secret_jwt_key_2026_production_vps_fallback_64chars_long
PG_USER=postgres
PG_HOST=localhost
PG_DATABASE=karate_license_db
PG_PASSWORD=postgres
PG_PORT=5432
GOOGLE_CLIENT_ID=371569491012-d7qfkghaooven40n6kqbfh1gmvtqs558.apps.googleusercontent.com
ENV_FILE

npm install --production

# Force reload PM2
pm2 delete all
pm2 start server.js --name "karate-license-api" -i max
pm2 save

# 2. Cập nhật Admin Web Frontend
echo "🌐 Cập nhật Web Super Admin (Nginx)..."
mkdir -p /var/www/karate-admin/dist
mkdir -p /var/www/karate-admin
mkdir -p /var/www/admin-web
mkdir -p /var/www/html

cp -r /root/deploy_vps_temp/admin-web-dist/* /var/www/karate-admin/dist/ 2>/dev/null || true
cp -r /root/deploy_vps_temp/admin-web-dist/* /var/www/karate-admin/ 2>/dev/null || true
cp -r /root/deploy_vps_temp/admin-web-dist/* /var/www/admin-web/ 2>/dev/null || true

# Restart Nginx với cấu hình client_max_body_size 50M để nhận dữ liệu giải đấu
cat > /etc/nginx/conf.d/upload_limit.conf << 'NGINX_LIMIT'
client_max_body_size 50M;
NGINX_LIMIT

if [ -f /etc/nginx/sites-available/karate-admin ]; then
  cat > /etc/nginx/sites-available/karate-admin << 'NGINX_CONF'
server {
    listen 80;
    server_name admin.luuquancoder.id.vn 103.82.193.133.nip.io 103.82.193.133;

    client_max_body_size 50M;

    location / {
        root /var/www/karate-admin/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:2000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }

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
fi

nginx -t && (systemctl restart nginx || service nginx reload)

echo "🎉 CHÚC MỪNG! Đã deploy thành công hệ thống Cloud Sync & Super Admin trên VPS!"
`;

fs.writeFileSync(path.join(deployDir, 'deploy_on_vps.sh'), deployScriptContent, { mode: 0o755 });

// 4. Nén thành file zip bằng PowerShell trên Windows
const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const zipFileName = `deploy-cloud-vps-103.82.193.133-${dateStr}.zip`;
const zipPath = path.join(rootDir, zipFileName);

console.log(`📦 Đang nén file ${zipFileName}...`);

try {
  const tarCommand = `tar -caf "${zipPath}" -C "${deployDir}" .`;
  execSync(tarCommand, { stdio: 'inherit' });
  
  const latestZipPath = path.join(rootDir, 'deploy-vps-latest.zip');
  fs.copyFileSync(zipPath, latestZipPath);

  console.log(`✨ ĐÃ TẠO FILE DEPLOY THÀNH CÔNG: ${zipFileName} và deploy-vps-latest.zip`);
} catch (e) {
  console.error('Lỗi khi nén zip:', e.message);
} finally {
  // Dọn dẹp folder tạm
  try {
    if (fs.existsSync(deployDir)) {
      fs.rmSync(deployDir, { recursive: true, force: true });
    }
  } catch (err) {
    // Ignore cleanup locks
  }
}
