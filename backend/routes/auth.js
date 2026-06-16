require('dotenv').config(); // .env dosyasını okuması için eklendi
const express = require('express');
const passport = require('../passport');
const jwt = require('jsonwebtoken');

const router = express.Router();

router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get('/google/callback', 
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login` }),
  (req, res) => {
    const user = req.user; // Artık bu 'user' veritabanından gelen satırdır!

    const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
    const role = adminEmails.includes(user.email) ? 'admin' : 'user';

    const token = jwt.sign(
      { 
        id: user.google_id, // KRİTİK: server.js'deki profil sorgusu için google_id gönderiyoruz
        email: user.email, 
        name: user.full_name,
        role: role
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' } 
    );

    res.redirect(`${process.env.FRONTEND_URL}/?token=${token}`);
  }
);

module.exports = router;