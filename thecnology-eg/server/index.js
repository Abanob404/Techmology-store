const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const fileUpload = require('express-fileupload');
const serverless = require('serverless-http'); // تم تصحيح المكتبة للـ Serverless
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Middleware + V8 security hardening
const DEFAULT_ALLOWED_ORIGINS = [
  'https://technology-store-eg.vercel.app',
  'http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:5000'
];
const EXTRA_ALLOWED_ORIGINS = String(process.env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
const RUNTIME_VERCEL_ORIGINS = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(v => String(v).startsWith('http') ? String(v) : `https://${v}`);
const ALLOWED_ORIGINS = new Set([...DEFAULT_ALLOWED_ORIGINS, ...EXTRA_ALLOWED_ORIGINS, ...RUNTIME_VERCEL_ORIGINS]);
function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try { const u = new URL(origin); return u.hostname === 'technology-store-eg.vercel.app' || u.hostname.endsWith('.technology-store-eg.vercel.app'); }
  catch (_) { return false; }
}
app.use(cors({
  origin(origin, cb) { cb(null, isAllowedOrigin(origin)); },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Api-Key', 'x-pos-api-key'],
  credentials: false,
  maxAge: 86400
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (req.path.startsWith('/api/admin') || req.path === '/api/analytics' || req.path.startsWith('/api/analytics/visitors') || req.path.startsWith('/api/analytics/sessions')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const rateBuckets = new Map();
function createRateLimiter({ windowMs = 60000, max = 60, keyPrefix = 'generic' } = {}) {
  return (req, res, next) => {
    const rawIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const key = `${keyPrefix}:${rawIp}`; const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
    bucket.count += 1; rateBuckets.set(key, bucket);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) return res.status(429).json({ message: 'طلبات كثيرة جداً، حاول مرة أخرى بعد قليل.' });
    if (rateBuckets.size > 5000 && Math.random() < 0.02) for (const [k,v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
    next();
  };
}
const publicWriteLimiter = createRateLimiter({ windowMs: 60_000, max: 40, keyPrefix: 'public-write' });
const orderLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 12, keyPrefix: 'order' });
const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 10, keyPrefix: 'admin-login' });
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: '/tmp/', // مهم جداً لبيئات الـ Serverless مثل Vercel
  limits: { fileSize: 50 * 1024 * 1024 },
  abortOnLimit: true
}));

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);
function normalizeUploadedFiles(fileOrFiles) {
  if (!fileOrFiles) return [];
  return Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
}
function validateImageFiles(fileOrFiles) {
  const files = normalizeUploadedFiles(fileOrFiles);
  for (const file of files) {
    if (!file || !ALLOWED_IMAGE_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())) {
      const err = new Error('نوع الصورة غير مدعوم. الصيغ المسموحة: WEBP, JPG, PNG');
      err.statusCode = 400;
      throw err;
    }
    if (Number(file.size || 0) > 10 * 1024 * 1024) {
      const err = new Error('حجم الصورة أكبر من 10 MB');
      err.statusCode = 400;
      throw err;
    }
  }
  return files;
}

// إعدادات Cloudinary لرفع الصور
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// الاتصال بقاعدة بيانات MongoDB
let connectionPromise = null;
async function ensureDBConnection() {
  if (mongoose.connection.readyState === 1) return; // connected
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
      bufferCommands: true
    }).then(async () => {
      console.log('DB Connected Successfully');
      await initDefaultAdmin();
    }).catch(err => {
      connectionPromise = null;
      console.error('DB Connection Error:', err.message);
      throw err;
    });
  }
  await connectionPromise;
}
ensureDBConnection().catch(console.error);


// تعريف موديل مديري النظام (AdminUser Schema)
const adminUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'محرر' },
  roleKey: { type: String, default: 'custom' },
  permissions: { type: [String], default: [] },
  totpEnabled: { type: Boolean, default: false },
  totpSecret: { type: String, default: '' },
  totpPendingSecret: { type: String, default: '' },
  failedLoginCount: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
const AdminUser = mongoose.model('AdminUser', adminUserSchema);

const adminSessionSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  deviceLabel: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null }
});
const AdminSession = mongoose.model('AdminSession', adminSessionSchema);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(storedPassword, suppliedPassword) {
  const stored = String(storedPassword || '');
  const supplied = String(suppliedPassword || '');
  if (!stored.startsWith('scrypt$')) return stored === supplied; // legacy migration path
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const [, salt, expectedHex] = parts;
  try {
    const actual = crypto.scryptSync(supplied, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (_) {
    return false;
  }
}

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) throw new Error('JWT_SECRET غير مضبوط في إعدادات السيرفر');
  return secret;
}

function issueAdminToken(user, jti = '') {
  return jwt.sign(
    { sub: user._id.toString(), username: user.username, ...(jti ? { jti } : {}) },
    getJwtSecret(),
    { expiresIn: '12h' }
  );
}

function getClientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 120);
}
function describeAdminDevice(req) {
  const ua = String(req.headers['user-agent'] || '').slice(0, 500);
  let device = /iphone/i.test(ua) ? 'iPhone' : /ipad/i.test(ua) ? 'iPad' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /macintosh|mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'جهاز غير معروف';
  let browser = /edg\//i.test(ua) ? 'Edge' : /chrome\//i.test(ua) ? 'Chrome' : /firefox\//i.test(ua) ? 'Firefox' : /safari\//i.test(ua) ? 'Safari' : 'Browser';
  return `${browser} / ${device}`;
}
async function createAdminSession(user, req) {
  const jti = crypto.randomBytes(24).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  await AdminSession.create({ jti, userId: user._id, ip: getClientIp(req), userAgent: String(req.headers['user-agent'] || '').slice(0, 500), deviceLabel: describeAdminDevice(req), createdAt: now, lastSeenAt: now, expiresAt });
  return { jti, token: issueAdminToken(user, jti), expiresAt };
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buffer) {
  let bits = ''; for (const b of buffer) bits += b.toString(2).padStart(8, '0');
  let out = ''; for (let i = 0; i < bits.length; i += 5) { const chunk = bits.slice(i, i + 5).padEnd(5, '0'); out += BASE32_ALPHABET[parseInt(chunk, 2)]; }
  return out;
}
function base32Decode(value) {
  const clean = String(value || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = ''; for (const ch of clean) { const idx = BASE32_ALPHABET.indexOf(ch); if (idx >= 0) bits += idx.toString(2).padStart(5, '0'); }
  const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function generateTotpSecret() { return base32Encode(crypto.randomBytes(20)); }
function generateTotpCode(secret, timestamp = Date.now()) {
  const key = base32Decode(secret); const counter = Math.floor(timestamp / 30000); const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest(); const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1000000;
  return String(code).padStart(6, '0');
}
function verifyTotp(secret, code) {
  const wanted = String(code || '').replace(/\D/g, '').slice(0, 6); if (wanted.length !== 6 || !secret) return false;
  const now = Date.now(); for (const drift of [-1, 0, 1]) { const generated = generateTotpCode(secret, now + drift * 30000); if (crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(wanted))) return true; }
  return false;
}

async function requireAdminAuth(req, res, next) {
  try {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'يرجى تسجيل الدخول أولاً' });
    }
    const token = authHeader.slice(7).trim();
    const payload = jwt.verify(token, getJwtSecret());
    const user = await AdminUser.findById(payload.sub).select('-password -totpSecret -totpPendingSecret');
    if (!user) return res.status(401).json({ message: 'جلسة غير صالحة' });
    if (payload.jti) {
      const session = await AdminSession.findOne({ jti: payload.jti, userId: user._id });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) return res.status(401).json({ message: 'تم إنهاء جلسة الإدارة' });
      if (!session.lastSeenAt || Date.now() - new Date(session.lastSeenAt).getTime() > 5 * 60 * 1000) AdminSession.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } }).catch(() => null);
      req.adminSession = session;
    }
    req.adminUser = user;
    req.adminJwt = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'انتهت أو لم تعد جلسة الإدارة صالحة' });
  }
}

async function optionalAdminAuth(req, _res, next) {
  try {
    const authHeader = String(req.headers.authorization || '');
    if (authHeader.startsWith('Bearer ')) {
      const payload = jwt.verify(authHeader.slice(7).trim(), getJwtSecret());
      req.adminUser = await AdminUser.findById(payload.sub).select('-password');
    }
  } catch (_) {
    req.adminUser = null;
  }
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    const permissions = Array.isArray(req.adminUser?.permissions) ? req.adminUser.permissions : [];
    if (permissions.includes('all') || permissions.includes(permission)) return next();
    return res.status(403).json({ message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
  };
}

function requireAnyPermission(...wanted) {
  return (req, res, next) => {
    const permissions = Array.isArray(req.adminUser?.permissions) ? req.adminUser.permissions : [];
    if (permissions.includes('all') || wanted.some(p => permissions.includes(p))) return next();
    return res.status(403).json({ message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
  };
}

function requireSelfOrPermission(permission) {
  return (req, res, next) => {
    const isSelf = req.adminUser && String(req.adminUser._id) === String(req.params.id);
    const permissions = Array.isArray(req.adminUser?.permissions) ? req.adminUser.permissions : [];
    if (isSelf || permissions.includes('all') || permissions.includes(permission)) return next();
    return res.status(403).json({ message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
  };
}

const VALID_ADMIN_PERMISSIONS = new Set([
  'all', 'add_product', 'edit_product', 'delete_product',
  'manage_categories', 'manage_settings', 'manage_backup', 'view_reports', 'manage_users',
  'manage_orders', 'manage_media', 'manage_marketing', 'manage_returns', 'manage_security',
  'manage_system', 'view_visitor_details'
]);

function normalizePermissions(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = [...new Set(value.map(v => String(v).trim()).filter(v => VALID_ADMIN_PERMISSIONS.has(v)))];
  return cleaned.includes('all') ? ['all'] : cleaned;
}

const ADMIN_ROLE_LABELS = { owner: 'المالك', manager: 'مدير', orders: 'الطلبات', warehouse: 'المخزون', marketing: 'التسويق', support: 'خدمة العملاء', custom: 'مخصص' };
function normalizeRoleKey(value) { const key = String(value || 'custom').toLowerCase(); return Object.prototype.hasOwnProperty.call(ADMIN_ROLE_LABELS, key) ? key : 'custom'; }

async function initDefaultAdmin() {
  try {
    const count = await AdminUser.countDocuments();
    if (count === 0) {
      const username = String(process.env.ADMIN_USERNAME || '').trim();
      const password = String(process.env.ADMIN_PASSWORD || '');
      if (!username || !password) {
        console.warn('⚠️ لم يتم إنشاء مدير افتراضي: اضبط ADMIN_USERNAME و ADMIN_PASSWORD في متغيرات البيئة.');
        return;
      }
      const admin = new AdminUser({
        username,
        password: hashPassword(password),
        role: 'المالك',
        roleKey: 'owner',
        permissions: ['all']
      });
      await admin.save();
      console.log('✅ تم إنشاء حساب المدير الافتراضي من متغيرات البيئة');
    }
  } catch (err) {
    console.error('Error initializing default admin:', err);
  }
}

// تعريف موديل القسم (Category Schema)
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});
const Category = mongoose.model('Category', categorySchema);

// تعريف موديل المنتج (Product Schema)
const productSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  oldPrice: { type: Number },
  description: [String],
  image: { type: String, required: true },
  imagePublicId: String,
  additionalImages: [{
    url: String,
    publicId: String
  }],
  stockQuantity: { type: Number, default: 1 },
  costPrice: { type: Number, default: 0 },
  sku: { type: String, default: '', index: true },
  posItemId: { type: Number, index: true, sparse: true },
  source: { type: String, default: 'website', index: true },
  lastSyncedAt: { type: Date },
  warranty: { type: String, default: '' },
  // Legacy/internal field. Existing data may contain supplier names, so never expose it publicly.
  brand: { type: String, default: '' },
  // Customer-facing brand. Kept separate so old supplier data is preserved but private.
  publicBrand: { type: String, default: '' },
  discountExpiresAt: { type: Date },
  // Store-growth / merchandising fields. All optional for backward compatibility.
  isFeatured: { type: Boolean, default: false, index: true },
  customBadge: { type: String, default: '' },
  tags: { type: [String], default: [] },
  seoTitle: { type: String, default: '' },
  seoDescription: { type: String, default: '' },
  variants: [{
    label: { type: String, default: 'الخيار' }, value: { type: String, default: '' },
    price: Number, oldPrice: Number, stockQuantity: { type: Number, default: 0 }, sku: { type: String, default: '' }, image: { type: String, default: '' }
  }],
  isHidden: { type: Boolean, default: false, index: true },
  visibilityManuallySet: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true }
});

const Product = mongoose.model('Product', productSchema);

// تعريف موديل إعدادات المتجر (Settings Schema)
const settingsSchema = new mongoose.Schema({
  defaultProductImage: { type: String, default: '' },
  lightHeroImage: { type: String, default: 'main-banner.webp' },
  darkHeroImage: { type: String, default: 'main-banner.webp' },
  storeLogo: { type: String, default: '' },
  isShippingEnabled: { type: Boolean, default: false },
  pickupEnabled: { type: Boolean, default: true },
  freeShippingThreshold: { type: Number, default: 0 },
  shippingZones: [{ name: String, governorate: String, fee: { type: Number, default: 0 }, eta: { type: String, default: '' }, enabled: { type: Boolean, default: true } }],
  shippingInstructions: { type: String, default: '' },
  paymentCashOnDelivery: { type: Boolean, default: true },
  paymentInstapay: { type: Boolean, default: false },
  instapayHandle: { type: String, default: '' },
  paymentStorePickup: { type: Boolean, default: true },
  posApiKey: { type: String, default: () => String(process.env.POS_API_KEY || '').trim() },
  isCrossSellEnabled: { type: Boolean, default: false },
  isQuickBuyEnabled: { type: Boolean, default: false },
  isPixelEnabled: { type: Boolean, default: false },
  fbPixelId: { type: String, default: '' },
  whatsappNumber: { type: String, default: '201515664919' },
  whatsappChannelUrl: { type: String, default: 'https://whatsapp.com/channel/0029VbCqfLn9cDDaxSaaXg3W' },
  facebookUrl: { type: String, default: 'https://www.facebook.com/technologystore.official/' },
  instagramUrl: { type: String, default: 'https://www.instagram.com/technologystore.official/' },
  telegramUrl: { type: String, default: 'https://t.me/TehnologyStore' },
  tiktokUrl: { type: String, default: 'https://www.tiktok.com/@technologystore.official' },
  xUrl: { type: String, default: 'https://x.com/techstoreeg' },
  // Storefront experience switches. Defaults preserve the current storefront behavior.
  enableWishlist: { type: Boolean, default: true },
  enableCompare: { type: Boolean, default: true },
  enableRecentlyViewed: { type: Boolean, default: true },
  enableSmartSearch: { type: Boolean, default: true },
  showHomeCollections: { type: Boolean, default: true },
  lowStockThreshold: { type: Number, default: 3 },
  newProductDays: { type: Number, default: 30 },
  // Top promotional banner managed from admin.
  promoBannerEnabled: { type: Boolean, default: false },
  promoBannerText: { type: String, default: '' },
  promoBannerButtonText: { type: String, default: 'اكتشف الآن' },
  promoBannerLink: { type: String, default: '/products' },
  promoBannerImage: { type: String, default: '' },
  promoBannerImagePublicId: { type: String, default: '' },
  promoBannerStartsAt: { type: Date },
  promoBannerEndsAt: { type: Date },
  // Lightweight seasonal effects. Off by default and date-aware.
  seasonalEffectEnabled: { type: Boolean, default: false },
  seasonalEffect: { type: String, enum: ['off','snow','hearts','spring','autumn','ramadan','eid','confetti'], default: 'off' },
  seasonalEffectIntensity: { type: String, enum: ['low','medium','high'], default: 'medium' },
  seasonalMessage: { type: String, default: '' },
  seasonalEffectStartsAt: { type: Date },
  seasonalEffectEndsAt: { type: Date },
  // Optional Web Push feature. It is harmless when VAPID env vars are absent.
  pushEnabled: { type: Boolean, default: false },
  pushLastTitle: { type: String, default: '' },
  pushLastBody: { type: String, default: '' },
  pushLastUrl: { type: String, default: '/products' },
  pushLastSentAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});
const Settings = mongoose.model('Settings', settingsSchema);

// تعريف موديل الإحصائيات (Analytics Schema)
const analyticsSchema = new mongoose.Schema({
  key: { type: String, default: 'main' },
  views: { type: Object, default: {} },
  cart_adds: { type: Object, default: {} },
  whatsapp_orders: { type: Object, default: {} },
  page_visits: { type: Object, default: {} },
  total_visits: { type: Number, default: 0 },
  daily_visits: { type: Object, default: {} }
});
const Analytics = mongoose.model('Analytics', analyticsSchema);

// تعريف موديل تتبع الزوار (Visitor Schema) — V8 source attribution & sessions
const visitorSchema = new mongoose.Schema({
  visitorId: { type: String, required: true, unique: true }, ip: { type: String, default: '' }, location: { type: String, default: '' }, country: String, city: String,
  device: String, deviceType: String, browser: String, os: String, language: String, screen: String, timezone: String,
  referrer: String, utmSource: String, utmMedium: String, utmCampaign: String, utmContent: String, utmTerm: String, shareSource: String,
  source: { type: String, default: 'Direct', index: true }, medium: { type: String, default: 'direct' },
  firstSource: { type: String, default: 'Direct' }, firstReferrer: String, firstLandingPage: String, lastLandingPage: String, lastPage: String,
  knownCustomerName: { type: String, default: '' }, knownCustomerPhone: { type: String, default: '' }, lastOrderNumber: { type: String, default: '' }, ordersCount: { type: Number, default: 0 },
  visitCount: { type: Number, default: 0 }, sessionCount: { type: Number, default: 0 }, firstSeenAt: { type: Date, default: Date.now }, lastSeenAt: { type: Date, default: Date.now }, timestamp: { type: Date, default: Date.now }
}, { minimize: false });
const Visitor = mongoose.model('Visitor', visitorSchema);

const visitorSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true }, visitorId: { type: String, required: true, index: true },
  ip: String, location: String, country: String, city: String, source: { type: String, default: 'Direct', index: true }, medium: String, referrer: String,
  utmSource: String, utmMedium: String, utmCampaign: String, utmContent: String, utmTerm: String, shareSource: String,
  entryPage: String, exitPage: String, device: String, deviceType: String, browser: String, os: String, language: String, screen: String, timezone: String,
  pageCount: { type: Number, default: 1 }, activeSeconds: { type: Number, default: 0 }, startedAt: { type: Date, default: Date.now }, lastSeenAt: { type: Date, default: Date.now }
});
const VisitorSession = mongoose.model('VisitorSession', visitorSessionSchema);

const reviewSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  name: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  // Legacy field kept for backwards compatibility. New moderation keeps both the original
  // customer wording and the polished wording that is actually published.
  comment: { type: String, default: '' },
  originalComment: { type: String, default: '' },
  publishedComment: { type: String, default: '' },
  storeReply: { type: String, default: '' },
  verifiedPurchase: { type: Boolean, default: false, index: true },
  verifiedOrderNumber: { type: String, default: '' },
  status: { type: String, enum: ['pending','published','rejected','hidden'], default: 'pending', index: true },
  approved: { type: Boolean, default: false, index: true },
  moderatedBy: { type: String, default: '' },
  moderatedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const Review = mongoose.model('Review', reviewSchema);

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true }, type: { type: String, enum: ['percent','fixed'], default: 'percent' },
  value: { type: Number, required: true, min: 0 }, minSubtotal: { type: Number, default: 0 }, maxDiscount: { type: Number, default: 0 }, startsAt: Date, endsAt: Date,
  usageLimit: { type: Number, default: 0 }, usedCount: { type: Number, default: 0 }, enabled: { type: Boolean, default: true }, createdAt: { type: Date, default: Date.now }
});
const Coupon = mongoose.model('Coupon', couponSchema);

const stockNotifySchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true }, productTitle: String, name: String, phone: { type: String, required: true },
  status: { type: String, enum: ['waiting','notified','cancelled'], default: 'waiting', index: true }, createdAt: { type: Date, default: Date.now }, notifiedAt: Date
});
stockNotifySchema.index({ productId: 1, phone: 1, status: 1 });
const StockNotify = mongoose.model('StockNotify', stockNotifySchema);

// Web Push subscriptions are optional and isolated from product/order data.
const pushSubscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now }
});
const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);

// تعريف موديل سجل النشاطات (Activity Log Schema)
const activityLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  details: { type: String, default: '' },
  user: { type: String, default: 'نظام' },
  timestamp: { type: Date, default: Date.now }
});
const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);


// V9 — conversion funnel, abandoned carts, returns, backup history
const visitorEventSchema = new mongoose.Schema({
  visitorId: { type: String, default: '', index: true },
  sessionId: { type: String, default: '', index: true },
  type: { type: String, required: true, index: true },
  source: { type: String, default: 'Direct', index: true },
  medium: { type: String, default: '' },
  campaign: { type: String, default: '', index: true },
  path: { type: String, default: '' },
  productId: { type: String, default: '' },
  productTitle: { type: String, default: '' },
  orderNumber: { type: String, default: '' },
  value: { type: Number, default: 0 },
  metadata: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now, index: true }
}, { minimize: true });
visitorEventSchema.index({ sessionId: 1, type: 1, createdAt: -1 });
const VisitorEvent = mongoose.model('VisitorEvent', visitorEventSchema);

const abandonedCartSchema = new mongoose.Schema({
  visitorId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, index: true },
  source: { type: String, default: 'Direct', index: true },
  campaign: { type: String, default: '', index: true },
  customerName: { type: String, default: '' },
  phone: { type: String, default: '' },
  stage: { type: String, enum: ['cart','checkout','contact'], default: 'cart', index: true },
  items: [{ productId: String, title: String, variant: String, quantity: Number, price: Number }],
  subtotal: { type: Number, default: 0 },
  status: { type: String, enum: ['active','recovered','expired'], default: 'active', index: true },
  recoveredOrderNumber: { type: String, default: '' },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now, index: true }
}, { minimize: true });
abandonedCartSchema.index({ visitorId: 1, sessionId: 1 }, { unique: true });
const AbandonedCart = mongoose.model('AbandonedCart', abandonedCartSchema);

const returnRequestSchema = new mongoose.Schema({
  returnNumber: { type: String, required: true, unique: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  orderNumber: { type: String, required: true, index: true },
  customerName: { type: String, default: '' },
  customerPhone: { type: String, required: true },
  type: { type: String, enum: ['return','exchange'], default: 'return' },
  reason: { type: String, required: true },
  details: { type: String, default: '' },
  items: [{ title: String, variant: String, quantity: Number }],
  status: { type: String, enum: ['pending','approved','rejected','received','refunded','replaced','closed'], default: 'pending', index: true },
  adminNote: { type: String, default: '' },
  history: [{ status: String, at: { type: Date, default: Date.now }, note: String, user: String }],
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});
const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);

const backupRecordSchema = new mongoose.Schema({
  publicId: { type: String, default: '' },
  url: { type: String, default: '' },
  bytes: { type: Number, default: 0 },
  status: { type: String, enum: ['success','failed'], default: 'success' },
  trigger: { type: String, default: 'manual' },
  triggeredBy: { type: String, default: 'system' },
  error: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
});
const BackupRecord = mongoose.model('BackupRecord', backupRecordSchema);

// تعريف موديل الطلبات (Order Schema)
const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerAddress: { type: String, required: true },
  notes: { type: String, default: '' },
  visitorId: { type: String, default: '', index: true }, sessionId: { type: String, default: '' },
  checkoutToken: { type: String, index: true, sparse: true, unique: true },
  deliveryMethod: { type: String, enum: ['shipping','pickup'], default: 'pickup' }, governorate: { type: String, default: '' }, area: { type: String, default: '' },
  shippingAmount: { type: Number, default: 0 }, paymentMethod: { type: String, default: 'cash_on_delivery' }, couponCode: { type: String, default: '' }, discountAmount: { type: Number, default: 0 },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    posItemId: { type: Number },
    sku: { type: String }, variant: { type: String, default: '' }, variantId: { type: String, default: '' }, variantValue: { type: String, default: '' },
    title: { type: String },
    quantity: { type: Number, default: 1 },
    price: { type: Number, required: true },
    lineTotal: { type: Number, required: true }
  }],
  subtotal: { type: Number, required: true },
  total: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'received_by_pos', 'confirmed', 'processing', 'out_for_delivery', 'completed', 'cancelled'], default: 'pending' },
  statusHistory: [{ status: String, at: { type: Date, default: Date.now }, note: String }],
  posInvoiceId: { type: String, default: '', index: true },
  invoiceCreatedAt: Date,
  paymentStatus: { type: String, enum: ['pending','reserved','paid','cash_on_delivery','cancelled','refunded'], default: 'pending', index: true },
  paymentStatusUpdatedAt: Date,
  // Legacy fields kept only for backward compatibility. New website orders never reserve/decrement stock.
  stockReservationStatus: { type: String, enum: ['none','reserved','consumed','released'], default: 'none', index: true },
  stockReservedAt: Date, stockReservationFinalizedAt: Date,
  shippingCarrier: { type: String, default: '' }, trackingNumber: { type: String, default: '' }, trackingUrl: { type: String, default: '' }, estimatedDeliveryAt: Date,
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// Website orders never reserve, decrement, restore, or otherwise mutate inventory.
// Product quantities are read-only on the website and are supplied by Technology POS sync.

// دالة مساعدة لتسجيل حدث
async function logActivity(action, details, user = 'نظام') {
  try {
    const log = new ActivityLog({ action, details, user });
    await log.save();
  } catch (err) {
    console.error('Error saving activity log:', err);
  }
}

async function getOrCreateAnalytics() {
  let doc = await Analytics.findOne({ key: 'main' });
  if (!doc) {
    doc = new Analytics({ key: 'main', views: {}, cart_adds: {}, whatsapp_orders: {}, page_visits: {}, total_visits: 0, daily_visits: {} });
    await doc.save();
  }
  return doc;
}

// دالة لجلب أو إنشاء وثيقة الإعدادات الافتراضية
async function getOrCreateSettings() {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = new Settings({ 
      defaultProductImage: '',
      lightHeroImage: 'main-banner.webp',
      darkHeroImage: 'main-banner.webp'
    });
    await settings.save();
    return settings;
  }

  // ترحيل القيم القديمة التي كانت تشير إلى ملف PNG غير موجود.
  let changed = false;
  if (!settings.lightHeroImage || settings.lightHeroImage === 'main-banner.png') {
    settings.lightHeroImage = 'main-banner.webp';
    changed = true;
  }
  if (!settings.darkHeroImage || settings.darkHeroImage === 'main-banner.png') {
    settings.darkHeroImage = 'main-banner.webp';
    changed = true;
  }
  if (settings.defaultProductImage && /placehold\.co|No\+Image/i.test(settings.defaultProductImage)) {
    settings.defaultProductImage = '';
    changed = true;
  }
  if (changed) await settings.save();
  return settings;
}

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 20);
}

function normalizePublicUrl(value, allowedHosts = []) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://technology-store-eg.vercel.app');
    if (!['https:', 'http:'].includes(parsed.protocol)) return '';
    if (allowedHosts.length && !allowedHosts.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) return '';
    // Preserve relative internal links when the user entered one.
    if (raw.startsWith('/')) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return parsed.toString();
  } catch (_) {
    return '';
  }
}
function parseBool(value) {
  return value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
}
function parseOptionalDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function normalizeStringList(value, maxItems = 20) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[,\n]/);
  return [...new Set(source.map(v => String(v).trim()).filter(Boolean))].slice(0, maxItems);
}
function escapeRegexLiteral(value = '') { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function sanitizePlainText(value, maxLength = 500) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, maxLength);
}

function normalizeVariants(value) {
  let arr = value;
  if (typeof value === 'string') { try { arr = JSON.parse(value); } catch (_) { arr = []; } }
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 50).map(v => ({
    label: sanitizePlainText(v?.label || 'الخيار', 40), value: sanitizePlainText(v?.value, 80),
    price: Number.isFinite(Number(v?.price)) ? Math.max(0, Number(v.price)) : undefined,
    oldPrice: Number.isFinite(Number(v?.oldPrice)) ? Math.max(0, Number(v.oldPrice)) : undefined,
    stockQuantity: Math.max(0, Math.floor(Number(v?.stockQuantity) || 0)), sku: sanitizePlainText(v?.sku, 80), image: String(v?.image || '').trim().slice(0, 700)
  })).filter(v => v.value);
}
function safeUrlHost(value) { try { return new URL(String(value || '')).hostname.toLowerCase().replace(/^www\./,''); } catch (_) { return ''; } }
function classifyTrafficSource({ referrer='', utmSource='', utmMedium='', shareSource='' } = {}) {
  const u = String(utmSource || shareSource || '').trim().toLowerCase(); const medium = String(utmMedium || '').trim().toLowerCase(); const host = safeUrlHost(referrer); const hay = `${u} ${host}`;
  if (/whatsapp|wa\.me/.test(hay)) return { source: 'WhatsApp', medium: medium || 'social/share' };
  if (/facebook|fb\.com|m\.facebook/.test(hay)) return { source: 'Facebook', medium: medium || 'social' };
  if (/instagram/.test(hay)) return { source: 'Instagram', medium: medium || 'social' };
  if (/tiktok/.test(hay)) return { source: 'TikTok', medium: medium || 'social' };
  if (/telegram|t\.me/.test(hay)) return { source: 'Telegram', medium: medium || 'social/share' };
  if (/youtube/.test(hay)) return { source: 'YouTube', medium: medium || 'social' };
  if (/google/.test(hay)) return { source: 'Google', medium: medium || 'organic/search' };
  if (/bing/.test(hay)) return { source: 'Bing', medium: medium || 'organic/search' };
  if (u === 'share' || u === 'shared' || shareSource) return { source: shareSource ? `Shared:${shareSource}` : 'Shared link', medium: medium || 'share' };
  if (u) return { source: sanitizePlainText(utmSource || shareSource, 60), medium: medium || 'campaign' };
  if (host) return { source: host, medium: 'referral' };
  return { source: 'Direct', medium: 'direct' };
}
function readGeoFromRequest(req) {
  const dec = (v) => { try { return decodeURIComponent(String(v || '')); } catch (_) { return String(v || ''); } };
  const city = dec(req.headers['x-vercel-ip-city'] || ''); const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase(); const region = dec(req.headers['x-vercel-ip-country-region'] || '');
  return { city, country, location: [city, region, country].filter(Boolean).join(', ') };
}
async function getShippingQuote(settings, deliveryMethod, governorate, subtotal) {
  if (deliveryMethod === 'pickup') { if (!settings.pickupEnabled) throw Object.assign(new Error('الاستلام من المعرض غير متاح حالياً'), { statusCode: 400 }); return { amount: 0, zone: null }; }
  if (!settings.isShippingEnabled) throw Object.assign(new Error('الشحن غير متاح حالياً'), { statusCode: 400 });
  const zone = (settings.shippingZones || []).find(z => z.enabled !== false && String(z.name) === String(governorate));
  if (!zone) throw Object.assign(new Error('اختر منطقة شحن متاحة'), { statusCode: 400 });
  const freeThreshold = Math.max(0, Number(settings.freeShippingThreshold) || 0); const amount = freeThreshold > 0 && Number(subtotal) >= freeThreshold ? 0 : Math.max(0, Number(zone.fee) || 0);
  return { amount, zone };
}
async function validateCouponCode(code, subtotal) {
  const clean = String(code || '').trim().toUpperCase(); if (!clean) return { code: '', discount: 0, coupon: null };
  const coupon = await Coupon.findOne({ code: clean, enabled: true }); if (!coupon) throw Object.assign(new Error('كود الخصم غير صالح'), { statusCode: 400 });
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) throw Object.assign(new Error('كود الخصم لم يبدأ بعد'), { statusCode: 400 });
  if (coupon.endsAt && coupon.endsAt < now) throw Object.assign(new Error('انتهت صلاحية كود الخصم'), { statusCode: 400 });
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) throw Object.assign(new Error('تم استهلاك الحد الأقصى لهذا الكود'), { statusCode: 400 });
  if (Number(subtotal) < Number(coupon.minSubtotal || 0)) throw Object.assign(new Error(`الحد الأدنى لاستخدام الكود ${coupon.minSubtotal} ج.م`), { statusCode: 400 });
  let discount = coupon.type === 'fixed' ? Number(coupon.value) : Number(subtotal) * Number(coupon.value) / 100; if (coupon.maxDiscount > 0) discount = Math.min(discount, Number(coupon.maxDiscount));
  discount = Math.max(0, Math.min(Number(subtotal), Math.round(discount * 100) / 100)); return { code: clean, discount, coupon };
}
function isWindowActive(startAt, endAt) {
  const now = Date.now();
  const start = startAt ? new Date(startAt).getTime() : 0;
  const end = endAt ? new Date(endAt).getTime() : Number.POSITIVE_INFINITY;
  return (!Number.isFinite(start) || now >= start) && (!Number.isFinite(end) || now <= end);
}
function base64UrlToBuffer(value = '') {
  let raw = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (raw.length % 4) raw += '=';
  return Buffer.from(raw, 'base64');
}
function toBase64Url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function pushConfigured() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) return false;
  try {
    const pub = base64UrlToBuffer(publicKey);
    const priv = base64UrlToBuffer(privateKey);
    return pub.length === 65 && pub[0] === 4 && priv.length === 32;
  } catch (_) { return false; }
}
function buildVapidAuthorization(endpoint) {
  if (!pushConfigured()) throw new Error('VAPID keys are not configured');
  const publicKey = String(process.env.VAPID_PUBLIC_KEY).trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY).trim();
  const pub = base64UrlToBuffer(publicKey);
  const priv = base64UrlToBuffer(privateKey);
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: toBase64Url(pub.subarray(1, 33)),
    y: toBase64Url(pub.subarray(33, 65)),
    d: toBase64Url(priv)
  };
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const header = toBase64Url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = toBase64Url(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + (11 * 60 * 60),
    sub: String(process.env.VAPID_SUBJECT || 'mailto:technology.store.official1@gmail.com')
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${publicKey}`;
}
function isTrustedPushEndpoint(endpoint = '') {
  try {
    const url = new URL(String(endpoint));
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return host === 'fcm.googleapis.com' || host.endsWith('.push.services.mozilla.com') || host === 'updates.push.services.mozilla.com' || host === 'web.push.apple.com' || host.endsWith('.notify.windows.com');
  } catch (_) { return false; }
}
async function sendEmptyWebPush(endpoint) {
  if (!isTrustedPushEndpoint(endpoint)) throw new Error('Untrusted push endpoint');
  if (typeof fetch !== 'function') throw new Error('Server fetch is unavailable');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'TTL': '120', 'Urgency': 'normal', 'Authorization': buildVapidAuthorization(endpoint) }
  });
  return response.status;
}

let topProductsCache = { data: null, timestamp: 0 };

// --- SSR product routes: /products + human-readable product share links ---
function decodeProductShareCode(value = '') {
  const raw = String(value || '').trim();
  if (/^[a-f0-9]{24}$/i.test(raw)) return raw;
  if (!/^[A-Za-z0-9_-]{16}$/.test(raw)) return '';
  try {
    let base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const hex = Buffer.from(base64, 'base64').toString('hex');
    return /^[a-f0-9]{24}$/i.test(hex) ? hex : '';
  } catch (_) { return ''; }
}
function slugifyProductTitle(title = '') {
  const slug = String(title || 'product')
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 88);
  return slug || 'product';
}
function escapeHtmlAttr(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
async function resolveSharedProduct(slugOrLegacyCode = '', ref = '') {
  await ensureDBConnection();
  const slug = decodeURIComponent(String(slugOrLegacyCode || '')).trim();
  const reference = decodeURIComponent(String(ref || '')).trim();
  const visible = { isHidden: { $ne: true } };

  // Backward compatibility with V6.2 /p/:shortCode links.
  if (!reference) {
    const legacyId = decodeProductShareCode(slug);
    if (legacyId && mongoose.isValidObjectId(legacyId)) {
      return Product.findOne({ _id: legacyId, ...visible }).lean();
    }
  }

  if (reference) {
    const bySku = await Product.findOne({ sku: reference, ...visible }).lean();
    if (bySku && slugifyProductTitle(bySku.title) === slug) return bySku;

    const refId = decodeProductShareCode(reference);
    if (refId && mongoose.isValidObjectId(refId)) {
      const byId = await Product.findOne({ _id: refId, ...visible }).lean();
      if (byId && slugifyProductTitle(byId.title) === slug) return byId;
    }
  }

  // Human-readable link such as /p/flash-kingston-128.
  // We resolve it without changing any stored product data.
  const candidates = await Product.find(visible)
    .select('title category price image sku publicBrand warranty description oldPrice additionalImages stockQuantity discountExpiresAt createdAt isFeatured customBadge tags seoTitle seoDescription')
    .limit(3000)
    .lean();
  return candidates.find(product => slugifyProductTitle(product.title) === slug) || null;
}
async function renderProductsPage(req, res, productIdOverride = '', productOverride = null) {
  try {
    const htmlPath = path.join(__dirname, '../products_page.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    const productId = productIdOverride || String(req.query.id || '');
    if (productId && mongoose.isValidObjectId(productId)) {
      try {
        await ensureDBConnection();
        const product = productOverride || await Product.findById(productId).lean();
        if (product && product.isHidden !== true) {
          const seoTitleRaw = product.seoTitle || `${product.title} | TECHNOLOGY`;
          const safeTitle = escapeHtmlAttr(seoTitleRaw);
          const priceText = Number.isFinite(Number(product.price)) ? `${Number(product.price).toLocaleString('en-US')} ج.م` : '';
          const fallbackDescription = [
            product.seoDescription,
            Array.isArray(product.description) ? product.description.slice(0, 3).join(' • ') : '',
            priceText ? `السعر: ${priceText}` : '',
            product.category ? `قسم: ${product.category}` : ''
          ].filter(Boolean).join(' • ').slice(0, 180);
          const safeDescription = escapeHtmlAttr(fallbackDescription);
          let image = product.image || 'logo.webp';
          if (image.startsWith('/')) image = `https://${req.get('host')}${image}`;
          else if (!image.startsWith('http')) image = `https://${req.get('host')}/${image}`;
          const canonicalUrl = `https://${req.get('host')}${req.path}`;
          html = html.replace(/<title>.*?<\/title>/, `<title>${safeTitle}</title>`);
          html = html.replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${safeDescription}">`);
          html = html.replace(/<meta property="og:title" content=".*?">/, `<meta property="og:title" content="${safeTitle}">`);
          html = html.replace(/<meta property="og:description" content=".*?">/, `<meta property="og:description" content="${safeDescription}">`);
          html = html.replace(/<meta property="og:image" content=".*?">/, `<meta property="og:image" content="${escapeHtmlAttr(image)}">`);
          if (/<meta property="og:url"/.test(html)) html = html.replace(/<meta property="og:url" content=".*?">/, `<meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}">`);
          else html = html.replace('</head>', `    <meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}">\n</head>`);
          const schemaProduct = {
            '@context': 'https://schema.org', '@type': 'Product', name: product.title,
            image: [image, ...(product.additionalImages || []).map(i => i.url).filter(Boolean)].slice(0, 5),
            description: fallbackDescription, sku: product.sku || undefined,
            brand: product.publicBrand ? { '@type': 'Brand', name: product.publicBrand } : undefined,
            offers: { '@type': 'Offer', url: canonicalUrl, priceCurrency: 'EGP', price: Number(product.price) || 0,
              availability: Number(product.stockQuantity) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' }
          };
          const extraHead = `    <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}">\n` +
            `    <meta name="twitter:card" content="summary_large_image">\n` +
            `    <meta name="twitter:title" content="${safeTitle}">\n` +
            `    <meta name="twitter:description" content="${safeDescription}">\n` +
            `    <meta name="twitter:image" content="${escapeHtmlAttr(image)}">\n` +
            `    <script type="application/ld+json">${JSON.stringify(schemaProduct).replace(/</g, '\u003c')}</script>\n` +
            `    <script>window.__SHARED_PRODUCT_ID__=${JSON.stringify(String(product._id))};window.__DIRECT_PRODUCT_MODE__=true;</script>\n`;
          html = html.replace('</head>', extraHead + '</head>');
        }
      } catch (e) { console.error('SSR OG Tags DB Error:', e.message); }
    } else if (!productId) {
      const topProducts = topProductsCache.data || [];
      if (topProducts.length > 0) {
        let preloadTags = '';
        topProducts.slice(0, 2).forEach(p => {
          if (p.image && !p.image.includes('placehold.co')) {
            const url = p.image.replace('/upload/', '/upload/w_220,h_220,c_fit,q_auto,f_auto/');
            preloadTags += `<link rel="preload" as="image" href="${url}" fetchpriority="high">\n`;
          }
        });
        html = html.replace('</head>', `    ${preloadTags}</head>`);
      }
    }
    res.send(html);
  } catch (err) {
    console.error('SSR File Error:', err);
    res.status(503).send('<html dir="rtl"><body><h2>عذراً، مشكلة في الخادم. يرجى التحديث.</h2><button onclick="location.reload()">تحديث</button></body></html>');
  }
}
app.get('/robots.txt', (req,res)=>{res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\nSitemap: https://technology-store-eg.vercel.app/sitemap.xml\n');});
app.get('/sitemap.xml', async(req,res)=>{try{const products=await Product.find({isHidden:{$ne:true}}).select('title sku updatedAt createdAt').sort({createdAt:-1}).limit(10000).lean();const base='https://technology-store-eg.vercel.app';const urls=[`${base}/`,`${base}/products`,`${base}/services`,`${base}/privacy`,`${base}/shipping-policy`,`${base}/returns-policy`,`${base}/warranty`,`${base}/terms`].concat(products.map(x=>`${base}/p/${encodeURIComponent(slugifyProductTitle(x.title))}/${encodeURIComponent(x.sku||String(x._id))}`));const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>`<url><loc>${u.replace(/&/g,'&amp;')}</loc></url>`).join('')+'</urlset>';res.type('application/xml').send(xml);}catch(err){res.status(500).type('text/plain').send('sitemap unavailable');}});
function renderPolicyPage(res,title,body){const logo='/logo.webp';res.type('html').send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Technology Store</title><style>body{margin:0;font-family:Cairo,Arial;background:#0f1519;color:#e8f1f7;line-height:1.9}.wrap{max-width:900px;margin:auto;padding:28px 18px 70px}.head{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #24333d;padding-bottom:18px}.head img{height:52px}.head a{color:#77c9ff;text-decoration:none}.card{margin-top:28px;background:#141d23;border:1px solid #263640;border-radius:18px;padding:26px}.card h1{font-size:28px;margin:0 0 14px;color:#77c9ff}.card h2{font-size:18px;margin-top:24px}.card p,.card li{color:#c8d4db}.back{display:inline-block;margin-top:20px;color:#77c9ff}</style></head><body><div class="wrap"><div class="head"><img src="${logo}" alt="Technology Store"><a href="/">العودة للمتجر</a></div><article class="card"><h1>${title}</h1>${body}</article></div></body></html>`);}
app.get('/privacy',(req,res)=>renderPolicyPage(res,'سياسة الخصوصية','<p>نستخدم البيانات اللازمة لتشغيل المتجر وتنفيذ الطلبات وتحسين الأداء وقياس مصادر الزيارات. لا نبيع بيانات العملاء للمعلنين.</p><h2>البيانات المستخدمة</h2><p>بيانات الطلب، مصدر الزيارة، نوع الجهاز، ومعرّف زيارة تقني لأغراض التحليل والحماية.</p><h2>التواصل</h2><p>يتم استخدام بيانات الاتصال فقط لتنفيذ الطلبات وخدمة ما بعد البيع والتواصل الذي يطلبه العميل.</p>'));
app.get('/shipping-policy',(req,res)=>renderPolicyPage(res,'سياسة الشحن والتوصيل','<p>تظهر تكلفة الشحن والمدة المتوقعة أثناء إتمام الطلب حسب المنطقة المختارة. قد تتغير المدة في المواسم أو الظروف الاستثنائية.</p><h2>الاستلام من المعرض</h2><p>يمكن اختيار الاستلام من المعرض عند توفره بدون رسوم شحن.</p>'));
app.get('/returns-policy',(req,res)=>renderPolicyPage(res,'سياسة الاستبدال والاسترجاع','<p>يمكن تقديم طلب استبدال أو استرجاع من خلال تتبع الطلب. تتم مراجعة الحالة والمنتج وفق الضمان وحالة المنتج وسياسة المتجر.</p>'));
app.get('/warranty',(req,res)=>renderPolicyPage(res,'سياسة الضمان','<p>مدة وشروط الضمان تختلف حسب المنتج وتظهر في صفحة المنتج أو فاتورة الطلب عند توفرها. يحتفظ العميل برقم الطلب كمرجع للخدمة.</p>'));
app.get('/terms',(req,res)=>renderPolicyPage(res,'الشروط والأحكام','<p>باستخدام المتجر وإرسال الطلب يوافق العميل على صحة بيانات الطلب وطريقة الاستلام المختارة. الأسعار والمخزون المعروضان يخضعان للتحديث الفعلي.</p>'));

// Pretty campaign links: keep clean URLs such as /facebook, /instagram-products,
// /facebook-services and /instagram-products-launch without returning a Vercel 404.
// Vercel sends these routes to this server function; the browser URL stays unchanged
// so app.js can still attribute the visit to the correct source/campaign.
function renderPrettyCampaignPage(req, res) {
  try {
    const slug = decodeURIComponent(String(req.path || '/'))
      .replace(/^\/+|\/+$/g, '')
      .toLowerCase();
    const bits = slug.split('-').filter(Boolean);
    const destination = bits.includes('products') ? 'products' : bits.includes('services') ? 'services' : 'home';

    if (destination === 'products') return renderProductsPage(req, res);

    const fileName = destination === 'services' ? 'services.html' : 'index.html';
    const filePath = path.join(__dirname, '..', fileName);
    const html = fs.readFileSync(filePath, 'utf-8');
    res.type('html').send(html);
  } catch (err) {
    console.error('Pretty campaign route error:', err);
    res.redirect('/');
  }
}
app.get(/^\/(?:facebook|instagram|whatsapp|tiktok|telegram|youtube|qr)(?:-[a-z0-9_-]+)*\/?$/i, renderPrettyCampaignPage);
app.get(/^\/campaign-[a-z0-9_-]+\/?$/i, renderPrettyCampaignPage);

app.get('/products', (req, res) => renderProductsPage(req, res));
app.get('/p/:slug/:ref?', async (req, res) => {
  try {
    const product = await resolveSharedProduct(req.params.slug, req.params.ref || '');
    if (!product) return renderProductsPage(req, res);
    return renderProductsPage(req, res, String(product._id), product);
  } catch (err) {
    console.error('Shared product route error:', err);
    return renderProductsPage(req, res);
  }
});

// --- الـ API Routes الخاصة بمزامنة برنامج الكاشير (POS) ---

async function requirePosApiKey(req, res, next) {
  try {
    const settings = await Settings.findOne().maxTimeMS(5000).lean();
    const configured = (settings && settings.posApiKey) ? String(settings.posApiKey).trim() : String(process.env.POS_API_KEY || '').trim();
    const supplied = String(req.headers['x-pos-api-key'] || req.query['x-pos-api-key'] || "").trim();

    if (!configured) {
      return res.status(503).json({ message: "لم يتم إعداد مفتاح ربط الـ POS على السيرفر" });
    }
    if (!supplied || supplied !== configured) {
      return res.status(401).json({ message: "غير صحيح POS مفتاح ربط الـ" });
    }
    next();
  } catch (err) {
    return res.status(503).json({ message: "الخدمة غير متاحة حالياً بسبب الضغط، يرجى المحاولة لاحقاً", error: err.message });
  }
}

// 1. اختبار الاتصال
app.get('/api/pos/ping', requirePosApiKey, async (req, res) => {
  try {
    const productsCount = await Product.countDocuments();
    const pendingOrdersCount = await Order.countDocuments({ status: { $in: ['pending','received_by_pos'] }, $or: [{ posInvoiceId: '' }, { posInvoiceId: null }, { posInvoiceId: { $exists: false } }] });
    
    res.json({
      ok: true,
      service: "technology-store-pos-link",
      products: productsCount,
      pendingOrders: pendingOrdersCount,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// جلب المنتجات للمقارنة (للـ POS) مع تحسين الذاكرة
app.get('/api/pos/products', requirePosApiKey, async (req, res) => {
  try {
    // جلب الحقول الضرورية فقط كما طلب الـ POS لتقليل استهلاك الذاكرة ومنع انهيار السيرفر 500
    const products = await Product.find({})
      .select('sku posItemId price stockQuantity oldPrice barcode quantity is_on_offer offer_price -_id')
      .lean();
    res.json(products);
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// 2. مزامنة المنتجات (Update Only - تحديث السعر والكمية فقط للمنتجات الموجودة)
const handlePosSync = async (req, res) => {
  try {
    const { fullSync, warehouseId, syncedAt, products } = req.body;
    
    if (!Array.isArray(products)) {
      return res.status(400).json({ ok: false, message: "Products must be an array" });
    }

    let received = products.length;
    let processed = 0;
    let modified = 0;

    for (const item of products) {
      processed++;
      
      // مطابقة الحقول مع أسماء الـ POS الفعلية
      const skuVal = item.barcode || item.sku;
      const posIdVal = item.posItemId;
      const priceVal = item.sale_price_piece || item.salePrice || item.sale_price || item.price;
      const stockVal = item.quantity !== undefined ? item.quantity : item.stockQuantity;
      const costVal = item.cost_price_piece ?? item.costPrice ?? item.cost_price ?? item.purchasePrice ?? item.purchase_price;
      const isOnOffer = item.is_on_offer == 1 || item.is_on_offer === '1' || item.is_on_offer === true || item.isOnOffer;
      const offerPriceVal = item.offer_price || item.offerPrice;

      const searchCriteria = {};
      if (skuVal && String(skuVal).trim() !== '') {
        searchCriteria.sku = String(skuVal).trim();
      } else if (posIdVal !== undefined && posIdVal !== null) {
        searchCriteria.posItemId = posIdVal;
      } else {
        continue;
      }

      let product = await Product.findOne(searchCriteria);

      if (product) {
        // تحديث السعر والكمية فقط للمنتجات التي سبق إنشاؤها في المتجر
        if (priceVal !== undefined && priceVal !== null && !isNaN(Number(priceVal))) {
          if (isOnOffer && offerPriceVal !== undefined && !isNaN(Number(offerPriceVal))) {
            product.price = Number(offerPriceVal);
            product.oldPrice = Number(priceVal);
          } else {
            product.price = Number(priceVal);
            product.oldPrice = undefined; // مسح السعر القديم إذا لم يكن هناك عرض
          }
        }
        
        if (stockVal !== undefined && stockVal !== null && !isNaN(Number(stockVal))) { product.stockQuantity = Number(stockVal); }
        if (costVal !== undefined && costVal !== null && !isNaN(Number(costVal))) { product.costPrice = Math.max(0, Number(costVal)); }
        
        if (posIdVal !== undefined) product.posItemId = posIdVal;
        product.source = 'pos';
        product.lastSyncedAt = new Date();
        
        await product.save();
        modified++;
      } else {
        // التجاهل التام وعدم إنشاء أي منتج جديد في المتجر
        continue;
      }
    }

    res.json({
      ok: true,
      message: "تم تحديث كميات وأسعار المنتجات الموجودة فقط (Update Only)",
      received,
      processed,
      modified,
      upserted: 0,
      syncedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('POS Sync Error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

app.post('/api/pos/products/sync', requirePosApiKey, handlePosSync);
app.post('/api/pos-sync', requirePosApiKey, handlePosSync);

// 3. جلب طلبات الموقع داخل البرنامج
app.get('/api/pos/orders', requirePosApiKey, async (req, res) => {
  try {
    const status = String(req.query.status || 'awaiting_invoice').trim();
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 500));
    const filter = status === 'awaiting_invoice'
      ? { status: { $in: ['pending','received_by_pos'] }, $or: [{ posInvoiceId: '' }, { posInvoiceId: null }, { posInvoiceId: { $exists: false } }] }
      : { status };

    const orders = await Order.find(filter).limit(limit).sort({ createdAt: 1 });
    
    const formattedOrders = orders.map(order => ({
      _id: order._id.toString(),
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      notes: order.notes,
      deliveryMethod: order.deliveryMethod,
      governorate: order.governorate,
      area: order.area,
      shippingAmount: order.shippingAmount,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus || 'pending',
      couponCode: order.couponCode,
      discountAmount: order.discountAmount,
      subtotal: order.subtotal,
      total: order.total,
      status: order.status,
      posInvoiceId: order.posInvoiceId || '',
      invoiceCreatedAt: order.invoiceCreatedAt || null,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map(item => ({
        productId: item.productId ? item.productId.toString() : null,
        posItemId: item.posItemId,
        sku: item.sku,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        lineTotal: item.lineTotal
      }))
    }));

    res.json({
      ok: true,
      orders: formattedOrders
    });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4. تحديث حالة طلب الموقع من البرنامج
app.put('/api/pos/orders/:orderId/status', requirePosApiKey, async (req, res) => {
  try {
    const { orderId } = req.params;
    const requestedStatus = String(req.body?.status || '').trim();
    const incomingInvoiceId = sanitizePlainText(req.body?.posInvoiceId, 120);
    const incomingPaymentStatus = String(req.body?.paymentStatus || '').trim();
    const note = sanitizePlainText(req.body?.note, 300);

    const validStatuses = ['pending', 'received_by_pos', 'confirmed', 'processing', 'out_for_delivery', 'completed', 'cancelled'];
    const validPaymentStatuses = ['pending','reserved','paid','cash_on_delivery','cancelled','refunded'];
    if (requestedStatus && !validStatuses.includes(requestedStatus)) {
      return res.status(400).json({ ok: false, message: 'Invalid status' });
    }
    if (incomingPaymentStatus && !validPaymentStatuses.includes(incomingPaymentStatus)) {
      return res.status(400).json({ ok: false, message: 'Invalid paymentStatus' });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ ok: false, message: 'Order not found' });

    const hadInvoice = Boolean(String(order.posInvoiceId || '').trim());
    if (incomingInvoiceId && order.status === 'cancelled') {
      return res.status(409).json({ ok:false, message:'Cancelled order cannot be invoiced' });
    }
    if (hadInvoice && incomingInvoiceId && String(order.posInvoiceId) !== incomingInvoiceId) {
      return res.status(409).json({ ok:false, message:'Order is already linked to a different POS invoice' });
    }
    if (incomingInvoiceId) {
      order.posInvoiceId = incomingInvoiceId;
      if (!order.invoiceCreatedAt) order.invoiceCreatedAt = new Date();
    }
    const hasInvoice = Boolean(String(order.posInvoiceId || '').trim());

    // Any state that means the order has actually entered the sales flow requires a real POS invoice.
    const invoiceRequiredStatuses = ['confirmed','processing','out_for_delivery','completed'];
    if (requestedStatus && invoiceRequiredStatuses.includes(requestedStatus) && !hasInvoice) {
      return res.status(409).json({ ok: false, message: 'POS invoice is required before confirming/processing this order' });
    }
    if (incomingPaymentStatus && ['reserved','paid','cash_on_delivery','refunded'].includes(incomingPaymentStatus) && !hasInvoice) {
      return res.status(409).json({ ok: false, message: 'POS invoice is required before updating payment status' });
    }

    const nextStatus = requestedStatus || (incomingInvoiceId ? 'confirmed' : order.status);
    if (nextStatus !== order.status) {
      order.status = nextStatus;
      order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
      order.statusHistory.push({ status: nextStatus, at: new Date(), note: note || (hasInvoice ? 'تم تحديث الطلب من Technology POS' : 'تم استلام الطلب داخل Technology POS') });
    } else if (note) {
      order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
      order.statusHistory.push({ status: order.status, at: new Date(), note });
    }

    if (incomingPaymentStatus) {
      order.paymentStatus = incomingPaymentStatus;
      order.paymentStatusUpdatedAt = new Date();
    }

    // Important: website stock is NEVER changed here. POS remains the only inventory authority.
    order.stockReservationStatus = 'none';
    order.stockReservedAt = undefined;
    order.stockReservationFinalizedAt = undefined;

    // Count coupon usage only when a real POS invoice is created for the first time.
    if (!hadInvoice && hasInvoice && order.couponCode) {
      await Coupon.updateOne({ code: order.couponCode }, { $inc: { usedCount: 1 } }).catch(() => null);
    }
    if (!hadInvoice && hasInvoice && order.visitorId) {
      await VisitorEvent.create({ visitorId:order.visitorId, sessionId:order.sessionId||'', type:'order_completed', orderNumber:order.orderNumber, value:order.total, metadata:{posInvoiceId:order.posInvoiceId,paymentStatus:order.paymentStatus||'pending'} }).catch(() => null);
    }

    await order.save();

    res.json({
      ok: true,
      message: 'Order updated successfully',
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      posInvoiceId: order.posInvoiceId || '',
      invoiceCreatedAt: order.invoiceCreatedAt || null
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Dedicated endpoint for the moment Technology POS creates the real sales invoice.
app.post('/api/pos/orders/:orderId/invoice', requirePosApiKey, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ ok:false, message:'Order not found' });
    const posInvoiceId = sanitizePlainText(req.body?.posInvoiceId, 120);
    if (!posInvoiceId) return res.status(400).json({ ok:false, message:'posInvoiceId is required' });
    const paymentStatus = String(req.body?.paymentStatus || 'pending').trim();
    const validPaymentStatuses = ['pending','reserved','paid','cash_on_delivery','cancelled','refunded'];
    if (!validPaymentStatuses.includes(paymentStatus)) return res.status(400).json({ ok:false, message:'Invalid paymentStatus' });

    const hadInvoice = Boolean(String(order.posInvoiceId || '').trim());
    if (order.status === 'cancelled') return res.status(409).json({ ok:false, message:'Cancelled order cannot be invoiced' });
    if (hadInvoice && String(order.posInvoiceId) !== posInvoiceId) return res.status(409).json({ ok:false, message:'Order is already linked to a different POS invoice' });
    order.posInvoiceId = posInvoiceId;
    if (!order.invoiceCreatedAt) order.invoiceCreatedAt = new Date();
    order.paymentStatus = paymentStatus;
    order.paymentStatusUpdatedAt = new Date();
    order.status = 'confirmed';
    order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
    order.statusHistory.push({ status:'confirmed', at:new Date(), note:sanitizePlainText(req.body?.note,300) || `تم إنشاء فاتورة البيع من Technology POS رقم ${posInvoiceId}` });
    order.stockReservationStatus = 'none';
    order.stockReservedAt = undefined;
    order.stockReservationFinalizedAt = undefined;
    if (!hadInvoice && order.couponCode) await Coupon.updateOne({ code: order.couponCode }, { $inc: { usedCount: 1 } }).catch(() => null);
    if (!hadInvoice && order.visitorId) await VisitorEvent.create({ visitorId:order.visitorId, sessionId:order.sessionId||'', type:'order_completed', orderNumber:order.orderNumber, value:order.total, metadata:{posInvoiceId:order.posInvoiceId,paymentStatus:order.paymentStatus||'pending'} }).catch(() => null);
    await order.save();
    res.json({ ok:true, orderId:order._id, orderNumber:order.orderNumber, status:order.status, paymentStatus:order.paymentStatus, posInvoiceId:order.posInvoiceId, invoiceCreatedAt:order.invoiceCreatedAt });
  } catch (err) {
    res.status(500).json({ ok:false, error:err.message });
  }
});

// --- الـ API Routes الخاصة بالمنتجات ---

// إضافة طلب جديد (عبر الموقع)
app.post('/api/orders', orderLimiter, async (req, res) => {
  try {
    await ensureDBConnection();
    const { customerName, customerPhone, customerAddress, notes, paymentMethod, deliveryMethod='pickup', governorate='', area='', couponCode='', visitorId='', sessionId='', checkoutToken='', items } = req.body || {};
    const safeToken = sanitizePlainText(checkoutToken, 160);
    if (safeToken) {
      const existing = await Order.findOne({ checkoutToken: safeToken }).lean();
      if (existing) return res.json({success:true,idempotent:true,message:'تم استلام هذا الطلب بالفعل',orderId:existing.orderNumber,orderNumber:existing.orderNumber,subtotal:existing.subtotal,discountAmount:existing.discountAmount,shippingAmount:existing.shippingAmount,total:existing.total,paymentMethod:existing.paymentMethod,deliveryMethod:existing.deliveryMethod});
    }
    const safeName = sanitizePlainText(customerName, 100); const safePhone = normalizePhoneNumber(customerPhone); const safeAddress = sanitizePlainText(customerAddress, 600);
    if (!safeName || !safePhone) return res.status(400).json({ success:false, message:'الاسم ورقم الهاتف مطلوبان' });
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) return res.status(400).json({ success:false, message:'السلة غير صالحة' });
    let subtotal = 0; const orderItems = [];
    for (const item of items) {
      let product = null;
      if (item.productId) product = await Product.findById(item.productId);
      else if (item.sku) product = await Product.findOne({ sku: item.sku });
      else if (item.posItemId) product = await Product.findOne({ posItemId: item.posItemId });
      if (!product || product.isHidden) return res.status(404).json({ success:false, message:`المنتج غير موجود: ${sanitizePlainText(item.title,100)}` });
      const qty = Number(item.quantity); if (!Number.isInteger(qty) || qty < 1 || qty > 99) return res.status(400).json({ success:false, message:`كمية غير صالحة للمنتج: ${product.title}` });
      let itemPrice = Number(product.price) || 0; let stock = Number(product.stockQuantity) || 0; let sku = product.sku || ''; let variantText = '', variantId='', variantValue='';
      if (item.variant && Array.isArray(product.variants) && product.variants.length) {
        const wanted = typeof item.variant === 'object' ? String(item.variant.value || '') : String(item.variant || '');
        const variant = product.variants.find(v => String(v.value) === wanted || String(v.sku) === wanted);
        if (!variant) return res.status(400).json({ success:false, message:`الخيار المحدد غير صالح للمنتج: ${product.title}` });
        itemPrice = Number.isFinite(Number(variant.price)) ? Number(variant.price) : itemPrice; stock = Number(variant.stockQuantity) || 0; sku = variant.sku || sku; variantText = `${variant.label || 'الخيار'}: ${variant.value}`; variantId=String(variant._id||''); variantValue=String(variant.value||'');
      }
      if (stock < qty) return res.status(409).json({ success:false, message:`الكمية المطلوبة غير متاحة للمنتج: ${product.title}${variantText ? ` (${variantText})` : ''}` });
      const lineTotal = itemPrice * qty; subtotal += lineTotal;
      orderItems.push({ productId:product._id,posItemId:product.posItemId,sku,title:product.title,variant:variantText,variantId,variantValue,quantity:qty,price:itemPrice,lineTotal });
    }
    subtotal = Math.round(subtotal*100)/100;
    const settings = await getOrCreateSettings();
    const method = deliveryMethod === 'shipping' ? 'shipping' : 'pickup';
    if (method === 'shipping' && !safeAddress) return res.status(400).json({ success:false, message:'العنوان مطلوب للشحن' });
    const quote = await getShippingQuote(settings, method, governorate, subtotal);
    const coupon = await validateCouponCode(couponCode, subtotal);
    const allowedPayments = [];
    if (settings.paymentCashOnDelivery) allowedPayments.push('cash_on_delivery');
    if (settings.paymentInstapay) allowedPayments.push('instapay');
    if (settings.paymentStorePickup) allowedPayments.push('pay_at_store');
    const pay = allowedPayments.includes(String(paymentMethod)) ? String(paymentMethod) : (method === 'pickup' && settings.paymentStorePickup ? 'pay_at_store' : (settings.paymentCashOnDelivery ? 'cash_on_delivery' : allowedPayments[0]));
    if (!pay) return res.status(400).json({ success:false, message:'لا توجد طريقة دفع متاحة حالياً' });
    const total = Math.max(0, Math.round((subtotal - coupon.discount + quote.amount)*100)/100);
    const orderNumber = `WEB-${new Date().toISOString().replace(/[-:T]/g,'').slice(0,14)}-${Math.floor(1000+Math.random()*9000)}`;
    const order = new Order({ orderNumber, checkoutToken:safeToken||undefined, customerName:safeName, customerPhone:safePhone, customerAddress:method==='pickup'?'استلام من المعرض':safeAddress, notes:sanitizePlainText(notes,700), visitorId:sanitizePlainText(visitorId,120), sessionId:sanitizePlainText(sessionId,140), deliveryMethod:method, governorate:sanitizePlainText(governorate,100), area:sanitizePlainText(area,120), shippingAmount:quote.amount, paymentMethod:pay, paymentStatus:'pending', couponCode:coupon.code, discountAmount:coupon.discount, items:orderItems, subtotal, total, stockReservationStatus:'none', statusHistory:[{status:'pending',at:new Date(),note:'تم استلام الطلب من الموقع — في انتظار إنشاء فاتورة البيع من Technology POS'}] });
    await order.save();
    if (order.visitorId) {
      await Visitor.updateOne({ visitorId: order.visitorId }, { $set: { knownCustomerName: safeName, knownCustomerPhone: safePhone, lastOrderNumber: order.orderNumber }, $inc: { ordersCount: 1 } }).catch(() => null);
      await AbandonedCart.updateMany({ visitorId: order.visitorId, status: 'active' }, { $set: { status: 'recovered', recoveredOrderNumber: order.orderNumber, lastSeenAt: new Date() } }).catch(() => null);
      const session = order.sessionId ? await VisitorSession.findOne({ sessionId: order.sessionId }).lean().catch(() => null) : null;
      await VisitorEvent.create({ visitorId: order.visitorId, sessionId: order.sessionId, type: 'order_submitted', source: session?.source || 'Direct', medium: session?.medium || '', campaign: session?.utmCampaign || '', path: '/checkout', orderNumber: order.orderNumber, value: total }).catch(() => null);
    }
    let doc=await Analytics.findOne({key:'main'}); if(!doc) doc=new Analytics({key:'main'}); const wOrders={...(doc.whatsapp_orders||{})};
    for(const item of orderItems){const idStr=String(item.productId);if(!wOrders[idStr])wOrders[idStr]={count:0,title:item.title};wOrders[idStr].count+=(item.quantity||1);wOrders[idStr].lastDate=new Date().toISOString();}
    doc.whatsapp_orders=wOrders;doc.markModified('whatsapp_orders');await doc.save();
    res.json({success:true,message:'تم استلام طلبك وسيتم تأكيده بعد إنشاء الفاتورة من المتجر',orderId:order.orderNumber,orderNumber:order.orderNumber,subtotal,discountAmount:coupon.discount,shippingAmount:quote.amount,total,paymentMethod:pay,deliveryMethod:method});
  } catch(err){
    if (err?.code===11000 && req.body?.checkoutToken) { const existing=await Order.findOne({checkoutToken:sanitizePlainText(req.body.checkoutToken,160)}).lean().catch(()=>null); if(existing)return res.json({success:true,idempotent:true,orderId:existing.orderNumber,orderNumber:existing.orderNumber,total:existing.total,subtotal:existing.subtotal,shippingAmount:existing.shippingAmount,discountAmount:existing.discountAmount,paymentMethod:existing.paymentMethod,deliveryMethod:existing.deliveryMethod}); }
    console.error('Error submitting order:',err);res.status(err.statusCode||500).json({success:false,message:err.statusCode?err.message:'خطأ أثناء تقديم الطلب'});
  }
});

app.post('/api/checkout/quote', publicWriteLimiter, async (req,res)=>{
  try{await ensureDBConnection();const settings=await getOrCreateSettings();const subtotal=Math.max(0,Number(req.body?.subtotal)||0);const quote=await getShippingQuote(settings,req.body?.deliveryMethod==='shipping'?'shipping':'pickup',req.body?.governorate||'',subtotal);const coupon=await validateCouponCode(req.body?.couponCode||'',subtotal);res.json({shippingAmount:quote.amount,discountAmount:coupon.discount,total:Math.max(0,Math.round((subtotal-coupon.discount+quote.amount)*100)/100),eta:quote.zone?.eta||'',couponCode:coupon.code});}catch(err){res.status(err.statusCode||400).json({message:err.message});}
});
app.post('/api/coupons/validate', publicWriteLimiter, async (req,res)=>{try{await ensureDBConnection();const r=await validateCouponCode(req.body?.code,Math.max(0,Number(req.body?.subtotal)||0));res.json({valid:true,code:r.code,discountAmount:r.discount});}catch(err){res.status(err.statusCode||400).json({valid:false,message:err.message});}});

app.get('/api/orders/track', publicWriteLimiter, async (req,res)=>{
  try{await ensureDBConnection();const orderNumber=sanitizePlainText(req.query.orderNumber,80);const phone=normalizePhoneNumber(req.query.phone);if(!orderNumber||!phone)return res.status(400).json({message:'رقم الطلب ورقم الهاتف مطلوبان'});const order=await Order.findOne({orderNumber,customerPhone:phone}).lean();if(!order)return res.status(404).json({message:'لم يتم العثور على الطلب بهذه البيانات'});res.json({orderNumber:order.orderNumber,status:order.status,createdAt:order.createdAt,total:order.total,shippingAmount:order.shippingAmount,discountAmount:order.discountAmount,deliveryMethod:order.deliveryMethod,paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus||'pending',posInvoiceId:order.posInvoiceId||'',invoiceCreatedAt:order.invoiceCreatedAt||null,shippingCarrier:order.shippingCarrier||'',trackingNumber:order.trackingNumber||'',trackingUrl:order.trackingUrl||'',estimatedDeliveryAt:order.estimatedDeliveryAt||null,items:(order.items||[]).map(i=>({title:i.title,variant:i.variant,quantity:i.quantity,price:i.price})),statusHistory:(order.statusHistory||[]).map(x=>({status:x.status,at:x.at,note:x.note}))});}catch(err){res.status(500).json({message:'تعذر تتبع الطلب'});}
});

app.get('/api/reviews/:productId', async (req,res)=>{try{await ensureDBConnection();const reviews=await Review.find({productId:req.params.productId,$or:[{status:'published'},{status:{$exists:false},approved:true}]}).sort({createdAt:-1}).limit(50).lean();const clean=reviews.map(r=>({...r,comment:r.publishedComment||r.comment||r.originalComment||'',storeReply:r.storeReply||''}));const avg=clean.length?clean.reduce((a,r)=>a+Number(r.rating||0),0)/clean.length:0;res.json({reviews:clean,average:Math.round(avg*10)/10,count:clean.length});}catch(err){res.status(500).json({message:'تعذر تحميل التقييمات'});}});
app.post('/api/reviews', publicWriteLimiter, async (req,res)=>{try{await ensureDBConnection();const productId=String(req.body?.productId||'');const product=await Product.findById(productId).select('_id');if(!product)return res.status(404).json({message:'المنتج غير موجود'});const name=sanitizePlainText(req.body?.name,80);const rating=Math.max(1,Math.min(5,Number(req.body?.rating)||0));const comment=sanitizePlainText(req.body?.comment,800);if(!name||!rating)return res.status(400).json({message:'الاسم والتقييم مطلوبان'});let verifiedPurchase=false,verifiedOrderNumber='';const orderNumber=sanitizePlainText(req.body?.orderNumber,80),phone=normalizePhoneNumber(req.body?.phone);if(orderNumber&&phone){const order=await Order.findOne({orderNumber,customerPhone:phone,posInvoiceId:{$exists:true,$nin:['',null]},status:{$ne:'cancelled'},'items.productId':productId}).select('orderNumber').lean();if(order){verifiedPurchase=true;verifiedOrderNumber=order.orderNumber;}}await Review.create({productId,name,rating,comment,originalComment:comment,publishedComment:comment,status:'pending',approved:false,verifiedPurchase,verifiedOrderNumber});res.status(201).json({success:true,verifiedPurchase,message:verifiedPurchase?'تم استلام تقييمك كمشتري موثّق وسيظهر بعد المراجعة':'تم استلام تقييمك وسيظهر بعد مراجعته من إدارة المتجر'});}catch(err){res.status(500).json({message:'تعذر إرسال التقييم'});}});

app.post('/api/stock-notify', publicWriteLimiter, async (req,res)=>{try{await ensureDBConnection();const product=await Product.findById(req.body?.productId).select('title stockQuantity');if(!product)return res.status(404).json({message:'المنتج غير موجود'});const phone=normalizePhoneNumber(req.body?.phone);if(!phone)return res.status(400).json({message:'رقم الهاتف مطلوب'});const name=sanitizePlainText(req.body?.name,80);await StockNotify.findOneAndUpdate({productId:product._id,phone,status:'waiting'},{$set:{productTitle:product.title,name,createdAt:new Date()}},{upsert:true,new:true});res.json({success:true,message:'تم تسجيل طلب التنبيه عند توفر المنتج'});}catch(err){res.status(500).json({message:'تعذر تسجيل طلب التنبيه'});}});

// V8 admin: coupons, reviews and stock notifications
app.get('/api/admin/coupons', requireAdminAuth, requireAnyPermission('manage_settings','manage_marketing'), async(req,res)=>{res.json(await Coupon.find().sort({createdAt:-1}).lean());});
app.post('/api/admin/coupons', requireAdminAuth, requireAnyPermission('manage_settings','manage_marketing'), async(req,res)=>{try{const code=sanitizePlainText(req.body?.code,40).toUpperCase();if(!code)return res.status(400).json({message:'كود الخصم مطلوب'});const doc=await Coupon.create({code,type:req.body?.type==='fixed'?'fixed':'percent',value:Math.max(0,Number(req.body?.value)||0),minSubtotal:Math.max(0,Number(req.body?.minSubtotal)||0),maxDiscount:Math.max(0,Number(req.body?.maxDiscount)||0),startsAt:parseOptionalDate(req.body?.startsAt),endsAt:parseOptionalDate(req.body?.endsAt),usageLimit:Math.max(0,Math.floor(Number(req.body?.usageLimit)||0)),enabled:req.body?.enabled!==false});await logActivity('إضافة كوبون',`تم إضافة كوبون ${code}`,req.adminUser.username);res.status(201).json(doc);}catch(err){res.status(400).json({message:err.code===11000?'كود الخصم موجود بالفعل':err.message});}});
app.put('/api/admin/coupons/:id', requireAdminAuth, requireAnyPermission('manage_settings','manage_marketing'), async(req,res)=>{try{const update={};['code','type','value','minSubtotal','maxDiscount','usageLimit','enabled'].forEach(k=>{if(req.body?.[k]!==undefined)update[k]=req.body[k]});if(update.code)update.code=sanitizePlainText(update.code,40).toUpperCase();if(update.type&&!['percent','fixed'].includes(update.type))update.type='percent';['value','minSubtotal','maxDiscount','usageLimit'].forEach(k=>{if(update[k]!==undefined)update[k]=Math.max(0,Number(update[k])||0)});if(req.body?.startsAt!==undefined)update.startsAt=parseOptionalDate(req.body.startsAt)||null;if(req.body?.endsAt!==undefined)update.endsAt=parseOptionalDate(req.body.endsAt)||null;const doc=await Coupon.findByIdAndUpdate(req.params.id,update,{new:true});if(!doc)return res.status(404).json({message:'الكوبون غير موجود'});res.json(doc);}catch(err){res.status(400).json({message:err.message});}});
app.delete('/api/admin/coupons/:id', requireAdminAuth, requireAnyPermission('manage_settings','manage_marketing'), async(req,res)=>{await Coupon.findByIdAndDelete(req.params.id);res.json({success:true});});
app.get('/api/admin/reviews', requireAdminAuth, requireAnyPermission('manage_settings','manage_marketing'), async(req,res)=>{try{const filter={};const status=sanitizePlainText(req.query?.status,20);const search=sanitizePlainText(req.query?.search,100);if(status&&['pending','published','rejected','hidden'].includes(status)){if(status==='published')filter.$or=[{status:'published'},{status:{$exists:false},approved:true}];else filter.status=status;}if(search)filter.$and=[{$or:[{name:{$regex:escapeRegexLiteral(search),$options:'i'}},{comment:{$regex:escapeRegexLiteral(search),$options:'i'}},{originalComment:{$regex:escapeRegexLiteral(search),$options:'i'}},{publishedComment:{$regex:escapeRegexLiteral(search),$options:'i'}}]}];const reviews=await Review.find(filter).populate('productId','title image sku').sort({createdAt:-1}).limit(500).lean();res.json(reviews.map(r=>({...r,status:r.status||(r.approved?'published':'pending'),originalComment:r.originalComment||r.comment||'',publishedComment:r.publishedComment||r.comment||''})));}catch(err){res.status(500).json({message:'تعذر تحميل التقييمات'});}});
app.put('/api/admin/reviews/:id', requireAdminAuth, requireAnyPermission('manage_settings','manage_marketing'), async(req,res)=>{try{const doc=await Review.findById(req.params.id);if(!doc)return res.status(404).json({message:'التقييم غير موجود'});const allowed=['pending','published','rejected','hidden'];let status=allowed.includes(req.body?.status)?req.body.status:null;if(req.body?.approved!==undefined&&!status)status=req.body.approved?'published':'hidden';if(req.body?.publishedComment!==undefined)doc.publishedComment=sanitizePlainText(req.body.publishedComment,800);if(!doc.originalComment)doc.originalComment=doc.comment||'';if(req.body?.storeReply!==undefined)doc.storeReply=sanitizePlainText(req.body.storeReply,800);if(status){doc.status=status;doc.approved=status==='published';}doc.moderatedBy=req.adminUser?.username||'';doc.moderatedAt=new Date();doc.updatedAt=new Date();await doc.save();await logActivity('مراجعة تقييم',`${doc.name} → ${doc.status}`,req.adminUser.username);res.json(doc);}catch(err){res.status(500).json({message:'تعذر تحديث التقييم'});}});
app.delete('/api/admin/reviews/:id', requireAdminAuth, requireAnyPermission('manage_settings','manage_marketing'), async(req,res)=>{const doc=await Review.findById(req.params.id);if(doc)await logActivity('حذف تقييم',`${doc.name} — ${doc.productId}`,req.adminUser.username);await Review.findByIdAndDelete(req.params.id);res.json({success:true});});
app.get('/api/admin/stock-notify', requireAdminAuth, requireAnyPermission('manage_settings','manage_marketing'), async(req,res)=>{res.json(await StockNotify.find().sort({createdAt:-1}).limit(500).lean());});
app.put('/api/admin/stock-notify/:id', requireAdminAuth, requireAnyPermission('manage_settings','manage_marketing'), async(req,res)=>{const status=['waiting','notified','cancelled'].includes(req.body?.status)?req.body.status:'waiting';const doc=await StockNotify.findByIdAndUpdate(req.params.id,{status,notifiedAt:status==='notified'?new Date():null},{new:true});res.json(doc);});
app.delete('/api/admin/stock-notify/:id', requireAdminAuth, requireAnyPermission('manage_settings','manage_marketing'), async(req,res)=>{await StockNotify.findByIdAndDelete(req.params.id);res.json({success:true});});

// جلب كل الأقسام
app.get('/api/categories', async (req, res) => {
  await ensureDBConnection();
  try {
    const categories = await Category.find().sort({ createdAt: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء جلب الأقسام', error: err.message });
  }
});

// إضافة قسم جديد
app.post('/api/categories', requireAdminAuth, requirePermission('manage_categories'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'اسم القسم مطلوب' });
    
    const existing = await Category.findOne({ name });
    if (existing) return res.status(400).json({ message: 'هذا القسم موجود بالفعل' });
    
    const newCategory = new Category({ name });
    await newCategory.save();
    await logActivity('إضافة قسم', `تم إضافة قسم جديد باسم: ${name}`, req.adminUser.username);
    res.status(201).json(newCategory);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء إضافة القسم', error: err.message });
  }
});

// حذف قسم
app.delete('/api/categories/:name', requireAdminAuth, requirePermission('manage_categories'), async (req, res) => {
  try {
    const { name } = req.params;
    await Category.findOneAndDelete({ name });
    await logActivity('حذف قسم', `تم حذف القسم: ${name}`, req.adminUser.username);
    res.json({ message: 'تم حذف القسم بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء حذف القسم', error: err.message });
  }
});

// تعديل اسم قسم وتحديث كل منتجاته
app.put('/api/categories/rename', requireAdminAuth, requirePermission('manage_categories'), async (req, res) => {
  try {
    const { oldCategory, newCategory } = req.body;
    if (!oldCategory || !newCategory) {
      return res.status(400).json({ message: 'الرجاء إرسال الاسم القديم والجديد للقسم' });
    }

    // تحديث في جدول الأقسام
    await Category.findOneAndUpdate({ name: oldCategory }, { name: newCategory });

    // تحديث في جدول المنتجات
    const result = await Product.updateMany(
      { category: oldCategory },
      { $set: { category: newCategory } }
    );
    await logActivity('تعديل قسم', `تم تغيير اسم القسم من "${oldCategory}" إلى "${newCategory}"`, req.adminUser.username);
    res.json({ 
      message: `تم تحديث اسم القسم بنجاح من "${oldCategory}" إلى "${newCategory}"`,
      modifiedCount: result.modifiedCount 
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تعديل اسم القسم', error: err.message });
  }
});

// --- Backup & Restore ---

// 1. Export Data (Backup)
app.get('/api/backup', requireAdminAuth, requirePermission('manage_backup'), async (req, res) => {
  try {
    const backupData = await buildV9BackupData();
    res.setHeader('Content-disposition', 'attachment; filename=technology-store-backup.json');
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(backupData, null, 2));
    logActivity('تحميل نسخة احتياطية', 'تم تنزيل نسخة احتياطية V9 كاملة', req.adminUser.username).catch(() => null);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء إنشاء النسخة الاحتياطية', error: err.message });
  }
});

// 2. Import Data (Restore)
app.post('/api/restore', requireAdminAuth, requirePermission('manage_backup'), async (req, res) => {
  try {
    if (!req.files || !req.files.backupFile) return res.status(400).json({ message: 'الرجاء إرفاق ملف النسخة الاحتياطية' });
    const file = req.files.backupFile; const fileContent = fs.readFileSync(file.tempFilePath, 'utf8'); const backupData = JSON.parse(fileContent);
    if (!backupData.categories || !backupData.products || !backupData.settings) return res.status(400).json({ message: 'ملف غير صالح أو تالف' });
    const products = (backupData.products || []).map(p => ({...p,image:p.image||'/assets/no-image.svg',category:p.category||'غير مصنف'}));
    await Promise.all([Category.deleteMany({}), Product.deleteMany({}), Settings.deleteMany({}), Order.deleteMany({}), Analytics.deleteMany({}), Coupon.deleteMany({}), Review.deleteMany({}), StockNotify.deleteMany({}), ReturnRequest.deleteMany({})]);
    if (backupData.categories?.length) await Category.insertMany(backupData.categories);
    if (products.length) await Product.insertMany(products);
    if (backupData.settings?.length) await Settings.insertMany(backupData.settings);
    if (backupData.orders?.length) await Order.insertMany(backupData.orders);
    if (backupData.analytics?.length) await Analytics.insertMany(backupData.analytics);
    if (backupData.coupons?.length) await Coupon.insertMany(backupData.coupons);
    if (backupData.reviews?.length) await Review.insertMany(backupData.reviews);
    if (backupData.stockNotify?.length) await StockNotify.insertMany(backupData.stockNotify);
    if (backupData.returns?.length) await ReturnRequest.insertMany(backupData.returns);
    await logActivity('استعادة نسخة احتياطية', `تم استعادة نسخة V${backupData.backupVersion || 2}`, req.adminUser.username);
    res.json({ message: 'تم استعادة النسخة الاحتياطية بنجاح!' });
  } catch (err) { console.error('RESTORE ERROR:', err); res.status(500).json({ message: 'خطأ أثناء استعادة النسخة الاحتياطية', error: err.message }); }
});

// --- الـ API Routes ---

// 1. جلب المنتجات (محمية مع دعم allowDiskUse و Pagination لمنع الـ Memory Limit)
app.get('/api/products', optionalAdminAuth, async (req, res) => {
  try {
    await ensureDBConnection();
    const productFilter = req.adminUser ? {} : { isHidden: { $ne: true } };
    let query = Product.find(productFilter)
      .sort({ createdAt: -1 })
      .limit(3000);

    // Public visitors must never receive the legacy/internal brand field because
    // some existing records contain supplier names. Admins still receive it for
    // backwards compatibility and data preservation.
    if (!req.adminUser) {
      // Send only fields used by the public storefront. This keeps mobile payloads small
      // and also guarantees internal supplier/Cloudinary management fields stay private.
      query = query.select('title category price oldPrice description image additionalImages.url stockQuantity sku posItemId warranty publicBrand discountExpiresAt createdAt isFeatured customBadge tags seoTitle seoDescription variants');
    }

    const products = await query.lean();
    if (!req.adminUser && products.length) {
      topProductsCache = { data: products.slice(0, 4), timestamp: Date.now() };
    }
    res.json(products);
  } catch (error) {
    console.error('GET /api/products error:', error);
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
});


// Read-only live availability endpoint. The website can verify the latest POS-synced stock
// before adding/increasing cart quantity, but it never changes stock itself.
app.get('/api/products/:id/availability', async (req, res) => {
  try {
    await ensureDBConnection();
    const product = await Product.findOne({ _id: req.params.id, isHidden: { $ne: true } })
      .select('stockQuantity variants.label variants.value variants.sku variants.stockQuantity lastSyncedAt')
      .lean();
    if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      productId: String(product._id),
      stockQuantity: Math.max(0, Number(product.stockQuantity) || 0),
      lastSyncedAt: product.lastSyncedAt || null,
      variants: (product.variants || []).map(v => ({
        label: v.label || 'الخيار',
        value: v.value || '',
        sku: v.sku || '',
        stockQuantity: Math.max(0, Number(v.stockQuantity) || 0)
      }))
    });
  } catch (err) {
    res.status(500).json({ message: 'تعذر التحقق من الكمية الحالية' });
  }
});


// --- مسار الطوارئ لتنظيف قاعدة البيانات من المنتجات الوهمية (Emergency Cleanup) ---
const handleEmergencyClean = async (req, res) => {
  try {
    const settings = await Settings.findOne();
    const defaultImg = settings && settings.defaultProductImage ? settings.defaultProductImage : '';

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // حذف أي منتج ليس له صورة حقيقية أو ليس له قسم محدد للعودة للمنتجات الأصلية
    const deleteFilter = {
      $or: [
        { image: { $exists: false } },
        { image: null },
        { image: "" },
        { image: { $regex: /placehold\.co|no-image|No\+Image/i } },
        { category: { $exists: false } },
        { category: null },
        { category: "" },
        { category: "غير مصنف" },
        ...(defaultImg ? [{ image: defaultImg }] : [])
      ]
    };

    const deleteResult = await Product.deleteMany(deleteFilter);
    const remainingCount = await Product.countDocuments();

    res.json({
      ok: true,
      message: `تم تنظيف قاعدة البيانات بنجاح. تم حذف ${deleteResult.deletedCount} منتج وهمي.`,
      deletedCount: deleteResult.deletedCount,
      remainingCount: remainingCount
    });
  } catch (err) {
    console.error('Emergency Clean Error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

// مسار الطوارئ - محمي بمفتاح سري في الـ header
app.delete('/api/emergency-clean', requireAdminAuth, requirePermission('manage_backup'), handleEmergencyClean);


// 2. إضافة منتج جديد مع رفع الصور
app.post('/api/products', requireAdminAuth, requirePermission('add_product'), async (req, res) => {
  try {
    const { title, category, price, oldPrice, description, stockQuantity, sku, warranty, publicBrand, discountExpiresAt, isFeatured, customBadge, tags, seoTitle, seoDescription, variants } = req.body;
    if (!title || !category || !price) {
      return res.status(400).json({ message: 'البيانات الأساسية (الاسم، القسم، السعر) مطلوبة' });
    }

    let image = '';
    let imagePublicId = '';
    const additionalImages = [];

    if (req.files && req.files.images) {
      const uploadedFiles = validateImageFiles(req.files.images);

      const mainResult = await cloudinary.uploader.upload(uploadedFiles[0].tempFilePath, {
        folder: 'technology_store',
        format: 'webp',
        quality: 'auto'
      });
      image = mainResult.secure_url;
      imagePublicId = mainResult.public_id;

      for (let i = 1; i < uploadedFiles.length; i++) {
        const result = await cloudinary.uploader.upload(uploadedFiles[i].tempFilePath, {
          folder: 'technology_store',
          format: 'webp',
          quality: 'auto'
        });
        additionalImages.push({ url: result.secure_url, publicId: result.public_id });
      }
    } else {
      const settings = await getOrCreateSettings();
      image = settings.defaultProductImage || '/assets/no-image.svg';
    }

    const descArray = description ? description.split('\n').filter(line => line.trim() !== '') : [];
    const normalizedVariants = normalizeVariants(variants);
    const effectiveStock = normalizedVariants.length ? normalizedVariants.reduce((sum, v) => sum + Math.max(0, Number(v.stockQuantity) || 0), 0) : (stockQuantity ? parseInt(stockQuantity, 10) : 1);

    const newProduct = new Product({
      title,
      category,
      price,
      oldPrice: oldPrice ? Number(oldPrice) : undefined,
      description: descArray,
      image: image,
      imagePublicId: imagePublicId,
      additionalImages: additionalImages,
      stockQuantity: effectiveStock,
      sku: sku || '',
      warranty: warranty || '',
      publicBrand: publicBrand || '',
      discountExpiresAt: discountExpiresAt ? new Date(discountExpiresAt) : undefined,
      isFeatured: parseBool(isFeatured),
      customBadge: sanitizePlainText(customBadge, 40),
      tags: normalizeStringList(tags, 20),
      seoTitle: sanitizePlainText(seoTitle, 70),
      seoDescription: sanitizePlainText(seoDescription, 180),
      variants: normalizedVariants
    });

    await newProduct.save();
    await logActivity('إضافة منتج', `تم إضافة منتج جديد: ${title}`, req.adminUser.username);
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : 'خطأ أثناء إضافة المنتج', error: err.message });
  }
});

// إضافة/تحديث منتجات متعددة (Bulk CSV Upsert)
app.post('/api/products/bulk', requireAdminAuth, requirePermission('manage_backup'), async (req, res) => {
  try {
    const productsArray = req.body;
    if (!Array.isArray(productsArray) || productsArray.length === 0) {
      return res.status(400).json({ message: 'بيانات غير صالحة، يجب إرسال مصفوفة منتجات.' });
    }

    const operations = productsArray.map(p => {
      const filter = p.sku ? { sku: p.sku } : { title: p.name || 'بدون اسم' };
      const update = {
        title: p.name || 'بدون اسم',
        category: p.category || 'أخرى',
        price: Number(p.price) || 0,
        oldPrice: p.oldPrice ? Number(p.oldPrice) : undefined,
        description: p.description ? p.description.split('\n') : [],
        stockQuantity: Number(p.stockQuantity) || 0,
        sku: p.sku || '',
        publicBrand: p.publicBrand || '',
        warranty: p.warranty || '',
        isFeatured: parseBool(p.isFeatured),
        customBadge: sanitizePlainText(p.customBadge, 40),
        tags: normalizeStringList(p.tags, 20),
        seoTitle: sanitizePlainText(p.seoTitle, 70),
        seoDescription: sanitizePlainText(p.seoDescription, 180)
      };

      // لا تكتب Placeholder فوق صورة موجودة عند استيراد CSV بدون عمود image.
      const incomingImage = typeof p.image === 'string' ? p.image.trim() : '';
      if (incomingImage) update.image = incomingImage;

      return {
        updateOne: {
          filter,
          update: {
            $set: update,
            $setOnInsert: { image: incomingImage || '/assets/no-image.svg' }
          },
          upsert: true
        }
      };
    });

    const result = await Product.bulkWrite(operations);
    const count = (result.upsertedCount || 0) + (result.modifiedCount || 0);
    await logActivity('استيراد منتجات', `تم استيراد/تحديث ${count} منتج من ملف CSV`, req.adminUser.username);
    res.status(201).json({ message: 'تم استيراد/تحديث المنتجات بنجاح', count, upserted: result.upsertedCount || 0, modified: result.modifiedCount || 0 });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء استيراد المنتجات', error: err.message });
  }
});

// 3. تعديل كمية المخزون
app.put('/api/products/:id/quantity', requireAdminAuth, requirePermission('edit_product'), async (req, res) => {
  try {
    const { stockQuantity } = req.body;
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { stockQuantity: parseInt(stockQuantity, 10) || 0 },
      { new: true }
    );
    if (!updatedProduct) return res.status(404).json({ message: 'المنتج غير موجود' });
    await logActivity('تعديل كمية', `تم تحديث مخزون المنتج "${updatedProduct.title}" ليصبح ${stockQuantity}`, req.adminUser.username);
    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تحديث الكمية', error: err.message });
  }
});

// 4. تعديل منتج بالكامل (يدعم رفع صور جديدة)
app.put('/api/products/:id', requireAdminAuth, requirePermission('edit_product'), async (req, res) => {
  try {
    const { title, category, price, oldPrice, description, stockQuantity, sku, warranty, publicBrand, discountExpiresAt, isFeatured, customBadge, tags, seoTitle, seoDescription, variants } = req.body;
    const descArray = description ? description.split('\n').filter(line => line.trim() !== '') : [];
    const normalizedVariants = normalizeVariants(variants);
    const effectiveStock = normalizedVariants.length ? normalizedVariants.reduce((sum, v) => sum + Math.max(0, Number(v.stockQuantity) || 0), 0) : (parseInt(stockQuantity, 10) || 0);
    
    const updateData = {
      title,
      category,
      price,
      oldPrice: oldPrice ? Number(oldPrice) : null,
      description: descArray,
      stockQuantity: effectiveStock,
      sku: sku || '',
      warranty: warranty || '',
      publicBrand: publicBrand || '',
      isFeatured: parseBool(isFeatured),
      customBadge: sanitizePlainText(customBadge, 40),
      tags: normalizeStringList(tags, 20),
      seoTitle: sanitizePlainText(seoTitle, 70),
      seoDescription: sanitizePlainText(seoDescription, 180),
      variants: normalizedVariants
    };

    if (discountExpiresAt !== undefined) {
      updateData.discountExpiresAt = discountExpiresAt ? new Date(discountExpiresAt) : null;
    }

    // حذف صور مخصصة (إذا اختار المستخدم حذف صور معينة)
    if (req.body.imagesToDelete) {
      let idsToDelete = [];
      try { idsToDelete = JSON.parse(req.body.imagesToDelete); } catch(e) {}

      if (idsToDelete.length > 0) {
        const oldProduct = await Product.findById(req.params.id);
        if (oldProduct) {
          // حذف من Cloudinary فقط عندما يكون لدينا public_id حقيقي.
          for (const pid of idsToDelete) {
            if (!pid || pid === 'main' || String(pid).startsWith('main_') || String(pid).startsWith('legacy_add_')) continue;
            try { await cloudinary.uploader.destroy(pid); } catch(e) {}
          }

          // هل الصورة الأساسية ضمن المحذوفة؟ (يدعم المنتجات القديمة بدون imagePublicId)
          const legacyMainId = `main_${oldProduct._id}`;
          const mainDeleted = idsToDelete.includes(oldProduct.imagePublicId) || idsToDelete.includes('main') || idsToDelete.includes(legacyMainId);

          // تصفية الصور الإضافية المتبقية، بما فيها الصور القديمة التي ليس لها publicId.
          const remainingAdditional = (oldProduct.additionalImages || []).filter((img, index) => {
            const imageId = img.publicId || `legacy_add_${index}`;
            return !idsToDelete.includes(imageId);
          });

          if (mainDeleted) {
            // ترقية أول صورة إضافية متبقية لتكون الأساسية
            if (remainingAdditional.length > 0) {
              const promoted = remainingAdditional.shift();
              updateData.image = promoted.url;
              updateData.imagePublicId = promoted.publicId;
              updateData.additionalImages = remainingAdditional;
            } else {
              updateData.image = '';
              updateData.imagePublicId = '';
              updateData.additionalImages = [];
            }
          } else {
            updateData.additionalImages = remainingAdditional;
          }
        }
      }
    }

    // تطبيق الترتيب وتغيير الصورة الأساسية من الواجهة
    if (req.body.updatedImage !== undefined && req.body.updatedImage !== '') {
      updateData.image = req.body.updatedImage;
      updateData.imagePublicId = req.body.updatedImagePublicId || '';
    }
    if (req.body.updatedAdditionalImages !== undefined) {
      try {
        let addImgs = JSON.parse(req.body.updatedAdditionalImages);
        if (Array.isArray(addImgs)) {
          updateData.additionalImages = addImgs;
        }
      } catch(e) {}
    }

    // إذا تم رفع صور جديدة (إضافتها للصور الحالية)
    if (req.files && (req.files.image || req.files.images)) {
      const uploadedFiles = validateImageFiles(req.files.images || req.files.image);

      const currentProduct = await Product.findById(req.params.id);
      const currentImage = String(currentProduct?.image || '');
      const isPlaceholder = !currentImage || /placehold\.co|no-image|No\+Image/i.test(currentImage);
      const hasMainImage = updateData.image || (currentProduct && currentProduct.image);

      if (!hasMainImage || isPlaceholder || req.body.replaceMain === 'true') {
        const oldMainUrl = updateData.image || currentProduct?.image;
        const oldMainPublicId = updateData.imagePublicId || currentProduct?.imagePublicId;

        // لا توجد صورة أساسية أو طلب المستخدم استبدالها → أول صورة جديدة تصبح الأساسية
        const mainResult = await cloudinary.uploader.upload(uploadedFiles[0].tempFilePath, {
          folder: 'technology_store',
          format: 'webp',
          quality: 'auto'
        });
        updateData.image = mainResult.secure_url;
        updateData.imagePublicId = mainResult.public_id;

        // باقي الصور تكون إضافية
        const newAdditional = updateData.additionalImages || currentProduct?.additionalImages || [];
        
        // إذا كنا نستبدل الصورة الأساسية القديمة، ننقلها للصور الإضافية (إلا إذا تم حذفها)
        if (req.body.replaceMain === 'true' && oldMainUrl && !isPlaceholder) {
            let idsToDelete = [];
            try { idsToDelete = JSON.parse(req.body.imagesToDelete); } catch(e) {}
            if (!idsToDelete.includes(oldMainPublicId) && !idsToDelete.includes('main')) {
                newAdditional.push({ url: oldMainUrl, publicId: oldMainPublicId });
            }
        }

        for (let i = 1; i < uploadedFiles.length; i++) {
          const result = await cloudinary.uploader.upload(uploadedFiles[i].tempFilePath, {
            folder: 'technology_store',
            format: 'webp',
            quality: 'auto'
          });
          newAdditional.push({ url: result.secure_url, publicId: result.public_id });
        }
        updateData.additionalImages = newAdditional;
      } else {
        // توجد صورة أساسية → كل الصور الجديدة تُضاف كإضافية
        const existingAdditional = updateData.additionalImages || currentProduct?.additionalImages || [];
        for (let i = 0; i < uploadedFiles.length; i++) {
          const result = await cloudinary.uploader.upload(uploadedFiles[i].tempFilePath, {
            folder: 'technology_store',
            format: 'webp',
            quality: 'auto'
          });
          existingAdditional.push({ url: result.secure_url, publicId: result.public_id });
        }
        updateData.additionalImages = existingAdditional;
      }
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    if (!updatedProduct) return res.status(404).json({ message: 'المنتج غير موجود' });
    await logActivity('تعديل منتج', `تم تعديل بيانات المنتج: ${updatedProduct.title}`, req.adminUser.username);
    res.json(updatedProduct);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : 'خطأ أثناء تحديث المنتج', error: err.message });
  }
});

// 5. تبديل حالة إخفاء/إظهار منتج
app.put('/api/products/:id/toggle-visibility', requireAdminAuth, requirePermission('edit_product'), async (req, res) => {
  try {
    const { isHidden } = req.body;
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { isHidden: isHidden === true, visibilityManuallySet: true },
      { new: true }
    );
    if (!updatedProduct) return res.status(404).json({ message: 'المنتج غير موجود' });
    
    await logActivity(isHidden ? 'إخفاء منتج' : 'إظهار منتج', `تم ${isHidden ? 'إخفاء' : 'إظهار'} المنتج: ${updatedProduct.title}`, req.adminUser.username);
    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تغيير حالة المنتج', error: err.message });
  }
});

// 6. حذف منتج نهائياً وحذف صوره من Cloudinary
app.delete('/api/products/:id', requireAdminAuth, requirePermission('delete_product'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });

    // حذف الصورة الأساسية من كلاوديناري
    if (product.imagePublicId) {
      await cloudinary.uploader.destroy(product.imagePublicId);
    }
    
    // حذف الصور الإضافية من كلاوديناري
    if (product.additionalImages && product.additionalImages.length > 0) {
      for (const img of product.additionalImages) {
        if (img.publicId) await cloudinary.uploader.destroy(img.publicId);
      }
    }

    await Product.findByIdAndDelete(req.params.id);
    await logActivity('حذف منتج', `تم حذف المنتج: ${product.title}`, req.adminUser.username);
    res.json({ message: 'تم حذف المنتج وصوره بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء حذف المنتج', error: err.message });
  }
});

// --- الـ API Routes الخاصة بإعدادات المتجر ---

// 1. جلب الإعدادات
app.get('/api/settings', optionalAdminAuth, async (req, res) => {
  try {
    await ensureDBConnection();
    const settings = await getOrCreateSettings();
    const data = settings.toObject();
    // V9: لا نرسل نص إشعار تتبع للواجهة العامة ولا نعرض أي popup للعميل.
    delete data.privacyNotice;
    const permissions = Array.isArray(req.adminUser?.permissions) ? req.adminUser.permissions : [];
    const canViewPrivateSettings = permissions.includes('all') || permissions.includes('manage_settings');
    if (!canViewPrivateSettings) {
      delete data.posApiKey;
      delete data.promoBannerImagePublicId;
    }
    const isPushConfigured = pushConfigured();
    data.pushAvailable = Boolean(isPushConfigured);
    data.pushPublicKey = isPushConfigured ? String(process.env.VAPID_PUBLIC_KEY || '').trim() : '';
    data.promoBannerActive = Boolean(data.promoBannerEnabled && isWindowActive(data.promoBannerStartsAt, data.promoBannerEndsAt));
    data.seasonalEffectActive = Boolean(data.seasonalEffectEnabled && data.seasonalEffect !== 'off' && isWindowActive(data.seasonalEffectStartsAt, data.seasonalEffectEndsAt));
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الإعدادات', error: err.message });
  }
});


// 2. تحديث الإعدادات العامة (الصور، تفعيل الشحن، الخ)
app.post('/api/settings', requireAdminAuth, requirePermission('manage_settings'), async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    let updated = false;
    let logMessage = '';

    // رفع اللوجو الخاص بالمتجر
    if (req.files && req.files.storeLogo) {
      const [storeLogoFile] = validateImageFiles(req.files.storeLogo);
      const result = await cloudinary.uploader.upload(storeLogoFile.tempFilePath, {
        folder: 'technology_store_settings',
        format: 'webp',
        quality: 'auto'
      });
      settings.storeLogo = result.secure_url;
      updated = true;
      logMessage = logMessage ? logMessage + ' ولوجو المتجر' : 'تحديث لوجو المتجر';
    }

    if (req.files && req.files.defaultProductImage) {
      const [defaultProductImageFile] = validateImageFiles(req.files.defaultProductImage);
      const result = await cloudinary.uploader.upload(defaultProductImageFile.tempFilePath, {
        folder: 'technology_store_settings',
        format: 'webp',
        quality: 'auto'
      });
      settings.defaultProductImage = result.secure_url;
      updated = true;
      logMessage = 'تحديث اللوجو الافتراضي';
    }

    if (req.files && req.files.lightHeroImage) {
      const [lightHeroImageFile] = validateImageFiles(req.files.lightHeroImage);
      const result = await cloudinary.uploader.upload(lightHeroImageFile.tempFilePath, {
        folder: 'technology_store_settings',
        format: 'webp',
        quality: 'auto'
      });
      settings.lightHeroImage = result.secure_url;
      updated = true;
      logMessage = logMessage ? logMessage + ' وخلفية الفاتح' : 'تحديث خلفية الوضع الفاتح';
    }

    if (req.files && req.files.darkHeroImage) {
      const [darkHeroImageFile] = validateImageFiles(req.files.darkHeroImage);
      const result = await cloudinary.uploader.upload(darkHeroImageFile.tempFilePath, {
        folder: 'technology_store_settings',
        format: 'webp',
        quality: 'auto'
      });
      settings.darkHeroImage = result.secure_url;
      updated = true;
      logMessage = logMessage ? logMessage + ' وخلفية الغامق' : 'تحديث خلفية الوضع الغامق';
    }

    if (req.files && req.files.promoBannerImage) {
      const [promoBannerFile] = validateImageFiles(req.files.promoBannerImage);
      const oldPublicId = settings.promoBannerImagePublicId;
      const result = await cloudinary.uploader.upload(promoBannerFile.tempFilePath, {
        folder: 'technology_store_settings', format: 'webp', quality: 'auto'
      });
      settings.promoBannerImage = result.secure_url;
      settings.promoBannerImagePublicId = result.public_id;
      updated = true;
      logMessage = logMessage ? logMessage + ' وبانر العروض' : 'تحديث بانر العروض';
      if (oldPublicId && oldPublicId !== result.public_id) cloudinary.uploader.destroy(oldPublicId).catch(() => {});
    }

    if (req.body && req.body.isShippingEnabled !== undefined) {
      settings.isShippingEnabled = req.body.isShippingEnabled === 'true' || req.body.isShippingEnabled === true;
      updated = true;
      logMessage = logMessage ? logMessage + ' وإعدادات الشحن' : `تم ${settings.isShippingEnabled ? 'تفعيل' : 'إيقاف'} الشحن`;
    }

    if (req.body && req.body.pickupEnabled !== undefined) { settings.pickupEnabled = parseBool(req.body.pickupEnabled); updated = true; }
    if (req.body && req.body.freeShippingThreshold !== undefined) { settings.freeShippingThreshold = Math.max(0, Number(req.body.freeShippingThreshold) || 0); updated = true; }
    if (req.body && req.body.shippingInstructions !== undefined) { settings.shippingInstructions = sanitizePlainText(req.body.shippingInstructions, 500); updated = true; }
    if (req.body && req.body.paymentCashOnDelivery !== undefined) { settings.paymentCashOnDelivery = parseBool(req.body.paymentCashOnDelivery); updated = true; }
    if (req.body && req.body.paymentInstapay !== undefined) { settings.paymentInstapay = parseBool(req.body.paymentInstapay); updated = true; }
    if (req.body && req.body.paymentStorePickup !== undefined) { settings.paymentStorePickup = parseBool(req.body.paymentStorePickup); updated = true; }
    if (req.body && req.body.instapayHandle !== undefined) { settings.instapayHandle = sanitizePlainText(req.body.instapayHandle, 120); updated = true; }
    if (req.body && req.body.shippingZones !== undefined) {
      let zones = req.body.shippingZones;
      if (typeof zones === 'string') { try { zones = JSON.parse(zones); } catch (_) { zones = []; } }
      if (!Array.isArray(zones)) zones = [];
      settings.shippingZones = zones.slice(0, 100).map(z => ({
        name: sanitizePlainText(z?.name, 100), governorate: sanitizePlainText(z?.governorate || z?.name, 100),
        fee: Math.max(0, Number(z?.fee) || 0), eta: sanitizePlainText(z?.eta, 80), enabled: z?.enabled !== false
      })).filter(z => z.name);
      updated = true;
    }

    if (req.body && req.body.posApiKey !== undefined) {
      settings.posApiKey = String(req.body.posApiKey).trim();
      updated = true;
      logMessage = logMessage ? logMessage + ' ومفتاح الـ POS' : 'تم تحديث مفتاح ربط الـ POS';
    }

    if (req.body && req.body.isCrossSellEnabled !== undefined) {
      settings.isCrossSellEnabled = req.body.isCrossSellEnabled === 'true' || req.body.isCrossSellEnabled === true;
      updated = true;
    }

    if (req.body && req.body.isQuickBuyEnabled !== undefined) {
      settings.isQuickBuyEnabled = req.body.isQuickBuyEnabled === 'true' || req.body.isQuickBuyEnabled === true;
      updated = true;
    }

    if (req.body && req.body.isPixelEnabled !== undefined) {
      settings.isPixelEnabled = req.body.isPixelEnabled === 'true' || req.body.isPixelEnabled === true;
      updated = true;
    }

    if (req.body && req.body.fbPixelId !== undefined) {
      settings.fbPixelId = String(req.body.fbPixelId).trim();
      updated = true;
    }

    if (req.body && req.body.whatsappNumber !== undefined) {
      const normalized = normalizePhoneNumber(req.body.whatsappNumber);
      if (!normalized || normalized.length < 8) return res.status(400).json({ message: 'رقم واتساب غير صالح' });
      settings.whatsappNumber = normalized;
      updated = true;
      logMessage = logMessage ? logMessage + ' وروابط التواصل' : 'تحديث روابط التواصل';
    }
    if (req.body && req.body.whatsappChannelUrl !== undefined) {
      const url = normalizePublicUrl(req.body.whatsappChannelUrl, ['whatsapp.com']);
      if (!url && String(req.body.whatsappChannelUrl || '').trim()) return res.status(400).json({ message: 'رابط قناة واتساب غير صالح' });
      settings.whatsappChannelUrl = url;
      updated = true;
    }
    if (req.body && req.body.facebookUrl !== undefined) {
      const url = normalizePublicUrl(req.body.facebookUrl, ['facebook.com', 'fb.com']);
      if (!url && String(req.body.facebookUrl || '').trim()) return res.status(400).json({ message: 'رابط فيسبوك غير صالح' });
      settings.facebookUrl = url;
      updated = true;
    }
    if (req.body && req.body.instagramUrl !== undefined) {
      const url = normalizePublicUrl(req.body.instagramUrl, ['instagram.com']);
      if (!url && String(req.body.instagramUrl || '').trim()) return res.status(400).json({ message: 'رابط إنستجرام غير صالح' });
      settings.instagramUrl = url;
      updated = true;
    }
    if (req.body && req.body.telegramUrl !== undefined) {
      const url = normalizePublicUrl(req.body.telegramUrl, ['t.me', 'telegram.me']);
      if (!url && String(req.body.telegramUrl || '').trim()) return res.status(400).json({ message: 'رابط تليجرام غير صالح' });
      settings.telegramUrl = url;
      updated = true;
    }
    if (req.body && req.body.tiktokUrl !== undefined) {
      const url = normalizePublicUrl(req.body.tiktokUrl, ['tiktok.com']);
      if (!url && String(req.body.tiktokUrl || '').trim()) return res.status(400).json({ message: 'رابط TikTok غير صالح' });
      settings.tiktokUrl = url;
      updated = true;
    }
    if (req.body && req.body.xUrl !== undefined) {
      const url = normalizePublicUrl(req.body.xUrl, ['x.com', 'twitter.com']);
      if (!url && String(req.body.xUrl || '').trim()) return res.status(400).json({ message: 'رابط X غير صالح' });
      settings.xUrl = url;
      updated = true;
    }

    const boolFields = ['enableWishlist','enableCompare','enableRecentlyViewed','enableSmartSearch','showHomeCollections','promoBannerEnabled','seasonalEffectEnabled','pushEnabled'];
    boolFields.forEach(field => {
      if (req.body && req.body[field] !== undefined) { settings[field] = parseBool(req.body[field]); updated = true; }
    });
    if (req.body && req.body.lowStockThreshold !== undefined) { settings.lowStockThreshold = Math.max(1, Math.min(99, Number(req.body.lowStockThreshold) || 3)); updated = true; }
    if (req.body && req.body.newProductDays !== undefined) { settings.newProductDays = Math.max(1, Math.min(365, Number(req.body.newProductDays) || 30)); updated = true; }
    const textFields = {
      promoBannerText: 220, promoBannerButtonText: 40, seasonalMessage: 160
    };
    Object.entries(textFields).forEach(([field,max]) => {
      if (req.body && req.body[field] !== undefined) { settings[field] = sanitizePlainText(req.body[field], max); updated = true; }
    });
    if (req.body && req.body.promoBannerLink !== undefined) {
      const raw = String(req.body.promoBannerLink || '').trim();
      const normalized = raw.startsWith('/') ? raw.slice(0, 300) : normalizePublicUrl(raw);
      if (raw && !normalized) return res.status(400).json({ message: 'رابط البانر غير صالح' });
      settings.promoBannerLink = normalized || '/products'; updated = true;
    }
    const dateFields = ['promoBannerStartsAt','promoBannerEndsAt','seasonalEffectStartsAt','seasonalEffectEndsAt'];
    dateFields.forEach(field => {
      if (req.body && req.body[field] !== undefined) { settings[field] = parseOptionalDate(req.body[field]) || null; updated = true; }
    });
    if (req.body && req.body.seasonalEffect !== undefined) {
      const allowed = new Set(['off','snow','hearts','spring','autumn','ramadan','eid','confetti']);
      const value = String(req.body.seasonalEffect || 'off'); settings.seasonalEffect = allowed.has(value) ? value : 'off'; updated = true;
    }
    if (req.body && req.body.seasonalEffectIntensity !== undefined) {
      const allowed = new Set(['low','medium','high']); const value = String(req.body.seasonalEffectIntensity || 'medium');
      settings.seasonalEffectIntensity = allowed.has(value) ? value : 'medium'; updated = true;
    }

    if (!updated) {
      return res.status(400).json({ message: 'لم يتم إرسال أي بيانات لتحديثها' });
    }

    await settings.save();
    await logActivity('تعديل إعدادات', logMessage || 'تم تحديث إعدادات المتجر', req.adminUser.username);
    res.json(settings);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : 'خطأ أثناء تحديث الإعدادات', error: err.message });
  }
});

// --- الـ API Routes الخاصة بالإحصائيات (Centralized Analytics) ---
// Smart search suggestions. Small payload, public and read-only.
app.get('/api/products/suggest', async (req, res) => {
  try {
    await ensureDBConnection();
    const q = sanitizePlainText(req.query.q, 80);
    if (!q) return res.json([]);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const items = await Product.find({ isHidden: { $ne: true }, stockQuantity: { $gt: 0 }, $or: [
      { title: regex }, { sku: regex }, { publicBrand: regex }, { category: regex }, { tags: regex }
    ]}).select('title price image sku publicBrand category stockQuantity').limit(8).lean();
    res.json(items);
  } catch (err) { res.status(500).json([]); }
});

// Optional Web Push subscriptions. Notifications use native VAPID signing and an empty push ping,
// so no extra npm package is required. The service worker then fetches the latest public message.
app.get('/api/push/latest', async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.set('Cache-Control', 'no-store');
    res.json({
      title: settings.pushLastTitle || 'TECHNOLOGY STORE',
      body: settings.pushLastBody || 'لدينا تحديث جديد في المتجر',
      url: settings.pushLastUrl || '/products',
      icon: settings.storeLogo || '/icon-192.png',
      sentAt: settings.pushLastSentAt || null
    });
  } catch (_) { res.json({ title: 'TECHNOLOGY STORE', body: 'لدينا تحديث جديد في المتجر', url: '/products', icon: '/icon-192.png' }); }
});
app.post('/api/push/subscribe', async (req, res) => {
  try {
    if (!pushConfigured()) return res.status(503).json({ message: 'Push notifications are not configured' });
    const sub = req.body || {};
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || !isTrustedPushEndpoint(sub.endpoint)) return res.status(400).json({ message: 'اشتراك غير صالح' });
    await ensureDBConnection();
    await PushSubscription.findOneAndUpdate(
      { endpoint: String(sub.endpoint) },
      { endpoint: String(sub.endpoint), keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) }, userAgent: String(req.headers['user-agent'] || '').slice(0, 300), lastSeenAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'تعذر حفظ اشتراك التنبيهات' }); }
});
app.delete('/api/push/subscribe', async (req, res) => {
  try { await ensureDBConnection(); if (req.body?.endpoint) await PushSubscription.deleteOne({ endpoint: String(req.body.endpoint) }); res.json({ ok: true }); }
  catch (_) { res.json({ ok: true }); }
});
app.post('/api/admin/push/send', requireAdminAuth, requirePermission('manage_settings'), async (req, res) => {
  try {
    if (!pushConfigured()) return res.status(503).json({ message: 'اضبط VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY أولاً' });
    const settings = await getOrCreateSettings();
    if (!settings.pushEnabled) return res.status(400).json({ message: 'فعّل Push Notifications من إعدادات المتجر أولاً' });
    const title = sanitizePlainText(req.body?.title, 80) || 'TECHNOLOGY STORE';
    const body = sanitizePlainText(req.body?.body, 180) || 'لدينا تحديث جديد في المتجر';
    const requestedUrl = String(req.body?.url || '/products').trim();
    const url = requestedUrl.startsWith('/') ? requestedUrl.slice(0, 300) : '/products';
    settings.pushLastTitle = title; settings.pushLastBody = body; settings.pushLastUrl = url; settings.pushLastSentAt = new Date();
    await settings.save();
    const subs = await PushSubscription.find().limit(5000).lean();
    let sent = 0, removed = 0, failed = 0;
    const queue = [...subs];
    const workers = Array.from({ length: Math.min(12, queue.length || 1) }, async () => {
      while (queue.length) {
        const sub = queue.shift();
        try {
          const status = await sendEmptyWebPush(sub.endpoint);
          if (status >= 200 && status < 300) sent++;
          else if ([404, 410].includes(status)) { await PushSubscription.deleteOne({ _id: sub._id }); removed++; }
          else failed++;
        } catch (_) { failed++; }
      }
    });
    await Promise.all(workers);
    await logActivity('إرسال إشعار', `Push: ناجح ${sent} — محذوف ${removed} — فشل ${failed}`, req.adminUser.username);
    res.json({ ok: true, sent, removed, failed, total: subs.length });
  } catch (err) { res.status(500).json({ message: 'تعذر إرسال الإشعار', error: err.message }); }
});

app.get('/api/analytics/popular', async (req, res) => {
  try {
    await ensureDBConnection();
    const doc = await getOrCreateAnalytics();
    res.json({ views: doc.views || {}, cart_adds: doc.cart_adds || {}, whatsapp_orders: doc.whatsapp_orders || {} });
  } catch (_) { res.json({ views:{}, cart_adds:{}, whatsapp_orders:{} }); }
});

app.get('/api/analytics', requireAdminAuth, requirePermission('view_reports'), async (req, res) => {
  await ensureDBConnection();
  try {
    const doc = await getOrCreateAnalytics();
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الإحصائيات', error: err.message });
  }
});

app.post('/api/analytics/track', async (req, res) => {
  await ensureDBConnection();
  try {
    const { type, productId, productTitle, page } = req.body;
    const doc = await getOrCreateAnalytics();
    
    if (type === 'page_visit') {
      doc.total_visits = (doc.total_visits || 0) + 1;
      const pName = page || 'index.html';
      const pVisits = { ...doc.page_visits };
      pVisits[pName] = (pVisits[pName] || 0) + 1;
      doc.page_visits = pVisits;

      const today = new Date().toISOString().split('T')[0];
      const dVisits = { ...doc.daily_visits };
      dVisits[today] = (dVisits[today] || 0) + 1;
      doc.daily_visits = dVisits;
    } else if (type && productId) {
      const currentMap = { ...(doc[type] || {}) };
      if (!currentMap[productId]) {
        currentMap[productId] = { count: 0, title: productTitle || 'Unknown' };
      }
      currentMap[productId].count++;
      currentMap[productId].title = productTitle || currentMap[productId].title;
      currentMap[productId].lastDate = new Date().toISOString();
      doc[type] = currentMap;
    }
    
    doc.markModified('views');
    doc.markModified('cart_adds');
    doc.markModified('whatsapp_orders');
    doc.markModified('page_visits');
    doc.markModified('daily_visits');
    
    await doc.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تسجيل الإحصائية', error: err.message });
  }
});

app.post('/api/analytics/reset', requireAdminAuth, requirePermission('view_reports'), async (req, res) => {
  try {
    let doc = await Analytics.findOne({ key: 'main' });
    if (doc) {
      doc.views = {};
      doc.cart_adds = {};
      doc.whatsapp_orders = {};
      doc.page_visits = {};
      doc.total_visits = 0;
      doc.daily_visits = {};
      doc.markModified('views');
      doc.markModified('cart_adds');
      doc.markModified('whatsapp_orders');
      doc.markModified('page_visits');
      doc.markModified('daily_visits');
      await doc.save();
    }
    res.json({ success: true, message: 'تم تصفير الإحصائيات' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تصفير الإحصائيات', error: err.message });
  }
});

app.post('/api/analytics/visitor', publicWriteLimiter, async (req, res) => {
  try {
    await ensureDBConnection(); const body = req.body || {}; const visitorId = sanitizePlainText(body.visitorId, 120); const sessionId = sanitizePlainText(body.sessionId, 140);
    if (!visitorId || !sessionId) return res.status(400).json({ message: 'visitorId and sessionId required' });
    const rawIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(); const geo = readGeoFromRequest(req); const attr = classifyTrafficSource(body); const now = new Date();
    const referrer = String(body.referrer || '').slice(0, 1000); const landingPage = String(body.landingPage || body.page || '/').slice(0, 500);
    const visitor = await Visitor.findOne({ visitorId }); const sessionExists = await VisitorSession.exists({ sessionId }); const isNew = !visitor;
    const update = { ip: rawIp, location: geo.location || sanitizePlainText(body.location,120), country: geo.country, city: geo.city, device: sanitizePlainText(body.device,140), deviceType: sanitizePlainText(body.deviceType,40), browser: sanitizePlainText(body.browser,60), os: sanitizePlainText(body.os,60), language: sanitizePlainText(body.language,30), screen: sanitizePlainText(body.screen,40), timezone: sanitizePlainText(body.timezone,80), referrer, utmSource: sanitizePlainText(body.utmSource,80), utmMedium: sanitizePlainText(body.utmMedium,80), utmCampaign: sanitizePlainText(body.utmCampaign,120), utmContent: sanitizePlainText(body.utmContent,120), utmTerm: sanitizePlainText(body.utmTerm,120), shareSource: sanitizePlainText(body.shareSource,50), source: attr.source, medium: attr.medium, lastLandingPage: landingPage, lastPage: String(body.page || landingPage).slice(0,500), lastSeenAt: now, timestamp: now, visitCount: Number(visitor?.visitCount || 0) + 1 };
    if (isNew) Object.assign(update,{ firstSource: attr.source, firstReferrer: referrer, firstLandingPage: landingPage, firstSeenAt: now, sessionCount: 1 }); else if (!sessionExists) update.sessionCount = Number(visitor.sessionCount || 0) + 1;
    await Visitor.findOneAndUpdate({ visitorId }, { $set: update }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await VisitorSession.findOneAndUpdate({ sessionId }, { $setOnInsert: { sessionId, visitorId, startedAt: now, entryPage: landingPage, source: attr.source, medium: attr.medium, referrer, utmSource: body.utmSource || '', utmMedium: body.utmMedium || '', utmCampaign: body.utmCampaign || '', utmContent: body.utmContent || '', utmTerm: body.utmTerm || '', shareSource: body.shareSource || '', ip: rawIp, location: geo.location || '', country: geo.country, city: geo.city, device: body.device || '', deviceType: body.deviceType || '', browser: body.browser || '', os: body.os || '', language: body.language || '', screen: body.screen || '', timezone: body.timezone || '' }, $set: { exitPage: String(body.page || landingPage).slice(0,500), lastSeenAt: now }, ...(sessionExists ? { $inc: { pageCount: 1 } } : {}) }, { upsert: true, new: true });
    res.json({ success: true, source: attr.source, medium: attr.medium });
  } catch (err) { res.status(500).json({ message: 'Error tracking visitor', error: err.message }); }
});

app.post('/api/analytics/session-ping', publicWriteLimiter, async (req,res)=>{
  try{
    await ensureDBConnection();const visitorId=sanitizePlainText(req.body?.visitorId,120),sessionId=sanitizePlainText(req.body?.sessionId,140);if(!visitorId||!sessionId)return res.status(400).json({message:'missing session'});
    const now=new Date();const page=String(req.body?.page||'').slice(0,500);const delta=Math.max(0,Math.min(60,Number(req.body?.activeSecondsDelta)||0));
    await Promise.all([Visitor.updateOne({visitorId},{$set:{lastSeenAt:now,lastPage:page||undefined}}),VisitorSession.updateOne({sessionId,visitorId},{$set:{lastSeenAt:now,exitPage:page||undefined},$inc:{activeSeconds:delta}})]);
    res.json({success:true});
  }catch(err){res.status(500).json({message:'ping failed'});}
});

app.get('/api/analytics/visitors', requireAdminAuth, requirePermission('view_reports'), async (req, res) => {
  try {
    await ensureDBConnection();
    const limit=Math.max(1,Math.min(500,parseInt(req.query.limit)||200)); const q={};
    if(req.query.source) q.source=sanitizePlainText(req.query.source,80);
    const from=parseOptionalDate(req.query.from), to=parseOptionalDate(req.query.to);
    if(from || to){q.lastSeenAt={};if(from)q.lastSeenAt.$gte=from;if(to){const end=new Date(to);if(String(req.query.to||'').length<=10)end.setHours(23,59,59,999);q.lastSeenAt.$lte=end;}}
    const [visitors,uniqueCount,sourceAgg]=await Promise.all([
      Visitor.find(q).sort({lastSeenAt:-1,timestamp:-1}).limit(limit).lean(),
      Visitor.countDocuments(q),
      Visitor.aggregate([{ $match:q },{ $group:{_id:'$source',count:{$sum:1}}},{ $sort:{count:-1}},{ $limit:30}])
    ]);
    res.json({visitors,uniqueCount,sources:sourceAgg.map(x=>({source:x._id||'Direct',count:x.count}))});
  } catch(err){res.status(500).json({message:'Error fetching visitors',error:err.message});}
});
app.get('/api/analytics/sessions', requireAdminAuth, requirePermission('view_reports'), async (req,res)=>{
  try{
    await ensureDBConnection();const limit=Math.max(1,Math.min(1000,parseInt(req.query.limit)||300));const q={};
    if(req.query.visitorId)q.visitorId=sanitizePlainText(req.query.visitorId,120);if(req.query.source)q.source=sanitizePlainText(req.query.source,80);
    const from=parseOptionalDate(req.query.from),to=parseOptionalDate(req.query.to);if(from||to){q.startedAt={};if(from)q.startedAt.$gte=from;if(to){const end=new Date(to);if(String(req.query.to||'').length<=10)end.setHours(23,59,59,999);q.startedAt.$lte=end;}}
    const sessions=await VisitorSession.find(q).sort({startedAt:-1}).limit(limit).lean();res.json({sessions});
  }catch(err){res.status(500).json({message:'Error fetching sessions',error:err.message});}
});

// V9 — detailed visitor journey for authorized admins only.
app.get('/api/admin/visitors/:visitorId/journey', requireAdminAuth, requirePermission('view_visitor_details'), async(req,res)=>{
  try{
    await ensureDBConnection();
    const visitorId=sanitizePlainText(req.params.visitorId,120);
    const visitor=await Visitor.findOne({visitorId}).lean();
    if(!visitor)return res.status(404).json({message:'الزائر غير موجود'});
    const [sessions,events,orders,carts]=await Promise.all([
      VisitorSession.find({visitorId}).sort({startedAt:-1}).limit(30).lean(),
      VisitorEvent.find({visitorId}).sort({createdAt:-1}).limit(250).lean(),
      Order.find({visitorId}).sort({createdAt:-1}).limit(50).select('orderNumber customerName customerPhone total status createdAt items shippingAmount discountAmount').lean(),
      AbandonedCart.find({visitorId}).sort({lastSeenAt:-1}).limit(30).lean()
    ]);
    res.json({visitor,sessions,events,orders,carts});
  }catch(err){res.status(500).json({message:'تعذر تحميل رحلة الزائر'});}
});

// --- الـ API Routes الخاصة بمديري النظام (Admin Auth) ---


// --- Admin Operations Center (Dashboard / Orders / Media) ---
app.get('/api/admin/dashboard', requireAdminAuth, requirePermission('view_reports'), async (req, res) => {
  try {
    await ensureDBConnection();
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const settings = await getOrCreateSettings();
    const lowStockThreshold = Math.max(1, Math.min(99, Number(settings.lowStockThreshold || 3)));

    const [
      totalProducts, visibleProducts, hiddenProducts, outOfStock, lowStock,
      missingImages, totalOrders, pendingOrders, processingOrders, completedOrders,
      cancelledOrders, todayOrders, todaySalesAgg, recentOrders, recentLogs
    ] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ isHidden: { $ne: true } }),
      Product.countDocuments({ isHidden: true }),
      Product.countDocuments({ stockQuantity: { $lte: 0 } }),
      Product.countDocuments({ stockQuantity: { $gt: 0, $lte: lowStockThreshold } }),
      Product.countDocuments({ $or: [
        { image: { $exists: false } }, { image: null }, { image: '' },
        { image: { $regex: /placehold\.co|no-image|No\+Image/i } }
      ]}),
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: { $in: ['received_by_pos', 'confirmed', 'processing'] } }),
      Order.countDocuments({ status: 'completed' }),
      Order.countDocuments({ status: 'cancelled' }),
      Order.countDocuments({ createdAt: { $gte: todayStart } }),
      Order.aggregate([
        { $match: { createdAt: { $gte: todayStart }, posInvoiceId: { $exists: true, $nin: ['', null] }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Order.find().select('orderNumber customerName total status paymentStatus posInvoiceId createdAt').sort({ createdAt: -1 }).limit(6).lean(),
      ActivityLog.find().sort({ timestamp: -1 }).limit(6).lean()
    ]);

    const profitAgg = await Order.aggregate([
      { $match: { createdAt: { $gte: todayStart }, posInvoiceId: { $exists: true, $nin: ['', null] }, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'p' } },
      { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
      { $group: { _id: null,
        grossProfit: { $sum: { $cond: [ { $gt: [ { $ifNull: ['$p.costPrice', 0] }, 0 ] }, { $multiply: ['$items.quantity', { $subtract: ['$items.price', '$p.costPrice'] }] }, 0 ] } },
        costedItems: { $sum: { $cond: [ { $gt: [ { $ifNull: ['$p.costPrice', 0] }, 0 ] }, 1, 0 ] } }
      } }
    ]);
    const costedItems = Number(profitAgg?.[0]?.costedItems || 0);
    res.json({
      generatedAt: now.toISOString(),
      products: { total: totalProducts, visible: visibleProducts, hidden: hiddenProducts, outOfStock, lowStock, missingImages },
      orders: { total: totalOrders, pending: pendingOrders, processing: processingOrders, completed: completedOrders, cancelled: cancelledOrders, today: todayOrders, todaySales: Number(todaySalesAgg?.[0]?.total || 0), todayGrossProfit: costedItems ? Math.round(Number(profitAgg?.[0]?.grossProfit || 0)*100)/100 : null, costDataAvailable: costedItems > 0 },
      recentOrders,
      recentLogs,
      health: {
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        cloudinaryConfigured: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
        posConfigured: Boolean(String(settings.posApiKey || process.env.POS_API_KEY || '').trim()),
        pushConfigured: pushConfigured(),
        pushEnabled: Boolean(settings.pushEnabled),
        promoBannerEnabled: Boolean(settings.promoBannerEnabled),
        promoBannerActive: Boolean(settings.promoBannerEnabled && isWindowActive(settings.promoBannerStartsAt, settings.promoBannerEndsAt)),
        seasonalEffectEnabled: Boolean(settings.seasonalEffectEnabled && settings.seasonalEffect !== 'off'),
        seasonalEffectActive: Boolean(settings.seasonalEffectEnabled && settings.seasonalEffect !== 'off' && isWindowActive(settings.seasonalEffectStartsAt, settings.seasonalEffectEndsAt)),
        lowStockThreshold
      }
    });
  } catch (err) {
    console.error('ADMIN DASHBOARD ERROR:', err);
    res.status(500).json({ message: 'تعذر تحميل لوحة المتابعة', error: err.message });
  }
});

app.get('/api/admin/orders', requireAdminAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 25));
    const status = String(req.query.status || '').trim();
    const search = String(req.query.search || '').trim();
    const filter = {};
    const validStatuses = ['pending', 'received_by_pos', 'confirmed', 'processing', 'out_for_delivery', 'completed', 'cancelled'];
    if (status && validStatuses.includes(status)) filter.status = status;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filter.$or = [
        { orderNumber: rx }, { customerName: rx }, { customerPhone: rx },
        { customerAddress: rx }, { 'items.title': rx }, { 'items.sku': rx }
      ];
    }
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(filter)
    ]);
    res.json({ orders, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
  } catch (err) {
    res.status(500).json({ message: 'تعذر تحميل الطلبات', error: err.message });
  }
});

app.put('/api/admin/orders/:orderId/status', requireAdminAuth, requirePermission('manage_orders'), async (req, res) => {
  try {
    const validStatuses = ['pending', 'received_by_pos', 'confirmed', 'processing', 'out_for_delivery', 'completed', 'cancelled'];
    const status = String(req.body.status || '').trim();
    if (!validStatuses.includes(status)) return res.status(400).json({ message: 'حالة الطلب غير صالحة' });
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    const previousStatus = order.status;
    const hasPosInvoice = Boolean(String(order.posInvoiceId || '').trim());
    if (['confirmed','processing','out_for_delivery','completed'].includes(status) && !hasPosInvoice) {
      return res.status(409).json({ message: 'لا يمكن اعتبار الطلب بيعاً أو تجهيزه قبل إنشاء فاتورة فعلية من Technology POS' });
    }
    if (hasPosInvoice && ['pending','received_by_pos','cancelled'].includes(status)) {
      return res.status(409).json({ message: 'بعد إصدار فاتورة البيع، الإلغاء أو الرجوع يجب أن يتم من Technology POS حتى تظل حركة المخزون والحسابات صحيحة' });
    }
    order.status = status;
    order.stockReservationStatus = 'none';
    order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
    order.statusHistory.push({ status, at: new Date(), note: sanitizePlainText(req.body?.note, 200) });
    await order.save();
    await logActivity('تحديث طلب', `تم تغيير حالة الطلب ${order.orderNumber} من ${previousStatus} إلى ${status}`, req.adminUser.username);
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ message: 'تعذر تحديث حالة الطلب', error: err.message });
  }
});


app.put('/api/admin/orders/:orderId/shipping', requireAdminAuth, requirePermission('manage_orders'), async(req,res)=>{
  try{
    const order=await Order.findById(req.params.orderId); if(!order)return res.status(404).json({message:'الطلب غير موجود'});
    order.shippingCarrier=sanitizePlainText(req.body?.shippingCarrier,100); order.trackingNumber=sanitizePlainText(req.body?.trackingNumber,120);
    const rawUrl=String(req.body?.trackingUrl||'').trim(); order.trackingUrl=/^https?:\/\//i.test(rawUrl)?rawUrl.slice(0,800):'';
    order.estimatedDeliveryAt=parseOptionalDate(req.body?.estimatedDeliveryAt)||undefined;
    order.statusHistory=Array.isArray(order.statusHistory)?order.statusHistory:[]; order.statusHistory.push({status:order.status,at:new Date(),note:'تم تحديث بيانات الشحن'});
    await order.save(); await logActivity('تحديث بيانات الشحن',`${order.orderNumber} — ${order.shippingCarrier||'بدون شركة'} — ${order.trackingNumber||'بدون رقم تتبع'}`,req.adminUser.username);
    res.json({success:true,order});
  }catch(err){res.status(500).json({message:'تعذر تحديث بيانات الشحن'});}
});

app.get('/api/admin/notifications', requireAdminAuth, async(req,res)=>{
  try{
    const settings=await getOrCreateSettings(); const low=Math.max(0,Number(settings.lowStockThreshold)||3); const since=new Date(Date.now()-24*60*60*1000);
    const [newOrders,pendingReviews,pendingReturns,lowStock,failedBackup]=await Promise.all([
      Order.countDocuments({status:'pending'}),Review.countDocuments({$or:[{status:'pending'},{status:{$exists:false},approved:false}]}),ReturnRequest.countDocuments({status:'pending'}),Product.countDocuments({isHidden:{$ne:true},stockQuantity:{$gt:0,$lte:low}}),BackupRecord.findOne({status:'failed',createdAt:{$gte:since}}).sort({createdAt:-1}).lean()
    ]);
    const items=[];
    if(newOrders)items.push({type:'orders',icon:'receipt_long',title:`${newOrders} طلب جديد`,text:'طلبات من الموقع تنتظر إنشاء فاتورة البيع داخل Technology POS',tab:'orders',count:newOrders,priority:'high'});
    if(pendingReviews)items.push({type:'reviews',icon:'reviews',title:`${pendingReviews} تقييم بانتظار المراجعة`,text:'راجع آراء العملاء قبل نشرها',tab:'reviews',count:pendingReviews,priority:'medium'});
    if(pendingReturns)items.push({type:'returns',icon:'assignment_return',title:`${pendingReturns} طلب استبدال أو استرجاع`,text:'طلبات ما بعد البيع تحتاج إجراء',tab:'returns',count:pendingReturns,priority:'high'});
    if(lowStock)items.push({type:'stock',icon:'inventory_2',title:`${lowStock} منتج منخفض المخزون`,text:`الكمية أقل من أو تساوي ${low}`,tab:'products',filter:'low_stock',count:lowStock,priority:'medium'});
    if(failedBackup)items.push({type:'backup',icon:'cloud_off',title:'آخر نسخة احتياطية فشلت',text:new Date(failedBackup.createdAt).toLocaleString('ar-EG'),tab:'system',count:1,priority:'high'});
    res.json({count:items.length,actionCount:items.reduce((a,x)=>a+Number(x.count||1),0),items,generatedAt:new Date().toISOString()});
  }catch(err){res.status(500).json({message:'تعذر تحميل التنبيهات'});}
});

app.get('/api/admin/customers', requireAdminAuth, requirePermission('manage_orders'), async(req,res)=>{
  try{
    const page=Math.max(1,parseInt(req.query.page)||1),limit=Math.min(100,Math.max(10,parseInt(req.query.limit)||25)),search=sanitizePlainText(req.query.search,100);
    const match=search?{$or:[{customerName:{$regex:escapeRegexLiteral(search),$options:'i'}},{customerPhone:{$regex:escapeRegexLiteral(search),$options:'i'}},{orderNumber:{$regex:escapeRegexLiteral(search),$options:'i'}}]}:{};
    const pipeline=[{$match:match},{$sort:{createdAt:-1}},{$group:{_id:'$customerPhone',name:{$first:'$customerName'},phone:{$first:'$customerPhone'},orders:{$sum:1},revenue:{$sum:{$cond:[{$and:[{$ne:['$status','cancelled']},{$ne:[{$ifNull:['$posInvoiceId','']},'']}]},'$total',0]}},lastOrderAt:{$max:'$createdAt'},lastOrderNumber:{$first:'$orderNumber'},returns:{$sum:0}}},{$sort:{revenue:-1,lastOrderAt:-1}}];
    const rows=await Order.aggregate([...pipeline,{$skip:(page-1)*limit},{$limit:limit}]); const countArr=await Order.aggregate([...pipeline,{$count:'n'}]); const total=countArr[0]?.n||0;
    res.json({customers:rows,total,page,pages:Math.max(1,Math.ceil(total/limit)),limit});
  }catch(err){res.status(500).json({message:'تعذر تحميل العملاء'});}
});
app.get('/api/admin/customers/:phone', requireAdminAuth, requirePermission('manage_orders'), async(req,res)=>{
  try{const phone=normalizePhoneNumber(req.params.phone);const orders=await Order.find({customerPhone:phone}).sort({createdAt:-1}).limit(100).lean();if(!orders.length)return res.status(404).json({message:'العميل غير موجود'});const returns=await ReturnRequest.find({customerPhone:phone}).sort({createdAt:-1}).limit(100).lean();const revenue=orders.filter(o=>o.status!=='cancelled'&&String(o.posInvoiceId||'').trim()).reduce((a,o)=>a+Number(o.total||0),0);res.json({name:orders[0].customerName,phone,orders,revenue,returns});}catch(err){res.status(500).json({message:'تعذر تحميل ملف العميل'});}
});

app.post('/api/admin/products/bulk-action', requireAdminAuth, requirePermission('edit_product'), async(req,res)=>{
  try{const ids=(Array.isArray(req.body?.ids)?req.body.ids:[]).filter(x=>mongoose.Types.ObjectId.isValid(x)).slice(0,500);if(!ids.length)return res.status(400).json({message:'اختر منتجاً واحداً على الأقل'});const action=String(req.body?.action||'');let result;
    if(action==='hide'||action==='show')result=await Product.updateMany({_id:{$in:ids}},{$set:{isHidden:action==='hide',visibilityManuallySet:true}});
    else if(action==='featured'||action==='unfeatured')result=await Product.updateMany({_id:{$in:ids}},{$set:{isFeatured:action==='featured'}});
    else if(action==='category'){const category=sanitizePlainText(req.body?.category,100);if(!category)return res.status(400).json({message:'اسم القسم مطلوب'});result=await Product.updateMany({_id:{$in:ids}},{$set:{category}});}
    else if(action==='price_percent'){const pct=Math.max(-90,Math.min(500,Number(req.body?.value)||0));const docs=await Product.find({_id:{$in:ids}}).select('_id price');const ops=docs.map(x=>({updateOne:{filter:{_id:x._id},update:{$set:{price:Math.max(0,Math.round(Number(x.price||0)*(1+pct/100)*100)/100)}}}}));result=ops.length?await Product.bulkWrite(ops):{modifiedCount:0};}
    else return res.status(400).json({message:'الإجراء غير مدعوم'});
    await logActivity('تعديل جماعي للمنتجات',`${action} — ${ids.length} منتج`,req.adminUser.username);res.json({success:true,modified:result.modifiedCount||0});
  }catch(err){res.status(500).json({message:'تعذر تنفيذ الإجراء الجماعي'});}
});

app.get('/api/admin/media', requireAdminAuth, requirePermission('manage_media'), async (req, res) => {
  try {
    const [products, settings] = await Promise.all([
      Product.find().select('title category image imagePublicId additionalImages createdAt').sort({ createdAt: -1 }).lean(),
      getOrCreateSettings()
    ]);
    const media = [];
    let missingProducts = 0;
    const seenUrls = new Set();
    let duplicateReferences = 0;

    const pushMedia = (entry) => {
      const url = String(entry.url || '').trim();
      if (!url || /placehold\.co|no-image|No\+Image/i.test(url)) return;
      const isCloudinary = /^https:\/\/res\.cloudinary\.com\//i.test(url);
      const extMatch = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i);
      const format = extMatch ? extMatch[1].toLowerCase() : (isCloudinary ? 'cloudinary' : 'unknown');
      const optimized = isCloudinary || /\.webp(?:$|\?)/i.test(url);
      if (seenUrls.has(url)) duplicateReferences++;
      seenUrls.add(url);
      media.push({ ...entry, url, isCloudinary, format, optimized });
    };

    for (const product of products) {
      const mainUrl = String(product.image || '').trim();
      if (!mainUrl || /placehold\.co|no-image|No\+Image/i.test(mainUrl)) missingProducts++;
      else pushMedia({ kind: 'product-main', productId: product._id, productTitle: product.title, category: product.category, url: mainUrl, publicId: product.imagePublicId || '' });
      for (const img of (product.additionalImages || [])) {
        pushMedia({ kind: 'product-extra', productId: product._id, productTitle: product.title, category: product.category, url: img.url, publicId: img.publicId || '' });
      }
    }
    pushMedia({ kind: 'store-logo', productTitle: 'لوجو المتجر', category: 'إعدادات', url: settings.storeLogo || '' });
    pushMedia({ kind: 'hero-dark', productTitle: 'بانر الوضع الغامق', category: 'إعدادات', url: settings.darkHeroImage || '' });
    pushMedia({ kind: 'hero-light', productTitle: 'بانر الوضع الفاتح', category: 'إعدادات', url: settings.lightHeroImage || '' });
    pushMedia({ kind: 'fallback', productTitle: 'الصورة الافتراضية', category: 'إعدادات', url: settings.defaultProductImage || '' });

    res.json({
      summary: { totalReferences: media.length, uniqueUrls: seenUrls.size, duplicateReferences, missingProducts },
      media: media.slice(0, 1500)
    });
  } catch (err) {
    res.status(500).json({ message: 'تعذر تحميل مركز الصور', error: err.message });
  }
});

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  await ensureDBConnection();
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const user = await AdminUser.findOne({ username });
    if (user?.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const mins = Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000));
      return res.status(429).json({ message: `تم قفل الحساب مؤقتاً. حاول بعد ${mins} دقيقة.` });
    }
    if (!user || !verifyPassword(user.password, password)) {
      if (user) {
        user.failedLoginCount = Number(user.failedLoginCount || 0) + 1;
        if (user.failedLoginCount >= 5) { user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); user.failedLoginCount = 0; }
        await user.save().catch(() => null);
      }
      return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    if (!String(user.password || '').startsWith('scrypt$')) user.password = hashPassword(password);
    user.failedLoginCount = 0; user.lockedUntil = null;
    await user.save();

    const safeUser = { id: user._id, username: user.username, role: user.role, roleKey: user.roleKey || 'custom', permissions: user.permissions, totpEnabled: Boolean(user.totpEnabled) };
    if (user.totpEnabled && user.totpSecret) {
      const tempToken = jwt.sign({ sub: user._id.toString(), purpose: 'mfa-login' }, getJwtSecret(), { expiresIn: '5m' });
      return res.json({ message: 'مطلوب رمز التحقق', mfaRequired: true, tempToken, user: safeUser });
    }

    const session = await createAdminSession(user, req); user.lastLoginAt = new Date(); await user.save();
    await logActivity('تسجيل دخول', `تم تسجيل الدخول من ${describeAdminDevice(req)} - ${getClientIp(req) || 'IP غير معروف'}`, user.username);
    res.json({ message: 'تم تسجيل الدخول بنجاح', token: session.token, expiresAt: session.expiresAt, user: safeUser });
  } catch (err) {
    const status = /JWT_SECRET/.test(err.message) ? 503 : 500;
    res.status(status).json({ message: err.message || 'خطأ أثناء تسجيل الدخول' });
  }
});

app.post('/api/admin/login/2fa', loginLimiter, async (req, res) => {
  try {
    await ensureDBConnection();
    const payload = jwt.verify(String(req.body?.tempToken || ''), getJwtSecret());
    if (payload.purpose !== 'mfa-login') return res.status(401).json({ message: 'طلب التحقق غير صالح' });
    const user = await AdminUser.findById(payload.sub);
    if (!user || !user.totpEnabled || !verifyTotp(user.totpSecret, req.body?.code)) return res.status(401).json({ message: 'رمز التحقق غير صحيح' });
    const session = await createAdminSession(user, req); user.lastLoginAt = new Date(); await user.save();
    await logActivity('تسجيل دخول 2FA', `تم تسجيل الدخول الآمن من ${describeAdminDevice(req)} - ${getClientIp(req) || 'IP غير معروف'}`, user.username);
    res.json({ message: 'تم تسجيل الدخول بنجاح', token: session.token, expiresAt: session.expiresAt, user: { id:user._id, username:user.username, role:user.role, roleKey:user.roleKey || 'custom', permissions:user.permissions, totpEnabled:true } });
  } catch (err) { res.status(401).json({ message: 'انتهى طلب التحقق أو أصبح غير صالح' }); }
});

app.get('/api/admin/me', requireAdminAuth, async (req, res) => {
  res.json({
    user: {
      id: req.adminUser._id,
      username: req.adminUser.username,
      role: req.adminUser.role,
      permissions: req.adminUser.permissions,
      roleKey: req.adminUser.roleKey || 'custom',
      totpEnabled: Boolean(req.adminUser.totpEnabled)
    }
  });
});

app.get('/api/admin/users', requireAdminAuth, requirePermission('manage_users'), async (req, res) => {
  try {
    const users = await AdminUser.find().select('-password -totpSecret -totpPendingSecret');
    const mappedUsers = users.map(u => ({
      id: u._id.toString(),
      username: u.username,
      role: u.role,
      permissions: u.permissions,
      roleKey: u.roleKey || 'custom',
      totpEnabled: Boolean(u.totpEnabled),
      lastLoginAt: u.lastLoginAt
    }));
    res.json(mappedUsers);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب المستخدمين', error: err.message });
  }
});

app.get('/api/admin/logs', requireAdminAuth, requirePermission('view_reports'), async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit) || 150));
    const query = {};
    const search = sanitizePlainText(req.query.search, 120);
    const user = sanitizePlainText(req.query.user, 80);
    const action = sanitizePlainText(req.query.action, 80);
    if (user) query.user = new RegExp(user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (action) query.action = new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ details: rx }, { action: rx }, { user: rx }];
    }
    const from = parseOptionalDate(req.query.from); const to = parseOptionalDate(req.query.to);
    if (from || to) { query.timestamp = {}; if (from) query.timestamp.$gte = from; if (to) { const end = new Date(to); end.setHours(23,59,59,999); query.timestamp.$lte = end; } }
    const logs = await ActivityLog.find(query).sort({ timestamp: -1 }).limit(limit).lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب السجل', error: err.message });
  }
});

app.post('/api/admin/users', requireAdminAuth, requirePermission('manage_users'), async (req, res) => {
  try {
    const { username, password, role, roleKey, permissions } = req.body;
    const existing = await AdminUser.findOne({ username });
    if (existing) return res.status(400).json({ message: 'اسم المستخدم موجود بالفعل' });
    
    if (!username || !password) return res.status(400).json({ message: 'اسم المستخدم وكلمة المرور مطلوبان' });
    const safePermissions = normalizePermissions(permissions);
    if (safePermissions.length === 0) return res.status(400).json({ message: 'يجب اختيار صلاحية واحدة صحيحة على الأقل' });
    const safeRoleKey = safePermissions.includes('all') ? 'owner' : normalizeRoleKey(roleKey);
    const safeRole = ADMIN_ROLE_LABELS[safeRoleKey] || (safePermissions.includes('all') ? 'المالك' : 'مخصص');
    const newUser = new AdminUser({ username: String(username).trim(), password: hashPassword(password), role: safeRole, roleKey: safeRoleKey, permissions: safePermissions });
    await newUser.save();
    await logActivity('إضافة مستخدم', `تم إضافة مستخدم جديد بصلاحيات الإدارة: ${username}`, req.adminUser.username);
    res.status(201).json({ id: newUser._id, username: newUser.username, role: newUser.role, roleKey: newUser.roleKey, permissions: newUser.permissions, totpEnabled: Boolean(newUser.totpEnabled) });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في إضافة المستخدم', error: err.message });
  }
});

app.put('/api/admin/users/:id', requireAdminAuth, requireSelfOrPermission('manage_users'), async (req, res) => {
  try {
    const { username, password, role, roleKey, permissions } = req.body;
    const updateData = {};
    const isSelf = String(req.adminUser._id) === String(req.params.id);
    const actorPermissions = Array.isArray(req.adminUser.permissions) ? req.adminUser.permissions : [];
    const canManageUsers = actorPermissions.includes('all') || actorPermissions.includes('manage_users');

    if (username !== undefined && String(username).trim() !== '') updateData.username = String(username).trim();
    if (password && String(password).trim() !== '') updateData.password = hashPassword(password);

    // المستخدم العادي يستطيع تعديل بيانات دخوله فقط، ولا يستطيع منح نفسه صلاحيات إضافية.
    if ((role !== undefined || roleKey !== undefined || permissions !== undefined) && !canManageUsers) {
      return res.status(403).json({ message: 'لا يمكنك تعديل دورك أو صلاحياتك بنفسك' });
    }
    if (canManageUsers && permissions !== undefined) {
      const safePermissions = normalizePermissions(permissions);
      if (safePermissions.length === 0) return res.status(400).json({ message: 'يجب اختيار صلاحية واحدة صحيحة على الأقل' });
      updateData.permissions = safePermissions;
      updateData.roleKey = safePermissions.includes('all') ? 'owner' : normalizeRoleKey(roleKey);
      updateData.role = ADMIN_ROLE_LABELS[updateData.roleKey] || 'مخصص';
    } else if (canManageUsers && (role !== undefined || roleKey !== undefined)) {
      updateData.roleKey = normalizeRoleKey(roleKey);
      updateData.role = ADMIN_ROLE_LABELS[updateData.roleKey] || sanitizePlainText(role, 50) || 'مخصص';
    }
    const updated = await AdminUser.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updated) return res.status(404).json({ message: 'المستخدم غير موجود' });
    await logActivity('تعديل مستخدم', `تم تعديل بيانات أو صلاحيات المستخدم: ${updated.username}`, req.adminUser.username);
    res.json({ id: updated._id, username: updated.username, role: updated.role, roleKey: updated.roleKey, permissions: updated.permissions, totpEnabled: Boolean(updated.totpEnabled) });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تعديل المستخدم', error: err.message });
  }
});

app.delete('/api/admin/users/:id', requireAdminAuth, requirePermission('manage_users'), async (req, res) => {
  try {
    if (String(req.adminUser._id) === String(req.params.id)) {
      return res.status(400).json({ message: 'لا يمكن حذف حسابك الحالي أثناء تسجيل الدخول به' });
    }
    const user = await AdminUser.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    if (Array.isArray(user.permissions) && user.permissions.includes('all')) {
      const fullAdmins = await AdminUser.countDocuments({ permissions: 'all' });
      if (fullAdmins <= 1) return res.status(400).json({ message: 'لا يمكن حذف آخر مدير كامل الصلاحيات' });
    }
    await logActivity('حذف مستخدم', `تم حذف المستخدم: ${user.username}`, req.adminUser.username);
    await AdminUser.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في حذف المستخدم', error: err.message });
  }
});


// ==============================
// V9 PRODUCTION & OPERATIONS API
// ==============================
function parseAnalyticsRange(req) {
  const q = {}; const from = parseOptionalDate(req.query.from), to = parseOptionalDate(req.query.to);
  if (from || to) { q.createdAt = {}; if (from) q.createdAt.$gte = from; if (to) { const end = new Date(to); if (String(req.query.to || '').length <= 10) end.setHours(23,59,59,999); q.createdAt.$lte = end; } }
  return q;
}

app.post('/api/analytics/event', publicWriteLimiter, async (req,res) => {
  try {
    await ensureDBConnection(); const body=req.body||{}; const visitorId=sanitizePlainText(body.visitorId,120), sessionId=sanitizePlainText(body.sessionId,140);
    const allowed=new Set(['page_view','product_view','add_to_cart','remove_from_cart','checkout_started','checkout_contact','checkout_quote','order_submitted','order_completed','whatsapp_click','share','search','return_started']);
    const type=sanitizePlainText(body.type,50); if(!visitorId||!sessionId||!allowed.has(type)) return res.status(400).json({message:'invalid event'});
    const session=await VisitorSession.findOne({sessionId}).lean();
    await VisitorEvent.create({visitorId,sessionId,type,source:session?.source||sanitizePlainText(body.source,80)||'Direct',medium:session?.medium||'',campaign:session?.utmCampaign||sanitizePlainText(body.campaign,120),path:String(body.path||'').slice(0,500),productId:sanitizePlainText(body.productId,120),productTitle:sanitizePlainText(body.productTitle,180),orderNumber:sanitizePlainText(body.orderNumber,80),value:Math.max(0,Number(body.value)||0),metadata:typeof body.metadata==='object'&&body.metadata?body.metadata:{}});
    res.json({success:true});
  } catch(err){res.status(500).json({message:'event failed'});}
});

app.post('/api/analytics/cart-state', publicWriteLimiter, async (req,res)=>{
  try{
    await ensureDBConnection(); const b=req.body||{}; const visitorId=sanitizePlainText(b.visitorId,120),sessionId=sanitizePlainText(b.sessionId,140); if(!visitorId||!sessionId)return res.status(400).json({message:'missing session'});
    const items=Array.isArray(b.items)?b.items.slice(0,50).map(i=>({productId:sanitizePlainText(i.productId,120),title:sanitizePlainText(i.title,180),variant:sanitizePlainText(i.variant,120),quantity:Math.max(1,Math.min(99,Number(i.quantity)||1)),price:Math.max(0,Number(i.price)||0)})):[];
    if(!items.length){await AbandonedCart.deleteOne({visitorId,sessionId,status:'active'}).catch(()=>null);return res.json({success:true,empty:true});}
    const session=await VisitorSession.findOne({sessionId}).lean(); const stage=['cart','checkout','contact'].includes(b.stage)?b.stage:'cart';
    const subtotal=Math.round(items.reduce((a,i)=>a+i.quantity*i.price,0)*100)/100;
    const doc=await AbandonedCart.findOneAndUpdate({visitorId,sessionId},{$set:{source:session?.source||'Direct',campaign:session?.utmCampaign||'',customerName:sanitizePlainText(b.customerName,100),phone:normalizePhoneNumber(b.phone),stage,items,subtotal,status:'active',lastSeenAt:new Date()},$setOnInsert:{firstSeenAt:new Date()}},{upsert:true,new:true,setDefaultsOnInsert:true});
    res.json({success:true,id:doc._id});
  }catch(err){res.status(500).json({message:'cart state failed'});}
});

app.get('/api/admin/v9/overview', requireAdminAuth, requirePermission('view_reports'), async (req,res)=>{
  try{
    await ensureDBConnection(); const range=parseAnalyticsRange(req); const eventQ={...range}; const orderQ={};
    if(range.createdAt) orderQ.createdAt=range.createdAt;
    const sessionQ={}; if(range.createdAt) sessionQ.startedAt=range.createdAt;
    const [events,orders,sessions,abandoned,returns,topProducts,lastBackup]=await Promise.all([
      VisitorEvent.aggregate([{ $match:eventQ },{ $group:{_id:'$type',count:{$sum:1},sessions:{$addToSet:'$sessionId'}}}]),
      Order.find({...orderQ,posInvoiceId:{$exists:true,$nin:['',null]},status:{$ne:'cancelled'}}).select('visitorId total items createdAt').lean(),
      VisitorSession.find(sessionQ).select('visitorId sessionId source utmCampaign startedAt').lean(),
      AbandonedCart.find({status:'active',...(range.createdAt?{lastSeenAt:range.createdAt}:{})}).sort({lastSeenAt:-1}).limit(300).lean(),
      ReturnRequest.countDocuments({status:{$in:['pending','approved','received']}}),
      Order.aggregate([{ $match:{...orderQ,posInvoiceId:{$exists:true,$nin:['',null]},status:{$ne:'cancelled'}}},{ $unwind:'$items'},{ $group:{_id:'$items.title',qty:{$sum:'$items.quantity'},revenue:{$sum:'$items.lineTotal'}}},{ $sort:{revenue:-1}},{ $limit:8}]),
      BackupRecord.findOne({status:'success'}).sort({createdAt:-1}).lean()
    ]);
    const eventMap={}; for(const e of events)eventMap[e._id]={count:e.count,sessions:e.sessions.filter(Boolean).length};
    const uniqueVisitors=new Set(sessions.map(x=>x.visitorId).filter(Boolean)).size; const totalSessions=sessions.length;
    const revenue=orders.reduce((a,o)=>a+Number(o.total||0),0); const aov=orders.length?revenue/orders.length:0;
    const visitsBySource={}; for(const s1 of sessions){const k=s1.source||'Direct';visitsBySource[k]=(visitsBySource[k]||0)+1;}
    const sessionByVisitor=new Map(); for(const ss of sessions){if(ss.visitorId&&!sessionByVisitor.has(ss.visitorId))sessionByVisitor.set(ss.visitorId,ss);}
    const sourceSales={}; for(const o of orders){const ss=sessionByVisitor.get(o.visitorId);const k=ss?.source||'Direct';if(!sourceSales[k])sourceSales[k]={orders:0,revenue:0};sourceSales[k].orders++;sourceSales[k].revenue+=Number(o.total||0);}
    const sources=[...new Set([...Object.keys(visitsBySource),...Object.keys(sourceSales)])].map(source=>({source,visits:visitsBySource[source]||0,orders:sourceSales[source]?.orders||0,revenue:Math.round((sourceSales[source]?.revenue||0)*100)/100,conversion:(visitsBySource[source]||0)?Math.round(((sourceSales[source]?.orders||0)/(visitsBySource[source]||1))*10000)/100:0})).sort((a,b)=>b.revenue-a.revenue||b.visits-a.visits);
    res.json({generatedAt:new Date().toISOString(),kpis:{uniqueVisitors,totalSessions,orders:orders.length,revenue:Math.round(revenue*100)/100,aov:Math.round(aov*100)/100,abandoned:abandoned.length,pendingReturns:returns,conversion:totalSessions?Math.round(orders.length/totalSessions*10000)/100:0},funnel:{pageViews:eventMap.page_view?.sessions||totalSessions,productViews:eventMap.product_view?.sessions||0,addToCart:eventMap.add_to_cart?.sessions||0,checkout:eventMap.checkout_started?.sessions||0,contact:eventMap.checkout_contact?.sessions||0,orders:orders.length},sources,topProducts,abandoned:abandoned.slice(0,30),lastBackup});
  }catch(err){res.status(500).json({message:'تعذر تحميل مركز ذكاء المبيعات',error:err.message});}
});

app.get('/api/admin/abandoned-carts', requireAdminAuth, requirePermission('manage_orders'), async(req,res)=>{
  try{const status=['active','recovered','expired'].includes(req.query.status)?req.query.status:'active';const q={status};if(req.query.search){const rx=new RegExp(sanitizePlainText(req.query.search,80).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');q.$or=[{customerName:rx},{phone:rx},{'items.title':rx}];}const carts=await AbandonedCart.find(q).sort({lastSeenAt:-1}).limit(500).lean();res.json(carts);}catch(err){res.status(500).json({message:'تعذر تحميل السلات'});}
});
app.put('/api/admin/abandoned-carts/:id', requireAdminAuth, requirePermission('manage_orders'), async(req,res)=>{const status=['active','recovered','expired'].includes(req.body?.status)?req.body.status:'active';const doc=await AbandonedCart.findByIdAndUpdate(req.params.id,{status},{new:true});res.json(doc);});

app.post('/api/returns', publicWriteLimiter, async(req,res)=>{
  try{
    await ensureDBConnection(); const orderNumber=sanitizePlainText(req.body?.orderNumber,80),phone=normalizePhoneNumber(req.body?.phone);if(!orderNumber||!phone)return res.status(400).json({message:'رقم الطلب ورقم الهاتف مطلوبان'});
    const order=await Order.findOne({orderNumber,customerPhone:phone});if(!order)return res.status(404).json({message:'لم يتم العثور على الطلب بهذه البيانات'});
    if(order.status==='cancelled')return res.status(400).json({message:'لا يمكن إنشاء طلب استرجاع لطلب ملغي'});
    if(!String(order.posInvoiceId||'').trim())return res.status(400).json({message:'لا يمكن طلب استبدال أو استرجاع قبل إنشاء فاتورة البيع من Technology POS'});
    const reason=sanitizePlainText(req.body?.reason,300);if(!reason)return res.status(400).json({message:'سبب الطلب مطلوب'}); const type=req.body?.type==='exchange'?'exchange':'return';
    const requested=Array.isArray(req.body?.items)?req.body.items:[]; const items=(order.items||[]).filter((_,i)=>!requested.length||requested.some(x=>Number(x.index)===i)).map(i=>({title:i.title,variant:i.variant,quantity:i.quantity}));
    const returnNumber=`RET-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000+Math.random()*9000)}`;
    const doc=await ReturnRequest.create({returnNumber,orderId:order._id,orderNumber:order.orderNumber,customerName:order.customerName,customerPhone:order.customerPhone,type,reason,details:sanitizePlainText(req.body?.details,1000),items,status:'pending',history:[{status:'pending',at:new Date(),note:'تم استلام الطلب من العميل',user:'العميل'}]});
    await VisitorEvent.create({visitorId:order.visitorId||'',sessionId:order.sessionId||'',type:'return_started',orderNumber:order.orderNumber,value:order.total,metadata:{returnNumber,type}}).catch(()=>null);
    res.status(201).json({success:true,returnNumber:doc.returnNumber,status:doc.status});
  }catch(err){res.status(500).json({message:'تعذر إرسال طلب الاستبدال أو الاسترجاع'});}
});
app.get('/api/returns/track', publicWriteLimiter, async(req,res)=>{try{const returnNumber=sanitizePlainText(req.query.returnNumber,80),phone=normalizePhoneNumber(req.query.phone);const doc=await ReturnRequest.findOne({returnNumber,customerPhone:phone}).lean();if(!doc)return res.status(404).json({message:'لم يتم العثور على الطلب'});res.json({returnNumber:doc.returnNumber,orderNumber:doc.orderNumber,type:doc.type,status:doc.status,reason:doc.reason,items:doc.items,history:doc.history,createdAt:doc.createdAt});}catch(err){res.status(500).json({message:'تعذر تتبع الطلب'});}});
app.get('/api/admin/returns', requireAdminAuth, requirePermission('manage_returns'), async(req,res)=>{const q={};if(req.query.status)q.status=sanitizePlainText(req.query.status,30);res.json(await ReturnRequest.find(q).sort({createdAt:-1}).limit(500).lean());});
app.put('/api/admin/returns/:id', requireAdminAuth, requirePermission('manage_returns'), async(req,res)=>{try{const allowed=['pending','approved','rejected','received','refunded','replaced','closed'];const status=allowed.includes(req.body?.status)?req.body.status:null;const doc=await ReturnRequest.findById(req.params.id);if(!doc)return res.status(404).json({message:'الطلب غير موجود'});if(status&&status!==doc.status){doc.status=status;doc.history.push({status,at:new Date(),note:sanitizePlainText(req.body?.note,500),user:req.adminUser.username});}if(req.body?.adminNote!==undefined)doc.adminNote=sanitizePlainText(req.body.adminNote,1000);doc.updatedAt=new Date();await doc.save();await logActivity('تحديث مرتجع',`${doc.returnNumber} → ${doc.status}`,req.adminUser.username);res.json(doc);}catch(err){res.status(500).json({message:'تعذر تحديث الطلب'});}});

app.get('/api/admin/security/sessions', requireAdminAuth, async(req,res)=>{const docs=await AdminSession.find({userId:req.adminUser._id,expiresAt:{$gt:new Date()}}).sort({lastSeenAt:-1}).lean();res.json(docs.map(x=>({_id:x._id,jti:x.jti===req.adminJwt?.jti?'current':x.jti.slice(0,8),ip:x.ip,deviceLabel:x.deviceLabel,userAgent:x.userAgent,createdAt:x.createdAt,lastSeenAt:x.lastSeenAt,expiresAt:x.expiresAt,revokedAt:x.revokedAt,current:x.jti===req.adminJwt?.jti})));});
app.post('/api/admin/security/sessions/:id/revoke', requireAdminAuth, async(req,res)=>{const session=await AdminSession.findOne({_id:req.params.id,userId:req.adminUser._id});if(!session)return res.status(404).json({message:'الجلسة غير موجودة'});session.revokedAt=new Date();await session.save();res.json({success:true,current:session.jti===req.adminJwt?.jti});});
app.post('/api/admin/security/sessions/revoke-others', requireAdminAuth, async(req,res)=>{await AdminSession.updateMany({userId:req.adminUser._id,jti:{$ne:req.adminJwt?.jti||''},revokedAt:null},{$set:{revokedAt:new Date()}});res.json({success:true});});
app.post('/api/admin/logout', requireAdminAuth, async(req,res)=>{try{if(req.adminJwt?.jti)await AdminSession.updateOne({userId:req.adminUser._id,jti:req.adminJwt.jti},{$set:{revokedAt:new Date()}});await logActivity('تسجيل خروج','تم إنهاء جلسة الإدارة الحالية',req.adminUser.username);res.json({success:true});}catch(_){res.json({success:true});}});
app.post('/api/admin/security/2fa/setup', requireAdminAuth, async(req,res)=>{const user=await AdminUser.findById(req.adminUser._id);const secret=generateTotpSecret();user.totpPendingSecret=secret;await user.save();const issuer=encodeURIComponent('Technology Store Admin');const account=encodeURIComponent(user.username);res.json({secret,otpauthUri:`otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&digits=6&period=30`});});
app.post('/api/admin/security/2fa/enable', requireAdminAuth, async(req,res)=>{const user=await AdminUser.findById(req.adminUser._id);if(!user?.totpPendingSecret||!verifyTotp(user.totpPendingSecret,req.body?.code))return res.status(400).json({message:'رمز التحقق غير صحيح'});user.totpSecret=user.totpPendingSecret;user.totpPendingSecret='';user.totpEnabled=true;await user.save();await logActivity('تفعيل 2FA','تم تفعيل المصادقة الثنائية',user.username);res.json({success:true});});
app.post('/api/admin/security/2fa/disable', requireAdminAuth, async(req,res)=>{const user=await AdminUser.findById(req.adminUser._id);if(user.totpEnabled&&user.totpSecret&&!verifyTotp(user.totpSecret,req.body?.code))return res.status(400).json({message:'رمز التحقق غير صحيح'});user.totpEnabled=false;user.totpSecret='';user.totpPendingSecret='';await user.save();await logActivity('إلغاء 2FA','تم إلغاء المصادقة الثنائية',user.username);res.json({success:true});});

app.get('/api/admin/system/health', requireAdminAuth, requireAnyPermission('view_reports','manage_system','manage_security'), async(req,res)=>{
  try{const settings=await getOrCreateSettings();const [lastSync,pendingPos,lastBackup,activeCarts,pendingReturns,totalProducts,totalOrders]=await Promise.all([Product.findOne({lastSyncedAt:{$ne:null}}).sort({lastSyncedAt:-1}).select('lastSyncedAt').lean(),Order.countDocuments({status:{$in:['pending','received_by_pos']},$or:[{posInvoiceId:''},{posInvoiceId:null},{posInvoiceId:{$exists:false}}]}),BackupRecord.findOne().sort({createdAt:-1}).lean(),AbandonedCart.countDocuments({status:'active'}),ReturnRequest.countDocuments({status:'pending'}),Product.countDocuments(),Order.countDocuments()]);res.json({generatedAt:new Date().toISOString(),database:{ok:mongoose.connection.readyState===1,state:mongoose.connection.readyState},cloudinary:{ok:Boolean(process.env.CLOUDINARY_CLOUD_NAME&&process.env.CLOUDINARY_API_KEY&&process.env.CLOUDINARY_API_SECRET)},pos:{configured:Boolean(String(settings.posApiKey||process.env.POS_API_KEY||'').trim()),lastProductSync:lastSync?.lastSyncedAt||null,pendingOrders:pendingPos},backup:{last:lastBackup,cronConfigured:Boolean(process.env.CRON_SECRET)},store:{products:totalProducts,orders:totalOrders,activeAbandonedCarts:activeCarts,pendingReturns},runtime:{node:process.version,uptimeSeconds:Math.round(process.uptime()),environment:process.env.VERCEL_ENV||process.env.NODE_ENV||'local'}});}catch(err){res.status(500).json({message:'تعذر فحص النظام',error:err.message});}
});
app.get('/api/admin/pos/health', requireAdminAuth, requireAnyPermission('view_reports','manage_system','manage_security'), async(req,res)=>{const settings=await getOrCreateSettings();const last=await Product.findOne({lastSyncedAt:{$ne:null}}).sort({lastSyncedAt:-1}).select('lastSyncedAt').lean();const [syncedProducts,pendingOrders,receivedOrders]=await Promise.all([Product.countDocuments({source:'pos'}),Order.countDocuments({status:'pending'}),Order.countDocuments({status:'received_by_pos'})]);const invoicedOrders=await Order.countDocuments({posInvoiceId:{$exists:true,$nin:['',null]}});res.json({configured:Boolean(String(settings.posApiKey||process.env.POS_API_KEY||'').trim()),lastProductSync:last?.lastSyncedAt||null,syncedProducts,pendingOrders,receivedOrders,invoicedOrders});});

async function buildV9BackupData(){const [categories,products,settings,orders,analytics,coupons,reviews,stockNotify,returns]=await Promise.all([Category.find().lean(),Product.find().lean(),Settings.find().lean(),Order.find().lean(),Analytics.find().lean(),Coupon.find().lean(),Review.find().lean(),StockNotify.find().lean(),ReturnRequest.find().lean()]);return{backupVersion:9,createdAt:new Date().toISOString(),categories,products,settings,orders,analytics,coupons,reviews,stockNotify,returns};}
async function createCloudBackup(trigger='manual',triggeredBy='system'){
  let tmpPath = '';
  try {
    if (!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) throw new Error('Cloudinary غير مضبوط');
    const data = await buildV9BackupData();
    const json = JSON.stringify(data);
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const publicId = `technology-store/backups/backup_${stamp}`;
    tmpPath = path.join('/tmp', `technology-store-backup-${stamp}.json`);
    fs.writeFileSync(tmpPath, json, { encoding:'utf8', mode:0o600 });
    // النسخ الاحتياطية قد تحتوي بيانات عملاء؛ لذلك ترفع كأصل authenticated وليس رابطاً عاماً.
    const result = await cloudinary.uploader.upload(tmpPath, { resource_type:'raw', type:'authenticated', public_id:publicId, overwrite:false });
    const rec = await BackupRecord.create({ publicId:result.public_id, url:'', bytes:Buffer.byteLength(json), status:'success', trigger, triggeredBy });
    const old = await BackupRecord.find({status:'success'}).sort({createdAt:-1}).skip(14).lean();
    for (const x of old) {
      if (x.publicId) cloudinary.uploader.destroy(x.publicId,{resource_type:'raw',type:'authenticated',invalidate:true}).catch(()=>null);
      await BackupRecord.deleteOne({_id:x._id}).catch(()=>null);
    }
    return rec;
  } catch(err) {
    await BackupRecord.create({status:'failed',trigger,triggeredBy,error:String(err.message||err).slice(0,500)}).catch(()=>null);
    throw err;
  } finally {
    if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch (_) {} }
  }
}
app.get('/api/admin/backups/cloud', requireAdminAuth, requirePermission('manage_backup'), async(req,res)=>{res.json(await BackupRecord.find().sort({createdAt:-1}).limit(50).select('-url').lean());});
app.get('/api/admin/backups/cloud/:id/link', requireAdminAuth, requirePermission('manage_backup'), async(req,res)=>{try{const rec=await BackupRecord.findById(req.params.id).lean();if(!rec||rec.status!=='success'||!rec.publicId)return res.status(404).json({message:'النسخة غير موجودة'});const url=cloudinary.url(rec.publicId,{resource_type:'raw',type:'authenticated',secure:true,sign_url:true});res.json({url});}catch(err){res.status(500).json({message:'تعذر إنشاء رابط التحميل الآمن'});}});
app.post('/api/admin/backups/cloud', requireAdminAuth, requirePermission('manage_backup'), async(req,res)=>{try{const rec=await createCloudBackup('manual',req.adminUser.username);await logActivity('نسخة احتياطية سحابية',`تم إنشاء ${rec.publicId}`,req.adminUser.username);res.json({_id:rec._id,publicId:rec.publicId,bytes:rec.bytes,status:rec.status,trigger:rec.trigger,triggeredBy:rec.triggeredBy,createdAt:rec.createdAt});}catch(err){res.status(500).json({message:err.message});}});
app.get('/api/cron/backup', async(req,res)=>{try{const secret=String(process.env.CRON_SECRET||'');const supplied=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!secret)return res.status(503).json({message:'CRON_SECRET غير مضبوط'});if(supplied!==secret)return res.status(401).json({message:'Unauthorized'});const rec=await createCloudBackup('cron','Vercel Cron');res.json({success:true,id:rec._id});}catch(err){res.status(500).json({message:err.message});}});

// تشغيل السيرفر محلياً
const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على منفذ: ${PORT}`));
}

// التصدير الصحيح والكامل للـ Serverless (تم تعديل الـ le.exports الخطأ)
module.exports = app;
module.exports.handler = serverless(app);
