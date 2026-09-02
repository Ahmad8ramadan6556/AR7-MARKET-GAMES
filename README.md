# متجر شحن الألعاب - دليل التشغيل والنشر

## محتوى المشروع
- `server.js` — الخادم (Node.js + Express)
- `db.js` — قاعدة البيانات (SQLite)
- `public/index.html` — الواجهة (ملف واحد يحوي HTML+CSS+JS)
- `.env.example` — نموذج متغيرات البيئة

## الخطوة 1: التجربة محلياً (اختياري لكن يُنصح به)
1. ثبّت Node.js من nodejs.org (نسخة 18 فأعلى)
2. افتح Terminal داخل مجلد المشروع ونفّذ:
   ```
   npm install
   ```
3. أنشئ ملف `.env` (انسخ من `.env.example`) واملأ القيم — راجع "توليد كلمة سر المالك" أدناه
4. شغّل المشروع:
   ```
   npm start
   ```
5. افتح المتصفح على `http://localhost:3000`

## توليد كلمة سر المالك (مهم جداً)
كلمة السر لا تُكتب كنص عادي أبداً. نفّذ هذا الأمر لتوليد Hash منها:
```
node -e "console.log(require('bcryptjs').hashSync('كلمة_السر_هنا', 10))"
```
انسخ الناتج وضعه في متغير `OWNER_PASSWORD_HASH`.

## الخطوة 2: رفع المشروع إلى GitHub
1. أنشئ حساباً على github.com إذا لم يكن لديك واحد
2. اضغط على زر (+) أعلى الصفحة ثم "New repository"
3. اختر اسماً (مثلاً `game-store-app`) واجعله Private (لحماية أي إعدادات لاحقة) ثم "Create repository"
4. في الطرفية (Terminal) داخل مجلد المشروع نفّذ الأوامر التالية بالترتيب:
   ```
   git init
   git add .
   git commit -m "أول نسخة من المشروع"
   git branch -M main
   git remote add origin https://github.com/USERNAME/game-store-app.git
   git push -u origin main
   ```
   استبدل `USERNAME` باسم حسابك على GitHub.
5. لاحظ أن ملف `.env` لن يُرفع أبداً (موجود في `.gitignore`) — هذا مقصود لحماية كلمة السر والمفاتيح

## الخطوة 3: النشر على Railway
1. أنشئ حساباً على railway.app (يمكن الدخول مباشرة عبر GitHub)
2. اضغط "New Project" ثم "Deploy from GitHub repo"
3. اختر مستودع `game-store-app` الذي رفعته
4. Railway سيكتشف تلقائياً أنه مشروع Node.js وسيشغّل `npm install` ثم `npm start`
5. من تبويب "Variables" في المشروع، أضف نفس المتغيرات الموجودة في `.env.example`:
   - `SESSION_SECRET`
   - `OWNER_EMAIL`
   - `OWNER_PASSWORD_HASH`
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (اختياري إن أردت تفعيل دخول غوغل)
   - `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` (اختياري إن أردت تفعيل دخول فيسبوك)
6. من تبويب "Settings" فعّل "Generate Domain" للحصول على رابط عام لموقعك (مثل `xxx.up.railway.app`)

## الخطوة 4: تفعيل تسجيل الدخول عبر Google (اختياري)
1. اذهب إلى console.cloud.google.com وأنشئ مشروعاً جديداً
2. من "APIs & Services" → "Credentials" → "Create Credentials" → "OAuth client ID"
3. نوع التطبيق: Web application
4. في "Authorized redirect URIs" أضف:
   `https://رابط-موقعك-في-Railway/api/auth/google/callback`
5. انسخ Client ID و Client Secret وضعهما في متغيرات Railway

## الخطوة 5: تفعيل تسجيل الدخول عبر Facebook (اختياري)
1. اذهب إلى developers.facebook.com وأنشئ تطبيقاً جديداً
2. أضف منتج "Facebook Login"
3. في "Valid OAuth Redirect URIs" أضف:
   `https://رابط-موقعك-في-Railway/api/auth/facebook/callback`
4. انسخ App ID و App Secret وضعهما في متغيرات Railway

## ملاحظات مهمة
- قاعدة البيانات (`store.db`) تُنشأ تلقائياً عند أول تشغيل، وتخزن كل البيانات (المستخدمين، الطلبات، الأرصدة، المنتجات)
- على Railway، التخزين المحلي (الملفات المرفوعة وقاعدة البيانات) قد يُعاد تصفيره عند كل نشر جديد إن لم تُفعّل "Volume" دائم — من تبويب المشروع أضف Volume واربطه بمسار المشروع للحفاظ على البيانات بين عمليات النشر
- الكود الحالي يغطي الهيكل الأساسي الكامل لكل الميزات الموصوفة (تسجيل دخول، سلة، شراء، شحن رصيد شام كاش/سيرياتيل، لوحة تحكم مالك بكل أقسامها). يمكن تطويره أكثر حسب الحاجة (مثل صفحة "تعديل الحساب" و"تغيير كلمة المرور" التي تُركت كنقاط قابلة للتوسعة)
