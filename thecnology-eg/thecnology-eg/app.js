const API_URL = '/api/products';
let globalProducts = [];

// جلب المنتجات وتفعيل البحث
async function fetchProducts() {
    try {
        const response = await fetch(API_URL);
        globalProducts = await response.json();

        const urlParams = new URLSearchParams(window.location.search);
        const initialSearch = urlParams.get('q');
        const initialId = urlParams.get('id');

        if (initialId) {
            // عرض منتج محدد عبر ID
            globalProducts = globalProducts.filter(p => p._id === initialId);
            renderProducts();
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

// عرض المنتجات (مع دعم البحث والتصنيف)
function renderProducts(categoryFilter = "all", searchTerm = "") {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    grid.innerHTML = '';

    let filtered = categoryFilter === "all" ? globalProducts : globalProducts.filter(p => p.category === categoryFilter);

    if (searchTerm) {
        filtered = filtered.filter(p => p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.description.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center; width:100%; color:#94a3b8;">لا توجد منتجات مطابقة للبحث.</p>';
        return;
    }

    filtered.forEach(p => {
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

        const cardHtml = `
            <article class="glass-panel rounded-xl overflow-hidden flex flex-col card-hover-effect transition-all duration-300 group ${isOutOfStock ? 'opacity-70' : ''}">
                <div class="relative aspect-video bg-gradient-to-b from-surface-container-highest to-surface flex items-center justify-center overflow-hidden cursor-pointer" onclick="openProductModal('${p._id}')">
                    <img alt="${p.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 mix-blend-screen" src="${p.image}">
                    ${availabilityBadge}
                </div>
                <div class="p-3 md:p-5 flex flex-col flex-1">
                    <span class="text-on-surface-variant text-[9px] md:text-[10px] font-mono-data tracking-wider uppercase mb-1">${p.category}</span>
                    <h3 class="font-headline-md text-sm md:text-lg text-on-surface leading-tight mb-2 md:mb-3 line-clamp-2 cursor-pointer hover:text-primary transition-colors" onclick="openProductModal('${p._id}')">${p.title}</h3>
                    <ul class="hidden md:flex text-xs text-on-surface-variant mb-4 flex-col gap-1.5 flex-1">${specsHtml}</ul>
                    
                    <div class="mt-auto pt-3 md:pt-4 flex items-end justify-between border-t border-outline-variant/30 gap-2">
                        <div class="flex flex-col">
                            <span class="font-display-lg text-base md:text-xl text-primary text-glow font-bold">${priceDisplay}</span>
                        </div>
                        <div class="flex items-center gap-1 sm:gap-2">
                            <button onclick="shareProduct('${p.title}', '${p.price}', '${window.location.origin}/products.html?id=${p._id}')" class="text-on-surface-variant hover:text-primary transition-colors p-1.5 sm:p-2 bg-surface rounded-full border border-outline-variant/30 shrink-0" title="مشاركة">
                                <span class="material-symbols-outlined text-[16px] sm:text-[18px]">share</span>
                            </button>
                            <a href="${whatsappLink}" target="_blank" class="${!isOutOfStock ? 'btn-modern-green' : 'btn-modern-green opacity-50 pointer-events-none'} shrink-0 whitespace-nowrap !text-[12px] md:!text-sm !px-3 md:!px-5 !py-2 flex items-center justify-center gap-1" title="استفسر">
                                <span class="font-bold">استفسر</span>
                            </a>
                        </div>
                    </div>
                </div>
            </article>
        `;
        grid.innerHTML += cardHtml;
    });
}

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
        <div id="productModal" class="fixed inset-0 z-[100] hidden items-center justify-center p-4 sm:p-6 opacity-0 transition-opacity duration-300">
            <!-- Overlay -->
            <div class="absolute inset-0 bg-background/80 backdrop-blur-md cursor-pointer" onclick="closeProductModal()"></div>
            
            <!-- Modal Content -->
            <div class="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto glass-panel rounded-2xl border border-primary/20 shadow-2xl flex flex-col md:flex-row transform scale-95 transition-transform duration-300" id="productModalContent">
                
                <!-- Close Button -->
                <button onclick="closeProductModal()" class="absolute top-4 left-4 z-10 w-10 h-10 bg-surface-variant/80 hover:bg-red-500/80 hover:text-white rounded-full flex items-center justify-center text-on-surface transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>

                <!-- Image Section -->
                <div class="w-full md:w-1/2 bg-gradient-to-b from-surface-container-highest to-surface p-6 flex items-center justify-center min-h-[300px] border-b md:border-b-0 md:border-l border-outline-variant/30 relative">
                    <img id="modalImage" src="" alt="Product Image" class="max-w-full max-h-[400px] object-contain drop-shadow-2xl mix-blend-screen">
                    <div id="modalBadge" class="absolute top-6 right-6"></div>
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

                    <div class="flex gap-3 mt-auto pt-4 border-t border-outline-variant/30">
                        <a id="modalWhatsappBtn" href="#" target="_blank" class="flex-1 btn-modern-green flex items-center justify-center gap-2 text-sm md:text-base font-bold py-3">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>
                            استفسر الآن
                        </a>
                        <button id="modalShareBtn" class="px-4 py-3 bg-surface-container border border-outline-variant/50 text-on-surface hover:text-primary rounded-lg transition-colors flex items-center justify-center">
                            <span class="material-symbols-outlined">share</span>
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
    document.getElementById('modalCategory').textContent = p.category;
    document.getElementById('modalTitle').textContent = p.title;
    document.getElementById('modalPrice').textContent = isNaN(p.price) ? p.price : `${p.price} ج.م`;
    
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
    if (isOutOfStock) {
        whatsappBtn.classList.add('opacity-50', 'pointer-events-none');
    } else {
        whatsappBtn.classList.remove('opacity-50', 'pointer-events-none');
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

    // تشغيل الفلاتر (الأقسام)
    const filters = document.querySelectorAll('.filter-btn');
    filters.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filters.forEach(f => f.classList.remove('active'));
            e.target.classList.add('active');
            const searchBox = document.querySelector('input[placeholder="ابحث في الكتالوج..."]');
            renderProducts(e.target.dataset.category, searchBox ? searchBox.value.trim() : "");
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