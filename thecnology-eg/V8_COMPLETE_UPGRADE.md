# TECHNOLOGY STORE — V8 Complete Upgrade

## What was added

- Mobile product page improvements with sticky mobile buy/cart/WhatsApp controls.
- Product variants (option, price, old price, stock, SKU, image).
- Product image zoom/full-screen viewer and swipe navigation on touch devices.
- Reviews and ratings with admin approval.
- Back-in-stock notification requests with admin WhatsApp follow-up.
- Shipping zones, fees, ETA, free-shipping threshold and pickup support.
- Checkout quote calculated server-side.
- Payment options: Cash on Delivery, InstaPay and Store Pickup (admin controlled).
- Coupons: percentage/fixed value, limits, minimum basket, max discount, dates and usage limits.
- Order tracking by order number + phone.
- Rich traffic attribution: Direct, Google, Facebook, Instagram, WhatsApp, TikTok, Telegram, YouTube, referrals and UTM campaigns.
- Tracked share links for products and an admin campaign-link builder.
- Session analytics: landing page, exit page, source, campaign, referrer, device class, browser, OS, screen, timezone, approximate location from platform request headers, sessions and active duration.
- Known-customer linking after an order is placed using visitor/session IDs.
- Analytics filters by date/source and CSV exports for visitors and sessions.
- Security hardening: restricted CORS, admin-only analytics endpoints, security headers, password hashing support, upload MIME/size checks, request rate limiting and no-store headers for admin analytics.
- Privacy notice configurable from Admin.
- Expanded Admin controls for shipping, payment, privacy, variants, coupons, reviews, stock alerts and campaign links.

## Traffic-source accuracy

Traffic attribution is strongest when you publish a tagged link from the Admin campaign-link builder or use the website product share buttons. Some apps/browsers intentionally remove the HTTP Referrer. In those cases, an untagged visit can appear as Direct. UTM-tagged links avoid that limitation.

## Required server environment variables

Keep these in Vercel / server environment settings. Do not put them in the public project ZIP:

- MONGODB_URI
- JWT_SECRET
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET
- POS_API_KEY (if POS integration is enabled)
- CORS_ORIGINS (optional extra allowed origins, comma separated)

Existing optional notification / integration environment variables should remain configured exactly as in the deployed project.

## Deployment

1. Back up the existing production project and database.
2. Upload/deploy this project.
3. Keep the existing production environment variables in Vercel.
4. Open Admin > Settings and configure shipping zones/payment methods/privacy text.
5. Open Admin > Growth to configure coupons and create tracked campaign links.
6. Test one product, one cart order, order tracking, review approval and analytics before announcing the deployment.

## Verification performed

The following JavaScript files were syntax-checked with Node successfully:

- app.js
- admin.js
- v8.js
- admin-v8.js
- server/index.js

The Tailwind rebuild command could not be executed in the isolated packaging environment because the Tailwind CLI dependency is not installed there. The project already contains the compiled style.css with the V8 rules included.
