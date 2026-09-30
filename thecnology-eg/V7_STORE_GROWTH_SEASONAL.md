# Technology Store V7 — Store Growth + Seasonal Experience

V7 is built on the working V6.3 baseline and keeps existing MongoDB collections and stored products compatible. There is no destructive migration and no automatic deletion of products, orders, users, inventory, or Cloudinary images.

## Customer storefront

- Human-readable product URLs under `/p/<product-name>` with direct product focus.
- Product SEO fields, canonical URL, Open Graph/Twitter metadata, and Product JSON-LD.
- Smart search suggestions across name, SKU, brand, category, and tags.
- Wishlist stored locally on the visitor device.
- Recently viewed products stored locally on the visitor device.
- Compare up to 3 products.
- Smarter related products using category, brand, price proximity, promotion, featured status, and analytics popularity.
- Product badges: custom badge, featured, new, popular, offer, low stock/out of stock.
- Existing promotion countdown retained.
- Homepage collections: new arrivals, offers, most requested.
- Sticky mobile product actions and focused direct-product experience.
- Existing mobile-first navigation, cart, WhatsApp/Facebook dock, social links, and sharing remain compatible.

## Admin-controlled banner and occasions

Store Settings now contains an Experience section:

- Enable/disable promotional banner.
- Banner text, CTA text, target URL, image, start and end dates.
- Uploaded banner image is converted to WebP through Cloudinary.
- Enable/disable seasonal overlay.
- Seasonal presets: winter/Christmas snow, Valentine hearts, spring flowers, autumn leaves, Ramadan moon/stars, Eid celebration, generic confetti.
- Low / medium / high intensity.
- Optional seasonal greeting.
- Start/end scheduling.
- Admin preview before saving.
- Effects are pointer-transparent, capped on low-end devices, and disabled automatically when the visitor requests Reduced Motion.

## Admin/product growth controls

- Product: Featured flag.
- Product: custom visible badge.
- Product tags.
- SEO title and SEO description.
- Growth feature switches: wishlist, compare, recently viewed, smart search, smart home collections.
- Low-stock threshold and "new product" age.
- Dashboard service state for Push, banner, seasonal effect, DB, Cloudinary, and POS.
- Media Center shows format and optimization status.
- Activity Logs can be filtered by text, user, date range, and action type.
- CSV export/import includes featured, badge, tags, SEO, old price, public brand and image fields.

## PWA and notifications

- Enhanced PWA manifest with shortcuts and a safe maskable icon.
- Install-app prompt is exposed in the mobile menu when supported.
- Optional Web Push infrastructure uses native Node crypto; no extra npm dependency is required.
- Push stays hidden/inactive unless enabled in admin AND VAPID keys are configured.
- Generate VAPID keys locally with:

  `npm run generate:vapid`

- Add the output as Vercel Environment Variables:
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT` (example: `mailto:technology.store.official1@gmail.com`)

## Performance and accessibility

- No animation framework added.
- Seasonal particles are capped and do not receive pointer events.
- Reduced Motion is respected.
- Images continue to use responsive Cloudinary transformations, lazy loading and optimized formats.
- First-screen images retain priority behavior.
- Skip-to-content and clearer keyboard focus states are included.
- Service Worker is network-first for HTML/JS/CSS to avoid stale application code.
