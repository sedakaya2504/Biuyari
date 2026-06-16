# Bi-Uyarı: Hayvanlar İçin Erken Uyarı Sistemi 🐺🐑

Bi-Uyarı, çobanlar ve sürü sahipleri için geliştirilmiş tam kapsamlı bir erken uyarı ve radar sistemidir. Yırtıcı hayvan saldırıları, başıboş sürüler, enfekte hayvanlar ve şüpheli şahıslar gibi tehlikeleri anında bildirerek önlem alınmasını sağlar.

## 🚀 Özellikler

- **Canlı Harita (PostGIS):** Çevrenizdeki tehlikeleri harita üzerinde ısı haritası ve nokta atışı olarak görebilirsiniz.
- **Akıllı Radar Sistemi:** Kendi ahır konumunuzu ve radar menzilinizi (Örn: 5 KM) belirleyebilirsiniz. Bu menzile bir tehlike girdiğinde anında bildirim alırsınız.
- **Çok Kanallı Bildirim:** Tehlike anında Telegram, WhatsApp ve E-posta (Gmail) üzerinden eşzamanlı uyarılar alırsınız.
- **Kullanıcı Doğrulama:** Google OAuth entegrasyonu ile güvenli giriş. Asılsız ihbarları engellemek için güven skoru ve ihbar oylama sistemi.

## 🛠️ Kurulum

Projeyi kendi bilgisayarınızda çalıştırmak için aşağıdaki adımları takip edin:

### 1. Veritabanı Kurulumu (PostgreSQL)

Bu proje veritabanı olarak PostgreSQL ve harita/mesafe hesaplamaları için PostGIS eklentisi kullanmaktadır.

1. PostgreSQL'de `coban_db` adında yeni bir veritabanı oluşturun.
2. Projenin `backend` klasöründe bulunan `database_schema.sql` dosyasındaki SQL komutlarını kopyalayarak veritabanınızda çalıştırın. Bu işlem tüm tabloları, ilişkileri ve PostGIS eklentisini otomatik kuracaktır.

### 2. Çevre Değişkenleri (.env)

Projenin çalışması için API anahtarlarına ve şifrelere ihtiyacı vardır. Kodların güvenliği için bu şifreleri GitHub'a yüklemedik. Projeyi indirdikten sonra `backend` ve `frontend` klasörlerine `.env` dosyaları oluşturup aşağıdaki yapıları kullanmalısınız:

**`backend/.env` dosyası:**
```env
DB_USER=postgres
DB_HOST=localhost
DB_NAME=coban_db
DB_PASSWORD=veritabani_sifreniz
DB_PORT=5432

GMAIL_USER=kendi_gmail_adresiniz
GMAIL_PASS=google_uygulama_sifreniz

TELEGRAM_BOT_TOKEN=telegram_bot_tokeniniz
JWT_SECRET=kendi_gizli_anahtariniz

TWILIO_ACCOUNT_SID=twilio_sid
TWILIO_AUTH_TOKEN=twilio_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+...

GOOGLE_CLIENT_ID=google_client_id
GOOGLE_CLIENT_SECRET=google_client_secret
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
ADMIN_EMAILS=sizin_email_adresiniz
```

**`frontend/.env` dosyası:**
```env
VITE_BACKEND_URL=http://localhost:3000
```

### 3. Uygulamayı Başlatma

Önce Backend'i (Sunucuyu) çalıştırın:
```bash
cd backend
npm install
node server.js
```

Sonra Frontend'i (Arayüzü) çalıştırın:
```bash
cd frontend
npm install
npm run dev
```

Uygulama `http://localhost:5173` adresinde çalışmaya başlayacaktır. Meralarınız güvende kalsın!
