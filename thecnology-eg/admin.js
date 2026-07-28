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
// Multi-User Authentication System
// ==========================================
function getUsers() {
    const defaultUsers = [
        { id: '1', username: 'admin', password: '1234', role: 'مدير', permissions: ['all'] }
    ];
    return JSON.parse(localStorage.getItem('tech_users') || JSON.stringify(defaultUsers));
}

function saveUsers(users) {
    localStorage.setItem('tech_users', JSON.stringify(users));
}

function getCurrentUser() {
    const userId = sessionStorage.getItem('tech_current_user_id');
    if (!userId) return null;
    return getUsers().find(u => u.id === userId) || null;
}

async function checkAuth() {
    const user = getCurrentUser();
    if (user) {
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('adminContainer').classList.remove('hidden');
        document.getElementById('adminContainer').style.display = 'block';
        
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

function login() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value.trim();
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        sessionStorage.setItem('tech_current_user_id', user.id);
        checkAuth();
        showToast(`مرحباً ${user.username}!`);
    } else {
        alert('اسم المستخدم أو كلمة المرور غير صحيحة!');
    }
}
window.login = login;

function logout() {
    sessionStorage.removeItem('tech_current_user_id');
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

        const fallbackImage = window.defaultProductImage || 'https://placehold.co/600x400/0f172a/0ea5e9?text=No+Image';
        const tr = document.createElement('tr');
        tr.className = `border-b border-outline-variant/30 text-sm hover:bg-surface-variant/30 transition-colors ${isOutOfStock ? 'bg-red-900/10' : isLowStock ? 'bg-orange-900/10' : ''}`;
        tr.innerHTML = `
                <td class="py-4 pr-2 font-semibold text-on-surface">
                    <div class="flex items-center gap-3">
                        <img src="${p.image || fallbackImage}" class="w-10 h-10 rounded object-cover border border-outline-variant/50">
                        <span>${p.title}</span>
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
    
    window.filteredProducts = window.adminProducts.filter(p => {
        const titleMatch = p.title.toLowerCase().includes(query);
        const skuMatch = (p.sku || '').toLowerCase().includes(query);
        const catMatch = categoryFilter ? p.category === categoryFilter : true;
        
        if (query) {
            return (titleMatch || skuMatch) && catMatch;
        }
        return catMatch;
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
                        img.className = 'w-20 h-20 object-cover rounded border border-outline-variant/30';
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
                        img.className = 'w-20 h-20 object-cover rounded border border-outline-variant/30';
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
    settingsForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const newUser = document.getElementById('newUsername').value.trim();
        const newPass = document.getElementById('newPassword').value.trim();

        if (!newUser && !newPass) {
            showToast('⚠️ لم تدخل أي بيانات جديدة.');
            return;
        }

        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const users = getUsers();
        const userIndex = users.findIndex(u => u.id === currentUser.id);
        if (userIndex === -1) return;

        if (newUser) users[userIndex].username = newUser;
        if (newPass) users[userIndex].password = newPass;

        saveUsers(users);
        settingsForm.reset();
        showToast('✅ تم تحديث بيانات الدخول بنجاح!');
        checkAuth();
    });
}

// ==========================================
// Users Management
// ==========================================
function loadUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    const users = getUsers();
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
    const user = getUsers().find(u => u.id === id);
    if (!user) return;
    document.getElementById('newUserUsername').value = user.username;
    document.getElementById('newUserPassword').value = user.password;
    document.querySelectorAll('input[name="permissions"]').forEach(cb => {
        cb.checked = user.permissions.includes('all') || user.permissions.includes(cb.value);
    });
    
    const submitBtn = document.querySelector('#panel-users button[onclick="addNewUser()"]');
    if (submitBtn) {
        submitBtn.dataset.editingId = id;
        submitBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> حفظ التعديلات';
    }
};

window.addNewUser = function() {
    const username = document.getElementById('newUserUsername').value.trim();
    const password = document.getElementById('newUserPassword').value.trim();
    
    const checkedBoxes = Array.from(document.querySelectorAll('input[name="permissions"]:checked')).map(cb => cb.value);

    if (!username || !password) {
        alert('يرجى إدخال اسم المستخدم وكلمة المرور.');
        return;
    }

    if (checkedBoxes.length === 0) {
        alert('يرجى اختيار صلاحية واحدة على الأقل.');
        return;
    }

    const users = getUsers();
    const submitBtn = document.querySelector('#panel-users button[onclick="addNewUser()"]');
    const editingId = submitBtn ? submitBtn.dataset.editingId : null;

    if (!editingId && users.find(u => u.username === username)) {
        alert('اسم المستخدم موجود بالفعل!');
        return;
    }

    const permissions = checkedBoxes.includes('all') ? ['all'] : checkedBoxes;
    const role = permissions.includes('all') ? 'مدير' : 'محرر';
    
    if (editingId) {
        const userIndex = users.findIndex(u => u.id === editingId);
        if (userIndex !== -1) {
            users[userIndex].username = username;
            users[userIndex].password = password;
            users[userIndex].role = role;
            users[userIndex].permissions = permissions;
        }
        if (submitBtn) {
            delete submitBtn.dataset.editingId;
            submitBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">person_add</span> إضافة مستخدم';
        }
        showToast('✅ تم تعديل المستخدم بنجاح!');
    } else {
        users.push({ id: Date.now().toString(), username, password, role, permissions });
        showToast('✅ تم إضافة المستخدم بنجاح!');
    }
    
    saveUsers(users);

    document.getElementById('newUserUsername').value = '';
    document.getElementById('newUserPassword').value = '';
    document.querySelectorAll('input[name="permissions"]').forEach(cb => cb.checked = false);
    loadUsersTable();
};

window.deleteUser = function(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
    const users = getUsers().filter(u => u.id !== id);
    saveUsers(users);
    showToast('🗑️ تم حذف المستخدم!');
    loadUsersTable();
};

// ==========================================
// Branding (Logo & Background)
// ==========================================
let tempLogo = null;
let tempBg = null;
let tempLightBg = null;

function loadCurrentLogo() {
    const savedLogo = localStorage.getItem('tech_store_logo');
    const preview = document.getElementById('currentLogoPreview');
    if (savedLogo && preview) {
        preview.src = savedLogo;
        preview.classList.remove('hidden');
    }
}

function loadCurrentBg() {
    const savedBg = localStorage.getItem('tech_store_bg');
    const preview = document.getElementById('currentBgPreview');
    if (savedBg && preview) {
        preview.src = savedBg;
        preview.classList.remove('hidden');
    }
    
    const savedLightBg = localStorage.getItem('tech_store_light_bg');
    const lightPreview = document.getElementById('currentLightBgPreview');
    if (savedLightBg && lightPreview) {
        lightPreview.src = savedLightBg;
        lightPreview.classList.remove('hidden');
    }
}

const storeLogoInput = document.getElementById('storeLogoInput');
if (storeLogoInput) {
    storeLogoInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                tempLogo = event.target.result;
                const preview = document.getElementById('currentLogoPreview');
                if (preview) {
                    preview.src = tempLogo;
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
            const reader = new FileReader();
            reader.onload = function(event) {
                tempBg = event.target.result;
                const preview = document.getElementById('currentBgPreview');
                if (preview) {
                    preview.src = tempBg;
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
            const reader = new FileReader();
            reader.onload = function(event) {
                tempLightBg = event.target.result;
                const preview = document.getElementById('currentLightBgPreview');
                if (preview) {
                    preview.src = tempLightBg;
                    preview.classList.remove('hidden');
                }
            };
            reader.readAsDataURL(file);
        }
    });
}

window.saveBrandingSettings = function() {
    let saved = false;
    if (tempLogo) {
        localStorage.setItem('tech_store_logo', tempLogo);
        saved = true;
    }
    if (tempBg) {
        localStorage.setItem('tech_store_bg', tempBg);
        saved = true;
    }
    if (tempLightBg) {
        localStorage.setItem('tech_store_light_bg', tempLightBg);
        saved = true;
    }
    if (saved) {
        showToast('✅ تم حفظ مظهر الموقع بنجاح!');
        tempLogo = null;
        tempBg = null;
        tempLightBg = null;
    } else {
        showToast('⚠️ لم تقم باختيار صور جديدة لحفظها.');
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
    } catch (err) {
        console.error('Error loading store settings:', err);
    }
}

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
        imgEl.className = 'w-24 h-24 object-cover rounded-md mb-2 border border-outline-variant/30';
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
    } catch (err) {
        console.log('يعمل بالنظام المحلي مؤقتاً لحين الاتصال بالسيرفر');
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

window.exportAnalyticsCSV = function() {
    const analytics = JSON.parse(localStorage.getItem('tech_store_analytics') || '{}');
    let csv = '\uFEFF'; // BOM for Arabic support in Excel
    csv += 'نوع الإحصائية,المنتج/الصفحة,العدد\n';
    
    Object.values(analytics.views || {}).forEach(item => {
        csv += `"مشاهدة منتج","${item.title}",${item.count}\n`;
    });
    Object.values(analytics.cart_adds || {}).forEach(item => {
        csv += `"إضافة للسلة","${item.title}",${item.count}\n`;
    });
    Object.values(analytics.whatsapp_orders || {}).forEach(item => {
        csv += `"طلب واتساب","${item.title}",${item.count}\n`;
    });
    Object.entries(analytics.page_visits || {}).forEach(([page, count]) => {
        csv += `"زيارة صفحة","${page}",${count}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `tech_store_analytics_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};