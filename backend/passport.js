const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Pool } = require('pg'); // Veritabanı bağlantısını ekledik
require('dotenv').config();

// Veritabanı bilgilerini buraya da eklemeliyiz
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD, 
  port: process.env.DB_PORT,
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
        const userEmail = profile.emails[0].value;
        const userName = profile.displayName;
        const googleId = profile.id;

        // 1. ADIM: Bu kullanıcı veritabanında zaten var mı?
        let userRes = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);

        if (userRes.rows.length === 0) {
            // 2. ADIM: Yoksa, yeni kullanıcıyı PostgreSQL'e KAYDET
            console.log("🆕 Yeni kullanıcı kaydediliyor:", userName);
            userRes = await pool.query(
                'INSERT INTO users (google_id, full_name, email) VALUES ($1, $2, $3) RETURNING *',
                [googleId, userName, userEmail]
            );
        } else {
            console.log("✅ Mevcut kullanıcı giriş yaptı:", userName);
        }

        // Veritabanındaki kullanıcı bilgisini (id, google_id vb.) bir sonraki adıma gönderiyoruz
        return done(null, userRes.rows[0]);
        
    } catch (error) {
        console.error("Google Auth Veritabanı Hatası:", error);
        return done(error, null);
    }
  }
));

module.exports = passport;