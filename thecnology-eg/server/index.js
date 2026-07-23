const express = require('express');
const fs = require('fs');
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
  discountExpiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

// تعريف موديل إعدادات المتجر (Settings Schema)
const settingsSchema = new mongoose.Schema({
  defaultProductImage: { type: String, default: '' },
  lightHeroImage: { type: String, default: 'main-banner.png' },
  createdAt: { type: Date, default: Date.now }
});
const Settings = mongoose.model('Settings', settingsSchema);

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
    
    res.json({ message: 'تم استعادة النسخة الاحتياطية بنجاح!' });
  } catch (err) {
    console.error('RESTORE ERROR:', err);
    res.status(500).json({ message: 'خطأ أثناء استعادة النسخة الاحتياطية', error: err.message });
  }
});

// --- الـ API Routes ---

// 1. جلب كل المنتجات
app.get('/api/products', async (req, res) => {
  try {
    const now = new Date();
    
    // Check and update expired discounts safely
    try {
      await Product.updateMany(
        { discountExpiresAt: { $lt: now, $type: 'date' } },
        { $unset: { oldPrice: 1, discountExpiresAt: 1 } }
      );
    } catch (updateErr) {
      console.error('Error updating expired discounts:', updateErr);
    }

    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    console.error('GET /api/products error:', error);
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
});

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
        folder: 'technology_store'
      });
      image = mainResult.secure_url;
      imagePublicId = mainResult.public_id;

      for (let i = 1; i < uploadedFiles.length; i++) {
        const result = await cloudinary.uploader.upload(uploadedFiles[i].tempFilePath, {
          folder: 'technology_store'
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
          folder: 'technology_store'
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

// 2. تحديث الصورة الافتراضية أو صورة البانر الفاتح
app.post('/api/settings', async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    let updated = false;

    if (req.files && req.files.defaultProductImage) {
      const result = await cloudinary.uploader.upload(req.files.defaultProductImage.tempFilePath, {
        folder: 'technology_store_settings'
      });
      settings.defaultProductImage = result.secure_url;
      updated = true;
    }

    if (req.files && req.files.lightHeroImage) {
      const result = await cloudinary.uploader.upload(req.files.lightHeroImage.tempFilePath, {
        folder: 'technology_store_settings'
      });
      settings.lightHeroImage = result.secure_url;
      updated = true;
    }

    if (!updated) {
      return res.status(400).json({ message: 'يرجى رفع صورة أولاً' });
    }

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