const BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:5000' : '';
const API_URL = `${BASE_URL}/api/products`;
const ITEMS_PER_PAGE = 20;

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
    const user = getCurrentUser();
    if (user) {
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('adminContainer').classList.remove('hidden');
        document.getElementById('adminContainer').style.display = 'flex';
        
        const userBadge = document.getElementById('currentUserBadge');
        if (userBadge) userBadge.textContent = `${user.username} (${user.role})`;
        
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

        const csvActionsWrapper = document.getElementById('csvActionsWrapper');
        if (csvActionsWrapper) csvActionsWrapper.style.display = hasPermission('manage_backup') ? 'flex' : 'none';

        const addProductWrapper = document.getElementById('addProductWrapper');
        if (addProductWrapper) addProductWrapper.style.display = hasPermission('add_product') ? 'block' : 'none';

        const manageCategoriesWrapper = document.getElementById('manageCategoriesWrapper');
        if (manageCategoriesWrapper) manageCategoriesWrapper.style.display = hasPermission('manage_categories') ? 'block' : 'none';

        await loadAdminProducts();
        
        loadCurrentLogo();
        loadCurrentBg();
        loadUsersTable();
        renderCategoriesAdminList();
        loadStoreSettings();
        
        // Initialize the first tab
        switchTab('products');
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
        const response = await fetch(`${BASE_URL}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        
        if (response.ok) {
            sessionStorage.setItem('tech_current_user', JSON.stringify(data.user));
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
        const response = await fetch(`${BASE_URL}/api/categories`);
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
        const response = await fetch(`${BASE_URL}/api/categories/rename`, {
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

};

window.deleteCategory = function(cat) {
    if (!confirm(`هل أنت متأكد من حذف قسم "${cat}"؟\n(ملاحظة: هذا لن يحذف المنتجات التي تنتمي لهذا القسم، ولكن سيزيل القسم من قائمة الاختيارات الافتراضية)`)) {
        return;
    }

    let categories = getCategories();
    categories = categories.filter(c => c !== cat);
    saveCategories(categories);
    showToast('🗑️ تم حذف القسم من الاختيارات الافتراضية.');
    
    renderCategoriesAdminList();
    populateCategoriesDatalist(window.adminProducts || []);
};

// ==========================================
// Admin Products Table (with Pagination, Search, Low Stock Alerts)
// ==========================================
async function loadAdminProducts(preserveState = false) {
    const table = document.getElementById('adminProductsTable');
    if (!table) return;

    const savedPage = window.currentPage || 1;

    // شحن الأقسام الافتراضية فوراً دون انتظار السيرفر
    populateCategoriesDatalist([]);

    if (!preserveState) {
        table.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-on-surface-variant">جاري تحميل المنتجات...</td></tr>';
    }
    
    try {
        await loadStoreSettings();
        const response = await fetch(API_URL);
        const products = await response.json();
        window.adminProducts = products;
        
        populateCategoriesDatalist(products);

        if (products.length === 0) {
            table.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-on-surface-variant">لا توجد منتجات بعد. ابدأ بإضافة منتج جديد.</td></tr>';
            window.filteredProducts = [];
            updatePaginationControls();
            return;
        }

        filterAdminProducts(preserveState);
        if (preserveState) {
            window.currentPage = savedPage;
            renderProductsPage();
        }
        if (window.loadAnalytics) window.loadAnalytics();
    } catch (error) {
        table.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-red-500">فشل الاتصال بالسيرفر. تأكد من عمل السيرفر.</td></tr>';
        console.error(error);
    }
}

function renderProductsPage() {
    const table = document.getElementById('adminProductsTable');
    if (!table) return;

    const products = window.filteredProducts;
    const totalPages = Math.max(1, Math.ceil(products.length / ITEMS_PER_PAGE));

    if (window.currentPage > totalPages) window.currentPage = totalPages;
    if (window.currentPage < 1) window.currentPage = 1;

    const start = (window.currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageProducts = products.slice(start, end);

    if (pageProducts.length === 0) {
        table.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-on-surface-variant">لا توجد نتائج مطابقة.</td></tr>';
        updatePaginationControls();
        return;
    }

    table.innerHTML = '';
    pageProducts.forEach(p => {
        const qty = p.stockQuantity !== undefined ? p.stockQuantity : 1;
        const isLowStock = qty <= 3 && qty > 0;
        const isOutOfStock = qty === 0;
        const isHidden = p.isHidden === true;

        const fallbackImage = window.defaultProductImage || 'https://placehold.co/600x400/0f172a/0ea5e9?text=No+Image';
        const tr = document.createElement('tr');
        
        // Row styling based on stock and visibility
        let rowClass = 'border-b border-outline-variant/30 text-sm hover:bg-surface-variant/30 transition-colors ';
        if (isHidden) rowClass += 'opacity-50 grayscale ';
        else if (isOutOfStock) rowClass += 'bg-red-900/10 ';
        else if (isLowStock) rowClass += 'bg-orange-900/10 ';

        tr.className = rowClass;
        tr.innerHTML = `
                <td class="py-4 pr-2 font-semibold text-on-surface">
                    <div class="flex items-center gap-3">
                        <img src="${p.image || fallbackImage}" class="w-10 h-10 rounded object-contain bg-surface/50 p-0.5 border border-outline-variant/50">
                        <span class="flex items-center gap-2">
                            ${p.title} 
                            ${isHidden ? '<span class="text-[10px] bg-surface-variant text-on-surface-variant px-1.5 py-0.5 rounded">مخفي</span>' : ''}
                        </span>
                    </div>
                </td>
                <td class="py-4 text-on-surface-variant">${p.category}</td>
                <td class="py-4 font-mono-data text-primary">${p.price}</td>
                <td class="py-4">
                    <div class="flex items-center justify-center gap-2">
                        <input type="number" id="qty-${p._id}" value="${qty}" min="0" ${hasPermission('edit_product') ? '' : 'disabled'} class="w-16 bg-surface border ${isOutOfStock ? 'border-red-500 text-red-400' : isLowStock ? 'border-orange-500 text-orange-400' : 'border-green-500 text-green-400'} rounded px-2 py-1 text-center focus:outline-none text-xs font-bold font-mono-data">
                        ${hasPermission('edit_product') ? `
                        <button onclick="updateQuantity('${p._id}')" class="bg-primary/20 text-primary hover:bg-primary hover:text-white px-2 py-1 rounded transition-colors text-xs" title="حفظ الكمية">
                            <span class="material-symbols-outlined text-[14px]">save</span>
                        </button>
                        ` : ''}
                    </div>
                </td>
                <td class="py-4 text-center flex items-center justify-center gap-2 h-full min-h-[73px]">
                    ${hasPermission('edit_product') ? `
                    <button onclick="toggleVisibility('${p._id}', ${!isHidden})" class="px-2 py-1.5 ${isHidden ? 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500' : 'bg-surface-variant text-on-surface-variant border-outline-variant/30 hover:bg-surface'} hover:text-white border rounded text-xs transition-all font-bold flex items-center gap-1" title="${isHidden ? 'إظهار المنتج' : 'إخفاء المنتج'}">
                        <span class="material-symbols-outlined text-[16px]">${isHidden ? 'visibility' : 'visibility_off'}</span>
                    </button>
                    <button onclick="openEditModal('${p._id}')" class="px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500 hover:text-white rounded text-xs transition-all font-bold">تعديل</button>
                    ` : ''}
                    ${hasPermission('delete_product') ? `
                    <button onclick="deleteProduct('${p._id}')" class="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded text-xs transition-all font-bold">حذف</button>
                    ` : ''}
                    ${!hasPermission('edit_product') && !hasPermission('delete_product') ? '<span class="text-xs text-on-surface-variant">لا تملك صلاحية</span>' : ''}
                </td>
            `;
        table.appendChild(tr);
    });

    updatePaginationControls();
}

// ==========================================
// Pagination
// ==========================================
function updatePaginationControls() {
    const totalPages = Math.max(1, Math.ceil(window.filteredProducts.length / ITEMS_PER_PAGE));
    const pageIndicator = document.getElementById('pageIndicator');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (pageIndicator) pageIndicator.textContent = `صفحة ${window.currentPage} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = window.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = window.currentPage >= totalPages;
}

window.goToPage = function(page) {
    const totalPages = Math.max(1, Math.ceil(window.filteredProducts.length / ITEMS_PER_PAGE));
    if (page < 1 || page > totalPages) return;
    window.currentPage = page;
    renderProductsPage();
};

// ==========================================
// Live Search / Filter
// ==========================================
window.filterAdminProducts = function(preservePage = false) {
    const query = (document.getElementById('adminSearchInput')?.value || '').trim().toLowerCase();
    const categoryFilter = document.getElementById('adminCategoryFilter')?.value || '';
    const stockFilter = document.getElementById('adminStockFilter')?.value || '';
    
    window.filteredProducts = window.adminProducts.filter(p => {
        const titleMatch = p.title.toLowerCase().includes(query);
        const skuMatch = (p.sku || '').toLowerCase().includes(query);
        const catMatch = categoryFilter ? p.category === categoryFilter : true;
        
        let stockMatch = true;
        if (stockFilter === 'low_stock') stockMatch = p.quantity === 0;
        else if (stockFilter === 'hidden') stockMatch = p.isHidden === true;

        if (query) {
            return (titleMatch || skuMatch) && catMatch && stockMatch;
        }
        return catMatch && stockMatch;
    });

    if (!preservePage) {
        window.currentPage = 1;
    }
    renderProductsPage();
};

// ==========================================
// Update Stock Quantity
// ==========================================
window.updateQuantity = async function(id) {
    const qtyInput = document.getElementById(`qty-${id}`);
    const newQty = parseInt(qtyInput.value, 10) || 0;
    try {
        const response = await fetch(`${API_URL}/${id}/quantity`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stockQuantity: newQty })
        });
        
        if (response.ok) {
            showToast('✅ تم تحديث الكمية بنجاح!');
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
// Delete Product
// ==========================================
window.deleteProduct = async function(id) {
    if (confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
        try {
            const response = await fetch(`${API_URL}/${id}`, {
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
        const response = await fetch(`${API_URL}/${id}/toggle-visibility`, {
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
        const brand = document.getElementById('pBrand').value;

        const formData = new FormData();
        formData.append('title', title);
        formData.append('category', category);
        formData.append('price', price);
        if (oldPrice) formData.append('oldPrice', oldPrice);
        formData.append('description', desc);
        formData.append('stockQuantity', quantity);
        formData.append('sku', sku);
        formData.append('warranty', warranty);
        formData.append('brand', brand);

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
            const response = await fetch(API_URL, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                addForm.reset();
                if (imgPreviewContainer) imgPreviewContainer.classList.add('hidden');
                loadAdminProducts();
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

        if (!newUser && !newPass) {
            showToast('⚠️ لم تدخل أي بيانات جديدة.');
            return;
        }

        const currentUser = getCurrentUser();
        if (!currentUser) return;
        
        try {
            const updateData = { username: newUser || currentUser.username };
            if (newPass) updateData.password = newPass;
            
            const response = await fetch(`${BASE_URL}/api/admin/users/${currentUser.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
            
            if (response.ok) {
                const updatedUser = await response.json();
                sessionStorage.setItem('tech_current_user', JSON.stringify(updatedUser));
                settingsForm.reset();
                showToast('✅ تم تحديث بيانات الدخول بنجاح!');
                checkAuth();
            } else {
                const errData = await response.json();
                alert(`خطأ: ${errData.message}`);
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
        const res = await fetch(`${BASE_URL}/api/admin/users`);
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
            response = await fetch(`${BASE_URL}/api/admin/users/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role, permissions })
            });
        } else {
            response = await fetch(`${BASE_URL}/api/admin/users`, {
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
        const response = await fetch(`${BASE_URL}/api/admin/users/${id}`, { method: 'DELETE' });
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
    fetch(`${BASE_URL}/api/settings`)
        .then(r => r.json())
        .then(settings => {
            if (settings.storeLogo) {
                const preview = document.getElementById('currentLogoPreview');
                if (preview) {
                    preview.src = settings.storeLogo;
                    preview.classList.remove('hidden');
                }
                const adminLogoImg = document.querySelector('header img[alt="Technology Store"]');
                if (adminLogoImg) adminLogoImg.src = settings.storeLogo;
            }
            if (settings.lightHeroImage && settings.lightHeroImage !== 'main-banner.png') {
                const bgPreview = document.getElementById('currentBgPreview');
                if (bgPreview) {
                    bgPreview.src = settings.lightHeroImage;
                    bgPreview.classList.remove('hidden');
                }
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
    if (tempBgFile) formData.append('lightHeroImage', tempBgFile);
    if (tempLightBgFile) formData.append('lightHeroImage', tempLightBgFile);

    try {
        const response = await fetch(`${BASE_URL}/api/settings`, {
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
            const adminLogoImg = document.querySelector('header img[alt="Technology Store"]');
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
        const response = await fetch(`${BASE_URL}/api/settings`);
        const settings = await response.json();
        defaultProductImage = settings.defaultProductImage;
        const preview = document.getElementById('defaultProductImagePreview');
        if (preview && defaultProductImage) {
            preview.src = defaultProductImage;
            preview.classList.remove('hidden');
        }
        
        const shippingToggle = document.getElementById('shippingToggleInput');
        if (shippingToggle) {
            shippingToggle.checked = settings.isShippingEnabled || false;
        }
    } catch (err) {
        console.error('Error loading store settings:', err);
    }
}

window.saveShippingSettings = async function() {
    const isEnabled = document.getElementById('shippingToggleInput').checked;
    
    try {
        const formData = new URLSearchParams();
        formData.append('isShippingEnabled', isEnabled);
        
        const response = await fetch(`${BASE_URL}/api/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        if (response.ok) {
            showToast(`✅ تم ${isEnabled ? 'تفعيل' : 'إيقاف'} الشحن بنجاح!`);
        } else {
            const errData = await response.json();
            alert(`خطأ: ${errData.message}`);
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
        const response = await fetch(`${BASE_URL}/api/settings`, {
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
    document.getElementById('editPBrand').value = product.brand || '';
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
        window.currentEditingImages.push({ url: product.image, publicId: product.imagePublicId || 'main', isMain: true });
    }
    if (product.additionalImages && product.additionalImages.length > 0) {
        product.additionalImages.forEach(imgData => {
            window.currentEditingImages.push({ url: imgData.url, publicId: imgData.publicId, isMain: false });
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
        imgEl.src = img.url;
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
        formData.append('brand', document.getElementById('editPBrand').value);
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
            const response = await fetch(`${API_URL}/${id}`, {
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
        brand: p.brand || '',
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
                const response = await fetch(`${API_URL}/bulk`, {
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
        const res = await fetch(`${BASE_URL}/api/backup`);
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
        
        const res = await fetch(`${BASE_URL}/api/restore`, {
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
        const res = await fetch(`${BASE_URL}/api/analytics`);
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
        const res = await fetch(`${BASE_URL}/api/analytics/visitors`);
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
                            <td class="py-3 pr-2 font-mono-data dir-ltr text-right">${date}</td>
                            <td class="py-3 text-secondary font-semibold">${v.location || 'غير معروف'}</td>
                            <td class="py-3 text-on-surface-variant font-mono-data text-xs dir-ltr">${v.device || 'غير معروف'}</td>
                            <td class="py-3 text-on-surface-variant max-w-[150px] truncate dir-ltr text-right" title="${v.referrer || 'مباشر'}">${v.referrer || 'مباشر'}</td>
                            <td class="py-3"><span class="px-2 py-1 bg-primary/10 text-primary rounded-md text-xs">${v.utmSource || 'عضوي'}</span></td>
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
            await fetch(`${BASE_URL}/api/analytics/reset`, { method: 'POST' });
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
        const res = await fetch(`${BASE_URL}/api/analytics/visitors`);
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
        const res = await fetch(`${BASE_URL}/api/analytics/visitors`);
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

        const response = await fetch(`${BASE_URL}/api/admin/logs?limit=100&_t=${Date.now()}`, {
            cache: 'no-store'
        });
        const logs = await response.json();
        
        if (response.ok) {
            renderAdminLogs(logs);
        } else {
            if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-error">خطأ في تحميل السجل</td></tr>`;
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

    if (!logs || logs.length === 0) {
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