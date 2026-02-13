
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

    console.log('Database initialization COMPLETED successfully.');

  } catch (err) {
    console.error('Database Initialization FAILED:', err);
  } finally {
    await pool.end();
  }
}

initDB();
