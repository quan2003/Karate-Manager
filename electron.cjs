const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const dbService = require("./database.cjs");

// Biến giữ window chính
let mainWindow = null;

// =============================================
// IPC Handlers cho file .krt
// =============================================

// Lưu file .krt
ipcMain.handle("krt:save", async (event, content, suggestedName) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Lưu file giải đấu",
      defaultPath: suggestedName || "tournament.krt",
      filters: [{ name: "Karate Tournament File", extensions: ["krt"] }],
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
      filters: [{ name: "Karate Tournament File", extensions: ["krt"] }],
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
    title: "Karate Tournament Manager",
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

  // Xử lý mở cửa sổ mới (popup)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Cho phép mở scoreboard windows bên trong Electron
    if (url.includes("kata-scoreboard") || url.includes("kumite-scoreboard")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1400,
          height: 900,
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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

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
