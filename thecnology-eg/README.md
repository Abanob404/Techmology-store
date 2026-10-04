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
