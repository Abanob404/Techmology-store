Technology Store V4 - Brand Privacy Hotfix
==========================================

What changed:
1) Existing legacy `brand` data is preserved in MongoDB but is no longer returned to public visitors.
2) New `publicBrand` field added for the customer-facing brand (e.g. Hikvision / Dahua).
3) Product modal and public search use `publicBrand` only.
4) Admin Add/Edit forms now edit `publicBrand` only.
5) CSV export/import uses `publicBrand` only, so old supplier names are not accidentally republished.
6) Service-worker cache bumped to v4.

Safety:
- No database deletion.
- No collection rename.
- No migration required.
- Existing products, prices, quantities, images, orders and legacy supplier/brand values remain untouched.

Install:
Copy these files over the current project using the same paths, commit/push, then redeploy on Vercel.
After deploy, hard refresh once (Ctrl+F5).
