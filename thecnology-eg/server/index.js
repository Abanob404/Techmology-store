const express = require('express');
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
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
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
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('📦 تم الاتصال بنجاح بقاعدة البيانات MongoDB'))
  .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

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
  sku: { type: String, default: '' },
  warranty: { type: String, default: '' },
  brand: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

// تعريف موديل إعدادات المتجر (Settings Schema)
const settingsSchema = new mongoose.Schema({
  defaultProductImage: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
const Settings = mongoose.model('Settings', settingsSchema);

// دالة لجلب أو إنشاء وثيقة الإعدادات الافتراضية
async function getOrCreateSettings() {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = new Settings({ defaultProductImage: 'https://placehold.co/600x400/0f172a/0ea5e9?text=No+Image' });
    await settings.save();
  }
  return settings;
}

// --- الـ API Routes الخاصة بالأقسام ---

// جلب كل الأقسام
app.get('/api/categories', async (req, res) => {
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

    res.json({ 
      message: `تم تحديث اسم القسم بنجاح من "${oldCategory}" إلى "${newCategory}"`,
      modifiedCount: result.modifiedCount 
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تحديث القسم جماعياً', error: err.message });
  }
});

// --- الـ API Routes ---

// 1. جلب كل المنتجات
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في السيرفر أثناء جلب المنتجات', error: err.message });
  }
});

// 2. إضافة منتج جديد مع رفع الصور
app.post('/api/products', async (req, res) => {
  try {
    const { title, category, price, oldPrice, description, stockQuantity, sku, warranty, brand } = req.body;

    if (!req.files || (!req.files.image && !req.files.images)) {
      return res.status(400).json({ message: 'برجاء رفع صورة للمنتج على الأقل' });
    }

    // السماح باستخدام req.files.image أو req.files.images
    let uploadedFiles = req.files.images || req.files.image;
    if (!Array.isArray(uploadedFiles)) {
      uploadedFiles = [uploadedFiles]; // تحويل لـ array إذا كانت صورة واحدة
    }

    // رفع الصورة الأساسية (أول صورة)
    const mainResult = await cloudinary.uploader.upload(uploadedFiles[0].tempFilePath, {
      folder: 'technology_store'
    });

    // رفع باقي الصور إن وجدت
    const additionalImages = [];
    for (let i = 1; i < uploadedFiles.length; i++) {
      const result = await cloudinary.uploader.upload(uploadedFiles[i].tempFilePath, {
        folder: 'technology_store'
      });
      additionalImages.push({
        url: result.secure_url,
        publicId: result.public_id
      });
    }

    const descArray = description ? description.split('\n').filter(line => line.trim() !== '') : [];

    const newProduct = new Product({
      title,
      category,
      price,
      oldPrice: oldPrice ? Number(oldPrice) : undefined,
      description: descArray,
      image: mainResult.secure_url,
      imagePublicId: mainResult.public_id,
      additionalImages: additionalImages,
      stockQuantity: stockQuantity ? parseInt(stockQuantity, 10) : 1,
      sku: sku || '',
      warranty: warranty || '',
      brand: brand || ''
    });

    await newProduct.save();
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
    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تحديث الكمية', error: err.message });
  }
});

// 4. تعديل منتج بالكامل (يدعم رفع صور جديدة)
app.put('/api/products/:id', async (req, res) => {
  try {
    const { title, category, price, oldPrice, description, stockQuantity, sku, warranty, brand } = req.body;
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

    // إذا تم رفع صور جديدة (إضافتها للصور الحالية)
    if (req.files && (req.files.image || req.files.images)) {
      let uploadedFiles = req.files.images || req.files.image;
      if (!Array.isArray(uploadedFiles)) {
        uploadedFiles = [uploadedFiles];
      }

      const currentProduct = await Product.findById(req.params.id);
      const hasMainImage = updateData.image || (currentProduct && currentProduct.image);

      if (!hasMainImage) {
        // لا توجد صورة أساسية → أول صورة جديدة تصبح الأساسية
        const mainResult = await cloudinary.uploader.upload(uploadedFiles[0].tempFilePath, {
          folder: 'technology_store'
        });
        updateData.image = mainResult.secure_url;
        updateData.imagePublicId = mainResult.public_id;

        // باقي الصور تكون إضافية
        const newAdditional = updateData.additionalImages || currentProduct?.additionalImages || [];
        for (let i = 1; i < uploadedFiles.length; i++) {
          const result = await cloudinary.uploader.upload(uploadedFiles[i].tempFilePath, {
            folder: 'technology_store'
          });
          newAdditional.push({ url: result.secure_url, publicId: result.public_id });
        }
        updateData.additionalImages = newAdditional;
      } else {
        // توجد صورة أساسية → كل الصور الجديدة تُضاف كإضافية
        const existingAdditional = updateData.additionalImages || currentProduct?.additionalImages || [];
        for (let i = 0; i < uploadedFiles.length; i++) {
          const result = await cloudinary.uploader.upload(uploadedFiles[i].tempFilePath, {
            folder: 'technology_store'
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
    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تحديث المنتج', error: err.message });
  }
});

// 4. حذف منتج نهائياً وحذف صوره من Cloudinary
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
    res.json({ message: 'تم حذف المنتج وصوره بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء حذف المنتج', error: err.message });
  }
});

// --- الـ API Routes الخاصة بإعدادات المتجر ---

// 1. جلب الإعدادات
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الإعدادات', error: err.message });
  }
});

// 2. تحديث الصورة الافتراضية
app.post('/api/settings', async (req, res) => {
  try {
    if (!req.files || !req.files.defaultProductImage) {
      return res.status(400).json({ message: 'يرجى رفع صورة أولاً' });
    }

    const file = req.files.defaultProductImage;
    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'technology_store_settings'
    });

    const settings = await getOrCreateSettings();
    settings.defaultProductImage = result.secure_url;
    await settings.save();

    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تحديث الإعدادات', error: err.message });
  }
});

// تشغيل السيرفر محلياً
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على منفذ: ${PORT}`));

// التصدير الصحيح والكامل للـ Serverless (تم تعديل الـ le.exports الخطأ)
module.exports = app;
module.exports.handler = serverless(app);