# Safe deployment — V7

1. Keep the currently working V6.3 Vercel deployment as rollback.
2. Apply `technology-store-v7-safe-patch.zip` over the same V6.3 source tree.
3. Do not delete or replace `.env` / Vercel Environment Variables.
4. Deploy to a Vercel Preview first.
5. Test `/`, `/products`, `/services`, `/admin`, and one `/p/<product-name>` share link.
6. In admin test: add/edit product, banner settings, seasonal preview, growth switches, Media Center, Logs filters, Orders, and backup export.
7. On a real phone test: search suggestions, wishlist, compare, recently viewed, cart, product direct link, WhatsApp share, bottom dock, dark/light mode, and seasonal effect.
8. Only then promote the Preview to Production.

## Data safety

V7 adds optional fields to existing Mongoose schemas. It does not rename collections, run a migration, delete existing documents, or automatically alter existing product values. Seasonal/banner settings only write when an admin presses Save. Product growth fields only write when the relevant product is edited/imported.

## Push notifications

Push is OFF by default. The store works normally without VAPID keys. If you want Push:

1. Run `npm run generate:vapid` locally.
2. Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in Vercel.
3. Redeploy.
4. Enable Push from Store Settings.
5. Subscribe from a supported mobile/browser, then send a test notification from admin.

If Push is not configured, the rest of V7 is unaffected.
