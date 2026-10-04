# Technology Store — V9 Production & Security

## What V9 adds

- Professional Sales Intelligence dashboard: visitors, sessions, orders, revenue, AOV, conversion rate, abandoned carts, open returns, conversion funnel, source-to-order-to-revenue attribution, and best products.
- Detailed Visitor Journey: first/current source, referrer, UTM campaign, approximate platform-provided location, IP, device/browser/OS/screen, sessions, entry/exit pages, interaction events, and linked orders after purchase. Anonymous visitors remain anonymous until they provide order/contact data.
- Abandoned Cart recovery center, storing only the contact details a customer actually typed in checkout.
- Returns and exchanges with a public tracking number and an admin workflow/history.
- Printable order invoices for customers and admins.
- Admin role presets plus custom granular permissions.
- Admin 2FA using an Authenticator app, login lockout, active device/session management, and server-side session revocation on logout.
- Production Health Center for MongoDB, Cloudinary, POS connection/sync, backup state, store counters and runtime information.
- POS Sync Center health status and latest product sync.
- Private cloud backups uploaded to Cloudinary as authenticated raw assets, with manual backup, retention of the latest successful backups, secure admin-only download links, and a daily Vercel Cron endpoint.
- Existing Audit Log remains enabled and V9 adds logs for security/returns/backups.
- Performance remains lightweight: V9 uses additive vanilla JavaScript, debounced cart snapshots, lazy/async images already used by the catalog, and no heavy client framework.

## Customer privacy popup

The V8 visitor-tracking popup has been removed completely from the storefront. The old `privacyNotice` value is no longer rendered or returned to the public storefront. V9 keeps first-party source/session analytics in the background and does not add Meta Pixel, Google Ads cookies, or a third-party cookie banner.

## Important deployment setting

Existing environment variables must remain unchanged (MongoDB, JWT secret, Cloudinary, POS keys, etc.).

For automatic daily backups add a long random environment variable in Vercel:

`CRON_SECRET=<a-long-random-secret>`

`vercel.json` schedules `/api/cron/backup` daily at 02:00 UTC. Vercel sends the configured cron authorization secret. If `CRON_SECRET` is not configured, manual authenticated cloud backup from Admin still works, while the cron health card shows that automatic backup is not configured.

## Security notes

- Cloud backup files contain business/order data and are therefore uploaded as Cloudinary `authenticated` raw assets; no public backup URL is stored.
- Admin sessions are stored server-side and can be revoked per device.
- Admin logout revokes the current server-side session.
- 2FA secrets are never returned after activation.
- Public analytics endpoints are rate-limited; detailed visitor journey data is admin-only and requires `view_visitor_details` permission.
