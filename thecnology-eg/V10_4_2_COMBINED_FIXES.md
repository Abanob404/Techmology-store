# V10.4.2 Combined Fixes

- Meta Pixel ID is controlled only from Admin > Store Settings > Marketing.
- No Pixel ID is hard-coded in public JavaScript.
- Pretty campaign links are routed through the server to avoid Vercel 404 errors.
- Supported examples: /facebook, /instagram, /whatsapp, /instagram-products, /facebook-services, /instagram-products-launch.
- Existing tracking parser still records source and campaign from the pretty URL.
