const path = require('path');
const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function deploy() {
  const host = '103.82.193.133';
  const username = 'root';
  const password = '6N9Z6bW0nc3tZ5Gy';

  try {
    console.log(`Đang kết nối tới VPS ${host}...`);
    await ssh.connect({
      host,
      username,
      password,
    });
    console.log('Kết nối thành công!');

    // 1. Upload Admin Web
    console.log('Đang tải lên giao diện Admin Web (khá chậm, vui lòng đợi)...');
    const webLocalDir = path.join(__dirname, '../admin-web/dist');
    const webRemoteDir = '/var/www/karate-admin/dist';
    // Clear old files
    await ssh.execCommand(`rm -rf ${webRemoteDir}/*`);
    await ssh.putDirectory(webLocalDir, webRemoteDir, {
      recursive: true,
      concurrency: 5,
    });
    console.log('Upload Admin Web xong!');

    // 3. Extract and update Server on VPS
    console.log('Đang giải nén và cập nhật Server...');
    const remoteServerDir = '/root/karate-app/license-server';
    await ssh.execCommand(`mkdir -p ${remoteServerDir}`);
    await ssh.execCommand(`unzip -o /root/karate-app/server_deploy.zip -d ${remoteServerDir}`);
    
    // Upload newest server.js
    console.log('Đang ghi đè server.js mới nhất...');
    const serverFileLocal = path.join(__dirname, 'server.js');
    await ssh.putFile(serverFileLocal, '/root/karate-app/license-server/server.js');
    await ssh.putFile(serverFileLocal, '/root/license-server/server.js').catch(() => {});
    await ssh.putFile(serverFileLocal, '/root/server.js').catch(() => {});
    
    // Install NPM
    console.log('Đang cài đặt node modules trên VPS...');
    await ssh.execCommand(`npm install`, { cwd: remoteServerDir });

    // Restart PM2 and Nginx
    console.log('Đang khởi động lại PM2 và Nginx...');
    const pm2Result = await ssh.execCommand(`pm2 restart karate-license-api`);
    console.log('PM2:', pm2Result.stdout);
    
    await ssh.execCommand(`systemctl restart nginx`);
    console.log('Hoàn tất toàn bộ quy trình Deploy!');

  } catch (error) {
    console.error('Lỗi khi Deploy:', error);
  } finally {
    ssh.dispose();
  }
}

deploy();
