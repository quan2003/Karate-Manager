
require('dotenv').config();
const { Pool } = require('pg');

console.log('PG_USER:', process.env.PG_USER);
console.log('PG_HOST:', process.env.PG_HOST);
console.log('PG_PORT:', process.env.PG_PORT);
console.log('PG_DATABASE:', process.env.PG_DATABASE);
console.log('PG_PASSWORD length:', process.env.PG_PASSWORD ? process.env.PG_PASSWORD.length : 0);
// console.log('PG_PASSWORD:', process.env.PG_PASSWORD); // Don't log full password for security, or log it if desperate

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Connection Error:', err);
  } else {
    console.log('Connection Success:', res.rows[0]);
  }
  pool.end();
});
