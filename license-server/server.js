const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const crypto = require("crypto");
const { Pool } = require("pg");

// Load Environment Variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 2000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "admin_secret_key_change_me";

// --- PostgreSQL Setup ---
const pool = new Pool({
  user: process.env.PG_USER || "postgres",
  host: process.env.PG_HOST || "localhost",
  database: process.env.PG_DATABASE || "karate_license_db",
  password: process.env.PG_PASSWORD || "postgres",
  port: process.env.PG_PORT ? parseInt(process.env.PG_PORT) : 5432,
});

// Test Connection & Initialize Schema
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("Lỗi kết nối PostgreSQL:", err.stack);
  } else {
    console.log("Kết nối PostgreSQL thành công:", res.rows[0].now);
    initializeSchema();
  }
});

const initializeSchema = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS licenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT UNIQUE NOT NULL,
      raw_key TEXT,
      type VARCHAR(50) NOT NULL,
      client_name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expiry_date TIMESTAMPTZ NOT NULL,
      max_machines INTEGER DEFAULT 1,
      activated_machines TEXT[] DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'active',
      history JSONB DEFAULT '[]'::jsonb
    );
  `;
  try {
    await pool.query(createTableQuery);
    console.log("Schema initialized successfully.");
  } catch (err) {
    console.error("Error creating schema:", err);
  }
};

// --- Middleware ---
const limiter = rateLimit({
  windowMs: process.env.WINDOW_MS || 15 * 60 * 1000,
  max: process.env.MAX_REQUESTS || 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(cors({ origin: "*" }));
app.use(morgan("combined"));
app.use(bodyParser.json());

// --- Routes ---

app.get("/", (req, res) => {
  res.send("Karate License Server (PostgreSQL) is RUNNING");
});

/**
 * CREATE LICENSE (Admin Only)
 */
app.post("/api/license/create", async (req, res) => {
  const { secret, type, days, maxMachines, clientName } = req.body;

  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ success: false, message: "Sai mã bảo mật Admin" });
  }

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + (days || 30));

  // Generate License Data
  const licenseId = crypto.randomUUID();
  const licenseDataContent = {
     v: 2,
     t: type || "trial",
     o: clientName || "Unknown",
     c: new Date().toISOString(),
     e: expiryDate.toISOString(),
     mm: maxMachines || 1,
     tmids: [], 
     kv: 1,
     id: licenseId
  };

  const rawKey = Buffer.from(JSON.stringify(licenseDataContent)).toString('base64');
  
  // Format Key: KRT-T-XXXXX-XXXXX
  const prefix = (type || "trial").charAt(0).toUpperCase();
  const chunks = rawKey.match(/.{1,5}/g) || [];
  const formattedKey = `KRT-${prefix}-${chunks.slice(0, 5).join("-")}`;

  const query = `
    INSERT INTO licenses (id, key, raw_key, type, client_name, expiry_date, max_machines, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
    RETURNING *;
  `;
  
  try {
    const result = await pool.query(query, [
      licenseId,
      formattedKey,
      rawKey,
      type || "trial",
      clientName || "Unknown",
      expiryDate,
      maxMachines || 1
    ]);

    const newLicense = result.rows[0];
    
    // Convert DB structure to API response structure (to support existing client)
    const responseLicense = {
        key: newLicense.key,
        raw: newLicense.raw_key,
        type: newLicense.type,
        clientName: newLicense.client_name,
        expiryDate: newLicense.expiry_date,
        maxMachines: newLicense.max_machines
    };

    res.json({ success: true, license: responseLicense });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi tạo license" });
  }
});

/**
 * VERIFY LICENSE (Client App)
 */
app.post("/api/license/verify", async (req, res) => {
  const { key, machineId } = req.body;

  if (!key || !machineId) {
    return res.status(400).json({ success: false, message: "Thiếu thông tin key hoặc machineId" });
  }

  // Find License
  const query = `SELECT * FROM licenses WHERE key = $1 OR raw_key = $1`;
  
  try {
    const result = await pool.query(query, [key]);
    
    if (result.rows.length === 0) {
      return res.json({ success: false, valid: false, message: "License không tồn tại" });
    }

    const license = result.rows[0];

    // Check Status
    if (license.status !== 'active') {
      return res.json({ success: false, valid: false, message: "License đã bị vô hiệu hóa/thu hồi" });
    }

    // Check Expiry
    if (new Date() > new Date(license.expiry_date)) {
      return res.json({ success: false, valid: false, message: "License đã hết hạn", expired: true });
    }

    // Check Machine ID
    const activatedMachines = license.activated_machines || [];
    const isActivated = activatedMachines.includes(machineId);

    if (isActivated) {
      return res.json({
        success: true,
        valid: true,
        message: "License hợp lệ",
        data: {
            type: license.type,
            clientName: license.client_name,
            expiryDate: license.expiry_date,
            maxMachines: license.max_machines
        }
      });
    }

    // Check Limit & Activate New Machine
    if (activatedMachines.length < license.max_machines) {
      const updateQuery = `
        UPDATE licenses 
        SET activated_machines = array_append(activated_machines, $1)
        WHERE id = $2
        RETURNING *;
      `;
      const updateResult = await pool.query(updateQuery, [machineId, license.id]);
      const updatedLicense = updateResult.rows[0];

      return res.json({
        success: true,
        valid: true,
        message: "Kích hoạt thành công thiết bị mới",
        data: {
            type: updatedLicense.type,
            clientName: updatedLicense.client_name,
            expiryDate: updatedLicense.expiry_date,
            maxMachines: updatedLicense.max_machines
        }
      });
    } else {
      return res.json({
        success: false,
        valid: false,
        message: `Đã đạt giới hạn số máy (${license.max_machines})`,
      });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi xác thực license" });
  }
});

/**
 * LIST LICENSES (Admin)
 */
app.get("/api/license/list", async (req, res) => {
    const { secret } = req.query;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });

    try {
        const result = await pool.query("SELECT * FROM licenses ORDER BY created_at DESC");
        res.json({ success: true, count: result.rows.length, licenses: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * RESET MACHINES (Admin)
 */
app.post("/api/license/reset", async (req, res) => {
  const { secret, key } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });

  try {
      const result = await pool.query(
          "UPDATE licenses SET activated_machines = '{}' WHERE key = $1 OR raw_key = $1 RETURNING *",
          [key]
      );
      
      if (result.rowCount > 0) {
          res.json({ success: true, message: "Đã reset danh sách máy" });
      } else {
          res.status(404).json({ success: false, message: "License không tìm thấy" });
      }
  } catch (err) {
      res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * REVOKE LICENSE
 */
app.post("/api/license/revoke", async (req, res) => {
    const { secret, key } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });

    try {
        const result = await pool.query(
            "UPDATE licenses SET status = 'revoked' WHERE key = $1 OR raw_key = $1 RETURNING *", 
            [key]
        );
        if (result.rowCount > 0) {
            res.json({ success: true, message: "Đã thu hồi license" });
        } else {
            res.status(404).json({ success: false });
        }
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/**
 * EXTEND LICENSE
 */
app.post("/api/license/extend", async (req, res) => {
    const { secret, key, days } = req.body;
    if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });

    try {
        // Fetch current expiry first
        const fetchRes = await pool.query("SELECT expiry_date FROM licenses WHERE key = $1 OR raw_key = $1", [key]);
        if (fetchRes.rows.length === 0) return res.status(404).json({ success: false });
        
        const currentExpiry = new Date(fetchRes.rows[0].expiry_date);
        currentExpiry.setDate(currentExpiry.getDate() + parseInt(days));
        
        const updateRes = await pool.query(
            "UPDATE licenses SET expiry_date = $1 WHERE key = $2 OR raw_key = $2 RETURNING *",
            [currentExpiry, key]
        );

        res.json({ 
            success: true, 
            message: `Đã gia hạn thêm ${days} ngày`, 
            newExpiry: updateRes.rows[0].expiry_date 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.listen(PORT, () => {
  console.log(`License Server (PostgreSQL) running on port ${PORT}`);
});
