# Technology Store V5 — Safe Deployment

This build was made directly from `thecnology-eg(3).zip`.

## Data safety
- No collection is renamed.
- No automatic migration runs on deployment.
- No existing product, order, user, image, category, or setting is deleted by the V5 upgrade.
- New social settings are optional. They are written only when you save them from Admin.
- Order status changes happen only when an authorized admin changes them.
- Media Center is read-only and cannot delete Cloudinary images.
- Existing `all` administrators automatically have access to the new features.
- Existing limited users keep their current permissions until `manage_orders` or `manage_media` is granted.

## Recommended production rollout
1. Keep the current production deployment available as rollback.
2. Apply `technology-store-v5-safe-patch.zip` over the exact current project.
3. Do not delete or replace Vercel Environment Variables.
4. Deploy first as a Vercel Preview deployment if possible.
5. Test `/`, `/products`, `/services`, and `/admin`.
6. In Admin, verify Dashboard, Orders, Media Center, and Social Settings.
7. Create one test order and verify it appears in Orders without changing existing orders.
8. Save the Telegram URL only after confirming the current values shown in Social Settings.
9. Promote the tested deployment to Production.

## Environment variables
Keep the same environment variables already used by the working site, including MongoDB, Cloudinary and JWT_SECRET. The generated V5 project intentionally excludes `server/.env`.
