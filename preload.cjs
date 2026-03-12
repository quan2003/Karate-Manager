const { contextBridge, ipcRenderer, clipboard } = require("electron");

// Expose các API an toàn cho renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // Phiên bản
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },

  // =============================================
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
  // IPC communication (legacy)
  // =============================================
  send: (channel, data) => {
    const validChannels = ["app:minimize", "app:maximize", "app:close"];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  receive: (channel, func) => {
    const validChannels = ["app:update-available"];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
});

// Log để xác nhận preload đã chạy
console.log("Electron preload script loaded");
