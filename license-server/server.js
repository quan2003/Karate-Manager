const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const crypto = require("crypto");
const { Pool } = require("pg");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");

// Load Environment Variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 2000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "admin_secret_key_change_me";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_change_me";
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

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
    initializeAdminSchema();
    initializeAccountsSchema();
    initializeRequestsSchema();
    // Start cleanup jobs after schemas are ready
    setTimeout(() => {
      cleanupRevokedExpiredLicenses();
      cleanupResolvedRequests();
    }, 5000);
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
      client_phone VARCHAR(50),
      client_email VARCHAR(255),
      notes TEXT,
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

const initializeAdminSchema = async () => {
  const createAdminTableQuery = `
    CREATE TABLE IF NOT EXISTS admin_users (
      email VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  try {
    await pool.query(createAdminTableQuery);

    // Seed initial admins
    const initialAdmins = [
      "luuquan232003@gmail.com",
      "luuquankarate@gmail.com",
    ];
    for (const email of initialAdmins) {
      await pool.query(
        `INSERT INTO admin_users (email, name) VALUES ($1, 'Super Admin') ON CONFLICT (email) DO NOTHING`,
        [email]
      );
    }
    console.log("Admin Schema initialized successfully.");
  } catch (err) {
    console.error("Error creating admin schema:", err);
  }
};

const initializeAccountsSchema = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS admin_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  try {
    await pool.query(createTableQuery);

    // Seed default admin account if none exists
    const existing = await pool.query("SELECT COUNT(*) FROM admin_accounts");
    if (parseInt(existing.rows[0].count) === 0) {
      const defaultPassword = await bcrypt.hash("admin123", 10);
      await pool.query(
        `INSERT INTO admin_accounts (username, password_hash, display_name) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING`,
        ["admin", defaultPassword, "Super Admin"]
      );
      console.log("Default admin account created (admin / admin123)");
    }
    console.log("Accounts Schema initialized successfully.");
  } catch (err) {
    console.error("Error creating accounts schema:", err);
  }
};

const initializeRequestsSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS license_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        license_key TEXT,
        machine_id TEXT NOT NULL,
        request_type VARCHAR(50) NOT NULL,
        contact_info TEXT,
        message TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        admin_note TEXT
      );
    `);
    console.log("Requests Schema initialized successfully.");
  } catch (err) {
    console.error("Error creating requests schema:", err);
  }
};

// === AUTO-CLEANUP FUNCTIONS ===

// Delete revoked and expired licenses
const cleanupRevokedExpiredLicenses = async () => {
  try {
    // Delete revoked licenses
    const revokedResult = await pool.query(
      "DELETE FROM licenses WHERE status = 'revoked' RETURNING id"
    );
    if (revokedResult.rowCount > 0) {
      console.log(`[Cleanup] Deleted ${revokedResult.rowCount} revoked license(s)`);
    }

    // Delete expired licenses (status active but expiry_date has passed)
    const expiredResult = await pool.query(
      "DELETE FROM licenses WHERE status = 'active' AND expiry_date < NOW() RETURNING id"
    );
    if (expiredResult.rowCount > 0) {
      console.log(`[Cleanup] Deleted ${expiredResult.rowCount} expired license(s)`);
    }
  } catch (err) {
    console.error("[Cleanup] Error cleaning up licenses:", err.message);
  }
};

// Delete resolved requests older than 7 days
const cleanupResolvedRequests = async () => {
  try {
    const result = await pool.query(
      "DELETE FROM license_requests WHERE status = 'resolved' AND resolved_at < NOW() - INTERVAL '7 days' RETURNING id"
    );
    if (result.rowCount > 0) {
      console.log(`[Cleanup] Deleted ${result.rowCount} resolved request(s) older than 7 days`);
    }
  } catch (err) {
    console.error("[Cleanup] Error cleaning up requests:", err.message);
  }
};

// Run cleanup every hour
setInterval(() => {
  cleanupRevokedExpiredLicenses();
  cleanupResolvedRequests();
}, 60 * 60 * 1000);

// --- Email Notification ---
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "", // App Password from Google
  },
});

const SUPER_ADMIN_EMAILS = [
  "luuquan232003@gmail.com",
  "luuquankarate@gmail.com",
];

async function sendNewRequestEmail(requestData) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("SMTP not configured, skipping email notification");
    return;
  }
  try {
    const mailOptions = {
      from: `"Karate License System" <${process.env.SMTP_USER}>`,
      to: SUPER_ADMIN_EMAILS.join(","),
      subject: `🔔 Yêu cầu hỗ trợ mới: ${requestData.requestType}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f172a; color: #f1f5f9; border-radius: 12px;">
          <h2 style="color: #3b82f6; margin-bottom: 20px;">🥋 Karate License - Yêu cầu hỗ trợ mới</h2>
          <div style="background: #1e293b; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
            <p style="margin: 8px 0;"><strong style="color: #94a3b8;">Loại yêu cầu:</strong> <span style="color: #f59e0b;">${
              requestData.requestType
            }</span></p>
            <p style="margin: 8px 0;"><strong style="color: #94a3b8;">License Key:</strong> <code style="background: #334155; padding: 2px 8px; border-radius: 4px; color: #e2e8f0;">${
              requestData.key || "N/A"
            }</code></p>
            <p style="margin: 8px 0;"><strong style="color: #94a3b8;">Machine ID:</strong> <code style="background: #334155; padding: 2px 8px; border-radius: 4px; color: #e2e8f0;">${
              requestData.machineId
            }</code></p>
            <p style="margin: 8px 0;"><strong style="color: #94a3b8;">Liên hệ:</strong> ${
              requestData.contactInfo || "Không có"
            }</p>
            <p style="margin: 8px 0;"><strong style="color: #94a3b8;">Tin nhắn:</strong> ${
              requestData.message || "Không có"
            }</p>
          </div>
          <a href="https://103.82.194.186.nip.io/requests" style="display: inline-block; background: #3b82f6; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Xem trên Admin Panel →</a>
          <p style="color: #64748b; font-size: 12px; margin-top: 20px;">Email tự động từ Karate License Server</p>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
    console.log("Email notification sent to super admins");
  } catch (err) {
    console.error("Failed to send email notification:", err.message);
  }
}

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

// --- Auth Middleware ---
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      req.user = user;
      next();
    });
  } else {
    // Fallback to legacy secret query param for existing electron app
    if (req.query.secret === ADMIN_SECRET || req.body.secret === ADMIN_SECRET) {
      next();
    } else {
      res.sendStatus(401);
    }
  }
};

// --- Auth Routes ---
// Google Auth Route (Updated to accept Access Token)

app.post("/auth/google", async (req, res) => {
  const { token } = req.body;
  console.log(
    "Received Auth Request (Access Token):",
    token.substring(0, 10) + "..."
  );

  try {
    // Verify Access Token via Google UserInfo API
    const googleRes = await axios.get(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const { email, name, picture } = googleRes.data;
    console.log("Verified Email:", email);

    // Check whitelist
    const result = await pool.query(
      "SELECT * FROM admin_users WHERE email = $1",
      [email]
    );
    console.log("Whitelist check result:", result.rows.length);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const accessToken = jwt.sign(
        { email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: "24h" }
      );
      res.json({
        success: true,
        token: accessToken,
        user: { email: user.email, name: user.name, picture: picture },
      });
    } else {
      console.log("Email not in whitelist");
      res.json({
        success: false,
        message: "Email không có quyền truy cập hệ thống",
      });
    }
  } catch (error) {
    console.error("Auth Error Full:", error.response?.data || error.message);
    res.status(401).json({
      success: false,
      message: "Xác thực thất bại: Token không hợp lệ",
    });
  }
});

// Account Login Route
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ success: false, message: "Vui lòng nhập tên đăng nhập và mật khẩu" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM admin_accounts WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, message: "Tên đăng nhập hoặc mật khẩu không đúng" });
    }

    const account = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, account.password_hash);

    if (!isPasswordValid) {
      return res.json({ success: false, message: "Tên đăng nhập hoặc mật khẩu không đúng" });
    }

    const accessToken = jwt.sign(
      { username: account.username, name: account.display_name, loginType: "account" },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      token: accessToken,
      user: {
        username: account.username,
        name: account.display_name,
        loginType: "account",
      },
    });
  } catch (error) {
    console.error("Account Login Error:", error);
    res.status(500).json({ success: false, message: "Lỗi đăng nhập" });
  }
});

// Change Password Route
app.post("/auth/change-password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.json({ success: false, message: "Vui lòng nhập đầy đủ thông tin" });
  }

  if (newPassword.length < 6) {
    return res.json({ success: false, message: "Mật khẩu mới phải có ít nhất 6 ký tự" });
  }

  try {
    const username = req.user?.username;
    if (!username) {
      return res.json({ success: false, message: "Chỉ tài khoản đăng nhập bằng account mới đổi được mật khẩu" });
    }

    const result = await pool.query(
      "SELECT * FROM admin_accounts WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, message: "Tài khoản không tồn tại" });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isPasswordValid) {
      return res.json({ success: false, message: "Mật khẩu hiện tại không đúng" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE admin_accounts SET password_hash = $1 WHERE username = $2",
      [newHash, username]
    );

    res.json({ success: true, message: "Đổi mật khẩu thành công" });
  } catch (error) {
    console.error("Change Password Error:", error);
    res.status(500).json({ success: false, message: "Lỗi đổi mật khẩu" });
  }
});

// --- Admin Management Routes ---
app.get("/api/admin/users", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM admin_users ORDER BY created_at DESC"
    );
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/admin/users", authMiddleware, async (req, res) => {
  const { email, name } = req.body;
  try {
    await pool.query("INSERT INTO admin_users (email, name) VALUES ($1, $2)", [
      email,
      name || "Admin",
    ]);
    res.json({ success: true, message: "Đã thêm admin mới" });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Lỗi thêm admin (có thể email đã tồn tại)",
    });
  }
});

app.delete("/api/admin/users/:email", authMiddleware, async (req, res) => {
  const { email } = req.params;
  // Prevent deleting self (simple check, better done on client too)
  if (req.user && req.user.email === email) {
    return res
      .status(400)
      .json({ success: false, message: "Không thể tự xoá chính mình" });
  }

  try {
    await pool.query("DELETE FROM admin_users WHERE email = $1", [email]);
    res.json({ success: true, message: "Đã xoá quyền admin" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- Stats Routes ---
app.get("/api/stats/dashboard", authMiddleware, async (req, res) => {
  try {
    const totalRes = await pool.query("SELECT COUNT(*) FROM licenses");
    const activeRes = await pool.query(
      "SELECT COUNT(*) FROM licenses WHERE status = 'active' AND expiry_date > NOW()"
    );
    const expiredRes = await pool.query(
      "SELECT COUNT(*) FROM licenses WHERE status = 'active' AND expiry_date <= NOW()"
    );
    const typeRes = await pool.query(
      "SELECT type as name, COUNT(*) as count FROM licenses GROUP BY type"
    );

    // Real pending request count
    let pendingCount = 0;
    try {
      const pendingRes = await pool.query(
        "SELECT COUNT(*) FROM license_requests WHERE status = 'pending'"
      );
      pendingCount = parseInt(pendingRes.rows[0].count);
    } catch (e) {
      /* table may not exist yet */
    }

    res.json({
      success: true,
      stats: {
        totalLicenses: parseInt(totalRes.rows[0].count),
        activeLicenses: parseInt(activeRes.rows[0].count),
        expiredLicenses: parseInt(expiredRes.rows[0].count),
        requestsPending: pendingCount,
        licensesByType: typeRes.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Pending request count endpoint (for sidebar badge polling)
app.get(
  "/api/license/requests/pending-count",
  authMiddleware,
  async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT COUNT(*) FROM license_requests WHERE status = 'pending'"
      );
      res.json({ success: true, count: parseInt(result.rows[0].count) });
    } catch (err) {
      res.json({ success: true, count: 0 });
    }
  }
);

// Serve Admin Web
const path = require("path");
app.use(express.static(path.join(__dirname, "../admin-web/dist")));

// --- Routes ---

app.get("/", (req, res) => {
  res.send("Karate License Server (PostgreSQL) is RUNNING");
});

/**
 * CREATE LICENSE (Admin Only)
 */
app.post("/api/license/create", async (req, res) => {
  try {
    const {
      secret,
      type,
      days,
      maxMachines,
      clientName,
      clientPhone,
      clientEmail,
      notes,
    } = req.body;

    // Auth check: JWT token OR admin secret
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
        req.user = decoded;
      } catch (err) {
        return res
          .status(401)
          .json({ success: false, message: "Token không hợp lệ" });
      }
    } else if (
      secret !== process.env.ADMIN_SECRET &&
      secret !==
        "b3f9a2c7e8d1f6a4b9c2e7d5f8a1c3e6b4d9a7f2c1e8b6d3a5f7c9e1b2d4f6a"
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Sai mã bảo mật Admin" });
    }

    const duration = parseInt(days) || 30;
    const machines = parseInt(maxMachines) || 1;
    const licenseType = type || "trial";
    const client = clientName || "Unknown";
    const phone = clientPhone || null;
    const email = clientEmail || null;
    const note = notes || null;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + duration);

    // Generate License Data
    const licenseId = crypto.randomUUID();
    const licenseDataContent = {
      id: licenseId, // Random ID first to ensure unique prefix
      v: 2,
      t: licenseType,
      o: client,
      c: new Date().toISOString(),
      e: expiryDate.toISOString(),
      mm: machines,
      tmids: [],
      kv: 1,
    };

    const rawKey = Buffer.from(JSON.stringify(licenseDataContent)).toString(
      "base64"
    );

    // Format Key: KRT-T-XXXXX-XXXXX
    const prefix = licenseType.charAt(0).toUpperCase();
    const chunks = rawKey.match(/.{1,5}/g) || [];
    const formattedKey = `KRT-${prefix}-${chunks.slice(0, 5).join("-")}`;

    const query = `
      INSERT INTO licenses (id, key, raw_key, type, client_name, client_phone, client_email, notes, expiry_date, max_machines, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
      RETURNING *;
    `;

    const result = await pool.query(query, [
      licenseId,
      formattedKey,
      rawKey,
      licenseType,
      client,
      phone,
      email,
      note,
      expiryDate,
      machines,
    ]);

    const newLicense = result.rows[0];

    // Convert DB structure to API response structure (to support existing client)
    const responseLicense = {
      key: newLicense.key,
      raw: newLicense.raw_key,
      type: newLicense.type,
      clientName: newLicense.client_name,
      expiryDate: newLicense.expiry_date,
      maxMachines: newLicense.max_machines,
    };

    res.json({ success: true, license: responseLicense });
  } catch (err) {
    console.error("Create License Error:", err); // Improved logging
    res
      .status(500)
      .json({ success: false, message: "Lỗi Server: " + err.message });
  }
});

/**
 * VERIFY LICENSE (Client App)
 */
app.post("/api/license/verify", async (req, res) => {
  const { key, machineId } = req.body;

  if (!key || !machineId) {
    return res
      .status(400)
      .json({ success: false, message: "Thiếu thông tin key hoặc machineId" });
  }

  // Find License
  const query = `SELECT * FROM licenses WHERE key = $1 OR raw_key = $1`;

  try {
    const result = await pool.query(query, [key]);

    if (result.rows.length === 0) {
      return res.json({
        success: false,
        valid: false,
        message: "License không tồn tại",
      });
    }

    const license = result.rows[0];

    // Check Status
    if (license.status !== "active") {
      return res.json({
        success: false,
        valid: false,
        message: "License đã bị vô hiệu hóa/thu hồi",
      });
    }

    // Check Expiry
    if (new Date() > new Date(license.expiry_date)) {
      return res.json({
        success: false,
        valid: false,
        message: "License đã hết hạn",
        expired: true,
      });
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
          maxMachines: license.max_machines,
        },
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
      const updateResult = await pool.query(updateQuery, [
        machineId,
        license.id,
      ]);
      const updatedLicense = updateResult.rows[0];

      return res.json({
        success: true,
        valid: true,
        message: "Kích hoạt thành công thiết bị mới",
        data: {
          type: updatedLicense.type,
          clientName: updatedLicense.client_name,
          expiryDate: updatedLicense.expiry_date,
          maxMachines: updatedLicense.max_machines,
        },
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
app.get("/api/license/list", authMiddleware, async (req, res) => {
  // Legacy secret check handled by authMiddleware fallback or here if needed but Middleware is cleaner
  // However, if called from Electron with secret query param, authMiddleware handles it.
  try {
    const result = await pool.query(
      "SELECT * FROM licenses ORDER BY created_at DESC"
    );
    res.json({
      success: true,
      count: result.rows.length,
      licenses: result.rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * RESET MACHINES (Admin)
 */
app.post("/api/license/reset", authMiddleware, async (req, res) => {
  const { secret, key } = req.body;

  try {
    const result = await pool.query(
      "UPDATE licenses SET activated_machines = '{}' WHERE key = $1 OR raw_key = $1 RETURNING *",
      [key]
    );

    if (result.rowCount > 0) {
      res.json({ success: true, message: "Đã reset danh sách máy" });
    } else {
      res
        .status(404)
        .json({ success: false, message: "License không tìm thấy" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * REVOKE LICENSE
 */
app.post("/api/license/revoke", authMiddleware, async (req, res) => {
  const { secret, key } = req.body;

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
app.post("/api/license/extend", authMiddleware, async (req, res) => {
  const { secret, key, days } = req.body;

  try {
    // Fetch current expiry first
    const fetchRes = await pool.query(
      "SELECT expiry_date FROM licenses WHERE key = $1 OR raw_key = $1",
      [key]
    );
    if (fetchRes.rows.length === 0)
      return res.status(404).json({ success: false });

    const currentExpiry = new Date(fetchRes.rows[0].expiry_date);
    currentExpiry.setDate(currentExpiry.getDate() + parseInt(days));

    const updateRes = await pool.query(
      "UPDATE licenses SET expiry_date = $1 WHERE key = $2 OR raw_key = $2 RETURNING *",
      [currentExpiry, key]
    );

    res.json({
      success: true,
      message: `Đã gia hạn thêm ${days} ngày`,
      newExpiry: updateRes.rows[0].expiry_date,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * LICENSE INFO (Public - User can check their own license)
 */
app.post("/api/license/info", async (req, res) => {
  const { key } = req.body;
  if (!key)
    return res
      .status(400)
      .json({ success: false, message: "Thiếu license key" });

  try {
    const result = await pool.query(
      "SELECT type, client_name, created_at, expiry_date, max_machines, activated_machines, status FROM licenses WHERE key = $1 OR raw_key = $1",
      [key]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, message: "Không tìm thấy license" });
    }

    const license = result.rows[0];
    const now = new Date();
    const expiry = new Date(license.expiry_date);
    const daysRemaining = Math.max(
      0,
      Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
    );

    res.json({
      success: true,
      license: {
        type: license.type,
        clientName: license.client_name,
        createdAt: license.created_at,
        expiryDate: license.expiry_date,
        maxMachines: license.max_machines,
        activatedMachines: (license.activated_machines || []).length,
        status: license.status,
        daysRemaining,
        isExpired: now > expiry,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * REQUEST KEY RENEWAL / SUPPORT (Public - User can submit request)
 */
app.post("/api/license/request", async (req, res) => {
  const { key, machineId, requestType, contactInfo, message } = req.body;

  if (!requestType || !machineId) {
    return res
      .status(400)
      .json({ success: false, message: "Thiếu thông tin yêu cầu" });
  }

  try {
    // Create requests table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS license_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        license_key TEXT,
        machine_id TEXT NOT NULL,
        request_type VARCHAR(50) NOT NULL,
        contact_info TEXT,
        message TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        admin_note TEXT
      );
    `);

    const result = await pool.query(
      `INSERT INTO license_requests (license_key, machine_id, request_type, contact_info, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [
        key || null,
        machineId,
        requestType,
        contactInfo || null,
        message || null,
      ]
    );
    res.json({
      success: true,
      message: "Yêu cầu đã được gửi thành công!",
      requestId: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    });

    // Send email notification to super admins (non-blocking)
    sendNewRequestEmail({
      key,
      machineId,
      requestType,
      contactInfo,
      message,
    }).catch(() => {});
  } catch (err) {
    console.error("Request Error:", err);
    res.status(500).json({ success: false, message: "Lỗi gửi yêu cầu" });
  }
});

/**
 * LIST REQUESTS (Admin)
 */
app.get("/api/license/requests", authMiddleware, async (req, res) => {
  const { secret } = req.query;

  try {
    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS license_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        license_key TEXT,
        machine_id TEXT NOT NULL,
        request_type VARCHAR(50) NOT NULL,
        contact_info TEXT,
        message TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        admin_note TEXT
      );
    `);

    const result = await pool.query(`
      SELECT r.*, l.client_name 
      FROM license_requests r 
      LEFT JOIN licenses l ON (r.license_key = l.key OR r.license_key = l.raw_key)
      ORDER BY r.created_at DESC
    `);
    res.json({ success: true, requests: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * RESOLVE REQUEST (Admin)
 */
app.post("/api/license/request/resolve", authMiddleware, async (req, res) => {
  const { secret, requestId, note } = req.body;

  try {
    const result = await pool.query(
      "UPDATE license_requests SET status = 'resolved', resolved_at = NOW(), admin_note = $1 WHERE id = $2 RETURNING *",
      [note || "", requestId]
    );
    if (result.rowCount > 0) {
      res.json({ success: true, message: "Đã xử lý yêu cầu" });
    } else {
      res.status(404).json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`License Server (PostgreSQL) running on port ${PORT}`);
});
