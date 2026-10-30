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
const { createPublicTournamentData, filterPublicRanking, publicId } = require("./public-data");
const { getR2Config, presignR2 } = require("./r2-storage");

// Load the same on-disk configuration in every PM2 cluster worker. PM2 can
// retain different historical environment values per worker; overriding them
// here prevents a token issued by worker A being rejected by worker B.
dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 2000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
let JWT_SECRET = process.env.JWT_SECRET || "karate_license_server_super_secret_jwt_key_2026_production_vps_fallback_64chars_long";
if (!JWT_SECRET || JWT_SECRET.length < 64 || JWT_SECRET.includes("CHANGE_ME")) {
  console.warn("Using default fallback JWT_SECRET");
}
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
    initializeContentSchema();
    initializeRequestsSchema();
    initializeCommerceSchema();
    initializeTournamentsSchema();
    initializeAthleteMediaSchema();
    initializePublicRegistrationSchema();
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

    // Never create a known default password. The first website administrator
    // is seeded only when the VPS provides both environment variables.
    const initialUsername = String(process.env.WEB_ADMIN_USERNAME || "").trim();
    const initialPassword = String(process.env.WEB_ADMIN_INITIAL_PASSWORD || "");
    if (initialUsername && initialPassword.length >= 12) {
      const passwordHash = await bcrypt.hash(initialPassword, 12);
      await pool.query(
        `INSERT INTO admin_accounts (username, password_hash, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (username) DO NOTHING`,
        [initialUsername, passwordHash, process.env.WEB_ADMIN_DISPLAY_NAME || "K-SPORT Admin"]
      );
      console.log(`Website admin account is ready: ${initialUsername}`);
    } else {
      console.warn("Website admin seed skipped: WEB_ADMIN_USERNAME and a 12+ character WEB_ADMIN_INITIAL_PASSWORD are required.");
    }
    const legacy = await pool.query("SELECT password_hash FROM admin_accounts WHERE username = 'admin' LIMIT 1");
    if (legacy.rowCount && await bcrypt.compare("admin123", legacy.rows[0].password_hash)) {
      await pool.query("DELETE FROM admin_accounts WHERE username = 'admin'");
      console.log("Removed insecure legacy admin account.");
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

// Public-website content is intentionally kept separate from tournament data.
// Only an authenticated website administrator can create or publish it.
const initializeContentSchema = async () => {
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public_news (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(180) UNIQUE NOT NULL,
        title VARCHAR(300) NOT NULL,
        category VARCHAR(120) NOT NULL DEFAULT 'Tin tức',
        summary TEXT NOT NULL DEFAULT '',
        body JSONB NOT NULL DEFAULT '[]'::jsonb,
        image_url TEXT NOT NULL DEFAULT '',
        published_at DATE NOT NULL DEFAULT CURRENT_DATE,
        is_published BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS public_banners (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        eyebrow VARCHAR(180) NOT NULL DEFAULT '',
        title VARCHAR(300) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        primary_label VARCHAR(100) NOT NULL DEFAULT '',
        primary_href VARCHAR(500) NOT NULL DEFAULT '',
        secondary_label VARCHAR(100) NOT NULL DEFAULT '',
        secondary_href VARCHAR(500) NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        is_published BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("Public content schema initialized successfully.");
  } catch (err) {
    console.error("Error creating public content schema:", err);
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

const initializeTournamentsSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_tournaments (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(500) NOT NULL,
        machine_id VARCHAR(255),
        start_date VARCHAR(50),
        end_date VARCHAR(50),
        location TEXT,
        total_athletes INTEGER DEFAULT 0,
        total_categories INTEGER DEFAULT 0,
        data_size INTEGER DEFAULT 0,
        last_synced_at TIMESTAMPTZ DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'ACTIVE',
        is_purged BOOLEAN DEFAULT FALSE,
        backup_data JSONB,
        summary JSONB DEFAULT '{}'::jsonb,
        owner_license_id UUID,
        authorized_machine_id VARCHAR(255),
        is_public BOOLEAN DEFAULT FALSE,
        public_data JSONB
      );
      ALTER TABLE cloud_tournaments ADD COLUMN IF NOT EXISTS owner_license_id UUID;
      ALTER TABLE cloud_tournaments ADD COLUMN IF NOT EXISTS authorized_machine_id VARCHAR(255);
      ALTER TABLE cloud_tournaments ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
      ALTER TABLE cloud_tournaments ADD COLUMN IF NOT EXISTS public_data JSONB;
      CREATE INDEX IF NOT EXISTS idx_cloud_public_read
        ON cloud_tournaments (last_synced_at DESC)
        WHERE is_public = TRUE AND public_data IS NOT NULL;
    `);
    console.log("Tournaments schema initialized successfully.");
  } catch (err) {
    console.error("Error creating tournaments schema:", err);
  }
};

// New table only: it never backfills or mutates historical tournaments.
const initializeAthleteMediaSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS athlete_media (
        athlete_id TEXT PRIMARY KEY,
        owner_license_id UUID NOT NULL,
        public_athlete_id VARCHAR(64) UNIQUE NOT NULL,
        object_key TEXT NOT NULL,
        content_type VARCHAR(100) NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
        is_public BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMPTZ,
        approved_by TEXT
      );
      ALTER TABLE athlete_media ADD COLUMN IF NOT EXISTS owner_license_id UUID;
      CREATE INDEX IF NOT EXISTS idx_athlete_media_public
        ON athlete_media (public_athlete_id) WHERE is_public = TRUE;
    `);
    console.log("Athlete media schema initialized successfully.");
  } catch (err) {
    console.error("Error creating athlete media schema:", err);
  }
};

// Records the source of photos submitted from the public registration site.
// It is intentionally separate from historical tournament data and remains
// private until an authenticated Admin approves the photo for publication.
const initializePublicRegistrationSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public_registration_media (
        athlete_id TEXT PRIMARY KEY,
        tournament_id VARCHAR(255) NOT NULL,
        club_id TEXT NOT NULL,
        owner_license_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_public_registration_media_tournament
        ON public_registration_media (tournament_id);
    `);
    console.log("Public registration media schema initialized successfully.");
  } catch (err) {
    console.error("Error creating public registration media schema:", err);
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

const autoPurgeOldTournaments = async (retentionDays = 7) => {
  try {
    const result = await pool.query(
      `UPDATE cloud_tournaments 
       SET backup_data = NULL, is_purged = TRUE, status = 'PURGED' 
       WHERE is_purged = FALSE 
         AND last_synced_at < NOW() - INTERVAL '1 day' * $1 
       RETURNING id, name`,
      [retentionDays]
    );
    if (result.rowCount > 0) {
      console.log(`[Auto-Purge] Purged heavy data for ${result.rowCount} old tournament(s)`);
    }
  } catch (err) {
    console.error("[Auto-Purge] Error during auto purge:", err);
  }
};

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
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// --- Auth Middleware ---
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại!" });
  }

  const token = authHeader.slice("Bearer ".length);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: "Phiên làm việc không hợp lệ hoặc đã hết hạn" });
    req.user = user;
    next();
  });
};

// Desktop cloud writes use the customer's active license as a scoped
// credential. The machine must already be activated through /api/license/verify;
// this middleware never activates a new machine as a side effect.
const cloudLicenseMiddleware = async (req, res, next) => {
  const licenseKey = String(req.headers["x-k-sport-license"] || "").trim();
  const machineId = String(req.headers["x-k-sport-machine"] || "").trim();
  if (!licenseKey || !machineId) {
    return res.status(401).json({ success: false, message: "Cloud sync yêu cầu license và Machine ID" });
  }
  if (licenseKey.length > 4096 || machineId.length > 255) {
    return res.status(400).json({ success: false, message: "Thông tin xác thực Cloud không hợp lệ" });
  }

  try {
    const result = await pool.query(
      `SELECT id, activated_machines
       FROM licenses
       WHERE (key = $1 OR raw_key = $1)
         AND status = 'active'
         AND expiry_date > NOW()
       LIMIT 1`,
      [licenseKey]
    );
    const license = result.rows[0];
    if (!license || !(license.activated_machines || []).includes(machineId)) {
      return res.status(403).json({ success: false, message: "License hoặc Machine ID không có quyền Cloud sync" });
    }
    req.cloudLicense = { id: license.id, machineId, activatedMachines: license.activated_machines || [] };
    return next();
  } catch (err) {
    console.error("Cloud license authentication error:", err);
    return res.status(500).json({ success: false, message: "Không thể xác thực Cloud sync" });
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
app.post("/api/license/create", authMiddleware, async (req, res) => {
  try {
    const {
      type,
      days,
      maxMachines,
      clientName,
      clientPhone,
      clientEmail,
      notes,
    } = req.body;

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

// === CLOUD SYNC & TOURNAMENT MANAGEMENT ENDPOINTS ===

const publicReadMiddleware = (req, res, next) => {
  const configuredToken = String(process.env.PUBLIC_API_TOKEN || "").trim();
  if (!configuredToken) return next();
  const suppliedToken = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const expected = Buffer.from(configuredToken);
  const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ success: false, message: "Public API token không hợp lệ" });
  }
  return next();
};

const loadPublicData = async () => {
  const result = await pool.query(`
    SELECT id, name, start_date, end_date, location, backup_data, summary, public_data
    FROM cloud_tournaments
    WHERE is_public = TRUE AND public_data IS NOT NULL
    ORDER BY last_synced_at DESC
  `);
  return result.rows.map((row) => {
    // Rebuild the narrow public DTO from the stored backup. This keeps newly
    // added safe fields (event date and computed match statistics) available
    // for already-public tournaments without requiring a second sync.
    if (row.backup_data) {
      return createPublicTournamentData({
        tournamentId: row.id,
        tournamentName: row.name,
        startDate: row.start_date,
        endDate: row.end_date,
        location: row.location,
        backupData: row.backup_data,
        summary: row.summary,
      });
    }
    return row.public_data;
  }).filter(Boolean);
};

const refreshEventStatus = (event) => {
  const today = new Date().toISOString().slice(0, 10);
  const status = event?.date && today < event.date
    ? "Sắp diễn ra"
    : event?.endDate && today > event.endDate
      ? "Đã kết thúc"
      : "Đang diễn ra";
  return { ...event, status };
};

const publicCollection = (field, transform = (item) => item) => async (req, res) => {
  try {
    const datasets = await loadPublicData();
    let items = datasets.flatMap((dataset) => Array.isArray(dataset?.[field]) ? dataset[field] : []).map(transform);
    if (field === "athletes" && items.length) {
      const ids = items.map((item) => item.id).filter(Boolean);
      const media = await pool.query(
        "SELECT public_athlete_id FROM athlete_media WHERE is_public = TRUE AND public_athlete_id = ANY($1::text[])",
        [ids],
      );
      const visible = new Set(media.rows.map((row) => row.public_athlete_id));
      items = items.map((item) => visible.has(item.id)
        ? { ...item, photoUrl: `/api/public/athletes/${encodeURIComponent(item.id)}/photo` }
        : item);
    }
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    return res.json({ items });
  } catch (err) {
    console.error(`Public API ${field} error:`, err);
    return res.status(500).json({ items: [], message: "Không thể tải dữ liệu công khai" });
  }
};

const athletePhotoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const athletePhotoExtension = (contentType) => ({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}[contentType]);

// Public registration uploads are deliberately opt-in. They still require a
// known K-SPORT tournament and are rate-limited because the caller is a coach,
// not an authenticated Desktop/Admin client.
const publicRegistrationMediaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip,
});

const resolveRegistrationTournamentOwner = async (tournamentId) => {
  const result = await pool.query(
    `SELECT id, owner_license_id
     FROM cloud_tournaments
     WHERE id = $1 AND is_purged = FALSE AND owner_license_id IS NOT NULL
     LIMIT 1`,
    [tournamentId],
  );
  return result.rows[0] || null;
};

const validatePublicRegistrationPhoto = async (req, res) => {
  if (String(process.env.PUBLIC_REGISTRATION_UPLOADS_ENABLED || "").toLowerCase() !== "true") {
    res.status(503).json({ success: false, message: "ChÆ°a báº­t upload áº£nh Ä‘Äƒng kÃ½ cÃ´ng khai" });
    return null;
  }
  const athleteId = String(req.params.athleteId || "").trim();
  const tournamentId = String(req.body?.tournamentId || "").trim();
  const clubId = String(req.body?.clubId || "").trim();
  const contentType = String(req.body?.contentType || "").toLowerCase().trim();
  const sizeBytes = Number(req.body?.sizeBytes);
  if (!athleteId || athleteId.length > 300 || !tournamentId || tournamentId.length > 255 || !clubId || clubId.length > 300 ||
      !athletePhotoMimeTypes.has(contentType) || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 5242880) {
    res.status(400).json({ success: false, message: "ThÃ´ng tin áº£nh thÃ¨ hoáº·c Ä‘Äƒng kÃ½ khÃ´ng há»£p lá»‡" });
    return null;
  }
  if (!getR2Config()) {
    res.status(503).json({ success: false, message: "R2 chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh" });
    return null;
  }
  const tournament = await resolveRegistrationTournamentOwner(tournamentId);
  if (!tournament) {
    res.status(404).json({ success: false, message: "Giáº£i Ä‘áº¥u chÆ°a sáºµn sÃ ng nháº­n áº£nh Ä‘Äƒng kÃ½ K-SPORT" });
    return null;
  }
  return { athleteId, tournamentId, clubId, contentType, sizeBytes, ownerLicenseId: tournament.owner_license_id };
};

app.post("/api/public/registration/athletes/:athleteId/photo-upload-url", publicRegistrationMediaLimiter, async (req, res) => {
  try {
    const input = await validatePublicRegistrationPhoto(req, res);
    if (!input) return;
    const objectKey = `registration-athletes/${input.tournamentId.replace(/[^a-zA-Z0-9_-]/g, "_")}/${input.athleteId.replace(/[^a-zA-Z0-9_-]/g, "_")}/${crypto.randomUUID()}.${athletePhotoExtension(input.contentType)}`;
    const reservation = await pool.query(`
      INSERT INTO public_registration_media (athlete_id, tournament_id, club_id, owner_license_id, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (athlete_id) DO UPDATE SET
        tournament_id = EXCLUDED.tournament_id,
        club_id = EXCLUDED.club_id,
        updated_at = NOW()
      WHERE public_registration_media.owner_license_id = EXCLUDED.owner_license_id
      RETURNING athlete_id
    `, [input.athleteId, input.tournamentId, input.clubId, input.ownerLicenseId]);
    if (!reservation.rowCount) return res.status(403).json({ success: false, message: "Há»“ sÆ¡ VÄV thuá»™c giáº£i K-SPORT khÃ¡c" });
    return res.json({
      success: true,
      objectKey,
      uploadUrl: presignR2({ method: "PUT", key: objectKey, expiresSeconds: 300 }),
      expiresInSeconds: 300,
    });
  } catch (err) {
    console.error("Public registration photo signature error:", err);
    return res.status(500).json({ success: false, message: "KhÃ´ng thá»ƒ táº¡o URL upload áº£nh" });
  }
});

app.post("/api/public/registration/athletes/:athleteId/photo-complete", publicRegistrationMediaLimiter, async (req, res) => {
  try {
    const input = await validatePublicRegistrationPhoto(req, res);
    if (!input) return;
    const objectKey = String(req.body?.objectKey || "").trim();
    const safePrefix = `registration-athletes/${input.tournamentId.replace(/[^a-zA-Z0-9_-]/g, "_")}/${input.athleteId.replace(/[^a-zA-Z0-9_-]/g, "_")}/`;
    if (!objectKey.startsWith(safePrefix)) {
      return res.status(400).json({ success: false, message: "KhÃ³a áº£nh khÃ´ng há»£p lá»‡" });
    }
    const reserved = await pool.query(
      `SELECT athlete_id FROM public_registration_media
       WHERE athlete_id = $1 AND tournament_id = $2 AND club_id = $3 AND owner_license_id = $4`,
      [input.athleteId, input.tournamentId, input.clubId, input.ownerLicenseId],
    );
    if (!reserved.rowCount) return res.status(409).json({ success: false, message: "PhiÃªn upload áº£nh Ä‘Ã£ háº¿t háº¡n hoáº·c khÃ´ng tá»“n táº¡i" });
    const saved = await pool.query(`
      INSERT INTO athlete_media (athlete_id, owner_license_id, public_athlete_id, object_key, content_type, size_bytes, is_public, updated_at, approved_at, approved_by)
      VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW(), NULL, NULL)
      ON CONFLICT (athlete_id) DO UPDATE SET
        public_athlete_id = EXCLUDED.public_athlete_id,
        object_key = EXCLUDED.object_key,
        content_type = EXCLUDED.content_type,
        size_bytes = EXCLUDED.size_bytes,
        is_public = FALSE,
        updated_at = NOW(),
        approved_at = NULL,
        approved_by = NULL
      WHERE athlete_media.owner_license_id = EXCLUDED.owner_license_id
      RETURNING athlete_id
    `, [input.athleteId, input.ownerLicenseId, publicId("athlete", input.athleteId), objectKey, input.contentType, input.sizeBytes]);
    if (!saved.rowCount) return res.status(403).json({ success: false, message: "Há»“ sÆ¡ VÄV thuá»™c giáº£i K-SPORT khÃ¡c" });
    return res.json({ success: true, photoStatus: "pending_admin_review", publicApproved: false });
  } catch (err) {
    console.error("Public registration photo complete error:", err);
    return res.status(500).json({ success: false, message: "KhÃ´ng thá»ƒ lÆ°u thÃ´ng tin áº£nh thÃ¨" });
  }
});

// The client uploads directly to a private R2 bucket. The VPS only issues a
// short-lived signature, so card photos never consume VPS disk or bandwidth.
app.post("/api/media/athletes/:athleteId/upload-url", cloudLicenseMiddleware, async (req, res) => {
  const athleteId = String(req.params.athleteId || "").trim();
  const contentType = String(req.body?.contentType || "").toLowerCase().trim();
  const sizeBytes = Number(req.body?.sizeBytes);
  if (!athleteId || athleteId.length > 300 || !athletePhotoMimeTypes.has(contentType) || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 5242880) {
    return res.status(400).json({ success: false, message: "Ảnh thẻ phải là JPG, PNG hoặc WebP và không quá 5 MB" });
  }
  if (!getR2Config()) return res.status(503).json({ success: false, message: "R2 chưa được cấu hình" });
  const objectKey = `athletes/${athleteId.replace(/[^a-zA-Z0-9_-]/g, "_")}/${crypto.randomUUID()}.${athletePhotoExtension(contentType)}`;
  try {
    return res.json({
      success: true,
      objectKey,
      uploadUrl: presignR2({ method: "PUT", key: objectKey, expiresSeconds: 300 }),
      expiresInSeconds: 300,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Không thể tạo URL upload ảnh" });
  }
});

app.post("/api/media/athletes/:athleteId/complete", cloudLicenseMiddleware, async (req, res) => {
  const athleteId = String(req.params.athleteId || "").trim();
  const objectKey = String(req.body?.objectKey || "").trim();
  const contentType = String(req.body?.contentType || "").toLowerCase().trim();
  const sizeBytes = Number(req.body?.sizeBytes);
  const safePrefix = `athletes/${athleteId.replace(/[^a-zA-Z0-9_-]/g, "_")}/`;
  if (!athleteId || !objectKey.startsWith(safePrefix) || !athletePhotoMimeTypes.has(contentType) || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 5242880) {
    return res.status(400).json({ success: false, message: "Thông tin ảnh thẻ không hợp lệ" });
  }
  try {
    const result = await pool.query(`
      INSERT INTO athlete_media (athlete_id, owner_license_id, public_athlete_id, object_key, content_type, size_bytes, is_public, updated_at, approved_at, approved_by)
      VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW(), NULL, NULL)
      ON CONFLICT (athlete_id) DO UPDATE SET
        public_athlete_id = EXCLUDED.public_athlete_id,
        object_key = EXCLUDED.object_key,
        content_type = EXCLUDED.content_type,
        size_bytes = EXCLUDED.size_bytes,
        is_public = FALSE,
        updated_at = NOW(),
        approved_at = NULL,
        approved_by = NULL
      WHERE athlete_media.owner_license_id = EXCLUDED.owner_license_id
      RETURNING athlete_id
    `, [athleteId, req.cloudLicense.id, publicId("athlete", athleteId), objectKey, contentType, sizeBytes]);
    if (!result.rowCount) return res.status(403).json({ success: false, message: "Hồ sơ ảnh thuộc license khác" });
    return res.json({ success: true, publicApproved: false });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Không thể lưu thông tin ảnh thẻ" });
  }
});

app.post("/api/media/athletes/:athleteId/publication", cloudLicenseMiddleware, async (req, res) => {
  const athleteId = String(req.params.athleteId || "").trim();
  const isPublic = req.body?.isPublic === true;
  try {
    const updated = await pool.query(`
      UPDATE athlete_media
      SET is_public = $2, approved_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
          approved_by = CASE WHEN $2 THEN 'ADMIN' ELSE NULL END
      WHERE athlete_id = $1 AND owner_license_id = $3
      RETURNING public_athlete_id, is_public
    `, [athleteId, isPublic, req.cloudLicense.id]);
    if (!updated.rowCount) return res.status(404).json({ success: false, message: "Chưa có ảnh thẻ để duyệt" });
    return res.json({ success: true, athleteId: updated.rows[0].public_athlete_id, publicApproved: updated.rows[0].is_public });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Không thể cập nhật quyền công khai ảnh" });
  }
});

// Card photos submitted from the public registration form stay private until
// approval. A licensed Desktop/Admin client can still request a short-lived
// viewing URL for review without making the photo publicly accessible.
app.get("/api/media/athletes/:athleteId/view-url", cloudLicenseMiddleware, async (req, res) => {
  const athleteId = String(req.params.athleteId || "").trim();
  if (!athleteId || athleteId.length > 300) {
    return res.status(400).json({ success: false, message: "Mã VĐV không hợp lệ" });
  }
  try {
    const media = await pool.query(
      `SELECT object_key, content_type, is_public
       FROM athlete_media
       WHERE athlete_id = $1 AND owner_license_id = $2
       LIMIT 1`,
      [athleteId, req.cloudLicense.id],
    );
    if (!media.rowCount) {
      return res.status(404).json({ success: false, message: "Chưa có ảnh thẻ cho VĐV này" });
    }
    return res.json({
      success: true,
      contentType: media.rows[0].content_type,
      publicApproved: media.rows[0].is_public,
      viewUrl: presignR2({ method: "GET", key: media.rows[0].object_key, expiresSeconds: 300 }),
      expiresInSeconds: 300,
    });
  } catch (err) {
    console.error("Athlete card-photo view URL error:", err);
    return res.status(500).json({ success: false, message: "Không thể mở ảnh thẻ" });
  }
});

// Lets the owner of a tournament approve all currently submitted card photos
// in one review action. The photos remain scoped to that tournament/license.
app.post("/api/media/tournaments/:tournamentId/photos/publication", cloudLicenseMiddleware, async (req, res) => {
  const tournamentId = String(req.params.tournamentId || "").trim();
  const isPublic = req.body?.isPublic === true;
  if (!tournamentId || tournamentId.length > 255) {
    return res.status(400).json({ success: false, message: "Mã giải đấu không hợp lệ" });
  }
  try {
    const tournament = await pool.query(
      `SELECT id FROM cloud_tournaments
       WHERE id = $1 AND owner_license_id = $2 AND is_purged = FALSE
       LIMIT 1`,
      [tournamentId, req.cloudLicense.id],
    );
    if (!tournament.rowCount) {
      return res.status(404).json({ success: false, message: "Không tìm thấy giải đấu thuộc license này" });
    }
    const updated = await pool.query(
      `UPDATE athlete_media AS media
       SET is_public = $1,
           approved_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
           approved_by = CASE WHEN $1 THEN 'ADMIN_BATCH' ELSE NULL END
       FROM public_registration_media AS registration
       WHERE media.athlete_id = registration.athlete_id
         AND registration.tournament_id = $2
         AND media.owner_license_id = $3
         AND registration.owner_license_id = $3
       RETURNING media.athlete_id`,
      [isPublic, tournamentId, req.cloudLicense.id],
    );
    return res.json({ success: true, publicApproved: isPublic, count: updated.rowCount });
  } catch (err) {
    console.error("Tournament card-photo publication error:", err);
    return res.status(500).json({ success: false, message: "Không thể cập nhật quyền ảnh thẻ của giải" });
  }
});

app.get("/api/public/athletes/:publicAthleteId/photo", async (req, res) => {
  try {
    const media = await pool.query(
      "SELECT object_key FROM athlete_media WHERE public_athlete_id = $1 AND is_public = TRUE",
      [String(req.params.publicAthleteId || "").trim()],
    );
    if (!media.rowCount) return res.status(404).end();
    return res.redirect(302, presignR2({ method: "GET", key: media.rows[0].object_key, expiresSeconds: 300 }));
  } catch {
    return res.status(404).end();
  }
});

app.get("/api/public/events", publicReadMiddleware, async (req, res) => {
  try {
    const datasets = await loadPublicData();
    const items = datasets.map((dataset) => refreshEventStatus(dataset.event)).filter((event) => event?.slug);
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    return res.json({ items });
  } catch (err) {
    console.error("Public API events error:", err);
    return res.status(500).json({ items: [], message: "Không thể tải danh sách giải đấu" });
  }
});

app.get("/api/public/events/:slug", publicReadMiddleware, async (req, res) => {
  try {
    const datasets = await loadPublicData();
    const event = datasets.map((dataset) => dataset.event).find((item) => item?.slug === req.params.slug);
    if (!event) return res.status(404).json({ message: "Không tìm thấy giải đấu" });
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    return res.json(refreshEventStatus(event));
  } catch {
    return res.status(500).json({ message: "Không thể tải giải đấu" });
  }
});

app.get("/api/public/schedule", publicReadMiddleware, publicCollection("schedule"));
app.get("/api/public/results", publicReadMiddleware, publicCollection("results"));
app.get(["/api/public/ranking", "/ranking"], publicReadMiddleware, async (req, res) => {
  try {
    const items = filterPublicRanking(
      (await loadPublicData()).flatMap((dataset) => Array.isArray(dataset?.ranking) ? dataset.ranking : []),
      req.query,
    );
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    return res.json({ items });
  } catch (err) {
    console.error("Public API ranking error:", err);
    return res.status(500).json({ items: [], message: "Không thể tải dữ liệu xếp hạng" });
  }
});
const publicNewsRow = (row) => ({
  slug: row.slug,
  title: row.title,
  category: row.category,
  summary: row.summary,
  body: Array.isArray(row.body) ? row.body : [],
  image: row.image_url,
  publishedAt: String(row.published_at).slice(0, 10),
});

const publicBannerRow = (row) => ({
  id: row.id,
  eyebrow: row.eyebrow,
  title: row.title,
  description: row.description,
  image: row.image_url,
  primaryLabel: row.primary_label,
  primaryHref: row.primary_href,
  secondaryLabel: row.secondary_label,
  secondaryHref: row.secondary_href,
  position: row.position,
});

const contentText = (value, maxLength = 5000) => String(value || "").trim().slice(0, maxLength);
const contentSlug = (value) => contentText(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const publicContentImagePrefix = "public-content/";
const contentImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const contentUrl = (value) => {
  const url = contentText(value, 2000);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
};

const readNewsPayload = (body) => {
  const title = contentText(body?.title, 300);
  const slug = contentSlug(body?.slug || title);
  const bodyItems = Array.isArray(body?.body)
    ? body.body.map((item) => contentText(item, 5000)).filter(Boolean).slice(0, 40)
    : contentText(body?.body, 5000).split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 40);
  if (!title || !slug) return null;
  return {
    slug,
    title,
    category: contentText(body?.category, 120) || "Tin tức",
    summary: contentText(body?.summary, 1000),
    body: bodyItems,
    imageUrl: contentUrl(body?.imageUrl || body?.image),
    publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(body?.publishedAt || "")) ? body.publishedAt : new Date().toISOString().slice(0, 10),
    isPublished: body?.isPublished === true,
  };
};

const readBannerPayload = (body) => {
  const title = contentText(body?.title, 300);
  if (!title) return null;
  return {
    eyebrow: contentText(body?.eyebrow, 180),
    title,
    description: contentText(body?.description, 1200),
    imageUrl: contentUrl(body?.imageUrl || body?.image),
    primaryLabel: contentText(body?.primaryLabel, 100),
    primaryHref: contentUrl(body?.primaryHref),
    secondaryLabel: contentText(body?.secondaryLabel, 100),
    secondaryHref: contentUrl(body?.secondaryHref),
    position: Math.max(0, Math.min(999, Number.parseInt(body?.position, 10) || 0)),
    isPublished: body?.isPublished === true,
  };
};

// CMS media is uploaded directly from the browser to R2. The VPS only issues
// a short-lived signed URL and exposes a safe redirect for public reading.
app.post("/api/admin/content/upload-url", authMiddleware, (req, res) => {
  const contentType = String(req.body?.contentType || "").toLowerCase().trim();
  const sizeBytes = Number(req.body?.sizeBytes);
  if (!contentImageMimeTypes.has(contentType) || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 8 * 1024 * 1024) {
    return res.status(400).json({ message: "Ảnh phải là JPG, PNG hoặc WebP và không quá 8 MB" });
  }
  if (!getR2Config()) return res.status(503).json({ message: "Kho ảnh R2 chưa được cấu hình" });
  const objectKey = `${publicContentImagePrefix}${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${athletePhotoExtension(contentType)}`;
  const forwardedProtocol = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
  const origin = `${forwardedProtocol}://${req.get("host")}`;
  try {
    return res.json({
      success: true,
      objectKey,
      uploadUrl: presignR2({ method: "PUT", key: objectKey, expiresSeconds: 300 }),
      fileUrl: `${origin}/api/public/content-media/${encodeURIComponent(objectKey)}`,
      expiresInSeconds: 300,
    });
  } catch (err) {
    console.error("Content media signature error:", err);
    return res.status(500).json({ message: "Không thể tạo URL tải ảnh lên" });
  }
});

app.get("/api/public/content-media/:key", (req, res) => {
  const objectKey = String(req.params.key || "");
  if (!objectKey.startsWith(publicContentImagePrefix) || objectKey.length > 500) {
    return res.status(404).end();
  }
  try {
    return res.redirect(302, presignR2({ method: "GET", key: objectKey, expiresSeconds: 900 }));
  } catch (err) {
    return res.status(503).end();
  }
});

app.get("/api/admin/content/news", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public_news ORDER BY published_at DESC, created_at DESC");
    return res.json({ items: result.rows.map((row) => ({ ...publicNewsRow(row), id: row.id, isPublished: row.is_published })) });
  } catch (err) {
    return res.status(500).json({ message: "Không thể tải bài viết" });
  }
});

app.post("/api/admin/content/news", authMiddleware, async (req, res) => {
  const item = readNewsPayload(req.body);
  if (!item) return res.status(400).json({ message: "Tiêu đề bài viết không hợp lệ" });
  try {
    const result = await pool.query(
      `INSERT INTO public_news (slug, title, category, summary, body, image_url, published_at, is_published)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8) RETURNING *`,
      [item.slug, item.title, item.category, item.summary, JSON.stringify(item.body), item.imageUrl, item.publishedAt, item.isPublished],
    );
    return res.status(201).json({ item: { ...publicNewsRow(result.rows[0]), id: result.rows[0].id, isPublished: result.rows[0].is_published } });
  } catch (err) {
    return res.status(409).json({ message: "Đường dẫn bài viết đã tồn tại" });
  }
});

app.put("/api/admin/content/news/:id", authMiddleware, async (req, res) => {
  const item = readNewsPayload(req.body);
  if (!item) return res.status(400).json({ message: "Tiêu đề bài viết không hợp lệ" });
  try {
    const result = await pool.query(
      `UPDATE public_news SET slug=$1,title=$2,category=$3,summary=$4,body=$5::jsonb,image_url=$6,published_at=$7,is_published=$8,updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [item.slug, item.title, item.category, item.summary, JSON.stringify(item.body), item.imageUrl, item.publishedAt, item.isPublished, req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: "Không tìm thấy bài viết" });
    return res.json({ item: { ...publicNewsRow(result.rows[0]), id: result.rows[0].id, isPublished: result.rows[0].is_published } });
  } catch (err) {
    return res.status(409).json({ message: "Đường dẫn bài viết đã tồn tại" });
  }
});

app.delete("/api/admin/content/news/:id", authMiddleware, async (req, res) => {
  const result = await pool.query("DELETE FROM public_news WHERE id=$1 RETURNING id", [req.params.id]);
  return result.rowCount ? res.json({ success: true }) : res.status(404).json({ message: "Không tìm thấy bài viết" });
});

app.get("/api/admin/content/banners", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public_banners ORDER BY position ASC, created_at ASC");
    return res.json({ items: result.rows.map((row) => ({ ...publicBannerRow(row), isPublished: row.is_published })) });
  } catch (err) {
    return res.status(500).json({ message: "Không thể tải banner" });
  }
});

app.post("/api/admin/content/banners", authMiddleware, async (req, res) => {
  const item = readBannerPayload(req.body);
  if (!item) return res.status(400).json({ message: "Tiêu đề banner không hợp lệ" });
  const result = await pool.query(
    `INSERT INTO public_banners (eyebrow,title,description,image_url,primary_label,primary_href,secondary_label,secondary_href,position,is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [item.eyebrow, item.title, item.description, item.imageUrl, item.primaryLabel, item.primaryHref, item.secondaryLabel, item.secondaryHref, item.position, item.isPublished],
  );
  return res.status(201).json({ item: { ...publicBannerRow(result.rows[0]), isPublished: result.rows[0].is_published } });
});

app.put("/api/admin/content/banners/:id", authMiddleware, async (req, res) => {
  const item = readBannerPayload(req.body);
  if (!item) return res.status(400).json({ message: "Tiêu đề banner không hợp lệ" });
  const result = await pool.query(
    `UPDATE public_banners SET eyebrow=$1,title=$2,description=$3,image_url=$4,primary_label=$5,primary_href=$6,secondary_label=$7,secondary_href=$8,position=$9,is_published=$10,updated_at=NOW()
     WHERE id=$11 RETURNING *`,
    [item.eyebrow, item.title, item.description, item.imageUrl, item.primaryLabel, item.primaryHref, item.secondaryLabel, item.secondaryHref, item.position, item.isPublished, req.params.id],
  );
  return result.rowCount
    ? res.json({ item: { ...publicBannerRow(result.rows[0]), isPublished: result.rows[0].is_published } })
    : res.status(404).json({ message: "Không tìm thấy banner" });
});

app.delete("/api/admin/content/banners/:id", authMiddleware, async (req, res) => {
  const result = await pool.query("DELETE FROM public_banners WHERE id=$1 RETURNING id", [req.params.id]);
  return result.rowCount ? res.json({ success: true }) : res.status(404).json({ message: "Không tìm thấy banner" });
});

app.get("/api/public/news", publicReadMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public_news WHERE is_published=TRUE ORDER BY published_at DESC, created_at DESC");
    return res.json({ items: result.rows.map(publicNewsRow) });
  } catch (err) {
    return res.status(500).json({ items: [], message: "Không thể tải tin tức" });
  }
});
app.get("/api/public/news/:slug", publicReadMiddleware, async (req, res) => {
  const result = await pool.query("SELECT * FROM public_news WHERE slug=$1 AND is_published=TRUE LIMIT 1", [req.params.slug]);
  return result.rowCount ? res.json(publicNewsRow(result.rows[0])) : res.status(404).json({ message: "Không tìm thấy bài viết" });
});
app.get("/api/public/banners", publicReadMiddleware, async (req, res) => {
  const result = await pool.query("SELECT * FROM public_banners WHERE is_published=TRUE ORDER BY position ASC, created_at ASC");
  return res.json({ items: result.rows.map(publicBannerRow) });
});

app.get("/api/public/athletes", publicReadMiddleware, publicCollection("athletes"));
app.get("/api/public/athletes/:id", publicReadMiddleware, async (req, res) => {
  try {
    const athlete = (await loadPublicData())
      .flatMap((dataset) => dataset.athletes || [])
      .find((item) => item.id === req.params.id);
    if (!athlete) return res.status(404).json({ message: "Không tìm thấy vận động viên" });
    const media = await pool.query(
      "SELECT 1 FROM athlete_media WHERE public_athlete_id = $1 AND is_public = TRUE LIMIT 1",
      [athlete.id],
    );
    return res.json(media.rowCount
      ? { ...athlete, photoUrl: `/api/public/athletes/${encodeURIComponent(athlete.id)}/photo` }
      : athlete);
  } catch {
    return res.status(500).json({ message: "Không thể tải vận động viên" });
  }
});

app.get("/api/public/clubs", publicReadMiddleware, async (req, res) => {
  try {
    const merged = new Map();
    for (const club of (await loadPublicData()).flatMap((dataset) => dataset.clubs || [])) {
      const current = merged.get(club.id);
      merged.set(club.id, current ? { ...current, athleteCount: current.athleteCount + club.athleteCount } : club);
    }
    return res.json({ items: [...merged.values()] });
  } catch {
    return res.status(500).json({ items: [], message: "Không thể tải câu lạc bộ" });
  }
});

app.get("/api/public/clubs/:id", publicReadMiddleware, async (req, res) => {
  try {
    const clubs = (await loadPublicData()).flatMap((dataset) => dataset.clubs || []);
    const matches = clubs.filter((item) => item.id === req.params.id);
    if (!matches.length) return res.status(404).json({ message: "Không tìm thấy câu lạc bộ" });
    return res.json({ ...matches[0], athleteCount: matches.reduce((sum, item) => sum + item.athleteCount, 0) });
  } catch {
    return res.status(500).json({ message: "Không thể tải câu lạc bộ" });
  }
});

/**
 * 1. PUSH TOURNAMENT SYNC (Client App -> VPS)
 */
app.post(["/api/cloud-sync/tournament", "/cloud-sync/tournament"], cloudLicenseMiddleware, async (req, res) => {
  try {
    const {
      tournamentId, tournamentName, machineId, authorizedMachineId, startDate, endDate,
      location, totalAthletes, totalCategories, backupData, summary, isPublic,
    } = req.body || {};

    if (!tournamentId || !tournamentName || String(tournamentId).length > 255 || String(tournamentName).length > 500) {
      return res.status(400).json({ success: false, message: "Thiếu tournamentId hoặc tournamentName" });
    }
    if (String(machineId || "") !== req.cloudLicense.machineId) {
      return res.status(403).json({ success: false, message: "Machine ID trong dữ liệu không khớp thông tin xác thực" });
    }

    const jsonString = JSON.stringify(backupData || {});
    const dataSize = Buffer.byteLength(jsonString, "utf8");
    if (dataSize > 15 * 1024 * 1024) {
      return res.status(413).json({ success: false, message: "Gói Cloud sync vượt quá giới hạn 15 MB" });
    }

    const existing = await pool.query(
      `SELECT owner_license_id, machine_id, authorized_machine_id
       FROM cloud_tournaments WHERE id = $1`,
      [String(tournamentId)]
    );
    const current = existing.rows[0];
    if (current?.owner_license_id && String(current.owner_license_id) !== String(req.cloudLicense.id)) {
      return res.status(403).json({ success: false, message: "Giải đấu thuộc một license khác" });
    }
    const isUnownedLegacyRecord = Boolean(current && !current.owner_license_id);
    const belongsToActivatedMachine = req.cloudLicense.activatedMachines.includes(current?.machine_id);
    const canClaimLegacyRecord = isUnownedLegacyRecord && (
      !current.machine_id ||
      current.machine_id === req.cloudLicense.machineId ||
      belongsToActivatedMachine
    );
    if (isUnownedLegacyRecord && !canClaimLegacyRecord) {
      return res.status(403).json({ success: false, message: "Không thể nhận quyền sở hữu bản Cloud từ máy khác" });
    }
    // Old rows predate license ownership. Once their machine can be tied to the
    // authenticated license, let the current request nominate the new source.
    // Owned rows continue to enforce their designated source machine.
    if (!isUnownedLegacyRecord && current?.authorized_machine_id && current.authorized_machine_id !== req.cloudLicense.machineId) {
      return res.status(403).json({ success: false, message: "Chỉ Máy Nguồn Chính được phép cập nhật giải đấu này" });
    }

    const requestedAuthorizedMachine = String(authorizedMachineId || req.cloudLicense.machineId).trim();
    if (!req.cloudLicense.activatedMachines.includes(requestedAuthorizedMachine)) {
      return res.status(400).json({ success: false, message: "Máy Nguồn Chính chưa được kích hoạt trên license này" });
    }
    const publicData = isPublic === true
      ? createPublicTournamentData({ tournamentId, tournamentName, startDate, endDate, location, backupData, summary })
      : null;

    const query = `
      INSERT INTO cloud_tournaments (
        id, name, machine_id, start_date, end_date, location, 
        total_athletes, total_categories, data_size, last_synced_at, 
        status, is_purged, backup_data, summary, owner_license_id,
        authorized_machine_id, is_public, public_data
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'ACTIVE', FALSE, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        machine_id = EXCLUDED.machine_id,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        location = EXCLUDED.location,
        total_athletes = EXCLUDED.total_athletes,
        total_categories = EXCLUDED.total_categories,
        data_size = EXCLUDED.data_size,
        last_synced_at = NOW(),
        backup_data = EXCLUDED.backup_data,
        summary = EXCLUDED.summary,
        owner_license_id = COALESCE(cloud_tournaments.owner_license_id, EXCLUDED.owner_license_id),
        authorized_machine_id = EXCLUDED.authorized_machine_id,
        is_public = EXCLUDED.is_public,
        public_data = EXCLUDED.public_data,
        is_purged = FALSE,
        status = 'ACTIVE';
    `;

    await pool.query(query, [
      tournamentId,
      tournamentName,
      machineId || "UNKNOWN",
      startDate || "",
      endDate || "",
      location || "",
      totalAthletes || 0,
      totalCategories || 0,
      dataSize,
      backupData || {},
      summary || {},
      req.cloudLicense.id,
      requestedAuthorizedMachine,
      isPublic === true,
      publicData
    ]);

    res.json({
      success: true,
      message: "Đồng bộ giải đấu lên Cloud VPS thành công!",
      tournamentId,
      syncedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Cloud Sync Push Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 2. GET ALL SYNCED TOURNAMENTS (Super Admin)
 */
app.get(["/api/cloud-sync/tournaments", "/cloud-sync/tournaments"], authMiddleware, async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_tournaments (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(500) NOT NULL,
        machine_id VARCHAR(255),
        start_date VARCHAR(50),
        end_date VARCHAR(50),
        location TEXT,
        total_athletes INTEGER DEFAULT 0,
        total_categories INTEGER DEFAULT 0,
        data_size INTEGER DEFAULT 0,
        last_synced_at TIMESTAMPTZ DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'ACTIVE',
        is_purged BOOLEAN DEFAULT FALSE,
        backup_data JSONB,
        summary JSONB DEFAULT '{}'::jsonb,
        owner_license_id UUID,
        authorized_machine_id VARCHAR(255),
        is_public BOOLEAN DEFAULT FALSE,
        public_data JSONB
      );
    `);

    const result = await pool.query(`
      SELECT 
        id, name, machine_id, start_date, end_date, location, 
        total_athletes, total_categories, data_size, last_synced_at, 
        status, is_purged, summary
      FROM cloud_tournaments
      ORDER BY last_synced_at DESC
    `);
    res.json({ success: true, tournaments: result.rows });
  } catch (err) {
    console.error("Cloud tournaments error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 2b. PUBLIC ENDPOINT FOR CLIENT APP TO CHECK SYNC STATUS
 */
app.get(["/api/cloud-sync/synced-ids", "/cloud-sync/synced-ids"], cloudLicenseMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, name, start_date, end_date, location,
        total_athletes, total_categories, last_synced_at, is_public
      FROM cloud_tournaments
      WHERE is_purged = FALSE AND owner_license_id = $1
      ORDER BY last_synced_at DESC
    `, [req.cloudLicense.id]);
    const ids = result.rows.map((r) => r.id);
    res.json({ success: true, tournaments: result.rows, ids });
  } catch (err) {
    res.status(500).json({ success: false, ids: [], tournaments: [], message: err.message });
  }
});

/**
 * 3. DOWNLOAD OWNED .KBACKUP FILE (licensed desktop client)
 */
app.get(["/api/cloud-sync/download-kbackup/:id", "/cloud-sync/download-kbackup/:id"], cloudLicenseMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM cloud_tournaments WHERE id = $1 AND owner_license_id = $2",
      [id, req.cloudLicense.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy giải đấu" });
    }

    const tournament = result.rows[0];
    if (tournament.is_purged || !tournament.backup_data) {
      return res.status(410).json({ 
        success: false, 
        message: "Dữ liệu chi tiết của giải đấu này đã được dọn dẹp để tối ưu VPS." 
      });
    }

    const safeName = (tournament.name || "tournament")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_");
    const fileName = `karate_${safeName}_${id.slice(0, 8)}.kbackup`;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(tournament.backup_data, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 4. PURGE TOURNAMENT HEAVY DATA (Super Admin)
 */
app.post(["/api/cloud-sync/purge/:id", "/cloud-sync/purge/:id"], authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE cloud_tournaments 
       SET backup_data = NULL, is_purged = TRUE, status = 'PURGED' 
       WHERE id = $1 RETURNING id, name`,
      [id]
    );

    if (result.rowCount > 0) {
      res.json({ success: true, message: `Đã dọn dẹp dung lượng DB cho giải ${result.rows[0].name}` });
    } else {
      res.status(404).json({ success: false, message: "Không tìm thấy giải đấu" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 4.5. DELETE TOURNAMENT RECORD PERMANENTLY (Super Admin)
 */
app.delete(["/api/cloud-sync/tournament/:id", "/cloud-sync/tournament/:id"], authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM cloud_tournaments WHERE id = $1 RETURNING name", [id]);

    if (result.rowCount > 0) {
      res.json({ success: true, message: `Đã xóa vĩnh viễn giải "${result.rows[0].name}" khỏi VPS Database` });
    } else {
      res.status(404).json({ success: false, message: "Không tìm thấy giải đấu" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 4.6. DELETE ALL TOURNAMENTS PERMANENTLY (Super Admin)
 */
app.delete(["/api/cloud-sync/tournaments/all", "/cloud-sync/tournaments/all"], authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM cloud_tournaments RETURNING id");
    res.json({ success: true, message: `Đã xóa sạch tất cả ${result.rowCount} giải đấu khỏi VPS Database!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 5. TRIGGER AUTO PURGE MANUALLY
 */
app.post(["/api/cloud-sync/trigger-auto-purge", "/cloud-sync/trigger-auto-purge"], authMiddleware, async (req, res) => {
  try {
    const { days = 7 } = req.body;
    await autoPurgeOldTournaments(days);
    res.json({ success: true, message: `Đã hoàn tất tự động dọn dẹp các giải quá ${days} ngày` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const ensureCloudResultRelayTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cloud_result_relay (
      id BIGSERIAL PRIMARY KEY,
      target_channel_id VARCHAR(255) NOT NULL,
      source_machine_id VARCHAR(255),
      tournament_id VARCHAR(255) NOT NULL,
      event_key VARCHAR(500) NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (target_channel_id, tournament_id, event_key)
    );
    CREATE INDEX IF NOT EXISTS idx_cloud_result_relay_inbox
      ON cloud_result_relay (target_channel_id, tournament_id, updated_at);
  `);
};

const isValidCloudChannel = (value) =>
  typeof value === "string" && value.startsWith("KRC-") && value.length >= 50 && value.length <= 200;

/** Capability-protected Internet result relay for Admin/Super Admin receivers. */
app.post(["/api/cloud-sync/results", "/cloud-sync/results"], async (req, res) => {
  try {
    await ensureCloudResultRelayTable();
    const { targetChannels, sourceMachineId, tournamentId, events } = req.body || {};
    const targets = [...new Set(
      (Array.isArray(targetChannels) ? targetChannels : [])
        .map((value) => String(value || "").trim())
        .filter(isValidCloudChannel)
    )].slice(0, 10);
    const safeEvents = (Array.isArray(events) ? events : [])
      .filter((event) => event && event.eventKey && event.payload)
      .slice(0, 1500);

    if (!tournamentId || targets.length === 0 || safeEvents.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Thiếu Mã nhận Cloud hợp lệ, ID giải đấu hoặc dữ liệu kết quả",
      });
    }

    const result = await pool.query(`
      WITH target_rows AS (
        SELECT UNNEST($1::text[]) AS target_channel_id
      ), event_rows AS (
        SELECT item->>'eventKey' AS event_key, item->'payload' AS payload
        FROM JSONB_ARRAY_ELEMENTS($4::jsonb) AS item
      )
      INSERT INTO cloud_result_relay (
        target_channel_id, source_machine_id, tournament_id, event_key, payload
      )
      SELECT target_rows.target_channel_id, $2, $3, event_rows.event_key, event_rows.payload
      FROM target_rows CROSS JOIN event_rows
      ON CONFLICT (target_channel_id, tournament_id, event_key)
      DO UPDATE SET
        source_machine_id = EXCLUDED.source_machine_id,
        payload = EXCLUDED.payload,
        updated_at = NOW()
      RETURNING id;
    `, [targets, String(sourceMachineId || "KRT-UNKNOWN"), String(tournamentId), JSON.stringify(safeEvents)]);

    res.json({
      success: true,
      deliveredCopies: result.rowCount,
      recipients: targets.length,
      events: safeEvents.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Cloud result relay push error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get(["/api/cloud-sync/results", "/cloud-sync/results"], async (req, res) => {
  try {
    await ensureCloudResultRelayTable();
    const channelId = String(req.query.channelId || "").trim();
    if (!isValidCloudChannel(channelId)) {
      return res.status(400).json({ success: false, message: "Mã nhận Cloud không hợp lệ" });
    }
    if (req.query.health === "1") {
      return res.json({ success: true, message: "Cloud Result Relay đang hoạt động" });
    }
    const tournamentId = String(req.query.tournamentId || "").trim();
    if (!tournamentId) {
      return res.status(400).json({ success: false, message: "Thiếu ID giải đấu" });
    }
    const sinceValue = String(req.query.since || "").trim();
    const since = sinceValue && !Number.isNaN(Date.parse(sinceValue))
      ? sinceValue
      : "1970-01-01T00:00:00.000Z";
    const result = await pool.query(`
      SELECT id, source_machine_id, tournament_id, event_key, payload, updated_at,
             TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at_cursor
      FROM cloud_result_relay
      WHERE target_channel_id = $1
        AND tournament_id = $2
        AND updated_at > $3::timestamptz
      ORDER BY updated_at ASC, id ASC
      LIMIT 1500;
    `, [channelId, tournamentId, since]);

    res.json({
      success: true,
      cursor: result.rows.length
        ? result.rows[result.rows.length - 1].updated_at_cursor
        : since,
      events: result.rows.map((row) => ({
        id: row.id,
        sourceMachineId: row.source_machine_id,
        tournamentId: row.tournament_id,
        eventKey: row.event_key,
        payload: row.payload,
        // Keep PostgreSQL's microsecond precision for the next `since` cursor.
        updatedAt: row.updated_at_cursor,
      })),
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Cloud result relay pull error:", err);
    res.status(500).json({ success: false, events: [], message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`License Server (PostgreSQL) running on port ${PORT}`);
});
