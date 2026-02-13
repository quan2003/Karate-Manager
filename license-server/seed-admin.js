
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

const emailsToAdd = [
    'luuquan232003@gmail.com',
    'luuquankarate@gmail.com'
];

async function addAdmins() {
  try {
    for (const email of emailsToAdd) {
        await pool.query(
            "INSERT INTO admin_users (email, name) VALUES ($1, 'Super Admin') ON CONFLICT (email) DO NOTHING",
            [email]
        );
        console.log(`Added/Verified admin: ${email}`);
    }
  } catch (err) {
    console.error('Error adding admins:', err);
  } finally {
    await pool.end();
  }
}

addAdmins();
