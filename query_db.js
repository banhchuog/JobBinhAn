const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT * FROM casso_transactions ORDER BY created_at DESC LIMIT 5')
  .then(res => { console.log("Transactions:", res.rows); pool.end(); })
  .catch(err => { console.error("Error:", err); pool.end(); });
