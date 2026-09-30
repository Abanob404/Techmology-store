# Technology Store V5.2 — UI Upgrade

This update is intentionally front-end only for the products/inventory experience.
It does **not** change MongoDB collections, schemas, stored products, images, orders, users, or Cloudinary assets.

## Admin products & inventory
- Full-width inventory workspace instead of a permanently visible add-product form.
- KPI cards: total, in stock, low stock, out of stock, missing image.
- Search by product, SKU, or public brand.
- Filters for category, public brand, stock state, hidden products, and missing images.
- Full-width table with thumbnail, SKU/brand, category, price, stock, visibility, and compact actions.
- Fast +/- stock controls; manual quantity edit still supported.
- Add Product moved to a slide-over panel.
- Categories management moved to a separate slide-over panel.
- Supplier data remains internal and is not exposed as public brand.
- Existing Activity/API tab scroll-position fix is retained.

## Public products page
- Product count/result count.
- Public-brand filter.
- Min/max price filter.
- Sorting: most interest, newest, lowest price, highest price.
- Clear filters action.
- Public brand shown on product cards when available.
- Warranty shown on product cards when available.
- Category switching now preserves the active mobile/desktop search term.

## Cache
- Service worker cache key bumped to `technology-store-v5-2` so old UI assets are replaced after deployment.

## Deployment safety
Only these site files need replacing:
- `admin.html`
- `admin.js`
- `products_page.html`
- `app.js`
- `theme.css`
- `sw.js`

No environment variables or database changes are required for V5.2.
