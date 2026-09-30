const BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:5000' : '';
const API_URL = `${BASE_URL}/api/products`;
const ITEMS_PER_PAGE = 20;
const nativeFetch = window.fetch.bind(window);

async function adminFetch(input, init = {}) {
    const options = { ...init };
    const headers = new Headers(options.headers || {});
    const token = sessionStorage.getItem('tech_admin_token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    options.headers = headers;
    return nativeFetch(input, options);
}
const ADMIN_IMAGE_FALLBACK = './assets/no-image.svg';

function adminSafeImageUrl(url) {
    const value = typeof url === 'string' ? url.trim() : '';
    if (!value || /placehold\.co|no-image|No\+Image/i.test(value)) return ADMIN_IMAGE_FALLBACK;
    return value;
}

window.handleAdminImageError = function(img) {
    if (!img || img.dataset.fallbackApplied === '1') return;
    img.dataset.fallbackApplied = '1';
    img.src = ADMIN_IMAGE_FALLBACK;
};

// ==========================================
// State
// ==========================================
window.adminProducts = [];
window.filteredProducts = [];
window.currentPage = 1;

// ==========================================
// Centralized Backend Authentication System
// ==========================================
let allUsersCache = [];

function getCurrentUser() {
    const userStr = sessionStorage.getItem('tech_current_user');
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch(e) {
        return null;
    }
}

async function checkAuth() {
    let user = getCurrentUser();
    const token = sessionStorage.getItem('tech_admin_token');
    if (user && token) {
        try {
            const authCheck = await adminFetch(`${BASE_URL}/api/admin/me`);
            if (!authCheck.ok) throw new Error('invalid session');
            const authData = await authCheck.json();
            user = authData.user;
            sessionStorage.setItem('tech_current_user', JSON.stringify(user));
        } catch (_) {
            sessionStorage.removeItem('tech_current_user');
            sessionStorage.removeItem('tech_admin_token');
            user = null;
        }
    }
    if (user && token) {
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('adminContainer').classList.remove('hidden');
        document.getElementById('adminContainer').style.display = 'flex';
        
        const userBadge = document.getElementById('currentUserBadge');
        if (userBadge) userBadge.textContent = `${user.username} (${user.role})`;
        
        const dashboardTab = document.getElementById('tab-dashboard');
        if (dashboardTab) dashboardTab.style.display = hasPermission('view_reports') ? 'flex' : 'none';

        const ordersTab = document.getElementById('tab-orders');
        if (ordersTab) ordersTab.style.display = hasPermission('manage_orders') ? 'flex' : 'none';

        const mediaTab = document.getElementById('tab-media');
        if (mediaTab) mediaTab.style.display = hasPermission('manage_media') ? 'flex' : 'none';

        const userMgmt = document.getElementById('tab-users');
        if (userMgmt) userMgmt.style.display = hasPermission('manage_users') ? 'flex' : 'none';

        const settingsTab = document.getElementById('tab-settings');
        if (settingsTab) settingsTab.style.display = hasPermission('manage_settings') ? 'flex' : 'none';

        const backupTab = document.getElementById('tab-backup');
        if (backupTab) backupTab.style.display = hasPermission('manage_backup') ? 'flex' : 'none';

        const analyticsTab = document.getElementById('tab-analytics');
        if (analyticsTab) analyticsTab.style.display = hasPermission('view_reports') ? 'flex' : 'none';

        const logsTab = document.getElementById('tab-logs');
        if (logsTab) logsTab.style.display = hasPermission('view_reports') ? 'flex' : 'none';

        const apiTab = document.getElementById('tab-api');
        if (apiTab) apiTab.style.display = hasPermission('manage_backup') ? 'flex' : 'none';

        const csvActionsWrapper = document.getElementById('csvActionsWrapper');
        if (csvActionsWrapper) csvActionsWrapper.style.display = hasPermission('manage_backup') ? 'flex' : 'none';

        const addProductWrapper = document.getElementById('addProductWrapper');
        if (addProductWrapper) addProductWrapper.style.display = hasPermission('add_product') ? 'block' : 'none';

        const manageCategoriesWrapper = document.getElementById('manageCategoriesWrapper');
        if (manageCategoriesWrapper) manageCategoriesWrapper.style.display = hasPermission('manage_categories') ? 'block' : 'none';

        await loadAdminProducts();
        
        loadCurrentLogo();
        loadCurrentBg();
        if (hasPermission('manage_users')) loadUsersTable();
        renderCategoriesAdminList();
        loadStoreSettings();
        
        // Initialize with the operations dashboard when permitted.
        switchTab(hasPermission('view_reports') ? 'dashboard' : 'products');
    } else {
        document.getElementById('loginContainer').style.display = 'flex';
        document.getElementById('adminContainer').style.display = 'none';
    }
}

function hasPermission(perm) {
    const user = getCurrentUser();
    if (!user) return false;
    return user.permissions.includes('all') || user.permissions.includes(perm);
}

async function login() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value.trim();

    if (!username || !password) {
        alert('يرجى إدخال اسم المستخدم وكلمة المرور');
        return;
    }

    try {
        const response = await adminFetch(`${BASE_URL}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        
        if (response.ok) {
            sessionStorage.setItem('tech_current_user', JSON.stringify(data.user));
            sessionStorage.setItem('tech_admin_token', data.token);
            checkAuth();
            showToast(`مرحباً ${data.user.username}!`);
        } else {
            alert(data.message || 'بيانات الدخول غير صحيحة!');
        }
    } catch (err) {
        console.error(err);
        alert('فشل الاتصال بالسيرفر');
    }
}
window.login = login;

function logout() {
    sessionStorage.removeItem('tech_current_user');
    sessionStorage.removeItem('tech_admin_token');
    checkAuth();
}
window.logout = logout;

// ==========================================
// Toast Notification
// ==========================================
function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3000);
}

// ==========================================
// Dynamic Categories Management via API
// ==========================================

async function fetchCategoriesAPI() {
    try {
        const response = await adminFetch(`${BASE_URL}/api/categories`);
        const data = await response.json();
        return data.map(c => c.name);
    } catch (err) {
        console.error('خطأ في جلب الأقسام من السيرفر', err);
        return [];
    }
}

async function populateCategoriesDatalist(products) {
    const datalist = document.getElementById('categoriesList');
    
    const savedCategories = await fetchCategoriesAPI();
    const categoriesFromProducts = (products || []).map(p => p.category).filter(Boolean);
    const allCategories = [...new Set([...savedCategories, ...categoriesFromProducts])];
    
    if (datalist) {
        datalist.innerHTML = allCategories.map(cat => `<option value="${cat}">`).join('');
    }

    const adminCatFilter = document.getElementById('adminCategoryFilter');
    if (adminCatFilter) {
        const currentVal = adminCatFilter.value;
        adminCatFilter.innerHTML = '<option value="">كل الأقسام</option>' + allCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        adminCatFilter.value = currentVal;
    }
}

async function renderCategoriesAdminList() {
    const container = document.getElementById('categoriesAdminList');
    if (!container) return;

    // جلب الأقسام المخزنة من السيرفر
    const savedCategories = await fetchCategoriesAPI();

    // جلب الأقسام الفعلية للمنتجات الموجودة في قاعدة البيانات وحساب عددها
    const products = window.adminProducts || [];
    const productCategoryCounts = {};
    products.forEach(p => {
        if (p.category) {
            productCategoryCounts[p.category] = (productCategoryCounts[p.category] || 0) + 1;
        }
    });

    // دمج الأقسام من السيرفر مع الأقسام الفعلية
    const allCategories = [...new Set([...savedCategories, ...Object.keys(productCategoryCounts)])];

    if (allCategories.length === 0) {
        container.innerHTML = '<div class="text-xs text-on-surface-variant text-center py-4">لا توجد أقسام مضافة بعد.</div>';
        return;
    }

    container.innerHTML = '';
    allCategories.forEach(cat => {
        const count = productCategoryCounts[cat] || 0;
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between bg-surface border border-outline-variant/30 rounded px-3 py-1.5 text-sm hover:border-primary/30 transition-colors';
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-on-surface font-semibold">${cat}</span>
                <span class="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">${count} منتج</span>
            </div>
            <div class="flex items-center gap-1">
                <button onclick="renameCategoryPrompt('${cat}')" class="text-blue-400 hover:text-blue-500 transition-colors p-1" title="تعديل اسم القسم جماعياً">
                    <span class="material-symbols-outlined text-[18px]">edit</span>
                </button>
                <button onclick="deleteCategory('${cat}')" class="text-red-400 hover:text-red-500 transition-colors p-1" title="حذف القسم">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

window.renameCategoryPrompt = async function(oldCat) {
    const newCat = prompt(`تعديل اسم القسم جماعياً:\n\nسيتم تغيير اسم القسم "${oldCat}" إلى الاسم الجديد لجميع المنتجات في الكتالوج.\n\nأدخل الاسم الجديد:`, oldCat);
    if (newCat === null) return; // تم الإلغاء
    
    const trimmedNewCat = newCat.trim();
    if (!trimmedNewCat) {
        alert('اسم القسم الجديد لا يمكن أن يكون فارغاً.');
        return;
    }

    if (trimmedNewCat === oldCat) return; // لم يتغير شيء

    // تحديث الاسم في السيرفر لجميع المنتجات المنتمية لهذا القسم وتحديث جدول الأقسام
    try {
        const response = await adminFetch(`${BASE_URL}/api/categories/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldCategory: oldCat, newCategory: trimmedNewCat })
        });

        if (response.ok) {
            const data = await response.json();
            showToast(`✅ تم تعديل القسم وتحديث ${data.modifiedCount || 0} منتج!`);
            // إعادة تحميل المنتجات لتحديث الواجهة بالكامل
            loadAdminProducts(true);
        } else {
            const error = await response.json();
            alert(`خطأ أثناء تحديث القسم: ${error.message}`);
        }
    } catch (err) {
        console.error(err);
        showToast('❌ فشل الاتصال بالسيرفر.');
    }
};

window.addNewCategory = async function() {
    const input = document.getElementById('newCategoryInput');
    const newCat = input.value.trim();
    if (!newCat) {
        showToast('⚠️ الرجاء إدخال اسم القسم أولاً.');
        return;
    }

    try {
        const response = await adminFetch(`${BASE_URL}/api/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newCat })
        });

        if (response.ok) {
            showToast('✅ تم إضافة القسم بنجاح');
            input.value = '';
            renderCategoriesAdminList(); // Refresh list
            loadAdminProducts(true);     // Refresh products to get updated categories list
        } else {
            const err = await response.json();
            showToast(`❌ خطأ: ${err.message}`);
        }
    } catch (err) {
        console.error(err);
        showToast('❌ تعذر الاتصال بالخادم');
    }
};

window.deleteCategory = async function(cat) {
    if (!confirm(`هل أنت متأكد من حذف قسم "${cat}"؟\n(ملاحظة: هذا لن يحذف المنتجات التي تنتمي لهذا القسم، ولكن سيزيل القسم من قائمة الاختيارات الافتراضية)`)) {
        return;
    }

    try {
        const response = await adminFetch(`${BASE_URL}/api/categories/${encodeURIComponent(cat)}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('🗑️ تم حذف القسم من الاختيارات الافتراضية.');
            renderCategoriesAdminList();
            loadAdminProducts(true);
        } else {
            const err = await response.json();
            showToast(`❌ خطأ: ${err.message}`);
        }
    } catch (err) {
        console.error(err);
        showToast('❌ تعذر الاتصال بالخادم');
    }
};

// ==========================================
// Admin Products Table (V5.2 streamlined inventory workspace)
// ==========================================
function escapeAdminProductHtml(value) {
    return String(value ?? '').replace(/[&<>\'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function productHasValidImage(p) {
    const image = String(p?.image || '').trim();
    if (!image) return false;
    return !/placehold\.co|no-image|No\+Image/i.test(image) && (!window.defaultProductImage || image !== window.defaultProductImage);
}

function updateProductInventoryKpis() {
    const products = window.adminProducts || [];
    let inStock = 0, low = 0, out = 0, noImage = 0;
    products.forEach(p => {
        const qty = Number.isFinite(Number(p.stockQuantity)) ? Number(p.stockQuantity) : 0;
        if (qty <= 0) out++;
        else if (qty <= 3) low++;
        else inStock++;
        if (!productHasValidImage(p)) noImage++;
    });
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set('productKpiTotal', products.length);
    set('productKpiInStock', inStock);
    set('productKpiLow', low);
    set('productKpiOut', out);
    set('productKpiNoImage', noImage);
}

function populateAdminBrandFilter(products) {
    const select = document.getElementById('adminBrandFilter');
    if (!select) return;
    const current = select.value;
    const brands = [...new Set((products || []).map(p => String(p.publicBrand || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'ar'));
    select.innerHTML = '<option value="">كل العلامات التجارية</option>' + brands.map(b => `<option value="${escapeAdminProductHtml(b)}">${escapeAdminProductHtml(b)}</option>`).join('');
    if (brands.includes(current)) select.value = current;
}

async function loadAdminProducts(preserveState = false) {
    const table = document.getElementById('adminProductsTable');
    if (!table) return;

    const savedPage = window.currentPage || 1;
    populateCategoriesDatalist([]);

    if (!preserveState) {
        table.innerHTML = '<tr><td colspan="7" class="py-12 text-center text-on-surface-variant">جاري تحميل المنتجات...</td></tr>';
    }

    try {
        await loadStoreSettings();
        const response = await adminFetch(API_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const products = await response.json();
        window.adminProducts = Array.isArray(products) ? products : [];

        populateCategoriesDatalist(window.adminProducts);
        populateAdminBrandFilter(window.adminProducts);
        updateProductInventoryKpis();

        if (window.adminProducts.length === 0) {
            table.innerHTML = '<tr><td colspan="7" class="py-12 text-center text-on-surface-variant">لا توجد منتجات بعد. اضغط «إضافة منتج» للبدء.</td></tr>';
            window.filteredProducts = [];
            updatePaginationControls();
            const count = document.getElementById('adminProductsResultCount');
            if (count) count.textContent = '0 منتج';
            return;
        }

        filterAdminProducts(preserveState);
        if (preserveState) {
            window.currentPage = savedPage;
            renderProductsPage();
        }
        if (window.loadAnalytics) window.loadAnalytics();
    } catch (error) {
        table.innerHTML = '<tr><td colspan="7" class="py-12 text-center text-red-500">فشل تحميل المنتجات. حاول التحديث مرة أخرى.</td></tr>';
        console.error(error);
    }
}

function renderProductsPage() {
    const table = document.getElementById('adminProductsTable');
    if (!table) return;

    const products = window.filteredProducts || [];
    const totalPages = Math.max(1, Math.ceil(products.length / ITEMS_PER_PAGE));
    if (window.currentPage > totalPages) window.currentPage = totalPages;
    if (window.currentPage < 1) window.currentPage = 1;

    const resultCount = document.getElementById('adminProductsResultCount');
    if (resultCount) resultCount.textContent = `${products.length} منتج`;

    const start = (window.currentPage - 1) * ITEMS_PER_PAGE;
    const pageProducts = products.slice(start, start + ITEMS_PER_PAGE);

    if (pageProducts.length === 0) {
        table.innerHTML = '<tr><td colspan="7" class="py-14 text-center text-on-surface-variant"><span class="material-symbols-outlined block text-4xl mb-2 opacity-50">search_off</span>لا توجد نتائج مطابقة للفلاتر الحالية.</td></tr>';
        updatePaginationControls();
        return;
    }

    const fallbackImage = adminSafeImageUrl(window.defaultProductImage);
    table.innerHTML = pageProducts.map(p => {
        const qty = Math.max(0, Number(p.stockQuantity) || 0);
        const isLowStock = qty > 0 && qty <= 3;
        const isOutOfStock = qty <= 0;
        const isHidden = p.isHidden === true;
        const hasImage = productHasValidImage(p);
        const title = escapeAdminProductHtml(p.title || 'بدون اسم');
        const category = escapeAdminProductHtml(p.category || 'غير مصنف');
        const sku = escapeAdminProductHtml(p.sku || '—');
        const brand = escapeAdminProductHtml(p.publicBrand || '—');
        const price = escapeAdminProductHtml(p.price ?? '—');
        const stockTone = isOutOfStock ? 'stock-badge--out' : (isLowStock ? 'stock-badge--low' : 'stock-badge--ok');
        const stockLabel = isOutOfStock ? 'نفد المخزون' : (isLowStock ? 'منخفض' : 'متوفر');
        const visibilityLabel = isHidden ? 'مخفي' : 'ظاهر';
        const visibilityTone = isHidden ? 'status-pill--muted' : 'status-pill--live';

        return `
            <tr class="product-admin-row ${isHidden ? 'product-admin-row--hidden' : ''}">
                <td>
                    <div class="product-admin-cell">
                        <div class="product-admin-thumb-wrap">
                            <img src="${adminSafeImageUrl(p.image || fallbackImage)}" onerror="handleAdminImageError(this)" class="product-admin-thumb" alt="${title}">
                            ${!hasImage ? '<span class="product-image-warning" title="لا توجد صورة حقيقية"><span class="material-symbols-outlined">broken_image</span></span>' : ''}
                        </div>
                        <div class="min-w-0">
                            <button type="button" onclick="openEditModal('${p._id}')" class="product-admin-title">${title}</button>
                            <div class="product-admin-subline">
                                ${!hasImage ? '<span class="mini-pill mini-pill--amber">بدون صورة</span>' : ''}
                                ${isHidden ? '<span class="mini-pill">مخفي</span>' : ''}
                            </div>
                        </div>
                    </div>
                </td>
                <td><div class="product-admin-code"><span>${sku}</span><small>${brand}</small></div></td>
                <td><span class="product-category-pill">${category}</span></td>
                <td><strong class="product-price-cell">${price}<small> ج.م</small></strong></td>
                <td class="text-center">
                    <div class="stock-stepper">
                        ${hasPermission('edit_product') ? `<button type="button" onclick="adjustProductQuantity('${p._id}', -1)" ${qty <= 0 ? 'disabled' : ''} aria-label="إنقاص الكمية"><span class="material-symbols-outlined">remove</span></button>` : ''}
                        <input type="number" id="qty-${p._id}" value="${qty}" min="0" ${hasPermission('edit_product') ? '' : 'disabled'} onchange="updateQuantity('${p._id}')" aria-label="كمية ${title}">
                        ${hasPermission('edit_product') ? `<button type="button" onclick="adjustProductQuantity('${p._id}', 1)" aria-label="زيادة الكمية"><span class="material-symbols-outlined">add</span></button>` : ''}
                    </div>
                </td>
                <td class="text-center">
                    <div class="status-stack">
                        <span class="stock-badge ${stockTone}">${stockLabel} · ${qty}</span>
                        <span class="status-pill ${visibilityTone}">${visibilityLabel}</span>
                    </div>
                </td>
                <td class="text-center">
                    <div class="product-row-actions">
                        ${hasPermission('edit_product') ? `
                            <button type="button" onclick="openEditModal('${p._id}')" class="row-action row-action--edit" title="تعديل المنتج"><span class="material-symbols-outlined">edit</span></button>
                            <button type="button" onclick="toggleVisibility('${p._id}', ${!isHidden})" class="row-action" title="${isHidden ? 'إظهار المنتج' : 'إخفاء المنتج'}"><span class="material-symbols-outlined">${isHidden ? 'visibility' : 'visibility_off'}</span></button>
                        ` : ''}
                        ${hasPermission('delete_product') ? `<button type="button" onclick="deleteProduct('${p._id}')" class="row-action row-action--danger" title="حذف المنتج"><span class="material-symbols-outlined">delete</span></button>` : ''}
                        ${!hasPermission('edit_product') && !hasPermission('delete_product') ? '<span class="text-xs text-on-surface-variant">عرض فقط</span>' : ''}
                    </div>
                </td>
            </tr>`;
    }).join('');

    updatePaginationControls();
}

// ==========================================
// Pagination
// ==========================================
function updatePaginationControls() {
    const totalItems = window.filteredProducts ? window.filteredProducts.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const pageIndicator = document.getElementById('pageIndicator');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (pageIndicator) pageIndicator.textContent = totalItems === 0 ? 'صفحة 0 / 0' : `صفحة ${window.currentPage} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = window.currentPage <= 1 || totalItems === 0;
    if (nextBtn) nextBtn.disabled = window.currentPage >= totalPages || totalItems === 0;
}

window.goToPage = function(page) {
    const totalPages = Math.max(1, Math.ceil((window.filteredProducts || []).length / ITEMS_PER_PAGE));
    if (page < 1 || page > totalPages) return;
    window.currentPage = page;
    renderProductsPage();
    const scroller = document.getElementById('adminMainScroll');
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
};

// ==========================================
// Search / filters / KPI shortcuts
// ==========================================
window.filterAdminProducts = function(preservePage = false) {
    const query = (document.getElementById('adminSearchInput')?.value || '').trim().toLowerCase();
    const categoryFilter = document.getElementById('adminCategoryFilter')?.value || '';
    const brandFilter = document.getElementById('adminBrandFilter')?.value || '';
    const stockFilter = document.getElementById('adminStockFilter')?.value || '';

    window.filteredProducts = (window.adminProducts || []).filter(p => {
        const title = String(p.title || '').toLowerCase();
        const sku = String(p.sku || '').toLowerCase();
        const brand = String(p.publicBrand || '').toLowerCase();
        const category = String(p.category || '');
        const textMatch = !query || title.includes(query) || sku.includes(query) || brand.includes(query);
        const categoryMatch = !categoryFilter || category === categoryFilter;
        const brandMatch = !brandFilter || String(p.publicBrand || '') === brandFilter;
        const qty = Math.max(0, Number(p.stockQuantity) || 0);
        const hasImage = productHasValidImage(p);

        let stockMatch = true;
        if (stockFilter === 'in_stock') stockMatch = qty > 3;
        else if (stockFilter === 'low_stock') stockMatch = qty > 0 && qty <= 3;
        else if (stockFilter === 'out_of_stock') stockMatch = qty <= 0;
        else if (stockFilter === 'missing_image') stockMatch = !hasImage;
        else if (stockFilter === 'hidden') stockMatch = p.isHidden === true;

        return textMatch && categoryMatch && brandMatch && stockMatch;
    });

    if (!preservePage) window.currentPage = 1;
    renderProductsPage();
};

window.setAdminStockFilter = function(value) {
    const select = document.getElementById('adminStockFilter');
    if (select) select.value = value;
    filterAdminProducts();
};

window.clearAdminProductFilters = function() {
    ['adminSearchInput', 'adminCategoryFilter', 'adminBrandFilter', 'adminStockFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    filterAdminProducts();
};

window.openAddProductPanel = function() {
    const panel = document.getElementById('addProductPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-panel-open');
    requestAnimationFrame(() => panel.classList.add('is-open'));
    setTimeout(() => document.getElementById('pTitle')?.focus(), 180);
};

window.closeAddProductPanel = function() {
    const panel = document.getElementById('addProductPanel');
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-panel-open');
    setTimeout(() => panel.classList.add('hidden'), 180);
};

window.openCategoriesPanel = function() {
    const panel = document.getElementById('categoriesPanel');
    if (!panel) return;
    renderCategoriesAdminList();
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-panel-open');
    requestAnimationFrame(() => panel.classList.add('is-open'));
    setTimeout(() => document.getElementById('newCategoryInput')?.focus(), 180);
};

window.closeCategoriesPanel = function() {
    const panel = document.getElementById('categoriesPanel');
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-panel-open');
    setTimeout(() => panel.classList.add('hidden'), 180);
};

window.adjustProductQuantity = async function(id, delta) {
    const input = document.getElementById(`qty-${id}`);
    if (!input) return;
    const current = Math.max(0, Number(input.value) || 0);
    input.value = Math.max(0, current + Number(delta || 0));
    await updateQuantity(id, true);
};

// ==========================================
// Update Stock Quantity
// ==========================================
window.updateQuantity = async function(id, quiet = false) {
    const qtyInput = document.getElementById(`qty-${id}`);
    if (!qtyInput) return;
    const newQty = Math.max(0, parseInt(qtyInput.value, 10) || 0);
    qtyInput.value = newQty;
    qtyInput.disabled = true;
    try {
        const response = await adminFetch(`${API_URL}/${id}/quantity`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stockQuantity: newQty })
        });

        if (response.ok) {
            const product = (window.adminProducts || []).find(p => p._id === id);
            if (product) product.stockQuantity = newQty;
            updateProductInventoryKpis();
            filterAdminProducts(true);
            if (!quiet) showToast('✅ تم تحديث الكمية');
        } else {
            const data = await response.json().catch(() => ({}));
            alert(`خطأ: ${data.message || 'تعذر تحديث الكمية'}`);
            loadAdminProducts(true);
        }
    } catch (error) {
        console.error(error);
        alert('حدث خطأ أثناء الاتصال بالسيرفر.');
        loadAdminProducts(true);
    } finally {
        const refreshed = document.getElementById(`qty-${id}`);
        if (refreshed && hasPermission('edit_product')) refreshed.disabled = false;
    }
};

// ==========================================
// Delete Product
// ==========================================
window.deleteProduct = async function(id) {
    if (confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
        try {
            const response = await adminFetch(`${API_URL}/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('🗑️ تم حذف المنتج!');
                loadAdminProducts(true);
            } else {
                alert('فشل حذف المنتج.');
            }
        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء حذف المنتج.');
        }
    }
};

// ==========================================
// Toggle Visibility
// ==========================================
window.toggleVisibility = async function(id, shouldHide) {
    try {
        const response = await adminFetch(`${API_URL}/${id}/toggle-visibility`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isHidden: shouldHide })
        });
        
        if (response.ok) {
            showToast(shouldHide ? '👁️‍🗨️ تم إخفاء المنتج بنجاح' : '👁️ تم إظهار المنتج بنجاح');
            loadAdminProducts(true);
        } else {
            const data = await response.json();
            alert(`خطأ: ${data.message}`);
        }
    } catch (error) {
        console.error(error);
        alert('حدث خطأ أثناء الاتصال بالسيرفر.');
    }
};

// ==========================================
// Image Preview & Upload (Add Product)
// ==========================================
const pImage = document.getElementById('pImage');
const imgPreviewContainer = document.getElementById('imagePreviewContainer');

if (pImage) {
    pImage.addEventListener('change', function(e) {
        const files = e.target.files;
        if (imgPreviewContainer) {
            imgPreviewContainer.innerHTML = '';
            if (files && files.length > 0) {
                imgPreviewContainer.classList.remove('hidden');
                Array.from(files).forEach(file => {
                    const reader = new FileReader();
                    reader.onload = function(event) {
                        const img = document.createElement('img');
                        img.src = event.target.result;
                        img.className = 'w-20 h-20 object-contain bg-surface/50 p-1 rounded border border-outline-variant/30';
                        imgPreviewContainer.appendChild(img);
                    };
                    reader.readAsDataURL(file);
                });
            } else {
                imgPreviewContainer.classList.add('hidden');
            }
        }
    });
}

// Edit Image Preview
const editPImage = document.getElementById('editPImage');
const editImgPreviewContainer = document.getElementById('editImagePreviewContainer');

if (editPImage) {
    editPImage.addEventListener('change', function(e) {
        const files = e.target.files;
        if (editImgPreviewContainer) {
            editImgPreviewContainer.innerHTML = '';
            if (files && files.length > 0) {
                editImgPreviewContainer.classList.remove('hidden');
                Array.from(files).forEach(file => {
                    const reader = new FileReader();
                    reader.onload = function(event) {
                        const img = document.createElement('img');
                        img.src = event.target.result;
                        img.className = 'w-20 h-20 object-contain bg-surface/50 p-1 rounded border border-outline-variant/30';
                        editImgPreviewContainer.appendChild(img);
                    };
                    reader.readAsDataURL(file);
                });
            } else {
                editImgPreviewContainer.classList.add('hidden');
            }
        }
    });
}

// ==========================================
// Add Product Form
// ==========================================
const addForm = document.getElementById('addProductForm');
if (addForm) {
    addForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const fileInput = document.getElementById('pImage');
        if (!fileInput.files || fileInput.files.length === 0) {
            alert('يرجى اختيار صورة للمنتج');
            return;
        }

        const title = document.getElementById('pTitle').value;
        const category = document.getElementById('pCategory').value;
        const price = document.getElementById('pPrice').value;
        const oldPrice = document.getElementById('pOldPrice').value;
        const desc = document.getElementById('pDesc').value;
        const quantity = document.getElementById('pQuantity').value;
        const sku = document.getElementById('pSku').value;
        const warranty = document.getElementById('pWarranty').value;
        const publicBrand = document.getElementById('pPublicBrand').value;

        const formData = new FormData();
        formData.append('title', title);
        formData.append('category', category);
        formData.append('price', price);
        if (oldPrice) formData.append('oldPrice', oldPrice);
        formData.append('description', desc);
        formData.append('stockQuantity', quantity);
        formData.append('sku', sku);
        formData.append('warranty', warranty);
        formData.append('publicBrand', publicBrand);

        const type = document.getElementById('pDiscountType')?.value;
        const val = parseInt(document.getElementById('pDiscountValue')?.value);
        if (type && val > 0) {
            const ms = type === 'days' ? val * 24 * 60 * 60 * 1000 : val * 60 * 60 * 1000;
            const expiresAt = new Date(Date.now() + ms).toISOString();
            formData.append('discountExpiresAt', expiresAt);
        }
        
        for (let i = 0; i < fileInput.files.length; i++) {
            formData.append('images', fileInput.files[i]);
        }

        const submitBtn = addForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">sync</span> جاري الرفع...';
        submitBtn.disabled = true;

        try {
            const response = await adminFetch(API_URL, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                addForm.reset();
                if (imgPreviewContainer) imgPreviewContainer.classList.add('hidden');
                await loadAdminProducts();
                closeAddProductPanel();
                showToast('✅ تم إضافة المنتج بنجاح!');
            } else {
                const errorData = await response.json();
                alert(`خطأ: ${errorData.message}`);
            }
        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء إرسال البيانات للسيرفر.');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

// ==========================================
// Settings Form (Current User Credentials)
// ==========================================
const settingsForm = document.getElementById('settingsForm');
if (settingsForm) {
    settingsForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const newUser = document.getElementById('newUsername').value.trim();
        const newPass = document.getElementById('newPassword').value.trim();
        const posApiKey = document.getElementById('posApiKeyInput') ? document.getElementById('posApiKeyInput').value.trim() : '';

        if (!newUser && !newPass && !posApiKey) {
            showToast('⚠️ لم تدخل أي بيانات جديدة.');
            return;
        }

        const currentUser = getCurrentUser();
        if (!currentUser) return;
        
        try {
            // 1. تحديث بيانات المستخدم (في حال وجودها)
            if (newUser || newPass) {
                const updateData = { username: newUser || currentUser.username };
                if (newPass) updateData.password = newPass;
                
                const response = await adminFetch(`${BASE_URL}/api/admin/users/${currentUser.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updateData)
                });
                
                if (response.ok) {
                    const updatedUser = await response.json();
                    sessionStorage.setItem('tech_current_user', JSON.stringify(updatedUser));
                    checkAuth();
                } else {
                    const errData = await response.json();
                    alert(`خطأ: ${errData.message}`);
                    return;
                }
            }

            // 2. تحديث مفتاح ربط الكاشير
            if (posApiKey) {
                const fd = new FormData();
                fd.append('posApiKey', posApiKey);
                
                const resSettings = await adminFetch(`${BASE_URL}/api/settings`, {
                    method: 'POST',
                    body: fd
                });
                
                if (!resSettings.ok) {
                    const errData = await resSettings.json();
                    alert(`خطأ في تحديث مفتاح الكاشير: ${errData.message}`);
                    return;
                }
            }
            
            settingsForm.reset();
            showToast('✅ تم تحديث الإعدادات بنجاح!');
            if (posApiKey && document.getElementById('posApiKeyInput')) {
                document.getElementById('posApiKeyInput').value = posApiKey;
            }
        } catch (err) {
            console.error(err);
            alert('فشل الاتصال بالسيرفر لتحديث البيانات');
        }
    });
}

// ==========================================
// Users Management
// ==========================================
async function fetchAllUsers() {
    try {
        const res = await adminFetch(`${BASE_URL}/api/admin/users`);
        if (res.ok) {
            allUsersCache = await res.json();
            return allUsersCache;
        }
    } catch(e) { console.error('Error fetching users:', e); }
    return [];
}

async function loadUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    const users = await fetchAllUsers();
    const currentUser = getCurrentUser();

    tbody.innerHTML = '';
    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-outline-variant/30 text-sm hover:bg-surface-variant/30 transition-colors';
        const isSelf = currentUser && user.id === currentUser.id;
        const permLabels = {
            'add_product': 'إضافة منتجات',
            'edit_product': 'تعديل منتجات',
            'delete_product': 'حذف منتجات',
            'manage_categories': 'أقسام',
            'manage_settings': 'إعدادات وتصميم',
            'manage_backup': 'نسخ احتياطي واسترجاع',
            'view_reports': 'تقارير وإحصائيات',
            'manage_users': 'مستخدمين',
            'manage_orders': 'إدارة الطلبات',
            'manage_media': 'مركز الصور',
            'all': 'كل الصلاحيات (مدير)'
        };
        const permsText = user.permissions.includes('all') ? 'كل الصلاحيات' : user.permissions.map(p => permLabels[p] || p).join('، ');
        tr.innerHTML = `
            <td class="py-4 pr-2 font-semibold text-on-surface flex items-center gap-2">
                <span class="material-symbols-outlined text-primary text-[20px]">person</span>
                ${user.username} ${isSelf ? '<span class="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">أنت</span>' : ''}
            </td>
            <td class="py-4"><span class="px-2 py-1 rounded-full text-xs font-bold ${user.role === 'مدير' ? 'bg-primary/20 text-primary' : 'bg-secondary/20 text-secondary'}">${user.role}</span></td>
            <td class="py-4 text-on-surface-variant text-xs">الصلاحيات: ${permsText}</td>
            <td class="py-4 text-center">
                ${!isSelf ? `
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="editUser('${user.id}')" class="px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500 hover:text-white rounded text-xs transition-all font-bold">تعديل</button>
                        <button onclick="deleteUser('${user.id}')" class="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded text-xs transition-all font-bold">حذف</button>
                    </div>
                ` : '<span class="text-xs text-on-surface-variant">—</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.editUser = function(id) {
    const user = allUsersCache.find(u => u.id === id);
    if (!user) return;
    document.getElementById('newUserUsername').value = user.username;
    document.getElementById('newUserPassword').value = '';
    document.getElementById('newUserPassword').placeholder = 'اترك فارغاً لعدم التغيير';
    document.querySelectorAll('input[name="permissions"]').forEach(cb => {
        cb.checked = user.permissions.includes('all') || user.permissions.includes(cb.value);
    });
    
    const submitBtn = document.querySelector('#panel-users button[onclick="addNewUser()"]');
    if (submitBtn) {
        submitBtn.dataset.editingId = id;
        submitBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> حفظ التعديلات';
    }
};

window.addNewUser = async function() {
    const username = document.getElementById('newUserUsername').value.trim();
    const password = document.getElementById('newUserPassword').value.trim();
    const checkedBoxes = Array.from(document.querySelectorAll('input[name="permissions"]:checked')).map(cb => cb.value);

    const submitBtn = document.querySelector('#panel-users button[onclick="addNewUser()"]');
    const editingId = submitBtn ? submitBtn.dataset.editingId : null;

    if (!username) {
        alert('يرجى إدخال اسم المستخدم.');
        return;
    }
    if (!editingId && !password) {
        alert('يرجى إدخال كلمة المرور.');
        return;
    }
    if (checkedBoxes.length === 0) {
        alert('يرجى اختيار صلاحية واحدة على الأقل.');
        return;
    }

    const permissions = checkedBoxes.includes('all') ? ['all'] : checkedBoxes;
    const role = permissions.includes('all') ? 'مدير' : 'محرر';
    
    try {
        let response;
        if (editingId) {
            response = await adminFetch(`${BASE_URL}/api/admin/users/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role, permissions })
            });
        } else {
            response = await adminFetch(`${BASE_URL}/api/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role, permissions })
            });
        }

        if (response.ok) {
            if (submitBtn) {
                delete submitBtn.dataset.editingId;
                submitBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">person_add</span> إضافة مستخدم';
            }
            showToast(editingId ? '✅ تم تعديل المستخدم بنجاح!' : '✅ تم إضافة المستخدم بنجاح!');
            document.getElementById('newUserUsername').value = '';
            document.getElementById('newUserPassword').value = '';
            document.getElementById('newUserPassword').placeholder = 'كلمة المرور';
            document.querySelectorAll('input[name="permissions"]').forEach(cb => cb.checked = false);
            loadUsersTable();
        } else {
            const err = await response.json();
            alert(`خطأ: ${err.message}`);
        }
    } catch(err) {
        console.error(err);
        alert('فشل الاتصال بالسيرفر');
    }
};

window.deleteUser = async function(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
    try {
        const response = await adminFetch(`${BASE_URL}/api/admin/users/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showToast('🗑️ تم حذف المستخدم!');
            loadUsersTable();
        } else {
            const err = await response.json();
            alert(`خطأ: ${err.message}`);
        }
    } catch(err) {
        console.error(err);
        alert('فشل الاتصال بالسيرفر');
    }
};

// ==========================================
// Branding (Logo & Background)
// ==========================================
let tempLogoFile = null;
let tempBgFile = null;
let tempLightBgFile = null;

function loadCurrentLogo() {
    // تحميل اللوجو من إعدادات السيرفر (Cloudinary)
    adminFetch(`${BASE_URL}/api/settings`)
        .then(r => r.json())
        .then(settings => {
            if (settings.storeLogo) {
                const preview = document.getElementById('currentLogoPreview');
                if (preview) {
                    preview.dataset.fallbackApplied = '0';
                    preview.onerror = () => window.handleAdminImageError(preview);
                    preview.src = settings.storeLogo;
                    preview.classList.remove('hidden');
                }
                const adminLogoImg = document.getElementById('adminLogoImg');
                if (adminLogoImg) adminLogoImg.src = settings.storeLogo;
            }
            if (settings.lightHeroImage && settings.lightHeroImage !== 'main-banner.webp') {
                const lightBgPreview = document.getElementById('currentLightBgPreview');
                if (lightBgPreview) {
                    lightBgPreview.dataset.fallbackApplied = '0';
                    lightBgPreview.onerror = () => window.handleAdminImageError(lightBgPreview);
                    lightBgPreview.src = settings.lightHeroImage;
                    lightBgPreview.classList.remove('hidden');
                }
            }
            if (settings.darkHeroImage && settings.darkHeroImage !== 'main-banner.webp') {
                const darkBgPreview = document.getElementById('currentBgPreview');
                if (darkBgPreview) {
                    darkBgPreview.dataset.fallbackApplied = '0';
                    darkBgPreview.onerror = () => window.handleAdminImageError(darkBgPreview);
                    darkBgPreview.src = settings.darkHeroImage;
                    darkBgPreview.classList.remove('hidden');
                }
            }
            if (settings.posApiKey && document.getElementById('posApiKeyInput')) {
                document.getElementById('posApiKeyInput').value = settings.posApiKey;
            }
            if (document.getElementById('crossSellToggleInput')) {
                document.getElementById('crossSellToggleInput').checked = !!settings.isCrossSellEnabled;
            }
            if (document.getElementById('quickBuyToggleInput')) {
                document.getElementById('quickBuyToggleInput').checked = !!settings.isQuickBuyEnabled;
            }
            if (document.getElementById('pixelToggleInput')) {
                document.getElementById('pixelToggleInput').checked = !!settings.isPixelEnabled;
            }
            if (document.getElementById('fbPixelIdInput')) {
                document.getElementById('fbPixelIdInput').value = settings.fbPixelId || '';
            }
        })
        .catch(() => {});
}

function loadCurrentBg() {
    // مدمجت في loadCurrentLogo
}

const storeLogoInput = document.getElementById('storeLogoInput');
if (storeLogoInput) {
    storeLogoInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            tempLogoFile = file;
            // عرض معاينة محلية
            const reader = new FileReader();
            reader.onload = function(event) {
                const preview = document.getElementById('currentLogoPreview');
                if (preview) {
                    preview.src = event.target.result;
                    preview.classList.remove('hidden');
                }
            };
            reader.readAsDataURL(file);
        }
    });
}

const storeBgInput = document.getElementById('storeBgInput');
if (storeBgInput) {
    storeBgInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            tempBgFile = file;
            const reader = new FileReader();
            reader.onload = function(event) {
                const preview = document.getElementById('currentBgPreview');
                if (preview) {
                    preview.src = event.target.result;
                    preview.classList.remove('hidden');
                }
            };
            reader.readAsDataURL(file);
        }
    });
}

const storeLightBgInput = document.getElementById('storeLightBgInput');
if (storeLightBgInput) {
    storeLightBgInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            tempLightBgFile = file;
            const reader = new FileReader();
            reader.onload = function(event) {
                const preview = document.getElementById('currentLightBgPreview');
                if (preview) {
                    preview.src = event.target.result;
                    preview.classList.remove('hidden');
                }
            };
            reader.readAsDataURL(file);
        }
    });
}

window.saveBrandingSettings = async function() {
    if (!tempLogoFile && !tempBgFile && !tempLightBgFile) {
        showToast('⚠️ لم تقم باختيار صور جديدة لحفظها.');
        return;
    }

    const saveBtn = document.querySelector('button[onclick="saveBrandingSettings()"]');
    if (saveBtn) saveBtn.disabled = true;
    showToast('⏳ جاري رفع الصور على السيرفر...');

    const formData = new FormData();
    if (tempLogoFile) formData.append('storeLogo', tempLogoFile);
    if (tempBgFile) formData.append('darkHeroImage', tempBgFile);
    if (tempLightBgFile) formData.append('lightHeroImage', tempLightBgFile);

    try {
        const response = await adminFetch(`${BASE_URL}/api/settings`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'خطأ في الحفظ');
        }

        const result = await response.json();

        // تحديث اللوجو فوراً في لوحة الإدارة
        if (result.storeLogo) {
            const adminLogoImg = document.getElementById('adminLogoImg');
            if (adminLogoImg) adminLogoImg.src = result.storeLogo;
        }

        showToast('✅ تم حفظ مظهر الموقع بنجاح! سيظهر التغيير على جميع الأجهزة.');
        tempLogoFile = null;
        tempBgFile = null;
        tempLightBgFile = null;
    } catch (error) {
        showToast('❌ خطأ: ' + error.message);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
};

// ==========================================
// Store Settings (Default Product Image)
// ==========================================
let defaultProductImage = '';
let tempDefaultProductImageFile = null;

async function loadStoreSettings() {
    try {
        const response = await adminFetch(`${BASE_URL}/api/settings`);
        const settings = await response.json();
        defaultProductImage = settings.defaultProductImage;
        const preview = document.getElementById('defaultProductImagePreview');
        if (preview && defaultProductImage) {
            preview.dataset.fallbackApplied = '0';
            preview.onerror = () => window.handleAdminImageError(preview);
            preview.src = adminSafeImageUrl(defaultProductImage);
            preview.classList.remove('hidden');
        }
        
        const shippingToggle = document.getElementById('shippingToggleInput');
        if (shippingToggle) {
            shippingToggle.checked = settings.isShippingEnabled || false;
        }
        const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ''; };
        setValue('socialWhatsappNumber', settings.whatsappNumber || '201515664919');
        setValue('socialWhatsappChannel', settings.whatsappChannelUrl || '');
        setValue('socialTelegramUrl', settings.telegramUrl || 'https://t.me/TehnologyStore');
        setValue('socialFacebookUrl', settings.facebookUrl || '');
        setValue('socialInstagramUrl', settings.instagramUrl || '');
        setValue('socialTiktokUrl', settings.tiktokUrl || 'https://www.tiktok.com/@technologystore.official');
        setValue('socialXUrl', settings.xUrl || 'https://x.com/techstoreeg');
    } catch (err) {
        console.error('Error loading store settings:', err);
    }
}

window.saveShippingSettings = async function() {
    const isEnabled = document.getElementById('shippingToggleInput').checked;
    
    try {
        const formData = new FormData();
        formData.append('isShippingEnabled', isEnabled);
        
        const response = await adminFetch(`${BASE_URL}/api/settings`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            showToast(`✅ تم ${isEnabled ? 'تفعيل' : 'إيقاف'} الشحن بنجاح!`);
        } else {
            const errData = await response.json();
            showToast(`⚠️ خطأ: ${errData.message}`);
        }
    } catch (err) {
        console.error(err);
        showToast('❌ فشل الاتصال بالسيرفر.');
    }
};

const defaultProductImageInput = document.getElementById('defaultProductImageInput');
if (defaultProductImageInput) {
    defaultProductImageInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            tempDefaultProductImageFile = file;
            const reader = new FileReader();
            reader.onload = function(event) {
                const preview = document.getElementById('defaultProductImagePreview');
                if (preview) {
                    preview.src = event.target.result;
                    preview.classList.remove('hidden');
                }
            };
            reader.readAsDataURL(file);
        }
    });
}

window.saveMarketingSettings = async function(showSuccess = false) {
    const isCrossSellEnabled = document.getElementById('crossSellToggleInput') ? document.getElementById('crossSellToggleInput').checked : false;
    const isQuickBuyEnabled = document.getElementById('quickBuyToggleInput') ? document.getElementById('quickBuyToggleInput').checked : false;
    const isPixelEnabled = document.getElementById('pixelToggleInput') ? document.getElementById('pixelToggleInput').checked : false;
    const fbPixelId = document.getElementById('fbPixelIdInput') ? document.getElementById('fbPixelIdInput').value.trim() : '';

    const fd = new URLSearchParams();
    fd.append('isCrossSellEnabled', isCrossSellEnabled);
    fd.append('isQuickBuyEnabled', isQuickBuyEnabled);
    fd.append('isPixelEnabled', isPixelEnabled);
    fd.append('fbPixelId', fbPixelId);

    try {
        const response = await adminFetch(`${BASE_URL}/api/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: fd.toString()
        });
        if (response.ok) {
            showToast('✅ تم حفظ الإعدادات بنجاح');
        } else {
            const errData = await response.json();
            showToast(`⚠️ خطأ: ${errData.message || 'حدث خطأ أثناء الحفظ'}`);
        }
    } catch (err) {
        console.error(err);
        showToast('⚠️ خطأ في الاتصال بالسيرفر');
    }
}

window.saveStoreSettings = async function() {
    if (!tempDefaultProductImageFile) {
        showToast('⚠️ يرجى اختيار صورة أولاً.');
        return;
    }

    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const originalText = saveSettingsBtn.innerHTML;
    saveSettingsBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">sync</span> جاري الحفظ...';
    saveSettingsBtn.disabled = true;

    const formData = new FormData();
    formData.append('defaultProductImage', tempDefaultProductImageFile);

    try {
        const response = await adminFetch(`${BASE_URL}/api/settings`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const settings = await response.json();
            defaultProductImage = settings.defaultProductImage;
            tempDefaultProductImageFile = null;
            showToast('✅ تم حفظ الإعدادات بنجاح!');
        } else {
            const errData = await response.json();
            alert(`خطأ: ${errData.message}`);
        }
    } catch (err) {
        console.error(err);
        showToast('❌ فشل الاتصال بالسيرفر.');
    } finally {
        saveSettingsBtn.innerHTML = originalText;
        saveSettingsBtn.disabled = false;
    }
};

// ==========================================
// Edit Product Modal (with Image Upload)
// ==========================================
let imagesToDelete = []; // مصفوفة لتتبع الصور المراد حذفها

window.openEditModal = function(id) {
    const product = window.adminProducts.find(p => p._id === id);
    if (!product) return;

    // إعادة تعيين مصفوفة الحذف عند فتح نافذة جديدة
    imagesToDelete = [];

    document.getElementById('editProductId').value = product._id;
    document.getElementById('editPTitle').value = product.title;
    document.getElementById('editPCategory').value = product.category;
    document.getElementById('editPPrice').value = product.price;
    document.getElementById('editPOldPrice').value = product.oldPrice || '';
    document.getElementById('editPDesc').value = product.description.join('\n');
    document.getElementById('editPQuantity').value = product.stockQuantity || 0;
    document.getElementById('editPSku').value = product.sku || '';
    document.getElementById('editPPublicBrand').value = product.publicBrand || '';
    document.getElementById('editPWarranty').value = product.warranty || '';

    if (product.discountExpiresAt) {
        const remaining = new Date(product.discountExpiresAt) - new Date();
        if (remaining > 0) {
            const hours = Math.ceil(remaining / (1000 * 60 * 60));
            document.getElementById('editPDiscountType').value = 'hours';
            document.getElementById('editPDiscountValue').value = hours;
            document.getElementById('editPDiscountValueContainer').style.display = 'block';
        } else {
            document.getElementById('editPDiscountType').value = '';
            document.getElementById('editPDiscountValue').value = '';
            document.getElementById('editPDiscountValueContainer').style.display = 'none';
        }
    } else {
        document.getElementById('editPDiscountType').value = '';
        document.getElementById('editPDiscountValue').value = '';
        document.getElementById('editPDiscountValueContainer').style.display = 'none';
    }

    // عرض الصور الحالية مع أزرار التحكم والترتيب والحذف
    window.currentEditingImages = [];
    if (product.image) {
        window.currentEditingImages.push({ url: product.image, publicId: product.imagePublicId || `main_${product._id}`, isMain: true });
    }
    if (product.additionalImages && product.additionalImages.length > 0) {
        product.additionalImages.forEach((imgData, index) => {
            window.currentEditingImages.push({
                url: imgData.url,
                publicId: imgData.publicId || `legacy_add_${index}`,
                isMain: false
            });
        });
    }
    renderEditCurrentImages();

    // Reset file input and preview
    const editFileInput = document.getElementById('editPImage');
    if (editFileInput) editFileInput.value = '';
    const editPreviewContainer = document.getElementById('editImagePreviewContainer');
    if (editPreviewContainer) {
        editPreviewContainer.classList.add('hidden');
        editPreviewContainer.innerHTML = '';
    }

    const modal = document.getElementById('editProductModal');
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('editProductModalContent').classList.remove('scale-95');
    }, 10);
};

// رسم قائمة الصور الحالية مع أزرار الترتيب والتعيين كأساسية والحذف
window.renderEditCurrentImages = function() {
    const container = document.getElementById('editCurrentImages');
    if (!container) return;
    container.innerHTML = '';

    const visibleImages = window.currentEditingImages.filter(img => !imagesToDelete.includes(img.publicId));
    if (visibleImages.length === 0) {
        container.innerHTML = '<span class="text-on-surface-variant/50 text-xs self-center py-4">لا توجد صور حالية لهذا المنتج</span>';
        return;
    }

    window.currentEditingImages.forEach((img, index) => {
        const isDeleted = imagesToDelete.includes(img.publicId);
        
        const wrapper = document.createElement('div');
        wrapper.className = 'relative group flex flex-col items-center bg-surface-container p-2 rounded-lg border transition-all ' + (img.isMain ? 'border-primary bg-primary/5 shadow-md' : 'border-outline-variant/30') + (isDeleted ? ' opacity-30 scale-95' : '');
        wrapper.dataset.publicId = img.publicId;

        const imgEl = document.createElement('img');
        imgEl.src = adminSafeImageUrl(img.url);
        imgEl.onerror = () => window.handleAdminImageError(imgEl);
        imgEl.className = 'w-24 h-24 object-contain bg-surface/50 p-1 rounded-md mb-2 border border-outline-variant/30';
        wrapper.appendChild(imgEl);

        if (isDeleted) {
            const undoBtn = document.createElement('button');
            undoBtn.type = 'button';
            undoBtn.className = 'absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-red-900/80 text-white rounded-lg cursor-pointer font-bold text-xs gap-1 z-20 transition-all';
            undoBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">undo</span> استعادة';
            undoBtn.onclick = (e) => {
                e.stopPropagation();
                imagesToDelete = imagesToDelete.filter(pid => pid !== img.publicId);
                renderEditCurrentImages();
            };
            wrapper.appendChild(undoBtn);
            container.appendChild(wrapper);
            return;
        }

        // Delete Button (Top Right)
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-lg hover:bg-red-600 transition-colors z-10';
        deleteBtn.innerHTML = '✕';
        deleteBtn.title = 'حذف الصورة';
        deleteBtn.onclick = () => {
            imagesToDelete.push(img.publicId);
            renderEditCurrentImages();
        };
        wrapper.appendChild(deleteBtn);

        // Badge / Promote Button
        if (img.isMain) {
            const badge = document.createElement('span');
            badge.className = 'text-[10px] font-bold px-2 py-1 rounded bg-primary text-on-primary w-full text-center shadow-sm';
            badge.innerHTML = '⭐ الأساسية';
            wrapper.appendChild(badge);
        } else {
            const promoteBtn = document.createElement('button');
            promoteBtn.type = 'button';
            promoteBtn.className = 'text-[10px] font-bold px-2 py-1 rounded bg-surface-variant hover:bg-primary hover:text-on-primary text-on-surface-variant transition-all w-full text-center cursor-pointer';
            promoteBtn.innerHTML = 'جعلها أساسية';
            promoteBtn.title = 'تعيين كصورة رئيسية للمنتج';
            promoteBtn.onclick = () => {
                window.currentEditingImages.forEach(i => i.isMain = false);
                img.isMain = true;
                const idx = window.currentEditingImages.indexOf(img);
                if (idx > 0) {
                    window.currentEditingImages.splice(idx, 1);
                    window.currentEditingImages.unshift(img);
                }
                renderEditCurrentImages();
            };
            wrapper.appendChild(promoteBtn);
        }

        // Shift Left / Right Arrows
        const arrowsDiv = document.createElement('div');
        arrowsDiv.className = 'flex justify-between w-full mt-1.5 pt-1 border-t border-outline-variant/20 gap-1';
        
        const moveRightBtn = document.createElement('button');
        moveRightBtn.type = 'button';
        moveRightBtn.className = 'flex-1 py-0.5 bg-surface-container-high hover:bg-surface-variant rounded text-on-surface text-xs disabled:opacity-20 cursor-pointer text-center';
        moveRightBtn.innerHTML = '➡️';
        moveRightBtn.title = 'نقل لليمين';
        moveRightBtn.disabled = index === 0;
        moveRightBtn.onclick = () => {
            if (index > 0) {
                const temp = window.currentEditingImages[index - 1];
                window.currentEditingImages[index - 1] = window.currentEditingImages[index];
                window.currentEditingImages[index] = temp;
                renderEditCurrentImages();
            }
        };

        const moveLeftBtn = document.createElement('button');
        moveLeftBtn.type = 'button';
        moveLeftBtn.className = 'flex-1 py-0.5 bg-surface-container-high hover:bg-surface-variant rounded text-on-surface text-xs disabled:opacity-20 cursor-pointer text-center';
        moveLeftBtn.innerHTML = '⬅️';
        moveLeftBtn.title = 'نقل لليسار';
        moveLeftBtn.disabled = index === window.currentEditingImages.length - 1;
        moveLeftBtn.onclick = () => {
            if (index < window.currentEditingImages.length - 1) {
                const temp = window.currentEditingImages[index + 1];
                window.currentEditingImages[index + 1] = window.currentEditingImages[index];
                window.currentEditingImages[index] = temp;
                renderEditCurrentImages();
            }
        };

        arrowsDiv.appendChild(moveRightBtn);
        arrowsDiv.appendChild(moveLeftBtn);
        wrapper.appendChild(arrowsDiv);

        container.appendChild(wrapper);
    });
};

window.closeEditModal = function() {
    const modal = document.getElementById('editProductModal');
    modal.classList.add('opacity-0');
    document.getElementById('editProductModalContent').classList.add('scale-95');
    document.body.classList.remove('overflow-hidden'); // إعادة تفعيل التمرير في الخلفية
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('editProductForm').reset();
        const editPreviewContainer = document.getElementById('editImagePreviewContainer');
        if (editPreviewContainer) {
            editPreviewContainer.classList.add('hidden');
            editPreviewContainer.innerHTML = '';
        }
    }, 300);
};

const editForm = document.getElementById('editProductForm');
if (editForm) {
    editForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const id = document.getElementById('editProductId').value;
        
        // Use FormData to support optional image upload
        const formData = new FormData();
        formData.append('title', document.getElementById('editPTitle').value);
        formData.append('category', document.getElementById('editPCategory').value);
        formData.append('price', document.getElementById('editPPrice').value);
        formData.append('oldPrice', document.getElementById('editPOldPrice').value);
        formData.append('description', document.getElementById('editPDesc').value);
        formData.append('stockQuantity', document.getElementById('editPQuantity').value);
        formData.append('sku', document.getElementById('editPSku').value);
        formData.append('publicBrand', document.getElementById('editPPublicBrand').value);
        formData.append('warranty', document.getElementById('editPWarranty').value);

        const type = document.getElementById('editPDiscountType')?.value;
        const val = parseInt(document.getElementById('editPDiscountValue')?.value);
        if (type && val > 0) {
            const ms = type === 'days' ? val * 24 * 60 * 60 * 1000 : val * 60 * 60 * 1000;
            const expiresAt = new Date(Date.now() + ms).toISOString();
            formData.append('discountExpiresAt', expiresAt);
        } else if (type === '') {
            formData.append('discountExpiresAt', '');
        }

        // Append images only if new ones were selected
        const editFileInput = document.getElementById('editPImage');
        const replaceMainCb = document.getElementById('editReplaceMainImage');
        if (replaceMainCb && replaceMainCb.checked) {
            formData.append('replaceMain', 'true');
        }

        if (editFileInput && editFileInput.files && editFileInput.files.length > 0) {
            for (let i = 0; i < editFileInput.files.length; i++) {
                formData.append('images', editFileInput.files[i]);
            }
        }

        // إرسال مصفوفة الصور المراد حذفها
        if (imagesToDelete.length > 0) {
            formData.append('imagesToDelete', JSON.stringify(imagesToDelete));
        }

        // إرسال الترتيب الجديد والصورة الأساسية المعدلة
        if (window.currentEditingImages && window.currentEditingImages.length > 0) {
            const activeImages = window.currentEditingImages.filter(img => !imagesToDelete.includes(img.publicId));
            const mainImg = activeImages.find(img => img.isMain) || activeImages[0];
            const additionalImgs = activeImages.filter(img => img !== mainImg).map(img => ({ url: img.url, publicId: img.publicId }));

            if (mainImg) {
                formData.append('updatedImage', mainImg.url);
                formData.append('updatedImagePublicId', mainImg.publicId || '');
            } else {
                formData.append('updatedImage', '');
                formData.append('updatedImagePublicId', '');
            }
            formData.append('updatedAdditionalImages', JSON.stringify(additionalImgs));
        }

        const submitBtn = editForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">sync</span> جاري الحفظ...';
        submitBtn.disabled = true;

        try {
            const response = await adminFetch(`${API_URL}/${id}`, {
                method: 'PUT',
                body: formData
            });

            if (response.ok) {
                closeEditModal();
                showToast('✅ تم تحديث بيانات المنتج بنجاح!');
                loadAdminProducts(true);
            } else {
                const errorData = await response.json();
                alert(`خطأ: ${errorData.message}`);
            }
        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء الاتصال بالسيرفر.');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

// ==========================================
// CSV Export (includes image column)
// ==========================================
window.exportCSV = function() {
    if (!window.adminProducts || window.adminProducts.length === 0) {
        alert('لا توجد منتجات لتصديرها.');
        return;
    }

    const csvData = window.adminProducts.map(p => ({
        name: p.title,
        price: p.price,
        sku: p.sku || '',
        category: p.category,
        stockQuantity: p.stockQuantity || 0,
        publicBrand: p.publicBrand || '',
        description: p.description.join('\n'),
        warranty: p.warranty || '',
        image: p.image || ''
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", "technology_store_catalog.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// ==========================================
// CSV Import (Upsert)
// ==========================================
window.importCSV = function(input) {
    const file = input.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            const products = results.data;
            if (products.length === 0) {
                alert('الملف فارغ أو لا يحتوي على بيانات صحيحة.');
                input.value = '';
                return;
            }

            try {
                const response = await adminFetch(`${API_URL}/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(products)
                });

                if (response.ok) {
                    const data = await response.json();
                    showToast(`✅ تم معالجة ${data.count} منتج (${data.upserted || 0} جديد، ${data.modified || 0} محدّث)!`);
                    loadAdminProducts();
                } else {
                    const errorData = await response.json();
                    alert(`خطأ: ${errorData.message}`);
                }
            } catch (error) {
                console.error(error);
                alert('حدث خطأ أثناء استيراد المنتجات.');
            } finally {
                input.value = '';
            }
        },
        error: function(error) {
            console.error(error);
            alert('حدث خطأ أثناء قراءة ملف CSV.');
            input.value = '';
        }
    });
};

// ==========================================
// Initialize
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // حل مشكلة فلترة المتصفح الافتراضية للـ datalist عند فتح نافذة التعديل
    const editPCategory = document.getElementById('editPCategory');
    if (editPCategory) {
        let tempVal = '';
        editPCategory.addEventListener('focus', function() {
            tempVal = this.value;
            this.value = ''; // مسح القيمة مؤقتاً لكي يظهر المتصفح جميع أقسام الـ datalist
        });
        editPCategory.addEventListener('blur', function() {
            if (!this.value.trim()) {
                this.value = tempVal; // استعادة القسم الأصلي إذا خرج العميل دون كتابة/اختيار شيء
            }
        });
    }
});

// --- Backup & Restore ---
async function exportBackup() {
    try {
        showToast('جاري تحضير النسخة الاحتياطية...');
        const res = await adminFetch(`${BASE_URL}/api/backup`);
        if (!res.ok) throw new Error('فشل تحميل النسخة الاحتياطية');
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `technology-store-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showToast('تم تحميل النسخة الاحتياطية بنجاح');
    } catch (err) {
        console.error(err);
        showToast(err.message);
    }
}

async function importBackup() {
    const fileInput = document.getElementById('backupFileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        return showToast('الرجاء اختيار ملف النسخة الاحتياطية أولاً');
    }
    
    if (!confirm('تحذير خطير: سيتم مسح كافة المنتجات والأقسام الحالية نهائياً واستبدالها ببيانات هذا الملف. هل أنت متأكد من المتابعة؟')) {
        return;
    }
    
    try {
        showToast('جاري استعادة البيانات، الرجاء الانتظار وعدم إغلاق الصفحة...');
        
        const formData = new FormData();
        formData.append('backupFile', file);
        
        const res = await adminFetch(`${BASE_URL}/api/restore`, {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        
        if (res.ok) {
            showToast('تم استعادة النسخة الاحتياطية بنجاح! جاري إعادة تحميل الصفحة...');
            setTimeout(() => window.location.reload(), 2000);
        } else {
            showToast(`${data.message || 'فشل استعادة النسخة الاحتياطية'}: ${data.error || ''}`);
        }
    } catch (err) {
        console.error(err);
        showToast('حدث خطأ أثناء الاتصال بالخادم');
    }
}

// Theme Toggle Functionality for Admin
window.toggleTheme = function() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
};

// ==========================================
// Operations Dashboard / Orders / Media Center / Social Links
// ==========================================
const ORDER_STATUS_LABELS = {
    pending: 'جديد',
    received_by_pos: 'استلمه POS',
    processing: 'جاري التجهيز',
    completed: 'مكتمل',
    cancelled: 'ملغي'
};
const ORDER_STATUS_CLASSES = {
    pending: 'bg-surface-variant/30 text-orange-400 border-orange-500/30',
    received_by_pos: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    processing: 'bg-primary/10 text-primary border-primary/20',
    completed: 'bg-green-500/10 text-green-400 border-green-500/30',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/30'
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const formatMoney = (value) => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ج.م`;
const formatAdminDate = (value) => value ? new Date(value).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—';

window.loadDashboard = async function() {
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    try {
        const res = await adminFetch(`${BASE_URL}/api/admin/dashboard`);
        if (!res.ok) throw new Error((await res.json()).message || 'فشل تحميل لوحة المتابعة');
        const data = await res.json();
        setText('dashProductsTotal', data.products?.total ?? 0);
        setText('dashProductsVisible', data.products?.visible ?? 0);
        setText('dashLowStock', data.products?.lowStock ?? 0);
        setText('dashOutStock', data.products?.outOfStock ?? 0);
        setText('dashMissingImages', data.products?.missingImages ?? 0);
        setText('dashOrdersToday', data.orders?.today ?? 0);
        setText('dashTodaySales', formatMoney(data.orders?.todaySales || 0));

        const healthBadge = (ok, yes='متصل', no='غير متصل') => `<span class="px-2 py-1 rounded-full text-xs font-bold ${ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}">${ok ? yes : no}</span>`;
        const db = document.getElementById('healthDb'); if (db) db.innerHTML = healthBadge(data.health?.database === 'connected');
        const cloud = document.getElementById('healthCloudinary'); if (cloud) cloud.innerHTML = healthBadge(Boolean(data.health?.cloudinaryConfigured), 'مضبوط', 'غير مضبوط');
        const pos = document.getElementById('healthPos'); if (pos) pos.innerHTML = healthBadge(Boolean(data.health?.posConfigured), 'مربوط', 'غير مربوط');

        const ordersBox = document.getElementById('dashboardRecentOrders');
        if (ordersBox) {
            const orders = data.recentOrders || [];
            ordersBox.innerHTML = orders.length ? orders.map(o => `<button onclick="switchTab('orders'); setTimeout(()=>openOrderDetails('${o._id}'),120)" class="w-full text-right grid grid-cols-[1fr_auto] gap-3 p-3 rounded-lg bg-surface-container hover:bg-surface-variant/40 border border-outline-variant/20 transition-all"><div><div class="font-bold text-sm text-on-surface">${escapeHtml(o.orderNumber)}</div><div class="text-xs text-on-surface-variant mt-1">${escapeHtml(o.customerName)} · ${formatAdminDate(o.createdAt)}</div></div><div class="text-left"><div class="font-bold text-primary font-mono-data text-sm">${formatMoney(o.total)}</div><span class="inline-block mt-1 px-2 py-0.5 rounded-full border text-[10px] ${ORDER_STATUS_CLASSES[o.status] || ''}">${ORDER_STATUS_LABELS[o.status] || o.status}</span></div></button>`).join('') : '<p class="text-sm text-on-surface-variant text-center py-6">لا توجد طلبات حتى الآن.</p>';
        }

        const logsBox = document.getElementById('dashboardRecentLogs');
        if (logsBox) {
            const logs = data.recentLogs || [];
            logsBox.innerHTML = logs.length ? logs.map(l => `<div class="p-3 rounded-lg bg-surface-container border border-outline-variant/20"><p class="font-bold text-sm text-on-surface">${escapeHtml(l.action)}</p><p class="text-xs text-on-surface-variant mt-1 line-clamp-2">${escapeHtml(l.details)}</p><div class="flex justify-between gap-2 mt-2 text-[10px] text-on-surface-variant"><span>${escapeHtml(l.user || 'نظام')}</span><span>${formatAdminDate(l.timestamp)}</span></div></div>`).join('') : '<p class="text-sm text-on-surface-variant">لا توجد نشاطات مسجلة.</p>';
        }
    } catch (err) {
        console.error(err);
        showToast('❌ ' + err.message);
    }
};

window.ordersPage = 1;
window.ordersPages = 1;
window.adminOrdersCache = [];
let ordersReloadTimer = null;
window.scheduleOrdersReload = function() {
    clearTimeout(ordersReloadTimer);
    ordersReloadTimer = setTimeout(() => window.loadOrders(1), 350);
};

window.loadOrders = async function(page = 1) {
    if (!hasPermission('manage_orders')) return;
    page = Math.max(1, Number(page) || 1);
    const tbody = document.getElementById('ordersTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="p-10 text-center text-on-surface-variant">جاري تحميل الطلبات...</td></tr>';
    const search = document.getElementById('ordersSearchInput')?.value.trim() || '';
    const status = document.getElementById('ordersStatusFilter')?.value || '';
    try {
        const qs = new URLSearchParams({ page: String(page), limit: '25' });
        if (search) qs.set('search', search);
        if (status) qs.set('status', status);
        const res = await adminFetch(`${BASE_URL}/api/admin/orders?${qs}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'فشل تحميل الطلبات');
        window.ordersPage = data.page || 1;
        window.ordersPages = data.pages || 1;
        window.adminOrdersCache = data.orders || [];
        document.getElementById('ordersCountLabel').textContent = `${data.total || 0} طلب`;
        document.getElementById('ordersPageLabel').textContent = `${window.ordersPage} / ${window.ordersPages}`;
        document.getElementById('ordersPrevBtn').disabled = window.ordersPage <= 1;
        document.getElementById('ordersNextBtn').disabled = window.ordersPage >= window.ordersPages;
        if (!tbody) return;
        if (!window.adminOrdersCache.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-10 text-center text-on-surface-variant">لا توجد طلبات مطابقة.</td></tr>';
            return;
        }
        tbody.innerHTML = window.adminOrdersCache.map(o => `<tr class="border-b border-outline-variant/20 hover:bg-surface-variant/20"><td class="p-3"><div class="font-bold text-on-surface text-sm">${escapeHtml(o.orderNumber)}</div><div class="text-[11px] text-on-surface-variant">${o.items?.length || 0} منتج</div></td><td class="p-3"><div class="font-semibold text-sm">${escapeHtml(o.customerName)}</div><a href="tel:${escapeHtml(o.customerPhone)}" class="text-xs text-primary" dir="ltr">${escapeHtml(o.customerPhone)}</a></td><td class="p-3 font-bold text-primary font-mono-data">${formatMoney(o.total)}</td><td class="p-3"><select onchange="updateOrderStatus('${o._id}', this.value, this)" class="bg-surface-container border border-outline-variant rounded px-2 py-1.5 text-xs text-on-surface"><option value="pending" ${o.status==='pending'?'selected':''}>جديد</option><option value="received_by_pos" ${o.status==='received_by_pos'?'selected':''}>استلمه POS</option><option value="processing" ${o.status==='processing'?'selected':''}>جاري التجهيز</option><option value="completed" ${o.status==='completed'?'selected':''}>مكتمل</option><option value="cancelled" ${o.status==='cancelled'?'selected':''}>ملغي</option></select></td><td class="p-3 text-xs text-on-surface-variant">${formatAdminDate(o.createdAt)}</td><td class="p-3 text-center"><button onclick="openOrderDetails('${o._id}')" class="px-3 py-1.5 rounded bg-primary/10 text-primary border border-primary/20 text-xs font-bold">تفاصيل</button></td></tr>`).join('');
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-red-400">${escapeHtml(err.message)}</td></tr>`;
    }
};

window.updateOrderStatus = async function(id, status, selectEl) {
    const previous = window.adminOrdersCache.find(o => o._id === id)?.status || 'pending';
    if (selectEl) selectEl.disabled = true;
    try {
        const res = await adminFetch(`${BASE_URL}/api/admin/orders/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'تعذر تحديث الطلب');
        const found = window.adminOrdersCache.find(o => o._id === id); if (found) found.status = status;
        showToast('✅ تم تحديث حالة الطلب');
        if (window.loadDashboard) window.loadDashboard();
    } catch (err) {
        if (selectEl) selectEl.value = previous;
        showToast('❌ ' + err.message);
    } finally { if (selectEl) selectEl.disabled = false; }
};

window.openOrderDetails = function(id) {
    const order = window.adminOrdersCache.find(o => o._id === id);
    if (!order) { window.loadOrders(window.ordersPage).then(() => window.openOrderDetails(id)); return; }
    const modal = document.getElementById('orderDetailsModal');
    const box = document.getElementById('orderDetailsContent');
    if (!modal || !box) return;
    const items = (order.items || []).map(i => `<tr class="border-b border-outline-variant/20"><td class="py-2">${escapeHtml(i.title)}</td><td class="py-2 text-center">${i.quantity}</td><td class="py-2 text-left font-mono-data">${formatMoney(i.lineTotal)}</td></tr>`).join('');
    box.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5"><div class="p-3 bg-surface-container rounded-lg"><span class="text-xs text-on-surface-variant">رقم الطلب</span><p class="font-bold mt-1">${escapeHtml(order.orderNumber)}</p></div><div class="p-3 bg-surface-container rounded-lg"><span class="text-xs text-on-surface-variant">التاريخ</span><p class="font-bold mt-1">${formatAdminDate(order.createdAt)}</p></div><div class="p-3 bg-surface-container rounded-lg"><span class="text-xs text-on-surface-variant">العميل</span><p class="font-bold mt-1">${escapeHtml(order.customerName)}</p></div><div class="p-3 bg-surface-container rounded-lg"><span class="text-xs text-on-surface-variant">الهاتف</span><p class="font-bold mt-1" dir="ltr">${escapeHtml(order.customerPhone)}</p></div><div class="p-3 bg-surface-container rounded-lg md:col-span-2"><span class="text-xs text-on-surface-variant">العنوان</span><p class="font-bold mt-1">${escapeHtml(order.customerAddress)}</p></div></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-on-surface-variant border-b border-outline-variant/30"><th class="py-2 text-right">المنتج</th><th class="py-2 text-center">الكمية</th><th class="py-2 text-left">الإجمالي</th></tr></thead><tbody>${items}</tbody></table></div><div class="mt-5 p-4 rounded-lg bg-primary/5 border border-primary/20 flex justify-between items-center"><span class="font-bold">إجمالي الطلب</span><span class="text-xl font-bold text-primary font-mono-data">${formatMoney(order.total)}</span></div>${order.notes ? `<div class="mt-4 p-3 rounded-lg bg-surface-container"><span class="text-xs text-on-surface-variant">ملاحظات</span><p class="mt-1 text-sm">${escapeHtml(order.notes)}</p></div>` : ''}`;
    modal.classList.remove('hidden'); modal.classList.add('flex');
};
window.closeOrderDetails = function() { const m=document.getElementById('orderDetailsModal'); if(m){m.classList.add('hidden');m.classList.remove('flex');} };

window.mediaCenterData = [];
window.loadMediaCenter = async function() {
    if (!hasPermission('manage_media')) return;
    const grid = document.getElementById('mediaGrid');
    if (grid) grid.innerHTML = '<div class="col-span-full text-center text-on-surface-variant py-10">جاري فحص الصور...</div>';
    try {
        const res = await adminFetch(`${BASE_URL}/api/admin/media`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'فشل تحميل الصور');
        window.mediaCenterData = data.media || [];
        const set = (id,v) => { const e=document.getElementById(id); if(e)e.textContent=v; };
        set('mediaTotal', data.summary?.totalReferences || 0); set('mediaUnique', data.summary?.uniqueUrls || 0); set('mediaDuplicates', data.summary?.duplicateReferences || 0); set('mediaMissing', data.summary?.missingProducts || 0);
        window.renderMediaCenter();
    } catch(err) { if(grid) grid.innerHTML = `<div class="col-span-full text-center text-red-400 py-10">${escapeHtml(err.message)}</div>`; }
};
window.renderMediaCenter = function() {
    const grid = document.getElementById('mediaGrid'); if(!grid) return;
    const q=(document.getElementById('mediaSearchInput')?.value || '').trim().toLowerCase();
    const items=(window.mediaCenterData || []).filter(m => !q || String(m.productTitle||'').toLowerCase().includes(q) || String(m.category||'').toLowerCase().includes(q)).slice(0,300);
    grid.innerHTML = items.length ? items.map(m => `<article class="glass-panel rounded-xl border border-outline-variant/30 overflow-hidden"><div class="aspect-square bg-white/95 p-2"><img src="${escapeHtml(adminSafeImageUrl(m.url))}" onerror="handleAdminImageError(this)" class="w-full h-full object-contain" loading="lazy"></div><div class="p-3"><p class="font-bold text-xs text-on-surface line-clamp-2" title="${escapeHtml(m.productTitle)}">${escapeHtml(m.productTitle)}</p><div class="flex items-center justify-between gap-2 mt-2"><span class="text-[10px] text-on-surface-variant">${escapeHtml(m.category || '')}</span><span class="text-[9px] px-1.5 py-0.5 rounded ${m.isCloudinary?'bg-green-500/10 text-green-400':'bg-amber-500/10 text-amber-400'}">${m.isCloudinary?'Cloudinary':'خارجي/محلي'}</span></div></div></article>`).join('') : '<div class="col-span-full text-center text-on-surface-variant py-10">لا توجد صور مطابقة.</div>';
};

window.saveSocialSettings = async function() {
    const payload = new URLSearchParams();
    payload.set('whatsappNumber', document.getElementById('socialWhatsappNumber')?.value.trim() || '');
    payload.set('whatsappChannelUrl', document.getElementById('socialWhatsappChannel')?.value.trim() || '');
    payload.set('telegramUrl', document.getElementById('socialTelegramUrl')?.value.trim() || '');
    payload.set('facebookUrl', document.getElementById('socialFacebookUrl')?.value.trim() || '');
    payload.set('instagramUrl', document.getElementById('socialInstagramUrl')?.value.trim() || '');
    payload.set('tiktokUrl', document.getElementById('socialTiktokUrl')?.value.trim() || '');
    payload.set('xUrl', document.getElementById('socialXUrl')?.value.trim() || '');
    try {
        const res = await adminFetch(`${BASE_URL}/api/settings`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:payload.toString() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'فشل حفظ الروابط');
        showToast('✅ تم تحديث روابط التواصل على الموقع');
        loadStoreSettings();
    } catch(err) { showToast('❌ ' + err.message); }
};

// ==========================================
// Analytics Dashboard Logic
// ==========================================
window.renderAnalyticsData = function(analytics) {
    // Summary cards
    const totalVisitsEl = document.getElementById('stat-total-visits');
    const totalProductsEl = document.getElementById('stat-total-products');
    const totalCartEl = document.getElementById('stat-total-cart');
    const totalOrdersEl = document.getElementById('stat-total-orders');

    if (totalVisitsEl) totalVisitsEl.textContent = analytics.total_visits || 0;
    if (totalProductsEl) totalProductsEl.textContent = window.adminProducts ? window.adminProducts.length : 0;
    
    let totalCart = 0;
    Object.values(analytics.cart_adds || {}).forEach(item => totalCart += (item.count || 0));
    if (totalCartEl) totalCartEl.textContent = totalCart;

    let totalOrders = 0;
    Object.values(analytics.whatsapp_orders || {}).forEach(item => totalOrders += (item.count || 0));
    if (totalOrdersEl) totalOrdersEl.textContent = totalOrders;

    // Top views
    const topViewsContainer = document.getElementById('analytics-top-views');
    if (topViewsContainer) {
        const viewsList = Object.values(analytics.views || {}).sort((a, b) => b.count - a.count).slice(0, 10);
        if (viewsList.length === 0) {
            topViewsContainer.innerHTML = '<p class="text-on-surface-variant text-sm text-center py-4">لا توجد بيانات حتى الآن</p>';
        } else {
            topViewsContainer.innerHTML = viewsList.map((item, idx) => `
                <div class="flex items-center justify-between p-3 bg-surface-container rounded-lg border border-outline-variant/20">
                    <div class="flex items-center gap-3">
                        <span class="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">${idx + 1}</span>
                        <span class="text-on-surface font-semibold text-sm line-clamp-1">${item.title}</span>
                    </div>
                    <span class="text-primary font-mono-data font-bold text-sm shrink-0">${item.count} 👁</span>
                </div>
            `).join('');
        }
    }

    // Top orders
    const topOrdersContainer = document.getElementById('analytics-top-orders');
    if (topOrdersContainer) {
        const ordersList = Object.values(analytics.whatsapp_orders || {}).sort((a, b) => b.count - a.count).slice(0, 10);
        if (ordersList.length === 0) {
            topOrdersContainer.innerHTML = '<p class="text-on-surface-variant text-sm text-center py-4">لا توجد بيانات حتى الآن</p>';
        } else {
            topOrdersContainer.innerHTML = ordersList.map((item, idx) => `
                <div class="flex items-center justify-between p-3 bg-surface-container rounded-lg border border-outline-variant/20">
                    <div class="flex items-center gap-3">
                        <span class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">${idx + 1}</span>
                        <span class="text-on-surface font-semibold text-sm line-clamp-1">${item.title}</span>
                    </div>
                    <span class="text-emerald-400 font-mono-data font-bold text-sm shrink-0">${item.count} 📦</span>
                </div>
            `).join('');
        }
    }

    // Category distribution
    const catContainer = document.getElementById('analytics-categories');
    if (catContainer && window.adminProducts) {
        const catCounts = {};
        window.adminProducts.forEach(p => {
            const c = p.category || 'غير مصنف';
            catCounts[c] = (catCounts[c] || 0) + 1;
        });
        const totalP = window.adminProducts.length || 1;
        const catList = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
        if (catList.length === 0) {
            catContainer.innerHTML = '<p class="text-on-surface-variant text-sm text-center py-4">لا توجد منتجات</p>';
        } else {
            catContainer.innerHTML = catList.map(([cat, count]) => {
                const percent = Math.round((count / totalP) * 100);
                return `
                    <div class="p-3 bg-surface-container rounded-lg border border-outline-variant/20">
                        <div class="flex justify-between text-sm mb-1">
                            <span class="text-on-surface font-semibold">${cat}</span>
                            <span class="text-secondary font-mono-data font-bold">${count} منتج (${percent}%)</span>
                        </div>
                        <div class="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                            <div class="bg-secondary h-full rounded-full transition-all duration-500" style="width: ${percent}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Page visits
    const pagesContainer = document.getElementById('analytics-pages');
    if (pagesContainer) {
        const pagesList = Object.entries(analytics.page_visits || {}).sort((a, b) => b[1] - a[1]);
        if (pagesList.length === 0) {
            pagesContainer.innerHTML = '<p class="text-on-surface-variant text-sm text-center py-4">لا توجد بيانات حتى الآن</p>';
        } else {
            pagesContainer.innerHTML = pagesList.map(([page, count]) => `
                <div class="flex items-center justify-between p-3 bg-surface-container rounded-lg border border-outline-variant/20">
                    <span class="text-on-surface font-semibold text-sm dir-ltr text-right">${page}</span>
                    <span class="text-tertiary font-mono-data font-bold text-sm shrink-0">${count} زيارة</span>
                </div>
            `).join('');
        }
    }
};

window.loadAnalytics = async function() {
    const localAnalytics = JSON.parse(localStorage.getItem('tech_store_analytics') || '{"views":{},"cart_adds":{},"whatsapp_orders":{},"page_visits":{},"total_visits":0,"daily_visits":{}}');
    window.renderAnalyticsData(localAnalytics);

    // جلب الإحصائيات المركزية من السيرفر (لتشمل زيارات وطلبات الهواتف والأجهزة الأخرى)
    try {
        const res = await adminFetch(`${BASE_URL}/api/analytics`);
        if (res.ok) {
            const serverAnalytics = await res.json();
            localStorage.setItem('tech_store_analytics', JSON.stringify(serverAnalytics));
            window.renderAnalyticsData(serverAnalytics);
        }
        
        // جلب سجل الزوار الفريدين
        await window.loadUniqueVisitors();
    } catch (err) {
        console.log('يعمل بالنظام المحلي مؤقتاً لحين الاتصال بالسيرفر');
    }
};

window.loadUniqueVisitors = async function() {
    try {
        const res = await adminFetch(`${BASE_URL}/api/analytics/visitors`);
        if (res.ok) {
            const data = await res.json();
            document.getElementById('stat-unique-visitors').textContent = data.uniqueCount || 0;
            
            const tbody = document.getElementById('analytics-visitors-table');
            if (tbody) {
                if (!data.visitors || data.visitors.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-on-surface-variant text-sm">لا يوجد زوار بعد</td></tr>';
                    return;
                }
                
                tbody.innerHTML = data.visitors.map(v => {
                    const date = new Date(v.timestamp).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
                    return `
                        <tr class="border-b border-outline-variant/30 text-sm hover:bg-surface-variant/30 transition-colors">
                            <td class="py-3 px-4 font-mono-data dir-ltr text-right">${date}</td>
                            <td class="py-3 px-4 text-secondary font-semibold">
                                <div class="flex flex-col">
                                    <span>${v.location || 'موقع غير معروف'}</span>
                                    <span class="text-xs text-on-surface-variant font-mono-data">${v.ip || 'IP غير متاح'}</span>
                                </div>
                            </td>
                            <td class="py-3 px-4 text-on-surface-variant font-mono-data text-xs dir-ltr truncate" title="${v.device || 'غير معروف'}">${v.device || 'غير معروف'}</td>
                            <td class="py-3 px-4 text-on-surface-variant max-w-[150px] truncate dir-ltr text-right" title="${v.referrer || 'مباشر'}">${v.referrer || 'مباشر'}</td>
                            <td class="py-3 px-4"><span class="px-2 py-1 bg-primary/10 text-primary rounded-md text-xs">${v.utmSource || 'عضوي'}</span></td>
                        </tr>
                    `;
                }).join('');
            }
        }
    } catch (error) {
        console.error('Error fetching visitors:', error);
    }
};

window.resetAnalytics = async function() {
    if (confirm('هل أنت متأكد من رغبتك في تصفير جميع الإحصائيات؟ لا يمكن التراجع عن هذا الإجراء.')) {
        localStorage.setItem('tech_store_analytics', '{"views":{},"cart_adds":{},"whatsapp_orders":{},"page_visits":{},"total_visits":0,"daily_visits":{}}');
        try {
            await adminFetch(`${BASE_URL}/api/analytics/reset`, { method: 'POST' });
        } catch (err) {}
        window.loadAnalytics();
        showToast('تم تصفير الإحصائيات بنجاح');
    }
};

window.exportAnalyticsExcel = async function() {
    const analytics = JSON.parse(localStorage.getItem('tech_store_analytics') || '{}');
    
    showToast('جاري تجهيز ملف Excel للإحصائيات...');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Technology Store';
    workbook.created = new Date();

    // Helper to style header
    const styleHeader = (worksheet) => {
        const headerRow = worksheet.getRow(1);
        headerRow.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 30;
    };

    // Helper to format cells
    const styleDataRows = (worksheet) => {
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.font = { name: 'Arial', size: 11 };
                row.alignment = { vertical: 'middle', horizontal: 'center' };
                row.eachCell(cell => {
                    cell.border = {
                        top: {style:'thin', color: {argb:'FFCCCCCC'}},
                        left: {style:'thin', color: {argb:'FFCCCCCC'}},
                        bottom: {style:'thin', color: {argb:'FFCCCCCC'}},
                        right: {style:'thin', color: {argb:'FFCCCCCC'}}
                    };
                });
            }
        });
    };

    // 1. General Stats
    const ws1 = workbook.addWorksheet('نظرة عامة', { views: [{ rightToLeft: true }] });
    ws1.columns = [
        { header: 'المقياس', key: 'metric', width: 40 },
        { header: 'القيمة', key: 'value', width: 20 }
    ];
    styleHeader(ws1);
    ws1.addRow({ metric: 'إجمالي الزيارات', value: analytics.total_visits || 0 });
    ws1.addRow({ metric: 'إجمالي المنتجات', value: window.adminProducts ? window.adminProducts.length : 0 });
    ws1.addRow({ metric: 'مرات الإضافة للسلة', value: Object.values(analytics.cart_adds || {}).reduce((sum, item) => sum + item.count, 0) });
    ws1.addRow({ metric: 'إجمالي طلبات واتساب', value: Object.values(analytics.whatsapp_orders || {}).reduce((sum, item) => sum + item.count, 0) });
    styleDataRows(ws1);

    // 2. Top Products (Views)
    const viewsData = Object.values(analytics.views || {}).map(item => ({ title: item.title, count: item.count }));
    if (viewsData.length > 0) {
        const ws2 = workbook.addWorksheet('مشاهدات المنتجات', { views: [{ rightToLeft: true }] });
        ws2.columns = [ { header: 'المنتج', key: 'title', width: 50 }, { header: 'المشاهدات', key: 'count', width: 20 } ];
        styleHeader(ws2);
        viewsData.sort((a,b) => b.count - a.count).forEach(row => ws2.addRow(row));
        styleDataRows(ws2);
    }

    // 3. Cart Adds
    const cartData = Object.values(analytics.cart_adds || {}).map(item => ({ title: item.title, count: item.count }));
    if (cartData.length > 0) {
        const ws3 = workbook.addWorksheet('إضافات السلة', { views: [{ rightToLeft: true }] });
        ws3.columns = [ { header: 'المنتج', key: 'title', width: 50 }, { header: 'مرات الإضافة', key: 'count', width: 20 } ];
        styleHeader(ws3);
        cartData.sort((a,b) => b.count - a.count).forEach(row => ws3.addRow(row));
        styleDataRows(ws3);
    }

    // 4. WhatsApp Orders
    const whatsappData = Object.values(analytics.whatsapp_orders || {}).map(item => ({ title: item.title, count: item.count }));
    if (whatsappData.length > 0) {
        const ws4 = workbook.addWorksheet('طلبات واتساب', { views: [{ rightToLeft: true }] });
        ws4.columns = [ { header: 'المنتج', key: 'title', width: 50 }, { header: 'الطلبات', key: 'count', width: 20 } ];
        styleHeader(ws4);
        whatsappData.sort((a,b) => b.count - a.count).forEach(row => ws4.addRow(row));
        styleDataRows(ws4);
    }

    // 5. Unique Visitors
    try {
        const res = await adminFetch(`${BASE_URL}/api/analytics/visitors`);
        if (res.ok) {
            const data = await res.json();
            if (data.visitors && data.visitors.length > 0) {
                const ws5 = workbook.addWorksheet('سجل الزوار', { views: [{ rightToLeft: true }] });
                ws5.columns = [
                    { header: 'التاريخ والوقت', key: 'date', width: 25 },
                    { header: 'الموقع', key: 'location', width: 30 },
                    { header: 'الجهاز', key: 'device', width: 25 },
                    { header: 'المصدر (Referrer)', key: 'referrer', width: 40 },
                    { header: 'حملة (UTM)', key: 'utm', width: 20 }
                ];
                styleHeader(ws5);
                data.visitors.forEach(v => {
                    ws5.addRow({
                        date: new Date(v.timestamp).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }),
                        location: v.location || 'غير معروف',
                        device: v.device || 'غير معروف',
                        referrer: v.referrer || 'مباشر',
                        utm: v.utmSource || 'عضوي'
                    });
                });
                styleDataRows(ws5);
            }
        }
    } catch(e) {}

    try {
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `إحصائيات_تكنولوجي_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('✅ تم تصدير بيانات الإحصائيات بنجاح!');
    } catch (err) {
        console.error('Excel export error:', err);
        alert('حدث خطأ أثناء التصدير');
    }
};

window.exportAnalyticsPDF = async function() {
    const analytics = JSON.parse(localStorage.getItem('tech_store_analytics') || '{}');
    
    // إعداد البيانات
    const totalVisits = analytics.total_visits || 0;
    const totalProducts = window.adminProducts ? window.adminProducts.length : 0;
    const totalCart = Object.values(analytics.cart_adds || {}).reduce((sum, item) => sum + item.count, 0);
    const totalWhatsapp = Object.values(analytics.whatsapp_orders || {}).reduce((sum, item) => sum + item.count, 0);

    const viewsData = Object.values(analytics.views || {}).sort((a,b) => b.count - a.count).slice(0, 20);
    const whatsappData = Object.values(analytics.whatsapp_orders || {}).sort((a,b) => b.count - a.count).slice(0, 20);

    // زوار فريدين
    let visitorsHtml = '';
    try {
        const res = await adminFetch(`${BASE_URL}/api/analytics/visitors`);
        if (res.ok) {
            const data = await res.json();
            if (data.visitors && data.visitors.length > 0) {
                const latestVisitors = data.visitors.slice(0, 50); // أول 50 زائر في التقرير
                latestVisitors.forEach(v => {
                    visitorsHtml += `
                        <tr style="border-bottom: 1px solid #e5e7eb;">
                            <td style="padding: 8px; border-left: 1px solid #e5e7eb; direction: ltr; text-align: right;">${new Date(v.timestamp).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</td>
                            <td style="padding: 8px; border-left: 1px solid #e5e7eb;">${v.location || 'غير معروف'}</td>
                            <td style="padding: 8px; border-left: 1px solid #e5e7eb; direction: ltr; text-align: right;">${v.device || 'غير معروف'}</td>
                            <td style="padding: 8px; border-left: 1px solid #e5e7eb; direction: ltr; text-align: right;">${v.referrer || 'مباشر'}</td>
                        </tr>
                    `;
                });
            }
        }
    } catch(e) {}

    const printWindow = window.open('', '_blank');
    const html = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="utf-8">
            <title>تقرير الإحصائيات - Technology Store</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 0;
                    padding: 20px;
                    color: #1f2937;
                    font-size: 13px;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    border-bottom: 2px solid #3b82f6;
                    padding-bottom: 10px;
                }
                .header h1 { margin: 0; color: #1e3a8a; }
                .header p { margin: 5px 0 0; color: #6b7280; font-size: 14px; }
                
                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 15px;
                    margin-bottom: 30px;
                }
                .summary-card {
                    background: #f3f4f6;
                    padding: 15px;
                    border-radius: 8px;
                    text-align: center;
                    border: 1px solid #e5e7eb;
                }
                .summary-card h3 { margin: 0 0 5px; font-size: 13px; color: #4b5563; }
                .summary-card p { margin: 0; font-size: 20px; font-weight: bold; color: #2563eb; direction: ltr; }
                
                .section-title {
                    background-color: #1e3a8a;
                    color: white;
                    padding: 8px 12px;
                    margin-top: 30px;
                    margin-bottom: 15px;
                    border-radius: 4px;
                    font-size: 15px;
                }

                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th { background-color: #3b82f6; color: white; padding: 10px; border: 1px solid #2563eb; }
                td { border: 1px solid #e5e7eb; }
                
                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

                @media print {
                    body { padding: 0; }
                    .header { margin-top: 0; }
                    .section-title { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .summary-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    @page { size: A4 portrait; margin: 10mm; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>التقرير الشامل للإحصائيات</h1>
                <p>Technology Store | تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</p>
            </div>
            
            <div class="summary-grid">
                <div class="summary-card">
                    <h3>إجمالي الزيارات</h3>
                    <p>${totalVisits}</p>
                </div>
                <div class="summary-card">
                    <h3>إجمالي المنتجات</h3>
                    <p>${totalProducts}</p>
                </div>
                <div class="summary-card" style="border-bottom: 3px solid #8b5cf6;">
                    <h3>إضافات السلة</h3>
                    <p style="color: #8b5cf6;">${totalCart}</p>
                </div>
                <div class="summary-card" style="border-bottom: 3px solid #10b981;">
                    <h3>طلبات واتساب</h3>
                    <p style="color: #10b981;">${totalWhatsapp}</p>
                </div>
            </div>

            <div class="grid-2">
                <div>
                    <div class="section-title">أكثر المنتجات مشاهدة</div>
                    <table>
                        <thead>
                            <tr>
                                <th>اسم المنتج</th>
                                <th style="width: 25%">المشاهدات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${viewsData.map(item => `
                                <tr>
                                    <td style="padding: 8px;">${item.title}</td>
                                    <td style="padding: 8px; text-align: center; font-weight: bold;">${item.count}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="2" style="text-align:center; padding: 10px;">لا توجد بيانات</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <div>
                    <div class="section-title" style="background-color: #065f46;">أكثر المنتجات طلباً (واتساب)</div>
                    <table>
                        <thead>
                            <tr>
                                <th style="background-color: #10b981;">اسم المنتج</th>
                                <th style="background-color: #10b981; width: 25%">الطلبات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${whatsappData.map(item => `
                                <tr>
                                    <td style="padding: 8px;">${item.title}</td>
                                    <td style="padding: 8px; text-align: center; font-weight: bold; color: #047857;">${item.count}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="2" style="text-align:center; padding: 10px;">لا توجد بيانات</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style="page-break-before: always;"></div>
            
            <div class="section-title" style="background-color: #1f2937;">أحدث الزوار الفريدين</div>
            ${visitorsHtml ? `
                <table>
                    <thead>
                        <tr>
                            <th style="background-color: #374151;">التاريخ والوقت</th>
                            <th style="background-color: #374151;">الموقع</th>
                            <th style="background-color: #374151;">الجهاز المتصل</th>
                            <th style="background-color: #374151;">مصدر الزيارة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${visitorsHtml}
                    </tbody>
                </table>
            ` : '<p style="text-align:center;">لا توجد بيانات للزوار حالياً</p>'}

            <script>
                window.onload = function() {
                    window.print();
                }
            </script>
        </body>
        </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
};

window.openAnalyticsDetails = function(type) {
    const analytics = JSON.parse(localStorage.getItem('tech_store_analytics') || '{}');
    const modal = document.getElementById('analyticsDetailsModal');
    const title = document.getElementById('analyticsDetailsTitle');
    const list = document.getElementById('analyticsDetailsList');
    
    if (!modal || !title || !list) return;
    
    list.innerHTML = '';
    
    let dataObj = {};
    let icon = '';
    
    if (type === 'cart') {
        title.innerHTML = '<span class="material-symbols-outlined text-tertiary">shopping_cart</span> تفاصيل المنتجات المضافة للسلة';
        dataObj = analytics.cart_adds || {};
        icon = '<span class="material-symbols-outlined text-tertiary text-sm">add_shopping_cart</span>';
    } else if (type === 'whatsapp') {
        title.innerHTML = '<span class="material-symbols-outlined text-emerald-400">chat</span> تفاصيل طلبات الواتساب';
        dataObj = analytics.whatsapp_orders || {};
        icon = '<span class="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>';
    }
    
    const items = Object.values(dataObj).sort((a, b) => b.count - a.count);
    
    if (items.length === 0) {
        list.innerHTML = '<li class="text-center text-on-surface-variant py-4">لا توجد بيانات متاحة</li>';
    } else {
        list.innerHTML = items.map(item => `
            <li class="flex items-center justify-between p-3 bg-surface-container rounded-lg border border-outline-variant/20 hover:bg-surface-variant/30 transition-colors">
                <span class="text-on-surface font-semibold text-sm flex items-center gap-2">${icon} ${item.title}</span>
                <span class="text-on-surface-variant font-mono-data font-bold text-sm bg-surface-container-high px-2 py-1 rounded-md shrink-0">${item.count} مرات</span>
            </li>
        `).join('');
    }
    
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);
};

window.closeAnalyticsDetailsModal = function() {
    const modal = document.getElementById('analyticsDetailsModal');
    if (modal) {
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }
};

// ==========================================
// Inventory Reporting (Excel & PDF via Print)
// ==========================================
window.updateInventoryReportUI = function() {
    if (!window.adminProducts) return;
    
    let inStock = 0;
    let lowStock = 0;
    let outStock = 0;

    window.adminProducts.forEach(p => {
        const qty = p.stockQuantity !== undefined ? p.stockQuantity : 1;
        if (qty === 0) outStock++;
        else if (qty <= 3) lowStock++;
        else inStock++;
    });

    const inEl = document.getElementById('inv-in-stock');
    const lowEl = document.getElementById('inv-low-stock');
    const outEl = document.getElementById('inv-out-stock');

    if (inEl) inEl.textContent = inStock;
    if (lowEl) lowEl.textContent = lowStock;
    if (outEl) outEl.textContent = outStock;
};

// Call it when products are loaded
const originalLoadAdminProducts = window.loadAdminProducts;
window.loadAdminProducts = async function(preserveState = false) {
    await originalLoadAdminProducts(preserveState);
    if (window.updateInventoryReportUI) window.updateInventoryReportUI();
};

window.exportInventoryExcel = async function() {
    if (!window.adminProducts || window.adminProducts.length === 0) {
        showToast('لا توجد منتجات لتصديرها');
        return;
    }

    try {
        showToast('جاري تجهيز ملف Excel...');
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Technology Store';
        workbook.created = new Date();
        
        const worksheet = workbook.addWorksheet('تقرير المخزون', {
            views: [{ rightToLeft: true }]
        });

        // Add headers
        worksheet.columns = [
            { header: 'الرقم', key: 'index', width: 8 },
            { header: 'اسم المنتج', key: 'title', width: 40 },
            { header: 'القسم', key: 'category', width: 20 },
            { header: 'الكمية المتاحة', key: 'qty', width: 15 },
            { header: 'حالة المخزون', key: 'status', width: 20 },
            { header: 'السعر (ج.م)', key: 'price', width: 15 },
            { header: 'سيريال (SKU)', key: 'sku', width: 20 },
        ];

        // Style the header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { name: 'Arial', family: 4, size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 30;

        // Add data
        window.adminProducts.forEach((p, idx) => {
            const qty = p.stockQuantity !== undefined ? p.stockQuantity : 1;
            let status = '';
            let color = ''; // ARGB

            if (qty === 0) {
                status = 'غير متوفر (0)';
                color = 'FFFFE4E6'; // Light red bg
            } else if (qty <= 3) {
                status = 'نواقص (' + qty + ')';
                color = 'FFFFEDD5'; // Light orange bg
            } else {
                status = 'متوفر';
                color = 'FFDCFCE7'; // Light green bg
            }

            const row = worksheet.addRow({
                index: idx + 1,
                title: p.title,
                category: p.category || '',
                qty: qty,
                status: status,
                price: p.price,
                sku: p.sku || ''
            });

            row.font = { name: 'Arial', size: 11 };
            row.alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell('title').alignment = { vertical: 'middle', horizontal: 'right' };
            
            // Colorize based on stock
            row.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: color }
                };
                cell.border = {
                    top: {style:'thin', color: {argb:'FFCCCCCC'}},
                    left: {style:'thin', color: {argb:'FFCCCCCC'}},
                    bottom: {style:'thin', color: {argb:'FFCCCCCC'}},
                    right: {style:'thin', color: {argb:'FFCCCCCC'}}
                };
            });
            
            // Specific text colors for the status column
            const statusCell = row.getCell('status');
            statusCell.font = { 
                name: 'Arial', 
                size: 11, 
                bold: true,
                color: { argb: qty === 0 ? 'FFE11D48' : (qty <= 3 ? 'FFEA580C' : 'FF16A34A') } 
            };
        });

        // Generate and save file
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `تقرير_مخزون_تكنولوجي_${new Date().toISOString().split('T')[0]}.xlsx`);
        
        showToast('✅ تم التصدير بنجاح!');
    } catch (err) {
        console.error('Excel export error:', err);
        alert('حدث خطأ أثناء تصدير Excel');
    }
};

window.printInventoryReport = function() {
    if (!window.adminProducts || window.adminProducts.length === 0) {
        showToast('لا توجد بيانات لطباعتها');
        return;
    }

    // Sort: Out of stock first, then low stock, then available
    const sortedProducts = [...window.adminProducts].sort((a, b) => {
        const qtyA = a.stockQuantity !== undefined ? a.stockQuantity : 1;
        const qtyB = b.stockQuantity !== undefined ? b.stockQuantity : 1;
        return qtyA - qtyB; // Ascending order
    });

    let totalQty = 0;
    let totalValue = 0;
    
    let rowsHtml = '';
    sortedProducts.forEach((p, idx) => {
        const qty = p.stockQuantity !== undefined ? p.stockQuantity : 1;
        const priceNum = parseFloat(p.price.toString().replace(/[^0-9.]/g, '')) || 0;
        
        totalQty += qty;
        totalValue += (qty * priceNum);

        let bgClass = '';
        let statusText = '';
        if (qty === 0) {
            bgClass = 'background-color: #fee2e2; color: #991b1b;';
            statusText = 'نفذت الكمية';
        } else if (qty <= 3) {
            bgClass = 'background-color: #ffedd5; color: #9a3412;';
            statusText = 'نواقص';
        } else {
            bgClass = 'background-color: #dcfce7; color: #166534;';
            statusText = 'متوفر';
        }

        rowsHtml += `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px; border-left: 1px solid #e5e7eb; text-align: center;">${idx + 1}</td>
                <td style="padding: 10px; border-left: 1px solid #e5e7eb; font-weight: bold;">${p.title}</td>
                <td style="padding: 10px; border-left: 1px solid #e5e7eb;">${p.category || '-'}</td>
                <td style="padding: 10px; border-left: 1px solid #e5e7eb; text-align: center; font-family: monospace;">${p.sku || '-'}</td>
                <td style="padding: 10px; border-left: 1px solid #e5e7eb; text-align: center; font-weight: bold; ${bgClass}">${qty}</td>
                <td style="padding: 10px; border-left: 1px solid #e5e7eb; text-align: center; font-weight: bold; ${bgClass}">${statusText}</td>
            </tr>
        `;
    });

    const printWindow = window.open('', '_blank');
    const html = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="utf-8">
            <title>تقرير المخزون - Technology Store</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 0;
                    padding: 20px;
                    color: #1f2937;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    border-bottom: 2px solid #3b82f6;
                    padding-bottom: 10px;
                }
                .header h1 { margin: 0; color: #1e3a8a; }
                .header p { margin: 5px 0 0; color: #6b7280; font-size: 14px; }
                
                .summary {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 20px;
                    background: #f3f4f6;
                    padding: 15px;
                    border-radius: 8px;
                }
                .summary-item { text-align: center; }
                .summary-item h3 { margin: 0 0 5px; font-size: 14px; color: #4b5563; }
                .summary-item p { margin: 0; font-size: 18px; font-weight: bold; color: #2563eb; direction: ltr;}
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                }
                th {
                    background-color: #3b82f6;
                    color: white;
                    padding: 12px 10px;
                    border: 1px solid #2563eb;
                }
                td { border: 1px solid #e5e7eb; }
                
                @media print {
                    body { padding: 0; }
                    .header { margin-top: 0; }
                    @page { size: A4 portrait; margin: 10mm; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>تقرير حالة المخزون</h1>
                <p>Technology Store | تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</p>
            </div>
            
            <div class="summary">
                <div class="summary-item">
                    <h3>إجمالي عدد المنتجات</h3>
                    <p>${sortedProducts.length}</p>
                </div>
                <div class="summary-item">
                    <h3>إجمالي القطع المتاحة</h3>
                    <p>${totalQty}</p>
                </div>
                <div class="summary-item">
                    <h3>نواقص وغير متوفر</h3>
                    <p style="color: #dc2626;">${sortedProducts.filter(p => (p.stockQuantity !== undefined ? p.stockQuantity : 1) <= 3).length}</p>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 5%">#</th>
                        <th style="width: 40%">اسم المنتج</th>
                        <th style="width: 15%">القسم</th>
                        <th style="width: 15%">SKU</th>
                        <th style="width: 10%">الكمية</th>
                        <th style="width: 15%">الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <script>
                window.onload = function() {
                    window.print();
                }
            </script>
        </body>
        </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
};

// ==========================================
// Activity Logs System
// ==========================================
async function fetchAdminLogs() {
    try {
        const tbody = document.getElementById('adminLogsTableBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-on-surface-variant"><span class="material-symbols-outlined animate-spin inline-block text-[24px]">sync</span> جاري تحميل السجل...</td></tr>`;

        const response = await adminFetch(`${BASE_URL}/api/admin/logs?limit=100&_t=${Date.now()}`, {
            cache: 'no-store'
        });
        
        let logs = [];
        try {
            logs = await response.json();
        } catch(e) {
            console.error("Failed to parse JSON:", e);
            if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-error">السيرفر لم يرسل استجابة صحيحة.</td></tr>`;
            return;
        }
        
        if (response.ok) {
            renderAdminLogs(logs);
        } else {
            if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-error">خطأ في تحميل السجل: ${logs.message || 'غير معروف'}</td></tr>`;
        }
    } catch (err) {
        console.error('Error fetching logs:', err);
        const tbody = document.getElementById('adminLogsTableBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-error">فشل الاتصال بالسيرفر</td></tr>`;
    }
}

function renderAdminLogs(logs) {
    const tbody = document.getElementById('adminLogsTableBody');
    if (!tbody) return;

    if (!logs || !Array.isArray(logs) || logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-on-surface-variant">لا توجد أي نشاطات مسجلة حتى الآن</td></tr>`;
        return;
    }

    tbody.innerHTML = logs.map(log => {
        const date = new Date(log.timestamp);
        const dateString = date.toLocaleDateString('ar-EG');
        const timeString = date.toLocaleTimeString('ar-EG');
        
        let actionIcon = 'info';
        let actionColor = 'text-primary';
        
        if (log.action.includes('إضافة')) { actionIcon = 'add_circle'; actionColor = 'text-green-500'; }
        else if (log.action.includes('تعديل')) { actionIcon = 'edit'; actionColor = 'text-blue-500'; }
        else if (log.action.includes('حذف')) { actionIcon = 'delete'; actionColor = 'text-red-500'; }
        else if (log.action.includes('استيراد') || log.action.includes('استعادة')) { actionIcon = 'publish'; actionColor = 'text-purple-500'; }

        return `
            <tr class="border-b border-outline-variant/30 hover:bg-surface-variant/30 transition-colors">
                <td class="py-3 px-4 whitespace-nowrap">
                    <div class="flex flex-col">
                        <span class="font-bold">${dateString}</span>
                        <span class="text-xs text-on-surface-variant">${timeString}</span>
                    </div>
                </td>
                <td class="py-3 px-4 font-bold text-on-surface">${log.user}</td>
                <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined ${actionColor} text-[18px]">${actionIcon}</span>
                        <span class="font-semibold">${log.action}</span>
                    </div>
                </td>
                <td class="py-3 px-4 text-on-surface-variant text-xs leading-relaxed max-w-sm truncate" title="${log.details}">
                    ${log.details}
                </td>
            </tr>
        `;
    }).join('');
}

window.fetchAdminLogs = fetchAdminLogs;

// ==========================================
// Export Logs
// ==========================================
window.exportLogsToCSV = function() {
    const tbody = document.getElementById('adminLogsTableBody');
    if (!tbody || tbody.innerText.includes('لا توجد') || tbody.innerText.includes('جاري تحميل')) {
        alert('لا توجد بيانات لتصديرها');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "التاريخ والوقت,المستخدم,الإجراء,التفاصيل\n";

    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 4) {
            const dateText = cells[0].innerText.replace(/\n/g, ' ').replace(/"/g, '""');
            const userText = cells[1].innerText.replace(/"/g, '""');
            const actionText = cells[2].innerText.replace(/"/g, '""');
            const detailsText = cells[3].innerText.replace(/"/g, '""');
            csvContent += `"${dateText}","${userText}","${actionText}","${detailsText}"\n`;
        }
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `activity_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.exportLogsToPDF = function() {
    const tbody = document.getElementById('adminLogsTableBody');
    if (!tbody || tbody.innerText.includes('لا توجد') || tbody.innerText.includes('جاري تحميل')) {
        alert('لا توجد بيانات لتصديرها');
        return;
    }

    const printWindow = window.open('', '_blank');
    let rowsHtml = '';
    
    tbody.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 4) {
            const dateText = cells[0].innerText.replace(/\n/g, ' - ');
            rowsHtml += `
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">${dateText}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${cells[1].innerText}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; color: #0284c7;">${cells[2].innerText}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px;">${cells[3].innerText}</td>
                </tr>
            `;
        }
    });

    const html = `
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>تقرير سجل النشاطات - Technology Store</title>
            <style>
                body { font-family: Tahoma, Arial, sans-serif; padding: 20px; color: #333; }
                h1 { text-align: center; color: #2563eb; margin-bottom: 20px; }
                .meta { text-align: left; margin-bottom: 20px; font-size: 14px; color: #666; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.05); }
                th { background-color: #f8fafc; padding: 12px 8px; text-align: right; border: 1px solid #ddd; color: #475569; }
                td { text-align: right; }
                tr:nth-child(even) { background-color: #f9fafb; }
            </style>
        </head>
        <body>
            <h1>تقرير سجل النشاطات (Activity Logs)</h1>
            <div class="meta">تاريخ الاستخراج: ${new Date().toLocaleString('ar-EG')}</div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 20%">التاريخ والوقت</th>
                        <th style="width: 15%">المستخدم</th>
                        <th style="width: 20%">الإجراء</th>
                        <th style="width: 45%">التفاصيل</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
};

window.runEmergencyClean = async function() {
    if (!confirm('تحذير: هل أنت متأكد من رغبتك في حذف جميع المنتجات التي ليس لها صورة؟ هذا الإجراء لا يمكن التراجع عنه.')) {
        return;
    }

    const btn = document.getElementById('emergencyCleanBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[20px]">sync</span> جاري التنظيف...';
    btn.disabled = true;

    try {
        const response = await adminFetch(`${BASE_URL}/api/emergency-clean`, {
            method: 'DELETE'
        });

        if (response.ok) {
            const data = await response.json();
            showToast(`✅ تم بنجاح حذف ${data.deletedCount} منتج وهمي!`);
        } else {
            const errData = await response.json();
            showToast(`⚠️ خطأ: ${errData.message || 'حدث خطأ أثناء التنظيف'}`);
        }
    } catch (error) {
        console.error('Error during emergency clean:', error);
        showToast('⚠️ خطأ في الاتصال بالسيرفر. إذا كان هناك أكثر من 3000 منتج، يرجى استخدام أداة التنظيف المرفقة (clean_db.js) من الكمبيوتر لأن السيرفر يغلق الاتصال بعد 10 ثوانٍ.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};
// V5.2 UX: close the lightweight product/category drawers with Escape.
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const addPanel = document.getElementById('addProductPanel');
    const categoriesPanel = document.getElementById('categoriesPanel');
    if (addPanel && !addPanel.classList.contains('hidden')) closeAddProductPanel();
    if (categoriesPanel && !categoriesPanel.classList.contains('hidden')) closeCategoriesPanel();
});
