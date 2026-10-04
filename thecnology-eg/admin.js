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
        const customBadge = document.getElementById('pCustomBadge')?.value || '';
        const tags = document.getElementById('pTags')?.value || '';
        const isFeatured = document.getElementById('pIsFeatured')?.checked || false;
        const seoTitle = document.getElementById('pSeoTitle')?.value || '';
        const seoDescription = document.getElementById('pSeoDescription')?.value || '';

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
        formData.append('customBadge', customBadge);
        formData.append('tags', tags);
        formData.append('isFeatured', isFeatured ? 'true' : 'false');
        formData.append('seoTitle', seoTitle);
        formData.append('seoDescription', seoDescription);
        if (document.getElementById('pVariantsJson')) formData.append('variants', document.getElementById('pVariantsJson').value || '[]');

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
            'manage_marketing': 'التسويق والحملات',
            'manage_returns': 'الاستبدال والاسترجاع',
            'manage_security': 'أمان الإدارة',
            'manage_system': 'حالة النظام وPOS',
            'view_visitor_details': 'تفاصيل الزوار',
            'all': 'كل الصلاحيات (مالك)'
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

function toDateTimeLocalValue(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}
let tempPromoBannerFile = null;

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

        const setChecked = (id, value) => { const el = document.getElementById(id); if (el) el.checked = Boolean(value); };
        setChecked('enableWishlist', settings.enableWishlist !== false);
        setChecked('enableCompare', settings.enableCompare !== false);
        setChecked('enableRecentlyViewed', settings.enableRecentlyViewed !== false);
        setChecked('enableSmartSearch', settings.enableSmartSearch !== false);
        setChecked('showHomeCollections', settings.showHomeCollections !== false);
        setChecked('promoBannerEnabled', Boolean(settings.promoBannerEnabled));
        setChecked('seasonalEffectEnabled', Boolean(settings.seasonalEffectEnabled));
        setChecked('pushEnabled', Boolean(settings.pushEnabled));
        setValue('lowStockThreshold', settings.lowStockThreshold ?? 3);
        setValue('newProductDays', settings.newProductDays ?? 30);
        setValue('promoBannerText', settings.promoBannerText || '');
        setValue('promoBannerButtonText', settings.promoBannerButtonText || 'اكتشف الآن');
        setValue('promoBannerLink', settings.promoBannerLink || '/products');
        setValue('seasonalMessage', settings.seasonalMessage || '');
        setValue('promoBannerStartsAt', toDateTimeLocalValue(settings.promoBannerStartsAt));
        setValue('promoBannerEndsAt', toDateTimeLocalValue(settings.promoBannerEndsAt));
        setValue('seasonalEffectStartsAt', toDateTimeLocalValue(settings.seasonalEffectStartsAt));
        setValue('seasonalEffectEndsAt', toDateTimeLocalValue(settings.seasonalEffectEndsAt));
        const effect = document.getElementById('seasonalEffect'); if (effect) effect.value = settings.seasonalEffect || 'off';
        const intensity = document.getElementById('seasonalEffectIntensity'); if (intensity) intensity.value = settings.seasonalEffectIntensity || 'medium';
        const pushStatus = document.getElementById('pushStatusText'); if (pushStatus) {
            pushStatus.textContent = settings.pushAvailable ? 'جاهز للإرسال — مفاتيح VAPID مضبوطة' : 'غير جاهز — أضف VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY';
            pushStatus.className = `block text-[10px] mt-1 ${settings.pushAvailable ? 'text-green-400' : 'text-amber-400'}`;
        }
        const promoPreview = document.getElementById('promoBannerPreview');
        if (promoPreview && settings.promoBannerImage) { promoPreview.src = adminSafeImageUrl(settings.promoBannerImage); promoPreview.classList.remove('hidden'); }
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

const promoBannerImageInput = document.getElementById('promoBannerImageInput');
if (promoBannerImageInput) {
    promoBannerImageInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        tempPromoBannerFile = file;
        const preview = document.getElementById('promoBannerPreview');
        if (preview) { preview.src = URL.createObjectURL(file); preview.classList.remove('hidden'); }
    });
}

window.saveExperienceSettings = async function() {
    const fd = new FormData();
    const add = (id, key=id) => { const el=document.getElementById(id); if(el) fd.append(key, el.value || ''); };
    const addBool = (id, key=id) => { const el=document.getElementById(id); if(el) fd.append(key, el.checked ? 'true':'false'); };
    addBool('promoBannerEnabled'); add('promoBannerText'); add('promoBannerButtonText'); add('promoBannerLink'); add('promoBannerStartsAt'); add('promoBannerEndsAt');
    addBool('seasonalEffectEnabled'); add('seasonalEffect'); add('seasonalEffectIntensity'); add('seasonalMessage'); add('seasonalEffectStartsAt'); add('seasonalEffectEndsAt');
    if (tempPromoBannerFile) fd.append('promoBannerImage', tempPromoBannerFile);
    try {
        const res = await adminFetch(`${BASE_URL}/api/settings`, { method:'POST', body:fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'فشل الحفظ');
        tempPromoBannerFile = null;
        showToast('✅ تم حفظ البانر وتأثير المناسبة');
        loadStoreSettings();
        if (window.loadDashboard) window.loadDashboard();
    } catch(err) { showToast('❌ ' + err.message); }
};

window.saveGrowthSettings = async function() {
    const payload = new URLSearchParams();
    ['enableWishlist','enableCompare','enableRecentlyViewed','enableSmartSearch','showHomeCollections','pushEnabled'].forEach(id => payload.set(id, document.getElementById(id)?.checked ? 'true':'false'));
    payload.set('lowStockThreshold', document.getElementById('lowStockThreshold')?.value || '3');
    payload.set('newProductDays', document.getElementById('newProductDays')?.value || '30');
    try {
        const res = await adminFetch(`${BASE_URL}/api/settings`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:payload.toString() });
        const data = await res.json(); if(!res.ok) throw new Error(data.message || 'فشل الحفظ');
        showToast('✅ تم حفظ تجربة التسوق'); loadStoreSettings(); if (window.loadDashboard) window.loadDashboard();
    } catch(err) { showToast('❌ ' + err.message); }
};

window.sendPushNotification = async function() {
    const title = document.getElementById('pushTitle')?.value.trim() || 'TECHNOLOGY STORE';
    const body = document.getElementById('pushBody')?.value.trim() || 'لدينا تحديث جديد في المتجر';
    const url = document.getElementById('pushUrl')?.value.trim() || '/products';
    try {
        const res = await adminFetch(`${BASE_URL}/api/admin/push/send`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title,body,url}) });
        const data = await res.json(); if(!res.ok) throw new Error(data.message || 'فشل الإرسال');
        showToast(`✅ تم إرسال الإشعار إلى ${data.sent || 0} جهاز`);
    } catch(err) { showToast('❌ ' + err.message); }
};

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
    if (document.getElementById('editPCustomBadge')) document.getElementById('editPCustomBadge').value = product.customBadge || '';
    if (document.getElementById('editPTags')) document.getElementById('editPTags').value = Array.isArray(product.tags) ? product.tags.join(', ') : (product.tags || '');
    if (document.getElementById('editPIsFeatured')) document.getElementById('editPIsFeatured').checked = Boolean(product.isFeatured);
    if (document.getElementById('editPSeoTitle')) document.getElementById('editPSeoTitle').value = product.seoTitle || '';
    if (document.getElementById('editPSeoDescription')) document.getElementById('editPSeoDescription').value = product.seoDescription || '';

    if (product.discountExpiresAt) {
        const remaining = new Date(product.discountExpiresAt) - new Date();
        if (remaining > 0) {
            const hours = Math.ceil(remaining / (1000 * 60 * 60));
            document.getElementById('editPDiscountType').value = 'hours';
            document.getElementById('editPDiscountValue').value = hours;
            document.getElementById('editPDiscountValueContainer').style.display = 'flex';
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
    const editScrollArea = document.getElementById('editProductScrollArea');
    if (editScrollArea) editScrollArea.scrollTop = 0;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    setTimeout(() => {
        if (editScrollArea) editScrollArea.scrollTop = 0;
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
        formData.append('customBadge', document.getElementById('editPCustomBadge')?.value || '');
        formData.append('tags', document.getElementById('editPTags')?.value || '');
        formData.append('isFeatured', document.getElementById('editPIsFeatured')?.checked ? 'true' : 'false');
        formData.append('seoTitle', document.getElementById('editPSeoTitle')?.value || '');
        formData.append('seoDescription', document.getElementById('editPSeoDescription')?.value || '');
        if (document.getElementById('editPVariantsJson')) formData.append('variants', document.getElementById('editPVariantsJson').value || '[]');

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
        description: Array.isArray(p.description) ? p.description.join('\n') : (p.description || ''),
        warranty: p.warranty || '',
        oldPrice: p.oldPrice || '',
        isFeatured: p.isFeatured ? 'true' : 'false',
        customBadge: p.customBadge || '',
        tags: Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''),
        seoTitle: p.seoTitle || '',
        seoDescription: p.seoDescription || '',
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

        const statusBadge = (label, tone='green') => {
            const tones = {
                green:'bg-green-500/10 text-green-400',
                amber:'bg-amber-500/10 text-amber-400',
                red:'bg-red-500/10 text-red-400',
                slate:'bg-slate-500/10 text-slate-300'
            };
            return `<span class="px-2 py-1 rounded-full text-xs font-bold ${tones[tone] || tones.slate}">${label}</span>`;
        };
        const db = document.getElementById('healthDb'); if (db) db.innerHTML = data.health?.database === 'connected' ? statusBadge('متصل','green') : statusBadge('غير متصل','red');
        const cloud = document.getElementById('healthCloudinary'); if (cloud) cloud.innerHTML = data.health?.cloudinaryConfigured ? statusBadge('مضبوط','green') : statusBadge('غير مضبوط','red');
        const pos = document.getElementById('healthPos'); if (pos) pos.innerHTML = data.health?.posConfigured ? statusBadge('مربوط','green') : statusBadge('غير مربوط','amber');
        const push = document.getElementById('healthPush'); if (push) {
            if (!data.health?.pushConfigured) push.innerHTML = statusBadge('يحتاج إعداد','red');
            else if (!data.health?.pushEnabled) push.innerHTML = statusBadge('جاهز — غير مفعل','amber');
            else push.innerHTML = statusBadge('مفعل','green');
        }
        const promo = document.getElementById('healthPromo'); if (promo) {
            if (data.health?.promoBannerActive) promo.innerHTML = statusBadge('فعال','green');
            else if (data.health?.promoBannerEnabled) promo.innerHTML = statusBadge('مجدول / خارج المدة','amber');
            else promo.innerHTML = statusBadge('غير مفعل','slate');
        }
        const season = document.getElementById('healthSeason'); if (season) {
            if (data.health?.seasonalEffectActive) season.innerHTML = statusBadge('فعال','green');
            else if (data.health?.seasonalEffectEnabled) season.innerHTML = statusBadge('مجدول / خارج المدة','amber');
            else season.innerHTML = statusBadge('غير مفعل','slate');
        }
        const alerts = document.getElementById('dashboardAlerts');
        if (alerts) {
            const items = [];
            if ((data.products?.lowStock || 0) > 0) items.push({icon:'warning', tone:'amber', title:`${data.products.lowStock} منتج بمخزون منخفض`, text:'راجع الكميات قبل نفاد المنتجات.'});
            if ((data.products?.missingImages || 0) > 0) items.push({icon:'broken_image', tone:'red', title:`${data.products.missingImages} منتج بدون صورة`, text:'مركز الصور يوضح المنتجات التي تحتاج صورة.'});
            if ((data.orders?.pending || 0) > 0) items.push({icon:'receipt_long', tone:'blue', title:`${data.orders.pending} طلب جديد`, text:'يوجد طلبات تحتاج متابعة.'});
            if (!data.health?.pushConfigured) items.push({icon:'notifications_off', tone:'slate', title:'Push Notifications يحتاج إعداد', text:'أضف مفاتيح VAPID في Vercel ثم أعد النشر.'});
            else if (!data.health?.pushEnabled) items.push({icon:'notifications_active', tone:'blue', title:'Push Notifications جاهز', text:'فعّله من إعدادات المتجر لإظهار الاشتراك للعملاء.'});
            alerts.innerHTML = items.slice(0,6).map(i => `<div class="glass-panel p-4 rounded-xl border border-outline-variant/30"><div class="flex items-start gap-3"><span class="material-symbols-outlined text-primary">${i.icon}</span><div><p class="font-bold text-sm text-on-surface">${i.title}</p><p class="text-xs text-on-surface-variant mt-1">${i.text}</p></div></div></div>`).join('');
        }

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
        tbody.innerHTML = window.adminOrdersCache.map(o => `<tr class="border-b border-outline-variant/20 hover:bg-surface-variant/20"><td class="p-3"><div class="font-bold text-on-surface text-sm">${escapeHtml(o.orderNumber)}</div><div class="text-[11px] text-on-surface-variant">${o.items?.length || 0} منتج</div></td><td class="p-3"><div class="font-semibold text-sm">${escapeHtml(o.customerName)}</div><a href="tel:${escapeHtml(o.customerPhone)}" class="text-xs text-primary" dir="ltr">${escapeHtml(o.customerPhone)}</a></td><td class="p-3 font-bold text-primary font-mono-data">${formatMoney(o.total)}</td><td class="p-3"><select onchange="updateOrderStatus('${o._id}', this.value, this)" class="bg-surface-container border border-outline-variant rounded px-2 py-1.5 text-xs text-on-surface"><option value="pending" ${o.status==='pending'?'selected':''}>جديد</option><option value="received_by_pos" ${o.status==='received_by_pos'?'selected':''}>استلمه POS</option><option value="processing" ${o.status==='processing'?'selected':''}>جاري التجهيز</option><option value="out_for_delivery" ${o.status==='out_for_delivery'?'selected':''}>خرج للتوصيل</option><option value="completed" ${o.status==='completed'?'selected':''}>مكتمل</option><option value="cancelled" ${o.status==='cancelled'?'selected':''}>ملغي</option></select></td><td class="p-3 text-xs text-on-surface-variant">${formatAdminDate(o.createdAt)}</td><td class="p-3 text-center"><button onclick="openOrderDetails('${o._id}')" class="px-3 py-1.5 rounded bg-primary/10 text-primary border border-primary/20 text-xs font-bold">تفاصيل</button></td></tr>`).join('');
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
    const payLabels = { cash_on_delivery:'الدفع عند الاستلام', instapay:'InstaPay', pay_at_store:'الدفع في المعرض' };
    const deliveryLabels = { shipping:'شحن للعنوان', pickup:'استلام من المعرض' };
    const statusLabels = { pending:'جديد', received_by_pos:'استلمه POS', processing:'جاري التجهيز', out_for_delivery:'خرج للتوصيل', completed:'مكتمل / تم التسليم', cancelled:'ملغي' };
    const items = (order.items || []).map(i => `<tr class="border-b border-outline-variant/20"><td class="py-2"><strong>${escapeHtml(i.title)}</strong>${i.variant ? `<div class="text-[11px] text-primary mt-1">${escapeHtml(i.variant)}</div>` : ''}${i.sku ? `<div class="text-[10px] text-on-surface-variant" dir="ltr">SKU: ${escapeHtml(i.sku)}</div>` : ''}</td><td class="py-2 text-center">${i.quantity}</td><td class="py-2 text-center font-mono-data">${formatMoney(i.price)}</td><td class="py-2 text-left font-mono-data">${formatMoney(i.lineTotal)}</td></tr>`).join('');
    const history = (order.statusHistory || []).map(h => `<div class="flex gap-3 items-start py-2 border-b border-outline-variant/20 last:border-0"><span class="material-symbols-outlined text-primary text-[18px]">check_circle</span><div><strong class="text-xs">${escapeHtml(statusLabels[h.status] || h.status || '')}</strong><p class="text-[11px] text-on-surface-variant mt-0.5">${h.at ? formatAdminDate(h.at) : ''}${h.note ? ` — ${escapeHtml(h.note)}` : ''}</p></div></div>`).join('');
    const waPhone = String(order.customerPhone || '').replace(/\D/g,'');
    const waText = encodeURIComponent(`مرحباً ${order.customerName || ''}، بخصوص طلبك ${order.orderNumber || ''}`);
    box.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
      <div class="p-3 bg-surface-container rounded-lg"><span class="text-xs text-on-surface-variant">رقم الطلب</span><p class="font-bold mt-1" dir="ltr">${escapeHtml(order.orderNumber)}</p></div>
      <div class="p-3 bg-surface-container rounded-lg"><span class="text-xs text-on-surface-variant">التاريخ</span><p class="font-bold mt-1">${formatAdminDate(order.createdAt)}</p></div>
      <div class="p-3 bg-surface-container rounded-lg"><span class="text-xs text-on-surface-variant">العميل</span><p class="font-bold mt-1">${escapeHtml(order.customerName)}</p></div>
      <div class="p-3 bg-surface-container rounded-lg"><span class="text-xs text-on-surface-variant">الهاتف</span><p class="font-bold mt-1" dir="ltr">${escapeHtml(order.customerPhone)}</p><a href="https://wa.me/${waPhone}?text=${waText}" target="_blank" rel="noopener" class="inline-flex mt-2 text-xs text-green-400">فتح واتساب</a></div>
      <div class="p-3 bg-surface-container rounded-lg"><span class="text-xs text-on-surface-variant">طريقة الاستلام</span><p class="font-bold mt-1">${escapeHtml(deliveryLabels[order.deliveryMethod] || order.deliveryMethod || '—')}</p></div>
      <div class="p-3 bg-surface-container rounded-lg"><span class="text-xs text-on-surface-variant">طريقة الدفع</span><p class="font-bold mt-1">${escapeHtml(payLabels[order.paymentMethod] || order.paymentMethod || '—')}</p></div>
      ${order.deliveryMethod === 'shipping' ? `<div class="p-3 bg-surface-container rounded-lg md:col-span-2"><span class="text-xs text-on-surface-variant">عنوان الشحن</span><p class="font-bold mt-1">${escapeHtml([order.governorate, order.area, order.customerAddress].filter(Boolean).join(' — '))}</p></div>` : ''}
      ${order.couponCode ? `<div class="p-3 bg-surface-container rounded-lg"><span class="text-xs text-on-surface-variant">كوبون الخصم</span><p class="font-bold mt-1">${escapeHtml(order.couponCode)}</p></div>` : ''}
      <div class="p-3 bg-surface-container rounded-lg"><span class="text-xs text-on-surface-variant">الحالة الحالية</span><p class="font-bold mt-1 text-primary">${escapeHtml(statusLabels[order.status] || order.status || '—')}</p></div>
    </div>
    <div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-on-surface-variant border-b border-outline-variant/30"><th class="py-2 text-right">المنتج</th><th class="py-2 text-center">الكمية</th><th class="py-2 text-center">السعر</th><th class="py-2 text-left">الإجمالي</th></tr></thead><tbody>${items}</tbody></table></div>
    <div class="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm"><div class="p-3 rounded-lg bg-surface-container"><span class="text-xs text-on-surface-variant">المنتجات</span><b class="block mt-1">${formatMoney(order.subtotal)}</b></div><div class="p-3 rounded-lg bg-surface-container"><span class="text-xs text-on-surface-variant">الخصم</span><b class="block mt-1">${formatMoney(order.discountAmount || 0)}</b></div><div class="p-3 rounded-lg bg-surface-container"><span class="text-xs text-on-surface-variant">الشحن</span><b class="block mt-1">${formatMoney(order.shippingAmount || 0)}</b></div><div class="p-3 rounded-lg bg-primary/10 border border-primary/20"><span class="text-xs text-on-surface-variant">الإجمالي</span><b class="block mt-1 text-primary text-lg">${formatMoney(order.total)}</b></div></div>
    ${history ? `<div class="mt-5"><h4 class="font-bold mb-2">سجل حالة الطلب</h4><div class="p-3 rounded-lg bg-surface-container">${history}</div></div>` : ''}
    ${order.notes ? `<div class="mt-4 p-3 rounded-lg bg-surface-container"><span class="text-xs text-on-surface-variant">ملاحظات</span><p class="mt-1 text-sm">${escapeHtml(order.notes)}</p></div>` : ''}`;
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
    grid.innerHTML = items.length ? items.map(m => `<article class="glass-panel rounded-xl border border-outline-variant/30 overflow-hidden"><div class="aspect-square bg-white/95 p-2"><img src="${escapeHtml(adminSafeImageUrl(m.url))}" onerror="handleAdminImageError(this)" class="w-full h-full object-contain" loading="lazy"></div><div class="p-3"><p class="font-bold text-xs text-on-surface line-clamp-2" title="${escapeHtml(m.productTitle)}">${escapeHtml(m.productTitle)}</p><div class="flex flex-wrap items-center gap-1.5 mt-2"><span class="text-[9px] px-1.5 py-0.5 rounded ${m.isCloudinary?'bg-green-500/10 text-green-400':'bg-amber-500/10 text-amber-400'}">${m.isCloudinary?'Cloudinary':'خارجي/محلي'}</span><span class="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">${escapeHtml(m.format || 'unknown')}</span><span class="text-[9px] px-1.5 py-0.5 rounded ${m.optimized?'bg-green-500/10 text-green-400':'bg-red-500/10 text-red-400'}">${m.optimized?'Optimized':'راجع الصيغة'}</span></div><p class="text-[10px] text-on-surface-variant mt-2">${escapeHtml(m.category || '')}</p></div></article>`).join('') : '<div class="col-span-full text-center text-on-surface-variant py-10">لا توجد صور مطابقة.</div>';
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
let activeAdminLogAction = '';
let adminLogFilterTimer = null;
async function fetchAdminLogs() {
    try {
        const tbody = document.getElementById('adminLogsTableBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-on-surface-variant"><span class="material-symbols-outlined animate-spin inline-block text-[24px]">sync</span> جاري تحميل السجل...</td></tr>`;
        const params = new URLSearchParams({ limit:'300', _t:String(Date.now()) });
        const search = document.getElementById('logSearchFilter')?.value.trim();
        const user = document.getElementById('logUserFilter')?.value.trim();
        const from = document.getElementById('logFromFilter')?.value;
        const to = document.getElementById('logToFilter')?.value;
        if (search) params.set('search', search); if (user) params.set('user', user); if (from) params.set('from', from); if (to) params.set('to', to); if (activeAdminLogAction) params.set('action', activeAdminLogAction);
        const response = await adminFetch(`${BASE_URL}/api/admin/logs?${params.toString()}`, {
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
                <td class="py-3 px-4 font-bold text-on-surface">${escapeHtml(log.user || 'نظام')}</td>
                <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined ${actionColor} text-[18px]">${actionIcon}</span>
                        <span class="font-semibold">${escapeHtml(log.action || '')}</span>
                    </div>
                </td>
                <td class="py-3 px-4 text-on-surface-variant text-xs leading-relaxed max-w-sm truncate" title="${escapeHtml(log.details || '')}">
                    ${escapeHtml(log.details || '')}
                </td>
            </tr>
        `;
    }).join('');
}

window.fetchAdminLogs = fetchAdminLogs;

window.scheduleAdminLogFilter = function() { clearTimeout(adminLogFilterTimer); adminLogFilterTimer = setTimeout(fetchAdminLogs, 280); };
window.setAdminLogAction = function(action='') { activeAdminLogAction = action; document.querySelectorAll('.log-action-filter[data-action]').forEach(btn => btn.classList.toggle('active', btn.dataset.action === action)); fetchAdminLogs(); };
window.clearAdminLogFilters = function() { activeAdminLogAction=''; ['logSearchFilter','logUserFilter','logFromFilter','logToFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';}); document.querySelectorAll('.log-action-filter[data-action]').forEach(btn=>btn.classList.toggle('active',btn.dataset.action==='')); fetchAdminLogs(); };

window.previewSeasonalEffect = function() {
    document.getElementById('adminSeasonPreview')?.remove();
    const type = document.getElementById('seasonalEffect')?.value || 'off';
    const intensity = document.getElementById('seasonalEffectIntensity')?.value || 'medium';
    if (type === 'off') return showToast('اختر نوع المناسبة أولاً');
    const symbols={snow:['❄','❅','✦'],hearts:['❤','♡','💗'],spring:['🌸','✿','🌼'],autumn:['🍂','🍁','🍃'],ramadan:['🌙','✦','★','✨'],eid:['✨','★','🎊','✦'],confetti:['●','■','▲','✦']}[type] || ['✦'];
    const counts={low:14,medium:24,high:36}; const layer=document.createElement('div'); layer.id='adminSeasonPreview'; layer.className='admin-season-preview';
    for(let i=0;i<(counts[intensity]||24);i++){const item=document.createElement('i');item.textContent=symbols[i%symbols.length];item.style.left=`${(i*37)%100}%`;item.style.animationDelay=`-${(i%10)*.37}s`;item.style.animationDuration=`${4+(i%5)}s`;layer.appendChild(item);} document.body.appendChild(layer);
    setTimeout(()=>layer.remove(),6000); showToast('👀 معاينة لمدة 6 ثوانٍ — الحفظ غير مطلوب للمعاينة');
};

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


/* ===== Integrated admin commerce module ===== */
/* Technology Store Admin V8 — full commerce controls + source analytics */
(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>`${new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(Number(n)||0)} ج.م`;
  async function api(url, init={}){
    const headers=new Headers(init.headers||{}); const token=sessionStorage.getItem('tech_admin_token'); if(token)headers.set('Authorization',`Bearer ${token}`);
    if(init.body && !(init.body instanceof FormData) && typeof init.body!=='string'){headers.set('Content-Type','application/json');init.body=JSON.stringify(init.body);}
    const r=await fetch(url,{...init,headers}); let data={}; try{data=await r.json();}catch(_){} if(!r.ok)throw new Error(data.message||`HTTP ${r.status}`); return data;
  }
  function toast(msg){ if(window.showToast)window.showToast(msg); else alert(msg); }
  function canManage(){try{const u=JSON.parse(sessionStorage.getItem('tech_current_user')||'{}');return (u.permissions||[]).includes('all')||(u.permissions||[]).includes('manage_settings');}catch(_){return false;}}
  function canManageGrowth(){try{const u=JSON.parse(sessionStorage.getItem('tech_current_user')||'{}');return (u.permissions||[]).includes('all')||(u.permissions||[]).includes('manage_settings')||(u.permissions||[]).includes('manage_marketing');}catch(_){return false;}}

  // ---------------- Product variants builder ----------------
  function variantSection(prefix){
    const edit=prefix==='editP'; const id=edit?'editPVariantsJson':'pVariantsJson'; const rows=edit?'editVariantRows':'variantRows';
    return `<section class="${edit?'product-edit-section':'product-form-section'} v8-admin-variants">
      <div class="${edit?'product-edit-section-title':'product-form-section__title'}"><span class="material-symbols-outlined">tune</span><div><strong>خيارات المنتج / Variants</strong><small>مثل اللون أو السعة، ولكل خيار سعر ومخزون وSKU مستقل.</small></div></div>
      <input type="hidden" id="${id}" value="[]"><div id="${rows}" class="v8-variant-admin-list"></div>
      <button type="button" class="admin-action-btn" data-add-variant="${prefix}"><span class="material-symbols-outlined">add</span> إضافة خيار</button>
    </section>`;
  }
  function injectVariantBuilders(){
    const add=document.getElementById('addProductForm');
    if(add&&!document.getElementById('pVariantsJson')){const seo=add.querySelector('.product-form-section:nth-last-of-type(2)');(seo||add.querySelector('.admin-sidepanel__footer')).insertAdjacentHTML('beforebegin',variantSection('p'));}
    const edit=document.getElementById('editProductForm');
    if(edit&&!document.getElementById('editPVariantsJson')){const footer=edit.querySelector('.product-edit-footer');footer?.insertAdjacentHTML('beforebegin',variantSection('editP'));}
    document.querySelectorAll('[data-add-variant]').forEach(b=>b.onclick=()=>addVariantRow(b.dataset.addVariant));
    document.getElementById('addProductForm')?.addEventListener('reset',()=>setTimeout(()=>{document.getElementById('variantRows').innerHTML='';syncVariants('p');},0));
  }
  function addVariantRow(prefix, data={}){
    const edit=prefix==='editP'; const host=document.getElementById(edit?'editVariantRows':'variantRows'); if(!host)return;
    const row=document.createElement('div');row.className='v8-variant-admin-row';row.innerHTML=`
      <input data-k="label" placeholder="نوع الخيار (مثال: اللون)" value="${esc(data.label||'')}">
      <input data-k="value" placeholder="القيمة (أسود / 256GB)" value="${esc(data.value||'')}">
      <input data-k="price" type="number" step="0.01" min="0" placeholder="السعر" value="${data.price??''}">
      <input data-k="oldPrice" type="number" step="0.01" min="0" placeholder="قبل الخصم" value="${data.oldPrice??''}">
      <input data-k="stockQuantity" type="number" min="0" placeholder="المخزون" value="${data.stockQuantity??0}">
      <input data-k="sku" placeholder="SKU" value="${esc(data.sku||'')}">
      <input data-k="image" placeholder="رابط صورة الخيار (اختياري)" value="${esc(data.image||'')}">
      <button type="button" title="حذف"><span class="material-symbols-outlined">delete</span></button>`;
    host.appendChild(row); row.querySelectorAll('input').forEach(i=>i.addEventListener('input',()=>syncVariants(prefix))); row.querySelector('button').onclick=()=>{row.remove();syncVariants(prefix);}; syncVariants(prefix);
  }
  function syncVariants(prefix){
    const edit=prefix==='editP'; const host=document.getElementById(edit?'editVariantRows':'variantRows'),hidden=document.getElementById(edit?'editPVariantsJson':'pVariantsJson');if(!host||!hidden)return;
    const arr=[...host.children].map(row=>{const o={};row.querySelectorAll('[data-k]').forEach(i=>{let v=i.value.trim();if(['price','oldPrice','stockQuantity'].includes(i.dataset.k))v=v===''?undefined:Number(v);o[i.dataset.k]=v;});return o;}).filter(v=>v.value);hidden.value=JSON.stringify(arr);
  }
  function renderEditVariants(product){const host=document.getElementById('editVariantRows');if(!host)return;host.innerHTML='';(product?.variants||[]).forEach(v=>addVariantRow('editP',v));syncVariants('editP');}

  // Wrap edit modal after original admin script loaded.
  function wrapEditModal(){if(!window.openEditModal||window.openEditModal.__v8)return;const old=window.openEditModal;const wrapped=function(id){old(id);const p=(window.adminProducts||[]).find(x=>String(x._id)===String(id));setTimeout(()=>renderEditVariants(p),0);};wrapped.__v8=true;window.openEditModal=wrapped;}

  // ---------------- Shipping & payment controls ----------------
  function injectCommerceSettings(){const panel=document.getElementById('panel-settings');if(!panel||document.getElementById('v8CommerceSettings'))return;const card=document.createElement('div');card.id='v8CommerceSettings';card.className='glass-panel p-5 rounded-xl border border-outline-variant/50 lg:col-span-3';card.innerHTML=`
    <div class="v8-admin-title"><div><span class="material-symbols-outlined">local_shipping</span><div><h3>الشحن والدفع</h3><p>تحكم كامل في مناطق الشحن، الشحن المجاني وطرق الدفع.</p></div></div><button id="v8SaveCommerce" class="admin-action-btn admin-action-btn--primary"><span class="material-symbols-outlined">save</span> حفظ</button></div>
    <div class="v8-commerce-grid">
      <label><span>تفعيل الشحن</span><input type="checkbox" id="v8ShippingEnabled"></label>
      <label><span>السماح بالاستلام من المعرض</span><input type="checkbox" id="v8PickupEnabled"></label>
      <label><span>شحن مجاني من إجمالي</span><input type="number" id="v8FreeShipping" min="0" step="1" placeholder="0 = غير مفعل"></label>
      <label><span>الدفع عند الاستلام</span><input type="checkbox" id="v8PayCOD"></label>
      <label><span>InstaPay</span><input type="checkbox" id="v8PayInstapay"></label>
      <label><span>الدفع في المعرض</span><input type="checkbox" id="v8PayStore"></label>
      <label class="wide"><span>InstaPay Handle / رقم التحويل</span><input id="v8InstapayHandle" dir="ltr"></label>
      <label class="wide"><span>تعليمات الشحن</span><textarea id="v8ShippingInstructions" rows="2"></textarea></label>
    </div>
    <div class="v8-zones-head"><div><strong>مناطق الشحن</strong><small>اسم المنطقة + التكلفة + المدة المتوقعة.</small></div><button id="v8AddZone" class="admin-action-btn"><span class="material-symbols-outlined">add</span> منطقة</button></div>
    <div id="v8Zones" class="v8-zones"></div>`;
    panel.querySelector('.grid')?.appendChild(card);document.getElementById('v8AddZone').onclick=()=>addZone();document.getElementById('v8SaveCommerce').onclick=saveCommerceSettings;loadCommerceSettings();}
  function addZone(z={}){const host=document.getElementById('v8Zones');if(!host)return;const row=document.createElement('div');row.className='v8-zone-row';row.innerHTML=`<input data-k="name" placeholder="القاهرة / الجيزة..." value="${esc(z.name||'')}"><input data-k="fee" type="number" min="0" step="1" placeholder="التكلفة" value="${z.fee??0}"><input data-k="eta" placeholder="مثال: 1-2 يوم" value="${esc(z.eta||'')}"><label><input data-k="enabled" type="checkbox" ${z.enabled===false?'':'checked'}> مفعل</label><button type="button"><span class="material-symbols-outlined">delete</span></button>`;host.appendChild(row);row.querySelector('button').onclick=()=>row.remove();}
  async function loadCommerceSettings(){if(!canManage())return;try{const s=await api('/api/settings');const set=(id,v)=>{const e=document.getElementById(id);if(!e)return;if(e.type==='checkbox')e.checked=Boolean(v);else e.value=v??'';};set('v8ShippingEnabled',s.isShippingEnabled);set('v8PickupEnabled',s.pickupEnabled!==false);set('v8FreeShipping',s.freeShippingThreshold||0);set('v8PayCOD',s.paymentCashOnDelivery!==false);set('v8PayInstapay',s.paymentInstapay);set('v8PayStore',s.paymentStorePickup!==false);set('v8InstapayHandle',s.instapayHandle);set('v8ShippingInstructions',s.shippingInstructions);const host=document.getElementById('v8Zones');if(host){host.innerHTML='';(s.shippingZones||[]).forEach(addZone);}}catch(e){console.error(e);}}
  async function saveCommerceSettings(){try{const zones=[...document.querySelectorAll('#v8Zones .v8-zone-row')].map(r=>({name:r.querySelector('[data-k="name"]').value.trim(),governorate:r.querySelector('[data-k="name"]').value.trim(),fee:Number(r.querySelector('[data-k="fee"]').value||0),eta:r.querySelector('[data-k="eta"]').value.trim(),enabled:r.querySelector('[data-k="enabled"]').checked})).filter(z=>z.name);await api('/api/settings',{method:'POST',body:{isShippingEnabled:document.getElementById('v8ShippingEnabled').checked,pickupEnabled:document.getElementById('v8PickupEnabled').checked,freeShippingThreshold:Number(document.getElementById('v8FreeShipping').value||0),paymentCashOnDelivery:document.getElementById('v8PayCOD').checked,paymentInstapay:document.getElementById('v8PayInstapay').checked,paymentStorePickup:document.getElementById('v8PayStore').checked,instapayHandle:document.getElementById('v8InstapayHandle').value.trim(),shippingInstructions:document.getElementById('v8ShippingInstructions').value.trim(),shippingZones:zones}});toast('✅ تم حفظ إعدادات الشحن والدفع');}catch(e){alert(e.message);}}

  // ---------------- Growth / customer trust tab ----------------
  function injectGrowthTab(){if(document.getElementById('tab-growth'))return;const anchor=document.getElementById('tab-analytics');if(!anchor)return;const b=document.createElement('button');b.id='tab-growth';b.className='admin-tab w-full flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant font-bold text-sm transition-all hover:bg-surface-variant/50';b.innerHTML='<span class="material-symbols-outlined">rocket_launch</span><span>التسويق والعروض</span>';b.onclick=()=>window.switchTab('growth');anchor.before(b);const parent=document.getElementById('panel-settings')?.parentElement;if(!parent)return;const panel=document.createElement('div');panel.id='panel-growth';panel.className='tab-panel hidden';panel.innerHTML=`
    <div class="v8-growth-head"><div><h2>المبيعات والعملاء</h2><p>الكوبونات، تقييمات العملاء، طلبات التنبيه عند عودة المخزون.</p></div><button class="admin-action-btn" onclick="window.v8LoadGrowth()"><span class="material-symbols-outlined">refresh</span> تحديث</button></div>
    <div class="v8-growth-grid">
      <section class="glass-panel v8-growth-card v8-campaign-card"><h3><span class="material-symbols-outlined">link</span> منشئ روابط الحملات المتتبعة</h3><p class="v8-admin-help">استخدم رابطًا مختصرًا وواضحًا لتتبع الحملة. سيظهر لك شكل بسيط، وعند النسخ سيتم نسخ الرابط الكامل الجاهز للنشر.</p><div class="v8-campaign-form"><input id="v8CampaignPath" placeholder="رابط أو مسار مثل /products" value="/products"><select id="v8CampaignSource"><option value="facebook">Facebook</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="telegram">Telegram</option><option value="youtube">YouTube</option><option value="qr">QR / مطبوعات</option><option value="custom">مصدر مخصص</option></select><input id="v8CampaignCustom" class="hidden" placeholder="اسم المصدر المخصص"><input id="v8CampaignName" placeholder="اسم الحملة (مثال: october_offer)"><button id="v8MakeCampaign" class="admin-action-btn admin-action-btn--primary">إنشاء الرابط</button></div><div id="v8CampaignResult" class="v8-campaign-result hidden"><div class="v8-campaign-preview-wrap"><div id="v8CampaignCompact" class="v8-campaign-compact" dir="ltr"></div><small>سيتم نسخ الرابط الكامل عند الضغط على زر النسخ.</small><input id="v8CampaignUrl" readonly dir="ltr" class="hidden"></div><button id="v8CopyCampaign" class="admin-action-btn">نسخ الرابط</button></div></section>
      <section class="glass-panel v8-growth-card"><h3><span class="material-symbols-outlined">sell</span> كوبونات الخصم</h3><div class="v8-coupon-form"><input id="v8CouponCode" placeholder="CODE"><select id="v8CouponType"><option value="percent">نسبة %</option><option value="fixed">مبلغ ثابت</option></select><input id="v8CouponValue" type="number" min="0" placeholder="القيمة"><input id="v8CouponMin" type="number" min="0" placeholder="حد أدنى"><input id="v8CouponMax" type="number" min="0" placeholder="حد أقصى للخصم"><input id="v8CouponLimit" type="number" min="0" placeholder="مرات الاستخدام (0=∞)"><input id="v8CouponStart" type="datetime-local"><input id="v8CouponEnd" type="datetime-local"><button id="v8AddCoupon" class="admin-action-btn admin-action-btn--primary">إضافة كوبون</button></div><div id="v8CouponsList"></div></section>
      <section class="glass-panel v8-growth-card"><h3><span class="material-symbols-outlined">star</span> التقييمات المنتظرة</h3><div id="v8ReviewsAdmin"></div></section>
      <section class="glass-panel v8-growth-card"><h3><span class="material-symbols-outlined">notifications_active</span> تنبيهات توفر المخزون</h3><div id="v8StockAlerts"></div></section>
    </div>`;parent.appendChild(panel);document.getElementById('v8AddCoupon').onclick=addCoupon;
    const source=document.getElementById('v8CampaignSource');if(source)source.onchange=()=>document.getElementById('v8CampaignCustom')?.classList.toggle('hidden',source.value!=='custom');
    document.getElementById('v8MakeCampaign').onclick=makeCampaignLink;document.getElementById('v8CopyCampaign').onclick=copyCampaignLink;wrapSwitchTab();}
  function makeCampaignLink(){
    const raw=document.getElementById('v8CampaignPath')?.value.trim()||'/products';
    const sel=document.getElementById('v8CampaignSource')?.value||'facebook';
    const custom=document.getElementById('v8CampaignCustom')?.value.trim()||'';
    const campaign=(document.getElementById('v8CampaignName')?.value.trim()||'store_campaign').replace(/\s+/g,'_');
    const source=sel==='custom'?(custom||'custom'):sel;
    let u;try{u=new URL(raw,location.origin);}catch(_){u=new URL('/products',location.origin);}
    u.searchParams.set('src',source);
    u.searchParams.set('camp',campaign);
    if(sel==='qr')u.searchParams.set('med','offline');
    const compact=`${u.origin}${u.pathname} • ${source} • ${campaign}`;
    const out=document.getElementById('v8CampaignUrl'),box=document.getElementById('v8CampaignResult'),compactBox=document.getElementById('v8CampaignCompact');
    if(out)out.value=u.toString();
    if(compactBox)compactBox.textContent=compact;
    box?.classList.remove('hidden');
  }
  async function copyCampaignLink(){const value=document.getElementById('v8CampaignUrl')?.value||'';if(!value)return;try{await navigator.clipboard.writeText(value);toast('✅ تم نسخ رابط الحملة');}catch(_){document.getElementById('v8CampaignUrl')?.select();}}

  async function addCoupon(){try{await api('/api/admin/coupons',{method:'POST',body:{code:document.getElementById('v8CouponCode').value,type:document.getElementById('v8CouponType').value,value:Number(document.getElementById('v8CouponValue').value||0),minSubtotal:Number(document.getElementById('v8CouponMin').value||0),maxDiscount:Number(document.getElementById('v8CouponMax').value||0),usageLimit:Number(document.getElementById('v8CouponLimit').value||0),startsAt:document.getElementById('v8CouponStart').value||undefined,endsAt:document.getElementById('v8CouponEnd').value||undefined,enabled:true}});toast('✅ تمت إضافة الكوبون');loadGrowth();}catch(e){alert(e.message);}}
  async function loadGrowth(){if(!canManageGrowth())return;try{const [coupons,reviews,alerts]=await Promise.all([api('/api/admin/coupons'),api('/api/admin/reviews'),api('/api/admin/stock-notify')]);renderCoupons(coupons);renderReviews(reviews);renderAlerts(alerts);}catch(e){console.error(e);}}
  window.v8LoadGrowth=loadGrowth;
  function renderCoupons(list){const h=document.getElementById('v8CouponsList');if(!h)return;h.innerHTML=list.length?list.map(c=>`<div class="v8-admin-item"><div><strong>${esc(c.code)}</strong><small>${c.type==='percent'?`${c.value}%`:money(c.value)} • حد أدنى ${money(c.minSubtotal||0)} • استخدام ${c.usedCount||0}${c.usageLimit?` / ${c.usageLimit}`:''}${c.endsAt?` • ينتهي ${new Date(c.endsAt).toLocaleDateString('ar-EG')}`:''}</small></div><label><input type="checkbox" ${c.enabled?'checked':''} onchange="window.v8ToggleCoupon('${c._id}',this.checked)"> مفعل</label><div class="v8-admin-actions"><button onclick="window.v8EditCoupon('${c._id}')">تعديل</button><button class="danger" onclick="window.v8DeleteCoupon('${c._id}')"><span class="material-symbols-outlined">delete</span></button></div></div>`).join(''):'<p class="v8-admin-empty">لا توجد كوبونات.</p>';window.__v8Coupons=list;}
  window.v8EditCoupon=async id=>{const c=(window.__v8Coupons||[]).find(x=>x._id===id);if(!c)return;const value=prompt('قيمة الخصم:',String(c.value??0));if(value===null)return;const min=prompt('الحد الأدنى للطلب:',String(c.minSubtotal??0));if(min===null)return;const max=prompt('الحد الأقصى للخصم (0 بدون حد):',String(c.maxDiscount??0));if(max===null)return;const limit=prompt('عدد مرات الاستخدام (0 بدون حد):',String(c.usageLimit??0));if(limit===null)return;try{await api(`/api/admin/coupons/${id}`,{method:'PUT',body:{value:Number(value)||0,minSubtotal:Number(min)||0,maxDiscount:Number(max)||0,usageLimit:Number(limit)||0}});toast('✅ تم تعديل الكوبون');loadGrowth();}catch(e){alert(e.message);}};
  window.v8ToggleCoupon=async(id,enabled)=>{try{await api(`/api/admin/coupons/${id}`,{method:'PUT',body:{enabled}});toast('تم التحديث');}catch(e){alert(e.message);}};
  window.v8DeleteCoupon=async id=>{if(!confirm('حذف الكوبون؟'))return;try{await api(`/api/admin/coupons/${id}`,{method:'DELETE'});loadGrowth();}catch(e){alert(e.message);}};
  function renderReviews(list){const h=document.getElementById('v8ReviewsAdmin');if(!h)return;h.innerHTML=list.length?list.map(r=>`<div class="v8-review-admin ${r.approved?'approved':''}"><div><strong>${esc(r.productId?.title||'منتج')}</strong><span>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></div><p><b>${esc(r.name)}</b> — ${esc(r.comment||'بدون تعليق')}</p><small>${new Date(r.createdAt).toLocaleString('ar-EG')}</small><div class="v8-admin-actions"><button onclick="window.v8ApproveReview('${r._id}',${!r.approved})">${r.approved?'إخفاء':'اعتماد ونشر'}</button><button class="danger" onclick="window.v8DeleteReview('${r._id}')">حذف</button></div></div>`).join(''):'<p class="v8-admin-empty">لا توجد تقييمات.</p>';}
  window.v8ApproveReview=async(id,approved)=>{await api(`/api/admin/reviews/${id}`,{method:'PUT',body:{approved}});loadGrowth();};window.v8DeleteReview=async id=>{if(confirm('حذف التقييم؟')){await api(`/api/admin/reviews/${id}`,{method:'DELETE'});loadGrowth();}};
  function renderAlerts(list){const h=document.getElementById('v8StockAlerts');if(!h)return;h.innerHTML=list.length?list.map(a=>`<div class="v8-admin-item"><div><strong>${esc(a.productTitle||'منتج')}</strong><small>${esc(a.name||'عميل')} • <span dir="ltr">${esc(a.phone)}</span> • ${a.status==='waiting'?'بانتظار التنبيه':a.status==='notified'?'تم التنبيه':'ملغي'}</small></div><div class="v8-admin-actions">${a.status==='waiting'?`<button onclick="window.v8SendStockWhatsapp('${a._id}','${esc(a.phone)}','${esc(a.productTitle||'المنتج')}')">واتساب</button><button onclick="window.v8AlertStatus('${a._id}','notified')">تم التنبيه</button>`:''}<button class="danger" onclick="window.v8DeleteAlert('${a._id}')">حذف</button></div></div>`).join(''):'<p class="v8-admin-empty">لا توجد طلبات تنبيه.</p>';}
  window.v8SendStockWhatsapp=async(id,phone,title)=>{const n=String(phone||'').replace(/\D/g,'');const msg=encodeURIComponent(`مرحباً، المنتج ${title} أصبح متاحاً الآن في TECHNOLOGY STORE. يمكنك طلبه من الموقع: ${location.origin}/products`);window.open(`https://wa.me/${n}?text=${msg}`,'_blank','noopener');try{await api(`/api/admin/stock-notify/${id}`,{method:'PUT',body:{status:'notified'}});setTimeout(loadGrowth,300);}catch(_){}};
  window.v8AlertStatus=async(id,status)=>{await api(`/api/admin/stock-notify/${id}`,{method:'PUT',body:{status}});loadGrowth();};window.v8DeleteAlert=async id=>{if(confirm('حذف الطلب؟')){await api(`/api/admin/stock-notify/${id}`,{method:'DELETE'});loadGrowth();}};

  // ---------------- Rich acquisition analytics ----------------
  function injectAnalyticsSourceUI(){const table=document.getElementById('analytics-visitors-table')?.closest('table');if(!table||document.getElementById('v8SourceSummary'))return;table.querySelector('thead tr').innerHTML='<th>الزائر / العميل</th><th>آخر زيارة</th><th>المصدر الحالي</th><th>الحملة</th><th>صفحة الدخول</th><th>الموقع / IP</th><th>الجهاز</th><th>أول مصدر</th><th>الجلسات</th><th>معرّف الزائر</th><th>التفاصيل</th>';table.classList.add('v8-wide-table');const card=table.closest('.glass-panel');card?.querySelector('h3')?.insertAdjacentHTML('afterend','<div class="v8-analytics-controls"><label>من <input type="date" id="v8AnalyticsFrom"></label><label>إلى <input type="date" id="v8AnalyticsTo"></label><button id="v8AnalyticsApply" class="admin-action-btn">تطبيق</button><button id="v8AnalyticsReset" class="admin-action-btn">الكل</button><button id="v8ExportVisitors" class="admin-action-btn">تصدير الزوار</button><button id="v8ExportSessions" class="admin-action-btn">تصدير الجلسات</button></div><div id="v8SourceSummary" class="v8-source-summary"></div>');setTimeout(()=>{const a=document.getElementById('v8AnalyticsApply'),r=document.getElementById('v8AnalyticsReset'),ev=document.getElementById('v8ExportVisitors'),es=document.getElementById('v8ExportSessions');if(a)a.onclick=()=>window.loadUniqueVisitors?.();if(r)r.onclick=()=>{document.getElementById('v8AnalyticsFrom').value='';document.getElementById('v8AnalyticsTo').value='';window.__v8SourceFilter='';window.loadUniqueVisitors?.();};if(ev)ev.onclick=()=>exportAnalyticsCsv('visitors');if(es)es.onclick=()=>exportAnalyticsCsv('sessions');},0);card?.insertAdjacentHTML('afterend','<div class="glass-panel p-6 rounded-xl border border-outline-variant/30 mb-8"><h3 class="font-headline-md text-lg text-on-surface mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-primary">route</span> أحدث جلسات التصفح</h3><div class="overflow-x-auto"><table class="v8-session-table"><thead><tr><th>الوقت</th><th>المصدر</th><th>المصدر السابق</th><th>الدخول</th><th>الخروج</th><th>صفحات</th><th>المدة</th><th>الجهاز</th><th>الحملة</th></tr></thead><tbody id="v8SessionsBody"></tbody></table></div></div>');}
  function analyticsParams(){const q=new URLSearchParams({limit:'500'});const from=document.getElementById('v8AnalyticsFrom')?.value||'',to=document.getElementById('v8AnalyticsTo')?.value||'';if(from)q.set('from',from);if(to)q.set('to',to);if(window.__v8SourceFilter)q.set('source',window.__v8SourceFilter);return q;}
  window.loadUniqueVisitors=async function(){try{injectAnalyticsSourceUI();const q=analyticsParams();const data=await api(`/api/analytics/visitors?${q}`);window.__v8Visitors=data.visitors||[];const stat=document.getElementById('stat-unique-visitors');if(stat)stat.textContent=data.uniqueCount||0;const sum=document.getElementById('v8SourceSummary');if(sum)sum.innerHTML=`<button onclick="window.v8FilterSource('')"><strong>كل المصادر</strong><span>${data.uniqueCount||0}</span></button>`+(data.sources||[]).map(x=>`<button onclick="window.v8FilterSource('${esc(x.source)}')"><strong>${esc(x.source==='Direct'?'مباشر':x.source)}</strong><span>${x.count}</span></button>`).join('');renderVisitorRows(window.__v8Visitors);const sess=await api(`/api/analytics/sessions?${q}`);window.__v8Sessions=sess.sessions||[];renderSessions(window.__v8Sessions);}catch(e){console.error(e);}};
  function renderVisitorRows(list){const tb=document.getElementById('analytics-visitors-table');if(!tb)return;tb.innerHTML=list.length?list.map(v=>`<tr><td>${v.knownCustomerName?`<b>${esc(v.knownCustomerName)}</b><small dir="ltr">${esc(v.knownCustomerPhone||'')}</small><small>طلبات: ${v.ordersCount||0}${v.lastOrderNumber?` • ${esc(v.lastOrderNumber)}`:''}</small>`:'<span class="v8-anon">زائر غير معروف</span>'}</td><td>${new Date(v.lastSeenAt||v.timestamp).toLocaleString('ar-EG')}</td><td><b class="v8-source-badge">${esc((v.source||'Direct')==='Direct'?'مباشر':(v.source||'Direct'))}</b><small>${esc(v.medium||'')}</small><small dir="ltr" title="${esc(v.referrer||'')}">${esc(v.referrer||'بدون مصدر سابق')}</small></td><td>${esc(v.utmCampaign||'—')}<small>${esc(v.utmSource||'')}</small></td><td dir="ltr" title="${esc(v.lastLandingPage||'')}">${esc(v.lastLandingPage||'—')}</td><td>${esc(v.location||'غير معروف')}<small dir="ltr">${esc(v.ip||'')}</small></td><td>${esc(v.device||'غير معروف')}<small>${esc(v.browser||'')} • ${esc(v.os||'')} • ${esc(v.screen||'')} • ${esc(v.timezone||'')}</small></td><td>${esc((v.firstSource||'Direct')==='Direct'?'مباشر':(v.firstSource||'Direct'))}<small dir="ltr">${esc(v.firstReferrer||'')}</small></td><td>${v.sessionCount||0}<small>${v.visitCount||0} مشاهدة صفحة</small></td><td dir="ltr"><code>${esc(v.visitorId||'')}</code></td><td>${v.visitorId?`<button class="admin-action-btn v9-journey-btn" onclick="window.v9OpenVisitorJourney?.('${esc(v.visitorId)}')">رحلة الزائر</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="11">لا توجد بيانات</td></tr>';}
  function renderSessions(list){const tb=document.getElementById('v8SessionsBody');if(!tb)return;tb.innerHTML=list.map(s=>{const total=Number(s.activeSeconds||0)||Math.max(0,Math.round((new Date(s.lastSeenAt||s.startedAt)-new Date(s.startedAt))/1000));const min=Math.floor(total/60),sec=Math.floor(total%60);return `<tr><td>${new Date(s.startedAt).toLocaleString('ar-EG')}</td><td>${esc((s.source||'Direct')==='Direct'?'مباشر':(s.source||'Direct'))}<small>${esc(s.medium||'')}</small></td><td dir="ltr" title="${esc(s.referrer||'')}">${esc(s.referrer||'—')}</td><td dir="ltr">${esc(s.entryPage||'')}</td><td dir="ltr">${esc(s.exitPage||'')}</td><td>${s.pageCount||1}</td><td>${min?`${min}د ${sec}ث`:`${sec}ث`}</td><td>${esc(s.device||'')}<small>${esc(s.browser||'')} • ${esc(s.os||'')}</small></td><td>${esc(s.utmCampaign||'—')}</td></tr>`;}).join('');}
  window.v8FilterSource=async source=>{window.__v8SourceFilter=source||'';await window.loadUniqueVisitors?.();};

  function exportAnalyticsCsv(kind){
    const rows=kind==='sessions'?(window.__v8Sessions||[]): (window.__v8Visitors||[]);if(!rows.length){toast('لا توجد بيانات للتصدير');return;}
    const cols=kind==='sessions'?['startedAt','lastSeenAt','source','medium','referrer','utmSource','utmMedium','utmCampaign','entryPage','exitPage','pageCount','activeSeconds','ip','location','device','browser','os','visitorId']:['knownCustomerName','knownCustomerPhone','lastOrderNumber','ordersCount','lastSeenAt','source','medium','referrer','utmSource','utmMedium','utmCampaign','firstSource','firstReferrer','firstLandingPage','lastLandingPage','ip','location','country','city','device','deviceType','browser','os','screen','timezone','sessionCount','visitCount','visitorId'];
    const csv=[cols.join(',')].concat(rows.map(r=>cols.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`technology-${kind}-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function refreshV8Permissions(){const b=document.getElementById('tab-growth');if(b)b.style.display=canManageGrowth()?'':'none';}

  function wrapSwitchTab(){if(!window.switchTab||window.switchTab.__v8)return;const old=window.switchTab;const wrapped=function(name){old(name);if(name==='growth')loadGrowth();if(name==='settings')loadCommerceSettings();if(name==='analytics')setTimeout(()=>window.loadUniqueVisitors?.(),100);};wrapped.__v8=true;window.switchTab=wrapped;}

  document.addEventListener('DOMContentLoaded',()=>{
    injectVariantBuilders();wrapEditModal();injectCommerceSettings();injectGrowthTab();injectAnalyticsSourceUI();wrapSwitchTab();refreshV8Permissions();
    setTimeout(()=>{wrapEditModal();refreshV8Permissions();if(canManage())loadCommerceSettings();},700);setTimeout(refreshV8Permissions,1800);setTimeout(refreshV8Permissions,3500);
  });
})();


/* ===== Integrated admin intelligence module ===== */
/* Technology Store V9 Admin — intelligence, recovery, returns, security & health */
(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>`${new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(Number(n)||0)} ج.م`;
  const fmt=v=>v?new Date(v).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'}):'—';
  const api=async(url,init={})=>{const opts={...init};if(opts.body&&!(opts.body instanceof FormData)){opts.headers={...(opts.headers||{}),'Content-Type':'application/json'};if(typeof opts.body!=='string')opts.body=JSON.stringify(opts.body);}const r=await (window.adminFetch||fetch)(url,opts);let d=null;try{d=await r.json();}catch(_){d={};}if(!r.ok)throw new Error(d.message||'تعذر تنفيذ الطلب');return d;};
  const user=()=>{try{return JSON.parse(sessionStorage.getItem('tech_current_user')||'null')}catch(_){return null}};
  const has=p=>{const u=user();return !!u&&(u.permissions||[]).some(x=>x==='all'||x===p);};
  const toast=m=>window.showToast?.(m);

  function injectNavAndPanels(){
    if(document.getElementById('tab-intelligence'))return;
    const nav=document.querySelector('#adminSidebar nav');const logs=document.getElementById('tab-logs');if(!nav)return;
    const buttons=`
      <button onclick="switchTab('intelligence')" id="tab-intelligence" class="admin-tab v9-admin-tab w-full flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant font-bold text-sm transition-all hover:bg-surface-variant/50"><span class="material-symbols-outlined text-[20px]">query_stats</span> مؤشرات المبيعات</button>
      <button onclick="switchTab('recovery')" id="tab-recovery" class="admin-tab v9-admin-tab w-full flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant font-bold text-sm transition-all hover:bg-surface-variant/50"><span class="material-symbols-outlined text-[20px]">shopping_cart_checkout</span> السلات غير المكتملة</button>
      <button onclick="switchTab('returns')" id="tab-returns" class="admin-tab v9-admin-tab w-full flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant font-bold text-sm transition-all hover:bg-surface-variant/50"><span class="material-symbols-outlined text-[20px]">assignment_return</span> الاستبدال والاسترجاع</button>
      <button onclick="switchTab('system')" id="tab-system" class="admin-tab v9-admin-tab w-full flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant font-bold text-sm transition-all hover:bg-surface-variant/50"><span class="material-symbols-outlined text-[20px]">shield_person</span> النظام والأمان</button>`;
    (logs||nav.lastElementChild)?.insertAdjacentHTML(logs?'beforebegin':'beforebegin',buttons);

    const container=document.querySelector('#adminMainScroll .max-w-container-max');if(!container)return;
    container.insertAdjacentHTML('beforeend',`
    <div id="panel-intelligence" class="tab-panel hidden">
      <div class="v9-panel-head"><div><small>تحليل نمو المبيعات</small><h3>مؤشرات المبيعات والتحويل</h3><p>اعرف الزيارات التي تتحول إلى طلبات، وأي مصدر يحقق مبيعات فعلية.</p></div><div class="v9-date-actions"><input type="date" id="v9IntelFrom"><input type="date" id="v9IntelTo"><button onclick="window.v9LoadIntelligence()">تحديث</button></div></div>
      <div id="v9Kpis" class="v9-kpi-grid"></div>
      <div class="v9-two-col"><section class="glass-panel v9-card"><div class="v9-card-title"><span class="material-symbols-outlined">filter_alt</span><div><h4>مسار التحويل Funnel</h4><small>من الزيارة حتى الطلب</small></div></div><div id="v9Funnel" class="v9-funnel"></div></section><section class="glass-panel v9-card"><div class="v9-card-title"><span class="material-symbols-outlined">trophy</span><div><h4>أفضل المنتجات</h4><small>حسب الإيراد من الطلبات</small></div></div><div id="v9TopProducts" class="v9-top-products"></div></section></div>
      <section class="glass-panel v9-card"><div class="v9-card-title"><span class="material-symbols-outlined">campaign</span><div><h4>المصدر → الطلب → الإيراد</h4><small>الأهم ليس عدد الزيارات فقط، بل من أين تأتي المبيعات.</small></div></div><div class="overflow-x-auto"><table class="v9-table"><thead><tr><th>المصدر</th><th>الزيارات</th><th>الطلبات</th><th>Conversion</th><th>الإيراد</th></tr></thead><tbody id="v9SourcesBody"></tbody></table></div></section>
    </div>

    <div id="panel-recovery" class="tab-panel hidden">
      <div class="v9-panel-head"><div><small>استعادة المبيعات</small><h3>السلات غير المكتملة</h3><p>اعرف أين توقف العميل، وتواصل فقط عندما يكون قد أدخل وسيلة اتصال.</p></div><div class="v9-date-actions"><input id="v9CartSearch" placeholder="بحث بالاسم أو الهاتف أو المنتج"><select id="v9CartStatus"><option value="active">نشطة</option><option value="recovered">تم تحويلها لطلب</option><option value="expired">مغلقة</option></select><button onclick="window.v9LoadCarts()">تحديث</button></div></div>
      <div id="v9CartStats" class="v9-mini-summary"></div><div id="v9Carts" class="v9-recovery-grid"></div>
    </div>

    <div id="panel-returns" class="tab-panel hidden">
      <div class="v9-panel-head"><div><small>خدمات ما بعد البيع</small><h3>الاستبدال والاسترجاع</h3><p>كل طلب له رقم مستقل وسجل حالة واضح للعميل والإدارة.</p></div><div class="v9-date-actions"><select id="v9ReturnStatus"><option value="">كل الحالات</option><option value="pending">قيد المراجعة</option><option value="approved">مقبول</option><option value="received">تم الاستلام</option><option value="refunded">تم رد المبلغ</option><option value="replaced">تم الاستبدال</option><option value="rejected">مرفوض</option><option value="closed">مغلق</option></select><button onclick="window.v9LoadReturns()">تحديث</button></div></div>
      <div class="glass-panel v9-card overflow-x-auto"><table class="v9-table v9-returns-table"><thead><tr><th>الطلب</th><th>العميل</th><th>النوع / السبب</th><th>المنتجات</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody id="v9ReturnsBody"></tbody></table></div>
    </div>

    <div id="panel-system" class="tab-panel hidden">
      <div class="v9-panel-head"><div><small>مركز تشغيل النظام</small><h3>النظام والأمان</h3><p>فحص حالة النظام، POS، النسخ السحابية، 2FA والجلسات النشطة.</p></div><button class="v9-refresh" onclick="window.v9LoadSystem()"><span class="material-symbols-outlined">refresh</span> فحص الآن</button></div>
      <div id="v9HealthGrid" class="v9-health-grid"></div>
      <div class="v9-two-col">
        <section class="glass-panel v9-card"><div class="v9-card-title"><span class="material-symbols-outlined">sync_alt</span><div><h4>مزامنة نظام نقاط البيع</h4><small>حالة ربط المنتجات والطلبات</small></div></div><div id="v9PosHealth" class="v9-system-list"></div></section>
        <section class="glass-panel v9-card" id="v9SecurityCard"><div class="v9-card-title"><span class="material-symbols-outlined">verified_user</span><div><h4>أمان حساب الإدارة</h4><small>Authenticator + إدارة الجلسات</small></div></div><div id="v9Security"></div></section>
      </div>
      <section class="glass-panel v9-card" id="v9BackupCard"><div class="v9-card-title v9-space-between"><span class="material-symbols-outlined">cloud_done</span><div class="grow"><h4>مركز النسخ الاحتياطي السحابي</h4><small>نسخة JSON كاملة في Cloudinary مع سجل آخر النسخ.</small></div><button id="v9BackupNow" onclick="window.v9CreateBackup()">نسخة الآن</button></div><div id="v9Backups" class="v9-backup-list"></div></section>
      <section class="glass-panel v9-card"><div class="v9-card-title v9-space-between"><span class="material-symbols-outlined">devices</span><div class="grow"><h4>الجلسات والأجهزة</h4><small>اقفل أي جلسة مفتوحة أو كل الأجهزة الأخرى.</small></div><button onclick="window.v9RevokeOthers()">خروج باقي الأجهزة</button></div><div id="v9Sessions" class="v9-session-list"></div></section>
    </div>`);
  }

  function applyPermissions(){
    const map={intelligence:'view_reports',recovery:'manage_orders',returns:'manage_returns'};Object.entries(map).forEach(([tab,p])=>{const el=document.getElementById(`tab-${tab}`);if(el)el.style.display=has(p)?'flex':'none';});
    const sys=document.getElementById('tab-system');if(sys)sys.style.display=(has('manage_system')||has('manage_security')||has('manage_backup')||has('all'))?'flex':'none';
    const backup=document.getElementById('v9BackupCard');if(backup)backup.style.display=has('manage_backup')?'block':'none';
  }

  function injectRolePresets(){
    const perms=[...document.querySelectorAll('input[name="permissions"]')];if(!perms.length||document.getElementById('v9RolePreset'))return;
    const all=perms.find(x=>x.value==='all');const host=all?.closest('div')||perms[0].parentElement?.parentElement;if(!host)return;
    const more=[['manage_marketing','التسويق والحملات'],['manage_returns','الاستبدال والاسترجاع'],['manage_security','إعدادات الأمان'],['manage_system','حالة النظام وPOS'],['view_visitor_details','تفاصيل الزوار']];
    more.forEach(([value,label])=>{if(document.querySelector(`input[name="permissions"][value="${value}"]`))return;const l=document.createElement('label');l.className='flex items-center gap-2 text-sm cursor-pointer hover:bg-surface-variant/30 p-1 rounded transition-colors';l.innerHTML=`<input type="checkbox" name="permissions" value="${value}" class="accent-primary w-4 h-4 rounded"> ${label}`;all?.closest('label')?.before(l);});
    const box=document.createElement('div');box.className='v9-role-preset';box.innerHTML=`<label>دور جاهز</label><select id="v9RolePreset"><option value="custom">مخصص</option><option value="owner">Owner / المالك</option><option value="manager">Manager / مدير</option><option value="orders">Orders / الطلبات</option><option value="warehouse">Warehouse / المخزون</option><option value="marketing">Marketing / التسويق</option><option value="support">Support / خدمة العملاء</option></select><small>اختيار الدور يضبط الصلاحيات ويمكنك تعديلها بعد ذلك.</small>`;host.before(box);
    const presets={owner:['all'],manager:['add_product','edit_product','delete_product','manage_categories','manage_settings','manage_backup','view_reports','manage_users','manage_orders','manage_media','manage_marketing','manage_returns','manage_security','manage_system','view_visitor_details'],orders:['manage_orders','manage_returns','view_reports','view_visitor_details'],warehouse:['edit_product','view_reports','manage_media'],marketing:['manage_marketing','view_reports','view_visitor_details'],support:['manage_orders','manage_returns','view_reports','view_visitor_details']};
    document.getElementById('v9RolePreset').onchange=e=>{const selected=presets[e.target.value];if(!selected)return;document.querySelectorAll('input[name="permissions"]').forEach(cb=>cb.checked=selected.includes(cb.value)||(selected.includes('all')&&cb.value==='all'));};
  }

  function overrideUsers(){
    if(typeof window.addNewUser==='function'&&!window.addNewUser.__v9){
      const fn=async function(){const username=document.getElementById('newUserUsername')?.value.trim()||'',password=document.getElementById('newUserPassword')?.value||'',permissions=[...document.querySelectorAll('input[name="permissions"]:checked')].map(x=>x.value),submitBtn=document.querySelector('#panel-users button[onclick="addNewUser()"]'),editingId=submitBtn?.dataset.editingId,roleKey=document.getElementById('v9RolePreset')?.value||'custom';if(!username)return alert('يرجى إدخال اسم المستخدم.');if(!editingId&&!password)return alert('يرجى إدخال كلمة المرور.');if(!permissions.length)return alert('اختر صلاحية واحدة على الأقل.');try{await api(editingId?`/api/admin/users/${editingId}`:'/api/admin/users',{method:editingId?'PUT':'POST',body:{username,password,roleKey,permissions:permissions.includes('all')?['all']:permissions}});if(submitBtn){delete submitBtn.dataset.editingId;submitBtn.innerHTML='<span class="material-symbols-outlined text-[18px]">person_add</span> إضافة مستخدم';}document.getElementById('newUserUsername').value='';document.getElementById('newUserPassword').value='';document.querySelectorAll('input[name="permissions"]').forEach(x=>x.checked=false);document.getElementById('v9RolePreset').value='custom';toast(editingId?'✅ تم تعديل المستخدم':'✅ تم إضافة المستخدم');window.loadUsersTable?.();}catch(e){alert(e.message);}};fn.__v9=true;window.addNewUser=fn;
    }
    if(typeof window.editUser==='function'&&!window.editUser.__v9){const old=window.editUser;const fn=function(id){old(id);setTimeout(()=>{try{const u=(typeof allUsersCache!=='undefined'?allUsersCache:[]).find(x=>x.id===id);if(u&&document.getElementById('v9RolePreset'))document.getElementById('v9RolePreset').value=u.roleKey||'custom';}catch(_){}},0);};fn.__v9=true;window.editUser=fn;}
  }

  function dateQs(){const q=new URLSearchParams();const f=document.getElementById('v9IntelFrom')?.value,t=document.getElementById('v9IntelTo')?.value;if(f)q.set('from',f);if(t)q.set('to',t);return q.toString();}
  window.v9LoadIntelligence=async()=>{try{const d=await api(`/api/admin/v9/overview?${dateQs()}`);const k=d.kpis||{};const cards=[['groups','الزوار الفريدون',k.uniqueVisitors||0],['route','الجلسات',k.totalSessions||0],['shopping_bag','الطلبات',k.orders||0],['payments','الإيراد',money(k.revenue)],['conversion_path','Conversion',`${k.conversion||0}%`],['receipt_long','متوسط الطلب',money(k.aov)],['remove_shopping_cart','سلات غير مكتملة',k.abandoned||0],['assignment_return','مرتجعات مفتوحة',k.pendingReturns||0]];document.getElementById('v9Kpis').innerHTML=cards.map(x=>`<article><span class="material-symbols-outlined">${x[0]}</span><small>${x[1]}</small><strong>${x[2]}</strong></article>`).join('');
    const f=d.funnel||{};const steps=[['زيارة',f.pageViews||0],['مشاهدة منتج',f.productViews||0],['إضافة للسلة',f.addToCart||0],['إتمام الطلب',f.checkout||0],['بيانات اتصال',f.contact||0],['طلب مكتمل',f.orders||0]];const max=Math.max(1,...steps.map(x=>x[1]));document.getElementById('v9Funnel').innerHTML=steps.map((x,i)=>`<div><div><span>${i+1}. ${x[0]}</span><b>${x[1]}</b></div><i><em style="width:${Math.max(3,x[1]/max*100)}%"></em></i></div>`).join('');
    document.getElementById('v9TopProducts').innerHTML=(d.topProducts||[]).length?(d.topProducts||[]).map((p,i)=>`<div><span>${i+1}</span><p><b>${esc(p._id||'منتج')}</b><small>${p.qty||0} وحدة</small></p><strong>${money(p.revenue)}</strong></div>`).join(''):'<p class="v9-empty">لا توجد مبيعات في الفترة.</p>';
    document.getElementById('v9SourcesBody').innerHTML=(d.sources||[]).length?(d.sources||[]).map(s=>`<tr><td><b>${esc(s.source||'مباشر')}</b></td><td>${s.visits}</td><td>${s.orders}</td><td><span class="v9-conv">${s.conversion}%</span></td><td><b>${money(s.revenue)}</b></td></tr>`).join(''):'<tr><td colspan="5">لا توجد بيانات</td></tr>';
  }catch(e){toast('❌ '+e.message);}};

  window.v9LoadCarts=async()=>{const status=document.getElementById('v9CartStatus')?.value||'active',search=document.getElementById('v9CartSearch')?.value.trim()||'';try{const q=new URLSearchParams({status});if(search)q.set('search',search);const rows=await api(`/api/admin/abandoned-carts?${q}`);const total=rows.reduce((a,x)=>a+Number(x.subtotal||0),0),contact=rows.filter(x=>x.phone).length;document.getElementById('v9CartStats').innerHTML=`<span><b>${rows.length}</b> سلة</span><span><b>${contact}</b> بها هاتف</span><span><b>${money(total)}</b> قيمة محتملة</span>`;document.getElementById('v9Carts').innerHTML=rows.length?rows.map(c=>`<article class="v9-recovery-card"><header><div><b>${c.customerName?esc(c.customerName):'زائر غير معروف'}</b><small>${esc(c.source||'مباشر')}${c.campaign?` • ${esc(c.campaign)}`:''}</small></div><strong>${money(c.subtotal)}</strong></header><div class="v9-stage"><span class="${c.stage==='cart'?'on':''}">سلة</span><span class="${c.stage==='checkout'?'on':''}">إتمام الطلب</span><span class="${c.stage==='contact'?'on':''}">بيانات اتصال</span></div><ul>${(c.items||[]).slice(0,4).map(i=>`<li>${esc(i.title)} <small>x${i.quantity}</small></li>`).join('')}${(c.items||[]).length>4?`<li>+ ${(c.items||[]).length-4} منتجات</li>`:''}</ul><footer><small>${fmt(c.lastSeenAt)}</small><div>${c.phone?`<a target="_blank" rel="noopener" href="https://wa.me/${String(c.phone).replace(/\D/g,'')}?text=${encodeURIComponent('مرحباً، لاحظنا أنك كنت تتصفح منتجات TECHNOLOGY STORE. هل يمكننا مساعدتك في إكمال طلبك؟')}"><span class="material-symbols-outlined">chat</span> واتساب</a>`:''}${status==='active'?`<button onclick="window.v9CartState('${c._id}','expired')">إغلاق</button>`:''}</div></footer></article>`).join(''):'<div class="v9-empty">لا توجد سلات مطابقة.</div>';}catch(e){toast('❌ '+e.message);}};
  window.v9CartState=async(id,status)=>{try{await api(`/api/admin/abandoned-carts/${id}`,{method:'PUT',body:{status}});window.v9LoadCarts();}catch(e){alert(e.message);}};

  const rlabels={pending:'قيد المراجعة',approved:'مقبول',rejected:'مرفوض',received:'تم استلام المنتج',refunded:'تم رد المبلغ',replaced:'تم الاستبدال',closed:'مغلق'};
  window.v9LoadReturns=async()=>{try{const st=document.getElementById('v9ReturnStatus')?.value||'';const rows=await api(`/api/admin/returns${st?'?status='+encodeURIComponent(st):''}`);document.getElementById('v9ReturnsBody').innerHTML=rows.length?rows.map(r=>`<tr><td><b dir="ltr">${esc(r.returnNumber)}</b><small>${esc(r.orderNumber)}</small></td><td><b>${esc(r.customerName)}</b><small dir="ltr">${esc(r.customerPhone)}</small></td><td><b>${r.type==='exchange'?'استبدال':'استرجاع'}</b><small>${esc(r.reason)}</small></td><td>${(r.items||[]).map(i=>`<small>${esc(i.title)} × ${i.quantity}</small>`).join('')}</td><td><select onchange="window.v9UpdateReturn('${r._id}',this.value)">${Object.entries(rlabels).map(([k,v])=>`<option value="${k}" ${r.status===k?'selected':''}>${v}</option>`).join('')}</select></td><td>${fmt(r.createdAt)}</td></tr>`).join(''):'<tr><td colspan="6">لا توجد طلبات.</td></tr>';}catch(e){toast('❌ '+e.message);}};
  window.v9UpdateReturn=async(id,status)=>{const note=prompt('ملاحظة للعميل/السجل (اختياري):','')??'';try{await api(`/api/admin/returns/${id}`,{method:'PUT',body:{status,note}});toast('✅ تم تحديث الحالة');window.v9LoadReturns();}catch(e){alert(e.message);}};

  const eventLabels={page_view:'فتح صفحة',product_view:'شاهد منتج',add_to_cart:'أضاف للسلة',remove_from_cart:'حذف من السلة',checkout_started:'بدأ إتمام الطلب',checkout_contact:'أدخل بيانات التواصل',checkout_quote:'حسب الشحن/الإجمالي',order_completed:'أتم الطلب',whatsapp_click:'فتح واتساب',share:'مشاركة',search:'بحث',return_started:'بدأ استبدال/استرجاع'};
  window.v9OpenVisitorJourney=async visitorId=>{if(!visitorId)return;try{const d=await api(`/api/admin/visitors/${encodeURIComponent(visitorId)}/journey`),v=d.visitor||{};document.getElementById('v9VisitorJourney')?.remove();const modal=document.createElement('div');modal.id='v9VisitorJourney';modal.className='v9-mfa-overlay v9-journey-overlay';const orderCards=(d.orders||[]).map(o=>`<article><b>${esc(o.orderNumber)}</b><span>${money(o.total)}</span><small>${fmt(o.createdAt)} • ${esc(o.status)}</small></article>`).join('')||'<p class="v9-empty">لا توجد طلبات مرتبطة بهذا الزائر.</p>';const sessions=(d.sessions||[]).map(x=>`<article><header><b>${esc(x.source||'مباشر')}</b><span>${fmt(x.startedAt)}</span></header><p><strong>الدخول:</strong> <code>${esc(x.entryPage||'—')}</code></p><p><strong>الخروج:</strong> <code>${esc(x.exitPage||'—')}</code></p><small>${x.pageCount||0} صفحة • ${Math.round(Number(x.activeSeconds||0)/60*10)/10} دقيقة • ${esc(x.device||'')} ${esc(x.browser||'')}</small>${x.referrer?`<em dir="ltr">${esc(x.referrer)}</em>`:''}</article>`).join('')||'<p class="v9-empty">لا توجد جلسات.</p>';const events=(d.events||[]).map(e=>`<div class="v9-journey-event"><span class="material-symbols-outlined">${e.type==='order_completed'?'paid':e.type==='add_to_cart'?'add_shopping_cart':e.type==='product_view'?'visibility':e.type==='checkout_started'?'shopping_cart_checkout':'radio_button_checked'}</span><div><b>${esc(eventLabels[e.type]||e.type)}</b><small>${e.productTitle?esc(e.productTitle):esc(e.path||'')} ${e.value?` • ${money(e.value)}`:''}</small></div><time>${fmt(e.createdAt)}</time></div>`).join('')||'<p class="v9-empty">لا توجد أحداث مسجلة.</p>';modal.innerHTML=`<div class="v9-journey-card"><header><div><small>Visitor Intelligence</small><h3>${v.knownCustomerName?esc(v.knownCustomerName):'زائر غير معروف'}</h3><p dir="ltr">${esc(v.visitorId||visitorId)}</p></div><button class="v9-journey-close">×</button></header><div class="v9-journey-facts"><article><small>المصدر الحالي</small><b>${esc(v.source||'مباشر')}</b><em>${esc(v.utmCampaign||v.medium||'')}</em></article><article><small>أول مصدر</small><b>${esc(v.firstSource||'مباشر')}</b><em dir="ltr">${esc(v.firstReferrer||'بدون Referrer')}</em></article><article><small>الموقع التقريبي</small><b>${esc(v.location||[v.city,v.country].filter(Boolean).join(' / ')||'غير معروف')}</b><em dir="ltr">${esc(v.ip||'')}</em></article><article><small>الجهاز</small><b>${esc(v.device||v.deviceType||'غير معروف')}</b><em>${esc(v.browser||'')} • ${esc(v.os||'')} • ${esc(v.screen||'')}</em></article><article><small>أول زيارة</small><b>${fmt(v.firstSeenAt)}</b><em>${v.sessionCount||0} جلسة</em></article><article><small>آخر زيارة</small><b>${fmt(v.lastSeenAt)}</b><em>${v.visitCount||0} تفاعل/زيارة صفحة</em></article></div><div class="v9-journey-columns"><section><h4>الجلسات</h4><div class="v9-journey-sessions">${sessions}</div></section><section><h4>الطلبات المرتبطة</h4><div class="v9-journey-orders">${orderCards}</div><h4>تسلسل التفاعل</h4><div class="v9-journey-events">${events}</div></section></div></div>`;document.body.appendChild(modal);modal.querySelector('.v9-journey-close').onclick=()=>modal.remove();modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});}catch(e){alert(e.message);}};

  window.v9LoadSystem=async()=>{try{const [h,pos]=await Promise.all([api('/api/admin/system/health'),api('/api/admin/pos/health')]);const ok=(name,value,sub='')=>`<article class="${value?'ok':'bad'}"><span class="material-symbols-outlined">${value?'check_circle':'error'}</span><div><small>${name}</small><b>${value?'سليم':'يحتاج مراجعة'}</b>${sub?`<em>${esc(sub)}</em>`:''}</div></article>`;document.getElementById('v9HealthGrid').innerHTML=ok('MongoDB',h.database?.ok)+ok('Cloudinary',h.cloudinary?.ok)+ok('POS API',pos.configured,pos.lastProductSync?`آخر مزامنة ${fmt(pos.lastProductSync)}`:'لا توجد مزامنة مسجلة')+ok('Cloud Backup',!!h.backup?.last,h.backup?.last?`آخر نسخة ${fmt(h.backup.last.createdAt)}`:(h.backup?.cronConfigured?'جاهز لأول نسخة':'CRON_SECRET غير مضبوط'));
      document.getElementById('v9PosHealth').innerHTML=`<div><span>الربط</span><b>${pos.configured?'✅ مفعّل':'❌ غير مضبوط'}</b></div><div><span>منتجات من POS</span><b>${pos.syncedProducts||0}</b></div><div><span>طلبات بانتظار POS</span><b>${pos.pendingOrders||0}</b></div><div><span>استلمها POS</span><b>${pos.receivedOrders||0}</b></div><div><span>آخر مزامنة منتجات</span><b>${fmt(pos.lastProductSync)}</b></div>`;
      await Promise.allSettled([loadSecurity(),loadBackups(),loadSessions()]);
    }catch(e){toast('❌ '+e.message);}};

  async function loadSecurity(){const d=await api('/api/admin/me');const u=d.user||{};const box=document.getElementById('v9Security');if(!box)return;if(u.totpEnabled){box.innerHTML=`<div class="v9-sec-on"><span class="material-symbols-outlined">verified</span><div><b>المصادقة الثنائية مفعلة</b><small>أي تسجيل دخول جديد يحتاج رمز Authenticator.</small></div></div><div class="v9-inline-form"><input id="v9Disable2faCode" inputmode="numeric" maxlength="6" placeholder="رمز 6 أرقام"><button onclick="window.v9Disable2fa()">إلغاء 2FA</button></div>`;}else{box.innerHTML=`<p class="v9-muted">فعّل 2FA لحماية لوحة الإدارة حتى لو تسربت كلمة المرور.</p><button class="v9-primary" onclick="window.v9Setup2fa()"><span class="material-symbols-outlined">enhanced_encryption</span> إعداد Authenticator</button><div id="v9TotpSetup"></div>`;}}
  window.v9Setup2fa=async()=>{try{const d=await api('/api/admin/security/2fa/setup',{method:'POST'});const box=document.getElementById('v9TotpSetup');box.innerHTML=`<div class="v9-totp-setup"><p>أضف حساباً جديداً في Google/Microsoft Authenticator واختر <b>Enter setup key</b>.</p><label>المفتاح السري</label><div class="v9-secret"><code>${esc(d.secret)}</code><button onclick="navigator.clipboard.writeText('${esc(d.secret)}');showToast('تم النسخ')">نسخ</button></div><input id="v9TotpCode" inputmode="numeric" maxlength="6" placeholder="اكتب الكود الظاهر في التطبيق"><button onclick="window.v9Enable2fa()">تأكيد وتفعيل</button></div>`;}catch(e){alert(e.message);}};
  window.v9Enable2fa=async()=>{const code=document.getElementById('v9TotpCode')?.value||'';try{await api('/api/admin/security/2fa/enable',{method:'POST',body:{code}});const u=user();if(u){u.totpEnabled=true;sessionStorage.setItem('tech_current_user',JSON.stringify(u));}toast('✅ تم تفعيل 2FA');loadSecurity();}catch(e){alert(e.message);}};
  window.v9Disable2fa=async()=>{const code=document.getElementById('v9Disable2faCode')?.value||'';if(!confirm('إلغاء المصادقة الثنائية لهذا الحساب؟'))return;try{await api('/api/admin/security/2fa/disable',{method:'POST',body:{code}});toast('تم إلغاء 2FA');loadSecurity();}catch(e){alert(e.message);}};

  async function loadSessions(){const rows=await api('/api/admin/security/sessions');const host=document.getElementById('v9Sessions');if(!host)return;host.innerHTML=rows.length?rows.map(s=>`<article class="${s.current?'current':''}"><span class="material-symbols-outlined">${/mobile|iphone|android/i.test(s.userAgent||'')?'smartphone':'computer'}</span><div><b>${esc(s.deviceLabel||'جهاز')}</b><small>${esc(s.ip||'IP غير معروف')} • آخر نشاط ${fmt(s.lastSeenAt)}</small></div>${s.current?'<strong>الجلسة الحالية</strong>':s.revokedAt?'<strong>منتهية</strong>':`<button onclick="window.v9RevokeSession('${s._id}')">إنهاء</button>`}</article>`).join(''):'<p class="v9-empty">لا توجد جلسات.</p>';}
  window.v9RevokeSession=async id=>{try{const d=await api(`/api/admin/security/sessions/${id}/revoke`,{method:'POST'});if(d.current){sessionStorage.clear();location.reload();return;}loadSessions();}catch(e){alert(e.message);}};
  window.v9RevokeOthers=async()=>{if(!confirm('تسجيل الخروج من كل الأجهزة الأخرى؟'))return;try{await api('/api/admin/security/sessions/revoke-others',{method:'POST'});toast('✅ تم إنهاء الجلسات الأخرى');loadSessions();}catch(e){alert(e.message);}};

  async function loadBackups(){if(!has('manage_backup'))return;const rows=await api('/api/admin/backups/cloud');const host=document.getElementById('v9Backups');if(!host)return;host.innerHTML=rows.length?rows.slice(0,12).map(b=>`<article class="${b.status}"><span class="material-symbols-outlined">${b.status==='success'?'cloud_done':'cloud_off'}</span><div><b>${b.status==='success'?'نسخة ناجحة':'نسخة فشلت'}</b><small>${fmt(b.createdAt)} • ${esc(b.trigger||'')} • ${esc(b.triggeredBy||'')} ${b.bytes?`• ${(Number(b.bytes)/1024/1024).toFixed(2)} MB`:''}</small>${b.error?`<em>${esc(b.error)}</em>`:''}</div>${b.status==='success'?`<button onclick="window.v9DownloadBackup('${b._id}')">تنزيل آمن</button>`:''}</article>`).join(''):'<p class="v9-empty">لا توجد نسخ سحابية بعد.</p>';}
  window.v9CreateBackup=async()=>{const btn=document.getElementById('v9BackupNow');if(btn){btn.disabled=true;btn.textContent='جاري النسخ...';}try{await api('/api/admin/backups/cloud',{method:'POST'});toast('✅ تم إنشاء نسخة سحابية مشفرة الوصول');loadBackups();}catch(e){alert(e.message);}finally{if(btn){btn.disabled=false;btn.textContent='نسخة الآن';}}};
  window.v9DownloadBackup=async id=>{try{const d=await api(`/api/admin/backups/cloud/${id}/link`);if(!d.url)throw new Error('تعذر إنشاء رابط التحميل');window.open(d.url,'_blank','noopener');}catch(e){alert(e.message);}};

  function overrideLogin(){
    const fn=async()=>{const username=document.getElementById('adminUsername')?.value.trim()||'',password=document.getElementById('adminPassword')?.value||'';if(!username||!password)return alert('يرجى إدخال اسم المستخدم وكلمة المرور');try{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});const d=await r.json();if(!r.ok)throw new Error(d.message||'بيانات الدخول غير صحيحة');if(d.mfaRequired){openMfaLogin(d.tempToken,d.user);return;}finishLogin(d);}catch(e){alert(e.message);}};fn.__v9=true;window.login=fn;
  }
  function finishLogin(d){sessionStorage.setItem('tech_current_user',JSON.stringify(d.user));sessionStorage.setItem('tech_admin_token',d.token);window.checkAuth?.();setTimeout(()=>{injectNavAndPanels();applyPermissions();},150);toast(`مرحباً ${d.user.username}!`);}
  function openMfaLogin(tempToken,safeUser){document.getElementById('v9Mfa')?.remove();const m=document.createElement('div');m.id='v9Mfa';m.className='v9-mfa-overlay';m.innerHTML=`<div class="v9-mfa-card"><span class="material-symbols-outlined">shield_lock</span><h3>تحقق أمني</h3><p>افتح تطبيق Authenticator واكتب الرمز المكون من 6 أرقام.</p><input id="v9MfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"><button id="v9MfaSubmit">تأكيد الدخول</button><button class="secondary" onclick="document.getElementById('v9Mfa')?.remove()">إلغاء</button></div>`;document.body.appendChild(m);const submit=async()=>{const code=document.getElementById('v9MfaCode').value.trim();if(code.length!==6)return;try{const r=await fetch('/api/admin/login/2fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tempToken,code})});const d=await r.json();if(!r.ok)throw new Error(d.message);m.remove();finishLogin(d);}catch(e){alert(e.message);}};document.getElementById('v9MfaSubmit').onclick=submit;document.getElementById('v9MfaCode').onkeydown=e=>{if(e.key==='Enter')submit();};setTimeout(()=>document.getElementById('v9MfaCode')?.focus(),80);}

  function enhanceOrderModal(){if(typeof window.openOrderDetails!=='function'||window.openOrderDetails.__v9)return;const old=window.openOrderDetails;const fn=function(id){old(id);setTimeout(()=>{const order=(window.adminOrdersCache||[]).find(o=>o._id===id),box=document.getElementById('orderDetailsContent');if(!order||!box||box.querySelector('.v9-order-admin-actions'))return;const a=document.createElement('div');a.className='v9-order-admin-actions';a.innerHTML=`<button><span class="material-symbols-outlined">print</span> طباعة فاتورة</button><button onclick="switchTab('returns');setTimeout(()=>v9LoadReturns(),50)"><span class="material-symbols-outlined">assignment_return</span> المرتجعات</button>`;a.querySelector('button').onclick=()=>printAdminInvoice(order);box.prepend(a);},0);};fn.__v9=true;window.openOrderDetails=fn;}
  function printAdminInvoice(o){const rows=(o.items||[]).map(i=>`<tr><td>${esc(i.title)}${i.variant?`<small>${esc(i.variant)}</small>`:''}</td><td>${i.quantity}</td><td>${money(i.price)}</td><td>${money(i.lineTotal)}</td></tr>`).join('');const w=window.open('','_blank','noopener,width=900,height=900');if(!w)return;w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(o.orderNumber)}</title><style>body{font-family:Tahoma,Arial;padding:34px;color:#111}header{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:18px}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:right}td small{display:block;color:#666}.total{font-size:20px;font-weight:bold}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#f6f6f6;padding:16px;margin:16px 0}@media print{button{display:none}}</style></head><body><header><div><h1>TECHNOLOGY STORE</h1><p>فاتورة طلب إلكتروني</p></div><div><b>${esc(o.orderNumber)}</b><br>${fmt(o.createdAt)}</div></header><div class="grid"><div>العميل: <b>${esc(o.customerName)}</b></div><div>الهاتف: <b>${esc(o.customerPhone)}</b></div><div>الاستلام: <b>${esc(o.deliveryMethod==='shipping'?'شحن':'استلام من المعرض')}</b></div><div>العنوان: <b>${esc(o.customerAddress||'—')}</b></div></div><table><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table><p>الشحن: <b>${money(o.shippingAmount)}</b></p><p>الخصم: <b>${money(o.discountAmount)}</b></p><p class="total">الإجمالي: ${money(o.total)}</p><button onclick="print()">طباعة</button><script>setTimeout(()=>print(),300)<\/script></body></html>`);w.document.close();}

  function wrapSwitchTab(){if(typeof window.switchTab!=='function'||window.switchTab.__v9)return;const old=window.switchTab;const fn=function(name){old(name);if(name==='intelligence')window.v9LoadIntelligence();if(name==='recovery')window.v9LoadCarts();if(name==='returns')window.v9LoadReturns();if(name==='system')window.v9LoadSystem();};fn.__v9=true;window.switchTab=fn;}

  function overrideLogout(){const fn=async()=>{try{await api('/api/admin/logout',{method:'POST'});}catch(_){}finally{sessionStorage.removeItem('tech_current_user');sessionStorage.removeItem('tech_admin_token');window.checkAuth?.();}};fn.__v9=true;window.logout=fn;}

  document.addEventListener('DOMContentLoaded',()=>{injectNavAndPanels();injectRolePresets();overrideUsers();overrideLogin();overrideLogout();wrapSwitchTab();enhanceOrderModal();setTimeout(()=>{applyPermissions();injectRolePresets();overrideUsers();enhanceOrderModal();overrideLogout();},600);});
})();


/* ===== Integrated admin redesign module ===== */
/* Technology Store V10 — Professional Admin Redesign */
(() => {
  const esc = (v='') => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const api = async (url, init={}) => {
    const r = await adminFetch(url, init);
    let d = {};
    try { d = await r.json(); } catch(_) {}
    if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
    return d;
  };

  const NAV = [
    ['overview','الرئيسية',['dashboard']],
    ['store','المتجر',['products','media']],
    ['sales','المبيعات والعملاء',['orders','customers','recovery','returns']],
    ['marketing','التسويق والمحتوى',['growth','reviews']],
    ['analytics','التحليلات',['intelligence','analytics']],
    ['operations','التشغيل',['system','backup']],
    ['security','الإدارة والنظام',['users','logs','api']],
    ['settings','الإعدادات',['settings']]
  ];
  const LABELS = {
    dashboard:['space_dashboard','لوحة التحكم'], products:['inventory_2','المنتجات والمخزون'], media:['photo_library','الصور والوسائط'],
    orders:['receipt_long','الطلبات'], customers:['contacts','العملاء'], recovery:['shopping_cart_checkout','السلات غير المكتملة'], returns:['assignment_return','الاستبدال والاسترجاع'],
    growth:['campaign','التسويق والعروض'], reviews:['reviews','تقييمات العملاء'], intelligence:['query_stats','مؤشرات المبيعات'], analytics:['analytics','الزوار والتقارير'],
    system:['health_and_safety','حالة النظام والأمان'], backup:['backup','النسخ الاحتياطي'], users:['group','المستخدمون والصلاحيات'],
    logs:['history','سجل العمليات'], api:['hub','التكاملات والصيانة'], settings:['settings','إعدادات المتجر']
  };
  const GROUP_LABELS = {
    overview:'الرئيسية', store:'المتجر', sales:'المبيعات والعملاء', marketing:'التسويق والمحتوى', analytics:'التحليلات', operations:'التشغيل', security:'الإدارة والنظام', settings:'الإعدادات'
  };

  function ensureReviewsTab(){
    if (document.getElementById('tab-reviews')) return;
    const nav=document.querySelector('.sidebar-nav'); if(!nav) return;
    const b=document.createElement('button'); b.id='tab-reviews'; b.className='admin-tab w-full flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant font-bold text-sm transition-all hover:bg-surface-variant/50';
    b.onclick=()=>window.switchTab('reviews'); b.innerHTML='<span class="material-symbols-outlined text-[20px]">reviews</span><span>تقييمات العملاء</span>'; nav.appendChild(b);
    const parent=document.getElementById('panel-settings')?.parentElement; if(!parent) return;
    const panel=document.createElement('div'); panel.id='panel-reviews'; panel.className='tab-panel hidden';
    panel.innerHTML=`
      <div class="v10-page-head"><div><small>إدارة المحتوى</small><h2>تقييمات العملاء</h2><p>راجع كل تقييم قبل ظهوره على الموقع، وعدّل النص المنشور أو أضف رد المتجر مع الاحتفاظ بالنص الأصلي.</p></div><button class="v10-primary-btn" id="v10ReviewsRefresh"><span class="material-symbols-outlined">refresh</span> تحديث</button></div>
      <div class="v10-review-toolbar">
        <div class="v10-review-tabs" id="v10ReviewTabs">
          <button data-status="pending" class="active">بانتظار المراجعة <b id="v10CountPending">0</b></button>
          <button data-status="published">منشور <b id="v10CountPublished">0</b></button>
          <button data-status="rejected">مرفوض <b id="v10CountRejected">0</b></button>
          <button data-status="hidden">مخفي <b id="v10CountHidden">0</b></button>
          <button data-status="">الكل <b id="v10CountAll">0</b></button>
        </div>
        <div class="v10-review-filters"><input id="v10ReviewSearch" type="search" placeholder="ابحث باسم العميل أو نص التقييم..."><select id="v10ReviewStars"><option value="">كل التقييمات</option><option value="5">5 نجوم</option><option value="4">4 نجوم</option><option value="3">3 نجوم</option><option value="2">نجمتان</option><option value="1">نجمة واحدة</option></select></div>
      </div>
      <div id="v10ReviewsGrid" class="v10-reviews-grid"><div class="v10-empty">جاري تحميل التقييمات...</div></div>`;
    parent.appendChild(panel);
    document.getElementById('v10ReviewsRefresh').onclick=loadReviews;
    document.getElementById('v10ReviewSearch').oninput=renderReviews;
    document.getElementById('v10ReviewStars').onchange=renderReviews;
    document.getElementById('v10ReviewTabs').onclick=e=>{const b=e.target.closest('button[data-status]'); if(!b)return; window.__v10ReviewStatus=b.dataset.status; [...document.querySelectorAll('#v10ReviewTabs button')].forEach(x=>x.classList.toggle('active',x===b)); loadReviews();};
  }

  function organizeSidebar(){
    ensureReviewsTab();
    const nav=document.querySelector('.sidebar-nav'); if(!nav)return;
    [...nav.querySelectorAll('.v10-nav-group-title')].forEach(x=>x.remove());
    NAV.forEach(([group,,tabs])=>{
      const existing=tabs.map(t=>document.getElementById(`tab-${t}`)).filter(Boolean);
      if(!existing.length)return;
      const h=document.createElement('div');h.className='v10-nav-group-title';h.textContent=GROUP_LABELS[group];nav.appendChild(h);
      existing.forEach(btn=>{
        const key=btn.id.replace('tab-','');const meta=LABELS[key];
        if(meta)btn.innerHTML=`<span class="material-symbols-outlined text-[20px]">${meta[0]}</span><span>${meta[1]}</span>`;
        btn.classList.add('v10-nav-item'); nav.appendChild(btn);
      });
    });
  }

  function buildSettingsNavigator(){
    const panel=document.getElementById('panel-settings'); if(!panel||document.getElementById('v10SettingsNav'))return;
    const grid=panel.querySelector(':scope > .grid'); if(!grid)return;
    const nav=document.createElement('div');nav.id='v10SettingsNav';nav.className='v10-settings-nav';
    const cats=[['all','كل الإعدادات'],['general','عام'],['appearance','المظهر والمحتوى'],['commerce','الشحن والدفع'],['communication','التواصل'],['marketing','تجربة التسوق'],['security','الأمان والتكامل']];
    nav.innerHTML=cats.map((x,i)=>`<button data-cat="${x[0]}" class="${i===0?'active':''}">${x[1]}</button>`).join('');
    panel.insertBefore(nav,grid);
    nav.onclick=e=>{const b=e.target.closest('button[data-cat]');if(!b)return;nav.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));filterSettings(b.dataset.cat);};
    classifySettingsCards();
  }
  function classifySettingsCards(){
    const panel=document.getElementById('panel-settings'),grid=panel?.querySelector(':scope > .grid');if(!grid)return;
    [...grid.children].forEach(card=>{
      if(card.id==='v8CommerceSettings')card.dataset.v10cat='commerce';
      const t=(card.querySelector('h3')?.textContent||card.textContent||'').trim();
      if(/بيانات الدخول|API|ربط الكاشير/i.test(t))card.dataset.v10cat='security';
      else if(/مظهر الموقع|المناسبات|البانر/i.test(t))card.dataset.v10cat='appearance';
      else if(/تواصل|واتساب|فيسبوك|إنستجرام|TikTok|Twitter|Telegram/i.test(t))card.dataset.v10cat='communication';
      else if(/الشحن|الدفع|InstaPay/i.test(t))card.dataset.v10cat='commerce';
      else if(/تجربة التسوق|النمو|Push|المفضلة|مقارنة/i.test(t))card.dataset.v10cat='marketing';
      else if(!card.dataset.v10cat)card.dataset.v10cat='general';
      card.classList.add('v10-settings-card');
    });
  }
  function filterSettings(cat='all'){
    classifySettingsCards();document.querySelectorAll('#panel-settings .v10-settings-card').forEach(c=>c.classList.toggle('v10-setting-hidden',cat!=='all'&&c.dataset.v10cat!==cat));
  }

  function makeDashboardInteractive(){
    const actions={
      dashProductsTotal:()=>{switchTab('products');setTimeout(()=>window.setAdminStockFilter?.(''),50);},
      dashProductsVisible:()=>switchTab('products'),
      dashLowStock:()=>{switchTab('products');setTimeout(()=>window.setAdminStockFilter?.('low_stock'),50);},
      dashOutStock:()=>{switchTab('products');setTimeout(()=>window.setAdminStockFilter?.('out_of_stock'),50);},
      dashMissingImages:()=>{switchTab('products');setTimeout(()=>window.setAdminStockFilter?.('missing_image'),50);},
      dashOrdersToday:()=>{switchTab('orders');setTimeout(()=>window.loadOrders?.(1),50);}
    };
    Object.entries(actions).forEach(([id,fn])=>{const n=document.getElementById(id),card=n?.closest('.glass-panel');if(!card||card.dataset.v10click)return;card.dataset.v10click='1';card.classList.add('v10-clickable-kpi');card.tabIndex=0;card.onclick=fn;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn();}};});
    const health=document.getElementById('healthDb')?.closest('.glass-panel');if(health&&!health.dataset.v10click){health.dataset.v10click='1';health.classList.add('v10-clickable-panel');health.onclick=()=>switchTab('system');}
    document.querySelector('#panel-dashboard h3')?.replaceChildren(document.createTextNode('لوحة التحكم'));
  }


  function enhanceDashboardAlerts(){
    const box=document.getElementById('dashboardAlerts');if(!box||box.dataset.v10bound)return;box.dataset.v10bound='1';
    box.addEventListener('click',e=>{const card=e.target.closest('.glass-panel');if(!card)return;const t=card.textContent||'';if(/مخزون منخفض/.test(t)){switchTab('products');setTimeout(()=>window.setAdminStockFilter?.('low_stock'),50);}else if(/بدون صورة/.test(t)){switchTab('products');setTimeout(()=>window.setAdminStockFilter?.('missing_image'),50);}else if(/طلب جديد/.test(t)){switchTab('orders');setTimeout(()=>window.loadOrders?.(1),50);}else if(/إشعارات/.test(t)){switchTab('settings');setTimeout(()=>document.querySelector('#v10SettingsNav [data-cat="marketing"]')?.click(),100);}});
    const mark=()=>[...box.children].forEach(x=>{x.classList.add('v10-clickable-kpi');x.setAttribute('role','button');});
    new MutationObserver(mark).observe(box,{childList:true});mark();
  }

  function hideLegacyReviewBlock(){
    const old=document.getElementById('v8ReviewsAdmin')?.closest('.v8-growth-card');if(old)old.style.display='none';
  }
  function addGlobalSearch(){
    if(document.getElementById('v10GlobalSearch'))return;const header=document.querySelector('#adminContainer main')?.previousElementSibling||document.querySelector('#adminContainer header');if(!header)return;
    const slot=header.querySelector('.flex.items-center.gap-2')||header.lastElementChild; if(!slot)return;
    const wrap=document.createElement('div');wrap.id='v10GlobalSearch';wrap.className='v10-global-search';wrap.innerHTML='<span class="material-symbols-outlined">search</span><input placeholder="بحث سريع: منتج، طلب، عميل..." aria-label="بحث سريع"><select><option value="products">المنتجات</option><option value="orders">الطلبات</option></select>';
    slot.prepend(wrap);const input=wrap.querySelector('input'),sel=wrap.querySelector('select');
    input.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const q=input.value.trim();if(!q)return;if(sel.value==='orders'){switchTab('orders');setTimeout(()=>{const x=document.getElementById('ordersSearchInput');if(x){x.value=q;window.loadOrders?.(1);}},50);}else{switchTab('products');setTimeout(()=>{const x=document.getElementById('adminSearchInput');if(x){x.value=q;window.filterAdminProducts?.();}},50);}});
  }

  let reviews=[]; window.__v10ReviewStatus='pending';
  async function loadReviews(){
    const grid=document.getElementById('v10ReviewsGrid');if(grid)grid.innerHTML='<div class="v10-empty">جاري تحميل التقييمات...</div>';
    try{reviews=await api('/api/admin/reviews'); updateReviewCounts();renderReviews();}catch(e){if(grid)grid.innerHTML=`<div class="v10-empty v10-error">${esc(e.message)}</div>`;}
  }
  function updateReviewCounts(){const count=s=>reviews.filter(r=>(r.status||(r.approved?'published':'pending'))===s).length;[['Pending','pending'],['Published','published'],['Rejected','rejected'],['Hidden','hidden']].forEach(([id,s])=>{const e=document.getElementById('v10Count'+id);if(e)e.textContent=count(s)});const a=document.getElementById('v10CountAll');if(a)a.textContent=reviews.length;}
  function renderReviews(){
    const grid=document.getElementById('v10ReviewsGrid');if(!grid)return;const status=window.__v10ReviewStatus??'pending',q=(document.getElementById('v10ReviewSearch')?.value||'').trim().toLowerCase(),stars=Number(document.getElementById('v10ReviewStars')?.value||0);
    const list=reviews.filter(r=>{const st=r.status||(r.approved?'published':'pending');if(status&&st!==status)return false;if(stars&&Number(r.rating)!==stars)return false;if(q&&!`${r.name} ${r.productId?.title||''} ${r.originalComment||r.comment||''} ${r.publishedComment||''}`.toLowerCase().includes(q))return false;return true;});
    const statusLabel={pending:'بانتظار المراجعة',published:'منشور',rejected:'مرفوض',hidden:'مخفي'};
    grid.innerHTML=list.length?list.map(r=>{const st=r.status||(r.approved?'published':'pending');return `<article class="v10-review-card"><header><div><small>${esc(r.productId?.title||'منتج')}</small><h3>${esc(r.name)} ${r.verifiedPurchase?'<span class="v101-verified">✓ مشتري موثّق</span>':''}</h3></div><span class="v10-review-status ${st}">${statusLabel[st]||st}</span></header><div class="v10-stars">${'★'.repeat(Number(r.rating)||0)}${'☆'.repeat(5-(Number(r.rating)||0))}</div><p>${esc(r.publishedComment||r.comment||r.originalComment||'بدون تعليق')}</p>${r.storeReply?`<div class="v10-reply-preview"><b>رد المتجر</b><span>${esc(r.storeReply)}</span></div>`:''}<footer><small>${new Date(r.createdAt).toLocaleString('ar-EG')}</small><button onclick="window.v10EditReview('${r._id}')">مراجعة وتعديل</button></footer></article>`}).join(''):'<div class="v10-empty">لا توجد تقييمات مطابقة.</div>';
  }
  window.v10EditReview=(id)=>{const r=reviews.find(x=>x._id===id);if(!r)return;document.getElementById('v10ReviewModal')?.remove();const st=r.status||(r.approved?'published':'pending');const m=document.createElement('div');m.id='v10ReviewModal';m.className='v10-modal';m.innerHTML=`<div class="v10-modal-backdrop"></div><section class="v10-review-editor"><header><div><small>مراجعة قبل النشر</small><h2>${esc(r.productId?.title||'تقييم عميل')}</h2><p>${esc(r.name)} · ${new Date(r.createdAt).toLocaleString('ar-EG')} ${r.verifiedPurchase?`· ✓ شراء موثّق ${r.verifiedOrderNumber?`(${esc(r.verifiedOrderNumber)})`:''}`:''}</p></div><button class="v10-close">×</button></header><div class="v10-editor-grid"><label><span>تقييم العميل</span><div class="v10-rating-readonly">${'★'.repeat(Number(r.rating)||0)}${'☆'.repeat(5-(Number(r.rating)||0))} <small>${Number(r.rating)||0}/5</small></div></label><label><span>الحالة الحالية</span><div class="v10-status-readonly">${st==='pending'?'بانتظار المراجعة':st==='published'?'منشور':st==='rejected'?'مرفوض':'مخفي'}</div></label><label class="wide"><span>النص الأصلي من العميل</span><textarea readonly>${esc(r.originalComment||r.comment||'')}</textarea><small>محفوظ للرجوع إليه ولا يتغير عند تعديل النص المنشور.</small></label><label class="wide"><span>النص الذي سيظهر على الموقع</span><textarea id="v10EditPublished">${esc(r.publishedComment||r.comment||r.originalComment||'')}</textarea></label><label class="wide"><span>رد المتجر (اختياري)</span><textarea id="v10EditReply" placeholder="اكتب رد Technology Store...">${esc(r.storeReply||'')}</textarea></label></div><div class="v10-editor-actions"><button data-save="pending" class="secondary">حفظ للمراجعة</button><button data-save="rejected" class="danger">رفض</button><button data-save="hidden" class="secondary">إخفاء</button><button data-save="published" class="primary">اعتماد ونشر</button></div></section>`;document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v10-modal-backdrop').onclick=close;m.querySelector('.v10-close').onclick=close;m.querySelector('.v10-editor-actions').onclick=async e=>{const b=e.target.closest('button[data-save]');if(!b)return;b.disabled=true;try{await api(`/api/admin/reviews/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:b.dataset.save,publishedComment:document.getElementById('v10EditPublished').value,storeReply:document.getElementById('v10EditReply').value})});showToast('✅ تم تحديث التقييم');close();await loadReviews();}catch(err){alert(err.message);}finally{b.disabled=false;}};};

  function wrapSwitch(){if(!window.switchTab||window.switchTab.__v10)return;const old=window.switchTab;const fn=function(name){old(name);if(name==='reviews')setTimeout(loadReviews,40);if(name==='settings')setTimeout(()=>{buildSettingsNavigator();classifySettingsCards();},80);};fn.__v10=true;window.switchTab=fn;}

  function boot(){ensureReviewsTab();organizeSidebar();buildSettingsNavigator();makeDashboardInteractive();enhanceDashboardAlerts();hideLegacyReviewBlock();addGlobalSearch();wrapSwitch();setTimeout(()=>{organizeSidebar();classifySettingsCards();makeDashboardInteractive();enhanceDashboardAlerts();hideLegacyReviewBlock();},800);setTimeout(()=>{organizeSidebar();classifySettingsCards();hideLegacyReviewBlock();},2200);}
  document.addEventListener('DOMContentLoaded',boot);
})();


/* ===== Integrated admin production module ===== */
/* Technology Store V10.1 — Admin Readability + Workflow + Operations */
(() => {
  const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const api=async(url,init={})=>{const r=await adminFetch(url,init);let d={};try{d=await r.json();}catch(_){}if(!r.ok)throw new Error(d.message||`HTTP ${r.status}`);return d;};
  const money=v=>`${Number(v||0).toLocaleString('ar-EG',{maximumFractionDigits:2})} ج.م`;
  const fmt=v=>v?new Date(v).toLocaleString('ar-EG'):'—';
  const has=p=>typeof hasPermission==='function'?hasPermission(p):true;

  function ensureCustomersPanel(){
    if(document.getElementById('tab-customers'))return;
    const nav=document.querySelector('.sidebar-nav'); if(!nav)return;
    const b=document.createElement('button');b.id='tab-customers';b.className='admin-tab w-full flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant font-bold text-sm transition-all hover:bg-surface-variant/50';b.onclick=()=>window.switchTab('customers');b.innerHTML='<span class="material-symbols-outlined text-[20px]">contacts</span><span>العملاء</span>';
    const orders=document.getElementById('tab-orders');(orders?.parentNode||nav).insertBefore(b,orders?.nextSibling||null);
    const parent=document.getElementById('panel-settings')?.parentElement;if(!parent)return;
    const panel=document.createElement('div');panel.id='panel-customers';panel.className='tab-panel hidden';panel.innerHTML=`
      <div class="v101-page-head"><div><small>المبيعات والعملاء</small><h2>ملفات العملاء</h2><p>عرض موحد لطلبات العميل، إجمالي مشترياته وآخر تعاملاته بدون إنشاء بيانات مكررة.</p></div><button class="v101-primary" onclick="window.v101LoadCustomers(1)"><span class="material-symbols-outlined">refresh</span> تحديث</button></div>
      <section class="glass-panel v101-toolbar"><div class="v101-search"><span class="material-symbols-outlined">search</span><input id="v101CustomerSearch" placeholder="ابحث بالاسم أو الهاتف أو رقم الطلب"></div><button onclick="window.v101LoadCustomers(1)">بحث</button><span id="v101CustomersCount">—</span></section>
      <section class="glass-panel v101-table-card"><div class="v101-table-scroll"><table class="v101-data-table"><thead><tr><th>العميل</th><th>رقم الهاتف</th><th>عدد الطلبات</th><th>إجمالي المشتريات</th><th>آخر طلب</th><th>آخر تعامل</th><th>التفاصيل</th></tr></thead><tbody id="v101CustomersBody"><tr><td colspan="7">جاري التحميل...</td></tr></tbody></table></div><div class="v101-pager"><button id="v101CustPrev">السابق</button><span id="v101CustPage">1 / 1</span><button id="v101CustNext">التالي</button></div></section>`;
    parent.appendChild(panel);document.getElementById('v101CustomerSearch').addEventListener('keydown',e=>{if(e.key==='Enter')window.v101LoadCustomers(1);});
  }
  let custPage=1,custPages=1;
  window.v101LoadCustomers=async(page=1)=>{if(!has('manage_orders'))return;const body=document.getElementById('v101CustomersBody');if(!body)return;body.innerHTML='<tr><td colspan="7">جاري التحميل...</td></tr>';try{const q=new URLSearchParams({page:String(Math.max(1,page)),limit:'25'}),search=document.getElementById('v101CustomerSearch')?.value.trim()||'';if(search)q.set('search',search);const d=await api(`/api/admin/customers?${q}`);custPage=d.page||1;custPages=d.pages||1;document.getElementById('v101CustomersCount').textContent=`${d.total||0} عميل`;document.getElementById('v101CustPage').textContent=`${custPage} / ${custPages}`;document.getElementById('v101CustPrev').disabled=custPage<=1;document.getElementById('v101CustNext').disabled=custPage>=custPages;document.getElementById('v101CustPrev').onclick=()=>window.v101LoadCustomers(custPage-1);document.getElementById('v101CustNext').onclick=()=>window.v101LoadCustomers(custPage+1);body.innerHTML=(d.customers||[]).length?d.customers.map(c=>`<tr><td><strong>${esc(c.name||'عميل')}</strong></td><td dir="ltr">${esc(c.phone||'')}</td><td><span class="v101-number-badge">${c.orders||0}</span></td><td><strong class="v101-money">${money(c.revenue)}</strong></td><td dir="ltr">${esc(c.lastOrderNumber||'—')}</td><td>${fmt(c.lastOrderAt)}</td><td><button class="v101-row-btn" onclick="window.v101OpenCustomer('${esc(c.phone)}')">فتح الملف</button></td></tr>`).join(''):'<tr><td colspan="7">لا توجد نتائج.</td></tr>';}catch(e){body.innerHTML=`<tr><td colspan="7" class="v101-error">${esc(e.message)}</td></tr>`;}};
  window.v101OpenCustomer=async phone=>{try{const d=await api(`/api/admin/customers/${encodeURIComponent(phone)}`);document.getElementById('v101CustomerModal')?.remove();const m=document.createElement('div');m.id='v101CustomerModal';m.className='v101-modal';m.innerHTML=`<div class="v101-modal-backdrop"></div><section class="v101-modal-card"><header><div><small>ملف العميل</small><h2>${esc(d.name||'عميل')}</h2><p dir="ltr">${esc(d.phone||'')}</p></div><button class="v101-modal-close">×</button></header><div class="v101-customer-kpis"><div><small>الطلبات</small><b>${d.orders?.length||0}</b></div><div><small>إجمالي المشتريات</small><b>${money(d.revenue)}</b></div><div><small>الاستبدال والاسترجاع</small><b>${d.returns?.length||0}</b></div></div><h3>الطلبات الأخيرة</h3><div class="v101-order-list">${(d.orders||[]).map(o=>`<button onclick="document.getElementById('v101CustomerModal')?.remove();switchTab('orders');setTimeout(()=>{const q=document.getElementById('ordersSearchInput');if(q){q.value='${esc(o.orderNumber)}';loadOrders(1)}},80)"><span><b dir="ltr">${esc(o.orderNumber)}</b><small>${fmt(o.createdAt)}</small></span><strong>${money(o.total)}</strong></button>`).join('')}</div></section>`;document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v101-modal-backdrop').onclick=close;m.querySelector('.v101-modal-close').onclick=close;}catch(e){alert(e.message);}};

  function injectNotificationCenter(){
    if(document.getElementById('v101Notifications'))return;const header=document.querySelector('#adminContainer header .flex.items-center.gap-2.md\\:gap-3')||document.querySelector('#adminContainer header > div:last-child');if(!header)return;
    const wrap=document.createElement('div');wrap.id='v101Notifications';wrap.className='v101-notifications';wrap.innerHTML=`<button id="v101NotifBtn" class="v101-notif-btn" aria-label="تنبيهات الإدارة"><span class="material-symbols-outlined">notifications</span><b id="v101NotifCount" class="hidden">0</b></button><div id="v101NotifMenu" class="v101-notif-menu hidden"><header><strong>التنبيهات</strong><button id="v101NotifRefresh"><span class="material-symbols-outlined">refresh</span></button></header><div id="v101NotifList"><p>جاري التحميل...</p></div></div>`;header.prepend(wrap);
    const btn=wrap.querySelector('#v101NotifBtn'),menu=wrap.querySelector('#v101NotifMenu');btn.onclick=e=>{e.stopPropagation();menu.classList.toggle('hidden');if(!menu.classList.contains('hidden'))loadNotifications();};wrap.querySelector('#v101NotifRefresh').onclick=loadNotifications;document.addEventListener('click',e=>{if(!wrap.contains(e.target))menu.classList.add('hidden');});setTimeout(loadNotifications,700);setInterval(()=>{if(!document.hidden)loadNotifications(true);},60000);
  }
  async function loadNotifications(silent=false){try{const d=await api('/api/admin/notifications'),count=document.getElementById('v101NotifCount'),list=document.getElementById('v101NotifList');if(count){count.textContent=d.count||0;count.classList.toggle('hidden',!d.count);}if(list)list.innerHTML=(d.items||[]).length?d.items.map(x=>`<button data-tab="${esc(x.tab)}" data-filter="${esc(x.filter||'')}"><span class="material-symbols-outlined">${esc(x.icon||'notifications')}</span><div><strong>${esc(x.title)}</strong><small>${esc(x.text||'')}</small></div></button>`).join(''):'<div class="v101-notif-empty"><span class="material-symbols-outlined">task_alt</span><p>لا توجد تنبيهات تحتاج إجراء.</p></div>';list?.querySelectorAll('button[data-tab]').forEach(b=>b.onclick=()=>{switchTab(b.dataset.tab);document.getElementById('v101NotifMenu')?.classList.add('hidden');if(b.dataset.filter)setTimeout(()=>window.setAdminStockFilter?.(b.dataset.filter),100);});}catch(e){if(!silent){const list=document.getElementById('v101NotifList');if(list)list.innerHTML='<p>تعذر تحميل التنبيهات.</p>';}}}

  function enhanceShippingManagement(){
    if(typeof window.openOrderDetails!=='function'||window.openOrderDetails.__v101)return;const old=window.openOrderDetails;const fn=function(id){old(id);setTimeout(()=>{const order=(window.adminOrdersCache||[]).find(o=>o._id===id),box=document.getElementById('orderDetailsContent');if(!order||!box||box.querySelector('.v101-shipping-admin'))return;const card=document.createElement('div');card.className='v101-shipping-admin';card.innerHTML=`<div><span class="material-symbols-outlined">local_shipping</span><div><small>بيانات الشحن</small><strong>${esc(order.shippingCarrier||'لم تحدد شركة الشحن')}</strong><p>${order.trackingNumber?`رقم التتبع: <b dir="ltr">${esc(order.trackingNumber)}</b>`:'لا يوجد رقم تتبع مسجل'}</p></div></div><button>تعديل بيانات الشحن</button>`;card.querySelector('button').onclick=()=>openShippingEditor(order);box.prepend(card);},60);};fn.__v101=true;window.openOrderDetails=fn;
  }
  function openShippingEditor(order){document.getElementById('v101ShippingModal')?.remove();const m=document.createElement('div');m.id='v101ShippingModal';m.className='v101-modal';m.innerHTML=`<div class="v101-modal-backdrop"></div><section class="v101-modal-card v101-shipping-editor"><header><div><small>الطلب ${esc(order.orderNumber)}</small><h2>بيانات شركة الشحن</h2><p>سيشاهد العميل هذه البيانات عند تتبع الطلب.</p></div><button class="v101-modal-close">×</button></header><div class="v101-form-grid"><label><span>شركة الشحن</span><input id="v101Carrier" value="${esc(order.shippingCarrier||'')}" placeholder="مثال: Bosta / Mylerz"></label><label><span>رقم البوليصة / التتبع</span><input id="v101TrackingNo" dir="ltr" value="${esc(order.trackingNumber||'')}"></label><label class="wide"><span>رابط التتبع الخارجي (اختياري)</span><input id="v101TrackingUrl" dir="ltr" value="${esc(order.trackingUrl||'')}" placeholder="https://..."></label><label><span>موعد التسليم المتوقع</span><input id="v101Eta" type="date" value="${order.estimatedDeliveryAt?new Date(order.estimatedDeliveryAt).toISOString().slice(0,10):''}"></label></div><footer><button class="secondary v101-modal-close2">إلغاء</button><button class="primary" id="v101SaveShipping">حفظ بيانات الشحن</button></footer></section>`;document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v101-modal-backdrop').onclick=close;m.querySelector('.v101-modal-close').onclick=close;m.querySelector('.v101-modal-close2').onclick=close;m.querySelector('#v101SaveShipping').onclick=async()=>{const btn=m.querySelector('#v101SaveShipping');btn.disabled=true;try{const d=await api(`/api/admin/orders/${order._id}/shipping`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({shippingCarrier:m.querySelector('#v101Carrier').value,trackingNumber:m.querySelector('#v101TrackingNo').value,trackingUrl:m.querySelector('#v101TrackingUrl').value,estimatedDeliveryAt:m.querySelector('#v101Eta').value||null})});Object.assign(order,d.order||{});showToast('✅ تم حفظ بيانات الشحن');close();window.openOrderDetails(order._id);}catch(e){alert(e.message);}finally{btn.disabled=false;}};}

  const selectedProducts=new Set();
  function injectBulkToolbar(){const table=document.getElementById('adminProductsTable');if(!table||document.getElementById('v101BulkToolbar'))return;const container=table.closest('.glass-panel')||table.parentElement;const bar=document.createElement('div');bar.id='v101BulkToolbar';bar.className='v101-bulk-toolbar';bar.innerHTML=`<div><span class="material-symbols-outlined">select_check_box</span><strong><b id="v101SelectedCount">0</b> محدد</strong></div><select id="v101BulkAction"><option value="">اختر إجراءً جماعياً</option><option value="hide">إخفاء المنتجات</option><option value="show">إظهار المنتجات</option><option value="featured">تمييز المنتجات</option><option value="unfeatured">إلغاء التمييز</option><option value="category">نقل إلى قسم</option><option value="price_percent">تعديل السعر بنسبة %</option></select><input id="v101BulkValue" class="hidden" placeholder="القيمة"><button id="v101BulkApply">تنفيذ</button><button id="v101BulkClear" class="secondary">إلغاء التحديد</button>`;container.insertBefore(bar,container.firstChild);bar.querySelector('#v101BulkAction').onchange=e=>{const inp=bar.querySelector('#v101BulkValue');inp.classList.toggle('hidden',!['category','price_percent'].includes(e.target.value));inp.placeholder=e.target.value==='category'?'اسم القسم':'النسبة مثال 10 أو -5';};bar.querySelector('#v101BulkClear').onclick=()=>{selectedProducts.clear();syncBulkSelection();decorateProductRows();};bar.querySelector('#v101BulkApply').onclick=applyBulkAction;
    new MutationObserver(()=>decorateProductRows()).observe(table,{childList:true});decorateProductRows();
  }
  function decorateProductRows(){const table=document.getElementById('adminProductsTable');if(!table)return;const products=window.filteredProducts||[],start=((window.currentPage||1)-1)*(window.ITEMS_PER_PAGE||20);[...table.querySelectorAll('tr.product-admin-row')].forEach((row,i)=>{const p=products[start+i];if(!p)return;row.dataset.productId=p._id;let cb=row.querySelector('.v101-product-check');if(!cb){cb=document.createElement('input');cb.type='checkbox';cb.className='v101-product-check';const cell=row.querySelector('.product-admin-cell');cell?.prepend(cb);cb.onclick=e=>e.stopPropagation();cb.onchange=()=>{cb.checked?selectedProducts.add(p._id):selectedProducts.delete(p._id);syncBulkSelection();};}cb.checked=selectedProducts.has(p._id);});syncBulkSelection();}
  function syncBulkSelection(){const e=document.getElementById('v101SelectedCount');if(e)e.textContent=selectedProducts.size;}
  async function applyBulkAction(){const action=document.getElementById('v101BulkAction')?.value||'',value=document.getElementById('v101BulkValue')?.value||'';if(!action)return alert('اختر الإجراء أولاً');if(!selectedProducts.size)return alert('حدد منتجاً واحداً على الأقل');if(!confirm(`تنفيذ الإجراء على ${selectedProducts.size} منتج؟`))return;try{await api('/api/admin/products/bulk-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[...selectedProducts],action,value,category:action==='category'?value:undefined})});showToast('✅ تم تنفيذ التعديل الجماعي');selectedProducts.clear();await window.loadAdminProducts?.(true);}catch(e){alert(e.message);}}

  function improveAnalyticsReadability(){const panel=document.getElementById('panel-analytics');if(!panel)return;panel.classList.add('v101-readable-panel');const visitors=document.getElementById('analytics-visitors-table')?.closest('.glass-panel');visitors?.classList.add('v101-visitors-card');document.querySelectorAll('#panel-analytics table,#panel-orders table,#panel-returns table,#panel-logs table').forEach(t=>t.classList.add('v101-readable-table'));}

  function arabizeLegacyLabels(){const replaces=new Map([['V9 Growth Intelligence','تحليل نمو المبيعات'],['Sales Recovery','استعادة المبيعات'],['After Sales','خدمات ما بعد البيع'],['Production Center','مركز تشغيل النظام'],['POS Sync Center','مزامنة نظام نقاط البيع'],['Cloud Backup Center','مركز النسخ الاحتياطي السحابي'],['Health Check','فحص حالة النظام'],['Checkout','إتمام الطلب'],['Direct','مباشر'],['Referrer','المصدر السابق'],['Visitor ID','معرّف الزائر'],['CSV الزوار','تصدير الزوار'],['CSV الجلسات','تصدير الجلسات']]);const walker=document.createTreeWalker(document.getElementById('adminContainer')||document.body,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){let v=n.nodeValue;for(const [a,b] of replaces)if(v.includes(a))v=v.split(a).join(b);n.nodeValue=v;}}

  function injectProfitCard(){const grid=document.getElementById('dashOrdersToday')?.closest('.grid');if(!grid||document.getElementById('v101ProfitCard'))return;const c=document.createElement('div');c.id='v101ProfitCard';c.className='glass-panel p-4 rounded-xl border border-outline-variant/30 v10-clickable-kpi';c.innerHTML='<p class="text-xs text-on-surface-variant">مجمل ربح اليوم</p><p id="v101ProfitValue" class="text-2xl font-bold text-emerald-400 mt-2">—</p><small>يظهر عند توفر تكلفة المنتج من نظام نقاط البيع</small>';grid.appendChild(c);c.onclick=()=>switchTab('intelligence');}
  async function refreshProfit(){try{const d=await api('/api/admin/dashboard');const e=document.getElementById('v101ProfitValue');if(e)e.textContent=d.orders?.costDataAvailable?money(d.orders.todayGrossProfit):'غير متاح';}catch(_){} }

  function wrapSwitch(){if(typeof window.switchTab!=='function'||window.switchTab.__v101)return;const old=window.switchTab;const fn=function(name){old(name);if(name==='customers')setTimeout(()=>window.v101LoadCustomers(custPage),50);if(name==='analytics')setTimeout(improveAnalyticsReadability,80);if(name==='products')setTimeout(()=>{injectBulkToolbar();decorateProductRows();},100);setTimeout(arabizeLegacyLabels,100);};fn.__v101=true;window.switchTab=fn;}
  function wrapDashboard(){if(typeof window.loadDashboard!=='function'||window.loadDashboard.__v101)return;const old=window.loadDashboard;const fn=async function(){await old();injectProfitCard();refreshProfit();setTimeout(loadNotifications,100);};fn.__v101=true;window.loadDashboard=fn;}

  function boot(){ensureCustomersPanel();injectNotificationCenter();enhanceShippingManagement();injectBulkToolbar();improveAnalyticsReadability();arabizeLegacyLabels();injectProfitCard();wrapSwitch();wrapDashboard();setTimeout(()=>{enhanceShippingManagement();injectBulkToolbar();improveAnalyticsReadability();arabizeLegacyLabels();loadNotifications(true);refreshProfit();},900);}
  document.addEventListener('DOMContentLoaded',boot);
})();


/* ===== Integrated admin final polish module ===== */
/* Technology Store V10.2 — Final UI Polish */
(() => {
  const labels = new Map([
    ['Direct','زيارة مباشرة'],['direct','زيارة مباشرة'],['Referrer','المصدر السابق'],['Visitor ID','معرّف الزائر'],
    ['Sales Recovery','استعادة المبيعات'],['After Sales','خدمات ما بعد البيع'],['Production Center','مركز تشغيل النظام'],
    ['POS Sync Center','مزامنة نظام نقاط البيع'],['Cloud Backup Center','مركز النسخ الاحتياطي السحابي'],['Health Check','فحص حالة النظام'],
    ['Checkout','إتمام الطلب'],['CSV الزوار','تصدير الزوار'],['CSV الجلسات','تصدير الجلسات'],['Analytics','التحليلات']
  ]);

  function arabize(root=document.getElementById('adminContainer')||document.body){
    if(!root) return;
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let n;
    while(n=w.nextNode()){
      let v=n.nodeValue;
      for(const [a,b] of labels){ if(v && v.includes(a)) v=v.split(a).join(b); }
      n.nodeValue=v;
    }
  }

  function tuneDashboard(){
    const grid=document.getElementById('dashOrdersToday')?.closest('.grid');
    if(grid) grid.classList.add('v102-dashboard-kpis');
    const recent=document.getElementById('dashboardRecentOrders')?.closest('.glass-panel');
    const health=document.getElementById('healthDb')?.closest('.glass-panel');
    recent?.classList.add('v102-dashboard-main-card');
    health?.classList.add('v102-dashboard-main-card');
  }

  let productSort='default';
  function injectProductSort(){
    if(document.getElementById('v102ProductSortWrap')) return;
    const meta=document.querySelector('#panel-products .products-table-meta');
    if(!meta) return;
    const wrap=document.createElement('div');
    wrap.id='v102ProductSortWrap';
    wrap.innerHTML=`<label for="v102ProductSort">ترتيب</label><select id="v102ProductSort"><option value="default">الترتيب الحالي</option><option value="name_asc">الاسم أ ← ي</option><option value="name_desc">الاسم ي ← أ</option><option value="price_desc">السعر: الأعلى أولاً</option><option value="price_asc">السعر: الأقل أولاً</option><option value="stock_asc">المخزون: الأقل أولاً</option><option value="stock_desc">المخزون: الأعلى أولاً</option></select>`;
    meta.appendChild(wrap);
    wrap.querySelector('select').addEventListener('change',e=>{productSort=e.target.value;applyProductSort(true);});
  }

  function sortArray(arr){
    if(!Array.isArray(arr)||productSort==='default') return arr;
    const coll=new Intl.Collator('ar',{numeric:true,sensitivity:'base'});
    return arr.sort((a,b)=>{
      if(productSort==='name_asc') return coll.compare(a.title||'',b.title||'');
      if(productSort==='name_desc') return coll.compare(b.title||'',a.title||'');
      if(productSort==='price_asc') return Number(a.price||0)-Number(b.price||0);
      if(productSort==='price_desc') return Number(b.price||0)-Number(a.price||0);
      if(productSort==='stock_asc') return Number(a.stockQuantity||0)-Number(b.stockQuantity||0);
      if(productSort==='stock_desc') return Number(b.stockQuantity||0)-Number(a.stockQuantity||0);
      return 0;
    });
  }

  function applyProductSort(render=false){
    if(!Array.isArray(window.filteredProducts)) return;
    sortArray(window.filteredProducts);
    if(render && typeof window.renderProductsPage==='function') window.renderProductsPage();
  }

  function wrapProductsRender(){
    if(typeof window.renderProductsPage!=='function'||window.renderProductsPage.__v102) return;
    const old=window.renderProductsPage;
    const fn=function(){ applyProductSort(false); const r=old.apply(this,arguments); setTimeout(()=>{injectProductSort();},0); return r; };
    fn.__v102=true; window.renderProductsPage=fn;
  }

  function tuneRecovery(){
    const panel=document.getElementById('panel-recovery');
    if(!panel) return;
    panel.classList.add('v102-recovery');
    const search=document.getElementById('v9CartSearch');
    if(search && !search.dataset.v102){search.dataset.v102='1';search.placeholder='ابحث باسم العميل أو الهاتف أو المنتج';}
  }

  function markTables(){
    document.querySelectorAll('#panel-products table,#panel-orders table,#panel-returns table,#panel-customers table,#panel-analytics table').forEach(t=>t.classList.add('v102-readable-table'));
  }

  function observeDynamicText(){
    const root=document.getElementById('adminMainScroll'); if(!root||root.dataset.v102observer) return;
    root.dataset.v102observer='1';
    let timer;
    new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{arabize(root);tuneRecovery();markTables();injectProductSort();},70);}).observe(root,{childList:true,subtree:true});
  }

  function wrapSwitch(){
    if(typeof window.switchTab!=='function'||window.switchTab.__v102) return;
    const old=window.switchTab;
    const fn=function(name){const r=old.apply(this,arguments);setTimeout(()=>{arabize();tuneDashboard();tuneRecovery();markTables();if(name==='products')injectProductSort();},70);return r;};
    fn.__v102=true; window.switchTab=fn;
  }

  function boot(){
    wrapProductsRender();wrapSwitch();tuneDashboard();tuneRecovery();markTables();injectProductSort();arabize();observeDynamicText();
    setTimeout(()=>{wrapProductsRender();tuneDashboard();tuneRecovery();markTables();injectProductSort();arabize();},900);
  }
  document.addEventListener('DOMContentLoaded',boot);
})();
