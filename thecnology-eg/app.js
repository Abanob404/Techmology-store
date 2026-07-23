const BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:5000' : '';
const API_URL = `${BASE_URL}/api/products`;
let globalProducts = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 16;
let activeCategory = "all";
let activeSearchTerm = "";
let currentSort = "newest";
let cart = JSON.parse(localStorage.getItem('tech_store_cart')) || [];

window.defaultProductImage = '';

async function loadStoreSettings() {
    try {
        const response = await fetch(`${BASE_URL}/api/settings`);
        const settings = await response.json();
        if (settings && settings.defaultProductImage) {
            window.defaultProductImage = settings.defaultProductImage;
        }
    } catch (err) {
        console.error('Error loading settings:', err);
    }
}

// جلب المنتجات وتفعيل البحث
async function fetchProducts() {
    const grid = document.getElementById('productsGrid');
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
        await loadStoreSettings();
        const response = await fetch(API_URL);
        globalProducts = await response.json();

        // إنشاء فلاتر الأقسام ديناميكياً بناءً على الأقسام المركزية
        await renderDynamicCategoryFilters();

        // تفعيل فلتر الترتيب
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                currentSort = e.target.value;
                renderProducts(activeCategory, activeSearchTerm);
            });
        }

        const urlParams = new URLSearchParams(window.location.search);
        const initialSearch = urlParams.get('q');
        const initialId = urlParams.get('id');
        const initialCategory = urlParams.get('category');

        if (initialId) {
            // عرض منتج محدد عبر ID
            const singleProduct = globalProducts.find(p => p._id === initialId);
            if (singleProduct) {
                globalProducts = [singleProduct];
            }
            renderProducts();
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
            renderProducts();
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

            const searchBox = document.querySelector('input[placeholder="ابحث في الكتالوج..."]');
            renderProducts(selectedCat, searchBox ? searchBox.value.trim() : "");
        });
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

    let filtered = globalProducts;
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
                const brandMatch = (p.brand || '').toLowerCase().includes(keyword);
                const skuMatch = (p.sku || '').toLowerCase().includes(keyword);
                
                return titleMatch || descMatch || categoryMatch || brandMatch || skuMatch;
            });
        });
    }

    // الترتيب
    if (currentSort === 'price_asc') {
        filtered.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (currentSort === 'price_desc') {
        filtered.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else { // newest
        // افتراضياً السيرفر يرسل الأحدث أولاً، لكن يمكن الترتيب بناءً على تاريخ الإنشاء إذا وجد
        filtered.sort((a, b) => {
            if (a.createdAt && b.createdAt) {
                return new Date(b.createdAt) - new Date(a.createdAt);
            }
            return 0; // الحفاظ على الترتيب الأصلي (وهو الأحدث من السيرفر)
        });
    }

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

    pageProducts.forEach((p, index) => {
        const specsHtml = p.description.map(spec => `<li class="flex gap-2 items-start"><span class="text-primary mt-1">•</span><span>${spec}</span></li>`).join('');
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
            availabilityBadge = `<div class="absolute top-3 right-3 bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide shadow-lg">نفدت الكمية</div>`;
        } else if (p.stockQuantity > 0 && p.stockQuantity <= 5) {
            availabilityBadge = `<div class="absolute top-3 right-3 bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide shadow-lg">باقي ${p.stockQuantity} قطع فقط!</div>`;
        } else {
            availabilityBadge = `<div class="absolute top-3 right-3 bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide shadow-lg">متوفر</div>`;
        }

        let discountTimerHtml = '';
        if (p.discountExpiresAt && new Date(p.discountExpiresAt) > new Date()) {
            discountTimerHtml = `
                <div class="absolute bottom-2 left-1/2 -translate-x-1/2 w-[90%] bg-red-500/10 backdrop-blur border border-red-500/30 rounded-md py-1 px-2 flex justify-center shadow-[0_0_10px_rgba(239,68,68,0.2)] countdown-container" data-expires="${p.discountExpiresAt}">
                    <div class="flex gap-1 text-[11px] font-mono-data font-bold text-red-400 tracking-widest countdown-timer" dir="ltr">جاري الحساب...</div>
                </div>
            `;
        }

        const whatsappLink = `https://wa.me/201515664919?text=أريد الاستفسار عن منتج: ${encodeURIComponent(p.title)}`;

        const fallbackImage = window.defaultProductImage || './assets/no-image.svg';
        const hasValidImage = p.image && !p.image.includes('placehold.co');
        const optimizedImage = hasValidImage ? p.image.replace('/upload/', '/upload/q_auto,f_auto,w_600/') : fallbackImage;
        const loadingAttr = index < 4 && !append ? 'eager' : 'lazy';
        const priorityAttr = index < 4 && !append ? 'fetchpriority="high"' : '';
        const decodeAttr = index < 4 && !append ? 'decoding="sync"' : 'decoding="async"';

        const cardHtml = `
            <article data-aos="fade-up" class="glass-panel rounded-xl overflow-hidden flex flex-col card-hover-effect transition-all duration-300 group ${isOutOfStock ? 'opacity-70' : ''}">
                <div class="relative aspect-square w-full bg-gradient-to-b from-surface-container-highest to-surface flex items-center justify-center overflow-hidden cursor-pointer" onclick="openProductModal('${p._id}')">
                    <img alt="${p.title}" loading="${loadingAttr}" ${priorityAttr} ${decodeAttr} width="400" height="400" class="w-full h-full object-contain p-2 rounded-2xl group-hover:scale-105 transition-transform duration-500" src="${optimizedImage}">
                    ${availabilityBadge}
                    ${hasDiscount ? `<div class="absolute top-3 left-3 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">خصم ${discountPercentage}%</div>` : ''}
                    ${discountTimerHtml}
                </div>
                <div class="p-3 md:p-5 flex flex-col flex-1">
                    <span class="text-on-surface-variant text-[9px] md:text-[10px] font-mono-data tracking-wider uppercase mb-1">${p.category}</span>
                    <h3 class="font-headline-md text-sm md:text-lg text-on-surface leading-tight mb-2 md:mb-3 line-clamp-2 cursor-pointer hover:text-primary transition-colors" onclick="openProductModal('${p._id}')">${p.title}</h3>
                    <ul class="hidden md:flex text-xs text-on-surface-variant mb-4 flex-col gap-1.5 flex-1">${specsHtml}</ul>
                    
                    <div class="mt-auto pt-3 md:pt-4 flex flex-col gap-2 border-t border-outline-variant/30">
                        <div class="flex items-center justify-between gap-2">
                            ${priceHtml}
                            <button onclick="shareProduct('${p.title}', '${p.price}', '${window.location.origin}/products.html?id=${p._id}')" class="text-on-surface-variant hover:text-primary transition-colors p-2 bg-surface rounded-full border border-outline-variant/30 shrink-0" title="مشاركة">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                                </svg>
                            </button>
                        </div>
                        <div class="grid grid-cols-2 gap-1.5 sm:gap-2">
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
        grid.innerHTML += cardHtml;
    });

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

// دالة المشاركة
window.shareProduct = async (title, price, url) => {
    if (navigator.share) {
        try { await navigator.share({ title: title, text: `شوف العرض ده من Technology: ${title} بسعر ${price} ج.م!`, url: url }); }
        catch (err) { console.log('إلغاء المشاركة'); }
    } else {
        navigator.clipboard.writeText(`${title} - ${price} ج.م\\n${url}`);
        alert('تم نسخ رابط المنتج بنجاح لمشاركته!');
    }
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
            <div class="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto glass-panel rounded-2xl border border-primary/20 shadow-2xl flex flex-col md:flex-row transform scale-95 transition-transform duration-300" id="productModalContent">
                
                <!-- Close Button -->
                <button onclick="closeProductModal()" class="absolute top-4 left-4 z-10 w-10 h-10 bg-surface-variant/80 hover:bg-red-500/80 hover:text-white rounded-full flex items-center justify-center text-on-surface transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>

                <!-- Image Section -->
                <div class="w-full md:w-1/2 p-5 flex flex-col justify-center items-center min-h-[300px] border-b md:border-b-0 md:border-l border-outline-variant/30 relative">
                    <div class="w-full rounded-2xl overflow-hidden bg-surface-container-high border border-outline-variant/20 shadow-inner flex items-center justify-center aspect-square md:h-80">
                        <img id="modalImage" src="" alt="Product Image" class="mx-auto block object-contain w-full h-full p-2 rounded-2xl drop-shadow-2xl transition-opacity duration-200">
                    </div>
                    <div id="modalBadge" class="absolute top-7 right-7 z-10"></div>
                    <!-- Image Gallery -->
                    <div id="modalImageGallery" class="flex flex-wrap justify-center gap-2 mt-4 w-full px-2"></div>
                </div>

                <!-- Details Section -->
                <div class="w-full md:w-1/2 p-6 md:p-8 flex flex-col">
                    <span id="modalCategory" class="text-on-surface-variant text-xs font-mono-data tracking-wider uppercase mb-2"></span>
                    <h2 id="modalTitle" class="font-headline-md text-2xl md:text-3xl text-on-surface mb-4 leading-tight"></h2>
                    <div class="text-primary font-display-lg text-3xl font-bold text-glow mb-4" id="modalPrice"></div>
                    
                    <div id="modalExtraDetails" class="grid grid-cols-2 gap-3 mb-6 bg-surface-container-high p-4 rounded-xl border border-outline-variant/30 text-sm">
                        <!-- Details injected here -->
                    </div>

                    <h4 class="text-sm font-bold text-on-surface mb-3 border-b border-outline-variant/30 pb-2">المواصفات الأساسية</h4>
                    <ul id="modalSpecs" class="flex flex-col gap-2 text-sm text-on-surface-variant mb-8 flex-1"></ul>

                    <div class="flex flex-col gap-3 mt-auto pt-4 border-t border-outline-variant/30">
                        <div class="flex gap-3">
                            <button id="modalAddToCartBtn" class="flex-1 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm md:text-base">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                                أضف للسلة
                            </button>
                            <a id="modalWhatsappBtn" href="#" target="_blank" class="flex-1 rounded-lg text-sm md:text-base font-bold py-3 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white transition-all shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>
                                استفسر الآن
                            </a>
                        </div>
                        <button id="modalShareBtn" class="w-full py-3 bg-surface-container border border-outline-variant/50 text-on-surface hover:text-primary rounded-lg transition-colors flex items-center justify-center gap-2 text-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                            مشاركة رابط المنتج
                        </button>
                        
                        <!-- Related Products -->
                        <div id="modalRelatedProducts" class="mt-8 pt-6 border-t border-outline-variant/30 hidden">
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

    const fallbackImage = window.defaultProductImage || './assets/no-image.svg';
    const hasValidImage = p.image && !p.image.includes('placehold.co');
    const finalImage = hasValidImage ? p.image : fallbackImage;
    document.getElementById('modalImage').src = finalImage;
    document.getElementById('modalImage').style.opacity = 1;
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
        mainImgBtn.className = 'w-16 h-16 rounded-xl border-2 border-primary overflow-hidden flex-shrink-0 transition-all hover:scale-105 bg-surface/50 p-0';
        mainImgBtn.innerHTML = `<img src="${finalImage}" class="w-full h-full object-cover p-1">`;
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
                btn.className = 'w-16 h-16 rounded-xl border-2 border-transparent hover:border-primary/50 overflow-hidden flex-shrink-0 transition-all hover:scale-105 bg-surface/50 p-0';
                btn.innerHTML = `<img src="${img.url}" class="w-full h-full object-cover p-1">`;
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
    
    const specsHtml = p.description.map(spec => `<li class="flex gap-2"><span class="text-primary">•</span><span>${spec}</span></li>`).join('');
    document.getElementById('modalSpecs').innerHTML = specsHtml;

    // Extra Details (SKU, Brand, Warranty)
    const extraDetailsContainer = document.getElementById('modalExtraDetails');
    let extraHtml = '';
    if (p.brand) extraHtml += `<div class="flex flex-col"><span class="text-on-surface-variant text-xs mb-0.5">العلامة التجارية</span><span class="font-bold text-on-surface">${p.brand}</span></div>`;
    if (p.sku) extraHtml += `<div class="flex flex-col"><span class="text-on-surface-variant text-xs mb-0.5">السيريال كود (SKU)</span><span class="font-bold text-on-surface font-mono-data">${p.sku}</span></div>`;
    if (p.warranty) extraHtml += `<div class="flex flex-col"><span class="text-on-surface-variant text-xs mb-0.5">الضمان</span><span class="font-bold text-on-surface">${p.warranty}</span></div>`;
    
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
    } else if (p.stockQuantity > 0 && p.stockQuantity <= 5) {
        badgeContainer.innerHTML = `<div class="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-4 py-1.5 rounded-full text-sm font-bold tracking-wide shadow-lg">باقي ${p.stockQuantity} قطع فقط!</div>`;
    } else {
        badgeContainer.innerHTML = `<div class="bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-1.5 rounded-full text-sm font-bold tracking-wide shadow-lg">متوفر</div>`;
    }

    const whatsappBtn = document.getElementById('modalWhatsappBtn');
    whatsappBtn.href = `https://wa.me/201515664919?text=أريد الاستفسار عن منتج: ${encodeURIComponent(p.title)}`;
    
    const addToCartBtn = document.getElementById('modalAddToCartBtn');
    
    if (isOutOfStock) {
        whatsappBtn.classList.add('opacity-50', 'pointer-events-none');
        addToCartBtn.classList.add('opacity-50', 'pointer-events-none');
        addToCartBtn.classList.replace('bg-primary/20', 'bg-primary/10');
        addToCartBtn.classList.replace('text-primary', 'text-primary/40');
        addToCartBtn.onclick = null;
    } else {
        whatsappBtn.classList.remove('opacity-50', 'pointer-events-none');
        addToCartBtn.classList.remove('opacity-50', 'pointer-events-none');
        addToCartBtn.classList.replace('bg-primary/10', 'bg-primary/20');
        addToCartBtn.classList.replace('text-primary/40', 'text-primary');
        addToCartBtn.onclick = () => addToCart(p._id);
    }

    const shareBtn = document.getElementById('modalShareBtn');
    shareBtn.onclick = () => shareProduct(p.title, p.price, `${window.location.origin}/products.html?id=${p._id}`);
    // Render Related Products
    const relatedContainer = document.getElementById('relatedProductsContainer');
    const relatedSection = document.getElementById('modalRelatedProducts');
    if (relatedContainer && relatedSection) {
        let related = globalProducts.filter(prod => prod.category === p.category && prod._id !== p._id);
        
        // ذكاء إضافي: إذا كان القسم "غير مصنف" أو فارغ، نبحث بأول كلمة من اسم المنتج كبديل
        if (!p.category || p.category === 'غير مصنف' || p.category === 'Uncategorized') {
            const firstWord = p.title.split(' ')[0].toLowerCase();
            related = globalProducts.filter(prod => prod._id !== p._id && prod.title.toLowerCase().includes(firstWord));
        }

        const shuffled = related.sort(() => 0.5 - Math.random()).slice(0, 4);
        if (shuffled.length > 0) {
            relatedContainer.innerHTML = shuffled.map(prod => {
                const img = (prod.image && !prod.image.includes('placehold.co')) ? prod.image : fallbackImage;
                return `
                    <div class="bg-surface-variant/30 p-2 rounded-xl flex flex-col items-center gap-2 cursor-pointer hover:bg-surface-variant/70 transition-colors border border-outline-variant/30" onclick="closeProductModal(); setTimeout(() => openProductModal('${prod._id}'), 300)">
                        <img src="${img}" class="w-16 h-16 object-contain rounded-lg">
                        <span class="text-[10px] text-center text-on-surface line-clamp-2">${prod.title}</span>
                        <span class="text-primary font-bold text-xs">${prod.price} ج.م</span>
                    </div>
                `;
            }).join('');
            relatedSection.classList.remove('hidden');
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
};

window.closeProductModal = function() {
    if (window.modalImageInterval) clearInterval(window.modalImageInterval);
    const modal = document.getElementById('productModal');
    const content = document.getElementById('productModalContent');
    
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    document.body.style.overflow = '';
    
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
};

// أيقونات السوشيال ميديا العائمة
function injectFloatingSocials() {
    const div = document.createElement('div');
    div.className = 'fixed bottom-6 left-6 z-40 flex flex-col gap-3';
    div.innerHTML = `
        <a href="https://whatsapp.com/channel/0029VbCqfLn9cDDaxSaaXg3W" target="_blank" class="w-12 h-12 bg-[#25D366] rounded-full flex items-center justify-center text-white shadow-[0_0_15px_rgba(37,211,102,0.3)] hover:scale-110 transition-transform" title="قناة الواتساب">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>
        </a>
        <a href="https://www.facebook.com/Technology.Store.cairo/" target="_blank" class="w-12 h-12 bg-[#1877F2] rounded-full flex items-center justify-center text-white shadow-[0_0_15px_rgba(24,119,242,0.3)] hover:scale-110 transition-transform" title="صفحتنا على فيسبوك">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951z"/></svg>
        </a>
    `;
    document.body.appendChild(div);
}

// ------------------ منطق السلة (Cart Logic) ------------------
function injectCartUI() {
    // أيقونة السلة العائمة
    const cartIcon = document.createElement('div');
    cartIcon.id = 'floatingCartBtn';
    cartIcon.className = 'fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 bg-primary text-on-primary rounded-full shadow-[0_0_20px_rgba(130,207,255,0.4)] hover:scale-110 transition-transform cursor-pointer';
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
        <div id="cartSidebar" class="fixed top-0 left-0 w-full max-w-md h-full bg-surface-container-highest/95 backdrop-blur-2xl border-r border-outline-variant/30 z-[100] shadow-2xl flex flex-col cart-sidebar cart-sidebar-closed">
            <div class="flex items-center justify-between p-6 border-b border-outline-variant/30">
                <div class="flex items-center gap-3 text-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    <h2 class="font-headline-md text-2xl">عربة التسوق</h2>
                </div>
                <button onclick="closeCartSidebar()" class="w-10 h-10 bg-surface-variant/80 hover:bg-red-500/80 hover:text-white rounded-full flex items-center justify-center text-on-surface transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            
            <div id="cartItemsContainer" class="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                <!-- المنتجات تضاف هنا -->
            </div>
            
            <div class="p-6 border-t border-outline-variant/30 bg-surface/50">
                <div class="flex items-center justify-between mb-4">
                    <span class="text-on-surface-variant text-lg">الإجمالي:</span>
                    <span id="cartTotalPrice" class="font-display-lg text-2xl text-primary text-glow font-bold">0 ج.م</span>
                </div>
                <button onclick="checkoutWhatsApp()" class="w-full btn-modern-green animate-pulse hover:animate-none !py-4 flex items-center justify-center gap-2 text-lg !rounded-xl">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>
                    إرسال الطلب عبر واتساب
                </button>
                <p class="text-center text-on-surface-variant/60 text-xs mt-3">سيتم توجيهك لواتساب لإتمام الطلب</p>
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
    }, 300);
}

function addToCart(productId) {
    const product = globalProducts.find(p => p._id === productId);
    if (!product) return;

    if (product.stockQuantity === 0) {
        alert("عذراً، هذا المنتج غير متوفر حالياً.");
        return;
    }

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
    const badge = document.getElementById('cartBadge');
    if (badge) {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        if (totalItems > 0) {
            badge.textContent = totalItems;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
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
        return;
    }

    let html = '';
    let total = 0;

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        html += `
            <div class="flex items-center gap-4 bg-surface/50 p-3 rounded-xl border border-outline-variant/20 hover:border-primary/20 transition-colors">
                <img src="${item.image}" alt="${item.title}" class="w-16 h-16 object-cover rounded-lg bg-surface-container shadow-md">
                <div class="flex-1 min-w-0">
                    <h4 class="text-sm font-bold text-on-surface truncate">${item.title}</h4>
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

function checkoutWhatsApp() {
    if (cart.length === 0) {
        alert("عربة التسوق فارغة.");
        return;
    }

    let message = "مرحباً، أريد إتمام طلب الشراء التالي: 🛍️\n\n";
    let grandTotal = 0;
    let totalItemsCount = 0;

    cart.forEach((item) => {
        const itemTotal = item.price * item.quantity;
        grandTotal += itemTotal;
        totalItemsCount += item.quantity;
        
        message += `📦 *${item.title}*\n`;
        message += `🔢 الكمية: ${item.quantity}\n`;
        message += `💵 السعر: ${item.price} ج.م\n\n`;
    });

    if (totalItemsCount > 1) {
        message += `➖ ➖ ➖ ➖ ➖ ➖\n`;
        message += `💰 *إجمالي الطلب: ${grandTotal} ج.م*\n`;
    }

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send/?phone=201515664919&text=${encodedMessage}`;

    // إفراغ السلة بعد التوجيه
    cart = [];
    saveCart();
    updateCartBadge();
    renderCart();
    closeCartSidebar();

    window.open(whatsappUrl, '_blank');
}

// تحميل الهوية البصرية (اللوجو والخلفية)
function loadStoreBranding() {
    const customLogo = localStorage.getItem('tech_store_logo');
    if (customLogo) {
        document.querySelectorAll('a[href="index.html"] img[alt="Technology Store"]').forEach(logoImg => {
            logoImg.src = customLogo;
            logoImg.removeAttribute('onerror'); // Prevent fallback text if custom logo fails
        });
    }

    const customBg = localStorage.getItem('tech_store_bg');
    if (customBg) {
        const heroSection = document.querySelector('.hero-banner');
        if (heroSection) {
            heroSection.style.backgroundImage = `url('${customBg}')`;
            heroSection.style.backgroundSize = 'cover';
            heroSection.style.backgroundPosition = 'center';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    injectProductModal();
    injectCartUI();
    fetchProducts();
    injectFloatingSocials();
    loadStoreBranding();

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
                    window.location.href = `products.html?q=${encodeURIComponent(e.target.value.trim())}`;
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
scrollToTopBtn.className = 'fixed bottom-24 right-6 z-40 bg-primary hover:bg-primary-dark text-white p-3 rounded-full shadow-xl transition-all duration-300 translate-y-16 opacity-0 flex items-center justify-center';
scrollToTopBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
document.body.appendChild(scrollToTopBtn);

window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
        scrollToTopBtn.classList.remove('translate-y-16', 'opacity-0');
    } else {
        scrollToTopBtn.classList.add('translate-y-16', 'opacity-0');
    }
});

