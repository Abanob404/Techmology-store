const BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:5000' : '';
const API_URL = `${BASE_URL}/api/products`;

// Meta Pixel is configured only from Admin > Store Settings > Marketing.
// Do not hard-code a Pixel ID here; this keeps one source of truth and prevents duplicate pixels.
function initMetaPixel(pixelId) {
    const id = String(pixelId || '').trim();
    if (!id) return false;
    if (window.__techMetaPixelInitialized) return window.__techMetaPixelInitialized === id;

    if (!window.fbq) {
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
        (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    }

    window.fbq('init', id);
    window.fbq('track', 'PageView');
    window.__techMetaPixelInitialized = id;
    return true;
}

function trackMetaEvent(name, params = {}) {
    try {
        const settings = window.storeSettings || {};
        if (!settings.isPixelEnabled || !settings.fbPixelId) return;
        if (!window.__techMetaPixelInitialized) initMetaPixel(settings.fbPixelId);
        if (window.fbq && window.__techMetaPixelInitialized === String(settings.fbPixelId).trim()) {
            window.fbq('track', name, params || {});
        }
    } catch (_) {}
}
window.trackMetaEvent = trackMetaEvent;
let globalProducts = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 16;
let activeCategory = sessionStorage.getItem('tech_activeCategory') || "all";
let activeSearchTerm = sessionStorage.getItem('tech_activeSearch') || "";
let currentSort = sessionStorage.getItem('tech_currentSort') || "featured";
let activeBrand = sessionStorage.getItem('tech_activeBrand') || '';
let minPriceFilter = sessionStorage.getItem('tech_minPrice') || '';
let maxPriceFilter = sessionStorage.getItem('tech_maxPrice') || '';
let catalogFilterTimer = null;
let cart = JSON.parse(localStorage.getItem('tech_store_cart')) || [];
const WISHLIST_KEY = 'tech_store_wishlist_v1';
const COMPARE_KEY = 'tech_store_compare_v1';
const RECENT_KEY = 'tech_store_recent_v1';
let wishlistOnly = false;
let offersOnly = false;
let deferredInstallPrompt = null;

function readIdList(key) {
    try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value.map(String) : []; }
    catch (_) { return []; }
}
function writeIdList(key, list, max = 50) { localStorage.setItem(key, JSON.stringify([...new Set(list.map(String))].slice(0, max))); }
function featureEnabled(key, fallback = true) { const v = window.storeSettings?.[key]; return v === undefined ? fallback : Boolean(v); }
function getWishlistIds() { return readIdList(WISHLIST_KEY); }
function getCompareIds() { return readIdList(COMPARE_KEY).slice(0, 3); }
function getRecentIds() { return readIdList(RECENT_KEY).slice(0, 12); }
function isWishlisted(id) { return getWishlistIds().includes(String(id)); }
function isCompared(id) { return getCompareIds().includes(String(id)); }
function getPopularityScore(id) {
    const a = window.globalAnalytics || {};
    const views = a.views?.[id]?.count || 0;
    const cartAdds = a.cart_adds?.[id]?.count || 0;
    const whatsapp = a.whatsapp_orders?.[id]?.count || 0;
    return (whatsapp * 10) + (cartAdds * 5) + views;
}
function escapeStoreHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function isNewProduct(product) {
    const days = Math.max(1, Number(window.storeSettings?.newProductDays || 30));
    const created = product?.createdAt ? new Date(product.createdAt).getTime() : 0;
    return created > 0 && (Date.now() - created) <= days * 86400000;
}
function lowStockThreshold() { return Math.max(1, Number(window.storeSettings?.lowStockThreshold || 3)); }

window.toggleWishlist = function(id, event) {
    event?.stopPropagation?.();
    if (!featureEnabled('enableWishlist')) return;
    let ids = getWishlistIds(); const key = String(id);
    ids = ids.includes(key) ? ids.filter(x => x !== key) : [key, ...ids];
    writeIdList(WISHLIST_KEY, ids, 100); syncGrowthUI();
    if (wishlistOnly) renderProducts(activeCategory, activeSearchTerm);
};
window.toggleWishlistFilter = function() {
    wishlistOnly = !wishlistOnly;
    const btn = document.getElementById('wishlistFilterBtn');
    if (btn) btn.classList.toggle('active', wishlistOnly);
    renderProducts(activeCategory, activeSearchTerm);
};
window.toggleOffersOnly = function() {
    offersOnly = !offersOnly;
    const btn = document.getElementById('offersFilterBtn');
    if (btn) btn.classList.toggle('active', offersOnly);
    renderProducts(activeCategory, activeSearchTerm);
};
window.toggleCompare = function(id, event) {
    event?.stopPropagation?.();
    if (!featureEnabled('enableCompare')) return;
    let ids = getCompareIds(); const key = String(id);
    if (ids.includes(key)) ids = ids.filter(x => x !== key);
    else if (ids.length >= 3) { showStoreToast('يمكن مقارنة 3 منتجات كحد أقصى'); return; }
    else ids.push(key);
    writeIdList(COMPARE_KEY, ids, 3); syncGrowthUI(); renderCompareBar();
};
window.clearCompare = function() { localStorage.removeItem(COMPARE_KEY); syncGrowthUI(); renderCompareBar(); };
function rememberRecentlyViewed(id) {
    if (!featureEnabled('enableRecentlyViewed')) return;
    const key = String(id); const ids = [key, ...getRecentIds().filter(x => x !== key)];
    writeIdList(RECENT_KEY, ids, 12); renderRecentlyViewed();
}
function showStoreToast(message) {
    let el = document.getElementById('storeGrowthToast');
    if (!el) { el=document.createElement('div'); el.id='storeGrowthToast'; el.className='store-growth-toast'; document.body.appendChild(el); }
    el.textContent=message; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2200);
}
function syncGrowthUI() {
    const wishes = new Set(getWishlistIds()); const compares = new Set(getCompareIds());
    document.querySelectorAll('[data-wishlist-id]').forEach(btn => { const on=wishes.has(String(btn.dataset.wishlistId)); btn.classList.toggle('active',on); btn.setAttribute('aria-pressed',on?'true':'false'); const icon=btn.querySelector('.material-symbols-outlined'); if(icon) icon.textContent=on?'favorite':'favorite_border'; });
    document.querySelectorAll('[data-compare-id]').forEach(btn => { const on=compares.has(String(btn.dataset.compareId)); btn.classList.toggle('active',on); btn.setAttribute('aria-pressed',on?'true':'false'); });
    const count=document.getElementById('wishlistCount'); if(count) count.textContent=wishes.size;
}


// ==========================================
// Analytics Tracking System
// ==========================================
function getAnalytics() {
    return JSON.parse(localStorage.getItem('tech_store_analytics') || '{"views":{},"cart_adds":{},"whatsapp_orders":{},"page_visits":{},"total_visits":0,"daily_visits":{}}');
}
function saveAnalytics(data) {
    localStorage.setItem('tech_store_analytics', JSON.stringify(data));
}
function trackEvent(type, productId, productTitle) {
    const analytics = getAnalytics();
    if (!analytics[type]) analytics[type] = {};
    if (!analytics[type][productId]) {
        analytics[type][productId] = { count: 0, title: productTitle || 'Unknown' };
    }
    analytics[type][productId].count++;
    analytics[type][productId].title = productTitle || analytics[type][productId].title;
    analytics[type][productId].lastDate = new Date().toISOString();
    saveAnalytics(analytics);
    
    // إرسال الإحصائية للسيرفر المركزي (لتعمل من الهاتف أو أي جهاز)
    fetch(`${BASE_URL}/api/analytics/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, productId, productTitle })
    }).catch(() => {});
}
function trackPageVisit() {
    try {
        const pagePath = window.location.pathname.toLowerCase();
        const page = pagePath.split('/').pop() || '/';
        const isProductsPage = pagePath.includes('products');
        
        const analytics = getAnalytics();
        if (!analytics.page_visits) analytics.page_visits = {};
        analytics.page_visits[page] = (analytics.page_visits[page] || 0) + 1;
        analytics.total_visits = (analytics.total_visits || 0) + 1;
        const today = new Date().toISOString().split('T')[0];
        if (!analytics.daily_visits) analytics.daily_visits = {};
        analytics.daily_visits[today] = (analytics.daily_visits[today] || 0) + 1;
        saveAnalytics(analytics);
        
        // إرسال الإحصائية للسيرفر المركزي (لتعمل من الهاتف أو أي جهاز)
        fetch(`${BASE_URL}/api/analytics/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'page_visit', page })
        }).catch(() => {});
    } catch (e) {
        console.error("Error tracking visit:", e);
    }
}

window.defaultProductImage = '';
const LOCAL_FALLBACK_IMAGE = './assets/no-image.svg';
const DEFAULT_SOCIAL_SETTINGS = {
    whatsappNumber: '201515664919',
    whatsappChannelUrl: 'https://whatsapp.com/channel/0029VbCqfLn9cDDaxSaaXg3W',
    facebookUrl: 'https://www.facebook.com/technologystore.official/',
    instagramUrl: 'https://www.instagram.com/technologystore.official/',
    telegramUrl: 'https://t.me/TehnologyStore',
    tiktokUrl: 'https://www.tiktok.com/@technologystore.official',
    xUrl: 'https://x.com/techstoreeg'
};
function socialSettings() { return { ...DEFAULT_SOCIAL_SETTINGS, ...(window.storeSettings || {}) }; }
function buildWhatsappUrl(message = '') {
    const number = String(socialSettings().whatsappNumber || DEFAULT_SOCIAL_SETTINGS.whatsappNumber).replace(/\D/g, '');
    return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

function encodeProductShareCode(productId = '') {
    const id = String(productId || '').trim();
    if (!/^[a-f0-9]{24}$/i.test(id)) return id;
    try {
        const bytes = id.match(/.{2}/g).map(hex => parseInt(hex, 16));
        let binary = '';
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    } catch (_) { return id; }
}
function decodeProductShareCode(code = '') {
    const value = String(code || '').trim();
    if (/^[a-f0-9]{24}$/i.test(value)) return value;
    if (!/^[A-Za-z0-9_-]{16}$/.test(value)) return '';
    try {
        const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '==';
        const binary = atob(base64);
        return Array.from(binary, ch => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    } catch (_) { return ''; }
}
function slugifyProductTitle(title = '') {
    const slug = String(title || 'product')
        .normalize('NFKC')
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
        .slice(0, 88);
    return slug || 'product';
}
function getProductShareUrl(productOrId) {
    const product = (productOrId && typeof productOrId === 'object')
        ? productOrId
        : globalProducts.find(item => String(item._id) === String(productOrId));
    const productId = product ? String(product._id || '') : String(productOrId || '');
    if (!product) return `${window.location.origin}/p/${encodeProductShareCode(productId)}`;

    const slug = slugifyProductTitle(product.title);
    const sameSlugCount = globalProducts.reduce((count, item) => count + (slugifyProductTitle(item.title) === slug ? 1 : 0), 0);
    if (sameSlugCount <= 1) return `${window.location.origin}/p/${slug}`;

    // لو فيه منتجين بنفس الاسم نضيف مرجع صغير فقط لضمان فتح المنتج الصحيح.
    const readableRef = String(product.sku || '').trim().replace(/[^\p{L}\p{N}._-]+/gu, '-');
    const ref = readableRef || encodeProductShareCode(productId);
    return `${window.location.origin}/p/${slug}/${encodeURIComponent(ref)}`;
}
function applyDynamicSocialLinks(settings = {}) {
    window.storeSettings = { ...(window.storeSettings || {}), ...settings };
    const cfg = socialSettings();
    document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (/^https:\/\/(?:wa\.me\/201515664919|api\.whatsapp\.com\/send\/\?phone=201515664919)/i.test(href)) {
            let message = '';
            try { const u = new URL(href); message = u.searchParams.get('text') || ''; } catch (_) {}
            a.href = buildWhatsappUrl(message);
        } else if (href.includes('whatsapp.com/channel/0029VbCqfLn9cDDaxSaaXg3W') && cfg.whatsappChannelUrl) a.href = cfg.whatsappChannelUrl;
        else if (href.includes('facebook.com/technologystore.official') && cfg.facebookUrl) a.href = cfg.facebookUrl;
        else if (href.includes('instagram.com/technologystore.official') && cfg.instagramUrl) a.href = cfg.instagramUrl;
        else if (href.includes('t.me/TehnologyStore') && cfg.telegramUrl) a.href = cfg.telegramUrl;
        else if (href.includes('tiktok.com/@technologystore.official') && cfg.tiktokUrl) a.href = cfg.tiktokUrl;
        else if ((href.includes('x.com/techstoreeg') || href.includes('twitter.com/techstoreeg')) && cfg.xUrl) a.href = cfg.xUrl;
    });
}

function isPlaceholderImage(url) {
    if (!url || typeof url !== 'string') return true;
    return /placehold\.co|no-image|No\+Image/i.test(url);
}

function getSafeImageUrl(url, fallback = LOCAL_FALLBACK_IMAGE) {
    const value = typeof url === 'string' ? url.trim() : '';
    return value && !isPlaceholderImage(value) ? value : fallback;
}

function getOptimizedImageUrl(url, width = 400, height = 400) {
    const safeUrl = getSafeImageUrl(url);
    // Add Cloudinary transformations only to actual Cloudinary upload URLs.
    if (/^https:\/\/res\.cloudinary\.com\//i.test(safeUrl) && safeUrl.includes('/image/upload/')) {
        return safeUrl.replace('/image/upload/', `/image/upload/w_${width},h_${height},c_fit,q_auto,f_auto/`);
    }
    return safeUrl;
}

window.handleProductImageError = function(img) {
    if (!img) return;
    img.removeAttribute('srcset');

    const configuredFallback = getSafeImageUrl(window.defaultProductImage, LOCAL_FALLBACK_IMAGE);
    const currentSrc = img.getAttribute('src') || '';
    const stage = img.dataset.fallbackApplied || '';

    // First try the configured default product image, then always fall back locally.
    if (stage === '' && configuredFallback !== LOCAL_FALLBACK_IMAGE && currentSrc !== configuredFallback) {
        img.dataset.fallbackApplied = 'default';
        img.src = configuredFallback;
        return;
    }

    img.dataset.fallbackApplied = 'local';
    img.removeAttribute('onerror');
    img.onerror = null;
    img.src = LOCAL_FALLBACK_IMAGE;
};

function dateWindowActive(start, end) {
    const now = Date.now(); const s = start ? new Date(start).getTime() : 0; const e = end ? new Date(end).getTime() : Infinity;
    return (!Number.isFinite(s) || now >= s) && (!Number.isFinite(e) || now <= e);
}
function applyPromoBanner(settings = {}) {
    document.getElementById('storePromoBanner')?.remove();
    if (!settings.promoBannerEnabled || settings.promoBannerActive === false || !dateWindowActive(settings.promoBannerStartsAt, settings.promoBannerEndsAt)) return;
    const main = document.querySelector('main.site-main, main.products-main, main'); if (!main) return;
    const banner = document.createElement('aside'); banner.id='storePromoBanner'; banner.className='store-promo-banner';
    const bg = settings.promoBannerImage ? ` style="--promo-image:url('${String(settings.promoBannerImage).replace(/'/g,'%27')}')"` : '';
    banner.innerHTML = `<div class="store-promo-banner__inner"${bg}><div class="store-promo-banner__copy"><span class="material-symbols-outlined">campaign</span><strong>${escapeStoreHtml(settings.promoBannerText || 'عروض مميزة من TECHNOLOGY STORE')}</strong></div><a href="${escapeStoreHtml(settings.promoBannerLink || '/products')}" class="store-promo-banner__cta">${escapeStoreHtml(settings.promoBannerButtonText || 'اكتشف الآن')} <span class="material-symbols-outlined">arrow_back</span></a><button type="button" class="store-promo-banner__close" aria-label="إغلاق البانر">×</button></div>`;
    banner.querySelector('.store-promo-banner__close').onclick=()=>banner.remove();
    main.insertAdjacentElement('afterbegin', banner);
}
function applySeasonalEffect(settings = {}) {
    document.getElementById('seasonalEffectLayer')?.remove();
    document.getElementById('seasonalGreeting')?.remove();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !settings.seasonalEffectEnabled || settings.seasonalEffect === 'off' || settings.seasonalEffectActive === false || !dateWindowActive(settings.seasonalEffectStartsAt, settings.seasonalEffectEndsAt)) return;
    const map={snow:['❄','❅','✦'],hearts:['♥','♡','❤'],spring:['🌸','✿','❀'],autumn:['🍂','🍁','❧'],ramadan:['🌙','✦','★','✨'],eid:['✨','★','🎊','✦'],confetti:['◆','●','▲','■']};
    const symbols=map[settings.seasonalEffect] || map.snow;
    const lowEnd=(navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    const counts={low:12,medium:22,high:34}; let count=counts[settings.seasonalEffectIntensity] || 22; if(lowEnd) count=Math.min(count,14);
    const layer=document.createElement('div'); layer.id='seasonalEffectLayer'; layer.className=`seasonal-effect-layer seasonal-${settings.seasonalEffect}`; layer.setAttribute('aria-hidden','true');
    const frag=document.createDocumentFragment();
    for(let i=0;i<count;i++){ const span=document.createElement('span'); span.textContent=symbols[i%symbols.length]; span.style.setProperty('--x',`${Math.random()*100}vw`); span.style.setProperty('--size',`${12+Math.random()*16}px`); span.style.setProperty('--delay',`${-Math.random()*14}s`); span.style.setProperty('--duration',`${9+Math.random()*10}s`); span.style.setProperty('--drift',`${-30+Math.random()*60}px`); frag.appendChild(span); }
    layer.appendChild(frag); document.body.appendChild(layer);
    if(settings.seasonalMessage){ const msg=document.createElement('div'); msg.id='seasonalGreeting'; msg.className='seasonal-greeting'; msg.textContent=settings.seasonalMessage; document.body.appendChild(msg); setTimeout(()=>msg.classList.add('show'),300); setTimeout(()=>msg.classList.remove('show'),6500); }
}
function applyStoreGrowthSettings(settings={}) {
    applyPromoBanner(settings); applySeasonalEffect(settings);
    document.body.classList.toggle('wishlist-disabled', settings.enableWishlist === false);
    document.body.classList.toggle('compare-disabled', settings.enableCompare === false);
    const wishBtn=document.getElementById('wishlistFilterBtn'); if(wishBtn) wishBtn.hidden=settings.enableWishlist===false;
    initPushOptIn(settings); renderHomeGrowthSections(); renderRecentlyViewed(); renderCompareBar(); setupSmartSearchSuggestions();
}

async function loadStoreSettings() {
    try {
        const response = await fetch(`${BASE_URL}/api/settings`);
        const settings = await response.json();
        if (settings) {
            if (settings.defaultProductImage) window.defaultProductImage = settings.defaultProductImage;
            window.isShippingEnabled = settings.isShippingEnabled || false;
            applyDynamicSocialLinks(settings);
            applyStoreGrowthSettings(settings);
        }
    } catch (err) {
        console.error('Error loading settings:', err);
    }
}

function getFallbackImage(product) {
    if (window.defaultProductImage && !isPlaceholderImage(window.defaultProductImage)) {
        return window.defaultProductImage;
    }
    return LOCAL_FALLBACK_IMAGE;
}

// جلب المنتجات وتفعيل البحث
async function fetchProducts() {
    const grid = document.getElementById('productsGrid');
    const pagePath = window.location.pathname.toLowerCase();
    const isProductsPage = pagePath.includes('products') || pagePath.includes('products.html');

    if (grid) {
        let skeletonHtml = '';
        for(let i = 0; i < 8; i++) {
            skeletonHtml += `
                <article class="glass-panel rounded-xl overflow-hidden flex flex-col h-full border border-outline-variant/30 animate-pulse">
                    <div class="relative aspect-square bg-surface-variant/50 w-full"></div>
                    <div class="p-3 md:p-5 flex flex-col flex-1 gap-3">
                        <div class="h-3 bg-surface-variant/50 rounded w-1/4"></div>
                        <div class="h-5 bg-surface-variant/50 rounded w-3/4 mb-2"></div>
                        <div class="space-y-2 mb-4">
                            <div class="h-2 bg-surface-variant/30 rounded w-full"></div>
                            <div class="h-2 bg-surface-variant/30 rounded w-5/6"></div>
                            <div class="h-2 bg-surface-variant/30 rounded w-4/6"></div>
                        </div>
                        <div class="mt-auto pt-3 md:pt-4 border-t border-outline-variant/30 flex justify-between">
                            <div class="h-6 bg-surface-variant/50 rounded w-1/3"></div>
                            <div class="h-6 bg-surface-variant/50 rounded w-8 rounded-full"></div>
                        </div>
                    </div>
                </article>
            `;
        }
        grid.innerHTML = skeletonHtml;
    }

    try {
        // Mobile-first performance: المنتجات هي أهم محتوى مرئي، لذلك لا نؤخر عرضها بسبب
        // الإحصائيات أو الأقسام أو إعدادات إضافية يمكن تحميلها بعد أول رسم للصفحة.
        const productsPromise = fetch(API_URL).then(r => {
            if (!r.ok) throw new Error(`Products API ${r.status}`);
            return r.json();
        });
        const settingsPromise = fetch(`${BASE_URL}/api/settings`).then(r => r.ok ? r.json() : ({})).catch(() => ({}));
        let analyticsPromise = null;

        const allFetchedProducts = await productsPromise;
        globalProducts = (Array.isArray(allFetchedProducts) ? allFetchedProducts : []).filter(p => {
            const hasValidImage = !!(p.image && !isPlaceholderImage(p.image));
            return !p.isHidden && hasValidImage;
        });
        setupSmartSearchSuggestions();
        renderRecentlyViewed();
        renderHomeGrowthSections();

        populateCatalogBrandFilter();
        const minPriceInput = document.getElementById('minPriceFilter');
        const maxPriceInput = document.getElementById('maxPriceFilter');
        if (minPriceInput) minPriceInput.value = minPriceFilter;
        if (maxPriceInput) maxPriceInput.value = maxPriceFilter;

        // اعرض المنتجات فوراً. البيانات الثانوية تُحمّل بعد ذلك بدون تعطيل أول رسم.
        window.globalAnalytics = window.globalAnalytics || {};

        settingsPromise.then(settings => {
            if (!settings) return;
            window.storeSettings = settings;
            if (settings.defaultProductImage) window.defaultProductImage = settings.defaultProductImage;
            window.isShippingEnabled = settings.isShippingEnabled || false;
            applyDynamicSocialLinks(settings);
            applyStoreGrowthSettings(settings);

            if (settings.isPixelEnabled && settings.fbPixelId) {
                let fbLoaded = false;
                const loadFacebookPixel = () => {
                    if (fbLoaded) return;
                    fbLoaded = true;
                    initMetaPixel(settings.fbPixelId);
                };
                ['scroll','click','touchstart'].forEach(evt => window.addEventListener(evt, loadFacebookPixel, { once:true, passive:true }));
                setTimeout(loadFacebookPixel, 1800);
            }
        });

        analyticsPromise = fetch(`${BASE_URL}/api/analytics/popular`).then(r => r.ok ? r.json() : ({})).catch(() => ({}));
        analyticsPromise.then(data => { window.globalAnalytics = data || {}; renderHomeGrowthSections(); });
        // تحديث الأقسام في الخلفية ولا نمنع ظهور الكتالوج أثناء انتظارها.
        renderDynamicCategoryFilters().catch(() => {});

        // تفعيل فلتر الترتيب وإخفاء المنتجات النافدة
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.value = currentSort;
            sortSelect.addEventListener('change', (e) => {
                currentSort = e.target.value;
                sessionStorage.setItem('tech_currentSort', currentSort);
                renderProducts(activeCategory, activeSearchTerm);
            });
        }

        const urlParams = new URLSearchParams(window.location.search);
        const initialSearch = urlParams.get('q');
        const sharePathMatch = window.location.pathname.match(/^\/p\/(.+?)\/?$/i);
        const sharePathParts = sharePathMatch ? sharePathMatch[1].split('/').filter(Boolean) : [];
        const legacyShortCode = sharePathParts.length === 1 ? decodeProductShareCode(sharePathParts[0]) : '';
        const initialId = urlParams.get('id') || String(window.__SHARED_PRODUCT_ID__ || '') || legacyShortCode;
        const initialCategory = urlParams.get('category');

        if (initialId) {
            // روابط /p/... تعمل كتجربة صفحة منتج مستقلة بصرياً، مع بقاء نفس منطق المنتج الآمن.
            if (window.__DIRECT_PRODUCT_MODE__) document.body.classList.add('direct-product-route');
            renderProducts("all", "");
            setTimeout(() => {
                if (typeof openProductModal === 'function') {
                    openProductModal(initialId);
                }
            }, 300);
        } else if (initialCategory) {
            // تفعيل الفلترة للفئة المحددة في الرابط
            const filterButtons = document.querySelectorAll('.filter-btn');
            let found = false;
            filterButtons.forEach(btn => {
                if (btn.dataset.category === initialCategory) {
                    btn.click();
                    found = true;
                }
            });
            if (!found) {
                renderProducts(initialCategory, initialSearch || "");
            }
        } else if (initialSearch) {
            document.querySelectorAll('input[placeholder="ابحث في الكتالوج..."]').forEach(input => input.value = initialSearch);
            renderProducts("all", initialSearch);
        } else {
            // استعادة حالة التصفح المحفوظة (القسم والصفحة والسكرول)
            const savedPage = parseInt(sessionStorage.getItem('tech_currentPage')) || 1;
            const savedSort = sessionStorage.getItem('tech_currentSort');
            if (savedSort) {
                currentSort = savedSort;
                const sortSelect = document.getElementById('sortSelect');
                if (sortSelect) sortSelect.value = currentSort;
            }
            
            // تفعيل زر القسم المحفوظ
            if (activeCategory !== 'all') {
                const filterButtons = document.querySelectorAll('.filter-btn');
                filterButtons.forEach(btn => {
                    if (btn.dataset.category === activeCategory) {
                        btn.classList.remove('bg-surface-container', 'text-on-surface-variant', 'border-outline-variant');
                        btn.classList.add('bg-primary', 'text-on-primary', 'border-primary', 'active');
                    } else {
                        btn.classList.remove('bg-primary', 'text-on-primary', 'border-primary', 'active');
                        btn.classList.add('bg-surface-container', 'text-on-surface-variant', 'border-outline-variant');
                    }
                });
            }
            
            // تحميل كل الصفحات حتى الصفحة المحفوظة
            renderProducts(activeCategory, activeSearchTerm);
            if (savedPage > 1) {
                for (let pg = 2; pg <= savedPage; pg++) {
                    currentPage = pg;
                    renderProducts(activeCategory, activeSearchTerm, true);
                }
            }
            
            // استعادة موضع السكرول
            const savedScroll = parseInt(sessionStorage.getItem('tech_scrollPos'));
            if (savedScroll > 0) {
                requestAnimationFrame(() => {
                    setTimeout(() => window.scrollTo(0, savedScroll), 100);
                });
            }
        }
    } catch (error) {
        console.error('خطأ:', error);
        const grid = document.getElementById('productsGrid');
        if (grid) grid.innerHTML = '<p class="text-center w-full text-red-400">حدث خطأ في تحميل المنتجات، يرجى التأكد من تشغيل السيرفر.</p>';
    }
}

// إنشاء فلاتر الأقسام ديناميكياً
async function renderDynamicCategoryFilters() {
    const sidebar = document.getElementById('categoryFilters');
    const mobileBar = document.getElementById('mobileCategoryFilters');
    if (!sidebar && !mobileBar) return;

    // جلب الأقسام من السيرفر ودمجها مع الأقسام الموجودة في المنتجات
    let uniqueCategories = [];
    const productCategories = [...new Set(globalProducts.map(p => p.category).filter(Boolean))];
    try {
        const res = await fetch(`${BASE_URL}/api/categories`);
        const data = await res.json();
        const apiCategories = Array.isArray(data) ? data.map(c => c.name) : [];
        uniqueCategories = [...new Set([...apiCategories, ...productCategories])];
    } catch(err) {
        uniqueCategories = productCategories;
    }

    // أضف قسم العروض إذا كان هناك خصومات فعالة
    const hasActiveDiscounts = globalProducts.some(p => p.discountExpiresAt && new Date(p.discountExpiresAt) > new Date());
    if (hasActiveDiscounts) {
        uniqueCategories.unshift('🔥 عروض وخصومات');
    }

    // أيقونات الأقسام الافتراضية (SVG)
    const iconSvgMap = {
        'أنظمة مراقبة': '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>',
        'شبكات': '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0"></path></svg>',
        'تجميعات كمبيوتر': '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>',
        'لاب توبات': '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>',
        'شاشات': '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>',
        'إكسسوارات': '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path></svg>',
        'اكسسوارات': '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path></svg>',
        'صيانة واصلاح': '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>',
        '🔥 عروض وخصومات': '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"></path></svg>',
        'أخرى': '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"></path></svg>'
    };
    const defaultCatSvg = '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>';
    const getIconSvg = (cat) => iconSvgMap[cat] || defaultCatSvg;

    // 1. رندرة القائمة الجانبية (شاشات الكمبيوتر)
    if (sidebar) {
        let html = `
            <button class="filter-btn active flex w-full items-center gap-3 p-3 rounded-lg bg-primary/10 text-primary border-r-4 border-primary hover:border-primary/40 transition-all duration-200 text-lg" data-category="all">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg> عرض الكل
            </button>
        `;
        uniqueCategories.forEach(cat => {
            html += `
                <button class="filter-btn flex w-full items-center gap-3 p-3 rounded-lg text-on-surface-variant hover:bg-surface-variant/50 hover:border-primary/40 transition-all duration-200 text-lg" data-category="${cat}">
                    ${getIconSvg(cat)} ${cat}
                </button>
            `;
        });
        sidebar.innerHTML = html;
    }

    // 2. رندرة قائمة الموبايل العلوية
    if (mobileBar) {
        let html = `
            <button class="filter-btn active shrink-0 px-4 py-2 rounded-full bg-primary/20 text-primary border border-primary/30 text-sm font-bold whitespace-nowrap" data-category="all">الكل</button>
        `;
        uniqueCategories.forEach(cat => {
            html += `
                <button class="filter-btn shrink-0 px-4 py-2 rounded-full bg-surface-container text-on-surface-variant border border-outline-variant text-sm whitespace-nowrap" data-category="${cat}">${cat}</button>
            `;
        });
        mobileBar.innerHTML = html;
    }

    // 3. تفعيل الأكشن للفلاتر الديناميكية
    const allFilters = document.querySelectorAll('.filter-btn');
    allFilters.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const selectedCat = e.currentTarget.dataset.category;

            // مزامنة حالة النشاط في القائمتين
            allFilters.forEach(f => {
                if (f.dataset.category === selectedCat) {
                    f.classList.add('active');
                    if (f.classList.contains('flex')) {
                        f.classList.add('bg-primary/10', 'text-primary', 'border-r-4', 'border-primary');
                        f.classList.remove('text-on-surface-variant');
                    } else {
                        f.classList.add('bg-primary/20', 'text-primary', 'border-primary/30');
                        f.classList.remove('bg-surface-container', 'text-on-surface-variant', 'border-outline-variant');
                    }
                } else {
                    f.classList.remove('active');
                    if (f.classList.contains('flex')) {
                        f.classList.remove('bg-primary/10', 'text-primary', 'border-r-4', 'border-primary');
                        f.classList.add('text-on-surface-variant');
                    } else {
                        f.classList.remove('bg-primary/20', 'text-primary', 'border-primary/30');
                        f.classList.add('bg-surface-container', 'text-on-surface-variant', 'border-outline-variant');
                    }
                }
            });

            renderProducts(selectedCat, activeSearchTerm || '');
        });
    });
}

// فلاتر إضافية للكتالوج (علامة تجارية + نطاق سعر)
function populateCatalogBrandFilter() {
    const select = document.getElementById('brandFilter');
    if (!select) return;
    const brands = [...new Set(globalProducts.map(p => String(p.publicBrand || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'ar'));
    select.innerHTML = '<option value="">كل العلامات التجارية</option>' + brands.map(brand => {
        const safe = String(brand).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
        return `<option value="${safe}">${safe}</option>`;
    }).join('');
    if (brands.includes(activeBrand)) select.value = activeBrand;
}

window.applyCatalogFilters = function() {
    activeBrand = document.getElementById('brandFilter')?.value || '';
    minPriceFilter = document.getElementById('minPriceFilter')?.value || '';
    maxPriceFilter = document.getElementById('maxPriceFilter')?.value || '';
    sessionStorage.setItem('tech_activeBrand', activeBrand);
    sessionStorage.setItem('tech_minPrice', minPriceFilter);
    sessionStorage.setItem('tech_maxPrice', maxPriceFilter);
    currentPage = 1;
    renderProducts(activeCategory, activeSearchTerm);
};

window.scheduleCatalogFilter = function() {
    clearTimeout(catalogFilterTimer);
    catalogFilterTimer = setTimeout(() => window.applyCatalogFilters(), 220);
};

window.clearCatalogFilters = function() {
    activeBrand = '';
    minPriceFilter = '';
    maxPriceFilter = '';
    wishlistOnly = false;
    offersOnly = false;
    document.getElementById('wishlistFilterBtn')?.classList.remove('active');
    document.getElementById('offersFilterBtn')?.classList.remove('active');
    ['brandFilter', 'minPriceFilter', 'maxPriceFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    sessionStorage.removeItem('tech_activeBrand');
    sessionStorage.removeItem('tech_minPrice');
    sessionStorage.removeItem('tech_maxPrice');
    currentPage = 1;
    renderProducts(activeCategory, activeSearchTerm);
};

window.toggleCatalogFilters = function() {
    const panel = document.getElementById('catalogControls');
    const btn = panel?.querySelector('.catalog-filter-toggle');
    if (!panel) return;
    const open = panel.classList.toggle('filters-open');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
};

function setupMobileCatalogSearch() {
    const input = document.getElementById('mobileCatalogSearch');
    if (!input) return;
    input.value = activeSearchTerm;
    input.addEventListener('input', (e) => {
        activeSearchTerm = e.target.value.trim();
        document.querySelectorAll('input[placeholder="ابحث في الكتالوج..."]').forEach(other => { other.value = activeSearchTerm; });
        renderProducts(activeCategory, activeSearchTerm);
    });
}

// عرض المنتجات (مع دعم البحث والتصنيف والترجمة التلقائية)
function renderProducts(categoryFilter = "all", searchTerm = "", append = false) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    if (!append) {
        grid.innerHTML = '';
        if (activeCategory !== categoryFilter || activeSearchTerm !== searchTerm) {
            activeCategory = categoryFilter;
            activeSearchTerm = searchTerm;
        }
        currentPage = 1;
    }

    const categoryMap = {
        'Laptops': ['لاب توبات', 'laptops', 'لابتوب', 'لابتوبات'],
        'Desktops': ['تجميعات كمبيوتر', 'تجميعات', 'desktops', 'desktop'],
        'Monitors': ['شاشات', 'monitors', 'شاشة'],
        'Accessories': ['إكسسوارات', 'اكسسوارات', 'accessories', 'accessory'],
        'Networking': ['شبكات', 'networking', 'شبكة'],
        'Surveillance': ['أنظمة مراقبة', 'مراقبة', 'surveillance', 'كاميرات']
    };

    let filtered = [...globalProducts];
    if (categoryFilter === '🔥 عروض وخصومات') {
        filtered = globalProducts.filter(p => p.discountExpiresAt && new Date(p.discountExpiresAt) > new Date());
    } else if (categoryFilter !== "all") {
        filtered = globalProducts.filter(p => {
            if (p.category === categoryFilter) return true;
            const mappedValues = categoryMap[categoryFilter];
            if (mappedValues) {
                return mappedValues.some(val => p.category.toLowerCase().includes(val.toLowerCase()) || val.toLowerCase().includes(p.category.toLowerCase()));
            }
            return false;
        });
    }

    // البحث الذكي (Smart Multi-keyword Search)
    if (searchTerm) {
        const keywords = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
        filtered = filtered.filter(p => {
            return keywords.every(keyword => {
                const titleMatch = p.title.toLowerCase().includes(keyword);
                const descMatch = Array.isArray(p.description)
                    ? p.description.some(spec => spec.toLowerCase().includes(keyword))
                    : (p.description || '').toLowerCase().includes(keyword);
                const categoryMatch = (p.category || '').toLowerCase().includes(keyword);
                const brandMatch = (p.publicBrand || '').toLowerCase().includes(keyword);
                const skuMatch = (p.sku || '').toLowerCase().includes(keyword);
                const tagMatch = Array.isArray(p.tags) && p.tags.some(tag => String(tag).toLowerCase().includes(keyword));
                
                return titleMatch || descMatch || categoryMatch || brandMatch || skuMatch || tagMatch;
            });
        });
    }

    // فلاتر العلامة التجارية والسعر — تعمل محلياً على نفس البيانات بدون أي تعديل في الداتا
    if (activeBrand) {
        filtered = filtered.filter(p => String(p.publicBrand || '') === activeBrand);
    }
    const minPrice = Number(minPriceFilter);
    const maxPrice = Number(maxPriceFilter);
    if (minPriceFilter !== '' && Number.isFinite(minPrice)) filtered = filtered.filter(p => Number(p.price) >= minPrice);
    if (maxPriceFilter !== '' && Number.isFinite(maxPrice)) filtered = filtered.filter(p => Number(p.price) <= maxPrice);
    if (wishlistOnly && featureEnabled('enableWishlist')) { const wishes=new Set(getWishlistIds()); filtered=filtered.filter(p=>wishes.has(String(p._id))); }
    if (offersOnly) filtered = filtered.filter(p => Number(p.oldPrice) > Number(p.price));

    // إخفاء المنتجات الصفرية من الكتالوج العام
    filtered = filtered.filter(p => Number(p.price) > 0 && Number(p.stockQuantity) > 0);

    // تحديث عدد النتائج قبل التقسيم إلى صفحات
    const resultCountEl = document.getElementById('productsResultCount');
    if (resultCountEl) {
        resultCountEl.textContent = filtered.length === 1 ? 'منتج واحد متاح' : `${filtered.length} منتج متاح`;
    }

    // الترتيب
    if (currentSort === 'price_asc') {
        filtered.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (currentSort === 'price_desc') {
        filtered.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else if (currentSort === 'newest') {
        filtered.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });
    } else {
        // الأكثر اهتماماً: واتساب > إضافة للسلة > المشاهدات، ثم الأحدث عند التساوي
        filtered.sort((a, b) => {
            const featuredDiff = (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0);
            if (featuredDiff !== 0) return featuredDiff;
            const scoreDiff = getPopularityScore(b._id) - getPopularityScore(a._id);
            if (scoreDiff !== 0) return scoreDiff;
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });
    }

    // دفع المنتجات النافدة إلى نهاية القائمة تلقائياً ليكون المتجر حيوياً بالمنتجات المتاحة
    filtered.sort((a, b) => {
        const aOut = (a.stockQuantity === 0) ? 1 : 0;
        const bOut = (b.stockQuantity === 0) ? 1 : 0;
        return aOut - bOut;
    });

    // حساب الصفحات
    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    // قطع المنتجات
    const start = append ? (currentPage - 1) * ITEMS_PER_PAGE : 0;
    const end = append ? currentPage * ITEMS_PER_PAGE : ITEMS_PER_PAGE;
    const pageProducts = filtered.slice(start, end);

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center; width:100%; color:#94a3b8;">لا توجد منتجات مطابقة للبحث.</p>';
        updatePaginationControls(0);
        return;
    }

    // استخدام DocumentFragment لرندر جميع الكروت دفعة واحدة بدلاً من إعادة parse الـ DOM في كل مرة
    const fragment = document.createDocumentFragment();
    const tempContainer = document.createElement('div');

    pageProducts.forEach((p, index) => {
        const specsHtml = Array.isArray(p.description) 
            ? p.description.map(spec => `<li class="flex gap-2 items-start"><span class="text-primary mt-1">•</span><span>${spec}</span></li>`).join('') 
            : `<li class="flex gap-2 items-start"><span class="text-primary mt-1">•</span><span>${p.description || ''}</span></li>`;
        const priceDisplay = isNaN(p.price) ? p.price : `${p.price} ج.م`;
        const hasDiscount = p.oldPrice && Number(p.oldPrice) > Number(p.price);
        const discountPercentage = hasDiscount ? Math.round(((Number(p.oldPrice) - Number(p.price)) / Number(p.oldPrice)) * 100) : 0;

        const priceHtml = hasDiscount 
            ? `<div class="flex flex-col">
                 <span class="text-[10px] md:text-xs text-on-surface-variant/50 line-through font-mono-data mb-0.5">${p.oldPrice} ج.م</span>
                 <span class="font-display-lg text-base md:text-xl text-primary text-glow font-bold">${p.price} ج.م</span>
               </div>`
            : `<span class="font-display-lg text-base md:text-xl text-primary text-glow font-bold">${priceDisplay}</span>`;
        
        let availabilityBadge = '';
        let isOutOfStock = false;
        if (p.stockQuantity === 0) {
            isOutOfStock = true;
            availabilityBadge = `<div class="catalog-stock-badge catalog-stock-badge--out">نفدت الكمية</div>`;
        } else {
            // لا نعرض عدد القطع المتبقية للعميل؛ أي مخزون موجب يظهر فقط كـ "متوفر".
            availabilityBadge = `<div class="catalog-stock-badge catalog-stock-badge--in">متوفر</div>`;
        }
        const autoBadges = [];
        if (p.customBadge) autoBadges.push({text:p.customBadge, cls:'custom'});
        if (p.isFeatured) autoBadges.push({text:'مميز', cls:'featured'});
        if (isNewProduct(p)) autoBadges.push({text:'جديد', cls:'new'});
        if (getPopularityScore(p._id) >= 10) autoBadges.push({text:'رائج', cls:'popular'});
        const growthBadgesHtml = autoBadges.slice(0,2).map(b => `<span class="catalog-growth-badge catalog-growth-badge--${b.cls}">${escapeStoreHtml(b.text)}</span>`).join('');

        let discountTimerHtml = '';
        if (p.discountExpiresAt && new Date(p.discountExpiresAt) > new Date()) {
            discountTimerHtml = `
                <div class="absolute bottom-2 left-1/2 -translate-x-1/2 w-[90%] bg-red-500/10 backdrop-blur border border-red-500/30 rounded-md py-1 px-2 flex justify-center shadow-[0_0_10px_rgba(239,68,68,0.2)] countdown-container" data-expires="${p.discountExpiresAt}">
                    <div class="flex gap-1 text-[11px] font-mono-data font-bold text-red-400 tracking-widest countdown-timer" dir="ltr">جاري الحساب...</div>
                </div>
            `;
        }

        const whatsappLink = buildWhatsappUrl(`أريد الاستفسار عن منتج: ${p.title}`);

        const fbImage = getFallbackImage(p);
        const hasValidImage = !!(p.image && !isPlaceholderImage(p.image));
        const optimizedImage = hasValidImage ? getOptimizedImageUrl(p.image, 400, 400) : fbImage;
        const smallImage = hasValidImage ? getOptimizedImageUrl(p.image, 200, 200) : fbImage;
        const priorityCount = window.matchMedia('(max-width: 767px)').matches ? 2 : 4;
        const loadingAttr = index < priorityCount && !append ? 'eager' : 'lazy';
        const priorityAttr = index < priorityCount && !append ? 'fetchpriority="high"' : '';
        const decodeAttr = 'decoding="async"';

        const cardHtml = `
            <article class="catalog-product-card glass-panel rounded-xl overflow-hidden flex flex-col card-hover-effect transition-all duration-300 group ${isOutOfStock ? 'opacity-70' : ''}">
                <div class="catalog-product-media relative aspect-square w-full bg-gradient-to-b from-surface-container-highest to-surface flex items-center justify-center overflow-hidden cursor-pointer" onclick="openProductModal('${p._id}')">
                    <img alt="${p.title}" loading="${loadingAttr}" ${priorityAttr} ${decodeAttr} width="400" height="400" class="catalog-product-image max-w-full max-h-full w-auto h-auto object-contain p-2 rounded-2xl group-hover:scale-105 transition-transform duration-500" src="${optimizedImage}" onerror="handleProductImageError(this)" ${hasValidImage ? 'srcset="' + smallImage + ' 200w, ' + optimizedImage + ' 400w" sizes="(max-width: 768px) 200px, 400px"' : ''}>
                    ${availabilityBadge}
                    <div class="catalog-card-quick-tools">
                        ${featureEnabled('enableWishlist') ? `<button type="button" class="catalog-quick-icon" data-wishlist-id="${p._id}" onclick="toggleWishlist('${p._id}', event)" aria-label="إضافة للمفضلة" aria-pressed="${isWishlisted(p._id)}"><span class="material-symbols-outlined">${isWishlisted(p._id)?'favorite':'favorite_border'}</span></button>` : ''}
                        ${featureEnabled('enableCompare') ? `<button type="button" class="catalog-quick-icon" data-compare-id="${p._id}" onclick="toggleCompare('${p._id}', event)" aria-label="مقارنة المنتج" aria-pressed="${isCompared(p._id)}"><span class="material-symbols-outlined">compare_arrows</span></button>` : ''}
                    </div>
                    <div class="catalog-growth-badges">${growthBadgesHtml}${hasDiscount ? `<span class="catalog-growth-badge catalog-growth-badge--sale">خصم ${discountPercentage}%</span>` : ''}</div>
                    ${discountTimerHtml}
                </div>
                <div class="catalog-product-body p-3 md:p-5 flex flex-col flex-1">
                    <div class="catalog-card-meta">
                        <span class="catalog-card-category">${escapeStoreHtml(p.category)}</span>
                        ${p.publicBrand ? `<span class="catalog-card-brand">${escapeStoreHtml(p.publicBrand)}</span>` : ''}
                    </div>
                    <h3 class="catalog-product-title font-headline-md text-sm md:text-lg text-on-surface leading-tight mb-2 line-clamp-2 cursor-pointer hover:text-primary transition-colors" onclick="openProductModal('${p._id}')">${escapeStoreHtml(p.title)}</h3>
                    ${p.warranty ? `<div class="catalog-card-warranty"><span class="material-symbols-outlined">verified_user</span>${escapeStoreHtml(p.warranty)}</div>` : ''}
                    <ul class="hidden md:flex text-xs text-on-surface-variant mb-4 flex-col gap-1.5 flex-1">${specsHtml}</ul>
                    
                    <div class="catalog-product-footer mt-auto pt-3 md:pt-4 flex flex-col gap-2 border-t border-outline-variant/30">
                        <div class="flex items-center justify-between gap-2">
                            ${priceHtml}
                            <button onclick="event.stopPropagation(); shareProductById('${p._id}')" class="text-on-surface-variant hover:text-primary transition-colors p-2 bg-surface rounded-full border border-outline-variant/30 shrink-0" title="مشاركة">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                                </svg>
                            </button>
                        </div>
                        <div class="catalog-product-actions grid grid-cols-2 gap-1.5 sm:gap-2">
                            <button onclick="addToCart('${p._id}'); event.stopPropagation();" class="${!isOutOfStock ? 'bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary' : 'bg-primary/10 border border-primary/10 text-primary/40 pointer-events-none'} w-full rounded h-10 px-1 sm:px-2 text-[10px] sm:text-[11px] md:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-2" title="أضف للسلة">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                                <span class="whitespace-nowrap">أضف للسلة</span>
                            </button>
                            <a href="${whatsappLink}" target="_blank" onclick="event.stopPropagation();" class="${!isOutOfStock ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-[#00D06C]/50 text-white/50 pointer-events-none'} w-full rounded h-10 px-1 sm:px-2 text-[10px] sm:text-[11px] md:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-2" title="استفسر">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 sm:w-5 sm:h-5 shrink-0" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>
                                <span class="whitespace-nowrap">استفسر</span>
                            </a>
                        </div>
                    </div>
                </div>
            </article>
        `;
        tempContainer.innerHTML = cardHtml;
        const cardEl = tempContainer.firstElementChild;
        if (cardEl) fragment.appendChild(cardEl);
    });

    // إضافة جميع الكروت للـ DOM في عملية واحدة
    grid.appendChild(fragment);
    syncGrowthUI();
    if (window.applyTechReveal) window.applyTechReveal(grid);

    updatePaginationControls(filtered.length);
}

// تحديث أزرار التنقل بين الصفحات
function updatePaginationControls(totalItems) {
    const controls = document.getElementById('paginationControls');
    if (!controls) return;

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    
    if (currentPage >= totalPages || totalItems === 0) {
        controls.innerHTML = '';
        controls.classList.add('hidden');
        return;
    }
    controls.classList.remove('hidden');

    controls.innerHTML = `
        <button onclick="loadMoreProducts()" class="w-full md:w-auto px-10 py-3 bg-primary/10 text-primary border border-primary/30 font-bold rounded-full hover:bg-primary hover:text-white transition-all shadow-lg hover:shadow-primary/30 mx-auto block mt-8">
            عرض المزيد
        </button>
    `;
}

window.loadMoreProducts = function() {
    currentPage++;
    renderProducts(activeCategory, activeSearchTerm, true);
};

window.changePage = function(page) {
    // deprecated
};

window.changePage = function(page) {
    const totalPages = Math.max(1, Math.ceil(globalProducts.length / ITEMS_PER_PAGE));
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    renderProducts(activeCategory, activeSearchTerm);
    
    // التمرير بسلاسة لأعلى المحتوى
    const mainSection = document.querySelector('main');
    if (mainSection) {
        mainSection.scrollIntoView({ behavior: 'smooth' });
    }
};

// مشاركة المنتج برابط قصير ونظيف
window.shareProduct = async (title, price, url) => {
    const cleanTitle = String(title || 'منتج من TECHNOLOGY').trim();
    const numericPrice = Number(price);
    const priceText = Number.isFinite(numericPrice) ? `${numericPrice.toLocaleString('ar-EG')} ج.م` : '';
    const shareText = priceText ? `${cleanTitle} — ${priceText}` : cleanTitle;
    if (navigator.share) {
        try { await navigator.share({ title: cleanTitle, text: shareText, url }); return; }
        catch (err) { if (err && err.name === 'AbortError') return; }
    }
    const fallbackText = `${shareText}
${url}`;
    try { await navigator.clipboard.writeText(fallbackText); alert('تم نسخ رابط المنتج القصير!'); }
    catch (_) { window.prompt('انسخ رابط المنتج:', url); }
};
window.shareProductById = (productId) => {
    const product = globalProducts.find(item => String(item._id) === String(productId));
    if (!product) return;
    return shareProduct(product.title, product.price, getProductShareUrl(product));
};

// دالة فارغة لمنع أخطاء oninput في الـ HTML حيث أن البحث يتم التعامل معه عبر المستمعات أدناه
window.searchProducts = function() {};

// نافذة تفاصيل المنتج (Product Modal)
function injectProductModal() {
    const modalHtml = `
        <div id="productModal" class="fixed inset-0 z-[100] hidden flex items-center justify-center p-4 sm:p-6 opacity-0 transition-opacity duration-300">
            <!-- Overlay -->
            <div class="absolute inset-0 bg-background/80 backdrop-blur-md cursor-pointer" onclick="closeProductModal()"></div>
            
            <!-- Modal Content -->
            <div class="product-detail-modal relative w-full max-w-5xl max-h-[92vh] overflow-y-auto glass-panel rounded-2xl border border-primary/20 shadow-2xl flex flex-col md:flex-row transform scale-95 transition-transform duration-300" id="productModalContent">
                
                <!-- Close Button -->
                <button onclick="closeProductModal()" class="product-detail-close absolute top-4 left-4 z-10 w-10 h-10 bg-surface-variant/80 hover:bg-red-500/80 hover:text-white rounded-full flex items-center justify-center text-on-surface transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>

                <!-- Image Section -->
                <div class="product-detail-media w-full md:w-1/2 p-5 flex flex-col justify-center items-center shrink-0 border-b md:border-b-0 md:border-l border-outline-variant/30 relative">
                    <div class="product-detail-image-stage w-full h-72 sm:h-80 md:h-96 rounded-2xl overflow-hidden bg-surface-container-high border border-outline-variant/20 shadow-inner flex items-center justify-center shrink-0 relative">
                        <img id="modalImage" src="" alt="Product Image" width="600" height="600" loading="lazy" class="mx-auto block object-contain max-w-full max-h-full w-auto h-auto p-2 rounded-2xl drop-shadow-2xl transition-opacity duration-200">
                    </div>
                    <div id="modalBadge" class="absolute top-7 right-7 z-10"></div>
                    <!-- Image Gallery -->
                    <div id="modalImageGallery" class="product-detail-gallery flex flex-wrap justify-center gap-2 mt-4 w-full px-2"></div>
                </div>

                <!-- Details Section -->
                <div class="product-detail-info w-full md:w-1/2 p-6 md:p-8 flex flex-col">
                    <span id="modalCategory" class="product-detail-category text-on-surface-variant text-xs font-mono-data tracking-wider uppercase mb-2"></span>
                    <h2 id="modalTitle" class="product-detail-title font-headline-md text-2xl md:text-3xl text-on-surface mb-4 leading-tight"></h2>
                    <div class="product-detail-price text-primary font-display-lg text-3xl font-bold text-glow mb-4" id="modalPrice"></div>
                    
                    <div id="modalExtraDetails" class="product-detail-meta grid grid-cols-2 gap-3 mb-6 bg-surface-container-high p-4 rounded-xl border border-outline-variant/30 text-sm">
                        <!-- Details injected here -->
                    </div>

                    <h4 class="product-detail-section-title text-sm font-bold text-on-surface mb-3 border-b border-outline-variant/30 pb-2"><span class="material-symbols-outlined">checklist</span> المواصفات الأساسية</h4>
                    <ul id="modalSpecs" class="product-detail-specs flex flex-col gap-2 text-sm text-on-surface-variant mb-8 flex-1"></ul>

                    <div class="product-detail-actions flex flex-col gap-3 mt-auto pt-4 border-t border-outline-variant/30">
                        <div class="product-detail-primary-actions flex gap-3">
                            <button id="modalAddToCartBtn" class="flex-1 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm md:text-base">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                                أضف للسلة
                            </button>
                            <a id="modalWhatsappBtn" href="#" target="_blank" class="flex-1 rounded-lg text-sm md:text-base font-bold py-3 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white transition-all shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>
                                استفسر الآن
                            </a>
                        </div>
                        <div class="product-detail-secondary-actions">
                            <button id="modalShareBtn" class="product-detail-share py-3 bg-surface-container border border-outline-variant/50 text-on-surface hover:text-primary rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"><span class="material-symbols-outlined">share</span> مشاركة</button>
                            <button id="modalWishlistBtn" class="product-detail-share py-3 bg-surface-container border border-outline-variant/50 text-on-surface hover:text-pink-400 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm" data-wishlist-id=""><span class="material-symbols-outlined">favorite_border</span> المفضلة</button>
                            <button id="modalCompareBtn" class="product-detail-share py-3 bg-surface-container border border-outline-variant/50 text-on-surface hover:text-primary rounded-lg transition-colors flex items-center justify-center gap-2 text-sm" data-compare-id=""><span class="material-symbols-outlined">compare_arrows</span> مقارنة</button>
                        </div>
                        
                        <!-- Related Products -->
                        <div id="modalRelatedProducts" class="product-detail-related mt-8 pt-6 border-t border-outline-variant/30 hidden">
                            <h4 class="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
                                منتجات مشابهة قد تعجبك
                            </h4>
                            <div id="relatedProductsContainer" class="grid grid-cols-2 gap-3"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.openProductModal = function(id) {
    if (window.modalImageInterval) clearInterval(window.modalImageInterval);
    const p = globalProducts.find(prod => prod._id === id);
    if (!p) return;
    // Analytics: track product view
    trackEvent('views', p._id, p.title);
    rememberRecentlyViewed(p._id);

    const fallbackImage = getSafeImageUrl(window.defaultProductImage, LOCAL_FALLBACK_IMAGE);
    const hasValidImage = !!(p.image && !isPlaceholderImage(p.image));
    const finalImage = hasValidImage ? getSafeImageUrl(p.image, fallbackImage) : fallbackImage;
    const modalMainImage = document.getElementById('modalImage');
    modalMainImage.dataset.fallbackApplied = '';
    modalMainImage.onerror = () => window.handleProductImageError(modalMainImage);
    modalMainImage.src = finalImage;
    modalMainImage.style.opacity = 1;
    document.getElementById('modalCategory').textContent = p.category;
    document.getElementById('modalTitle').textContent = p.title;
    const hasDiscount = p.oldPrice && Number(p.oldPrice) > Number(p.price);
    const discountPercentage = hasDiscount ? Math.round(((Number(p.oldPrice) - Number(p.price)) / Number(p.oldPrice)) * 100) : 0;
    
    if (hasDiscount) {
        document.getElementById('modalPrice').innerHTML = `
            <div class="flex items-baseline gap-3">
                <span class="text-glow text-primary">${p.price} ج.م</span>
                <span class="text-lg text-on-surface-variant/50 line-through font-mono-data">${p.oldPrice} ج.م</span>
                <span class="text-xs bg-red-500 text-white font-bold px-2 py-0.5 rounded-full">خصم ${discountPercentage}%</span>
            </div>
        `;
        if (p.discountExpiresAt && new Date(p.discountExpiresAt) > new Date()) {
            document.getElementById('modalPrice').innerHTML += `
                <div class="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[0_0_15px_rgba(239,68,68,0.15)] countdown-container" data-expires="${p.discountExpiresAt}">
                    <span class="text-sm text-red-400 font-bold flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> ينتهي العرض خلال:</span>
                    <div class="text-lg font-mono-data font-bold text-red-400 tracking-widest countdown-timer flex items-center" dir="ltr">جاري الحساب...</div>
                </div>
            `;
        }
    } else {
        document.getElementById('modalPrice').textContent = isNaN(p.price) ? p.price : `${p.price} ج.م`;
    }
    
    // Render Image Gallery
    const galleryContainer = document.getElementById('modalImageGallery');
    if (galleryContainer) {
        galleryContainer.innerHTML = '';
        
        // Add main image to gallery
        const mainImgBtn = document.createElement('button');
        mainImgBtn.className = 'w-16 h-16 rounded-xl border-2 border-primary overflow-hidden flex-shrink-0 transition-all hover:scale-105 bg-surface/50 p-0 flex items-center justify-center';
        mainImgBtn.innerHTML = `<img src="${finalImage}" onerror="handleProductImageError(this)" alt="Main Thumbnail" width="100" height="100" loading="lazy" class="max-w-full max-h-full w-auto h-auto object-contain p-1">`;
        mainImgBtn.onclick = () => {
            const mainImageEl = document.getElementById('modalImage');
            mainImageEl.style.opacity = 0;
            setTimeout(() => {
                mainImageEl.src = finalImage;
                mainImageEl.style.opacity = 1;
            }, 150);
            updateActiveGalleryImage(mainImgBtn);
        };
        galleryContainer.appendChild(mainImgBtn);

        // Add additional images
        if (p.additionalImages && p.additionalImages.length > 0) {
            p.additionalImages.forEach(img => {
                const btn = document.createElement('button');
                btn.className = 'w-16 h-16 rounded-xl border-2 border-transparent hover:border-primary/50 overflow-hidden flex-shrink-0 transition-all hover:scale-105 bg-surface/50 p-0 flex items-center justify-center';
                btn.innerHTML = `<img src="${getSafeImageUrl(img.url, fallbackImage)}" onerror="handleProductImageError(this)" alt="Thumbnail" width="100" height="100" loading="lazy" class="max-w-full max-h-full w-auto h-auto object-contain p-1">`;
                btn.onclick = () => {
                    const mainImageEl = document.getElementById('modalImage');
                    mainImageEl.style.opacity = 0;
                    setTimeout(() => {
                        mainImageEl.src = img.url;
                        mainImageEl.style.opacity = 1;
                    }, 150);
                    updateActiveGalleryImage(btn);
                };
                galleryContainer.appendChild(btn);
            });
        }

        function updateActiveGalleryImage(activeBtn) {
            Array.from(galleryContainer.children).forEach(btn => {
                btn.classList.remove('border-primary', 'opacity-100');
                btn.classList.add('border-transparent', 'opacity-60');
            });
            activeBtn.classList.remove('border-transparent', 'opacity-60');
            activeBtn.classList.add('border-primary', 'opacity-100');
        }

        if (galleryContainer.children.length > 1) {
            let currentIndex = 0;
            window.modalImageInterval = setInterval(() => {
                currentIndex = (currentIndex + 1) % galleryContainer.children.length;
                const nextBtn = galleryContainer.children[currentIndex];
                if (nextBtn) {
                    const mainImageEl = document.getElementById('modalImage');
                    mainImageEl.style.opacity = 0;
                    setTimeout(() => {
                        mainImageEl.src = nextBtn.querySelector('img').src;
                        mainImageEl.style.opacity = 1;
                    }, 150);
                    updateActiveGalleryImage(nextBtn);
                }
            }, 3000);
        }
    }
    
    const modalSpecs = Array.isArray(p.description) ? p.description : String(p.description || '').split(/\r?\n/).filter(Boolean);
    const specsHtml = modalSpecs.length
        ? modalSpecs.map(spec => `<li class="product-detail-spec-item"><span class="material-symbols-outlined">check_circle</span><span>${spec}</span></li>`).join('')
        : '<li class="product-detail-spec-item"><span class="material-symbols-outlined">info</span><span>لا توجد مواصفات إضافية مسجلة لهذا المنتج.</span></li>';
    document.getElementById('modalSpecs').innerHTML = specsHtml;

    // Extra Details (SKU, Brand, Warranty)
    const extraDetailsContainer = document.getElementById('modalExtraDetails');
    let extraHtml = '';
    if (p.publicBrand) extraHtml += `<div class="product-detail-meta-item"><span class="material-symbols-outlined">sell</span><div><small>العلامة التجارية</small><strong>${p.publicBrand}</strong></div></div>`;
    if (p.sku) extraHtml += `<div class="product-detail-meta-item"><span class="material-symbols-outlined">qr_code_2</span><div><small>السيريال كود (SKU)</small><strong class="font-mono-data">${p.sku}</strong></div></div>`;
    if (p.warranty) extraHtml += `<div class="product-detail-meta-item"><span class="material-symbols-outlined">verified_user</span><div><small>الضمان</small><strong>${p.warranty}</strong></div></div>`;
    
    if (extraHtml) {
        extraDetailsContainer.innerHTML = extraHtml;
        extraDetailsContainer.classList.remove('hidden');
    } else {
        extraDetailsContainer.classList.add('hidden');
    }

    const badgeContainer = document.getElementById('modalBadge');
    let isOutOfStock = false;
    if (p.stockQuantity === 0) {
        isOutOfStock = true;
        badgeContainer.innerHTML = `<div class="bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-1.5 rounded-full text-sm font-bold tracking-wide shadow-lg">نفدت الكمية</div>`;
    } else {
        badgeContainer.innerHTML = `<div class="bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-1.5 rounded-full text-sm font-bold tracking-wide shadow-lg">متوفر</div>`;
    }

    const whatsappBtn = document.getElementById('modalWhatsappBtn');
    whatsappBtn.href = buildWhatsappUrl(`أريد الاستفسار عن منتج: ${p.title}`);
    
    const addToCartBtn = document.getElementById('modalAddToCartBtn');
    
    if (isOutOfStock) {
        whatsappBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
        whatsappBtn.classList.add('bg-amber-600', 'hover:bg-amber-700', 'text-white');
        whatsappBtn.innerHTML = `<span class="material-symbols-outlined text-[20px]">notifications_active</span> أعلمني عند توفره (طلب توفير)`;
        whatsappBtn.href = buildWhatsappUrl(`مرحباً، أود معرفة موعد توفر هذا المنتج من جديد أو طلب حجز نسخة عند توفره: ${p.title}`);
        whatsappBtn.classList.remove('opacity-50', 'pointer-events-none');

        addToCartBtn.classList.add('opacity-50', 'pointer-events-none');
        addToCartBtn.classList.replace('bg-primary/20', 'bg-primary/10');
        addToCartBtn.classList.replace('text-primary', 'text-primary/40');
        addToCartBtn.onclick = null;
    } else {
        whatsappBtn.classList.remove('bg-amber-600', 'hover:bg-amber-700', 'opacity-50', 'pointer-events-none');
        whatsappBtn.classList.add('bg-green-500', 'hover:bg-green-600');
        whatsappBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg> استفسر الآن`;
        whatsappBtn.href = buildWhatsappUrl(`أريد الاستفسار عن منتج: ${p.title}`);
        whatsappBtn.classList.remove('opacity-50', 'pointer-events-none');
        addToCartBtn.classList.remove('opacity-50', 'pointer-events-none');
        addToCartBtn.classList.replace('bg-primary/10', 'bg-primary/20');
        addToCartBtn.classList.replace('text-primary/40', 'text-primary');
        addToCartBtn.onclick = () => addToCart(p._id);
    }

    const shareBtn = document.getElementById('modalShareBtn');
    shareBtn.onclick = () => shareProduct(p.title, p.price, getProductShareUrl(p));
    const modalWish = document.getElementById('modalWishlistBtn');
    if (modalWish) { modalWish.style.display = featureEnabled('enableWishlist') ? '' : 'none'; modalWish.dataset.wishlistId=p._id; modalWish.onclick=(e)=>toggleWishlist(p._id,e); }
    const modalCompare = document.getElementById('modalCompareBtn');
    if (modalCompare) { modalCompare.style.display = featureEnabled('enableCompare') ? '' : 'none'; modalCompare.dataset.compareId=p._id; modalCompare.onclick=(e)=>toggleCompare(p._id,e); }
    syncGrowthUI();
    
    // Quick Buy Button Injection
    const container = addToCartBtn.parentElement;
    const existingQb = container.querySelector('.quick-buy-btn');
    if (existingQb) existingQb.remove();
    
    if (!isOutOfStock && window.storeSettings && window.storeSettings.isQuickBuyEnabled) {
        const qb = document.createElement('button');
        qb.className = 'quick-buy-btn flex-1 py-3 bg-green-500 text-white font-bold rounded hover:bg-green-600 transition-colors flex items-center justify-center gap-1 text-sm shrink-0 whitespace-nowrap px-2';
        qb.innerHTML = 'شراء الآن ⚡';
        qb.onclick = () => openQuickBuyModal(p._id);
        container.insertBefore(qb, addToCartBtn);
        addToCartBtn.classList.remove('w-full');
        addToCartBtn.classList.add('flex-1', 'shrink-0', 'whitespace-nowrap', 'px-2');
        container.classList.add('flex', 'flex-col', 'sm:flex-row', 'gap-2');
    } else {
        addToCartBtn.classList.add('w-full');
        addToCartBtn.classList.remove('flex-1', 'shrink-0', 'whitespace-nowrap', 'px-2');
    }

    // Render Related Products (Cross-Selling)
    const relatedContainer = document.getElementById('relatedProductsContainer');
    const relatedSection = document.getElementById('modalRelatedProducts');
    if (relatedContainer && relatedSection) {
        if (window.storeSettings && window.storeSettings.isCrossSellEnabled) {
        // استبعاد المنتجات النافدة من الاقتراحات بحيث لا تظهر أبداً إلا بعد توفيرها مجدداً
        let related = globalProducts.filter(prod => prod.category === p.category && prod._id !== p._id && prod.stockQuantity !== 0);
        
        // ذكاء إضافي: إذا كان القسم "غير مصنف" أو فارغ، نبحث بأول كلمة من اسم المنتج كبديل
        if (!p.category || p.category === 'غير مصنف' || p.category === 'Uncategorized') {
            const firstWord = p.title.split(' ')[0].toLowerCase();
            related = globalProducts.filter(prod => prod._id !== p._id && prod.stockQuantity !== 0 && prod.title.toLowerCase().includes(firstWord));
        }

        // إعطاء أولوية في الظهور للمنتجات التي عليها خصومات
        const relationScore = (prod) => {
            let score = 0;
            if (prod.category === p.category) score += 20;
            if (p.publicBrand && prod.publicBrand === p.publicBrand) score += 14;
            const base = Math.max(1, Number(p.price) || 1); const diff = Math.abs((Number(prod.price)||0)-base)/base;
            score += Math.max(0, 8 - diff*8);
            if (prod.oldPrice && Number(prod.oldPrice) > Number(prod.price)) score += 3;
            if (prod.isFeatured) score += 2;
            score += Math.min(8, getPopularityScore(prod._id)/5);
            return score;
        };
        related.sort((a, b) => relationScore(b) - relationScore(a));

        const shuffled = related.slice(0, 4);
        if (shuffled.length > 0) {
            relatedContainer.innerHTML = shuffled.map(prod => {
                const img = (prod.image && !isPlaceholderImage(prod.image)) ? getSafeImageUrl(prod.image, getFallbackImage(prod)) : getFallbackImage(prod);
                return `
                    <div class="product-detail-related-card bg-surface-variant/30 p-2 rounded-xl flex flex-col items-center gap-2 cursor-pointer hover:bg-surface-variant/70 transition-colors border border-outline-variant/30" onclick="window.__DIRECT_PRODUCT_MODE__ ? (window.location.href=getProductShareUrl('${prod._id}')) : (closeProductModal(), setTimeout(() => openProductModal('${prod._id}'), 300))">
                        <img src="${img}" onerror="handleProductImageError(this)" class="w-16 h-16 object-contain rounded-lg">
                        <span class="text-[10px] text-center text-on-surface line-clamp-2">${prod.title}</span>
                        <span class="text-primary font-bold text-xs">${prod.price} ج.م</span>
                    </div>
                `;
            }).join('');
            relatedSection.classList.remove('hidden');
        } else {
            relatedSection.classList.add('hidden');
        }
        } else {
            relatedSection.classList.add('hidden');
        }
    }

    const modal = document.getElementById('productModal');
    const content = document.getElementById('productModalContent');
    
    modal.classList.remove('hidden');
    // Trigger reflow
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    document.body.classList.add('ui-overlay-open');
};

window.closeProductModal = function() {
    if (window.__DIRECT_PRODUCT_MODE__ && document.body.classList.contains('direct-product-route')) { window.location.href = '/products'; return; }
    if (window.modalImageInterval) clearInterval(window.modalImageInterval);
    const modal = document.getElementById('productModal');
    const content = document.getElementById('productModalContent');
    
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    document.body.style.overflow = '';
    
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('ui-overlay-open');
    }, 300);
};

function productMiniCard(product, extraClass='') {
    const img=getOptimizedImageUrl(product.image,220,220); const url=getProductShareUrl(product);
    return `<a href="${url}" class="growth-product-card ${extraClass}" data-product-id="${product._id}"><div class="growth-product-card__media"><img src="${img}" alt="${escapeStoreHtml(product.title)}" loading="lazy" decoding="async" onerror="handleProductImageError(this)">${product.oldPrice&&Number(product.oldPrice)>Number(product.price)?'<span class="growth-sale-dot">عرض</span>':''}</div><div class="growth-product-card__body"><small>${escapeStoreHtml(product.publicBrand||product.category||'')}</small><strong>${escapeStoreHtml(product.title)}</strong><span>${Number(product.price).toLocaleString('ar-EG')} ج.م</span></div></a>`;
}
function renderHomeGrowthSections() {
    const old=document.getElementById('homeGrowthCollections'); if(old) old.remove();
    if (document.body.dataset.page !== 'home' || !globalProducts.length || !featureEnabled('showHomeCollections')) return;
    const footer=document.querySelector('footer.site-footer'); if(!footer) return;
    const available=globalProducts.filter(p=>Number(p.stockQuantity)>0&&Number(p.price)>0);
    const newest=[...available].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,8);
    const offers=available.filter(p=>Number(p.oldPrice)>Number(p.price)).sort((a,b)=>((b.oldPrice-b.price)/b.oldPrice)-((a.oldPrice-a.price)/a.oldPrice)).slice(0,8);
    const popular=[...available].sort((a,b)=>((b.isFeatured?50:0)+getPopularityScore(b._id))-((a.isFeatured?50:0)+getPopularityScore(a._id))).slice(0,8);
    const groups=[['وصل حديثاً','new_releases',newest],['عروض تستحق المشاهدة','local_offer',offers],['الأكثر طلباً','trending_up',popular]].filter(g=>g[2].length);
    if(!groups.length) return;
    const wrap=document.createElement('section'); wrap.id='homeGrowthCollections'; wrap.className='home-growth-collections';
    wrap.innerHTML=groups.map(([title,icon,items])=>`<div class="home-growth-section"><div class="home-growth-heading"><div><span class="material-symbols-outlined">${icon}</span><h2>${title}</h2></div><a href="/products">عرض الكل <span class="material-symbols-outlined">arrow_back</span></a></div><div class="growth-product-scroller">${items.map(p=>productMiniCard(p)).join('')}</div></div>`).join('');
    footer.parentNode.insertBefore(wrap,footer); if(window.applyTechReveal) window.applyTechReveal(wrap);
}
function renderRecentlyViewed() {
    document.getElementById('recentlyViewedSection')?.remove();
    if(!featureEnabled('enableRecentlyViewed')||!globalProducts.length) return;
    const ids=getRecentIds(); const items=ids.map(id=>globalProducts.find(p=>String(p._id)===id)).filter(Boolean).slice(0,8);
    if(items.length<2) return;
    const footer=document.querySelector('footer.site-footer'); if(!footer) return;
    const sec=document.createElement('section'); sec.id='recentlyViewedSection'; sec.className='recently-viewed-section'; sec.innerHTML=`<div class="home-growth-heading"><div><span class="material-symbols-outlined">history</span><h2>شوهدت مؤخراً</h2></div><button type="button" onclick="localStorage.removeItem('${RECENT_KEY}');document.getElementById('recentlyViewedSection')?.remove()">مسح</button></div><div class="growth-product-scroller">${items.map(p=>productMiniCard(p)).join('')}</div>`;
    footer.parentNode.insertBefore(sec,footer);
}
function renderCompareBar() {
    let bar=document.getElementById('compareBar'); const ids=getCompareIds().filter(id=>globalProducts.some(p=>String(p._id)===id));
    if(!featureEnabled('enableCompare')||!ids.length){bar?.remove();return;}
    if(!bar){bar=document.createElement('div');bar.id='compareBar';bar.className='compare-floating-bar';document.body.appendChild(bar);}
    bar.innerHTML=`<span><span class="material-symbols-outlined">compare_arrows</span> ${ids.length} للمقارنة</span><div><button type="button" onclick="openCompareModal()" ${ids.length<2?'disabled':''}>قارن الآن</button><button type="button" onclick="clearCompare()" aria-label="مسح المقارنة">×</button></div>`;
}
window.openCompareModal=function(){
    const products=getCompareIds().map(id=>globalProducts.find(p=>String(p._id)===id)).filter(Boolean); if(products.length<2){showStoreToast('اختر منتجين على الأقل للمقارنة');return;}
    let modal=document.getElementById('compareModal'); if(!modal){modal=document.createElement('div');modal.id='compareModal';modal.className='compare-modal';document.body.appendChild(modal);}
    const specs=products.map(p=>Array.isArray(p.description)?p.description.slice(0,5):[]);
    modal.innerHTML=`<div class="compare-modal__backdrop" onclick="closeCompareModal()"></div><section class="compare-modal__sheet"><header><div><small>مقارنة سريعة</small><h2>قارن بين المنتجات</h2></div><button onclick="closeCompareModal()">×</button></header><div class="compare-grid" style="--compare-count:${products.length}">${products.map((p,i)=>`<article><img src="${getOptimizedImageUrl(p.image,260,260)}" alt="${escapeStoreHtml(p.title)}"><h3>${escapeStoreHtml(p.title)}</h3><strong>${Number(p.price).toLocaleString('ar-EG')} ج.م</strong><dl><div><dt>العلامة</dt><dd>${escapeStoreHtml(p.publicBrand||'—')}</dd></div><div><dt>القسم</dt><dd>${escapeStoreHtml(p.category||'—')}</dd></div><div><dt>الضمان</dt><dd>${escapeStoreHtml(p.warranty||'—')}</dd></div><div><dt>المخزون</dt><dd>${Number(p.stockQuantity)>0?'متوفر':'غير متوفر'}</dd></div></dl><ul>${specs[i].map(x=>`<li>${escapeStoreHtml(x)}</li>`).join('')}</ul><a href="${getProductShareUrl(p)}">فتح المنتج</a></article>`).join('')}</div></section>`;
    modal.classList.add('show'); document.body.classList.add('ui-overlay-open');
};
window.closeCompareModal=function(){document.getElementById('compareModal')?.classList.remove('show');document.body.classList.remove('ui-overlay-open');};
function setupSmartSearchSuggestions(){
    document.querySelectorAll('.smart-search-results').forEach(x=>x.remove());
    if(!featureEnabled('enableSmartSearch')||!globalProducts.length)return;
    const inputs=[...document.querySelectorAll('input[placeholder="ابحث في الكتالوج..."]'),document.getElementById('mobileCatalogSearch')].filter(Boolean);
    inputs.forEach(input=>{
        if(input.dataset.smartBound==='1')return; input.dataset.smartBound='1'; const host=input.parentElement; if(!host)return; host.classList.add('smart-search-host');
        const box=document.createElement('div');box.className='smart-search-results';box.setAttribute('role','listbox');host.appendChild(box);
        const draw=()=>{const q=input.value.trim().toLowerCase();if(!q){box.classList.remove('show');box.innerHTML='';return;} const terms=q.split(/\s+/).filter(Boolean); const score=p=>{let v=0;const t=String(p.title||'').toLowerCase(),sku=String(p.sku||'').toLowerCase(),br=String(p.publicBrand||'').toLowerCase(),cat=String(p.category||'').toLowerCase();terms.forEach(k=>{if(t.startsWith(k))v+=12;else if(t.includes(k))v+=7;if(sku.includes(k))v+=10;if(br.includes(k))v+=5;if(cat.includes(k))v+=3;if((p.tags||[]).some(x=>String(x).toLowerCase().includes(k)))v+=4;});return v;}; const results=globalProducts.map(p=>[p,score(p)]).filter(x=>x[1]>0&&Number(x[0].stockQuantity)>0).sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]); box.innerHTML=results.map(p=>`<a href="${getProductShareUrl(p)}" role="option"><img src="${getOptimizedImageUrl(p.image,72,72)}" loading="lazy" alt=""><span><strong>${escapeStoreHtml(p.title)}</strong><small>${escapeStoreHtml(p.publicBrand||p.category||'')} · ${Number(p.price).toLocaleString('ar-EG')} ج.م</small></span></a>`).join('') || '<div class="smart-search-empty">لا توجد اقتراحات</div>';box.classList.add('show');};
        input.addEventListener('input',draw); input.addEventListener('focus',draw); input.addEventListener('keydown',e=>{if(e.key==='Escape')box.classList.remove('show');});
    });
    if(!window.__smartSearchOutside){window.__smartSearchOutside=true;document.addEventListener('click',e=>{if(!e.target.closest('.smart-search-host'))document.querySelectorAll('.smart-search-results').forEach(x=>x.classList.remove('show'));});}
}
function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4);const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));}
async function subscribeToPush(settings){
    try{if(!settings.pushAvailable||!settings.pushPublicKey||!('Notification' in window)||!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('التنبيهات غير متاحة على هذا الجهاز'); const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('لم يتم السماح بالتنبيهات'); const reg=await navigator.serviceWorker.ready; let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(settings.pushPublicKey)}); const res=await fetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sub)});if(!res.ok)throw new Error('تعذر تفعيل التنبيهات');localStorage.setItem('tech_push_enabled','1');showStoreToast('تم تفعيل تنبيهات العروض ✅');initPushOptIn(settings);}catch(err){showStoreToast(err.message||'تعذر تفعيل التنبيهات');}
}
function initPushOptIn(settings={}){
    document.querySelectorAll('.store-push-optin').forEach(x=>x.remove()); if(!('Notification' in window)||!settings.pushEnabled||!settings.pushAvailable||Notification.permission==='denied')return; const enabled=localStorage.getItem('tech_push_enabled')==='1'; if(enabled)return;
    const menu=document.getElementById('mobileMenu'); if(menu){const b=document.createElement('button');b.type='button';b.className='store-push-optin';b.innerHTML='<span class="material-symbols-outlined">notifications_active</span> فعّل تنبيهات العروض';b.onclick=()=>subscribeToPush(settings);menu.appendChild(b);}
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;const menu=document.getElementById('mobileMenu');if(menu&&!document.getElementById('installAppBtn')){const b=document.createElement('button');b.id='installAppBtn';b.type='button';b.className='store-pwa-install';b.innerHTML='<span class="material-symbols-outlined">install_mobile</span> تثبيت المتجر كتطبيق';b.onclick=async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;b.remove();};menu.appendChild(b);}});

// أيقونات السوشيال ميديا العائمة
function injectFloatingSocials() {
    // على الهاتف نعتمد على شريط التنقل السفلي حتى لا تتداخل الأزرار مع المنتجات.
    const div = document.createElement('div');
    div.className = 'desktop-floating-socials';
    div.innerHTML = `
        <a href="${socialSettings().whatsappChannelUrl}" target="_blank" rel="noopener noreferrer" class="desktop-social-btn desktop-social-btn--whatsapp" aria-label="قناة واتساب" title="قناة واتساب">
            <i class="fab fa-whatsapp" aria-hidden="true"></i>
        </a>
        <a href="${socialSettings().facebookUrl}" target="_blank" rel="noopener noreferrer" class="desktop-social-btn desktop-social-btn--facebook" aria-label="فيسبوك" title="فيسبوك">
            <i class="fab fa-facebook-f" aria-hidden="true"></i>
        </a>`;
    document.body.appendChild(div);
}

function injectMobileDock() {
    if (document.getElementById('mobileSiteDock')) return;
    const path = window.location.pathname.toLowerCase();
    const dock = document.createElement('nav');
    dock.id = 'mobileSiteDock';
    dock.className = 'mobile-site-dock';
    dock.setAttribute('aria-label', 'التنقل السريع');
    const homeActive = path === '/' || path.endsWith('/index.html');
    const productsActive = path.includes('products') || /^\/p\//.test(path);
    const servicesActive = path.includes('services');
    dock.innerHTML = `
        <a href="/" class="mobile-dock-item ${homeActive ? 'is-active' : ''}" aria-label="الرئيسية">
            <svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z"/></svg><span>الرئيسية</span>
        </a>
        <a href="/products" class="mobile-dock-item ${productsActive ? 'is-active' : ''}" aria-label="المنتجات">
            <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM4 9h16M9 9v10"/></svg><span>المنتجات</span>
        </a>
        <button type="button" onclick="openCartSidebar()" class="mobile-dock-item mobile-dock-cart" aria-label="السلة">
            <span class="mobile-dock-cart-icon"><svg viewBox="0 0 24 24"><path d="M3 4h2l2.2 10.5h9.8L20 7H6M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg><b id="mobileCartBadge" class="${cart.length ? '' : 'hidden'}">${cart.reduce((n,i)=>n+i.quantity,0)}</b></span><span>السلة</span>
        </button>
        <a href="${socialSettings().whatsappChannelUrl}" target="_blank" rel="noopener noreferrer" class="mobile-dock-item" aria-label="قناة واتساب" title="قناة واتساب">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg><span>قناة واتساب</span>
        </a>
        <button type="button" onclick="window.openOrderTracking?.()" class="mobile-dock-item" aria-label="تتبع الطلب" title="تتبع الطلب">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg><span>تتبع</span>
        </button>
    `;
    document.body.appendChild(dock);
}

function initSmartMobileChrome() {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    if (!mobileQuery.matches) return;

    const dock = document.getElementById('mobileSiteDock');
    const categoryRail = document.querySelector('.mobile-category-shell');
    if (!dock && !categoryRail) return;

    let lastY = Math.max(0, window.scrollY || 0);
    let ticking = false;
    let dockIdleTimer = null;

    const showDock = () => {
        if (!dock || document.body.classList.contains('ui-overlay-open')) return;
        dock.classList.remove('is-hidden');
        document.body.classList.remove('mobile-dock-hidden');
    };

    const hideDock = () => {
        // V9.3: primary mobile navigation stays permanently visible while scrolling.
        showDock();
    };

    const showCategories = () => categoryRail?.classList.remove('is-hidden');
    const hideCategories = () => showCategories();

    const processScroll = () => {
        const y = Math.max(0, window.scrollY || 0);
        const delta = y - lastY;
        const doc = document.documentElement;
        const nearTop = y < 120;
        const nearBottom = (y + window.innerHeight) >= (doc.scrollHeight - 180);
        const overlayOpen = document.body.classList.contains('ui-overlay-open');

        if (!overlayOpen && Math.abs(delta) >= 5) {
            if (delta > 0 && y > 220 && !nearBottom) {
                hideDock();
                if (categoryRail && y > 155) hideCategories();
            } else if (delta < 0 || nearTop || nearBottom) {
                showDock();
                showCategories();
            }
        } else if (!overlayOpen && (nearTop || nearBottom)) {
            showDock();
            showCategories();
        }

        lastY = y;
        ticking = false;

        clearTimeout(dockIdleTimer);
        dockIdleTimer = setTimeout(() => {
            // Keep the category rail out of the way until the user scrolls upward,
            // but restore the primary bottom navigation after scrolling stops.
            showDock();
        }, 650);
    };

    window.addEventListener('scroll', () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(processScroll);
        }
    }, { passive: true });

    // Hide the dock when the on-screen keyboard is open (iOS/Android).
    if (window.visualViewport) {
        const onViewportResize = () => {
            if (!dock) return;
            const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
            const keyboardLikelyOpen = window.visualViewport.height < layoutHeight * 0.72;
            dock.classList.toggle('is-keyboard-hidden', keyboardLikelyOpen);
            if (keyboardLikelyOpen) document.body.classList.add('mobile-dock-hidden');
            else if (!dock.classList.contains('is-hidden')) document.body.classList.remove('mobile-dock-hidden');
        };
        window.visualViewport.addEventListener('resize', onViewportResize, { passive: true });
        onViewportResize();
    }

    // Tapping the category rail should keep it visible while choosing a filter.
    categoryRail?.addEventListener('pointerdown', showCategories, { passive: true });
}

// ------------------ منطق السلة (Cart Logic) ------------------
function injectCartUI() {
    // أيقونة السلة العائمة
    const cartIcon = document.createElement('button');
    cartIcon.id = 'floatingCartBtn';
    cartIcon.setAttribute('aria-label', 'عربة التسوق');
    cartIcon.className = 'desktop-cart-fab fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 bg-primary text-on-primary rounded-full shadow-[0_0_20px_rgba(130,207,255,0.4)] hover:scale-110 transition-transform cursor-pointer';
    cartIcon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
        <div id="cartBadge" class="absolute -top-1 -right-1 w-6 h-6 bg-error text-white rounded-full flex items-center justify-center text-xs font-bold font-mono-data shadow-md border border-background ${cart.length === 0 ? 'hidden' : ''}">
            ${cart.reduce((sum, item) => sum + item.quantity, 0)}
        </div>
    `;
    cartIcon.onclick = openCartSidebar;
    document.body.appendChild(cartIcon);

    // واجهة السلة الجانبية
    const sidebarHtml = `
        <!-- Overlay -->
        <div id="cartOverlay" class="fixed inset-0 bg-background/60 backdrop-blur-sm z-[90] hidden opacity-0 transition-opacity duration-300" onclick="closeCartSidebar()"></div>
        
        <!-- Sidebar -->
        <div id="cartSidebar" class="cart-shell fixed top-0 left-0 w-full max-w-md h-full bg-surface-container-highest/95 backdrop-blur-2xl border-r border-outline-variant/30 z-[100] shadow-2xl flex flex-col cart-sidebar cart-sidebar-closed">
            <div class="cart-header flex items-center justify-between p-6 border-b border-outline-variant/30">
                <div class="flex items-center gap-3 text-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    <h2 class="font-headline-md text-2xl">عربة التسوق</h2>
                </div>
                <button onclick="closeCartSidebar()" aria-label="إغلاق سلة التسوق" class="w-10 h-10 bg-surface-variant/80 hover:bg-red-500/80 hover:text-white rounded-full flex items-center justify-center text-on-surface transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            
            <div id="cartItemsContainer" class="cart-items flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                <!-- المنتجات تضاف هنا -->
            </div>
            
            <div class="cart-checkout p-6 border-t border-outline-variant/30 bg-surface/50">
                <div class="cart-total flex items-center justify-between mb-4">
                    <span class="text-on-surface-variant text-lg">الإجمالي:</span>
                    <span id="cartTotalPrice" class="font-display-lg text-2xl text-primary text-glow font-bold">0 ج.م</span>
                </div>
                
                <!-- Customer Details Form -->
                <div id="cartCustomerForm" class="flex flex-col gap-3 mb-4 hidden">
                    <input type="text" id="customerName" placeholder="الاسم" class="w-full bg-surface-variant/50 border border-outline-variant/30 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary">
                    <input type="tel" id="customerPhone" placeholder="رقم الهاتف" class="w-full bg-surface-variant/50 border border-outline-variant/30 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary text-right" dir="ltr">
                    <div id="addressFieldContainer" class="hidden">
                        <textarea id="customerAddress" placeholder="العنوان بالتفصيل" class="w-full bg-surface-variant/50 border border-outline-variant/30 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary min-h-[80px] resize-y"></textarea>
                        <p class="text-error text-xs mt-1">لا يشمل مصاريف الشحن</p>
                    </div>
                    <p id="pickupOnlyNote" class="text-error text-xs text-center font-bold">الاستلام من المعرض فقط</p>
                </div>

                <div class="flex flex-col gap-3">
                    <button onclick="checkoutWhatsApp()" class="w-full btn-modern-green hover:scale-[1.02] transition-transform !py-3 flex items-center justify-center gap-2 text-base font-bold !rounded-xl shadow-lg shadow-green-500/20">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>
                        إرسال الطلب عبر واتساب
                    </button>
                    <button onclick="closeCartSidebar()" aria-label="متابعة التسوق" class="w-full py-3 rounded-xl border-2 border-primary/30 text-primary font-bold hover:bg-primary/10 transition-colors text-base flex items-center justify-center gap-2">
                        متابعة التسوق
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Toast Notification -->
        <div id="toastNotification" class="fixed top-20 right-1/2 translate-x-1/2 z-[110] bg-surface-container border border-primary/30 text-primary px-6 py-3 rounded-full shadow-lg transition-all duration-300 transform -translate-y-full opacity-0 flex items-center gap-2 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            <span class="font-bold text-sm">تمت الإضافة للسلة</span>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', sidebarHtml);
}

function openCartSidebar() {
    renderCart();
    const overlay = document.getElementById('cartOverlay');
    const sidebar = document.getElementById('cartSidebar');
    overlay.classList.remove('hidden');
    void overlay.offsetWidth; // trigger reflow
    overlay.classList.remove('opacity-0');
    sidebar.classList.remove('cart-sidebar-closed');
    sidebar.classList.add('cart-sidebar-open');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('ui-overlay-open');

    // إظهار حقول العميل بناءً على تفعيل الشحن
    const customerForm = document.getElementById('cartCustomerForm');
    const addressContainer = document.getElementById('addressFieldContainer');
    const pickupNote = document.getElementById('pickupOnlyNote');
    
    if (customerForm) {
        if (cart.length > 0) {
            customerForm.classList.remove('hidden');
            if (window.isShippingEnabled) {
                addressContainer.classList.remove('hidden');
                pickupNote.classList.add('hidden');
            } else {
                addressContainer.classList.add('hidden');
                pickupNote.classList.remove('hidden');
            }
        } else {
            customerForm.classList.add('hidden');
        }
    }
}

function closeCartSidebar() {
    const overlay = document.getElementById('cartOverlay');
    const sidebar = document.getElementById('cartSidebar');
    overlay.classList.add('opacity-0');
    sidebar.classList.remove('cart-sidebar-open');
    sidebar.classList.add('cart-sidebar-closed');
    document.body.style.overflow = '';
    setTimeout(() => {
        overlay.classList.add('hidden');
        document.body.classList.remove('ui-overlay-open');
    }, 300);
}

function addToCart(productId) {
    const product = globalProducts.find(p => p._id === productId);
    if (!product) return;

    if (product.stockQuantity === 0) {
        alert("عذراً، هذا المنتج غير متوفر حالياً.");
        return;
    }

    // Analytics: track add to cart
    trackEvent('cart_adds', product._id, product.title);
    const existingItem = cart.find(item => item._id === productId);
    if (existingItem) {
        if (existingItem.quantity < product.stockQuantity) {
            existingItem.quantity += 1;
        } else {
            alert("لا يمكنك إضافة المزيد، لقد وصلت للحد الأقصى للمخزون.");
            return;
        }
    } else {
        cart.push({
            _id: product._id,
            title: product.title,
            price: Number(product.price) || 0,
            image: product.image,
            sku: product.sku || '',
            stockQuantity: product.stockQuantity,
            quantity: 1
        });
    }

    saveCart();
    updateCartBadge();
    showToast();
    
    // Cart Micro-interactions
    const cartFloatingBtn = document.querySelector('button[onclick="openCartSidebar()"]');
    if (cartFloatingBtn) {
        cartFloatingBtn.classList.add('scale-125', 'rotate-12', 'transition-all');
        setTimeout(() => cartFloatingBtn.classList.remove('scale-125', 'rotate-12'), 300);
    }
    const badge = document.getElementById('cartBadge');
    if (badge) {
        badge.classList.add('animate-ping');
        setTimeout(() => badge.classList.remove('animate-ping'), 300);
    }
}

function removeFromCart(productId) {
    cart = cart.filter(item => item._id !== productId);
    saveCart();
    renderCart();
    updateCartBadge();
}

function updateCartQuantity(productId, change) {
    const item = cart.find(i => i._id === productId);
    if (!item) return;

    const newQuantity = item.quantity + change;
    if (newQuantity <= 0) {
        removeFromCart(productId);
    } else if (newQuantity > item.stockQuantity) {
        alert("لا يوجد مخزون كافي لتلبية هذه الكمية.");
    } else {
        item.quantity = newQuantity;
        saveCart();
        renderCart();
        updateCartBadge();
    }
}

function saveCart() {
    localStorage.setItem('tech_store_cart', JSON.stringify(cart));
}

function updateCartBadge() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    ['cartBadge', 'mobileCartBadge'].forEach(id => {
        const badge = document.getElementById(id);
        if (!badge) return;
        if (totalItems > 0) {
            badge.textContent = totalItems;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    });
}

function showToast() {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.classList.remove('-translate-y-full', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('-translate-y-full', 'opacity-0');
    }, 2000);
}

function renderCart() {
    const container = document.getElementById('cartItemsContainer');
    const priceEl = document.getElementById('cartTotalPrice');
    if (!container || !priceEl) return;

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-on-surface-variant/50">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 inline-block mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path><line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2"></line></svg>
                <p class="text-lg">سلة التسوق فارغة</p>
            </div>
        `;
        priceEl.textContent = '0 ج.م';
        const customerForm = document.getElementById('cartCustomerForm');
        if (customerForm) customerForm.classList.add('hidden');
        return;
    }

    let html = '';
    let total = 0;

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        const latestProduct = globalProducts.find(p => p._id === item._id);
        const cartImage = getSafeImageUrl(latestProduct?.image || item.image, getSafeImageUrl(window.defaultProductImage, LOCAL_FALLBACK_IMAGE));
        html += `
            <div class="cart-line-item flex items-center gap-4 bg-surface/50 p-3 rounded-xl border border-outline-variant/20 hover:border-primary/20 transition-colors">
                <img src="${cartImage}" onerror="handleProductImageError(this)" alt="${item.title}" width="64" height="64" loading="lazy" class="w-16 h-16 object-cover rounded-lg bg-surface-container shadow-md">
                <div class="flex-1 min-w-0">
                    <h4 class="text-sm font-bold text-on-surface line-clamp-2">${item.title}</h4>
                    <span class="text-xs font-bold text-primary font-mono-data">${item.price} ج.م</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <button onclick="updateCartQuantity('${item._id}', -1)" class="w-8 h-8 p-1 flex items-center justify-center text-on-surface hover:text-error transition-colors bg-surface-variant rounded-md border border-outline-variant/30">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4"></path></svg>
                    </button>
                    <span class="text-sm font-bold font-mono-data w-6 text-center">${item.quantity}</span>
                    <button onclick="updateCartQuantity('${item._id}', 1)" class="w-8 h-8 p-1 flex items-center justify-center text-on-surface hover:text-green-400 transition-colors bg-surface-variant rounded-md border border-outline-variant/30">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>
                    </button>
                </div>
                <button onclick="removeFromCart('${item._id}')" class="w-8 h-8 p-1 flex items-center justify-center text-error hover:text-red-400 transition-colors shrink-0 bg-error/10 hover:bg-error/20 rounded-md border border-error/20" title="حذف">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;
    });

    container.innerHTML = html;
    priceEl.textContent = `${total} ج.م`;
}

async function checkoutWhatsApp() {
    if (cart.length === 0) {
        alert("عربة التسوق فارغة.");
        return;
    }

    const nameInput = document.getElementById('customerName');
    const phoneInput = document.getElementById('customerPhone');
    const addressInput = document.getElementById('customerAddress');

    const name = nameInput ? nameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const address = addressInput ? addressInput.value.trim() : '';

    if (!name || !phone) {
        alert("يرجى إدخال الاسم ورقم الهاتف لإتمام الطلب.");
        return;
    }

    if (window.isShippingEnabled && !address) {
        alert("يرجى إدخال العنوان بالتفصيل لإتمام الطلب.");
        return;
    }

    let legacyCheckoutToken = sessionStorage.getItem('tech_checkout_token');
    if (!legacyCheckoutToken) {
        legacyCheckoutToken = 'chk_' + (window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2));
        sessionStorage.setItem('tech_checkout_token', legacyCheckoutToken);
    }
    const orderPayload = {
        customerName: name,
        customerPhone: phone,
        customerAddress: window.isShippingEnabled ? address : "استلام من المعرض",
        shippingAmount: 0,
        paymentMethod: "cash_on_delivery",
        checkoutToken: legacyCheckoutToken,
        items: cart.map(item => ({
            productId: item._id,
            posItemId: item.posItemId || undefined,
            sku: item.sku || undefined,
            title: item.title,
            quantity: item.quantity,
            price: item.price
        }))
    };

    try {
        const btn = document.querySelector('button[onclick="checkoutWhatsApp()"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> جاري إرسال الطلب...`;
        btn.disabled = true;

        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderPayload)
        });

        const data = await response.json();
        
        btn.innerHTML = originalText;
        btn.disabled = false;

        if (data.success) {
            // تجهيز رسالة الواتساب الاختيارية
            let waMsg = `مرحباً، أريد إتمام/متابعة طلب الشراء رقم: ${data.orderId}\n\n`;
            waMsg += `👤 *الاسم:* ${name}\n`;
            waMsg += `📞 *الهاتف:* ${phone}\n`;
            waMsg += `📍 *العنوان:* ${window.isShippingEnabled ? address : 'استلام من المعرض'}\n\n`;
            cart.forEach(item => {
                waMsg += `📦 *${item.title}*\n🔢 الكمية: ${item.quantity}\n💵 السعر: ${item.price} ج.م\n\n`;
            });
            const encodedWaMsg = encodeURIComponent(waMsg);
            const whatsappUrl = buildWhatsappUrl(waMsg);

            // إنشاء نافذة منبثقة للنجاح
            const successModal = document.createElement('div');
            successModal.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
            successModal.innerHTML = `
                <div class="bg-surface rounded-2xl w-full max-w-md p-6 sm:p-8 text-center shadow-2xl transform scale-100 transition-all border border-outline-variant/30">
                    <div class="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <span class="material-symbols-outlined text-[40px]">check_circle</span>
                    </div>
                    <h2 class="text-2xl font-black text-on-surface mb-2">تم استلام طلبك بنجاح!</h2>
                    <p class="text-on-surface-variant text-sm sm:text-base mb-4">رقم الطلب الخاص بك هو:<br><span class="text-lg font-bold text-primary mt-2 block" dir="ltr">${data.orderId || data.orderNumber || ''}</span></p>
                    
                    <p class="text-on-surface-variant text-sm mb-6 animate-pulse">جاري تحويلك لإتمام الطلب عبر واتساب...</p>

                    <div class="flex flex-col gap-3">
                        <a href="${whatsappUrl}" target="_blank" id="forceWaBtn" class="w-full btn-modern-green !py-3 flex items-center justify-center gap-2 text-sm sm:text-base font-bold !rounded-xl shadow-lg shadow-green-500/20 hover:scale-[1.02] transition-transform">
                            <i class="fa-brands fa-whatsapp text-xl"></i>
                            تأكيد الطلب عبر واتساب
                        </a>
                    </div>
                </div>
            `;
            document.body.appendChild(successModal);

            const clearCartLogic = () => {
                cart = [];
                saveCart();
                updateCartBadge();
                renderCart();
                closeCartSidebar();
            };

            const waBtn = document.getElementById('forceWaBtn');
            waBtn.onclick = function(e) {
                clearCartLogic();
                this.closest('.fixed').remove();
            };

            // التحويل التلقائي
            setTimeout(() => {
                const waWindow = window.open(whatsappUrl, '_blank');
                if (waWindow) {
                    clearCartLogic();
                    // optional: successModal.remove();
                }
            }, 500);
        } else {
            alert("حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى.");
        }
    } catch (err) {
        console.error("Checkout error:", err);
        alert("تعذر الاتصال بالخادم. يرجى التأكد من اتصالك بالإنترنت والمحاولة مجدداً.");
    }
}

// تحميل الهوية البصرية (اللوجو والخلفية) من السيرفر
async function loadStoreBranding() {
    try {
        const response = await fetch(`${BASE_URL}/api/settings`);
        const settings = await response.json();

        // تطبيق اللوجو من Cloudinary (يعمل على كل الأجهزة)
        if (settings.storeLogo) {
            document.querySelectorAll('img[alt="Technology Store"]').forEach(logoImg => {
                logoImg.src = settings.storeLogo;
                logoImg.removeAttribute('onerror');
            });
        }

        // تطبيق صورة البانر
        if (settings.lightHeroImage && settings.lightHeroImage !== 'main-banner.webp') {
            const lightBannerImg = document.getElementById('light-banner');
            if (lightBannerImg) lightBannerImg.src = settings.lightHeroImage;
        }
        if (settings.darkHeroImage && settings.darkHeroImage !== 'main-banner.webp') {
            const darkBannerImg = document.getElementById('dark-banner');
            if (darkBannerImg) darkBannerImg.src = settings.darkHeroImage;
        }
    } catch (err) {
        // في حالة الخطأ — الموقع يستخدم logo.webp الافتراضي
        console.log('Using default branding');
    }
}

// حفظ حالة التصفح قبل الخروج أو التحديث
window.addEventListener('beforeunload', () => {
    sessionStorage.setItem('tech_activeCategory', activeCategory);
    sessionStorage.setItem('tech_activeSearch', activeSearchTerm);
    sessionStorage.setItem('tech_currentSort', currentSort);
    sessionStorage.setItem('tech_activeBrand', activeBrand);
    sessionStorage.setItem('tech_minPrice', minPriceFilter);
    sessionStorage.setItem('tech_maxPrice', maxPriceFilter);
    sessionStorage.setItem('tech_currentPage', String(currentPage));
    sessionStorage.setItem('tech_scrollPos', String(window.scrollY));
});

function initLightweightMotion() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const reveal = (root = document) => {
        const nodes = root.querySelectorAll('.home-feature-card, .service-card, .catalog-product-card');
        if (!('IntersectionObserver' in window)) {
            nodes.forEach(el => el.classList.add('is-revealed'));
            return;
        }
        if (!window.__techRevealObserver) {
            window.__techRevealObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-revealed');
                        window.__techRevealObserver.unobserve(entry.target);
                    }
                });
            }, { rootMargin: '80px 0px', threshold: 0.05 });
        }
        nodes.forEach(el => {
            if (!el.dataset.revealBound) {
                el.dataset.revealBound = '1';
                window.__techRevealObserver.observe(el);
            }
        });
    };
    window.applyTechReveal = reveal;
    reveal();
}

window.__techStoreState = {
    getProducts: () => globalProducts,
    getCart: () => cart,
    setCart: (next) => { cart = Array.isArray(next) ? next : []; saveCart(); updateCartBadge(); },
    saveCart: () => saveCart(),
    renderCart: () => renderCart(),
    getSettings: () => window.storeSettings || {},
    getFallbackImage: (p) => getFallbackImage(p),
    getProductShareUrl: (p) => getProductShareUrl(p),
    buildWhatsappUrl: (m) => buildWhatsappUrl(m),
    showToast: (m) => showStoreToast(m)
};

document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('.skip-link')) { const skip=document.createElement('a'); skip.className='skip-link'; skip.href='#main-content'; skip.textContent='تخطي إلى المحتوى'; document.body.prepend(skip); const main=document.querySelector('main'); if(main&&!main.id) main.id='main-content'; }
    trackPageVisit();
    injectProductModal();
    injectCartUI();
    injectMobileDock();
    initSmartMobileChrome();
    setupMobileCatalogSearch();
    initLightweightMotion();
    fetchProducts();
    injectFloatingSocials();
    loadStoreBranding();
    syncGrowthUI();
    renderCompareBar();

    // تشغيل البحث
    const searchInputs = document.querySelectorAll('input[placeholder="ابحث في الكتالوج..."]');
    searchInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const term = e.target.value.trim();
            if (document.getElementById('productsGrid')) {
                const activeBtn = document.querySelector('.filter-btn.active');
                const category = activeBtn ? activeBtn.dataset.category : "all";
                renderProducts(category, term);
            }
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (!document.getElementById('productsGrid')) {
                    window.location.href = `/products?q=${encodeURIComponent(e.target.value.trim())}`;
                }
            }
        });
    });


    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            mobileMenu.classList.toggle('flex');
        });
    }
});

// Update countdown timers dynamically
setInterval(() => {
    const countdownContainers = document.querySelectorAll('.countdown-container');
    const now = new Date();
    
    countdownContainers.forEach(container => {
        const expiresAt = new Date(container.dataset.expires);
        const timerElement = container.querySelector('.countdown-timer');
        if (!timerElement) return;

        const diff = expiresAt - now;
        
        if (diff <= 0) {
            timerElement.textContent = "انتهى العرض";
            container.classList.add('opacity-50');
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const daysStr = days > 0 ? `<div class="bg-red-500/20 px-1.5 rounded">${days}d</div><span class="text-red-500/50 mx-0.5">:</span>` : '';
        const hoursStr = `<div class="bg-red-500/20 px-1.5 rounded">${hours.toString().padStart(2, '0')}</div>`;
        const minsStr = `<div class="bg-red-500/20 px-1.5 rounded">${minutes.toString().padStart(2, '0')}</div>`;
        const secsStr = `<div class="bg-red-500/20 px-1.5 rounded">${seconds.toString().padStart(2, '0')}</div>`;
        
        timerElement.innerHTML = `${daysStr}${hoursStr}<span class="text-red-500/50 mx-0.5">:</span>${minsStr}<span class="text-red-500/50 mx-0.5">:</span>${secsStr}`;
    });
}, 1000);

// PWA Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed:', err));
    });
}

// Scroll to Top Button
const scrollToTopBtn = document.createElement('button');
scrollToTopBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>';
scrollToTopBtn.setAttribute('aria-label', 'العودة للأعلى');
scrollToTopBtn.className = 'scroll-top-btn fixed bottom-28 right-6 z-50 bg-primary hover:bg-primary/90 text-white p-3 rounded-full shadow-xl transition-all duration-300 translate-y-16 opacity-0 flex items-center justify-center hover:scale-110';
scrollToTopBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
document.body.appendChild(scrollToTopBtn);

window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
        scrollToTopBtn.classList.remove('translate-y-16', 'opacity-0');
    } else {
        scrollToTopBtn.classList.add('translate-y-16', 'opacity-0');
    }
});

// Theme Toggle Functionality
window.toggleTheme = function() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
};

// Analytics Tracking - Unique Visitors
async function trackVisitor() {
    try {
        let visitorId = localStorage.getItem('tech_store_vid');
        if (!visitorId) {
            visitorId = 'vid_' + (window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
            localStorage.setItem('tech_store_vid', visitorId);
        }
        let sessionId = sessionStorage.getItem('tech_store_session_id');
        if (!sessionId) {
            sessionId = 'sid_' + (window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
            sessionStorage.setItem('tech_store_session_id', sessionId);
            sessionStorage.setItem('tech_store_session_landing', location.pathname + location.search);
        }
        const params = new URLSearchParams(location.search);
        const parsePrettyCampaignPath = () => {
            const raw = decodeURIComponent((location.pathname || '/').replace(/^\/+|\/+$/g, '')).toLowerCase();
            if (!raw) return { source:'', medium:'', campaign:'' };
            const known = ['facebook','instagram','whatsapp','tiktok','telegram','youtube','qr'];
            let source='', medium='', campaign='', rest=[];
            if (raw.startsWith('campaign-')) {
                const bits = raw.slice(9).split('-').filter(Boolean);
                source = bits.shift() || '';
                rest = bits;
            } else {
                const bits = raw.split('-').filter(Boolean);
                if (!known.includes(bits[0])) return { source:'', medium:'', campaign:'' };
                source = bits.shift();
                rest = bits;
            }
            if (rest[0] === 'products' || rest[0] === 'services') rest.shift();
            campaign = rest.join('-');
            medium = source === 'qr' ? 'offline' : 'social';
            return { source, medium, campaign };
        };
        const prettyCampaign = parsePrettyCampaignPath();
        const aliasParamMap = {
            utm_source: ['utm_source', 'src', 'source'],
            utm_medium: ['utm_medium', 'med', 'medium'],
            utm_campaign: ['utm_campaign', 'camp', 'campaign', 'c'],
            utm_content: ['utm_content', 'content'],
            utm_term: ['utm_term', 'term']
        };
        const attrStore = {
            referrer: 'tech_store_session_referrer',
            utm_source: 'tech_store_session_utm_source',
            utm_medium: 'tech_store_session_utm_medium',
            utm_campaign: 'tech_store_session_utm_campaign',
            utm_content: 'tech_store_session_utm_content',
            utm_term: 'tech_store_session_utm_term',
            share_source: 'tech_store_session_share_source'
        };
        const getCampaignParamValue = (key) => {
            const aliases = aliasParamMap[key] || [key];
            for (const alias of aliases) {
                const value = params.get(alias);
                if (value) return value;
            }
            if (key === 'utm_source') return prettyCampaign.source;
            if (key === 'utm_medium') return prettyCampaign.medium;
            if (key === 'utm_campaign') return prettyCampaign.campaign;
            return '';
        };
        if (sessionStorage.getItem(attrStore.referrer) === null) {
            let entryRef = document.referrer || '';
            try { if (entryRef && new URL(entryRef).origin === location.origin) entryRef = ''; } catch (_) {}
            sessionStorage.setItem(attrStore.referrer, entryRef);
        }
        for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) {
            if (sessionStorage.getItem(attrStore[key]) === null) sessionStorage.setItem(attrStore[key], getCampaignParamValue(key));
        }
        if (sessionStorage.getItem(attrStore.share_source) === null) sessionStorage.setItem(attrStore.share_source, params.get('share_source') || params.get('src') || params.get('source') || prettyCampaign.source || '');
        const ua = navigator.userAgent || '';
        const detect = () => {
            let os = /android/i.test(ua) ? 'Android' : /iphone|ipad|ipod/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /mac os|macintosh/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Other';
            let browser = /edg/i.test(ua) ? 'Edge' : /opr|opera/i.test(ua) ? 'Opera' : /firefox/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Other';
            let deviceType = /ipad|tablet/i.test(ua) ? 'Tablet' : /mobi|android|iphone|ipod/i.test(ua) ? 'Mobile' : 'Desktop';
            return { os, browser, deviceType };
        };
        const d = detect();
        const payload = {
            visitorId, sessionId,
            referrer: sessionStorage.getItem(attrStore.referrer) || '',
            utmSource: sessionStorage.getItem(attrStore.utm_source) || '',
            utmMedium: sessionStorage.getItem(attrStore.utm_medium) || '',
            utmCampaign: sessionStorage.getItem(attrStore.utm_campaign) || '',
            utmContent: sessionStorage.getItem(attrStore.utm_content) || '',
            utmTerm: sessionStorage.getItem(attrStore.utm_term) || '',
            shareSource: sessionStorage.getItem(attrStore.share_source) || '',
            landingPage: sessionStorage.getItem('tech_store_session_landing') || location.pathname + location.search,
            page: location.pathname + location.search,
            device: `${d.deviceType} - ${d.os} - ${d.browser}`,
            ...d,
            language: navigator.language || '',
            screen: `${screen.width || 0}x${screen.height || 0}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
        };
        await fetch(`${BASE_URL}/api/analytics/visitor`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), keepalive:true });
    } catch (error) { console.error('Analytics error:', error); }
}

function pingVisitorSession(delta = 0) {
    try {
        const visitorId = localStorage.getItem('tech_store_vid');
        const sessionId = sessionStorage.getItem('tech_store_session_id');
        if (!visitorId || !sessionId) return;
        const payload = JSON.stringify({ visitorId, sessionId, page: location.pathname + location.search, activeSecondsDelta: Math.max(0, Math.min(60, Number(delta) || 0)) });
        fetch(`${BASE_URL}/api/analytics/session-ping`, { method:'POST', headers:{'Content-Type':'application/json'}, body:payload, keepalive:true }).catch(()=>{});
    } catch (_) {}
}

// Execute on load
window.addEventListener('load', () => {
    const run = () => trackVisitor();
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 5000 });
    else setTimeout(run, 2500);
    let activeTick = Date.now();
    setInterval(() => {
        const now = Date.now();
        const seconds = document.visibilityState === 'visible' ? Math.min(35, Math.max(1, Math.round((now - activeTick) / 1000))) : 0;
        activeTick = now;
        if (seconds) pingVisitorSession(seconds);
    }, 30000);
    document.addEventListener('visibilitychange', () => { activeTick = Date.now(); });
    window.addEventListener('pagehide', () => { if (document.visibilityState === 'visible') pingVisitorSession(Math.min(30, Math.max(1, Math.round((Date.now() - activeTick) / 1000)))); }, { passive:true });
});

function openQuickBuyModal(id) {
    const p = globalProducts.find(x => x._id === id);
    if(!p) return;
    
    let m = document.getElementById('quickBuyModal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'quickBuyModal';
        m.className = 'fixed inset-0 z-[100] hidden flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm transition-all duration-300 opacity-0';
        m.innerHTML = `
            <div class="bg-surface border border-outline-variant/30 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl transform scale-95 transition-transform duration-300 p-5">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-lg text-on-surface">طلب سريع ⚡</h3>
                    <button onclick="closeQuickBuyModal()" class="text-on-surface-variant hover:text-primary"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="flex items-center gap-3 mb-4 p-3 bg-surface-variant/30 rounded-xl">
                    <img id="qbImage" src="" class="w-12 h-12 rounded object-contain bg-surface">
                    <div>
                        <p id="qbTitle" class="text-sm font-bold text-on-surface line-clamp-1"></p>
                        <p id="qbPrice" class="text-primary text-sm font-bold"></p>
                    </div>
                </div>
                <div class="space-y-3">
                    <input type="text" id="qbName" placeholder="الاسم الكريم" class="w-full bg-surface-container border border-outline-variant rounded-lg py-3 px-4 text-sm text-on-surface focus:border-primary focus:outline-none">
                    <input type="tel" id="qbPhone" placeholder="رقم الهاتف" class="w-full bg-surface-container border border-outline-variant rounded-lg py-3 px-4 text-sm text-on-surface focus:border-primary focus:outline-none text-right" dir="ltr">
                    <button id="qbSubmitBtn" class="w-full bg-green-500 text-white font-bold py-3 rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
                        <i class="fa-brands fa-whatsapp text-lg"></i> إرسال الطلب
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(m);
    }
    
    const qbImage = document.getElementById('qbImage');
    qbImage.dataset.fallbackApplied = '';
    qbImage.onerror = () => window.handleProductImageError(qbImage);
    qbImage.src = getSafeImageUrl(p.image, getSafeImageUrl(window.defaultProductImage, LOCAL_FALLBACK_IMAGE));
    document.getElementById('qbTitle').innerText = p.title;
    document.getElementById('qbPrice').innerText = p.price + ' ج.م';
    
    document.getElementById('qbSubmitBtn').onclick = () => {
        const name = document.getElementById('qbName').value.trim();
        const phone = document.getElementById('qbPhone').value.trim();
        if (!name || !phone) {
            alert('يرجى إدخال الاسم ورقم الهاتف');
            return;
        }
        if (window.fbq) {
            fbq('track', 'Contact', {content_name: p.title, content_ids: [String(p._id || '')], content_type: 'product', currency: 'EGP', value: Number(p.price) || 0});
        }
        const text = `مرحباً، أريد طلب هذا المنتج (طلب سريع):\nالمنتج: ${p.title}\nالسعر: ${p.price} ج.م\nالاسم: ${name}\nرقم الهاتف: ${phone}\nرابط المنتج: ${getProductShareUrl(p)}`;
        window.open(buildWhatsappUrl(text), '_blank');
        closeQuickBuyModal();
    };
    
    m.classList.remove('hidden');
    document.body.classList.add('ui-overlay-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        m.classList.remove('opacity-0');
        m.querySelector('.transform').classList.remove('scale-95');
        m.querySelector('.transform').classList.add('scale-100');
    }, 10);
}

function closeQuickBuyModal() {
    const m = document.getElementById('quickBuyModal');
    if(m) {
        m.classList.add('opacity-0');
        m.querySelector('.transform').classList.remove('scale-100');
        m.querySelector('.transform').classList.add('scale-95');
        setTimeout(() => {
            m.classList.add('hidden');
            document.body.classList.remove('ui-overlay-open');
            document.body.style.overflow = '';
        }, 300);
    }
}



// V10.1 — policy links are kept in the footer instead of an intrusive privacy popup.
document.addEventListener('DOMContentLoaded',()=>{
  const footer=document.querySelector('.site-footer');
  if(!footer||footer.querySelector('.v101-policy-links'))return;
  const links=document.createElement('div');links.className='v101-policy-links';
  links.innerHTML='<a href="/privacy">سياسة الخصوصية</a><a href="/shipping-policy">الشحن والتوصيل</a><a href="/returns-policy">الاستبدال والاسترجاع</a><a href="/warranty">الضمان</a><a href="/terms">الشروط والأحكام</a>';
  (footer.firstElementChild||footer).appendChild(links);
});


/* ===== Integrated V8 public module ===== */
/* Technology Store V8 — commerce, attribution, reviews, variants, smoother mobile UX */
(() => {
  'use strict';
  const state = () => window.__techStoreState;
  const money = n => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n)||0)} ج.م`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const selectedVariant = new Map();
  const checkoutState = { shippingAmount:0, discountAmount:0, couponCode:'', quotePending:false };
  const statusLabels = {
    pending:'تم استلام الطلب — في انتظار تأكيد المتجر', received_by_pos:'وصل الطلب إلى Technology POS — في انتظار الفاتورة', confirmed:'تم إنشاء فاتورة البيع وتأكيد الطلب', processing:'جاري التجهيز', out_for_delivery:'خرج للتوصيل', completed:'تم التسليم', cancelled:'تم الإلغاء'
  };

  function products(){ return state()?.getProducts?.() || []; }
  function cart(){ return state()?.getCart?.() || []; }
  function settings(){ return state()?.getSettings?.() || window.storeSettings || {}; }
  function saveCart(next){ state()?.setCart?.(next); }
  function productById(id){ return products().find(p => String(p._id) === String(id)); }
  function variantFor(product, raw){
    const arr = Array.isArray(product?.variants) ? product.variants : [];
    if (!arr.length) return null;
    const wanted = typeof raw === 'object' ? String(raw?.value || raw?.sku || '') : String(raw || '');
    return arr.find(v => String(v.value) === wanted || String(v.sku || '') === wanted) || null;
  }
  function cartKey(id, variant){ return `${id}::${variant?.value || ''}`; }
  function itemKey(item){ return item.cartKey || cartKey(item._id, item.variantData || (item.variantValue ? {value:item.variantValue}:null)); }
  function subtotal(){ return cart().reduce((sum, i) => sum + Number(i.price||0) * Number(i.quantity||0), 0); }
  async function getLiveStock(product, variantRaw){
    const fallbackVariant=variantFor(product,variantRaw);
    const fallback=fallbackVariant?Number(fallbackVariant.stockQuantity||0):Number(product?.stockQuantity||0);
    try{
      const r=await fetch(`/api/products/${encodeURIComponent(product._id)}/availability`,{cache:'no-store'});
      if(!r.ok)throw new Error('availability');
      const d=await r.json();
      if(Array.isArray(d.variants)&&d.variants.length&&variantRaw){
        const wanted=typeof variantRaw==='object'?String(variantRaw?.value||variantRaw?.sku||''):String(variantRaw||'');
        const v=d.variants.find(x=>String(x.value)===wanted||String(x.sku||'')===wanted);
        if(v)return Math.max(0,Number(v.stockQuantity)||0);
      }
      return Math.max(0,Number(d.stockQuantity)||0);
    }catch(_){return Math.max(0,fallback||0);}
  }

  // ---------- Exact share-source attribution ----------
  function attributedUrl(baseUrl, source){
    const u = new URL(baseUrl, location.origin);
    u.searchParams.set('utm_source', source);
    u.searchParams.set('utm_medium', 'product_share');
    u.searchParams.set('utm_campaign', 'product_share');
    u.searchParams.set('share_source', source);
    return u.toString();
  }
  function closeShareSheet(){ document.getElementById('v8ShareSheet')?.remove(); }
  window.shareProduct = function(title, price, url){
    closeShareSheet();
    const sheet = document.createElement('div');
    sheet.id='v8ShareSheet'; sheet.className='v8-overlay';
    const msg = `${title}${price ? ` — ${money(price)}` : ''}`;
    const links = {
      whatsapp:`https://wa.me/?text=${encodeURIComponent(msg+'\n'+attributedUrl(url,'whatsapp'))}`,
      facebook:`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(attributedUrl(url,'facebook'))}`,
      telegram:`https://t.me/share/url?url=${encodeURIComponent(attributedUrl(url,'telegram'))}&text=${encodeURIComponent(msg)}`
    };
    sheet.innerHTML=`<div class="v8-backdrop" onclick="document.getElementById('v8ShareSheet')?.remove()"></div>
      <section class="v8-sheet v8-share-sheet" dir="rtl">
        <header><div><small>رابط متتبع للمصدر</small><h3>مشاركة المنتج</h3></div><button onclick="document.getElementById('v8ShareSheet')?.remove()">×</button></header>
        <p class="v8-muted">عند استخدام أحد الأزرار التالية ستعرف من لوحة الإدارة إن الزيارة جاءت من واتساب أو فيسبوك أو تليجرام.</p>
        <div class="v8-share-grid">
          <a href="${links.whatsapp}" target="_blank" rel="noopener" class="wa"><i class="fa-brands fa-whatsapp"></i><span>واتساب</span></a>
          <a href="${links.facebook}" target="_blank" rel="noopener" class="fb"><i class="fa-brands fa-facebook-f"></i><span>فيسبوك</span></a>
          <a href="${links.telegram}" target="_blank" rel="noopener" class="tg"><i class="fa-brands fa-telegram-plane"></i><span>تليجرام</span></a>
          <button id="v8CopyShare"><span class="material-symbols-outlined">link</span><span>نسخ الرابط</span></button>
        </div>
        <button id="v8SystemShare" class="v8-secondary-btn"><span class="material-symbols-outlined">ios_share</span> مشاركة من الهاتف</button>
      </section>`;
    document.body.appendChild(sheet);
    document.getElementById('v8CopyShare').onclick=async()=>{
      const shareUrl=attributedUrl(url,'copied_link');
      try{await navigator.clipboard.writeText(`${msg}\n${shareUrl}`); state()?.showToast?.('تم نسخ رابط متتبع');}catch(_){prompt('انسخ الرابط',shareUrl);}
    };
    document.getElementById('v8SystemShare').onclick=async()=>{
      const shareUrl=attributedUrl(url,'system_share');
      if(navigator.share){ try{await navigator.share({title,text:msg,url:shareUrl});}catch(_){} }
      else { try{await navigator.clipboard.writeText(shareUrl);state()?.showToast?.('تم نسخ الرابط');}catch(_){} }
    };
  };

  // ---------- Cart with variants ----------
  window.addToCart = async function(productId, variantValue){
    const p=productById(productId); if(!p) return;
    const selected=variantValue || selectedVariant.get(String(productId));
    const v=variantFor(p, selected);
    const stock=await getLiveStock(p, selected);
    if(stock<=0){ openStockNotify(p); return; }
    const price=v && Number.isFinite(Number(v.price)) ? Number(v.price) : Number(p.price)||0;
    const next=[...cart()]; const key=cartKey(p._id,v); const existing=next.find(i=>itemKey(i)===key);
    if(existing){ if(existing.quantity>=stock){ alert('لا يوجد مخزون كافٍ لهذه الكمية.'); return; } existing.quantity+=1; }
    else next.push({_id:p._id,cartKey:key,title:p.title,price,image:(v?.image||p.image),sku:(v?.sku||p.sku||''),posItemId:p.posItemId,stockQuantity:stock,quantity:1,variantValue:v?.value||'',variantLabel:v?.label||'',variantData:v?{label:v.label,value:v.value,sku:v.sku||''}:null});
    saveCart(next); window.renderCart?.(); window.updateCartBadge?.(); state()?.showToast?.('تمت الإضافة للسلة');
    try{ window.trackEvent?.('cart_adds',p._id,p.title); if(window.fbq) fbq('track','AddToCart',{value:price,currency:'EGP'}); }catch(_){}
  };
  window.removeFromCart = function(key){ const next=cart().filter(i=>itemKey(i)!==String(key) && String(i._id)!==String(key)); saveCart(next); window.renderCart?.(); window.updateCartBadge?.(); };
  window.updateCartQuantity = async function(key,change){
    const next=[...cart()]; const item=next.find(i=>itemKey(i)===String(key) || String(i._id)===String(key)); if(!item) return;
    const q=Number(item.quantity||0)+Number(change||0); if(q<=0){window.removeFromCart(itemKey(item));return;}
    if(Number(change)>0){
      const p=productById(item._id);
      if(p){const live=await getLiveStock(p,item.variantValue||item.variantData);item.stockQuantity=live;if(q>live){alert(live<=0?'عذراً، نفدت الكمية حالياً.':'لا يوجد مخزون كافٍ لهذه الكمية.');return;}}
      else if(q>Number(item.stockQuantity||0)){alert('لا يوجد مخزون كافٍ.');return;}
    }
    item.quantity=q; saveCart(next); window.renderCart?.(); window.updateCartBadge?.();
  };

  window.renderCart = function(){
    const container=document.getElementById('cartItemsContainer'); const totalEl=document.getElementById('cartTotalPrice'); if(!container||!totalEl)return;
    const c=cart();
    if(!c.length){container.innerHTML='<div class="v8-empty-cart"><span class="material-symbols-outlined">shopping_cart</span><strong>سلة التسوق فارغة</strong><small>أضف منتجاتك ثم أكمل الطلب من هنا.</small></div>';totalEl.textContent=money(0);document.getElementById('cartCustomerForm')?.classList.add('hidden');return;}
    container.innerHTML=c.map(item=>{
      const key=itemKey(item); const p=productById(item._id); const image=item.image||p?.image||'/assets/no-image.svg'; const variant=item.variantValue?`<span class="v8-cart-variant">${esc(item.variantLabel||'الخيار')}: ${esc(item.variantValue)}</span>`:'';
      return `<article class="v8-cart-line"><img src="${esc(image)}" alt="${esc(item.title)}" loading="lazy" decoding="async"><div class="v8-cart-copy"><strong>${esc(item.title)}</strong>${variant}<b>${money(item.price)}</b></div><div class="v8-qty"><button onclick="updateCartQuantity('${esc(key)}',-1)">−</button><span>${item.quantity}</span><button onclick="updateCartQuantity('${esc(key)}',1)">+</button></div><button class="v8-remove" onclick="removeFromCart('${esc(key)}')" aria-label="حذف">×</button></article>`;
    }).join('');
    totalEl.textContent=money(Math.max(0,subtotal()-checkoutState.discountAmount+checkoutState.shippingAmount));
    updateCheckoutSummary();
  };

  // ---------- Checkout ----------
  function buildCheckoutForm(){
    const box=document.getElementById('cartCustomerForm'); if(!box) return; if(box.dataset.v8==='1'){refreshCheckoutConfig();return;} box.dataset.v8='1';
    box.innerHTML=`
      <div class="v8-checkout-grid">
        <input id="customerName" autocomplete="name" placeholder="الاسم الكامل">
        <input id="customerPhone" autocomplete="tel" inputmode="tel" dir="ltr" placeholder="رقم الهاتف">
      </div>
      <div class="v8-segment" id="v8DeliverySegment"><button type="button" data-delivery="pickup" class="active">استلام من المعرض</button><button type="button" data-delivery="shipping">شحن</button></div>
      <div id="addressFieldContainer"><div id="v8ShippingFields" class="hidden v8-checkout-grid">
        <select id="v8Governorate"><option value="">اختر منطقة الشحن</option></select>
        <input id="v8Area" placeholder="المنطقة / الحي">
        <textarea id="customerAddress" placeholder="العنوان بالتفصيل"></textarea>
      </div></div><p id="pickupOnlyNote" class="hidden"></p>
      <textarea id="v8OrderNotes" class="v8-notes-field" placeholder="ملاحظات على الطلب (اختياري)"></textarea>
      <div><label class="v8-label">طريقة الدفع</label><select id="v8PaymentMethod"></select></div>
      <div class="v8-coupon"><input id="v8Coupon" placeholder="كود الخصم"><button type="button" id="v8ApplyCoupon">تطبيق</button></div>
      <div id="v8CheckoutMessage" class="v8-quote-note"></div>
      <div class="v8-order-summary"><div><span>المنتجات</span><b id="v8SubTotal">0</b></div><div><span>الخصم</span><b id="v8Discount">0</b></div><div><span>الشحن</span><b id="v8Shipping">0</b></div><div class="total"><span>الإجمالي</span><b id="v8GrandTotal">0</b></div></div>
      <button type="button" class="v8-track-link" onclick="openOrderTracking()"><span class="material-symbols-outlined">local_shipping</span> لديك طلب سابق؟ تتبع طلبك</button>`;
    refreshCheckoutConfig();
    box.querySelectorAll('[data-delivery]').forEach(btn=>btn.onclick=()=>{ if(btn.disabled)return; box.querySelectorAll('[data-delivery]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.getElementById('v8ShippingFields').classList.toggle('hidden',btn.dataset.delivery!=='shipping');fillPaymentMethods();requestQuote(); });
    document.getElementById('v8Governorate').onchange=requestQuote; document.getElementById('v8ApplyCoupon').onclick=requestQuote;
    document.getElementById('v8Coupon').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();requestQuote();}});
    updateCheckoutSummary();
  }
  function refreshCheckoutConfig(){
    const box=document.getElementById('cartCustomerForm');if(!box||box.dataset.v8!=='1')return;const s=settings();const pickupBtn=box.querySelector('[data-delivery="pickup"]'),shippingBtn=box.querySelector('[data-delivery="shipping"]');
    if(pickupBtn){pickupBtn.disabled=s.pickupEnabled===false;pickupBtn.title=pickupBtn.disabled?'الاستلام من المعرض غير متاح':'';}
    if(shippingBtn){shippingBtn.disabled=!s.isShippingEnabled;shippingBtn.title=shippingBtn.disabled?'الشحن غير مفعل':'';}
    let active=box.querySelector('[data-delivery].active');
    if(!active||active.disabled){box.querySelectorAll('[data-delivery]').forEach(b=>b.classList.remove('active'));active=[pickupBtn,shippingBtn].find(b=>b&&!b.disabled);active?.classList.add('active');}
    const gov=document.getElementById('v8Governorate');if(gov){const current=gov.value;const zones=Array.isArray(s.shippingZones)?s.shippingZones.filter(z=>z.enabled!==false):[];gov.innerHTML='<option value="">اختر منطقة الشحن</option>'+zones.map(z=>`<option value="${esc(z.name)}">${esc(z.name)} — ${money(z.fee)}${z.eta?` (${esc(z.eta)})`:''}</option>`).join('');if([...gov.options].some(o=>o.value===current))gov.value=current;}
    const fields=document.getElementById('v8ShippingFields');if(fields)fields.classList.toggle('hidden',deliveryMethod()!=='shipping');fillPaymentMethods();updateCheckoutSummary();
  }
  function deliveryMethod(){ return document.querySelector('#v8DeliverySegment [data-delivery].active')?.dataset.delivery || 'pickup'; }
  function fillPaymentMethods(){
    const el=document.getElementById('v8PaymentMethod'); if(!el)return; const s=settings(); const d=deliveryMethod(); const arr=[];
    if(s.paymentCashOnDelivery!==false && d==='shipping') arr.push(['cash_on_delivery','الدفع عند الاستلام']);
    if(s.paymentInstapay) arr.push(['instapay',`InstaPay${s.instapayHandle?` — ${s.instapayHandle}`:''}`]);
    if(s.paymentStorePickup!==false && d==='pickup') arr.push(['pay_at_store','الدفع عند الاستلام من المعرض']);
    if(!arr.length && s.paymentCashOnDelivery!==false) arr.push(['cash_on_delivery','الدفع عند الاستلام']);
    el.innerHTML=arr.map(x=>`<option value="${x[0]}">${esc(x[1])}</option>`).join('');
  }
  async function requestQuote(){
    const note=document.getElementById('v8CheckoutMessage'); const gov=document.getElementById('v8Governorate')?.value||''; const coupon=document.getElementById('v8Coupon')?.value.trim()||''; const d=deliveryMethod();
    if(d==='shipping' && !gov){ checkoutState.shippingAmount=0; checkoutState.discountAmount=0; if(note)note.textContent='اختر منطقة الشحن لحساب التكلفة.'; updateCheckoutSummary(); return; }
    checkoutState.quotePending=true; if(note)note.textContent='جاري حساب الإجمالي...';
    try{const r=await fetch('/api/checkout/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subtotal:subtotal(),deliveryMethod:d,governorate:gov,couponCode:coupon})});const data=await r.json();if(!r.ok)throw new Error(data.message||'تعذر حساب الطلب');checkoutState.shippingAmount=Number(data.shippingAmount||0);checkoutState.discountAmount=Number(data.discountAmount||0);checkoutState.couponCode=data.couponCode||'';if(note)note.textContent=data.eta?`مدة الشحن المتوقعة: ${data.eta}`:(checkoutState.couponCode?'تم تطبيق الخصم بنجاح':'');}
    catch(err){checkoutState.shippingAmount=0;checkoutState.discountAmount=0;checkoutState.couponCode='';if(note)note.textContent=err.message;}
    finally{checkoutState.quotePending=false;updateCheckoutSummary();}
  }
  function updateCheckoutSummary(){
    const sub=subtotal(); const total=Math.max(0,sub-checkoutState.discountAmount+checkoutState.shippingAmount);
    const map={v8SubTotal:sub,v8Discount:checkoutState.discountAmount,v8Shipping:checkoutState.shippingAmount,v8GrandTotal:total}; Object.entries(map).forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=money(v);}); const old=document.getElementById('cartTotalPrice');if(old)old.textContent=money(total);
  }
  const oldOpenCart=window.openCartSidebar;
  window.openCartSidebar=function(){ oldOpenCart?.(); setTimeout(()=>{buildCheckoutForm();document.getElementById('cartCustomerForm')?.classList.toggle('hidden',cart().length===0);},0); };

  window.checkoutWhatsApp = async function(){
    if(!cart().length){alert('عربة التسوق فارغة.');return;}
    buildCheckoutForm(); const name=document.getElementById('customerName')?.value.trim()||''; const phone=document.getElementById('customerPhone')?.value.trim()||''; const d=deliveryMethod(); const gov=document.getElementById('v8Governorate')?.value||''; const area=document.getElementById('v8Area')?.value.trim()||''; const address=document.getElementById('customerAddress')?.value.trim()||''; const payment=document.getElementById('v8PaymentMethod')?.value||'';
    if(!name||!phone){alert('أدخل الاسم ورقم الهاتف.');return;} if(d==='shipping'&&(!gov||!address)){alert('اختر منطقة الشحن وأدخل العنوان بالتفصيل.');return;}
    await requestQuote();
    let checkoutToken=sessionStorage.getItem('tech_checkout_token');if(!checkoutToken){checkoutToken='chk_'+(window.crypto?.randomUUID?window.crypto.randomUUID():Date.now()+'_'+Math.random().toString(36).slice(2));sessionStorage.setItem('tech_checkout_token',checkoutToken);}const payload={customerName:name,customerPhone:phone,customerAddress:d==='shipping'?address:'استلام من المعرض',deliveryMethod:d,governorate:gov,area,notes:document.getElementById('v8OrderNotes')?.value.trim()||'',paymentMethod:payment,couponCode:checkoutState.couponCode||document.getElementById('v8Coupon')?.value.trim()||'',visitorId:localStorage.getItem('tech_store_vid')||'',sessionId:sessionStorage.getItem('tech_store_session_id')||'',checkoutToken,items:cart().map(i=>({productId:i._id,sku:i.sku,posItemId:i.posItemId,title:i.title,quantity:i.quantity,variant:i.variantValue?{value:i.variantValue}:undefined}))};
    const btn=document.querySelector('button[onclick="checkoutWhatsApp()"]'); const old=btn?.innerHTML;if(btn){btn.disabled=true;btn.innerHTML='<span class="material-symbols-outlined animate-spin">sync</span> جاري إنشاء الطلب...';}
    try{const r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.message||'تعذر إرسال الطلب');showOrderSuccess(data,name,phone);try{window.v9TrackEvent?.('order_submitted',{orderNumber:data.orderNumber||data.orderId,value:Number(data.total)||0});}catch(_){} }
    catch(err){alert(err.message);}finally{if(btn){btn.disabled=false;btn.innerHTML=old;}}
  };
  function showOrderSuccess(data,name,phone){
    const msg=`مرحباً، أريد متابعة الطلب رقم ${data.orderNumber||data.orderId}\nالاسم: ${name}\nالهاتف: ${phone}\nالإجمالي: ${money(data.total)}`; const wa=state()?.buildWhatsappUrl?.(msg)||'#';
    const m=document.createElement('div');m.className='v8-overlay';m.innerHTML=`<div class="v8-backdrop"></div><section class="v8-sheet v8-success"><span class="material-symbols-outlined success-icon">check_circle</span><h2>تم استلام طلبك</h2><p>طلبك لم يُعتبر بيعًا بعد. سيتم تأكيده فقط بعد إنشاء فاتورة البيع من Technology POS.</p><code>${esc(data.orderNumber||data.orderId)}</code><div class="v8-order-mini"><span>الشحن: ${money(data.shippingAmount)}</span><span>الخصم: ${money(data.discountAmount)}</span><strong>الإجمالي: ${money(data.total)}</strong></div><div class="v8-actions"><button id="v8TrackNow">تتبع الطلب</button><a href="${wa}" target="_blank" rel="noopener">متابعة عبر واتساب</a></div><button id="v8DoneOrder" class="v8-secondary-btn">تم</button></section>`;document.body.appendChild(m);
    localStorage.setItem('tech_last_order',JSON.stringify({orderNumber:data.orderNumber||data.orderId,phone}));sessionStorage.removeItem('tech_checkout_token');
    document.getElementById('v8DoneOrder').onclick=()=>{saveCart([]);window.renderCart?.();window.closeCartSidebar?.();m.remove();};
    document.getElementById('v8TrackNow').onclick=()=>{m.remove();saveCart([]);window.renderCart?.();window.closeCartSidebar?.();openOrderTracking(data.orderNumber||data.orderId,phone);};
  }

  // ---------- Order tracking ----------
  window.openOrderTracking=function(orderNumber='',phone=''){
    document.getElementById('v8OrderTrack')?.remove();
    try{const last=JSON.parse(localStorage.getItem('tech_last_order')||'{}');orderNumber=orderNumber||last.orderNumber||'';phone=phone||last.phone||'';}catch(_){}
    const m=document.createElement('div');m.id='v8OrderTrack';m.className='v8-overlay';m.innerHTML=`<div class="v8-backdrop" onclick="document.getElementById('v8OrderTrack')?.remove()"></div><section class="v8-sheet v8-track-sheet"><header><div><small>متابعة حالة الشحنة</small><h3>تتبع طلبك</h3></div><button onclick="document.getElementById('v8OrderTrack')?.remove()">×</button></header><div class="v8-checkout-grid"><input id="v8TrackNumber" dir="ltr" placeholder="رقم الطلب" value="${esc(orderNumber)}"><input id="v8TrackPhone" dir="ltr" placeholder="رقم الهاتف" value="${esc(phone)}"></div><button id="v8TrackSubmit" class="v8-primary-btn">عرض حالة الطلب</button><div id="v8TrackResult"></div></section>`;document.body.appendChild(m);document.getElementById('v8TrackSubmit').onclick=async()=>{const n=document.getElementById('v8TrackNumber').value.trim(),p=document.getElementById('v8TrackPhone').value.trim(),out=document.getElementById('v8TrackResult');if(!n||!p){out.innerHTML='<p class="v8-error">أدخل رقم الطلب والهاتف.</p>';return;}out.innerHTML='<p class="v8-muted">جاري التحميل...</p>';try{const r=await fetch(`/api/orders/track?orderNumber=${encodeURIComponent(n)}&phone=${encodeURIComponent(p)}`);const d=await r.json();if(!r.ok)throw new Error(d.message||'الطلب غير موجود');const hist=(d.statusHistory?.length?d.statusHistory:[{status:d.status,at:d.createdAt}]);out.innerHTML=`<div class="v8-track-card"><div class="v8-track-head"><strong>${esc(d.orderNumber)}</strong><b>${money(d.total)}</b></div><div class="v8-timeline">${hist.map((h,i)=>`<div class="${i===hist.length-1?'active':''}"><span></span><p><strong>${esc(statusLabels[h.status]||h.status)}</strong><small>${h.at?new Date(h.at).toLocaleString('ar-EG'):''}${h.note?` — ${esc(h.note)}`:''}</small></p></div>`).join('')}</div></div>`;}catch(err){out.innerHTML=`<p class="v8-error">${esc(err.message)}</p>`;}};
  };

  // ---------- Product variants, reviews, stock alert, zoom ----------
  const oldOpenProduct=window.openProductModal;
  window.openProductModal=function(id){ oldOpenProduct?.(id); setTimeout(()=>enhanceProductModal(id),10); };
  function enhanceProductModal(id){
    const p=productById(id); if(!p)return; const info=document.querySelector('.product-detail-info'); if(!info)return;
    injectVariants(p,info); injectReviews(p,info); bindImageViewer(p); injectMobileProductDock(p);
    const share=document.getElementById('modalShareBtn'); if(share)share.onclick=()=>window.shareProduct(p.title,p.price,state()?.getProductShareUrl?.(p)||location.href);
    const add=document.getElementById('modalAddToCartBtn'); if(add && Number(p.stockQuantity)>0) add.onclick=()=>window.addToCart(p._id,selectedVariant.get(String(p._id)));
    if((Array.isArray(p.variants)&&p.variants.length?Math.max(...p.variants.map(v=>Number(v.stockQuantity||0))):Number(p.stockQuantity||0))<=0) setupNotifyButton(p);
    const modal=document.getElementById('productModalContent'); if(modal) modal.scrollTop=0;
  }
  function injectMobileProductDock(p){
    const modal=document.getElementById('productModalContent');if(!modal)return;modal.querySelector('#v8MobileProductDock')?.remove();
    const totalStock=Array.isArray(p.variants)&&p.variants.length?p.variants.reduce((a,v)=>a+Math.max(0,Number(v.stockQuantity)||0),0):Number(p.stockQuantity||0);
    const dock=document.createElement('div');dock.id='v8MobileProductDock';dock.className='v8-mobile-product-dock';
    dock.innerHTML=totalStock>0?`<button class="buy"><span class="material-symbols-outlined">bolt</span> شراء الآن</button><button class="cart"><span class="material-symbols-outlined">add_shopping_cart</span> للسلة</button><button class="ask"><i class="fa-brands fa-whatsapp"></i> واتساب</button>`:`<button class="notify"><span class="material-symbols-outlined">notifications_active</span> بلغني عند التوفر</button><button class="ask"><i class="fa-brands fa-whatsapp"></i> استفسر</button>`;
    const primaryActions=modal.querySelector('.product-detail-primary-actions');
    const actions=modal.querySelector('.product-detail-actions');
    if(primaryActions) primaryActions.insertAdjacentElement('afterend',dock);
    else if(actions) actions.prepend(dock);
    else modal.appendChild(dock);
    dock.querySelector('.cart')?.addEventListener('click',()=>window.addToCart(p._id,selectedVariant.get(String(p._id))));
    dock.querySelector('.buy')?.addEventListener('click',()=>{
      const quickBuyEnabled=Boolean(state()?.storeSettings?.isQuickBuyEnabled);
      if(quickBuyEnabled && typeof window.openQuickBuyModal==='function'){ window.openQuickBuyModal(p._id); return; }
      window.addToCart(p._id,selectedVariant.get(String(p._id)));
      window.closeProductModal?.();
      setTimeout(()=>window.openCartSidebar?.(),180);
    });
    dock.querySelector('.notify')?.addEventListener('click',()=>openStockNotify(p));
    dock.querySelector('.ask')?.addEventListener('click',()=>window.open(state()?.buildWhatsappUrl?.(`أريد الاستفسار عن منتج: ${p.title}`)||'#','_blank','noopener'));
  }

  function injectVariants(p,info){
    info.querySelector('#v8VariantBox')?.remove(); const arr=(p.variants||[]).filter(v=>v.value); if(!arr.length)return;
    const available=arr.find(v=>Number(v.stockQuantity)>0)||arr[0]; selectedVariant.set(String(p._id),available.value);
    const box=document.createElement('div');box.id='v8VariantBox';box.className='v8-variant-box';box.innerHTML=`<label>${esc(available.label||'اختر الخيار')}</label><div class="v8-variant-options">${arr.map(v=>`<button type="button" data-value="${esc(v.value)}" class="${v.value===available.value?'active':''}" ${Number(v.stockQuantity)<=0?'disabled':''}><span>${esc(v.value)}</span><small>${Number(v.stockQuantity)<=0?'غير متوفر':money(Number.isFinite(Number(v.price))?v.price:p.price)}</small></button>`).join('')}</div>`;
    const price=document.getElementById('modalPrice'); price?.insertAdjacentElement('afterend',box);
    box.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{box.querySelectorAll('button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');selectedVariant.set(String(p._id),btn.dataset.value);const v=variantFor(p,btn.dataset.value);if(price)price.innerHTML=formatVariantPrice(v,p);const img=document.getElementById('modalImage');if(v?.image&&img)img.src=v.image;const add=document.getElementById('modalAddToCartBtn');if(add)add.onclick=()=>window.addToCart(p._id,v.value);});
    if(price)price.innerHTML=formatVariantPrice(available,p);
  }
  function formatVariantPrice(v,p){const now=Number.isFinite(Number(v?.price))?Number(v.price):Number(p.price)||0;const old=Number(v?.oldPrice||0)>now?`<del>${money(v.oldPrice)}</del>`:'';return `<span>${money(now)}</span>${old}`;}
  function injectReviews(p,info){
    info.querySelector('#v8Reviews')?.remove(); const sec=document.createElement('section');sec.id='v8Reviews';sec.className='v8-reviews';sec.innerHTML=`<div class="v8-section-heading"><div><small>تجارب العملاء</small><h4>التقييمات والمراجعات</h4></div><button id="v8WriteReview">اكتب تقييمك</button></div><div id="v8ReviewSummary" class="v8-muted">جاري تحميل التقييمات...</div><div id="v8ReviewList"></div>`; const related=document.getElementById('modalRelatedProducts');(related||info).insertAdjacentElement(related?'beforebegin':'beforeend',sec);document.getElementById('v8WriteReview').onclick=()=>openReviewForm(p);
    fetch(`/api/reviews/${p._id}`).then(r=>r.json()).then(d=>{const sum=document.getElementById('v8ReviewSummary'),list=document.getElementById('v8ReviewList');if(!sum||!list)return;sum.innerHTML=d.count?`<strong>${'★'.repeat(Math.round(d.average))}${'☆'.repeat(5-Math.round(d.average))}</strong> ${d.average}/5 من ${d.count} مراجعة`:'لا توجد مراجعات منشورة بعد.';list.innerHTML=(d.reviews||[]).slice(0,5).map(r=>`<article><div><strong>${esc(r.name)}${r.verifiedPurchase?' <em class="v101-verified-review">✓ مشتري موثّق</em>':''}</strong><span>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></div><p>${esc(r.comment||'')}</p>${r.storeReply?`<div class="v10-store-reply"><strong>رد المتجر</strong><p>${esc(r.storeReply)}</p></div>`:''}<small>${new Date(r.createdAt).toLocaleDateString('ar-EG')}</small></article>`).join('');}).catch(()=>{});
  }
  function openReviewForm(p){
    document.getElementById('v8ReviewFormModal')?.remove();const m=document.createElement('div');m.id='v8ReviewFormModal';m.className='v8-overlay';m.innerHTML=`<div class="v8-backdrop"></div><section class="v8-sheet v8-form-sheet"><header><div><small>شارك تجربتك</small><h3>تقييم ${esc(p.title)}</h3></div><button class="v8-close-form">×</button></header><div class="v8-checkout-grid"><input id="v8ReviewName" placeholder="الاسم"><select id="v8ReviewRating"><option value="5">★★★★★ — ممتاز</option><option value="4">★★★★☆ — جيد جداً</option><option value="3">★★★☆☆ — جيد</option><option value="2">★★☆☆☆ — مقبول</option><option value="1">★☆☆☆☆ — ضعيف</option></select><textarea id="v8ReviewComment" placeholder="اكتب رأيك (اختياري)"></textarea><input id="v8ReviewOrder" dir="ltr" placeholder="رقم الطلب (اختياري للتحقق من الشراء)"><input id="v8ReviewPhone" dir="ltr" placeholder="رقم الهاتف في الطلب (اختياري)"></div><p class="v8-muted">سيظهر التقييم بعد اعتماده من إدارة المتجر. إذا أدخلت رقم الطلب والهاتف سيظهر كتقييم مشتري موثّق بعد التحقق.</p><button id="v8ReviewSubmit" class="v8-primary-btn">إرسال التقييم</button></section>`;document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v8-backdrop').onclick=close;m.querySelector('.v8-close-form').onclick=close;document.getElementById('v8ReviewSubmit').onclick=async()=>{const name=document.getElementById('v8ReviewName').value.trim(),rating=Number(document.getElementById('v8ReviewRating').value),comment=document.getElementById('v8ReviewComment').value.trim(),orderNumber=document.getElementById('v8ReviewOrder')?.value.trim()||'',phone=document.getElementById('v8ReviewPhone')?.value.trim()||'';if(!name){state()?.showToast?.('اكتب الاسم أولاً');return;}const btn=document.getElementById('v8ReviewSubmit');btn.disabled=true;try{const r=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:p._id,name,rating,comment,orderNumber,phone})});const d=await r.json();if(!r.ok)throw new Error(d.message);close();state()?.showToast?.(d.message||'تم إرسال التقييم');}catch(e){alert(e.message||'تعذر إرسال التقييم');}finally{btn.disabled=false;}};
  }
  function setupNotifyButton(p){const wa=document.getElementById('modalWhatsappBtn');if(!wa)return;wa.removeAttribute('href');wa.onclick=e=>{e.preventDefault();openStockNotify(p);};wa.innerHTML='<span class="material-symbols-outlined">notifications_active</span> بلغني عند التوفر';}
  function openStockNotify(p){
    document.getElementById('v8StockNotifyModal')?.remove();const m=document.createElement('div');m.id='v8StockNotifyModal';m.className='v8-overlay';m.innerHTML=`<div class="v8-backdrop"></div><section class="v8-sheet v8-form-sheet"><header><div><small>تنبيه عودة المخزون</small><h3>${esc(p.title)}</h3></div><button class="v8-close-form">×</button></header><div class="v8-checkout-grid"><input id="v8NotifyName" placeholder="الاسم (اختياري)"><input id="v8NotifyPhone" inputmode="tel" dir="ltr" placeholder="رقم الهاتف / واتساب"></div><p class="v8-muted">سيظهر طلب التنبيه للإدارة ويمكن إرسال إشعار واتساب لك عند توفر المنتج.</p><button id="v8NotifySubmit" class="v8-primary-btn">سجل طلب التنبيه</button></section>`;document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v8-backdrop').onclick=close;m.querySelector('.v8-close-form').onclick=close;document.getElementById('v8NotifySubmit').onclick=async()=>{const name=document.getElementById('v8NotifyName').value.trim(),phone=document.getElementById('v8NotifyPhone').value.trim();if(!phone){state()?.showToast?.('اكتب رقم الهاتف');return;}const btn=document.getElementById('v8NotifySubmit');btn.disabled=true;try{const r=await fetch('/api/stock-notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:p._id,name,phone})});const d=await r.json();if(!r.ok)throw new Error(d.message);close();state()?.showToast?.(d.message||'تم تسجيل التنبيه');}catch(e){alert(e.message||'تعذر تسجيل التنبيه');}finally{btn.disabled=false;}};
  }
  function bindImageViewer(p){const img=document.getElementById('modalImage');if(!img)return;img.style.cursor='zoom-in';img.onclick=()=>openImageViewer(collectImages(p),img.src);let x0=0;img.ontouchstart=e=>x0=e.changedTouches[0].clientX;img.ontouchend=e=>{const dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>50)cycleModalGallery(dx<0?1:-1,p);};}
  function collectImages(p){return [p.image,...(p.additionalImages||[]).map(x=>x.url),...(p.variants||[]).map(x=>x.image)].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i);}
  function cycleModalGallery(dir,p){const arr=collectImages(p),img=document.getElementById('modalImage');if(!img||!arr.length)return;let i=Math.max(0,arr.indexOf(img.src));i=(i+dir+arr.length)%arr.length;img.src=arr[i];}
  function openImageViewer(images,current){document.getElementById('v8ImageViewer')?.remove();let idx=Math.max(0,images.indexOf(current));const m=document.createElement('div');m.id='v8ImageViewer';m.className='v8-image-viewer';m.innerHTML=`<button class="close">×</button><button class="prev">‹</button><img><button class="next">›</button><span></span>`;document.body.appendChild(m);const render=()=>{m.querySelector('img').src=images[idx];m.querySelector('span').textContent=`${idx+1} / ${images.length}`;};render();m.querySelector('.close').onclick=()=>m.remove();m.querySelector('.prev').onclick=()=>{idx=(idx-1+images.length)%images.length;render();};m.querySelector('.next').onclick=()=>{idx=(idx+1)%images.length;render();};m.onclick=e=>{if(e.target===m)m.remove();};}


  // ---------- UI hooks ----------
  function injectTrackingEntry(){
    if(document.getElementById('v8TrackHeaderBtn'))return;
    const mobileMenu=document.getElementById('mobileMenu'); if(mobileMenu){const b=document.createElement('button');b.id='v8TrackHeaderBtn';b.className='v8-menu-track';b.innerHTML='<span class="material-symbols-outlined">local_shipping</span> تتبع طلبك';b.onclick=()=>openOrderTracking();mobileMenu.appendChild(b);}
    const footer=document.querySelector('footer');if(footer&&!document.getElementById('v8FooterTrack')){const b=document.createElement('button');b.id='v8FooterTrack';b.className='v8-footer-track';b.innerHTML='<span class="material-symbols-outlined">local_shipping</span><span>تتبع طلبك</span>';b.onclick=()=>openOrderTracking();footer.prepend(b);}
  }
  function upgradeCheckoutButton(){const btn=document.querySelector('button[onclick="checkoutWhatsApp()"]');if(btn){btn.innerHTML='<span class="material-symbols-outlined">shopping_bag</span> تأكيد الطلب';btn.classList.add('v8-checkout-btn');}}
  function smoothImages(){document.querySelectorAll('img').forEach(img=>{if(!img.hasAttribute('decoding'))img.decoding='async';});}

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{ buildCheckoutForm(); upgradeCheckoutButton(); injectTrackingEntry(); smoothImages(); },80); setTimeout(()=>{refreshCheckoutConfig();},1400);
    const mo=new MutationObserver(()=>smoothImages()); mo.observe(document.body,{childList:true,subtree:true}); setTimeout(()=>mo.disconnect(),12000);
  });
})();


/* ===== Integrated V9 public module ===== */
/* Technology Store V9 — conversion funnel, abandoned cart recovery, richer order care */
(() => {
  'use strict';
  const state = () => window.__techStoreState;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n)||0)} ج.م`;
  const statusLabels = {pending:'تم استلام الطلب — في انتظار تأكيد المتجر',received_by_pos:'وصل الطلب إلى Technology POS — في انتظار الفاتورة',confirmed:'تم إنشاء فاتورة البيع وتأكيد الطلب',processing:'جاري التجهيز',out_for_delivery:'خرج للتوصيل',completed:'تم التسليم',cancelled:'تم الإلغاء'};
  const paymentLabels = {pending:'في انتظار تأكيد الدفع',reserved:'تم حجز الطلب',paid:'تم الدفع',cash_on_delivery:'الدفع عند الاستلام',cancelled:'تم إلغاء الدفع',refunded:'تم رد المبلغ'};
  const returnLabels = {pending:'قيد المراجعة',approved:'تمت الموافقة',rejected:'مرفوض',received:'تم استلام المنتج',refunded:'تم رد المبلغ',replaced:'تم الاستبدال',closed:'مغلق'};

  function ensureIds(){
    let visitorId=localStorage.getItem('tech_store_vid');
    if(!visitorId){visitorId='vid_'+(window.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now());localStorage.setItem('tech_store_vid',visitorId);}
    let sessionId=sessionStorage.getItem('tech_store_session_id');
    if(!sessionId){sessionId='sid_'+(window.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now());sessionStorage.setItem('tech_store_session_id',sessionId);sessionStorage.setItem('tech_store_session_landing',location.pathname+location.search);}
    return {visitorId,sessionId};
  }
  function event(type, extra={}){
    try{
      const ids=ensureIds();
      const payload={...ids,type,path:location.pathname+location.search,...extra};
      fetch('/api/analytics/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
      const metaBase={currency:'EGP'};
      if(type==='product_view') window.trackMetaEvent?.('ViewContent',{...metaBase,content_ids:extra.productId?[String(extra.productId)]:[],content_name:extra.productTitle||'',content_type:'product',value:Number(extra.value)||0});
      else if(type==='add_to_cart') window.trackMetaEvent?.('AddToCart',{...metaBase,content_ids:extra.productId?[String(extra.productId)]:[],content_name:extra.productTitle||'',content_type:'product',value:Number(extra.value)||0});
      else if(type==='checkout_started') window.trackMetaEvent?.('InitiateCheckout',{...metaBase,value:Number(extra.value)||0});
      else if(type==='order_submitted') window.trackMetaEvent?.('Lead',{...metaBase,value:Number(extra.value)||0,order_id:extra.orderNumber||''});
      else if(type==='order_completed') window.trackMetaEvent?.('Purchase',{...metaBase,value:Number(extra.value)||0,order_id:extra.orderNumber||''});
      else if(type==='whatsapp_click') window.trackMetaEvent?.('Contact',{content_name:'WhatsApp'});
    }catch(_){ }
  }
  window.v9TrackEvent=event;

  let cartTimer=null;
  function cartItems(){return state()?.getCart?.()||[];}
  function syncCart(stage='cart'){
    clearTimeout(cartTimer);
    cartTimer=setTimeout(()=>{
      try{
        const ids=ensureIds();const items=cartItems().map(i=>({productId:i._id,title:i.title,variant:i.variantValue||'',quantity:Number(i.quantity)||1,price:Number(i.price)||0}));
        const customerName=document.getElementById('customerName')?.value.trim()||'';const phone=document.getElementById('customerPhone')?.value.trim()||'';
        fetch('/api/analytics/cart-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...ids,stage,customerName,phone,items}),keepalive:true}).catch(()=>{});
      }catch(_){ }
    },700);
  }
  window.v9SyncCart=syncCart;

  function wrapFunction(name, after){
    const original=window[name];if(typeof original!=='function'||original.__v9Wrapped)return;
    const wrapped=function(...args){const out=original.apply(this,args);try{after?.(args,out);}catch(_){}return out;};wrapped.__v9Wrapped=true;wrapped.__v9Original=original;window[name]=wrapped;
  }

  function bindCommerceTracking(){
    wrapFunction('openProductModal', ([id])=>{const p=(state()?.getProducts?.()||[]).find(x=>String(x._id)===String(id));event('product_view',{productId:id,productTitle:p?.title||'',value:Number(p?.price)||0});});
    wrapFunction('addToCart', ()=>{syncCart('cart');});
    wrapFunction('removeFromCart', ()=>{event('remove_from_cart');syncCart('cart');});
    wrapFunction('updateCartQuantity', ()=>syncCart('cart'));
    wrapFunction('openCartSidebar', ()=>{if(cartItems().length){event('checkout_started',{value:cartItems().reduce((a,i)=>a+(Number(i.price)||0)*(Number(i.quantity)||0),0)});syncCart('checkout');setTimeout(bindCheckoutFields,100);}});
  }

  let contactTracked=false;
  function bindCheckoutFields(){
    ['customerName','customerPhone','customerAddress','v8Governorate','v8Area'].forEach(id=>{
      const el=document.getElementById(id);if(!el||el.dataset.v9Bound==='1')return;el.dataset.v9Bound='1';el.addEventListener('input',()=>{const name=document.getElementById('customerName')?.value.trim()||'';const phone=document.getElementById('customerPhone')?.value.trim()||'';if(!contactTracked&&(name||phone)){contactTracked=true;event('checkout_contact');}syncCart(name||phone?'contact':'checkout');});el.addEventListener('change',()=>syncCart('checkout'));
    });
  }

  function printInvoice(order){
    if(!order?.posInvoiceId){alert('الفاتورة غير متاحة حتى يتم إنشاء فاتورة البيع من Technology POS.');return;}
    const items=(order.items||[]).map(i=>`<tr><td>${esc(i.title)}${i.variant?`<small>${esc(i.variant)}</small>`:''}</td><td>${i.quantity}</td><td>${money(i.price)}</td><td>${money((Number(i.price)||0)*(Number(i.quantity)||0))}</td></tr>`).join('');
    const w=window.open('','_blank','noopener,noreferrer,width=900,height=900');if(!w)return;
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${esc(order.posInvoiceId)}</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:32px;color:#111}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:18px;margin-bottom:24px}h1{margin:0;font-size:26px}.muted{color:#666;font-size:12px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border-bottom:1px solid #ddd;padding:10px;text-align:right}td small{display:block;color:#666;margin-top:4px}.totals{margin-right:auto;width:min(360px,100%)}.totals div{display:flex;justify-content:space-between;padding:8px 0}.total{font-size:20px;font-weight:bold;border-top:2px solid #111}.badge{display:inline-block;padding:5px 10px;border-radius:20px;background:#eee}@media print{button{display:none}}</style></head><body><header><div><h1>TECHNOLOGY STORE</h1><div class="muted">فاتورة بيع صادرة من Technology POS</div></div><div><b>فاتورة ${esc(order.posInvoiceId)}</b><br><span class="muted">طلب الموقع: ${esc(order.orderNumber)}</span><br><span class="muted">${new Date(order.invoiceCreatedAt||order.createdAt).toLocaleString('ar-EG')}</span></div></header><p><span class="badge">${esc(statusLabels[order.status]||order.status)}</span></p><table><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items}</tbody></table><div class="totals"><div><span>الشحن</span><b>${money(order.shippingAmount)}</b></div><div><span>الخصم</span><b>${money(order.discountAmount)}</b></div><div class="total"><span>الإجمالي</span><b>${money(order.total)}</b></div></div><p class="muted">تم تأكيد هذه الفاتورة بواسطة Technology POS. حالة الدفع: ${esc(paymentLabels[order.paymentStatus]||order.paymentStatus||'في انتظار التأكيد')}.</p><button onclick="print()">طباعة</button><script>setTimeout(()=>print(),350)<\/script></body></html>`);w.document.close();
  }

  function openReturnForm(order,phone){
    document.getElementById('v9ReturnModal')?.remove();
    const m=document.createElement('div');m.id='v9ReturnModal';m.className='v8-overlay';
    m.innerHTML=`<div class="v8-backdrop"></div><section class="v8-sheet v9-return-sheet"><header><div><small>خدمة ما بعد البيع</small><h3>طلب استبدال أو استرجاع</h3></div><button class="v9-close">×</button></header><div class="v9-return-order"><b>${esc(order.orderNumber)}</b><span>${money(order.total)}</span></div><div class="v8-checkout-grid"><select id="v9ReturnType"><option value="exchange">استبدال</option><option value="return">استرجاع</option></select><select id="v9ReturnReason"><option value="">اختر السبب</option><option>المنتج غير مطابق</option><option>مشكلة أو عيب في المنتج</option><option>تم استلام منتج مختلف</option><option>تغيير الرأي</option><option>سبب آخر</option></select><textarea id="v9ReturnDetails" placeholder="اكتب تفاصيل تساعدنا على مراجعة طلبك"></textarea></div><div class="v9-return-items"><strong>المنتجات</strong>${(order.items||[]).map((i,idx)=>`<label><input type="checkbox" value="${idx}" checked> <span>${esc(i.title)}${i.variant?` — ${esc(i.variant)}`:''}</span><small>x${i.quantity}</small></label>`).join('')}</div><button id="v9ReturnSubmit" class="v8-primary-btn">إرسال الطلب</button><p class="v8-muted">سيتم إنشاء رقم متابعة مستقل لطلب الاستبدال/الاسترجاع.</p></section>`;
    document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v8-backdrop').onclick=close;m.querySelector('.v9-close').onclick=close;
    document.getElementById('v9ReturnSubmit').onclick=async()=>{const type=document.getElementById('v9ReturnType').value,reason=document.getElementById('v9ReturnReason').value,details=document.getElementById('v9ReturnDetails').value.trim(),items=[...m.querySelectorAll('.v9-return-items input:checked')].map(x=>({index:Number(x.value)}));if(!reason){state()?.showToast?.('اختر سبب الطلب');return;}const btn=document.getElementById('v9ReturnSubmit');btn.disabled=true;try{event('return_started',{orderNumber:order.orderNumber});const r=await fetch('/api/returns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNumber:order.orderNumber,phone,type,reason,details,items})});const d=await r.json();if(!r.ok)throw new Error(d.message||'تعذر إرسال الطلب');m.querySelector('.v9-return-sheet').innerHTML=`<div class="v9-return-success"><span class="material-symbols-outlined">assignment_turned_in</span><h3>تم استلام طلبك</h3><p>رقم المتابعة</p><code>${esc(d.returnNumber)}</code><button class="v8-primary-btn" onclick="document.getElementById('v9ReturnModal')?.remove()">تم</button></div>`;}catch(e){alert(e.message);}finally{btn.disabled=false;}};
  }

  function openReturnTracking(){
    document.getElementById('v9ReturnTrack')?.remove();const m=document.createElement('div');m.id='v9ReturnTrack';m.className='v8-overlay';m.innerHTML=`<div class="v8-backdrop"></div><section class="v8-sheet v8-track-sheet"><header><div><small>خدمة ما بعد البيع</small><h3>تتبع استبدال / استرجاع</h3></div><button class="v9-close">×</button></header><div class="v8-checkout-grid"><input id="v9ReturnNumber" dir="ltr" placeholder="رقم RET-..."><input id="v9ReturnPhone" dir="ltr" placeholder="رقم الهاتف"></div><button id="v9ReturnTrackBtn" class="v8-primary-btn">عرض الحالة</button><div id="v9ReturnTrackResult"></div></section>`;document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v8-backdrop').onclick=close;m.querySelector('.v9-close').onclick=close;document.getElementById('v9ReturnTrackBtn').onclick=async()=>{const n=document.getElementById('v9ReturnNumber').value.trim(),p=document.getElementById('v9ReturnPhone').value.trim(),out=document.getElementById('v9ReturnTrackResult');if(!n||!p){out.innerHTML='<p class="v8-error">أدخل رقم الطلب والهاتف.</p>';return;}try{const r=await fetch(`/api/returns/track?returnNumber=${encodeURIComponent(n)}&phone=${encodeURIComponent(p)}`);const d=await r.json();if(!r.ok)throw new Error(d.message);out.innerHTML=`<div class="v8-track-card"><div class="v8-track-head"><strong>${esc(d.returnNumber)}</strong><b>${esc(d.type==='exchange'?'استبدال':'استرجاع')}</b></div><div class="v8-timeline">${(d.history||[]).map((h,i)=>`<div class="${i===(d.history||[]).length-1?'active':''}"><span></span><p><strong>${esc(returnLabels[h.status]||h.status)}</strong><small>${h.at?new Date(h.at).toLocaleString('ar-EG'):''}${h.note?` — ${esc(h.note)}`:''}</small></p></div>`).join('')}</div></div>`;}catch(e){out.innerHTML=`<p class="v8-error">${esc(e.message||'تعذر التتبع')}</p>`;}};
  }

  function installOrderTrackingV9(){
    window.openOrderTracking=function(orderNumber='',phone=''){
      document.getElementById('v8OrderTrack')?.remove();
      const m=document.createElement('div');m.id='v8OrderTrack';m.className='v8-overlay';m.innerHTML=`<div class="v8-backdrop"></div><section class="v8-sheet v8-track-sheet"><header><div><small>متابعة حالة الشحنة</small><h3>تتبع طلبك</h3></div><button class="v9-close">×</button></header><div class="v8-checkout-grid"><input id="v8TrackNumber" dir="ltr" placeholder="رقم الطلب" value="${esc(orderNumber)}"><input id="v8TrackPhone" dir="ltr" placeholder="رقم الهاتف" value="${esc(phone)}"></div><button id="v8TrackSubmit" class="v8-primary-btn">عرض حالة الطلب</button><button id="v9TrackReturn" class="v9-link-btn">لدي رقم استبدال/استرجاع</button><div id="v8TrackResult"></div></section>`;document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v8-backdrop').onclick=close;m.querySelector('.v9-close').onclick=close;document.getElementById('v9TrackReturn').onclick=()=>{close();openReturnTracking();};
      document.getElementById('v8TrackSubmit').onclick=async()=>{const n=document.getElementById('v8TrackNumber').value.trim(),p=document.getElementById('v8TrackPhone').value.trim(),out=document.getElementById('v8TrackResult');if(!n||!p){out.innerHTML='<p class="v8-error">أدخل رقم الطلب والهاتف.</p>';return;}out.innerHTML='<p class="v8-muted">جاري التحميل...</p>';try{const r=await fetch(`/api/orders/track?orderNumber=${encodeURIComponent(n)}&phone=${encodeURIComponent(p)}`);const d=await r.json();if(!r.ok)throw new Error(d.message||'الطلب غير موجود');const hist=(d.statusHistory?.length?d.statusHistory:[{status:d.status,at:d.createdAt}]);out.innerHTML=`<div class="v8-track-card"><div class="v8-track-head"><strong>${esc(d.orderNumber)}</strong><b>${money(d.total)}</b></div><div class="v101-shipping-track"><div><small>حالة البيع</small><strong>${d.posInvoiceId?'تم إنشاء الفاتورة':'في انتظار فاتورة Technology POS'}</strong></div><div><small>حالة الدفع</small><strong>${esc(paymentLabels[d.paymentStatus]||d.paymentStatus||'في انتظار التأكيد')}</strong></div>${d.posInvoiceId?`<div><small>رقم الفاتورة</small><strong dir="ltr">${esc(d.posInvoiceId)}</strong></div>`:''}</div>${(d.shippingCarrier||d.trackingNumber)?`<div class="v101-shipping-track"><div><small>شركة الشحن</small><strong>${esc(d.shippingCarrier||'—')}</strong></div><div><small>رقم التتبع</small><strong dir="ltr">${esc(d.trackingNumber||'—')}</strong></div>${d.estimatedDeliveryAt?`<div><small>التسليم المتوقع</small><strong>${new Date(d.estimatedDeliveryAt).toLocaleDateString('ar-EG')}</strong></div>`:''}${d.trackingUrl?`<a href="${esc(d.trackingUrl)}" target="_blank" rel="noopener">فتح رابط شركة الشحن</a>`:''}</div>`:''}<div class="v8-timeline">${hist.map((h,i)=>`<div class="${i===hist.length-1?'active':''}"><span></span><p><strong>${esc(statusLabels[h.status]||h.status)}</strong><small>${h.at?new Date(h.at).toLocaleString('ar-EG'):''}${h.note?` — ${esc(h.note)}`:''}</small></p></div>`).join('')}</div>${d.posInvoiceId?`<div class="v9-order-care"><button id="v9PrintInvoice"><span class="material-symbols-outlined">print</span> فاتورة البيع</button>${d.status!=='cancelled'?'<button id="v9StartReturn"><span class="material-symbols-outlined">assignment_return</span> استبدال / استرجاع</button>':''}</div>`:'<p class="v8-muted">سيظهر رقم الفاتورة وخيارات ما بعد البيع هنا بعد تنفيذ الفاتورة داخل Technology POS.</p>'}</div>`;document.getElementById('v9PrintInvoice')?.addEventListener('click',()=>printInvoice(d));document.getElementById('v9StartReturn')?.addEventListener('click',()=>openReturnForm(d,p));}catch(err){out.innerHTML=`<p class="v8-error">${esc(err.message)}</p>`;}};
      if(orderNumber&&phone)setTimeout(()=>document.getElementById('v8TrackSubmit')?.click(),50);
    };
  }

  function bindShareAndWhatsApp(){
    document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const href=a.getAttribute('href')||'';if(/wa\.me|whatsapp/i.test(href))event('whatsapp_click');if(/facebook\.com\/sharer|t\.me\/share|share_source/i.test(href))event('share',{metadata:{href:href.slice(0,300)}});},{passive:true});
  }

  document.addEventListener('DOMContentLoaded',()=>{
    // V9 intentionally has no tracking/privacy popup. Tracking is first-party and non-intrusive.
    ensureIds();event('page_view');
    setTimeout(()=>{bindCommerceTracking();bindCheckoutFields();installOrderTrackingV9();syncCart('cart');},350);
    bindShareAndWhatsApp();
    const mo=new MutationObserver(()=>bindCheckoutFields());mo.observe(document.body,{childList:true,subtree:true});setTimeout(()=>mo.disconnect(),15000);
  });
})();
