const API_URL = '/api/products';
let globalProducts = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 50;
let activeCategory = "all";
let activeSearchTerm = "";
let cart = JSON.parse(localStorage.getItem('tech_store_cart')) || [];

// جلب المنتجات وتفعيل البحث
async function fetchProducts() {
    try {
        const response = await fetch(API_URL);
        globalProducts = await response.json();

        // إنشاء فلاتر الأقسام ديناميكياً بناءً على الأقسام المركزية
        await renderDynamicCategoryFilters();

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
        const res = await fetch('/api/categories');
        const data = await res.json();
        const apiCategories = Array.isArray(data) ? data.map(c => c.name) : [];
        uniqueCategories = [...new Set([...apiCategories, ...productCategories])];
    } catch(err) {
        uniqueCategories = productCategories;
    }

    // أيقونات الأقسام الافتراضية
    const iconMap = {
        'أنظمة مراقبة': 'videocam',
        'شبكات': 'router',
        'تجميعات كمبيوتر': 'computer',
        'لاب توبات': 'laptop_mac',
        'شاشات': 'monitor',
        'إكسسوارات': 'mouse',
        'اكسسوارات': 'mouse',
        'خدمات صيانة': 'build',
        'أخرى': 'more_horiz'
    };
    
    const getIcon = (cat) => iconMap[cat] || 'category';

    // 1. رندرة القائمة الجانبية (شاشات الكمبيوتر)
    if (sidebar) {
        let html = `
            <button class="filter-btn active flex w-full items-center gap-3 p-3 rounded-lg bg-primary/10 text-primary border-r-4 border-primary hover:border-primary/40 transition-all duration-200 text-lg" data-category="all">
                <span class="material-symbols-outlined text-[24px]" style="font-variation-settings: 'FILL' 1, 'wght' 400;">grid_view</span> عرض الكل
            </button>
        `;
        uniqueCategories.forEach(cat => {
            html += `
                <button class="filter-btn flex w-full items-center gap-3 p-3 rounded-lg text-on-surface-variant hover:bg-surface-variant/50 hover:border-primary/40 transition-all duration-200 text-lg" data-category="${cat}">
                    <span class="material-symbols-outlined text-[24px]" style="font-variation-settings: 'FILL' 0, 'wght' 300;">${getIcon(cat)}</span> ${cat}
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
function renderProducts(categoryFilter = "all", searchTerm = "") {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    grid.innerHTML = '';

    // إعادة التعيين للصفحة 1 إذا تغير الفلتر أو كلمة البحث
    if (activeCategory !== categoryFilter || activeSearchTerm !== searchTerm) {
        activeCategory = categoryFilter;
        activeSearchTerm = searchTerm;
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
    if (categoryFilter !== "all") {
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

    // حساب الصفحات
    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    // قطع المنتجات الخاصة بالصفحة الحالية (Pagination Slice)
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageProducts = filtered.slice(start, end);

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center; width:100%; color:#94a3b8;">لا توجد منتجات مطابقة للبحث.</p>';
        updatePaginationControls(0);
        return;
    }

    pageProducts.forEach((p, index) => {
        const specsHtml = p.description.map(spec => `<li class="flex gap-2 items-start"><span class="text-primary mt-1">•</span><span>${spec}</span></li>`).join('');
        const priceDisplay = isNaN(p.price) ? p.price : `${p.price} ج.م`;
        
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

        const whatsappLink = `https://wa.me/201515664919?text=أريد الاستفسار عن منتج: ${encodeURIComponent(p.title)}`;

        const optimizedImage = p.image ? p.image.replace('/upload/', '/upload/q_auto,f_auto,w_600/') : '';
        const loadingAttr = index < 4 ? 'eager' : 'lazy';

        const cardHtml = `
            <article class="glass-panel rounded-xl overflow-hidden flex flex-col card-hover-effect transition-all duration-300 group ${isOutOfStock ? 'opacity-70' : ''}">
                <div class="relative aspect-video bg-gradient-to-b from-surface-container-highest to-surface flex items-center justify-center overflow-hidden cursor-pointer" onclick="openProductModal('${p._id}')">
                    <img alt="${p.title}" loading="${loadingAttr}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${optimizedImage}">
                    ${availabilityBadge}
                </div>
                <div class="p-3 md:p-5 flex flex-col flex-1">
                    <span class="text-on-surface-variant text-[9px] md:text-[10px] font-mono-data tracking-wider uppercase mb-1">${p.category}</span>
                    <h3 class="font-headline-md text-sm md:text-lg text-on-surface leading-tight mb-2 md:mb-3 line-clamp-2 cursor-pointer hover:text-primary transition-colors" onclick="openProductModal('${p._id}')">${p.title}</h3>
                    <ul class="hidden md:flex text-xs text-on-surface-variant mb-4 flex-col gap-1.5 flex-1">${specsHtml}</ul>
                    
                    <div class="mt-auto pt-3 md:pt-4 flex flex-col gap-2 border-t border-outline-variant/30">
                        <div class="flex items-center justify-between gap-2">
                            <span class="font-display-lg text-base md:text-xl text-primary text-glow font-bold">${priceDisplay}</span>
                            <button onclick="shareProduct('${p.title}', '${p.price}', '${window.location.origin}/products.html?id=${p._id}')" class="text-on-surface-variant hover:text-primary transition-colors p-1.5 bg-surface rounded-full border border-outline-variant/30 shrink-0" title="مشاركة">
                                <span class="material-symbols-outlined text-[16px] sm:text-[18px]">share</span>
                            </button>
                        </div>
                        <div class="grid grid-cols-2 gap-1.5 sm:gap-2">
                            <button onclick="addToCart('${p._id}'); event.stopPropagation();" class="${!isOutOfStock ? 'bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary' : 'bg-primary/10 border border-primary/10 text-primary/40 pointer-events-none'} rounded py-2 px-1.5 text-[11px] md:text-xs font-bold transition-all flex items-center justify-center gap-1" title="أضف للسلة">
                                <span class="material-symbols-outlined text-[14px] md:text-[16px]">add_shopping_cart</span>
                                <span class="whitespace-nowrap">أضف للسلة</span>
                            </button>
                            <a href="${whatsappLink}" target="_blank" onclick="event.stopPropagation();" class="${!isOutOfStock ? 'btn-modern-green' : 'btn-modern-green opacity-50 pointer-events-none'} !py-2 !px-1.5 flex items-center justify-center gap-1 text-[11px] md:text-xs rounded" title="استفسر">
                                <span class="font-bold">استفسر</span>
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

    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    
    if (totalPages <= 1) {
        controls.innerHTML = '';
        controls.classList.add('hidden');
        return;
    }
    controls.classList.remove('hidden');

    let html = `
        <button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} class="w-10 h-10 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface hover:bg-primary/20 hover:text-primary transition-all disabled:opacity-50 disabled:pointer-events-none" title="الصفحة السابقة">
            <span class="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
        <span class="text-sm font-bold text-on-surface-variant font-mono-data">صفحة ${currentPage} / ${totalPages}</span>
        <button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} class="w-10 h-10 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface hover:bg-primary/20 hover:text-primary transition-all disabled:opacity-50 disabled:pointer-events-none" title="الصفحة التالية">
            <span class="material-symbols-outlined text-[20px]">chevron_left</span>
        </button>
    `;
    controls.innerHTML = html;
}

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
                    <span class="material-symbols-outlined">close</span>
                </button>

                <!-- Image Section -->
                <div class="w-full md:w-1/2 bg-gradient-to-b from-surface-container-highest to-surface p-6 flex flex-col justify-center items-center min-h-[300px] border-b md:border-b-0 md:border-l border-outline-variant/30 relative">
                    <img id="modalImage" src="" alt="Product Image" class="mx-auto block object-contain max-h-[300px] w-full drop-shadow-2xl mb-4 transition-opacity duration-200">
                    <div id="modalBadge" class="absolute top-6 right-6 z-10"></div>
                    <!-- Image Gallery -->
                    <div id="modalImageGallery" class="flex flex-wrap justify-center gap-2 mt-auto w-full px-4"></div>
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
                                <span class="material-symbols-outlined">add_shopping_cart</span>
                                أضف للسلة
                            </button>
                            <a id="modalWhatsappBtn" href="#" target="_blank" class="flex-1 btn-modern-green flex items-center justify-center gap-2 text-sm md:text-base font-bold py-3 !rounded-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>
                                استفسر الآن
                            </a>
                        </div>
                        <button id="modalShareBtn" class="w-full py-3 bg-surface-container border border-outline-variant/50 text-on-surface hover:text-primary rounded-lg transition-colors flex items-center justify-center gap-2 text-sm">
                            <span class="material-symbols-outlined">share</span>
                            مشاركة رابط المنتج
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.openProductModal = function(id) {
    const p = globalProducts.find(prod => prod._id === id);
    if (!p) return;

    document.getElementById('modalImage').src = p.image;
    document.getElementById('modalImage').style.opacity = 1;
    document.getElementById('modalCategory').textContent = p.category;
    document.getElementById('modalTitle').textContent = p.title;
    document.getElementById('modalPrice').textContent = isNaN(p.price) ? p.price : `${p.price} ج.م`;
    
    // Render Image Gallery
    const galleryContainer = document.getElementById('modalImageGallery');
    if (galleryContainer) {
        galleryContainer.innerHTML = '';
        
        // Add main image to gallery
        const mainImgBtn = document.createElement('button');
        mainImgBtn.className = 'w-14 h-14 rounded-lg overflow-hidden border-2 border-primary transition-all opacity-100 hover:opacity-100';
        mainImgBtn.innerHTML = `<img src="${p.image}" class="w-full h-full object-cover">`;
        mainImgBtn.onclick = () => {
            const mainImageEl = document.getElementById('modalImage');
            mainImageEl.style.opacity = 0;
            setTimeout(() => {
                mainImageEl.src = p.image;
                mainImageEl.style.opacity = 1;
            }, 150);
            updateActiveGalleryImage(mainImgBtn);
        };
        galleryContainer.appendChild(mainImgBtn);

        // Add additional images
        if (p.additionalImages && p.additionalImages.length > 0) {
            p.additionalImages.forEach(img => {
                const btn = document.createElement('button');
                btn.className = 'w-14 h-14 rounded-lg overflow-hidden border-2 border-transparent transition-all opacity-60 hover:opacity-100';
                btn.innerHTML = `<img src="${img.url}" class="w-full h-full object-cover">`;
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
    }
    
    const specsHtml = p.description.map(spec => `<li class="flex gap-2"><span class="text-primary">•</span><span>${spec}</span></li>`).join('');
    document.getElementById('modalSpecs').innerHTML = specsHtml;

    // Extra Details (SKU, Brand, Warranty)
    const extraDetailsContainer = document.getElementById('modalExtraDetails');
    let extraHtml = '';
    if (p.brand) extraHtml += `<div class="flex flex-col"><span class="text-on-surface-variant text-xs mb-0.5">العلامة التجارية</span><span class="font-bold text-on-surface">${p.brand}</span></div>`;
    if (p.sku) extraHtml += `<div class="flex flex-col"><span class="text-on-surface-variant text-xs mb-0.5">رقم الموديل (SKU)</span><span class="font-bold text-on-surface font-mono-data">${p.sku}</span></div>`;
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
        <span class="material-symbols-outlined text-[28px]">shopping_cart</span>
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
                    <span class="material-symbols-outlined text-3xl">shopping_cart</span>
                    <h2 class="font-headline-md text-2xl">عربة التسوق</h2>
                </div>
                <button onclick="closeCartSidebar()" class="w-10 h-10 bg-surface-variant/80 hover:bg-red-500/80 hover:text-white rounded-full flex items-center justify-center text-on-surface transition-colors">
                    <span class="material-symbols-outlined">close</span>
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
                <button onclick="checkoutWhatsApp()" class="w-full btn-modern-green !py-4 flex items-center justify-center gap-2 text-lg !rounded-xl">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>
                    إرسال الطلب عبر واتساب
                </button>
                <p class="text-center text-on-surface-variant/60 text-xs mt-3">سيتم توجيهك لواتساب لإتمام الطلب</p>
            </div>
        </div>
        
        <!-- Toast Notification -->
        <div id="toastNotification" class="fixed top-20 right-1/2 translate-x-1/2 z-[110] bg-surface-container border border-primary/30 text-primary px-6 py-3 rounded-full shadow-lg transition-all duration-300 transform -translate-y-full opacity-0 flex items-center gap-2 pointer-events-none">
            <span class="material-symbols-outlined text-[20px]">check_circle</span>
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
                <span class="material-symbols-outlined text-[64px] mb-4">remove_shopping_cart</span>
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
                <div class="flex items-center gap-2 bg-surface-container p-1 rounded-lg border border-outline-variant/30 shrink-0">
                    <button onclick="updateCartQuantity('${item._id}', -1)" class="w-6 h-6 flex items-center justify-center text-on-surface hover:text-error transition-colors bg-surface rounded">
                        <span class="material-symbols-outlined text-[16px] font-bold">remove</span>
                    </button>
                    <span class="text-sm font-bold font-mono-data w-5 text-center">${item.quantity}</span>
                    <button onclick="updateCartQuantity('${item._id}', 1)" class="w-6 h-6 flex items-center justify-center text-on-surface hover:text-green-400 transition-colors bg-surface rounded">
                        <span class="material-symbols-outlined text-[16px] font-bold">add</span>
                    </button>
                </div>
                <button onclick="removeFromCart('${item._id}')" class="text-error hover:text-red-400 transition-colors p-2 shrink-0 bg-error/10 hover:bg-error/20 rounded-lg" title="حذف">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
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