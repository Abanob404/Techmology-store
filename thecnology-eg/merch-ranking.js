/* Technology Store — merchandising rules shared by the storefront and admin preview.
   No supplier costs are published to customers. A website request is NOT a POS sale. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TechMerch = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(n)) ? Number(n) : lo));
  const stamp = value => { const n = value ? new Date(value).getTime() : 0; return Number.isFinite(n) ? n : 0; };
  function isActiveOffer(p, now = Date.now()) {
    const original = Number(p?.oldPrice), current = Number(p?.price);
    if (!(original > current && current > 0)) return false;
    return !p.discountExpiresAt || (stamp(p.discountExpiresAt) > now);
  }
  function availableQuantity(p) {
    if (Array.isArray(p?.variants) && p.variants.length) return p.variants.reduce((n, v) => n + Math.max(0, Number(v.stockQuantity) || 0), 0);
    return Math.max(0, Number(p?.stockQuantity) || 0);
  }
  function engagement(p, analytics = {}) {
    const id = String(p?._id || '');
    return Math.max(0, Number(analytics.views?.[id]?.count) || 0) +
      5 * Math.max(0, Number(analytics.cart_adds?.[id]?.count) || 0) +
      10 * Math.max(0, Number(analytics.whatsapp_orders?.[id]?.count) || 0);
  }
  function isLowValueCable(p) {
    const name = String(p?.title || '').toLowerCase();
    const pattern = /(?:^|[\s\-،\/(])(كابل|كابلات|كيبل|كبل|وصلة|وصله|وصلات|سلك|اسلاك|أسلاك|محول|adapter|cable|hdmi|vga|dvi|usb cable|type.c cable|extension|converter|splitter)(?=$|[\s\-،\/)\d])/iu;
    return Number(p?.price) <= 500 && pattern.test(name);
  }
  function searchRelevance(p, query) {
    const terms = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return 0;
    const title = String(p?.title || '').toLowerCase();
    const sku = String(p?.sku || '').toLowerCase();
    const brand = String(p?.publicBrand || '').toLowerCase();
    const category = String(p?.category || '').toLowerCase();
    return terms.reduce((sum, term) => sum + (title === term ? 100 : title.startsWith(term) ? 36 : title.includes(term) ? 22 : 0) +
      (sku === term ? 100 : sku.includes(term) ? 35 : 0) + (brand.includes(term) ? 12 : 0) + (category.includes(term) ? 5 : 0), 0);
  }
  function merchandisingScore(p, options = {}) {
    const now = options.now ?? Date.now();
    const tier = ['hero', 'normal', 'accessory'].includes(p?.merchTier) ? p.merchTier : 'normal';
    const priority = clamp(p?.merchPriority, 0, 100);
    const price = Math.max(0, Number(p?.price) || 0);
    const sales = Math.max(0, Number(options.analytics?.confirmed_sales?.[String(p?._id || '')]) || 0);
    const interaction = engagement(p, options.analytics);
    const discount = isActiveOffer(p, now) ? (Number(p.oldPrice) - price) / Number(p.oldPrice) : 0;
    const age = now - stamp(p?.createdAt);
    // Admin priority is the strongest signal. Order counts are POS-invoiced only.
    let score = priority * 4 + (tier === 'hero' ? 100 : tier === 'accessory' ? -85 : 0) + (p?.isFeatured ? 55 : 0);
    score += Math.min(80, Math.log1p(sales) * 24);                  // POS-confirmed demand
    score += Math.min(22, Math.log1p(interaction) * 4);             // behavioral interest, not sales
    score += Math.min(34, Math.log10(price + 1) * 10);             // commercial value proxy, not profit
    score += discount * (options.offers ? 100 : 35);                // genuine active discount
    if (age >= 0 && age < 21 * 86400000) score += 5;              // small freshness nudge
    if (!options.categorySpecific && tier === 'normal' && priority === 0 && !p?.isFeatured && isLowValueCable(p)) score -= 95;
    if (availableQuantity(p) <= 0) score -= 100000;
    return score;
  }
  function compare(a, b, options = {}) {
    if (options.searchTerm) {
      const relevance = searchRelevance(b, options.searchTerm) - searchRelevance(a, options.searchTerm);
      if (relevance) return relevance;
    }
    const aQty = availableQuantity(a), bQty = availableQuantity(b);
    if (!aQty !== !bQty) return bQty > 0 ? 1 : -1;
    const diff = merchandisingScore(b, options) - merchandisingScore(a, options);
    if (diff) return diff;
    const byDate = stamp(b?.createdAt) - stamp(a?.createdAt);
    if (byDate) return byDate;
    return String(a?._id || '').localeCompare(String(b?._id || ''));
  }
  return { isActiveOffer, availableQuantity, engagement, merchandisingScore, searchRelevance, compare, isLowValueCable };
});
