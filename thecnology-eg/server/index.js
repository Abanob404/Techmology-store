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

// تعريف موديل المنتج (Product Schema)
const productSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  description: [String],
  image: { type: String, required: true },
  imagePublicId: String,
  stockQuantity: { type: Number, default: 1 },
  sku: { type: String, default: '' },
  warranty: { type: String, default: '' },
  brand: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

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

// 2. إضافة منتج جديد مع رفع الصورة
app.post('/api/products', async (req, res) => {
  try {
    const { title, category, price, description, stockQuantity, sku, warranty, brand } = req.body;

    if (!req.files || !req.files.image) {
      return res.status(400).json({ message: 'برجاء رفع صورة للمنتج' });
    }

    const file = req.files.image;

    // رفع الصورة إلى Cloudinary
    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'technology_store'
    });

    const descArray = description ? description.split('\n').filter(line => line.trim() !== '') : [];

    const newProduct = new Product({
      title,
      category,
      price,
      description: descArray,
      image: result.secure_url,
      imagePublicId: result.public_id,
      stockQuantity: stockQuantity ? parseInt(stockQuantity, 10) : 1,
      sku: sku || '',
      warranty: warranty || '',
      brand: brand || ''
    });

    await newProduct.save();
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء إضافة المنتج', error: err.message });
  }
});

// إضافة منتجات متعددة (Bulk CSV Import)
app.post('/api/products/bulk', async (req, res) => {
  try {
    const productsArray = req.body;
    if (!Array.isArray(productsArray) || productsArray.length === 0) {
      return res.status(400).json({ message: 'بيانات غير صالحة، يجب إرسال مصفوفة منتجات.' });
    }
    
    // إعطاء صورة افتراضية للمنتجات المستوردة
    const productsToInsert = productsArray.map(p => ({
      title: p.name || 'بدون اسم',
      category: p.category || 'أخرى',
      price: Number(p.price) || 0,
      description: p.description ? p.description.split('\n') : [],
      stockQuantity: Number(p.stockQuantity) || 0,
      sku: p.sku || '',
      brand: p.brand || '',
      warranty: p.warranty || '',
      image: 'https://placehold.co/600x400/0f172a/0ea5e9?text=No+Image'
    }));

    const result = await Product.insertMany(productsToInsert);
    res.status(201).json({ message: 'تم استيراد المنتجات بنجاح', count: result.length });
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

// 4. تعديل منتج بالكامل
app.put('/api/products/:id', async (req, res) => {
  try {
    const { title, category, price, description, stockQuantity, sku, warranty, brand } = req.body;
    const descArray = description ? description.split('\n').filter(line => line.trim() !== '') : [];
    
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        title,
        category,
        price,
        description: descArray,
        stockQuantity: parseInt(stockQuantity, 10) || 0,
        sku: sku || '',
        warranty: warranty || '',
        brand: brand || ''
      },
      { new: true }
    );
    
    if (!updatedProduct) return res.status(404).json({ message: 'المنتج غير موجود' });
    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء تحديث المنتج', error: err.message });
  }
});

// 4. حذف منتج نهائياً وحذف صورته من Cloudinary
app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });

    // حذف الصورة من كلاوديناري أولاً
    if (product.imagePublicId) {
      await cloudinary.uploader.destroy(product.imagePublicId);
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف المنتج وصورته بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء حذف المنتج', error: err.message });
  }
});

// تشغيل السيرفر محلياً
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على منفذ: ${PORT}`));

// التصدير الصحيح والكامل للـ Serverless (تم تعديل الـ le.exports الخطأ)
module.exports = app;
module.exports.handler = serverless(app);