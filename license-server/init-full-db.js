
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

async function initDB() {
  try {
    console.log(`Connecting to database: ${process.env.PG_DATABASE} on port ${process.env.PG_PORT}...`);
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    
    // 1. Create licenses table
    console.log('Creating table: licenses...');
    await pool.query(`
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
    `);
    
    // Add new columns if table already exists (safe migration)
    console.log('Migrating schema (adding new columns if missing)...');
    await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS client_phone VARCHAR(50)`);
    await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS client_email VARCHAR(255)`);
    await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS notes TEXT`);

    // 2. Create admin_users table
    console.log('Creating table: admin_users...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        email VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 3. Create license_requests table
    console.log('Creating table: license_requests...');
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

    // 4. Seed Admins
    console.log('Seeding admin users...');
    const initialAdmins = ['luuquan232003@gmail.com', 'luuquankarate@gmail.com'];
    for (const email of initialAdmins) {
        await pool.query(`INSERT INTO admin_users (email, name) VALUES ($1, 'Super Admin') ON CONFLICT (email) DO NOTHING`, [email]);
        console.log(` - Verified admin: ${email}`);
    }

    // 5. Commerce settings
    console.log('Creating commerce tables...');
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
        instructions TEXT,
        contact_phone VARCHAR(50),
        contact_email VARCHAR(255),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
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

    console.log('Database initialization COMPLETED successfully.');

  } catch (err) {
    console.error('Database Initialization FAILED:', err);
  } finally {
    await pool.end();
  }
}

initDB();
