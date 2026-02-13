
require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: 'postgres', // Connect to default DB
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

async function setup() {
  try {
    await client.connect();
    console.log('Connected to postgres database.');
    
    // Check if db exists
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'karate_license_db'");
    if (res.rows.length === 0) {
      console.log('Creating database karate_license_db...');
      await client.query('CREATE DATABASE karate_license_db');
      console.log('Database created successfully.');
    } else {
      console.log('Database karate_license_db already exists.');
    }
  } catch (err) {
    console.error('Setup Error:', err);
  } finally {
    await client.end();
  }
}

setup();
