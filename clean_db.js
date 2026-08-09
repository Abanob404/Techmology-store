const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config(); // لقرائة ملف .env إذا كان موجوداً

// يرجى تمرير رابط قاعدة البيانات كمتغير بيئة عند التشغيل، لا تقم بكتابته هنا أبداً
const MONGODB_URI = process.env.MONGODB_URI;

async function cleanDatabase() {
    console.log("⏳ جاري الاتصال بقاعدة البيانات...");

    if (!MONGODB_URI) {
        console.error("❌ يرجى تعيين متغير البيئة MONGODB_URI في ملف .env أو في بيئة التشغيل.");
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("✅ تم الاتصال بنجاح!");

        // جلب الإعدادات لمعرفة الصورة الافتراضية
        const db = mongoose.connection.db;
        const settings = await db.collection('settings').findOne({});
        const defaultImg = settings && settings.defaultProductImage ? settings.defaultProductImage : '';

        // فلتر الحذف (المنتجات الوهمية)
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

        console.log("⏳ جاري البحث عن المنتجات الوهمية (60,000 منتج)... قد يستغرق هذا دقيقة.");
        const fakeProductsCount = await db.collection('products').countDocuments(deleteFilter);

        console.log(`🗑️ تم العثور على ${fakeProductsCount} منتج وهمي مطابق لشروط الحذف.`);

        if (fakeProductsCount > 0) {
            console.log("⏳ جاري الحذف الآن... الرجاء الانتظار وعدم إغلاق النافذة.");
            const deleteResult = await db.collection('products').deleteMany(deleteFilter);
            console.log(`✅ تمت عملية الحذف بنجاح! تم حذف ${deleteResult.deletedCount} منتج وهمي.`);
        } else {
            console.log("✅ قاعدة البيانات نظيفة، لا يوجد منتجات وهمية للحذف.");
        }

        const remainingCount = await db.collection('products').countDocuments();
        console.log(`ℹ️ عدد المنتجات المتبقية (المنتجات الفعلية): ${remainingCount}`);

    } catch (err) {
        console.error("❌ حدث خطأ أثناء التنظيف:", err);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 تم إغلاق الاتصال بقاعدة البيانات.");
        process.exit(0);
    }
}

cleanDatabase();
