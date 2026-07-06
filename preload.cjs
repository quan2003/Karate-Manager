const { contextBridge, ipcRenderer, clipboard } = require("electron");

// Expose các API an toàn cho renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // =============================================
  // Smart File Association APIs
  // =============================================

  // Lấy file được mở khi khởi động app
  getStartupFile: () => ipcRenderer.invoke('app:getStartupFile'),

  // Đọc nội dung file từ đường dẫn
  readFile: (filePath) => ipcRenderer.invoke('app:readFile', filePath),

  // Lắng nghe khi user mở file trong khi app đang chạy
  onOpenFile: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('app:open-file', handler);
    return () => ipcRenderer.removeListener('app:open-file', handler);
  },

  // Phiên bản
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },

  // =============================================
  // Encrypted license storage owned by the Electron main process.
  licenseStore: {
    get: (key) => ipcRenderer.sendSync("license-store:get", key),
    set: (key, value) => ipcRenderer.sendSync("license-store:set", key, value),
    remove: (key) => ipcRenderer.sendSync("license-store:remove", key),
    clear: () => ipcRenderer.sendSync("license-store:clear"),
  },
  // Clipboard Operations
  // =============================================

  // Copy text to clipboard
  copyToClipboard: (text) => {
    clipboard.writeText(text);
    return Promise.resolve(true);
  },

  // Read text from clipboard
  readFromClipboard: () => {
    return Promise.resolve(clipboard.readText());
  },

  // =============================================
  // KRT File Operations
  // =============================================

  // Lưu file .krt
  saveKrtFile: (content, suggestedName) => {
    return ipcRenderer.invoke("krt:save", content, suggestedName);
  },

  // Mở file .krt
  openKrtFile: () => {
    return ipcRenderer.invoke("krt:open");
  },

  // =============================================
  // Export/Import Operations (HLV <-> Admin)
  // =============================================

  // Xuất file (Excel/JSON) cho HLV
  saveExportFile: (content, suggestedName, fileType) => {
    return ipcRenderer.invoke("export:save", content, suggestedName, fileType);
  },

  // Import file từ HLV (cho Admin)
  openImportFile: () => {
    return ipcRenderer.invoke("import:open");
  },

  // =============================================
  // Secretary Operations (.kmatch)
  // =============================================

  // Lưu file .kmatch
  saveKmatchFile: (content, suggestedName) => {
    return ipcRenderer.invoke("kmatch:save", content, suggestedName);
  },

  // Mở file .kmatch
  openKmatchFile: () => {
    return ipcRenderer.invoke("kmatch:open");
  },

  // =============================================
  // SQLite Database Operations
  // =============================================
  db: {
    // Tournaments
    getTournaments: () => ipcRenderer.invoke('db:getTournaments'),
    saveTournaments: (tournaments) => ipcRenderer.invoke('db:saveTournaments', tournaments),
    deleteTournament: (id) => ipcRenderer.invoke('db:deleteTournament', id),

    // Settings
    getSetting: (key) => ipcRenderer.invoke('db:getSetting', key),
    setSetting: (key, value) => ipcRenderer.invoke('db:setSetting', key, value),
    deleteSetting: (key) => ipcRenderer.invoke('db:deleteSetting', key),

    // Auto backups
    saveAutoBackup: (id, reason, data, size) => ipcRenderer.invoke('db:saveAutoBackup', id, reason, data, size),
    getAutoBackups: () => ipcRenderer.invoke('db:getAutoBackups'),
    getAutoBackupById: (id) => ipcRenderer.invoke('db:getAutoBackupById', id),

    // Backup history
    saveBackupHistory: (meta) => ipcRenderer.invoke('db:saveBackupHistory', meta),
    getBackupHistory: () => ipcRenderer.invoke('db:getBackupHistory'),

    // Session data (Coach / Secretary)
    getSessionData: (tournamentId, key) => ipcRenderer.invoke('db:getSessionData', tournamentId, key),
    setSessionData: (tournamentId, key, value) => ipcRenderer.invoke('db:setSessionData', tournamentId, key, value),
    deleteSessionData: (tournamentId, key) => ipcRenderer.invoke('db:deleteSessionData', tournamentId, key),

    // Migration
    importFromLocalStorage: (lsData) => ipcRenderer.invoke('db:importFromLocalStorage', lsData),
    isMigrationDone: () => ipcRenderer.invoke('db:isMigrationDone'),
    markMigrationDone: () => ipcRenderer.invoke('db:markMigrationDone'),

    // Stats
    getDataStats: () => ipcRenderer.invoke('db:getDataStats'),
  },

  // =============================================
  // LAN Server Operations (Dual Combat)
  // =============================================
  lan: {
    startServer: () => ipcRenderer.invoke('lan:startServer'),
    stopServer: () => ipcRenderer.invoke('lan:stopServer'),
    getServerStatus: () => ipcRenderer.invoke('lan:getServerStatus'),
  },

  // =============================================
  // Vector PDF Export (printToPDF) Operations
  // =============================================
  pdf: {
    // Export a single bracket to PDF (vector, custom page size)
    printBracket: (data) => ipcRenderer.invoke('pdf:printBracket', data),
    // Export multiple brackets into one merged PDF
    printBracketMulti: (data) => ipcRenderer.invoke('pdf:printBracketMulti', data),
    // Listen for progress updates during multi-page export
    onProgress: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('pdf:progress', handler);
      return () => ipcRenderer.removeListener('pdf:progress', handler);
    },
  },

  // =============================================
  // IPC communication (legacy)
  // =============================================
  send: (channel, data) => {
    const validChannels = ["app:minimize", "app:maximize", "app:close"];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  receive: (channel, func) => {
    const validChannels = ["app:update-available", "lan:receive-result", "app:open-file", "pdf:progress"];
    if (validChannels.includes(channel)) {
      const subscription = (event, ...args) => func(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
});

// Log để xác nhận preload đã chạy
console.log("Electron preload script loaded");
