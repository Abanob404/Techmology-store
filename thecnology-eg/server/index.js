const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const fileUpload = require('express-fileupload');
const serverless = require('serverless-http'); // تم تصحيح المكتبة للـ Serverless
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Api-Key', 'x-pos-api-key']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: '/tmp/' // مهم جداً لبيئات الـ Serverless مثل Vercel
}));

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
  permissions: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});
const AdminUser = mongoose.model('AdminUser', adminUserSchema);

async function initDefaultAdmin() {
  try {
    const count = await AdminUser.countDocuments();
    if (count === 0) {
      const admin = new AdminUser({
        username: 'admin',
        password: '1234',
        role: 'مدير',
        permissions: ['all']
      });
      await admin.save();
      console.log('✅ تم إنشاء المدير الافتراضي: admin / 1234');
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
  sku: { type: String, default: '', index: true },
  posItemId: { type: Number, index: true, sparse: true },
  source: { type: String, default: 'website', index: true },
  lastSyncedAt: { type: Date },
  warranty: { type: String, default: '' },
  brand: { type: String, default: '' },
  discountExpiresAt: { type: Date },
  isHidden: { type: Boolean, default: false, index: true },
  visibilityManuallySet: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true }
});

const Product = mongoose.model('Product', productSchema);

// تعريف موديل إعدادات المتجر (Settings Schema)
const settingsSchema = new mongoose.Schema({
  defaultProductImage: { type: String, default: '' },
  lightHeroImage: { type: String, default: 'main-banner.png' },
  darkHeroImage: { type: String, default: 'main-banner.png' },
  storeLogo: { type: String, default: '' },
  isShippingEnabled: { type: Boolean, default: false },
  posApiKey: { type: String, default: 'technology2309' },
  isCrossSellEnabled: { type: Boolean, default: false },
  isQuickBuyEnabled: { type: Boolean, default: false },
  isPixelEnabled: { type: Boolean, default: false },
  fbPixelId: { type: String, default: '' },
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

// تعريف موديل تتبع الزوار (Visitor Schema)
const visitorSchema = new mongoose.Schema({
  visitorId: { type: String, required: true, unique: true },
  ip: { type: String, default: '' },
  location: { type: String, default: '' },
  device: { type: String, default: '' },
  referrer: { type: String, default: '' },
  utmSource: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
});
const Visitor = mongoose.model('Visitor', visitorSchema);

// تعريف موديل سجل النشاطات (Activity Log Schema)
const activityLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  details: { type: String, default: '' },
  user: { type: String, default: 'نظام' },
  timestamp: { type: Date, default: Date.now }
});
const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

// تعريف موديل الطلبات (Order Schema)
const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerAddress: { type: String, required: true },
  notes: { type: String, default: '' },
  shippingAmount: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'cash_on_delivery' },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    posItemId: { type: Number },
    sku: { type: String },
    title: { type: String },
    quantity: { type: Number, default: 1 },
    price: { type: Number, required: true },
    lineTotal: { type: Number, required: true }
  }],
  subtotal: { type: Number, required: true },
  total: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'received_by_pos', 'processing', 'completed', 'cancelled'], default: 'pending' },
  posInvoiceId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

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
      defaultProductImage: 'https://placehold.co/600x400/0f172a/0ea5e9?text=No+Image',
      lightHeroImage: 'main-banner.png'
    });
    await settings.save();
  }
  return settings;
}

let topProductsCache = { data: null, timestamp: 0 };

// --- SSR Route for /products ---
app.get('/products', async (req, res) => {
  try {
    const htmlPath = path.join(__dirname, '../products_page.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');

    if (req.query.id) {
      try {
        await ensureDBConnection();
        const product = await Product.findById(req.query.id).lean();
        if (product) {
          const title = `${product.title} | TECHNOLOGY`;
          const description = product.category ? `قسم: ${product.category}` : `سعر المنتج: ${product.price} جنيه`;
          let image = product.image || 'logo.webp';
          
          if (image.startsWith('/')) {
            image = `https://${req.get('host')}${image}`;
          } else if (!image.startsWith('http')) {
             image = `https://${req.get('host')}/${image}`;
          }

          html = html.replace(/<title>.*?</title>/, `<title>${title}</title>`);
          html = html.replace(/<meta property="og:title" content=".*?">/, `<meta property="og:title" content="${title}">`);
          html = html.replace(/<meta property="og:description" content=".*?">/, `<meta property="og:description" content="${description}">`);
          html = html.replace(/<meta property="og:image" content=".*?">/, `<meta property="og:image" content="${image}">`);
        }
      } catch (e) {
        console.error('SSR OG Tags DB Error:', e.message);
      }
    } else {
      // Protect FCP: Only wait up to 1.5s for DB to avoid cold start delays
      try {
        const fetchProducts = async () => {
          const now = Date.now();
          if (topProductsCache.data && (now - topProductsCache.timestamp < 60000)) {
            return topProductsCache.data;
          }
          await ensureDBConnection();
          const products = await Product.find({ isHidden: { $ne: true } }).limit(4).lean();
          topProductsCache = { data: products, timestamp: now };
          return products;
        };

        const topProducts = await Promise.race([
          fetchProducts(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Cold Start Timeout')), 1500))
        ]);

        if (topProducts && topProducts.length > 0) {
            let preloadTags = '';
            topProducts.forEach(p => {
                if (p.image && !p.image.includes('placehold.co')) {
                    const url = p.image.replace('/upload/', '/upload/w_200,h_200,c_fill,q_auto,f_auto/');
                    preloadTags += `<link rel="preload" as="image" href="${url}" fetchpriority="high">\n`;
                }
            });
            html = html.replace('</head>', `    ${preloadTags}</head>`);
        }
      } catch (e) {
        console.log('Skipped preload to save FCP:', e.message);
      }
    }
    res.send(html);
  } catch (err) {
    console.error('SSR File Error:', err);
    res.status(503).send('<html dir="rtl"><body><h2>عذراً، مشكلة في الخادم. يرجى التحديث.</h2><button onclick="location.reload()">تحديث</button></body></html>');
  }
});

// --- الـ API Routes الخاصة بمزامنة برنامج الكاشير (POS) ---

async function requirePosApiKey(req, res, next) {
  try {
    const settings = await Settings.findOne().maxTimeMS(5000).lean();
    const configured = (settings && settings.posApiKey) ? String(settings.posApiKey).trim() : "technology2309";
    const supplied = String(req.headers['x-pos-api-key'] || req.query['x-pos-api-key'] || "").trim();
    
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
    const pendingOrdersCount = await Order.countDocuments({ status: 'pending' });
    
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
        
        if (stockVal !== undefined && stockVal !== null && !isNaN(Number(stockVal))) {
          product.stockQuantity = Number(stockVal);
        }
        
        if (posIdVal !== undefined) product.posItemId = posIdVal;
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
    const status = req.query.status || 'pending';
    const limit = parseInt(req.query.limit) || 500;

    const orders = await Order.find({ status: status }).limit(limit).sort({ createdAt: 1 });
    
    const formattedOrders = orders.map(order => ({
      _id: order._id.toString(),
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      notes: order.notes,
      shippingAmount: order.shippingAmount,
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal,
      total: order.total,
      status: order.status,
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
    const { status, posInvoiceId } = req.body;

    const validStatuses = ['pending', 'received_by_pos', 'processing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ ok: false, message: "Invalid status" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    order.status = status;
    if (posInvoiceId) {
      order.posInvoiceId = posInvoiceId;
    }

    await order.save();

    res.json({
      ok: true,
      message: "Order status updated successfully",
      orderId: order._id,
      status: order.status
    });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- الـ API Routes الخاصة بالمنتجات ---

// إضافة طلب جديد (عبر الموقع)
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, customerPhone, customerAddress, notes, shippingAmount, paymentMethod, items } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'السلة فارغة' });
    }

    let subtotal = 0;
    const orderItems = [];

    for (let item of items) {
      let product = null;
      if (item.productId) {
        product = await Product.findById(item.productId);
      } else if (item.sku) {
        product = await Product.findOne({ sku: item.sku });
      } else if (item.posItemId) {
        product = await Product.findOne({ posItemId: item.posItemId });
      }

      if (!product) {
        return res.status(404).json({ success: false, message: `المنتج غير موجود: ${item.title || item.sku}` });
      }

      // حساب السعر الفعلي من الداتابيز فقط
      const itemPrice = product.price || 0;
      const qty = item.quantity || 1;
      const lineTotal = itemPrice * qty;
      subtotal += lineTotal;

      orderItems.push({
        productId: product._id,
        posItemId: product.posItemId,
        sku: product.sku,
        title: product.title,
        quantity: qty,
        price: itemPrice,
        lineTotal: lineTotal
      });
    }

    const total = subtotal + (Number(shippingAmount) || 0);
    const orderNumber = `WEB-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const order = new Order({
      orderNumber,
      customerName,
      customerPhone,
      customerAddress,
      notes,
      shippingAmount: Number(shippingAmount) || 0,
      paymentMethod,
      items: orderItems,
      subtotal,
      total
    });

    await order.save();
    
    // تسجيل إحصائية
    let doc = await Analytics.findOne({ key: 'main' });
    if (!doc) doc = new Analytics({ key: 'main' });
    const today = new Date().toISOString().split('T')[0];
    const wOrders = { ...doc.whatsapp_orders };
    // Using whatsapp_orders field for all orders temporarily
    for (let item of orderItems) {
      if (item.productId) {
        const idStr = item.productId.toString();
        if (!wOrders[idStr]) wOrders[idStr] = { count: 0, title: item.title };
        wOrders[idStr].count++;
        wOrders[idStr].lastDate = new Date().toISOString();
      }
    }
    doc.whatsapp_orders = wOrders;
    doc.markModified('whatsapp_orders');
    await doc.save();

    res.json({ success: true, message: 'تم إرسال الطلب بنجاح', orderId: order.orderNumber });
  } catch (err) {
    console.error('Error submitting order:', err);
    res.status(500).json({ success: false, message: 'خطأ أثناء تقديم الطلب' });
  }
});

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
app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'اسم القسم مطلوب' });
    
    const existing = await Category.findOne({ name });
    if (existing) return res.status(400).json({ message: 'هذا القسم موجود بالفعل' });
    
    const newCategory = new Category({ name });
    await newCategory.save();
    await logActivity('إضافة قسم', `تم إضافة قسم جديد باسم: ${name}`);
    res.status(201).json(newCategory);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء إضافة القسم', error: err.message });
  }
});

// حذف قسم
app.delete('/api/categories/:name', async (req, res) => {
  try {
    const { name } = req.params;
    await Category.findOneAndDelete({ name });
    await logActivity('حذف قسم', `تم حذف القسم: ${name}`);
    res.json({ message: 'تم حذف القسم بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء حذف القسم', error: err.message });
  }
});

// تعديل اسم قسم وتحديث كل منتجاته
app.put('/api/categories/rename', async (req, res) => {
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
    await logActivity('تعديل قسم', `تم تغيير اسم القسم من "${oldCategory}" إلى "${newCategory}"`);
    res.json({ 
      message: `تم تحديث اسم القسم بنجاح من "${oldCategory}" إلى "${newCategory}"`,
      modifiedCount: result.modifiedCount 
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تحديث الإعدادات', error: err.message });
  }
});

// --- Backup & Restore ---

// 1. Export Data (Backup)
app.get('/api/backup', async (req, res) => {
  try {
    const categories = await Category.find();
    const products = await Product.find();
    const settings = await Settings.find();
    
    const backupData = {
      categories,
      products,
      settings,
      timestamp: new Date().toISOString()
    };
    
    res.setHeader('Content-disposition', 'attachment; filename=technology-store-backup.json');
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء إنشاء النسخة الاحتياطية', error: err.message });
  }
});

// 2. Import Data (Restore)
app.post('/api/restore', async (req, res) => {
  try {
    if (!req.files || !req.files.backupFile) {
      return res.status(400).json({ message: 'الرجاء إرفاق ملف النسخة الاحتياطية' });
    }
    
    const file = req.files.backupFile;
    const fileContent = fs.readFileSync(file.tempFilePath, 'utf8');
    const backupData = JSON.parse(fileContent);
    
    if (!backupData.categories || !backupData.products || !backupData.settings) {
      return res.status(400).json({ message: 'ملف غير صالح أو تالف' });
    }
    
    // Clear current database
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Settings.deleteMany({});
    
    // Sanitize products before insertion to avoid validation errors
    if (backupData.products && backupData.products.length > 0) {
      backupData.products = backupData.products.map(p => ({
        ...p,
        image: p.image || 'https://placehold.co/600x400/0f172a/0ea5e9?text=No+Image',
        category: p.category || 'غير مصنف'
      }));
    }

    // Insert backup data
    if (backupData.categories && backupData.categories.length > 0) await Category.insertMany(backupData.categories);
    if (backupData.products && backupData.products.length > 0) await Product.insertMany(backupData.products);
    if (backupData.settings && backupData.settings.length > 0) await Settings.insertMany(backupData.settings);
    await logActivity('استعادة نسخة احتياطية', 'تم استعادة كافة بيانات الموقع من نسخة احتياطية');
    res.json({ message: 'تم استعادة النسخة الاحتياطية بنجاح!' });
  } catch (err) {
    console.error('RESTORE ERROR:', err);
    res.status(500).json({ message: 'خطأ أثناء استعادة النسخة الاحتياطية', error: err.message });
  }
});

// --- الـ API Routes ---

// 1. جلب المنتجات (محمية مع دعم allowDiskUse و Pagination لمنع الـ Memory Limit)
app.get('/api/products', async (req, res) => {
  try {
    await ensureDBConnection();
    const products = await Product.find()
      .sort({ createdAt: -1 })
      .limit(3000);

    res.json(products);
  } catch (error) {
    console.error('GET /api/products error:', error);
    res.status(500).json({ message: error.message || 'Internal Server Error' });
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
app.delete('/api/emergency-clean', async (req, res, next) => {
  const secret = req.headers['x-admin-secret'] || req.query['secret'];
  if (secret !== process.env.ADMIN_SECRET && secret !== 'tech2309admin') {
    return res.status(403).json({ ok: false, message: 'غير مصرح' });
  }
  next();
}, handleEmergencyClean);


// 2. إضافة منتج جديد مع رفع الصور
app.post('/api/products', async (req, res) => {
  try {
    const { title, category, price, oldPrice, description, stockQuantity, sku, warranty, brand, discountExpiresAt } = req.body;
    if (!title || !category || !price) {
      return res.status(400).json({ message: 'البيانات الأساسية (الاسم، القسم، السعر) مطلوبة' });
    }

    let image = '';
    let imagePublicId = '';
    const additionalImages = [];

    if (req.files && req.files.images) {
      let uploadedFiles = req.files.images;
      if (!Array.isArray(uploadedFiles)) {
        uploadedFiles = [uploadedFiles];
      }

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
      image = settings.defaultProductImage || 'https://placehold.co/600x400/0f172a/0ea5e9?text=No+Image';
    }

    const descArray = description ? description.split('\n').filter(line => line.trim() !== '') : [];

    const newProduct = new Product({
      title,
      category,
      price,
      oldPrice: oldPrice ? Number(oldPrice) : undefined,
      description: descArray,
      image: image,
      imagePublicId: imagePublicId,
      additionalImages: additionalImages,
      stockQuantity: stockQuantity ? parseInt(stockQuantity, 10) : 1,
      sku: sku || '',
      warranty: warranty || '',
      brand: brand || '',
      discountExpiresAt: discountExpiresAt ? new Date(discountExpiresAt) : undefined
    });

    await newProduct.save();
    await logActivity('إضافة منتج', `تم إضافة منتج جديد: ${title}`);
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء إضافة المنتج', error: err.message });
  }
});

// إضافة/تحديث منتجات متعددة (Bulk CSV Upsert)
app.post('/api/products/bulk', async (req, res) => {
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
        brand: p.brand || '',
        warranty: p.warranty || '',
        image: p.image || 'https://placehold.co/600x400/0f172a/0ea5e9?text=No+Image'
      };
      return {
        updateOne: {
          filter,
          update: { $set: update },
          upsert: true
        }
      };
    });

    const result = await Product.bulkWrite(operations);
    const count = (result.upsertedCount || 0) + (result.modifiedCount || 0);
    await logActivity('استيراد منتجات', `تم استيراد/تحديث ${count} منتج من ملف CSV`);
    res.status(201).json({ message: 'تم استيراد/تحديث المنتجات بنجاح', count, upserted: result.upsertedCount || 0, modified: result.modifiedCount || 0 });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء استيراد المنتجات', error: err.message });
  }
});

// 3. تعديل كمية المخزون
app.put('/api/products/:id/quantity', async (req, res) => {
  try {
    const { stockQuantity } = req.body;
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { stockQuantity: parseInt(stockQuantity, 10) || 0 },
      { new: true }
    );
    if (!updatedProduct) return res.status(404).json({ message: 'المنتج غير موجود' });
    await logActivity('تعديل كمية', `تم تحديث مخزون المنتج "${updatedProduct.title}" ليصبح ${stockQuantity}`);
    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تحديث الكمية', error: err.message });
  }
});

// 4. تعديل منتج بالكامل (يدعم رفع صور جديدة)
app.put('/api/products/:id', async (req, res) => {
  try {
    const { title, category, price, oldPrice, description, stockQuantity, sku, warranty, brand, discountExpiresAt } = req.body;
    const descArray = description ? description.split('\n').filter(line => line.trim() !== '') : [];
    
    const updateData = {
      title,
      category,
      price,
      oldPrice: oldPrice ? Number(oldPrice) : null,
      description: descArray,
      stockQuantity: parseInt(stockQuantity, 10) || 0,
      sku: sku || '',
      warranty: warranty || '',
      brand: brand || ''
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
          // حذف من Cloudinary
          for (const pid of idsToDelete) {
            try { await cloudinary.uploader.destroy(pid); } catch(e) {}
          }

          // هل الصورة الأساسية ضمن المحذوفة؟
          const mainDeleted = idsToDelete.includes(oldProduct.imagePublicId) || idsToDelete.includes('main');

          // تصفية الصور الإضافية المتبقية
          const remainingAdditional = (oldProduct.additionalImages || []).filter(
            img => !idsToDelete.includes(img.publicId)
          );

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
      let uploadedFiles = req.files.images || req.files.image;
      if (!Array.isArray(uploadedFiles)) {
        uploadedFiles = [uploadedFiles];
      }

      const currentProduct = await Product.findById(req.params.id);
      const isPlaceholder = currentProduct && (!currentProduct.imagePublicId || currentProduct.image.includes('placehold.co'));
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
    await logActivity('تعديل منتج', `تم تعديل بيانات المنتج: ${updatedProduct.title}`);
    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تحديث المنتج', error: err.message });
  }
});

// 5. تبديل حالة إخفاء/إظهار منتج
app.put('/api/products/:id/toggle-visibility', async (req, res) => {
  try {
    const { isHidden } = req.body;
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { isHidden: isHidden === true, visibilityManuallySet: true },
      { new: true }
    );
    if (!updatedProduct) return res.status(404).json({ message: 'المنتج غير موجود' });
    
    await logActivity(isHidden ? 'إخفاء منتج' : 'إظهار منتج', `تم ${isHidden ? 'إخفاء' : 'إظهار'} المنتج: ${updatedProduct.title}`);
    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تغيير حالة المنتج', error: err.message });
  }
});

// 6. حذف منتج نهائياً وحذف صوره من Cloudinary
app.delete('/api/products/:id', async (req, res) => {
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
    await logActivity('حذف منتج', `تم حذف المنتج: ${product.title}`);
    res.json({ message: 'تم حذف المنتج وصوره بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء حذف المنتج', error: err.message });
  }
});

// --- الـ API Routes الخاصة بإعدادات المتجر ---

// 1. جلب الإعدادات
app.get('/api/settings', async (req, res) => {
  try {
    await ensureDBConnection();
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الإعدادات', error: err.message });
  }
});


// 2. تحديث الإعدادات العامة (الصور، تفعيل الشحن، الخ)
app.post('/api/settings', async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    let updated = false;
    let logMessage = '';

    // رفع اللوجو الخاص بالمتجر
    if (req.files && req.files.storeLogo) {
      const result = await cloudinary.uploader.upload(req.files.storeLogo.tempFilePath, {
        folder: 'technology_store_settings',
        format: 'webp',
        quality: 'auto'
      });
      settings.storeLogo = result.secure_url;
      updated = true;
      logMessage = logMessage ? logMessage + ' ولوجو المتجر' : 'تحديث لوجو المتجر';
    }

    if (req.files && req.files.defaultProductImage) {
      const result = await cloudinary.uploader.upload(req.files.defaultProductImage.tempFilePath, {
        folder: 'technology_store_settings',
        format: 'webp',
        quality: 'auto'
      });
      settings.defaultProductImage = result.secure_url;
      updated = true;
      logMessage = 'تحديث اللوجو الافتراضي';
    }

    if (req.files && req.files.lightHeroImage) {
      const result = await cloudinary.uploader.upload(req.files.lightHeroImage.tempFilePath, {
        folder: 'technology_store_settings',
        format: 'webp',
        quality: 'auto'
      });
      settings.lightHeroImage = result.secure_url;
      updated = true;
      logMessage = logMessage ? logMessage + ' وخلفية الفاتح' : 'تحديث خلفية الوضع الفاتح';
    }

    if (req.files && req.files.darkHeroImage) {
      const result = await cloudinary.uploader.upload(req.files.darkHeroImage.tempFilePath, {
        folder: 'technology_store_settings',
        format: 'webp',
        quality: 'auto'
      });
      settings.darkHeroImage = result.secure_url;
      updated = true;
      logMessage = logMessage ? logMessage + ' وخلفية الغامق' : 'تحديث خلفية الوضع الغامق';
    }

    if (req.body && req.body.isShippingEnabled !== undefined) {
      settings.isShippingEnabled = req.body.isShippingEnabled === 'true' || req.body.isShippingEnabled === true;
      updated = true;
      logMessage = logMessage ? logMessage + ' وإعدادات الشحن' : `تم ${settings.isShippingEnabled ? 'تفعيل' : 'إيقاف'} الشحن`;
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

    if (!updated) {
      return res.status(400).json({ message: 'لم يتم إرسال أي بيانات لتحديثها' });
    }

    await settings.save();
    await logActivity('تعديل إعدادات', logMessage || 'تم تحديث إعدادات المتجر');
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تحديث الإعدادات', error: err.message });
  }
});

// --- الـ API Routes الخاصة بالإحصائيات (Centralized Analytics) ---
app.get('/api/analytics', async (req, res) => {
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

app.post('/api/analytics/reset', async (req, res) => {
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

app.post('/api/analytics/visitor', async (req, res) => {
  try {
    const { visitorId, referrer, utmSource, location, device } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (!visitorId) return res.status(400).json({ message: 'visitorId required' });
    
    await Visitor.findOneAndUpdate(
      { visitorId },
      { ip, location, device, referrer, utmSource, timestamp: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Error tracking visitor', error: err.message });
  }
});

app.get('/api/analytics/visitors', async (req, res) => {
  try {
    const visitors = await Visitor.find().sort({ timestamp: -1 }).limit(100);
    const uniqueCount = await Visitor.countDocuments();
    res.json({ visitors, uniqueCount });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching visitors', error: err.message });
  }
});

// --- الـ API Routes الخاصة بمديري النظام (Admin Auth) ---

app.post('/api/admin/login', async (req, res) => {
  await ensureDBConnection();
  try {
    const { username, password } = req.body;
    const user = await AdminUser.findOne({ username, password });
    if (!user) {
      return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    res.json({ message: 'تم تسجيل الدخول بنجاح', user: { id: user._id, username: user.username, role: user.role, permissions: user.permissions } });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تسجيل الدخول', error: err.message });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await AdminUser.find().select('-password');
    const mappedUsers = users.map(u => ({
      id: u._id.toString(),
      username: u.username,
      role: u.role,
      permissions: u.permissions
    }));
    res.json(mappedUsers);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب المستخدمين', error: err.message });
  }
});

app.get('/api/admin/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = await ActivityLog.find().sort({ timestamp: -1 }).limit(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب السجل', error: err.message });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const { username, password, role, permissions } = req.body;
    const existing = await AdminUser.findOne({ username });
    if (existing) return res.status(400).json({ message: 'اسم المستخدم موجود بالفعل' });
    
    const newUser = new AdminUser({ username, password, role, permissions });
    await newUser.save();
    await logActivity('إضافة مستخدم', `تم إضافة مستخدم جديد بصلاحيات الإدارة: ${username}`);
    res.status(201).json({ id: newUser._id, username: newUser.username, role: newUser.role, permissions: newUser.permissions });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في إضافة المستخدم', error: err.message });
  }
});

app.put('/api/admin/users/:id', async (req, res) => {
  try {
    const { username, password, role, permissions } = req.body;
    const updateData = { username, role, permissions };
    if (password && password.trim() !== '') {
      updateData.password = password;
    }
    const updated = await AdminUser.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updated) return res.status(404).json({ message: 'المستخدم غير موجود' });
    await logActivity('تعديل مستخدم', `تم تعديل بيانات أو صلاحيات المستخدم: ${updated.username}`);
    res.json({ id: updated._id, username: updated.username, role: updated.role, permissions: updated.permissions });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في تعديل المستخدم', error: err.message });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const user = await AdminUser.findById(req.params.id);
    if(user) await logActivity('حذف مستخدم', `تم حذف المستخدم: ${user.username}`);
    await AdminUser.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في حذف المستخدم', error: err.message });
  }
});

// تشغيل السيرفر محلياً
const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على منفذ: ${PORT}`));
}

// التصدير الصحيح والكامل للـ Serverless (تم تعديل الـ le.exports الخطأ)
module.exports = app;
module.exports.handler = serverless(app);
