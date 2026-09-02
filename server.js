// server.js - الخادم الرئيسي للموقع
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  done(null, user);
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/api/auth/owner-login', (req, res) => {
  const { email, password } = req.body;
  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPasswordHash = process.env.OWNER_PASSWORD_HASH;

  if (!ownerEmail || !ownerPasswordHash) {
    return res.status(500).json({ error: 'لم يتم إعداد بيانات المالك على الخادم بعد.' });
  }

  if (email !== ownerEmail || !bcrypt.compareSync(password, ownerPasswordHash)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  let owner = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!owner) {
    const info = db.prepare(
      'INSERT INTO users (provider, name, email, is_owner) VALUES (?, ?, ?, 1)'
      
    ).run('owner', 'Owner', email);
    owner = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }

  req.login(owner, (err) => {
    if (err) return res.status(500).json({ error: 'خطأ في تسجيل الدخول' });
    res.json({ success: true, user: owner });
  });
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback'
  }, (accessToken, refreshToken, profile, done) => {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    let user = db.prepare('SELECT * FROM users WHERE provider_id = ? AND provider = ?').get(profile.id, 'google');
    if (!user) {
      const info = db.prepare(
        'INSERT INTO users (provider, provider_id, name, email) VALUES (?, ?, ?, ?)'
      ).run('google', profile.id, profile.displayName, email);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }
    done(null, user);
  }));

  app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  app.get('/api/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => res.redirect('/')
  );
}

if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: '/api/auth/facebook/callback',
    profileFields: ['id', 'displayName', 'emails']
  }, (accessToken, refreshToken, profile, done) => {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    let user = db.prepare('SELECT * FROM users WHERE provider_id = ? AND provider = ?').get(profile.id, 'facebook');
    if (!user) {
      const info = db.prepare(
        'INSERT INTO us
