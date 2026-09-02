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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  done(null, user);
});

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ===== OWNER LOGIN =====
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

// ===== GET CURRENT USER =====
app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user });
});

// ===== LOGOUT =====
app.get('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'خطأ في تسجيل الخروج' });
    res.redirect('/');
  });
});

// ===== GOOGLE OAUTH =====
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
} else {
  app.get('/api/auth/google', (req, res) => {
    res.status(501).json({ error: 'Google OAuth غير مفعل - أضف GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET' });
  });
}

// ===== FACEBOOK OAUTH =====
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
        'INSERT INTO users (provider, provider_id, name, email) VALUES (?, ?, ?, ?)'
      ).run('facebook', profile.id, profile.displayName, email);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }
    done(null, user);
  }));

  app.get('/api/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));
  app.get('/api/auth/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/' }),
    (req, res) => res.redirect('/')
  );
} else {
  app.get('/api/auth/facebook', (req, res) => {
    res.status(501).json({ error: 'Facebook OAuth غير مفعل - أضف FACEBOOK_APP_ID و FACEBOOK_APP_SECRET' });
  });
}

// ===== USER APIs =====
app.get('/api/profile', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'غير مسجل الدخول' });
  const user = db.prepare('SELECT id, name, email, balance, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

app.get('/api/sections', (req, res) => {
  const sections = db.prepare('SELECT * FROM sections ORDER BY id DESC').all();
  res.json(sections);
});

app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
  res.json(products);
});

app.get('/api/custom-buttons', (req, res) => {
  const buttons = db.prepare('SELECT * FROM custom_buttons ORDER BY id DESC').all();
  res.json(buttons);
});

app.get('/api/notifications', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'غير مسجل الدخول' });
  const notifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
  res.json(notifs);
});

// ===== ORDERS =====
app.post('/api/orders', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'غير مسجل الدخول' });
  const { product_id, quantity } = req.body;
  const stmt = db.prepare('INSERT INTO orders (user_id, product_id, quantity) VALUES (?, ?, ?)');
  stmt.run(req.user.id, product_id, quantity || 1);
  res.json({ success: true });
});

// ===== WALLET REQUEST =====
app.post('/api/wallet/request', upload.single('receipt'), (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'غير مسجل الدخول' });
  const { method, amount } = req.body;
  const receipt_image = req.file ? '/uploads/' + req.file.filename : null;
  const stmt = db.prepare('INSERT INTO wallet_requests (user_id, method, amount, receipt_image) VALUES (?, ?, ?, ?)');
  stmt.run(req.user.id, method, amount, receipt_image);
  res.json({ success: true });
});

// ===== ADMIN MIDDLEWARE =====
const isOwner = (req, res, next) => {
  if (!req.user || !req.user.is_owner) return res.status(403).json({ error: 'غير مصرح - هذه الصفحة خاصة بالمالك' });
  next();
};

// ===== ADMIN APIs =====
app.post('/api/admin/wallet/charge', isOwner, (req, res) => {
  const { user_id, amount } = req.body;
  const stmt = db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?');
  stmt.run(amount, user_id);
  res.json({ success: true });
});

app.get('/api/admin/wallet-requests', isOwner, (req, res) => {
  const requests = db.prepare(`
    SELECT wr.*, u.name as user_name, u.email as user_email 
    FROM wallet_requests wr 
    JOIN users u ON wr.user_id = u.id 
    WHERE wr.status = 'pending'
    ORDER BY wr.id DESC
  `).all();
  res.json(requests);
});

app.post('/api/admin/wallet-requests/:id/approve', isOwner, (req, res) => {
  const id = req.params.id;
  const reqData = db.prepare('SELECT * FROM wallet_requests WHERE id = ?').get(id);
  if (!reqData) return res.status(404).json({ error: 'غير موجود' });
  
  db.prepare('UPDATE wallet_requests SET status = "approved" WHERE id = ?').run(id);
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(reqData.amount, reqData.user_id);
  
  // إضافة إشعار للمستخدم
  db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
    reqData.user_id,
    `تم تنفيذ طلب شحن الرصيد بمبلغ ${reqData.amount}$ عبر ${reqData.method}`
  );
  res.json({ success: true });
});

app.post('/api/admin/wallet-requests/:id/cancel', isOwner, (req, res) => {
  const id = req.params.id;
  const { reason } = req.body;
  const reqData = db.prepare('SELECT * FROM wallet_requests WHERE id = ?').get(id);
  db.prepare('UPDATE wallet_requests SET status = "cancelled", cancel_reason = ? WHERE id = ?').run(reason, id);
  
  if (reqData) {
    db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
      reqData.user_id,
      `تم إلغاء طلب شحن الرصيد: ${reason || 'بدون سبب'}`
    );
  }
  res.json({ success: true });
});

app.post('/api/admin/wallet/reset-all', isOwner, (req, res) => {
  db.prepare('UPDATE users SET balance = 0 WHERE is_owner = 0').run();
  res.json({ success: true });
});

app.post('/api/admin/custom-buttons', isOwner, upload.single('image'), (req, res) => {
  const { name, description } = req.body;
  const image = req.file ? '/uploads/' + req.file.filename : null;
  const stmt = db.prepare('INSERT INTO custom_buttons (name, description, image) VALUES (?, ?, ?)');
  stmt.run(name, description, image);
  res.json({ success: true });
});

app.post('/api/admin/sections', isOwner, upload.single('image'), (req, res) => {
  const { name, description } = req.body;
  const image = req.file ? '/uploads/' + req.file.filename : null;
  const stmt = db.prepare('INSERT INTO sections (name, description, image) VALUES (?, ?, ?)');
  stmt.run(name, description, image);
  res.json({ success: true });
});

app.post('/api/admin/products', isOwner, (req, res) => {
  const { section_id, name, description, cost_price, price, quantity } = req.body;
  const stmt = db.prepare('INSERT INTO products (section_id, name, description, cost_price, price, quantity) VALUES (?, ?, ?, ?, ?, ?)');
  stmt.run(section_id, name, description, cost_price, price, quantity);
  res.json({ success: true });
});

app.get('/api/admin/orders', isOwner, (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, u.name as user_name, u.email as user_email, 
           p.name as product_name, p.description as product_description, p.price
    FROM orders o 
    JOIN users u ON o.user_id = u.id 
    JOIN products p ON o.product_id = p.id 
    WHERE o.status = 'pending'
    ORDER BY o.id DESC
  `).all();
  res.json(orders);
});

app.post('/api/admin/orders/:id/approve', isOwner, (req, res) => {
  const id = req.params.id;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
  
  db.prepare('UPDATE orders SET status = "approved" WHERE id = ?').run(id);
  db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(order.price * order.quantity, order.user_id);
  
  db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
    order.user_id,
    `تم تنفيذ طلب شراء ${order.quantity}x ${order.product_name}`
  );
  res.json({ success: true });
});

app.post('/api/admin/orders/:id/cancel', isOwner, (req, res) => {
  const id = req.params.id;
  const { reason } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  db.prepare('UPDATE orders SET status = "cancelled", cancel_reason = ? WHERE id = ?').run(reason, id);
  
  if (order) {
    db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
      order.user_id,
      `تم إلغاء طلب الشراء: ${reason || 'بدون سبب'}`
    );
  }
  res.json({ success: true });
});

// ===== DELETE APIs =====
app.delete('/api/admin/custom-buttons/:id', isOwner, (req, res) => {
  db.prepare('DELETE FROM custom_buttons WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/sections/:id', isOwner, (req, res) => {
  db.prepare('DELETE FROM sections WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/products/:id', isOwner, (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ===== SERVE HTML =====
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
