# V9.1 Mobile Product Actions Fix

- Removed the duplicate legacy purchase/cart/WhatsApp row from the mobile product view.
- Kept one canonical fixed mobile action dock: Buy Now, Cart, WhatsApp.
- Kept Share / Wishlist / Compare as secondary actions only.
- Disabled the old sticky product-actions behavior on direct mobile product routes so it no longer stacks over the new dock.
- Buy Now now opens Quick Buy when that feature is enabled; otherwise it adds the product to cart and opens the cart.
- Desktop/tablet product actions are unchanged.
