const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function fix() {
  try {
    await pool.query(`
      UPDATE reports r
      SET 
        up_votes = (SELECT COUNT(*) FROM report_votes WHERE report_id = r.id AND vote_type IN ('upvote', 'up')),
        down_votes = (SELECT COUNT(*) FROM report_votes WHERE report_id = r.id AND vote_type IN ('downvote', 'down'))
    `);
    
    // Also normalize old 'up'/'down' to 'upvote'/'downvote' just in case
    await pool.query(`UPDATE report_votes SET vote_type = 'upvote' WHERE vote_type = 'up'`);
    await pool.query(`UPDATE report_votes SET vote_type = 'downvote' WHERE vote_type = 'down'`);

    console.log("Veritabanı oy sayıları başarıyla eşitlendi!");
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
fix();
