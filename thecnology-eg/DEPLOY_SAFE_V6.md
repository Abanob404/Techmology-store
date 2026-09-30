# نشر V6 بأمان

1. احتفظ بالـ Deployment الحالي على Vercel كـ Rollback.
2. فك `technology-store-v6-safe-patch.zip` فوق آخر نسخة شغالة من المشروع واعمل Replace فقط للملفات الموجودة.
3. لا تغيّر `.env` ولا Environment Variables على Vercel.
4. اعمل Push إلى Branch أو Preview Deployment أولاً.
5. اختبر من الهاتف:
   - الرئيسية
   - المنتجات
   - Sticky categories أثناء النزول
   - فتح/إغلاق الفلاتر
   - فتح منتج وإغلاقه
   - إضافة للسلة، +/−، والحذف
   - واتساب وتليجرام من الـ bottom dock
   - الوضع الفاتح والداكن
   - الخدمات
6. لو كله سليم، Promote نفس الـ Preview إلى Production.
7. بعد النشر النهائي اعمل Refresh قوي مرة واحدة لأن Service Worker أصبح V6.

## Rollback
لو ظهر أي سلوك غير متوقع، ارجع فوراً للـ Deployment السابق من Vercel. التحديث لا يعمل Migration، لذلك الرجوع لا يحتاج استعادة قاعدة البيانات.
