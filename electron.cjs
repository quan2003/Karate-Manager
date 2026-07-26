const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const { PDFDocument } = require("pdf-lib");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const http = require("http");
const os = require("os");
const dbService = require("./database.cjs");
const licenseVault = require("./licenseVault.cjs");

// Thiết lập ngôn ngữ mặc định của Chromium cho app để input date formating là vi-VN (dd/mm/yyyy)
app.commandLine.appendSwitch('lang', 'vi-VN');

// Biến giữ window chính
let mainWindow = null;
let lanServer = null;
const lanLiveStatuses = new Map();
const tvDisplayWindows = new Map();
const lanLiveStatusClients = new Set();

function sendLanLiveStatusEvent(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastLanLiveStatuses() {
  const payload = Array.from(lanLiveStatuses.values());
  for (const client of lanLiveStatusClients) {
    try {
      sendLanLiveStatusEvent(client, "live-status", payload);
    } catch {
      lanLiveStatusClients.delete(client);
    }
  }
}

// =============================================
// KATA RECEIVE SERVER (port 3002)
// Phục vụ trang đăng ký bài quyền cho thiết bị ngoài
// =============================================
let kataReceiveServer = null;
const kataReceiveState = {
  matId: '1',
  pin: '',
  matches: [],         // danh sách trận hiện tại
  lockedMatchIds: new Set(), // matchId đang thi đấu -> khoá
  receivedRequestIds: new Set(), // chống gửi trùng
};

function readBodyJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); if (body.length > 512*1024) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    req.on('error', reject);
  });
}

function startKataReceiveServer(matId, pin) {
  if (kataReceiveServer) return { success: true, message: 'Đã chạy' };
  kataReceiveState.matId = matId || '1';
  kataReceiveState.pin = pin || '';

  kataReceiveServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:3002');
    const pathname = url.pathname;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // Phục vụ trang HTML tiếp nhận
    if (req.method === 'GET' && (pathname === '/' || pathname === '/kata-receive' || pathname === '/kata-receive.html')) {
      try {
        const html = fs.readFileSync(path.join(__dirname, 'public', 'kata-receive.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (e) {
        res.writeHead(500); res.end('Lỗi tải trang: ' + e.message);
      }
      return;
    }

    // API: Lấy danh sách trận của thảm
    if (req.method === 'GET' && pathname === '/api/kata-receive/matches') {
      const reqPin = url.searchParams.get('pin') || '';
      if (kataReceiveState.pin && reqPin !== kataReceiveState.pin) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Sai mã PIN' }));
        return;
      }
      const matchesWithLock = kataReceiveState.matches.map(m => ({
        ...m,
        isLocked: kataReceiveState.lockedMatchIds.has(m.id),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, matId: kataReceiveState.matId, matches: matchesWithLock }));
      return;
    }

    // API: Nhận đăng ký bài quyền từ thiết bị ngoài
    if (req.method === 'POST' && pathname === '/api/kata-receive/submit') {
      readBodyJson(req).then(data => {
        // Kiểm tra PIN
        if (kataReceiveState.pin && data.pin !== kataReceiveState.pin) {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Sai mã PIN' }));
          return;
        }
        // Chống gửi trùng bằng requestId
        if (data.requestId && kataReceiveState.receivedRequestIds.has(data.requestId)) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, duplicate: true, message: 'Đã nhận trước đó' }));
          return;
        }
        // Kiểm tra khóa
        if (kataReceiveState.lockedMatchIds.has(data.matchId)) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Trận đang diễn ra – không thể đăng ký' }));
          return;
        }
        // Ghi nhận requestId
        if (data.requestId) {
          kataReceiveState.receivedRequestIds.add(data.requestId);
          if (kataReceiveState.receivedRequestIds.size > 5000) {
            const arr = [...kataReceiveState.receivedRequestIds];
            kataReceiveState.receivedRequestIds = new Set(arr.slice(-2000));
          }
        }
        // Cập nhật trận trong state local
        const m = kataReceiveState.matches.find(m => m.id === data.matchId);
        if (m) {
          if (data.slot === 1) m.kata1 = data.kataName;
          else m.kata2 = data.kataName;
        }
        // Forward sang renderer
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('kata-receive:kata-registered', {
            matchId: data.matchId,
            slot: data.slot,
            kataName: data.kataName,
            requestId: data.requestId,
            registeredBy: data.registeredBy || '',
            registeredAt: data.registeredAt || new Date().toISOString(),
            source: 'remote',
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Thư ký đã nhận' }));
      }).catch(e => {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      });
      return;
    }

    res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'Not found' }));
  });

  kataReceiveServer.listen(3002, '0.0.0.0', () => console.log('Kata Receive Server on port 3002'));
  kataReceiveServer.on('error', err => { console.error('KataReceive error:', err); kataReceiveServer = null; });
  return { success: true, ip: getLocalIp(), port: 3002 };
}

function stopKataReceiveServer() {
  if (kataReceiveServer) {
    kataReceiveServer.close();
    kataReceiveServer = null;
  }
  kataReceiveState.matches = [];
  kataReceiveState.lockedMatchIds.clear();
}

// =============================================
// Smart File Association - Nhận diện file khi khởi động
// =============================================

// Lưu đường dẫn file được mở (qua double-click hoặc command line)
let startupFilePath = null;

/**
 * Lấy đường dẫn file .krt hoặc .kmatch từ command line arguments
 * Electron nhận file path như một argument khi user double-click file
 */
function getFilePathFromArgs(argv) {
  // Trong production: argv = [execPath, filePath]
  // Trong dev: argv = [node, electronPath, filePath]
  const args = argv.slice(app.isPackaged ? 1 : 2);
  for (const arg of args) {
    // Bỏ qua các flag bắt đầu bằng '--'
    if (arg.startsWith('--')) continue;
    // Kiểm tra xem arg có phải là đường dẫn file .krt hoặc .kmatch không
    const ext = path.extname(arg).toLowerCase();
    if ((ext === '.krt' || ext === '.kmatch') && fs.existsSync(arg)) {
      return arg;
    }
  }
  return null;
}

// Phát hiện file ngay khi app khởi động (trước khi createWindow)
startupFilePath = getFilePathFromArgs(process.argv);

// macOS: Xử lý event 'open-file' (user drop file lên dock icon)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.krt' || ext === '.kmatch') {
    startupFilePath = filePath;
    // Nếu window đã mở, gửi file path ngay
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('app:open-file', { filePath, content: fs.readFileSync(filePath, 'utf8') });
    }
  }
});

// Windows: Xử lý second-instance (app đã mở, user click file khác)
app.on('second-instance', (event, argv) => {
  const filePath = getFilePathFromArgs(argv);
  if (filePath && mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      mainWindow.webContents.send('app:open-file', { filePath, content });
    } catch (err) {
      console.error('Error reading file:', err);
    }
  }
});

// Đảm bảo chỉ có một instance của app
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

// =============================================
// IPC Handlers cho file .krt
// =============================================

// Lưu file .krt
ipcMain.handle("krt:save", async (event, content, suggestedName) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Lưu file giải đấu",
      defaultPath: suggestedName || "tournament.krt",
      filters: [{ name: "K-SPORT File", extensions: ["krt"] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(result.filePath, content, "utf8");
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Mở file .krt
ipcMain.handle("krt:open", async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Mở file giải đấu",
      filters: [{ name: "K-SPORT File", extensions: ["krt"] }],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const content = fs.readFileSync(result.filePaths[0], "utf8");
    return { success: true, content, filePath: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Lưu file xuất (Excel/JSON) cho HLV
ipcMain.handle(
  "export:save",
  async (event, content, suggestedName, fileType) => {
    try {
      let filters = [];
      if (fileType === "json") {
        filters = [{ name: "JSON File", extensions: ["json"] }];
      } else if (fileType === "kbackup") {
        filters = [{ name: "Karate Backup File", extensions: ["kbackup"] }];
      } else {
        filters = [{ name: "Excel File", extensions: ["xlsx"] }];
      }

      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Lưu file",
        defaultPath: suggestedName,
        filters,
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      // Content có thể là string (JSON) hoặc base64 (Excel)
      if (fileType === "xlsx") {
        const buffer = Buffer.from(content, "base64");
        fs.writeFileSync(result.filePath, buffer);
      } else {
        fs.writeFileSync(result.filePath, content, "utf8");
      }

      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
);

// Mở file HLV (JSON/Excel) cho Admin import
ipcMain.handle("import:open", async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import file từ HLV",
      filters: [
        { name: "Supported Files", extensions: ["json", "xlsx"] },
        { name: "JSON File", extensions: ["json"] },
        { name: "Excel File", extensions: ["xlsx"] },
      ],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".json") {
      const content = fs.readFileSync(filePath, "utf8");
      return { success: true, content, filePath, fileType: "json" };
    } else {
      const content = fs.readFileSync(filePath);
      return {
        success: true,
        content: content.toString("base64"),
        filePath,
        fileType: "xlsx",
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// =============================================
// IPC Handlers cho Secretary (.kmatch)
// =============================================

// Lưu file .kmatch (Admin xuất cho thư ký)
ipcMain.handle("kmatch:save", async (event, content, suggestedName) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Xuất file chấm điểm cho Thư ký",
      defaultPath: suggestedName || "match_data.kmatch",
      filters: [{ name: "Karate Match File", extensions: ["kmatch"] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(result.filePath, content, "utf8");
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Mở file .kmatch (Thư ký mở để chấm điểm)
ipcMain.handle("kmatch:open", async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Mở file chấm điểm",
      filters: [{ name: "Karate Match File", extensions: ["kmatch"] }],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const content = fs.readFileSync(result.filePaths[0], "utf8");
    return { success: true, content, filePath: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Kiểm tra xem đang ở chế độ development hay production
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: "K-SPORT",
    icon: path.join(__dirname, "public", "icon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
    show: false, // Ẩn cho đến khi sẵn sàng
    autoHideMenuBar: true, // Ẩn menu bar
  });

  // Load ứng dụng
  if (isDev) {
    // Development: load từ Vite dev server
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load từ build folder
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }

  // Hiện window khi đã load xong
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Gửi startup file tới renderer sau khi load xong
  mainWindow.webContents.once('did-finish-load', () => {
    if (startupFilePath) {
      try {
        const content = fs.readFileSync(startupFilePath, 'utf8');
        // Gửi sau 500ms để đảm bảo React đã mount xong
        setTimeout(() => {
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('app:open-file', {
              filePath: startupFilePath,
              content
            });
          }
        }, 800);
      } catch (err) {
        console.error('Error reading startup file:', err);
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Xử lý mở cửa sổ mới (popup) cho tất cả webContents 
app.on("web-contents-created", (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // Cho phép mở scoreboard windows bên trong Electron
    if (url.includes("kata-scoreboard") || url.includes("kumite-scoreboard") || url.includes("display.html") || url.includes("medals.html")) {
      const { screen } = require('electron');
      const displays = screen.getAllDisplays();
      
      let x = undefined;
      let y = undefined;
      let fullscreen = false;
      let width = 1400;
      let height = 900;
      
      // CHỈ bắn luồng thẳng ra màn hình thứ 2 nếu là màn hình DISPLAY (Dành cho khán giả)
      const isDisplayWindow = url.includes("display.html") || url.includes("display_new.html");
      
      if (isDisplayWindow && displays.length > 1) {
        // Tìm màn hình phụ
        const externalDisplay = displays.find(d => d.bounds.x !== 0 || d.bounds.y !== 0) || displays[1];
        if (externalDisplay) {
          x = externalDisplay.bounds.x;
          y = externalDisplay.bounds.y;
          width = externalDisplay.bounds.width;
          height = externalDisplay.bounds.height;
          fullscreen = true;
        }
      }

      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: width,
          height: height,
          x: x,
          y: y,
          fullscreen: fullscreen,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }

    // Mở link external bằng trình duyệt mặc định
    shell.openExternal(url);
    return { action: "deny" };
  });
});

// =============================================
// IPC Handler: Lấy thông tin startup file
// =============================================
ipcMain.handle('app:getStartupFile', () => {
  if (!startupFilePath) return { success: false };
  try {
    const content = fs.readFileSync(startupFilePath, 'utf8');
    const result = { success: true, filePath: startupFilePath, content };
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC Handler: Đọc nội dung file từ đường dẫn
ipcMain.handle('app:readFile', (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// =============================================
// IPC Handlers cho SQLite Database
// =============================================

// --- Tournaments ---
ipcMain.handle("db:getTournaments", () => {
  return dbService.getAllTournaments();
});

ipcMain.handle("db:saveTournaments", (event, tournaments) => {
  return dbService.saveTournaments(tournaments);
});

ipcMain.handle("db:deleteTournament", (event, id) => {
  return dbService.deleteTournament(id);
});

// --- Settings ---
ipcMain.handle("db:getSetting", (event, key) => {
  return dbService.getSetting(key);
});

ipcMain.handle("db:setSetting", (event, key, value) => {
  return dbService.setSetting(key, value);
});

ipcMain.handle("db:deleteSetting", (event, key) => {
  return dbService.deleteSetting(key);
});

// License data is encrypted by Electron safeStorage (DPAPI on Windows).
ipcMain.on("license-store:get", (event, key) => {
  try {
    event.returnValue = { success: true, value: licenseVault.get(key) };
  } catch (error) {
    event.returnValue = { success: false, error: error.message };
  }
});

ipcMain.on("license-store:set", (event, key, value) => {
  try {
    event.returnValue = { success: licenseVault.set(key, value) };
  } catch (error) {
    event.returnValue = { success: false, error: error.message };
  }
});

ipcMain.on("license-store:remove", (event, key) => {
  try {
    event.returnValue = { success: licenseVault.remove(key) };
  } catch (error) {
    event.returnValue = { success: false, error: error.message };
  }
});

ipcMain.on("license-store:clear", (event) => {
  try {
    event.returnValue = { success: licenseVault.clear() };
  } catch (error) {
    event.returnValue = { success: false, error: error.message };
  }
});
// --- Auto Backups ---
ipcMain.handle("db:saveAutoBackup", (event, id, reason, data, size) => {
  return dbService.saveAutoBackup(id, reason, data, size);
});

ipcMain.handle("db:getAutoBackups", () => {
  return dbService.getAutoBackups();
});

ipcMain.handle("db:getAutoBackupById", (event, id) => {
  return dbService.getAutoBackupById(id);
});

// --- Backup History ---
ipcMain.handle("db:saveBackupHistory", (event, meta) => {
  return dbService.saveBackupHistory(meta);
});

ipcMain.handle("db:getBackupHistory", () => {
  return dbService.getBackupHistory();
});

// --- Session Data (Coach/Secretary) ---
ipcMain.handle("db:getSessionData", (event, tournamentId, key) => {
  return dbService.getSessionData(tournamentId, key);
});

ipcMain.handle("db:setSessionData", (event, tournamentId, key, value) => {
  return dbService.setSessionData(tournamentId, key, value);
});

ipcMain.handle("db:deleteSessionData", (event, tournamentId, key) => {
  return dbService.deleteSessionData(tournamentId, key);
});

// --- Migration from localStorage ---
ipcMain.handle("db:importFromLocalStorage", (event, lsData) => {
  return dbService.importFromLocalStorage(lsData);
});

ipcMain.handle("db:isMigrationDone", () => {
  return dbService.isMigrationDone();
});

ipcMain.handle("db:markMigrationDone", () => {
  dbService.markMigrationDone();
  return true;
});

// --- Stats ---
ipcMain.handle("db:getDataStats", () => {
  return dbService.getDataStats();
});

// --- LAN Server (Dual Combat Mode) ---
ipcMain.handle("lan:getServerStatus", () => {
  return {
    running: lanServer !== null,
    ip: getLocalIp(),
    port: 3000,
    liveStatuses: Array.from(lanLiveStatuses.values()),
  };
});

ipcMain.handle("lan:openTvDisplay", async () => {
  if (!lanServer) return { success: false, error: "Hãy bật máy chủ nhận điểm trước" };
  const displayId = "all";

  const existingWindow = tvDisplayWindows.get(displayId);
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.show();
    existingWindow.focus();
    existingWindow.webContents.reloadIgnoringCache();
    return { success: true, reused: true };
  }

  const { screen } = require("electron");
  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find((display) => display.bounds.x !== 0 || display.bounds.y !== 0);
  const bounds = externalDisplay?.bounds;
  const tvWindow = new BrowserWindow({
    width: bounds?.width || 1400,
    height: bounds?.height || 900,
    x: bounds?.x,
    y: bounds?.y,
    fullscreen: Boolean(externalDisplay),
    autoHideMenuBar: true,
    backgroundColor: "#0d192b",
    title: "K-SPORT TV - Tất cả thảm",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  tvDisplayWindows.set(displayId, tvWindow);
  tvWindow.on("closed", () => tvDisplayWindows.delete(displayId));
  await tvWindow.loadURL("http://127.0.0.1:3000/tv/all");
  return { success: true };
});
ipcMain.handle("lan:startServer", (event) => {
  if (lanServer) return { success: true, message: "Máy chủ đang chạy" };

  try {
    lanServer = http.createServer((req, res) => {
      const requestUrl = new URL(req.url, "http://127.0.0.1:3000");
      const pathname = requestUrl.pathname;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Cache-Control", "no-store");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "GET" && pathname === "/api/live-status") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: true, data: Array.from(lanLiveStatuses.values()) }));
        return;
      }

      if (req.method === "GET" && pathname === "/assets/ksport-logo.png") {
        try {
          const logo = fs.readFileSync(path.join(__dirname, "public", "icon.png"));
          res.writeHead(200, { "Content-Type": "image/png", "Content-Length": logo.length });
          res.end(logo);
        } catch (error) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`Không thể tải logo K-SPORT: ${error.message}`);
        }
        return;
      }

      if (req.method === "GET" && /^\/tv\/[A-Za-z0-9_-]+$/.test(pathname)) {
        // The TV route is a single dashboard showing every active mat.
        try {
          const html = fs.readFileSync(path.join(__dirname, "public", "lan-tv.html"), "utf8");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
        } catch (error) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`Không thể mở màn hình TV: ${error.message}`);
        }
        return;
      }

      if (req.method === "GET" && pathname === "/api/live-status/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write("retry: 1500\n\n");
        lanLiveStatusClients.add(res);
        sendLanLiveStatusEvent(res, "live-status", Array.from(lanLiveStatuses.values()));
        const heartbeatId = setInterval(() => res.write(": heartbeat\n\n"), 10000);
        req.on("close", () => {
          clearInterval(heartbeatId);
          lanLiveStatusClients.delete(res);
        });
        return;
      }

      const jsonPostRoutes = ["/api/match-result", "/api/category-medals", "/api/live-status"];
      if (req.method === "POST" && jsonPostRoutes.includes(pathname)) {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
          if (body.length > 1024 * 1024) req.destroy();
        });
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (pathname === "/api/live-status") {
              const matId = String(data.matId || "1");
              if (!/^[A-Za-z0-9_-]{1,32}$/.test(matId) || !data.current?.name) {
                throw new Error("Thiếu mã thảm hoặc nội dung đang thi đấu");
              }
              const liveRow = {
                tournament_id: String(data.tournamentId || ""),
                tournament_name: String(data.tournamentName || ""),
                mat_id: matId,
                data: {
                  current: data.current,
                  next: data.next || null,
                  matchCode: data.matchCode || null,
                  roundName: data.roundName || null,
                },
                updated_at: new Date().toISOString(),
              };
              lanLiveStatuses.set(matId, liveRow);
              broadcastLanLiveStatuses();
              if (mainWindow) mainWindow.webContents.send("lan:live-status", liveRow);
              res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ success: true, data: liveRow }));
              return;
            }

            if (mainWindow) mainWindow.webContents.send("lan:receive-result", data);
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: true }));
          } catch (error) {
            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: false, error: error.message || "Dữ liệu không hợp lệ" }));
          }
        });
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ success: false, error: "Không tìm thấy đường dẫn" }));
    });
    lanServer.listen(3000, "0.0.0.0", () => {
      console.log("LAN Score Server running on port 3000");
    });

    lanServer.on("error", (err) => {
      console.error("LAN Server error:", err);
      lanServer = null;
    });

    return { success: true, ip: getLocalIp() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("lan:stopServer", () => {
  if (lanServer) {
    for (const window of tvDisplayWindows.values()) {
      if (!window.isDestroyed()) window.close();
    }
    tvDisplayWindows.clear();
    for (const client of lanLiveStatusClients) client.end();
    lanLiveStatusClients.clear();
    lanLiveStatuses.clear();
    lanServer.close();
    lanServer = null;
    return { success: true };
  }
  return { success: true, message: "Máy chủ chưa chạy" };
});
// =============================================
// IPC Handlers cho Kata Receive Server
// =============================================

ipcMain.handle('kata-receive:start', (event, { matId, pin }) => {
  return startKataReceiveServer(matId, pin);
});

ipcMain.handle('kata-receive:stop', () => {
  stopKataReceiveServer();
  return { success: true };
});

ipcMain.handle('kata-receive:getStatus', () => {
  return {
    running: kataReceiveServer !== null,
    ip: getLocalIp(),
    port: 3002,
    matId: kataReceiveState.matId,
    pin: kataReceiveState.pin,
    matchCount: kataReceiveState.matches.length,
  };
});

ipcMain.handle('kata-receive:updateMatches', (event, matches) => {
  kataReceiveState.matches = (matches || []).map(m => ({
    id: m.id,
    matchCode: m.matchCode || '',
    roundName: m.roundName || '',
    categoryId: m.categoryId || '',
    categoryName: m.categoryName || '',
    isCompleted: !!m.isCompleted,
    athlete1: m.athlete1 ? { id: m.athlete1.id, name: m.athlete1.name, club: m.athlete1.club } : null,
    athlete2: m.athlete2 ? { id: m.athlete2.id, name: m.athlete2.name, club: m.athlete2.club } : null,
    kata1: m.kata1 || '',
    kata2: m.kata2 || '',
  }));
  return { success: true };
});

ipcMain.handle('kata-receive:lockMatch', (event, matchId) => {
  kataReceiveState.lockedMatchIds.add(matchId);
  return { success: true };
});

ipcMain.handle('kata-receive:unlockMatch', (event, matchId) => {
  kataReceiveState.lockedMatchIds.delete(matchId);
  return { success: true };
});

// =============================================
// IPC Handlers cho Vector PDF Export (printToPDF)
// =============================================

/**
 * Helper: Write HTML to a temp file and return file:// URL.
 * We use temp files instead of data: URLs because base64 data URLs
 * have a size limit in Chromium (~2MB) and bracket HTML with embedded
 * base64 images easily exceeds this.
 */
function writeTempHtml(htmlContent) {
  const tmpDir = path.join(os.tmpdir(), 'karate-pdf-export');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `bracket_${Date.now()}_${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmpFile, htmlContent, 'utf-8');
  return tmpFile;
}

function cleanupTempFile(filePath) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
}

/**
 * Render bracket HTML in a hidden BrowserWindow and export to PDF.
 * Key: We measure the ACTUAL rendered content size INSIDE the hidden window
 * using executeJavaScript, then set the PDF page to match exactly.
 * This prevents any shrinking or mismatched scaling.
 */
ipcMain.handle('pdf:printBracket', async (event, { htmlContent, widthMM, heightMM, filename }) => {
  let tmpFile = null;
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Lưu sơ đồ thi đấu PDF',
      defaultPath: filename || 'so_do_thi_dau.pdf',
      filters: [{ name: 'PDF File', extensions: ['pdf'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Create hidden window — very wide so content never wraps
    const printWin = new BrowserWindow({
      show: false,
      width: 4000,
      height: 3000,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        offscreen: true,
      },
    });

    // Write HTML to temp file and load
    tmpFile = writeTempHtml(htmlContent);
    await printWin.loadFile(tmpFile);

    // Wait for content to fully render
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Measure ACTUAL content size inside the hidden window (in CSS px)
    const measured = await printWin.webContents.executeJavaScript(`
      (function() {
        var el = document.querySelector('.pdf-bracket');
        if (!el) return JSON.stringify({ width: document.body.scrollWidth, height: document.body.scrollHeight });
        return JSON.stringify({
          width: el.offsetWidth,
          height: el.offsetHeight
        });
      })()
    `);
    const contentSize = JSON.parse(measured);

    // A3 landscape: 420x297mm
    const A3_W_IN = 420 / 25.4;
    const A3_H_IN = 297 / 25.4;
    const MARGIN_IN = 0.15;
    const printableW_px = (A3_W_IN - MARGIN_IN * 2) * 96;
    const printableH_px = (A3_H_IN - MARGIN_IN * 2) * 96;

    // Compute zoom to fit content into A3 (scale uniformly, no 2nd blank page)
    const zoomX = printableW_px / contentSize.width;
    const zoomY = printableH_px / contentSize.height;
    const zoom = Math.min(zoomX, zoomY);
    const zoomPct = (zoom * 100).toFixed(3) + '%';

    // Apply CSS zoom + overflow:hidden to enforce single-page
    await printWin.webContents.executeJavaScript(`
      (function() {
        var el = document.querySelector('.pdf-bracket') || document.body.firstElementChild;
        if (el) el.style.zoom = '${zoomPct}';
        document.body.style.overflow = 'hidden';
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        document.documentElement.style.overflow = 'hidden';
      })()
    `);
    await new Promise(resolve => setTimeout(resolve, 400));

    // Always output single A3 landscape page
    const pdfBuffer = await printWin.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: A3_W_IN, height: A3_H_IN },
      margins: { top: MARGIN_IN, bottom: MARGIN_IN, left: MARGIN_IN, right: MARGIN_IN },
      scale: 1,
    });

    printWin.close();
    cleanupTempFile(tmpFile);

    fs.writeFileSync(result.filePath, pdfBuffer);
    return { success: true, filePath: result.filePath };
  } catch (error) {
    if (tmpFile) cleanupTempFile(tmpFile);
    console.error('Error in pdf:printBracket:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Render multiple bracket HTML pages into a single merged PDF.
 * Each page is measured individually in its hidden window.
 */
ipcMain.handle('pdf:printBracketMulti', async (event, { pages, filename }) => {
  const tmpFiles = [];
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Lưu tất cả sơ đồ thi đấu PDF',
      defaultPath: filename || 'tat_ca_so_do.pdf',
      filters: [{ name: 'PDF File', extensions: ['pdf'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Merge all pages into one PDF using pdf-lib
    const mergedPdf = await PDFDocument.create();

    // A3 landscape constants
    const A3_W_IN = 420 / 25.4;
    const A3_H_IN = 297 / 25.4;
    const MARGIN_IN = 0.2;
    const printableW_px = (A3_W_IN - MARGIN_IN * 2) * 96;
    const printableH_px = (A3_H_IN - MARGIN_IN * 2) * 96;

    for (let i = 0; i < pages.length; i++) {
      const { htmlContent } = pages[i];

      const printWin = new BrowserWindow({
        show: false,
        width: 4000,
        height: 3000,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          offscreen: true,
        },
      });

      const tmpFile = writeTempHtml(htmlContent);
      tmpFiles.push(tmpFile);
      await printWin.loadFile(tmpFile);
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Measure content size
      const measured = await printWin.webContents.executeJavaScript(`
        (function() {
          var el = document.querySelector('.pdf-bracket');
          if (!el) return JSON.stringify({ width: document.body.scrollWidth, height: document.body.scrollHeight });
          return JSON.stringify({
            width: el.offsetWidth,
            height: el.offsetHeight
          });
        })()
      `);
      const contentSize = JSON.parse(measured);

      // Compute zoom to fit content into A3 (scale uniformly, no 2nd blank page)
      const zoomX = printableW_px / contentSize.width;
      const zoomY = printableH_px / contentSize.height;
      const zoom = Math.min(zoomX, zoomY);
      const zoomPct = (zoom * 100).toFixed(3) + '%';

      // Apply CSS zoom + overflow:hidden to enforce single-page output
      await printWin.webContents.executeJavaScript(`
        (function() {
          var el = document.querySelector('.pdf-bracket') || document.body.firstElementChild;
          if (el) el.style.zoom = '${zoomPct}';
          document.body.style.overflow = 'hidden';
          document.body.style.margin = '0';
          document.body.style.padding = '0';
          document.documentElement.style.overflow = 'hidden';
        })()
      `);
      await new Promise(resolve => setTimeout(resolve, 400));

      const pdfBuffer = await printWin.webContents.printToPDF({
        printBackground: true,
        pageSize: { width: A3_W_IN, height: A3_H_IN },
        margins: { top: MARGIN_IN, bottom: MARGIN_IN, left: MARGIN_IN, right: MARGIN_IN },
        scale: 1,
      });

      printWin.close();

      // Merge this page into the combined PDF
      const pagePdf = await PDFDocument.load(pdfBuffer);
      const copiedPages = await mergedPdf.copyPages(pagePdf, pagePdf.getPageIndices());
      copiedPages.forEach(page => mergedPdf.addPage(page));

      // Notify renderer of progress
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('pdf:progress', { current: i + 1, total: pages.length });
      }
    }

    // Cleanup temp files
    tmpFiles.forEach(f => cleanupTempFile(f));

    const mergedBytes = await mergedPdf.save();
    fs.writeFileSync(result.filePath, Buffer.from(mergedBytes));
    return { success: true, filePath: result.filePath, pageCount: pages.length };
  } catch (error) {
    tmpFiles.forEach(f => cleanupTempFile(f));
    console.error('Error in pdf:printBracketMulti:', error);
    return { success: false, error: error.message };
  }
});

// Khi Electron sẵn sàng
app.whenReady().then(() => {
  // Khởi tạo SQLite Database
  const userDataPath = app.getPath("userData");
  dbService.initDatabase(userDataPath);

  createWindow();

  // Cấu hình cập nhật
  autoUpdater.autoDownload = false; // Không tự động tải, hỏi người dùng trước

  autoUpdater.on("update-available", (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Có bản cập nhật mới",
        message: `Đã có phiên bản mới (${info.version}). Bạn có muốn tải xuống và cập nhật ngay không?`,
        buttons: ["Tải xuống", "Để sau"],
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("Đang sử dụng phiên bản mới nhất.");
  });

  autoUpdater.on("error", (err) => {
    console.error("Lỗi hệ thống cập nhật:", err);
  });

  autoUpdater.on("update-downloaded", () => {
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Đã tải xong bản cập nhật",
        message:
          "Bản cập nhật đã tải xong. Ứng dụng sẽ khởi động lại để cài đặt.",
        buttons: ["Cài đặt ngay", "Để sau"],
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 1500);
  }

  // macOS: Tạo lại window khi click vào dock icon
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Thoát khi tất cả windows đóng (trừ macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    dbService.closeDatabase();
    app.quit();
  }
});

app.on("before-quit", () => {
  dbService.closeDatabase();
});

// Xử lý lỗi
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});
