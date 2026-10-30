const path = require("path");
const { NodeSSH } = require("node-ssh");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const ssh = new NodeSSH();
const remoteDir = "/root/license-server";

async function checked(command, options = {}) {
  const result = await ssh.execCommand(command, options);
  if (result.code !== 0) {
    throw new Error(`${command}\n${result.stderr || result.stdout}`);
  }
  return result;
}

async function deploy() {
  const host = process.env.KSPORT_VPS_HOST || "103.82.193.133";
  const username = process.env.KSPORT_VPS_USER || "root";
  const password = process.env.KSPORT_VPS_PASSWORD;
  if (!password) throw new Error("Missing KSPORT_VPS_PASSWORD in license-server/.env");
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

  try {
    console.log(`Connecting to ${host}...`);
    await ssh.connect({ host, username, password });

    await checked(`test -d ${remoteDir}`);
    await checked("rm -f server.js.new public-data.js.new", { cwd: remoteDir });
    await ssh.putFile(path.join(__dirname, "server.js"), `${remoteDir}/server.new.js`);
    await ssh.putFile(path.join(__dirname, "public-data.js"), `${remoteDir}/public-data.new.js`);

    await checked("node --check server.new.js && node --check public-data.new.js", { cwd: remoteDir });
    await checked(
      `cp server.js server.js.bak-${stamp} && ` +
      `if test -f public-data.js; then cp public-data.js public-data.js.bak-${stamp}; fi && ` +
      "mv server.new.js server.js && mv public-data.new.js public-data.js",
      { cwd: remoteDir }
    );

    const restart = await checked("pm2 restart karate-license-api --update-env");
    console.log(restart.stdout);
    await checked("pm2 save");

    const health = await checked(
      "for i in 1 2 3 4 5 6 7 8 9 10; do " +
      "code=$(curl -sS -o /tmp/k-sport-public-health.json -w '%{http_code}' http://127.0.0.1:2000/api/public/events || true); " +
      "if test \"$code\" = 200 -o \"$code\" = 401; then echo $code; exit 0; fi; " +
      "sleep 2; done; " +
      "echo \"status=$code body=$(cat /tmp/k-sport-public-health.json 2>/dev/null)\" >&2; " +
      "pm2 logs karate-license-api --nostream --lines 40 >&2; exit 1"
    );
    console.log(`Public API health status: ${health.stdout.trim()}`);
    console.log(`Deploy completed. Backup suffix: ${stamp}`);
  } finally {
    ssh.dispose();
  }
}

deploy().catch((error) => {
  console.error("Deploy failed:", error.message);
  process.exitCode = 1;
});
