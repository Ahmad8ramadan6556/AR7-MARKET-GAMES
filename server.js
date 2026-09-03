// server.js - الخادم الرئيسي للموقع
require(`dotenv`).config();
const express = require(`express`);
const session = require(`express-session`);
const passport = require(`passport`);
const GoogleStrategy = require(`passport-google-oauth20`).Strategy;
const FacebookStrategy = require(`passport-facebook`).Strategy;
const multer = require(`multer`);
const path = require(`path`);
const bcrypt = require(`bcryptjs`);
const dbFile = require(`./db`);

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- إعدادات عامة ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(`/uploads`, express.static(path.join(__dirname, `uploads`)));
app.use(express.static(path.join(__dirname, `public`)));

app.use(session({
  secret: process.env.SESSION_SECRET || `change-this-secret`,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const data = dbFile.load();
  const user = data.users.find(u => u.id === id);
  done(null, user);
});

// ---------- رفع الصور (إيصالات الدفع، صور المنتجات...) ----------
const uploadsDir = path.join(__dirname, `uploads`);
if (!require(`fs`).existsSync(uploadsDir)) {
  require(`fs`).mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + `-` + file.originalname)
});
const upload = multer({ storage });

// ================== المصادقة (تسجيل الدخول) ==================

app.post(`/api/auth/owner-login`, (req, res) => {
  const { email, password } = req.body;
  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPasswordHash = process.env.OWNER_PASSWORD_HASH;

  if (!ownerEmail || !ownerPasswordHash) {
    return res.status(500).json({ error: `لم يتم إعداد بيانات المالك على الخادم بعد.` });
  }
  if (email !== ownerEmail || !bcrypt.compareSync(password, ownerPasswordHash)) {
    return res.status(401).json({ error: `بيانات الدخول غير صحيحة` });
  }

  const data = dbFile.load();
  let owner = data.users.find(u => u.email === email);
  if (!owner) {
    owner = {
      id: dbFile.nextId(data, `users`),
      provider: `owner`,
      provider_id: null,
      name: `Owner`,
      email,
      balance: 0,
      is_owner: 1,
      created_at: dbFile.nowStr()
    };
    data.users.push(owner);
    dbFile.save(data);
  }

  req.login(owner, (err) => {
    if (err) return res.status(500).json({ error: `خطأ في تسجيل الدخول` });
    res.json({ success: true, user: owner });
  });
});

// -- Google OAuth --
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `/api/auth/google/callback`
  }, (accessToken, refreshToken, profile, done) => {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    const data = dbFile.load();
    let user = data.users.find(u => u.provider === `google` && u.provider_id === profile.id);
    if (!user) {
      user = {
        id: dbFile.nextId(data, `users`),
        provider: `google`,
        provider_id: profile.id,
        name: profile.displayName,
        email,
        balance: 0,
        is_owner: 0,
        created_at: dbFile.nowStr()
      };
      data.users.push(user);
      dbFile.save(data);
    }
    done(null, user);
  }));

  app.get(`/api/auth/google`, passport.authenticate(`google`, { scope: [`profile`, `email`] }));
  app.get(`/api/auth/google/callback`,
    passport.authenticate(`google`, { failureRedirect: `/` }),
    (req, res) => res.redirect(`/`)
  );
}

// -- Facebook OAuth --
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: `/api/auth/facebook/callback`,
    profileFields: [`id`, `displayName`, `emails`]
  }, (accessToken, refreshToken, profile, done) => {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    const data = dbFile.load();
    let user = data.users.find(u => u.provider === `facebook` && u.provider_id === profile.id);
    if (!user) {
      user = {
        id: dbFile.nextId(data, `users`),
        provider: `facebook`,
        provider_id: profile.id,
        name: profile.displayName,
        email,
        balance: 0,
        is_owner: 0,
        created_at: dbFile.nowStr()
      };
      data.users.push(user);
      dbFile.save(data);
    }
    done(null, user);
  }));

  app.get(`/api/auth/facebook`, passport.authenticate(`facebook`));
  app.get(`/api/auth/facebook/callback`,
    passport.authenticate(`facebook`, { failureRedirect: `/` }),
    (req, res) => res.redirect(`/`)
  );
}

app.get(`/api/auth/me`, (req, res) => {
  res.json({ user: req.user || null });
});
app.post(`/api/auth/logout`, (req, res) => {
  req.logout(() => res.json({ success: true }));
});

// ---------- أدوات مساعدة ----------
function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: `يجب تسجيل الدخول` });
  next();
}
function requireOwner(req, res, next) {
  if (!req.user || !req.user.is_owner) return res.status(403).json({ error: `صلاحية المالك مطلوبة` });
  next();
}
function notify(data, userId, message) {
  data.notifications.push({
    id: dbFile.nextId(data, `notifications`),
    user_id: userId,
    message,
    is_read: 0,
    created_at: dbFile.nowStr()
  });
}

// ================== الأقسام والمنتجات (عرض عام) ==================
app.get(`/api/sections`, (req, res) => {
  const data = dbFile.load();
  res.json(data.sections.slice().reverse());
});
app.get(`/api/products`, (req, res) => {
  const data = dbFile.load();
  const { section_id } = req.query;
  let products = data.products;
  if (section_id) products = products.filter(p => String(p.section_id) === String(section_id));
  res.json(products.slice().reverse());
});
app.get(`/api/custom-buttons`, (req, res) => {
  const data = dbFile.load();
  res.json(data.custom_buttons.slice().reverse());
});

// ================== الملف الشخصي والإشعارات ==================
app.get(`/api/profile`, requireLogin, (req, res) => {
  res.json(req.user);
});
app.get(`/api/notifications`, requireLogin, (req, res) => {
  const data = dbFile.load();
  res.json(data.notifications.filter(n => n.user_id === req.user.id).slice().reverse());
});

// ================== السلة والشراء ==================
app.post(`/api/orders`, requireLogin, (req, res) => {
  const { product_id, quantity } = req.body;
  const data = dbFile.load();
  const product = data.products.find(p => p.id === Number(product_id));
  if (!product) return res.status(404).json({ error: `السلعة غير موجودة` });

  const order = {
    id: dbFile.nextId(data, `orders`),
    user_id: req.user.id,
    product_id: product.id,
    quantity: quantity || 1,
    status: `pending`,
    cancel_reason: null,
    created_at: dbFile.nowStr()
  };
  data.orders.push(order);
  dbFile.save(data);
  res.json({ success: true, order_id: order.id });
});
app.get(`/api/orders/mine`, requireLogin, (req, res) => {
  const data = dbFile.load();
  res.json(data.orders.filter(o => o.user_id === req.user.id).slice().reverse());
});

// ================== شحن الرصيد (شام كاش / سيرياتيل كاش) ==================
app.post(`/api/wallet/request`, requireLogin, upload.single(`receipt`), (req, res) => {
  const { method, amount } = req.body;
  const receiptPath = req.file ? `/uploads/` + req.file.filename : null;
  const data = dbFile.load();

  const wr = {
    id: dbFile.nextId(data, `wallet_requests`),
    user_id: req.user.id,
    method,
    amount: Number(amount),
    receipt_image: receiptPath,
    status: `pending`,
    cancel_reason: null,
    created_at: dbFile.nowStr()
  };
  data.wallet_requests.push(wr);
  dbFile.save(data);
  res.json({ success: true, request_id: wr.id });
});
app.get(`/api/wallet/mine`, requireLogin, (req, res) => {
  const data = dbFile.load();
  res.json(data.wallet_requests.filter(w => w.user_id === req.user.id).slice().reverse());
});

// ================== لوحة تحكم المالك ==================

app.post(`/api/admin/wallet/charge`, requireOwner, (req, res) => {
  const { user_id, amount } = req.body;
  const data = dbFile.load();
  const user = data.users.find(u => u.id === Number(user_id));
  if (!user) return res.status(404).json({ error: `المستخدم غير موجود` });
  user.balance += Number(amount);
  notify(data, user.id, `تم شحن رصيدك بمبلغ ${amount}$ من قبل الإدارة.`);
  dbFile.save(data);
  res.json({ success: true });
});

app.get(`/api/admin/wallet-requests`, requireOwner, (req, res) => {
  const data = dbFile.load();
  const rows = data.wallet_requests
    .filter(w => w.status === `pending`)
    .slice().reverse()
    .map(w => {
      const user = data.users.find(u => u.id === w.user_id) || {};
      return { ...w, user_name: user.name, user_email: user.email };
    });
  res.json(rows);
});
app.post(`/api/admin/wallet-requests/:id/approve`, requireOwner, (req, res) => {
  const data = dbFile.load();
  const wr = data.wallet_requests.find(w => w.id === Number(req.params.id));
  if (!wr) return res.status(404).json({ error: `الطلب غير موجود` });
  const user = data.users.find(u => u.id === wr.user_id);
  if (user) user.balance += wr.amount;
  wr.status = `done`;
  notify(data, wr.user_id, `تم تنفيذ طلب شحن الرصيد. أصبح رصيدك الآن محدثاً بمبلغ ${wr.amount}$.`);
  dbFile.save(data);
  res.json({ success: true });
});
app.post(`/api/admin/wallet-requests/:id/cancel`, requireOwner, (req, res) => {
  const { reason } = req.body;
  const data = dbFile.load();
  const wr = data.wallet_requests.find(w => w.id === Number(req.params.id));
  if (!wr) return res.status(404).json({ error: `الطلب غير موجود` });
  wr.status = `cancelled`;
  wr.cancel_reason = reason || null;
  notify(data, wr.user_id, `تم إلغاء طلب شحن الرصيد. السبب: ${reason || `غير محدد`}`);
  dbFile.save(data);
  res.json({ success: true });
});

app.get(`/api/admin/orders`, requireOwner, (req, res) => {
  const data = dbFile.load();
  const rows = data.orders
    .filter(o => o.status === `pending`)
    .slice().reverse()
    .map(o => {
      const user = data.users.find(u => u.id === o.user_id) || {};
      const product = data.products.find(p => p.id === o.product_id) || {};
      return {
        ...o,
        user_name: user.name,
        user_email: user.email,
        product_name: product.name,
        product_description: product.description,
        price: product.price
      };
    });
  res.json(rows);
});
app.post(`/api/admin/orders/:id/approve`, requireOwner, (req, res) => {
  const data = dbFile.load();
  const order = data.orders.find(o => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: `الطلب غير موجود` });
  const product = data.products.find(p => p.id === order.product_id);
  const user = data.users.find(u => u.id === order.user_id);
  const total = product.price * order.quantity;
  if (user.balance < total) {
    return res.status(400).json({ error: `رصيد المستخدم غير كافٍ` });
  }
  user.balance -= total;
  order.status = `done`;
  notify(data, order.user_id, `تم تنفيذ طلب شراء "${product.name}" وخصم ${total}$ من رصيدك.`);
  dbFile.save(data);
  res.json({ success: true });
});
app.post(`/api/admin/orders/:id/cancel`, requireOwner, (req, res) => {
  const { reason } = req.body;
  const data = dbFile.load();
  const order = data.orders.find(o => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: `الطلب غير موجود` });
  order.status = `cancelled`;
  order.cancel_reason = reason || null;
  notify(data, order.user_id, `تم إلغاء طلب الشراء. السبب: ${reason || `غير محدد`}`);
  dbFile.save(data);
  res.json({ success: true });
});

app.post(`/api/admin/wallet/reset-all`, requireOwner, (req, res) => {
  const data = dbFile.load();
  data.users.forEach(u => { if (!u.is_owner) u.balance = 0; });
  dbFile.save(data);
  res.json({ success: true });
});

app.post(`/api/admin/sections`, requireOwner, upload.single(`image`), (req, res) => {
  const { name, description } = req.body;
  const image = req.file ? `/uploads/` + req.file.filename : null;
  const data = dbFile.load();
  const section = {
    id: dbFile.nextId(data, `sections`),
    name, description, image,
    created_at: dbFile.nowStr()
  };
  data.sections.push(section);
  dbFile.save(data);
  res.json({ success: true, id: section.id });
});
app.delete(`/api/admin/sections/:id`, requireOwner, (req, res) => {
  const data = dbFile.load();
  data.sections = data.sections.filter(s => s.id !== Number(req.params.id));
  dbFile.save(data);
  res.json({ success: true });
});

app.post(`/api/admin/products`, requireOwner, (req, res) => {
  const { section_id, name, description, cost_price, price, quantity } = req.body;
  const data = dbFile.load();
  const product = {
    id: dbFile.nextId(data, `products`),
    section_id: Number(section_id),
    name, description,
    cost_price: Number(cost_price),
    price: Number(price),
    quantity: Number(quantity),
    created_at: dbFile.nowStr()
  };
  data.products.push(product);
  dbFile.save(data);
  res.json({ success: true, id: product.id });
});
app.delete(`/api/admin/products/:id`, requireOwner, (req, res) => {
  const data = dbFile.load();
  data.products = data.products.filter(p => p.id !== Number(req.params.id));
  dbFile.save(data);
  res.json({ success: true });
});

app.post(`/api/admin/custom-buttons`, requireOwner, upload.single(`image`), (req, res) => {
  const { name, description } = req.body;
  const image = req.file ? `/uploads/` + req.file.filename : null;
  const data = dbFile.load();
  const btn = {
    id: dbFile.nextId(data, `custom_buttons`),
    name, description, image,
    created_at: dbFile.nowStr()
  };
  data.custom_buttons.push(btn);
  dbFile.save(data);
  res.json({ success: true, id: btn.id });
});
app.delete(`/api/admin/custom-buttons/:id`, requireOwner, (req, res) => {
  const data = dbFile.load();
  data.custom_buttons = data.custom_buttons.filter(b => b.id !== Number(req.params.id));
  dbFile.save(data);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
});
