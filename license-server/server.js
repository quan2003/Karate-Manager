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
    initializeCommerceSchema();
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

const initializeCommerceSchema = async () => {
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pricing_plans (
        id TEXT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        license_type VARCHAR(50) NOT NULL,
        duration_days INTEGER NOT NULL,
        max_machines INTEGER NOT NULL DEFAULT 1,
        price_vnd INTEGER NOT NULL DEFAULT 0,
        features TEXT[] DEFAULT '{}',
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        bank_id VARCHAR(50),
        account_no VARCHAR(50),
        account_name VARCHAR(100),
        qr_template VARCHAR(50) DEFAULT 'compact2',
        qr_image_url TEXT,
        instructions TEXT,
        contact_phone VARCHAR(50),
        contact_email VARCHAR(255),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query("ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS qr_image_url TEXT;");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_code VARCHAR(32) UNIQUE NOT NULL,
        plan_id TEXT REFERENCES pricing_plans(id),
        plan_name VARCHAR(255) NOT NULL,
        license_type VARCHAR(50) NOT NULL,
        duration_days INTEGER NOT NULL,
        max_machines INTEGER NOT NULL,
        amount_vnd INTEGER NOT NULL,
        machine_id TEXT NOT NULL,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        customer_email VARCHAR(255),
        note TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        license_key TEXT,
        admin_note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        paid_at TIMESTAMPTZ
      );
    `);

    await pool.query(`
      INSERT INTO pricing_plans
        (id, name, description, license_type, duration_days, max_machines, price_vnd, features, sort_order)
      VALUES
        ('tournament', 'Goi License theo giai', 'Dung cho mot giai dau', 'tournament', 30, 1, 400000,
          ARRAY['Quan ly VDV', 'Quan ly HLV', 'Boc tham tu dong', 'Xuat Sigma', 'Quan ly ket qua'], 1),
        ('support', 'Goi Ho tro Online toan giai', 'Kem ho tro van hanh online', 'yearly', 30, 1, 800000,
          ARRAY['Ho tro nhap du lieu dau vao', 'Ho tro van hanh online', 'Xuat Sigma', 'Tong ket toan giai'], 2)
      ON CONFLICT (id) DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO payment_settings (id, qr_template, instructions, contact_email)
      VALUES ('default', 'compact2', 'Chuyen khoan dung noi dung ma don hang de duoc xu ly nhanh.', 'luuquankarate@gmail.com')
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log("Commerce schema initialized successfully.");
  } catch (err) {
    console.error("Error creating commerce schema:", err);
  }
};

const createLicenseRecord = async (
  {
    type,
    days,
    maxMachines,
    clientName,
    clientPhone,
    clientEmail,
    notes,
  },
  db = pool
) => {
  const duration = parseInt(days) || 30;
  const machines = parseInt(maxMachines) || 1;
  const licenseType = type || "trial";
  const client = clientName || "Unknown";
  const phone = clientPhone || null;
  const email = clientEmail || null;
  const note = notes || null;

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + duration);

  const licenseId = crypto.randomUUID();
  const licenseDataContent = {
    id: licenseId,
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
  const prefix = licenseType.charAt(0).toUpperCase();
  const chunks = rawKey.match(/.{1,5}/g) || [];
  const formattedKey = `KRT-${prefix}-${chunks.slice(0, 5).join("-")}`;

  const result = await db.query(
    `
      INSERT INTO licenses (id, key, raw_key, type, client_name, client_phone, client_email, notes, expiry_date, max_machines, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
      RETURNING *;
    `,
    [
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
    ]
  );

  const newLicense = result.rows[0];
  return {
    key: newLicense.key,
    raw: newLicense.raw_key,
    type: newLicense.type,
    clientName: newLicense.client_name,
    expiryDate: newLicense.expiry_date,
    maxMachines: newLicense.max_machines,
  };
};

const buildVietQrUrl = (settings, order) => {
  if (!settings?.bank_id || !settings?.account_no || !settings?.account_name) {
    return settings?.qr_image_url || null;
  }
  const normalizedBankId = normalizeVietQrBankId(settings.bank_id);
  const bankId = encodeURIComponent(normalizedBankId);
  const accountNo = encodeURIComponent(settings.account_no);
  const template = encodeURIComponent(settings.qr_template || "compact2");
  const params = new URLSearchParams({
    amount: String(order.amount_vnd),
    addInfo: order.order_code,
    accountName: settings.account_name,
  });
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?${params.toString()}`;
};

const normalizeVietQrBankId = (bankId) => {
  const value = String(bankId || "").trim();
  const normalized = value.toLowerCase();
  if (normalized.includes("timo")) return "TIMO";
  if (
    normalized.includes("bvbank") ||
    normalized.includes("ban viet") ||
    normalized.includes("bản việt") ||
    normalized.includes("viet capital")
  ) {
    return "VCCB";
  }
  return value.toUpperCase();
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
      console.log(
        `[Cleanup] Deleted ${revokedResult.rowCount} revoked license(s)`
      );
    }

    // Delete expired licenses (status active but expiry_date has passed)
    const expiredResult = await pool.query(
      "DELETE FROM licenses WHERE status = 'active' AND expiry_date < NOW() RETURNING id"
    );
    if (expiredResult.rowCount > 0) {
      console.log(
        `[Cleanup] Deleted ${expiredResult.rowCount} expired license(s)`
      );
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
      console.log(
        `[Cleanup] Deleted ${result.rowCount} resolved request(s) older than 7 days`
      );
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
// Global limiter: 5000 req / 15 phút / IP (đủ cho nhiều client hợp lệ)
const limiter = rateLimit({
  windowMs: parseInt(process.env.WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.MAX_REQUESTS) || 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Quá nhiều yêu cầu, vui lòng thử lại sau.",
  },
  // Dùng IP thực từ reverse proxy (nginx)
  keyGenerator: (req) =>
    req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip,
});

// Login limiter riêng: tối đa 20 lần / 15 phút / IP (chống brute-force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Quá nhiều lần đăng nhập thất bại, vui lòng thử lại sau 15 phút.",
  },
  keyGenerator: (req) =>
    req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip,
  skipSuccessfulRequests: true, // Không đếm những lần login thành công
});

app.use(limiter);
app.use(cors({ origin: "*" }));
app.use(morgan("combined"));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

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
app.post("/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({
      success: false,
      message: "Vui lòng nhập tên đăng nhập và mật khẩu",
    });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM admin_accounts WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: false,
        message: "Tên đăng nhập hoặc mật khẩu không đúng",
      });
    }

    const account = result.rows[0];
    const isPasswordValid = await bcrypt.compare(
      password,
      account.password_hash
    );

    if (!isPasswordValid) {
      return res.json({
        success: false,
        message: "Tên đăng nhập hoặc mật khẩu không đúng",
      });
    }

    const accessToken = jwt.sign(
      {
        username: account.username,
        name: account.display_name,
        loginType: "account",
      },
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
    return res.json({
      success: false,
      message: "Vui lòng nhập đầy đủ thông tin",
    });
  }

  if (newPassword.length < 6) {
    return res.json({
      success: false,
      message: "Mật khẩu mới phải có ít nhất 6 ký tự",
    });
  }

  try {
    const username = req.user?.username;
    if (!username) {
      return res.json({
        success: false,
        message: "Chỉ tài khoản đăng nhập bằng account mới đổi được mật khẩu",
      });
    }

    const result = await pool.query(
      "SELECT * FROM admin_accounts WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, message: "Tài khoản không tồn tại" });
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      result.rows[0].password_hash
    );
    if (!isPasswordValid) {
      return res.json({
        success: false,
        message: "Mật khẩu hiện tại không đúng",
      });
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
    const paymentSummaryRes = await pool.query(`
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_orders,
        COUNT(*) FILTER (WHERE status <> 'paid')::int AS pending_orders,
        COALESCE(SUM(amount_vnd) FILTER (WHERE status = 'paid'), 0)::bigint AS revenue_vnd,
        COALESCE(SUM(amount_vnd) FILTER (WHERE status = 'paid' AND paid_at >= NOW() - INTERVAL '30 days'), 0)::bigint AS revenue_30d_vnd
      FROM payment_orders
    `);
    const dailyRevenueRes = await pool.query(`
      SELECT
        TO_CHAR(day::date, 'DD/MM') AS day,
        COALESCE(SUM(po.amount_vnd) FILTER (WHERE po.status = 'paid'), 0)::bigint AS revenue_vnd,
        COUNT(po.id) FILTER (WHERE po.status = 'paid')::int AS paid_orders
      FROM generate_series(
        CURRENT_DATE - INTERVAL '13 days',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS day
      LEFT JOIN payment_orders po
        ON DATE(po.paid_at) = day::date
      GROUP BY day
      ORDER BY day
    `);
    const planRevenueRes = await pool.query(`
      SELECT
        COALESCE(plan_name, 'Không rõ') AS name,
        COUNT(*)::int AS count,
        COALESCE(SUM(amount_vnd), 0)::bigint AS revenue_vnd
      FROM payment_orders
      WHERE status = 'paid'
      GROUP BY plan_name
      ORDER BY revenue_vnd DESC
      LIMIT 8
    `);

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
        payments: paymentSummaryRes.rows[0] || {
          total_orders: 0,
          paid_orders: 0,
          pending_orders: 0,
          revenue_vnd: 0,
          revenue_30d_vnd: 0,
        },
        dailyRevenue: dailyRevenueRes.rows,
        revenueByPlan: planRevenueRes.rows,
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

// Public pricing for website/client app
app.get("/api/public/pricing", async (req, res) => {
  try {
    const plans = await pool.query(
      "SELECT * FROM pricing_plans WHERE is_active = TRUE ORDER BY sort_order ASC, price_vnd ASC"
    );
    const settings = await pool.query(
      "SELECT bank_id, account_no, account_name, qr_template, qr_image_url, instructions, contact_phone, contact_email FROM payment_settings WHERE id = 'default'"
    );
    res.json({
      success: true,
      plans: plans.rows,
      paymentSettings: settings.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/payment/orders", async (req, res) => {
  const {
    planId,
    machineId,
    customerName,
    customerPhone,
    customerEmail,
    note,
  } = req.body;

  if (!planId || !machineId) {
    return res
      .status(400)
      .json({ success: false, message: "Thiếu gói hoặc Machine ID" });
  }

  try {
    const planRes = await pool.query(
      "SELECT * FROM pricing_plans WHERE id = $1 AND is_active = TRUE",
      [planId]
    );
    if (planRes.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Gói thanh toán không tồn tại" });
    }

    const plan = planRes.rows[0];
    const orderCode = `KSP${Date.now().toString(36).toUpperCase()}`;
    const orderRes = await pool.query(
      `
        INSERT INTO payment_orders
          (order_code, plan_id, plan_name, license_type, duration_days, max_machines, amount_vnd,
           machine_id, customer_name, customer_phone, customer_email, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *;
      `,
      [
        orderCode,
        plan.id,
        plan.name,
        plan.license_type,
        plan.duration_days,
        plan.max_machines,
        plan.price_vnd,
        machineId,
        customerName || null,
        customerPhone || null,
        customerEmail || null,
        note || null,
      ]
    );

    const settingsRes = await pool.query(
      "SELECT * FROM payment_settings WHERE id = 'default'"
    );
    const order = orderRes.rows[0];
    const qrUrl = buildVietQrUrl(settingsRes.rows[0], order);

    res.json({ success: true, order, qrUrl, paymentSettings: settingsRes.rows[0] });
  } catch (err) {
    console.error("Create payment order error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/payment/orders/:orderCode", async (req, res) => {
  const { machineId } = req.query;
  try {
    const result = await pool.query(
      "SELECT order_code, status, license_key, amount_vnd, plan_name, machine_id, paid_at FROM payment_orders WHERE order_code = $1",
      [req.params.orderCode]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn" });
    }
    const order = result.rows[0];
    if (machineId && order.machine_id !== machineId) {
      return res.status(403).json({ success: false, message: "Machine ID không khớp" });
    }
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/admin/pricing", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM pricing_plans ORDER BY sort_order ASC, price_vnd ASC"
    );
    res.json({ success: true, plans: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put("/api/admin/pricing", authMiddleware, async (req, res) => {
  const { plans } = req.body;
  if (!Array.isArray(plans)) {
    return res.status(400).json({ success: false, message: "Dữ liệu không hợp lệ" });
  }

  const clientDb = await pool.connect();
  try {
    await clientDb.query("BEGIN");
    for (const plan of plans) {
      await clientDb.query(
        `
          INSERT INTO pricing_plans
            (id, name, description, license_type, duration_days, max_machines, price_vnd, features, is_active, sort_order, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            license_type = EXCLUDED.license_type,
            duration_days = EXCLUDED.duration_days,
            max_machines = EXCLUDED.max_machines,
            price_vnd = EXCLUDED.price_vnd,
            features = EXCLUDED.features,
            is_active = EXCLUDED.is_active,
            sort_order = EXCLUDED.sort_order,
            updated_at = NOW();
        `,
        [
          plan.id,
          plan.name,
          plan.description || null,
          plan.license_type,
          parseInt(plan.duration_days) || 30,
          parseInt(plan.max_machines) || 1,
          parseInt(plan.price_vnd) || 0,
          Array.isArray(plan.features)
            ? plan.features
            : String(plan.features || "")
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
          plan.is_active !== false,
          parseInt(plan.sort_order) || 0,
        ]
      );
    }
    await clientDb.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await clientDb.query("ROLLBACK");
    res.status(500).json({ success: false, message: err.message });
  } finally {
    clientDb.release();
  }
});

app.delete("/api/admin/pricing/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM pricing_plans WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/admin/payment-settings", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM payment_settings WHERE id = 'default'"
    );
    res.json({ success: true, settings: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put("/api/admin/payment-settings", authMiddleware, async (req, res) => {
  const {
    bank_id,
    account_no,
    account_name,
    qr_template,
    qr_image_url,
    instructions,
    contact_phone,
    contact_email,
  } = req.body;

  try {
    const result = await pool.query(
      `
        INSERT INTO payment_settings
          (id, bank_id, account_no, account_name, qr_template, qr_image_url, instructions, contact_phone, contact_email, updated_at)
        VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (id) DO UPDATE SET
          bank_id = EXCLUDED.bank_id,
          account_no = EXCLUDED.account_no,
          account_name = EXCLUDED.account_name,
          qr_template = EXCLUDED.qr_template,
          qr_image_url = EXCLUDED.qr_image_url,
          instructions = EXCLUDED.instructions,
          contact_phone = EXCLUDED.contact_phone,
          contact_email = EXCLUDED.contact_email,
          updated_at = NOW()
        RETURNING *;
      `,
      [
        bank_id || null,
        account_no || null,
        account_name || null,
        qr_template || "compact2",
        qr_image_url || null,
        instructions || null,
        contact_phone || null,
        contact_email || null,
      ]
    );
    res.json({ success: true, settings: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/admin/payment-orders", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM payment_orders ORDER BY created_at DESC LIMIT 200"
    );
    res.json({ success: true, orders: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put("/api/admin/payment-orders/:id", authMiddleware, async (req, res) => {
  const {
    customer_name,
    customer_phone,
    customer_email,
    amount_vnd,
    plan_name,
    note,
  } = req.body;

  try {
    const result = await pool.query(
      `
        UPDATE payment_orders
        SET customer_name = $1,
            customer_phone = $2,
            customer_email = $3,
            amount_vnd = $4,
            plan_name = $5,
            note = $6
        WHERE id = $7
        RETURNING *;
      `,
      [
        customer_name || null,
        customer_phone || null,
        customer_email || null,
        parseInt(amount_vnd) || 0,
        plan_name || "",
        note || null,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn" });
    }

    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete("/api/admin/payment-orders/:id", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM payment_orders WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/admin/payment-orders/:id/mark-paid", authMiddleware, async (req, res) => {
  const { adminNote } = req.body;
  const clientDb = await pool.connect();
  try {
    await clientDb.query("BEGIN");
    const orderRes = await clientDb.query(
      "SELECT * FROM payment_orders WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );
    if (orderRes.rows.length === 0) {
      await clientDb.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn" });
    }

    const order = orderRes.rows[0];
    if (order.status === "paid" && order.license_key) {
      await clientDb.query("COMMIT");
      return res.json({ success: true, order });
    }

    const license = await createLicenseRecord(
      {
        type: order.license_type,
        days: order.duration_days,
        maxMachines: order.max_machines,
        clientName: order.customer_name || order.order_code,
        clientPhone: order.customer_phone,
        clientEmail: order.customer_email,
        notes: `Paid order ${order.order_code}${adminNote ? ` - ${adminNote}` : ""}`,
      },
      clientDb
    );

    const updateRes = await clientDb.query(
      `
        UPDATE payment_orders
        SET status = 'paid', paid_at = NOW(), license_key = $1, admin_note = $2
        WHERE id = $3
        RETURNING *;
      `,
      [license.raw || license.key, adminNote || null, order.id]
    );
    await clientDb.query("COMMIT");
    res.json({ success: true, order: updateRes.rows[0], license });
  } catch (err) {
    await clientDb.query("ROLLBACK");
    console.error("Mark paid error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    clientDb.release();
  }
});

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
      `
        SELECT
          l.*,
          po.order_code AS payment_order_code,
          po.customer_name AS payment_customer_name,
          po.customer_phone AS payment_customer_phone,
          po.customer_email AS payment_customer_email,
          po.plan_name AS payment_plan_name,
          po.amount_vnd AS payment_amount_vnd,
          po.created_at AS payment_created_at,
          po.paid_at AS payment_paid_at
        FROM licenses l
        LEFT JOIN payment_orders po
          ON po.license_key = l.raw_key OR po.license_key = l.key
        ORDER BY l.created_at DESC
      `
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
 * DELETE LICENSE (Admin)
 */
app.delete("/api/license/:id", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM licenses WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (result.rowCount > 0) {
      res.json({ success: true, message: "Đã xóa license khỏi database" });
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
