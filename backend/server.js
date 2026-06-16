require('dotenv').config();
const jwt = require('jsonwebtoken');
const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// --- MAİL GÖNDERİMİ İÇİN NODEMAILER ---
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER, // Kendi Gmail adresini yaz
    pass: process.env.GMAIL_PASS      // Google'dan aldığın 16 haneli şifre
  }
});

// --- TELEGRAM BOT AYARLARI ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// --- TWILIO WHATSAPP BİLDİRİM AYARLARI ---
const twilio = require('twilio');
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

// Google Kimlik Doğrulama Bileşenleri
const passport = require('passport');
require('./passport');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- POSTGRESQL BAĞLANTISI ---
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// --- 🛡️ GÜVENLİK GÖREVLİSİ (AUTHORIZATION MIDDLEWARE) ---
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).send("Yetkisiz erişim! Lütfen giriş yapın.");

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).send("Bilet formatı hatalı.");

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send("Bilet geçersiz veya süresi dolmuş.");
    req.user = user;
    next();
  });
};

// --- Yönetici Doğrulama (Admin Middleware) ---
const verifyAdmin = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT email FROM users WHERE google_id = $1', [String(req.user.id)]);
    if (result.rows.length === 0) return res.status(403).send("Kullanıcı bulunamadı.");
    const userEmail = result.rows[0].email;
    const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
    if (!adminEmails.includes(userEmail)) {
      return res.status(403).send("Bu işlem için yönetici yetkisi gereklidir.");
    }
    next();
  } catch (err) {
    res.status(500).send("Yönetici yetkisi doğrulanamadı.");
  }
};

app.use(cors());
app.use(express.json());
app.use(passport.initialize());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ==========================================
// API ROTALARI
// ==========================================

// --- ÇİFTÇİ KAYIT ---
app.post('/api/zones', verifyToken, async (req, res) => {
  const { telegramChatId, whatsappNumber, notificationPref, priorities, lat, lng, radius } = req.body;
  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);
  const numRadius = parseInt(radius) || 5;

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE google_id = $1', [String(req.user.id)]);
    if (userResult.rows.length === 0) return res.status(404).send("Kullanıcı bulunamadı");
    const dbUserId = userResult.rows[0].id;

    await pool.query('DELETE FROM saved_zones WHERE user_id = $1', [dbUserId]);

    const result = await pool.query(
      `INSERT INTO saved_zones (user_id, telegram_chat_id, whatsapp_number, notification_pref, priorities, lat, lng, radar_radius, geom) 
       VALUES ($1, $2, $3, $4, $5, $6::float, $7::float, $8, ST_SetSRID(ST_MakePoint($7::float, $6::float), 4326)::geography) 
       RETURNING *`,
      [dbUserId, telegramChatId, whatsappNumber, notificationPref, priorities, numLat, numLng, numRadius]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Bölge Kayıt Hatası:", err.message);
    res.status(500).send('Bölge kaydedilemedi');
  }
});

// --- ÇİFTÇİNİN KAYITLI AYARLARINI GETİRME ---
app.get('/api/zones/me', verifyToken, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE google_id = $1', [String(req.user.id)]);
    if (userResult.rows.length === 0) return res.status(404).send("Kullanıcı bulunamadı");
    const dbUserId = userResult.rows[0].id;

    // DÜZELTME: "priorities" sütunu da React'e geri gönderiliyor
    const result = await pool.query(
      'SELECT telegram_chat_id AS "telegramChatId", whatsapp_number AS "whatsappNumber", notification_pref AS "notificationPref", priorities, radar_radius AS "radius" FROM saved_zones WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
      [dbUserId]
    );
    
    if (result.rows.length === 0) return res.json(null);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.use('/api/auth', authRoutes);

app.get('/api/auth/profile', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, full_name, email, phone_number, telegram_chat_id FROM users WHERE google_id = $1', [String(req.user.id)]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Kullanıcı bulunamadı" });

    const user = result.rows[0];
    const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
    user.role = adminEmails.includes(user.email) ? 'admin' : 'user';

    res.json(user);
  } catch (err) {
    res.status(500).send("Profil çekilemedi.");
  }
});

// PROFİL GÜNCELLEME (Kayıt Tamamlama)
app.put('/api/auth/profile', verifyToken, async (req, res) => {
  const { full_name, phone_number, telegram_chat_id } = req.body;
  try {
    const result = await pool.query(
      'UPDATE users SET full_name = $1, phone_number = $2, telegram_chat_id = $3 WHERE google_id = $4 RETURNING id, full_name, email, phone_number, telegram_chat_id',
      [full_name, phone_number, telegram_chat_id, String(req.user.id)]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Kullanıcı bulunamadı" });

    const user = result.rows[0];
    const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
    user.role = adminEmails.includes(user.email) ? 'admin' : 'user';

    res.json(user);
  } catch (err) {
    console.error("Profil güncelleme hatası:", err.message);
    res.status(500).send("Profil güncellenemedi.");
  }
});

// GET ROTASI
app.get('/api/reports', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, user_id, lat, lng, type_label AS "typeLabel", note, image_url AS "imageUrl", up_votes, down_votes, severity, created_at FROM reports ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// --- YENİ BİLDİRİM EKLE VE RADARI ÇALIŞTIR ---
app.post('/api/reports', verifyToken, upload.single('image'), async (req, res) => {
  const { typeLabel, note, severity } = req.body; 
  const imageUrl = req.file ? `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` : null;

  const numLat = parseFloat(req.body.lat);
  const numLng = parseFloat(req.body.lng);

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE google_id = $1', [String(req.user.id)]);
    if (userResult.rows.length === 0) return res.status(404).send("Kullanıcı bulunamadı");
    const dbUserId = userResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO reports (user_id, lat, lng, type_label, note, image_url, severity, geom) 
       VALUES ($1, $2::float, $3::float, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($3::float, $2::float), 4326)::geography) 
       RETURNING id, user_id, lat, lng, type_label AS "typeLabel", note, image_url AS "imageUrl", severity, up_votes, down_votes, created_at`,
      [dbUserId, numLat, numLng, typeLabel, note, imageUrl, severity || 'Orta']
    );
    const newReport = result.rows[0];

    io.emit('new_report', newReport);

    // --- POSTGIS SQL SORGUSU ---
    try {
      const radarQuery = `
        SELECT DISTINCT ON (sz.user_id)
          sz.telegram_chat_id, 
          sz.whatsapp_number,
          sz.notification_pref,
          sz.priorities, -- DÜZELTME: Filtreleme için veritabanından çekildi
          sz.radar_radius, 
          u.email, 
          u.full_name,
          ROUND((ST_Distance(sz.geom, ST_SetSRID(ST_MakePoint($1::float, $2::float), 4326)::geography) / 1000)::numeric, 1) AS distance_km
        FROM saved_zones sz
        JOIN users u ON sz.user_id = u.id
        WHERE ST_DWithin(
          sz.geom,
          ST_SetSRID(ST_MakePoint($1::float, $2::float), 4326)::geography,
          sz.radar_radius * 1000
        )
        ORDER BY sz.user_id, sz.id DESC
      `;
      const zonesResult = await pool.query(radarQuery, [numLng, numLat]);

      if (zonesResult.rows.length > 0) {
        console.log(`🚨 PostGIS: Olay ${zonesResult.rows.length} kişinin radar menziline girdi! Kanallar sırayla tetikleniyor...`);

        // DÜZELTME: forEach yerine for...of kullanıldı (Bekleme yapabilmek için)
        for (const zone of zonesResult.rows) {
          const pref = zone.notification_pref || 'telegram';
          const allowedHazards = zone.priorities; 

          // 🚨 FİLTRE KONTROLÜ: Çoban bu tehlikeyi listesinden çıkardıysa mesaj atma, diğer kişiye geç
          if (allowedHazards && allowedHazards.length > 0 && !allowedHazards.includes(typeLabel)) {
            console.log(`📌 Pas geçildi: ${zone.full_name} (${typeLabel} ayarlarında kapalı)`);
            continue; 
          }

          const messageText = `🚨 *BiUyarı:* Güvenlik çemberinizde bir tehlike (*${typeLabel}*) bildirildi!\n\n🔴 *Önem Derecesi:* ${severity || 'Orta'}\n📍 *Mesafe:* Konumunuza **${zone.distance_km} KM** uzaklıkta!\n⚙️ *Sizin Radar Sınırınız:* ${zone.radar_radius} KM\n\n📝 *Not:* ${note || 'Belirtilmemiş'}\n\nLütfen sürünüzü kontrol edin!`;

          // 1. TELEGRAM GÖNDERİMİ
          if ((pref === 'telegram' || pref === 'both') && zone.telegram_chat_id) {
            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: zone.telegram_chat_id,
                text: messageText,
                parse_mode: 'Markdown'
              })
            }).catch(e => console.error(`❌ Telegram Hatası:`, e.message));
          }

          // 2. WHATSAPP GÖNDERİMİ
          if ((pref === 'whatsapp' || pref === 'both') && zone.whatsapp_number) {
            let formattedNumber = zone.whatsapp_number.startsWith('+') ? zone.whatsapp_number : `+90${zone.whatsapp_number.replace(/^0+/, '')}`;
            
            twilioClient.messages.create({
              body: messageText,
              from: TWILIO_WHATSAPP_NUMBER,
              to: `whatsapp:${formattedNumber}`
            }).then(message => console.log(`🟢 WhatsApp Mesajı Gitti: ${message.sid}`))
              .catch(e => console.error('❌ Twilio WhatsApp Hatası:', e.message));
          }

          // 3. GMAIL GÖNDERİMİ
          if (zone.email) {
            const mailOptions = {
              from: '"BiUyarı Erken Uyarı Sistemi" <sedakaya2504@gmail.com>',
              to: zone.email,
              subject: `⚠️ DİKKAT: ${zone.distance_km} KM Yakınınızda ${typeLabel} İhbarı!`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
                  <div style="background-color: #ef4444; color: white; padding: 20px; text-align: center;">
                    <h2 style="margin: 0;">🚨 Güvenlik Uyarısı</h2>
                  </div>
                  <div style="padding: 20px; background-color: #f9fafb;">
                    <p>Merhaba <strong>${zone.full_name}</strong>,</p>
                    <p>Sisteme kaydettiğiniz ahır/mera konumunuza <strong>${zone.distance_km} KM</strong> mesafede yeni bir tehlike bildirildi.</p>
                    <div style="background-color: white; padding: 15px; border-left: 4px solid #ef4444; margin: 20px 0;">
                      <h3 style="margin-top: 0; color: #b91c1c;">${typeLabel}</h3>
                      <p><strong>Önem Derecesi:</strong> ${severity || 'Orta'}</p>
                      <p><strong>Uzaklık:</strong> ${zone.distance_km} KM</p>
                      <p><strong>Belirlediğiniz Radar Sınırı:</strong> ${zone.radar_radius} KM</p>
                      <p><strong>Çoban Notu:</strong> ${note || 'Belirtilmemiş'}</p>
                    </div>
                    <p style="color: #4b5563; font-size: 14px;">Tehlike sizin belirlediğiniz ${zone.radar_radius} KM'lik güvenli çemberin içinde yer almaktadır. Lütfen en kısa sürede sürünüzü kontrol ediniz.</p>
                  </div>
                </div>
              `
            };

            try {
              await transporter.sendMail(mailOptions);
              console.log(`📧 E-posta Başarıyla Gitti: ${zone.email}`);
            } catch (error) {
              console.error("❌ E-posta Hatası:", error.message);
            }
          }

          // DÜZELTME: Gmail Spam Koruma Beklemesi (Yarım Saniye)
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (radarErr) {
      console.error("PostGIS Radar Hatası:", radarErr.message);
    }

    res.status(201).json(newReport);
  } catch (err) {
    console.error("Giriş Hatası:", err);
    res.status(500).redirect('http://localhost:5173/?error=server_error');
  }
});

// --- YÖNETİCİ: DIŞA AKTAR ---
app.get('/api/admin/reports/export', verifyToken, verifyAdmin, async (req, res) => {
  const { type } = req.query; // 'all', 'reports', 'users', 'zones'
  try {
    const data = {};

    if (type === 'users' || type === 'all') {
      const usersRes = await pool.query('SELECT * FROM users ORDER BY id ASC');
      data.users = usersRes.rows;
    }

    if (type === 'zones' || type === 'all') {
      const zonesRes = await pool.query('SELECT * FROM saved_zones ORDER BY id ASC');
      data.saved_zones = zonesRes.rows;
      
      if (type === 'zones') {
        const userIds = [...new Set(zonesRes.rows.map(z => z.user_id))];
        if (userIds.length > 0) {
          const usersRes = await pool.query('SELECT * FROM users WHERE id = ANY($1::int[])', [userIds]);
          data.users = usersRes.rows;
        }
      }
    }

    if (type === 'reports' || type === 'all') {
      const reportsRes = await pool.query('SELECT * FROM reports ORDER BY id ASC');
      data.reports = reportsRes.rows;
      
      const reportIds = reportsRes.rows.map(r => r.id);
      if (reportIds.length > 0) {
        const votesRes = await pool.query('SELECT * FROM report_votes WHERE report_id = ANY($1::int[])', [reportIds]);
        data.report_votes = votesRes.rows;
      }
      
      if (type === 'reports') {
        const userIds = new Set();
        reportsRes.rows.forEach(r => userIds.add(r.user_id));
        if (data.report_votes) data.report_votes.forEach(v => userIds.add(v.user_id));
        
        if (userIds.size > 0) {
          const usersRes = await pool.query('SELECT * FROM users WHERE id = ANY($1::int[])', [Array.from(userIds)]);
          data.users = usersRes.rows;
        }
      }
    }

    res.json(data);
  } catch (err) {
    console.error("Dışa aktarma hatası:", err);
    res.status(500).send("Dışa aktarma başarısız oldu.");
  }
});

// --- YÖNETİCİ: İÇE AKTAR ---
app.post('/api/admin/reports/import', verifyToken, verifyAdmin, async (req, res) => {
  const { data, importType } = req.body;
  if (!data || typeof data !== 'object') return res.status(400).send("Geçersiz veri formatı.");

  try {
    await pool.query('BEGIN'); 

    if (importType === 'replace') {
      await pool.query('DELETE FROM report_votes'); 
      await pool.query('DELETE FROM reports'); 
      await pool.query('DELETE FROM saved_zones'); 
      await pool.query('DELETE FROM users'); 
    }

    const userMap = {}; 
    const reportMap = {}; 

    if (data.users && Array.isArray(data.users)) {
      for (const u of data.users) {
        if (importType === 'replace') {
           await pool.query(
             `INSERT INTO users (id, google_id, full_name, email, phone_number, telegram_chat_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
             [u.id, u.google_id, u.full_name, u.email, u.phone_number, u.telegram_chat_id, u.created_at || new Date()]
           );
           userMap[u.id] = u.id;
        } else if (importType === 'update') {
           await pool.query(
             `INSERT INTO users (id, google_id, full_name, email, phone_number, telegram_chat_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (id) DO UPDATE SET google_id = EXCLUDED.google_id, full_name = EXCLUDED.full_name, email = EXCLUDED.email, phone_number = EXCLUDED.phone_number, telegram_chat_id = EXCLUDED.telegram_chat_id`,
             [u.id, u.google_id, u.full_name, u.email, u.phone_number, u.telegram_chat_id, u.created_at || new Date()]
           );
           userMap[u.id] = u.id;
        } else {
           const existing = await pool.query('SELECT id FROM users WHERE google_id = $1', [u.google_id]);
           if (existing.rows.length > 0) {
             userMap[u.id] = existing.rows[0].id;
           } else {
             const result = await pool.query(
               `INSERT INTO users (google_id, full_name, email, phone_number, telegram_chat_id, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
               [u.google_id, u.full_name, u.email, u.phone_number, u.telegram_chat_id, u.created_at || new Date()]
             );
             userMap[u.id] = result.rows[0].id;
           }
        }
      }
      if (importType === 'replace' || importType === 'update') await pool.query("SELECT setval('users_id_seq', COALESCE((SELECT MAX(id)+1 FROM users), 1), false)");
    }

    if (data.saved_zones && Array.isArray(data.saved_zones)) {
      for (const z of data.saved_zones) {
        const uId = userMap[z.user_id] || z.user_id; 
        if (importType === 'replace') {
          await pool.query(
            `INSERT INTO saved_zones (id, user_id, telegram_chat_id, whatsapp_number, notification_pref, priorities, lat, lng, radar_radius, geom, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7::float, $8::float, $9, ST_SetSRID(ST_MakePoint($8::float, $7::float), 4326)::geography, $10)`,
            [z.id, uId, z.telegram_chat_id, z.whatsapp_number, z.notification_pref, z.priorities ? JSON.stringify(z.priorities) : null, z.lat, z.lng, z.radar_radius, z.created_at || new Date()]
          );
        } else if (importType === 'update') {
          await pool.query(
            `INSERT INTO saved_zones (id, user_id, telegram_chat_id, whatsapp_number, notification_pref, priorities, lat, lng, radar_radius, geom, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7::float, $8::float, $9, ST_SetSRID(ST_MakePoint($8::float, $7::float), 4326)::geography, $10)
             ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, telegram_chat_id = EXCLUDED.telegram_chat_id, whatsapp_number = EXCLUDED.whatsapp_number, notification_pref = EXCLUDED.notification_pref, priorities = EXCLUDED.priorities, lat = EXCLUDED.lat, lng = EXCLUDED.lng, radar_radius = EXCLUDED.radar_radius, geom = EXCLUDED.geom`,
            [z.id, uId, z.telegram_chat_id, z.whatsapp_number, z.notification_pref, z.priorities ? JSON.stringify(z.priorities) : null, z.lat, z.lng, z.radar_radius, z.created_at || new Date()]
          );
        } else {
          await pool.query(
            `INSERT INTO saved_zones (user_id, telegram_chat_id, whatsapp_number, notification_pref, priorities, lat, lng, radar_radius, geom, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7::float, $8::float, $9, ST_SetSRID(ST_MakePoint($8::float, $7::float), 4326)::geography, $10)`,
            [uId, z.telegram_chat_id, z.whatsapp_number, z.notification_pref, z.priorities ? JSON.stringify(z.priorities) : null, z.lat, z.lng, z.radar_radius, z.created_at || new Date()]
          );
        }
      }
      if (importType === 'replace' || importType === 'update') await pool.query("SELECT setval('saved_zones_id_seq', COALESCE((SELECT MAX(id)+1 FROM saved_zones), 1), false)");
    }

    if (data.reports && Array.isArray(data.reports)) {
      for (const r of data.reports) {
        const uId = userMap[r.user_id] || r.user_id;
        if (importType === 'replace') {
           await pool.query(
             `INSERT INTO reports (id, user_id, lat, lng, type_label, note, image_url, severity, up_votes, down_votes, created_at, geom) 
              VALUES ($1, $2, $3::float, $4::float, $5, $6, $7, $8, $9, $10, $11, ST_SetSRID(ST_MakePoint($4::float, $3::float), 4326)::geography)`,
             [r.id, uId, r.lat, r.lng, r.type_label, r.note, r.image_url, r.severity || 'Orta', r.up_votes || 0, r.down_votes || 0, r.created_at || new Date()]
           );
           reportMap[r.id] = r.id;
        } else if (importType === 'update') {
           await pool.query(
             `INSERT INTO reports (id, user_id, lat, lng, type_label, note, image_url, severity, up_votes, down_votes, created_at, geom) 
              VALUES ($1, $2, $3::float, $4::float, $5, $6, $7, $8, $9, $10, $11, ST_SetSRID(ST_MakePoint($4::float, $3::float), 4326)::geography)
              ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, lat = EXCLUDED.lat, lng = EXCLUDED.lng, type_label = EXCLUDED.type_label, note = EXCLUDED.note, image_url = EXCLUDED.image_url, severity = EXCLUDED.severity, up_votes = EXCLUDED.up_votes, down_votes = EXCLUDED.down_votes, geom = EXCLUDED.geom`,
             [r.id, uId, r.lat, r.lng, r.type_label, r.note, r.image_url, r.severity || 'Orta', r.up_votes || 0, r.down_votes || 0, r.created_at || new Date()]
           );
           reportMap[r.id] = r.id;
        } else {
           const result = await pool.query(
             `INSERT INTO reports (user_id, lat, lng, type_label, note, image_url, severity, up_votes, down_votes, created_at, geom) 
              VALUES ($1, $2::float, $3::float, $4, $5, $6, $7, $8, $9, $10, ST_SetSRID(ST_MakePoint($3::float, $2::float), 4326)::geography) RETURNING id`,
             [uId, r.lat, r.lng, r.type_label, r.note, r.image_url, r.severity || 'Orta', r.up_votes || 0, r.down_votes || 0, r.created_at || new Date()]
           );
           reportMap[r.id] = result.rows[0].id;
        }
      }
      if (importType === 'replace' || importType === 'update') await pool.query("SELECT setval('reports_id_seq', COALESCE((SELECT MAX(id)+1 FROM reports), 1), false)");
    }

    if (data.report_votes && Array.isArray(data.report_votes)) {
      for (const v of data.report_votes) {
        const uId = userMap[v.user_id] || v.user_id;
        const rId = reportMap[v.report_id] || v.report_id;
        if (importType === 'replace') {
          await pool.query(
            `INSERT INTO report_votes (id, report_id, user_id, vote_type, created_at) VALUES ($1, $2, $3, $4, $5)`,
            [v.id, rId, uId, v.vote_type, v.created_at || new Date()]
          );
        } else if (importType === 'update') {
          await pool.query(
            `INSERT INTO report_votes (id, report_id, user_id, vote_type, created_at) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET report_id = EXCLUDED.report_id, user_id = EXCLUDED.user_id, vote_type = EXCLUDED.vote_type`,
            [v.id, rId, uId, v.vote_type, v.created_at || new Date()]
          );
        } else {
          await pool.query(
            `INSERT INTO report_votes (report_id, user_id, vote_type, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [rId, uId, v.vote_type, v.created_at || new Date()]
          );
        }
      }
      if (importType === 'replace' || importType === 'update') await pool.query("SELECT setval('report_votes_id_seq', COALESCE((SELECT MAX(id)+1 FROM report_votes), 1), false)");
    }

    await pool.query('COMMIT');
    io.emit('reports_imported');
    
    res.json({ message: "İçe aktarma başarıyla tamamlandı." });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error("İçe aktarma hatası:", err);
    res.status(500).send("İçe aktarma sırasında bir hata oluştu.");
  }
});

app.delete('/api/reports/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM report_votes WHERE report_id = $1', [req.params.id]);
    await pool.query('DELETE FROM reports WHERE id = $1', [req.params.id]);
    res.json({ message: "Asılsız ihbar başarıyla temizlendi." });
  } catch (err) {
    res.status(500).json({ message: "İhbar silinirken hata oluştu." });
  }
});

app.post('/api/reports/:id/vote', verifyToken, async (req, res) => {
  const reportId = req.params.id;
  const { voteType } = req.body;

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE google_id = $1', [String(req.user.id)]);
    if (userResult.rows.length === 0) return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    const dbUserId = userResult.rows[0].id;

    const reportResult = await pool.query('SELECT user_id FROM reports WHERE id = $1', [reportId]);
    if (reportResult.rows.length === 0) return res.status(404).json({ message: "İhbar bulunamadı." });
    if (reportResult.rows[0].user_id === dbUserId) {
      return res.status(403).json({ message: "Kendi ihbarınıza oy veremezsiniz!" });
    }

    const existingVote = await pool.query('SELECT id FROM report_votes WHERE report_id = $1 AND user_id = $2', [reportId, dbUserId]);
    if (existingVote.rows.length > 0) {
      return res.status(400).json({ message: "Bu ihbara zaten oy verdiniz." });
    }

    await pool.query(
      'INSERT INTO report_votes (report_id, user_id, vote_type) VALUES ($1, $2, $3)',
      [reportId, dbUserId, voteType]
    );

    let updateQuery = '';
    if (voteType === 'up') {
      updateQuery = 'UPDATE reports SET up_votes = up_votes + 1 WHERE id = $1 RETURNING id, up_votes, down_votes';
    } else if (voteType === 'down') {
      updateQuery = 'UPDATE reports SET down_votes = down_votes + 1 WHERE id = $1 RETURNING id, up_votes, down_votes';
    }

    const updatedReportRes = await pool.query(updateQuery, [reportId]);
    const updatedReport = updatedReportRes.rows[0];

    io.emit('vote_updated', updatedReport);
    res.json({ message: "Oyunuz sisteme kaydedildi, teşekkürler!" });

  } catch (err) {
    console.error("Oylama Sistemi Hatası:", err.message);
    res.status(500).json({ message: "Oylama işlemi sırasında sunucu hatası oluştu." });
  }
});

server.listen(3000, () => {
  console.log('🚀 PostGIS + Çok Kanallı (WhatsApp/Telegram/Gmail) + Admin destekli sunucu hatasız çalışıyor!');
});