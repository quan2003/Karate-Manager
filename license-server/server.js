const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const crypto = require("crypto");

// Load Environment Variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 2000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "admin_secret_key_change_me"; // Should ideally be a strong secret

// --- Rate Limiter ---
const limiter = rateLimit({
  windowMs: process.env.WINDOW_MS || 15 * 60 * 1000,
  max: process.env.MAX_REQUESTS || 100, // Limit each IP
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Middleware ---
app.use(limiter);
app.use(cors({ origin: "*" })); // Adjust in production
app.use(morgan("combined"));
app.use(bodyParser.json());

// --- Database (File-based JSON) ---
const DB_FILE = path.join(__dirname, "licenses.json");

// Helper: Get DB
const getDb = () => {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ licenses: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
};

// Helper: Save DB
const saveDb = (data) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// Start clean DB if not exists
getDb();

// --- Routes ---

/**
 * Health Check
 */
app.get("/", (req, res) => {
  res.send("Karate License Server is RUNNING");
});

/**
 * CREATE LICENSE (Admin Protected)
 */
app.post("/api/license/create", (req, res) => {
  const { secret, type, days, maxMachines, clientName } = req.body;

  if (secret !== ADMIN_SECRET) {
    return res
      .status(403)
      .json({ success: false, message: "Sai mã bảo mật Admin" });
  }

  const db = getDb();
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + (days || 30));

  // Generate unique ID
  const licenseId = crypto.randomUUID();

  // Create license object (matching v2 schema somewhat, but simpler for server logic)
  // The client generates complex keys. Here we just store records.
  // Actually, the client expects the server to return a KEY.
  // We need to implement key generation here or accept a generated one.
  // Based on previous code, the server generated a simple key.
  // But the NEW client code expects complex keys.
  // The new client `generateLicenseKey` calls this endpoint.
  // AND the new client code `generateLicenseKey` seems to generate the key LOCALLY if it's offline?
  // No, the client code I wrote earlier calls this endpoint to get a key.
  // Wait, let's re-read the client service I just wrote.
  // `generateLicenseKey` (client) constructs the key LOCALLY using `crypto` and `base64`.
  // It effectively IGNORES the server for generation logic in the latest client file I wrote (Step 112).
  // Wait, I need to check `src/services/licenseService.js`.
  
  // Checking client implementation...
  // In `src/services/licenseService.js` (Step 112), `generateLicenseKey` constructs the key LOCALLY.
  // It does NOT call the server.
  // The server is only used for `validateLicenseKey` (verification) and `activateLicense`.
  // So the *creation* logic seems to have moved to client-side (Owner Page).
  // BUT the user asked for "API create license".
  // If the Owner Page generates the key locally, it should probably SEND it to the server to save it.
  // Currently, `saveGeneratedLicense` in client just saves to localStorage.
  // This is a disconnect.
  // The Owner Page should call the server to SAVE the generated key.
  // OR the server should generate it.
  
  // Let's implement the server to Support BOTH.
  // 1. Generate new key if requested.
  // 2. Save a provided key (if client generated it).
  
  // For now, I will stick to what the previous server code did (Generate) but enhanced.
  // However, since the Client code (OwnerPage) I updated might use local generation, 
  // I should provide an endpoint to SYNC generated keys.
  
  // Let's assume the standard flow:
  // Admin -> Client App (Owner Page) -> Call Server /api/license/create -> Server generates & saves -> Returns Key -> Client displays.
  
  // I'll implement Key Generation logic here too, using the same algorithm if possible, or a simpler one.
  // Actually, to align with the "Offline-first but synced" approach, or "Online-first", 
  // ensuring the server is the source of truth is better.
  
  // I will implement generation here.
  
  const licenseKey = `KRT-${type.toUpperCase().substring(0, 1)}-${Math.random()
    .toString(36)
    .substring(2, 7)
    .toUpperCase()}-${Math.random()
    .toString(36)
    .substring(2, 7)
    .toUpperCase()}`;

  const newLicense = {
    id: licenseId,
    key: licenseKey, // Simple key for now, or use the complex structure if I port the libs.
    // To match the client's complex key expectation, I should ideally use that.
    // But for now, let's just use a simple string. The client's `validateLicenseKey` can handle simple strings?
    // The client's `validateLicenseKey` tries to decode Base64. If it fails, it returns error.
    // So the Server MUST generate a Base64 encoded key matching the schema.
    
    // I will use a simple Base64 generator here to match the client's v2 schema.
    type: type || "trial",
    clientName: clientName || "Unknown",
    createdAt: new Date().toISOString(),
    expiryDate: expiryDate.toISOString(),
    maxMachines: maxMachines || 1,
    activatedMachines: [],
    status: "active",
    history: [], // For audit
  };

  // Generate Base64 Key (Simplified version of client logic)
  const licenseDataContent = {
     v: 2,
     t: newLicense.type,
     o: newLicense.clientName,
     c: newLicense.createdAt,
     e: newLicense.expiryDate,
     mm: newLicense.maxMachines,
     tmids: [], // No specific machine lock initially
     kv: 1,
     id: newLicense.id
  };
  const encoded =  Buffer.from(JSON.stringify(licenseDataContent)).toString('base64');
  // Add prefix
  const prefix = newLicense.type.charAt(0).toUpperCase();
  // Chunking
  const chunks = encoded.match(/.{1,5}/g) || [];
  newLicense.key = `KRT-${prefix}-${chunks.slice(0, 5).join("-")}`; // Truncated for readability or full?
  // Client uses full raw?
  // Client `generateLicenseKey` returns `raw` (full base64) and `key` (formatted). 
  // The server should return both. 
  // Actually, let's just return the full object.
  // IMPORTANT: The server must store the FULL raw key or the essential data to validate.
  
  newLicense.raw = encoded; // Store full encoded string

  db.licenses.unshift(newLicense);
  saveDb(db);

  res.json({ success: true, license: newLicense });
});

/**
 * VERIFY LICENSE (Public/Client)
 * This is called by the App when entering a key.
 */
app.post("/api/license/verify", (req, res) => {
  const { key, machineId } = req.body;

  if (!key || !machineId) {
    return res.status(400).json({ success: false, message: "Thiếu thông tin" });
  }

  const db = getDb();
  
  // Find by exact match on Raw Key or Formatted Key
  // Or check if the key decodes to a valid ID in our DB?
  // For simplicity, we compare `key` against stored `key` or `raw`.
  const license = db.licenses.find((l) => l.key === key || l.raw === key);

  if (!license) {
    return res.json({ success: false, valid: false, message: "License không tồn tại hệ thống" });
  }

  // Check Status
  if (license.status !== "active") {
    return res.json({ success: false, valid: false, message: "License đã bị vô hiệu hóa" });
  }

  // Check Expiry
  if (new Date() > new Date(license.expiryDate)) {
    return res.json({ success: false, valid: false, message: "License đã hết hạn", expired: true });
  }

  // Check Machine ID
  const isActivatedOnThisMachine = license.activatedMachines.includes(machineId);

  if (isActivatedOnThisMachine) {
    return res.json({
      success: true,
      valid: true,
      message: "License hợp lệ",
      data: license,
    });
  }

  // Limit Check
  if (license.activatedMachines.length < license.maxMachines) {
    // Activate new machine
    license.activatedMachines.push(machineId);
    saveDb(db);
    return res.json({
      success: true,
      valid: true,
      message: "Kích hoạt thành công thiết bị mới",
      data: license,
    });
  } else {
    return res.json({
      success: false,
      valid: false,
      message: `Đã đạt giới hạn số máy (${license.maxMachines})`,
    });
  }
});

/**
 * LIST LICENSES (Admin)
 */
app.get("/api/license/list", (req, res) => {
    const { secret } = req.query; // Simple query param auth
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });

    const db = getDb();
    res.json({ success: true, count: db.licenses.length, licenses: db.licenses });
});

/**
 * RESET MACHINES (Admin)
 */
app.post("/api/license/reset", (req, res) => {
  const { secret, key } = req.body;
  
  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ success: false, message: "Sai mã bảo mật" });
  }

  const db = getDb();
  const license = db.licenses.find((l) => l.key === key || l.raw === key);

  if (license) {
    license.activatedMachines = [];
    saveDb(db);
    res.json({ success: true, message: "Đã reset danh sách máy" });
  } else {
    res.status(404).json({ success: false, message: "License không tìm thấy" });
  }
});

/**
 * REVOKE LICENSE (Deactivate)
 */
app.post("/api/license/revoke", (req, res) => {
    const { secret, key } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });

    const db = getDb();
    const license = db.licenses.find((l) => l.key === key || l.raw === key);

    if (license) {
        license.status = "revoked";
        saveDb(db);
        res.json({ success: true, message: "Đã thu hồi license" });
    } else {
        res.status(404).json({ success: false, message: "License không tìm thấy" });
    }
});

/**
 * EXTEND LICENSE
 */
app.post("/api/license/extend", (req, res) => {
    const { secret, key, days } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });

    const db = getDb();
    const license = db.licenses.find((l) => l.key === key || l.raw === key);

    if (license) {
        const currentExpiry = new Date(license.expiryDate);
        currentExpiry.setDate(currentExpiry.getDate() + parseInt(days));
        license.expiryDate = currentExpiry.toISOString();
        saveDb(db);
        res.json({ success: true, message: `Đã gia hạn thêm ${days} ngày`, newExpiry: license.expiryDate });
    } else {
        res.status(404).json({ success: false, message: "License không tìm thấy" });
    }
});

// Start Server
app.listen(PORT, () => {
  console.log(`License Server running on port ${PORT}`);
});
