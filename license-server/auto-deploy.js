const path = require('path');
const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function deploy() {
  const host = '103.82.194.186';
  const username = 'root';
  const password = 'j7D4w1rMTAnGXS4f';

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

    // 2. Upload Backend ZIP
    console.log('Đang tải lên Backend Server ZIP...');
    const zipLocalFile = path.join(__dirname, '../server_deploy.zip');
    const zipRemoteFile = '/root/karate-app/server_deploy.zip';
    await ssh.putFile(zipLocalFile, zipRemoteFile);
    console.log('Upload Backend Server xong!');

    // 3. Extract and restart on VPS
    console.log('Đang giải nén và khởi động lại Server...');
    const remoteServerDir = '/root/karate-app/license-server';
    await ssh.execCommand(`mkdir -p ${remoteServerDir}`);
    await ssh.execCommand(`unzip -o /root/karate-app/server_deploy.zip -d ${remoteServerDir}`);
    
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
