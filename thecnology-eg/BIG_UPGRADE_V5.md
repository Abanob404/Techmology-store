# Technology Store – Big Upgrade V5

## Added
- Admin Operations Dashboard (read-only KPIs, recent orders, recent activity, service configuration health).
- Full admin Orders Management with search, filters, details and status workflow.
- Media Center for referenced product/store images (read-only by design for safety).
- Social Media Settings controlled from admin; Telegram channel is https://t.me/TehnologyStore by default.
- New granular permissions: manage_orders and manage_media.
- Backup export now also includes orders and analytics while keeping the existing restore behaviour unchanged.
- Public site dynamically consumes saved WhatsApp/Facebook/Instagram/Telegram settings.
- Service Worker cache bumped to v5.

## Data safety
This upgrade does not rename collections, delete existing documents, or run migrations. No database migration runs on deployment. The new social fields are optional and are only persisted when you save them from Admin. Existing users with `all` permission automatically access all new features. Other users keep their current permissions until a manager explicitly grants the new permissions.

## Deployment
Keep the existing Vercel Environment Variables (MONGODB_URI, Cloudinary credentials, JWT_SECRET, etc.). This package intentionally does not include server/.env.
