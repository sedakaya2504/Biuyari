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

### 🔑 Çevre Değişkenleri (.env) Nasıl Alınır?

Bu projeyi tam özellikli çalıştırabilmek için aşağıdaki servislerden API anahtarları almanız gerekmektedir:

**1. Veritabanı (PostgreSQL):**
- **DB_USER, DB_PASSWORD vb.:** Kendi bilgisayarınızda kurduğunuz PostgreSQL'in kullanıcı adı (genelde `postgres`) ve kurulum sırasında belirlediğiniz şifredir.

**2. Gmail E-posta Gönderimi (GMAIL_USER & GMAIL_PASS):**
- Google Hesabınıza giriş yapın.
- "Güvenlik" sekmesine gidin ve "İki Adımlı Doğrulama"yı açın.
- Arama çubuğuna "Uygulama Şifreleri" (App Passwords) yazın.
- Yeni bir şifre oluşturun (Örn: "BiUyari App") ve verilen 16 haneli kodu `GMAIL_PASS` kısmına yapıştırın. (Normal Gmail şifreniz çalışmaz, uygulama şifresi şarttır).

**3. Telegram Botu (TELEGRAM_BOT_TOKEN):**
- Telegram'da **@BotFather** adlı botu bulun ve `/start` yazın.
- Yeni bir bot oluşturmak için `/newbot` komutunu gönderin ve botunuza bir isim ve kullanıcı adı (sonu _bot ile biten) verin.
- İşlem tamamlandığında BotFather size bir **HTTP API Token** verecektir. Bu token'ı `TELEGRAM_BOT_TOKEN` kısmına yapıştırın.

**4. WhatsApp Mesajları (TWILIO):**
- [Twilio.com](https://www.twilio.com/) adresinden ücretsiz bir hesap oluşturun.
- Console anasayfasından **Account SID** ve **Auth Token** bilgilerinizi kopyalayıp `.env` dosyasına yapıştırın.
- Sol menüden **Messaging > Try it out > Send a WhatsApp message** bölümüne giderek Twilio'nun size atadığı Sandbox numarasını (Örn: `whatsapp:+14155238886`) `TWILIO_WHATSAPP_NUMBER` kısmına ekleyin. (Test için telefonunuzdan bu numaraya kod göndermeniz gerekecektir).

**5. Google ile Giriş (GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET):**
- [Google Cloud Console](https://console.cloud.google.com/) adresine gidin ve yeni bir proje oluşturun.
- **APIs & Services > Credentials** sekmesine geçin.
- **Create Credentials > OAuth client ID** seçeneğine tıklayın (Uygulama tipi: Web application).
- **Authorized redirect URIs** kısmına `http://localhost:3000/api/auth/google/callback` ekleyin.
- Size verilen Client ID ve Client Secret bilgilerini `.env` dosyanıza kopyalayın.

**6. JWT Secret ve Admin:**
- **JWT_SECRET:** Güvenlik için karmaşık bir şifreleme anahtarı gereklidir. Terminal veya komut isteminde şu komutu çalıştırarak rastgele ve çok güvenli bir kod oluşturup `.env` dosyanıza yapıştırabilirsiniz:
  `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- **ADMIN_EMAILS:** Yönetici paneline (verileri dışa/içe aktarma vs.) erişecek olan kendi e-posta adresinizi yazın.

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
