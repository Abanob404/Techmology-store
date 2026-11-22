# Technology Store — Clean Production Project

This folder is the consolidated V10.2 production project.

## Main runtime files
- `index.html` — home page
- `products_page.html` — catalog/product page
- `services.html` — services page
- `admin.html` — admin panel
- `app.js` — all public storefront JavaScript (V8/V9 modules integrated)
- `admin.js` — all admin JavaScript (V8–V10.2 modules integrated)
- `style.css` — generated Tailwind base
- `theme.css` — consolidated public/common custom styles
- `admin.css` — consolidated admin-only styles
- `server/index.js` — API/backend
- `sw.js` — service worker/PWA
- `vercel.json` — Vercel routes/build configuration

## Development files intentionally kept
- `input.css`, `tailwind.config.js` — rebuild `style.css` when Tailwind classes change
- `package.json`, `package-lock.json`
- `server/package.json`, `server/package-lock.json`
- `generate_vapid_keys.js` — optional web-push key helper

## Security
Real environment secrets are not included. Copy `.env.example` to `.env` for local development or configure the same values in Vercel Environment Variables.

Historical FIX scripts, release notes, local `.git/.vercel/.vscode` metadata, unused backup files, and unused fonts were removed because they are not required at runtime.

## V10.4.3 — POS authoritative sales flow

طلبات الموقع أصبحت Requests فقط: لا يتم خصم أو حجز المخزون من الموقع، ولا يعتبر الطلب بيعاً أو إيراداً قبل إنشاء فاتورة فعلية داخل Technology POS. راجع `V10_4_3_POS_ORDER_FLOW.md` لتفاصيل الربط.

## V10.4.4 — Cart single-scroll fix

تم إلغاء السكرول الداخلي المنفصل لقائمة المنتجات داخل عربة التسوق. قائمة المنتجات الآن تتمدد بالكامل، والسلة كلها تستخدم Scroll واحد طبيعي على الموبايل والكمبيوتر، مع بقاء رأس السلة ثابتاً أثناء التمرير.


## V10.4.5 — Analytics organization + monthly archive
- Reorganized Visitors & Sessions into compact paginated tables (25 rows/page).
- Added quick date filters (today / 7 days / 30 days / current month / all).
- Long referrer/URL values are hidden from the main table and remain available in visitor journey details/exports.
- Added Monthly Analytics Archive in MongoDB for completed months.
- Previous month is automatically archived when Analytics is opened in a new month.
- Archive keeps POS-confirmed invoices/revenue separate from submitted website orders.
- Archive snapshots do not delete raw visitor/session/event records.
- Inventory report now states that quantities are last received from Technology POS.
- Replaced destructive analytics-reset action in the visible footer with a safe "clear cache on this device" action.
- Service worker cache version bumped; old frontend caches are removed automatically on activation.


## V10.5 — Phase 1: merchandising priority (2026-11-21)

See `PHASE1_MERCHANDISING_AR.md`. The new admin merchandising studio is under **Products and Inventory**. No database migration is required: new product fields have safe defaults. POS stock, cost, invoices, and order logic are unchanged.

## V10.6 — Admin / Catalog / Cart / WebP performance update (2026-11-21)

See [`V10_6_UPGRADE_AR.md`](V10_6_UPGRADE_AR.md) for Arabic feature notes, required production smoke tests, limitations and rollback. Adds `image-optimizer.js`, `admin-insights.js` and `enhancements.css`. No secret credentials or production database content included.

## V10.8 — Maintenance page unified + admin catalogue editor (2026-11-21)

See [`V10_8_MAINTENANCE_EDITOR_AR.md`](V10_8_MAINTENANCE_EDITOR_AR.md) for setup, roles, public service selection, indicative pricing, new API, smoke testing and rollback. Adds `maintenance-catalog-admin.js` and `maintenance-catalog-admin.css`. MongoDB creates the catalogue collection automatically when settings are first saved. The update never mutates POS inventory or converts service requests to sales.

## V10.9 — منتجات بدون صور

قسم رفع سريع لصور المنتجات الناقصة من لوحة الإدارة، مع ضغط WebP قبل الإرسال، وعرض النواقص بالبحث والفلاتر والعدادات. ملف التعليمات: `V10_9_MISSING_PRODUCT_IMAGES_AR.md`. يحتاج نشر الملفات الجديدة `missing-images-admin.js` و`missing-images-admin.css` و`server/missing-image-utils.js` مع تحديث `admin.html` و`admin.js` و`server/index.js`. لا توجد تغييرات لقاعدة البيانات أو POS.
