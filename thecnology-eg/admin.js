const API_URL = '/api/products';

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

function checkAuth() {
    const user = getCurrentUser();
    if (user) {
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('adminContainer').classList.remove('hidden');
        document.getElementById('adminContainer').style.display = 'block';
        
        // Show current user info
        const userBadge = document.getElementById('currentUserBadge');
        if (userBadge) userBadge.textContent = `${user.username} (${user.role})`;
        
        // Check permissions for user management
        const userMgmt = document.getElementById('tab-users');
        if (userMgmt) {
            userMgmt.style.display = hasPermission('manage_users') ? 'block' : 'none';
        }

        loadAdminProducts();
        loadCurrentLogo();
        loadCurrentBg();
        loadUsersTable();
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

// Make login globally available for inline HTML handlers
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
// Admin Products Table (API Integration)
// ==========================================
async function loadAdminProducts() {
    const table = document.getElementById('adminProductsTable');
    if (!table) return;
    table.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-on-surface-variant">جاري تحميل المنتجات...</td></tr>';
    
    try {
        const response = await fetch(API_URL);
        const products = await response.json();
        window.adminProducts = products;

        if (products.length === 0) {
            table.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-on-surface-variant">لا توجد منتجات بعد. ابدأ بإضافة منتج جديد.</td></tr>';
            return;
        }

        table.innerHTML = '';
        products.forEach(p => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-outline-variant/30 text-sm hover:bg-surface-variant/30 transition-colors';
            tr.innerHTML = `
                <td class="py-4 pr-2 font-semibold text-on-surface">
                    <div class="flex items-center gap-3">
                        <img src="${p.image}" class="w-10 h-10 rounded object-cover border border-outline-variant/50">
                        <span>${p.title}</span>
                    </div>
                </td>
                <td class="py-4 text-on-surface-variant">${p.category}</td>
                <td class="py-4 font-mono-data text-primary">${p.price}</td>
                <td class="py-4">
                    <div class="flex items-center justify-center gap-2">
                        <input type="number" id="qty-${p._id}" value="${p.stockQuantity !== undefined ? p.stockQuantity : 1}" min="0" class="w-16 bg-surface border ${p.stockQuantity > 0 || p.stockQuantity === undefined ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'} rounded px-2 py-1 text-center focus:outline-none text-xs font-bold font-mono-data">
                        <button onclick="updateQuantity('${p._id}')" class="bg-primary/20 text-primary hover:bg-primary hover:text-white px-2 py-1 rounded transition-colors text-xs" title="حفظ الكمية">
                            <span class="material-symbols-outlined text-[14px]">save</span>
                        </button>
                    </div>
                </td>
                <td class="py-4 text-center flex items-center justify-center gap-2 h-full min-h-[73px]">
                    <button onclick="openEditModal('${p._id}')" class="px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500 hover:text-white rounded text-xs transition-all font-bold">تعديل</button>
                    <button onclick="deleteProduct('${p._id}')" class="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded text-xs transition-all font-bold">حذف</button>
                </td>
            `;
            table.appendChild(tr);
        });
    } catch (error) {
        table.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-red-500">فشل الاتصال بالسيرفر. تأكد من عمل السيرفر.</td></tr>';
        console.error(error);
    }
}

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
            loadAdminProducts(); // Reload to update colors
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
                loadAdminProducts();
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
const imgPreview = document.getElementById('imagePreview');

if (pImage) {
    pImage.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                if (imgPreview) {
                    imgPreview.src = event.target.result;
                    imgPreview.classList.remove('hidden');
                }
            };
            reader.readAsDataURL(file);
        } else {
            if (imgPreview) {
                imgPreview.classList.add('hidden');
                imgPreview.src = '';
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
        const desc = document.getElementById('pDesc').value;
        const quantity = document.getElementById('pQuantity').value;
        const sku = document.getElementById('pSku').value;
        const warranty = document.getElementById('pWarranty').value;
        const brand = document.getElementById('pBrand').value;

        const formData = new FormData();
        formData.append('title', title);
        formData.append('category', category);
        formData.append('price', price);
        formData.append('description', desc);
        formData.append('stockQuantity', quantity);
        formData.append('sku', sku);
        formData.append('warranty', warranty);
        formData.append('brand', brand);
        formData.append('image', fileInput.files[0]);

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
                if (imgPreview) imgPreview.classList.add('hidden');
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
        const idx = users.findIndex(u => u.id === currentUser.id);
        if (idx === -1) return;

        if (newUser) users[idx].username = newUser;
        if (newPass) users[idx].password = newPass;
        saveUsers(users);

        settingsForm.reset();
        showToast('✅ تم تحديث بيانات الدخول بنجاح!');
        
        // Update badge
        const userBadge = document.getElementById('currentUserBadge');
        if (userBadge) userBadge.textContent = `${users[idx].username} (${users[idx].role})`;
    });
}

// ==========================================
// User Management (Admin Only)
// ==========================================
function loadUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const users = getUsers();
    const currentUser = getCurrentUser();

    users.forEach(u => {
        const isCurrentUser = currentUser && u.id === currentUser.id;
        const tr = document.createElement('tr');
        tr.className = 'border-b border-outline-variant/30 text-sm hover:bg-surface-variant/30 transition-colors';
        tr.innerHTML = `
            <td class="py-3 pr-2 font-semibold text-on-surface">${u.username} ${isCurrentUser ? '<span class="text-primary text-[10px]">(أنت)</span>' : ''}</td>
            <td class="py-3 text-on-surface-variant">${u.role}</td>
            <td class="py-3 text-on-surface-variant text-xs">${u.permissions.join(', ')}</td>
            <td class="py-3 text-center">
                ${!isCurrentUser ? `<button onclick="deleteUser('${u.id}')" class="px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-white rounded text-xs transition-all font-bold">حذف</button>` : '<span class="text-on-surface-variant text-xs">—</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.addNewUser = function() {
    const username = document.getElementById('newUserUsername').value.trim();
    const password = document.getElementById('newUserPassword').value.trim();
    const role = document.getElementById('newUserRole').value;

    if (!username || !password) {
        showToast('⚠️ يرجى إدخال اسم المستخدم وكلمة المرور');
        return;
    }

    const users = getUsers();
    if (users.find(u => u.username === username)) {
        showToast('⚠️ اسم المستخدم موجود بالفعل!');
        return;
    }

    const permissions = role === 'مدير' ? ['all'] : ['add_products', 'edit_products'];

    users.push({
        id: Date.now().toString(),
        username,
        password,
        role,
        permissions
    });

    saveUsers(users);
    document.getElementById('newUserUsername').value = '';
    document.getElementById('newUserPassword').value = '';
    loadUsersTable();
    showToast(`✅ تم إضافة المستخدم "${username}" بنجاح!`);
};

window.deleteUser = function(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
    let users = getUsers();
    users = users.filter(u => u.id !== id);
    saveUsers(users);
    loadUsersTable();
    showToast('تم حذف المستخدم.');
};

let tempLogo = null;
let tempBg = null;

// ==========================================
// Store Logo Upload
// ==========================================
const storeLogoInput = document.getElementById('storeLogoInput');
const currentLogoPreview = document.getElementById('currentLogoPreview');

function loadCurrentLogo() {
    const customLogo = localStorage.getItem('tech_store_logo');
    if (customLogo && currentLogoPreview) {
        currentLogoPreview.src = customLogo;
        currentLogoPreview.classList.remove('hidden');
    }
}

if (storeLogoInput) {
    storeLogoInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                tempLogo = event.target.result;
                if (currentLogoPreview) {
                    currentLogoPreview.src = tempLogo;
                    currentLogoPreview.classList.remove('hidden');
                }
            };
            reader.readAsDataURL(file);
        }
    });
}

// ==========================================
// Store Background Upload
// ==========================================
const storeBgInput = document.getElementById('storeBgInput');
const currentBgPreview = document.getElementById('currentBgPreview');

function loadCurrentBg() {
    const customBg = localStorage.getItem('tech_store_bg');
    if (customBg && currentBgPreview) {
        currentBgPreview.src = customBg;
        currentBgPreview.classList.remove('hidden');
    }
}

if (storeBgInput) {
    storeBgInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                tempBg = event.target.result;
                if (currentBgPreview) {
                    currentBgPreview.src = tempBg;
                    currentBgPreview.classList.remove('hidden');
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
    if (saved) {
        showToast('✅ تم حفظ مظهر الموقع بنجاح!');
        tempLogo = null;
        tempBg = null;
    } else {
        showToast('⚠️ لم تقم باختيار صور جديدة لحفظها.');
    }
};

// ==========================================
// Initialize
// ==========================================
// Initialize branding
document.addEventListener('DOMContentLoaded', loadStoreBranding);

// ==========================================
// Edit Product Modal
// ==========================================
window.openEditModal = function(id) {
    const product = window.adminProducts.find(p => p._id === id);
    if (!product) return;

    document.getElementById('editProductId').value = product._id;
    document.getElementById('editPTitle').value = product.title;
    document.getElementById('editPCategory').value = product.category;
    document.getElementById('editPPrice').value = product.price;
    document.getElementById('editPDesc').value = product.description.join('\n');
    document.getElementById('editPQuantity').value = product.stockQuantity || 0;
    document.getElementById('editPSku').value = product.sku || '';
    document.getElementById('editPBrand').value = product.brand || '';
    document.getElementById('editPWarranty').value = product.warranty || '';

    const modal = document.getElementById('editProductModal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('editProductModalContent').classList.remove('scale-95');
    }, 10);
};

window.closeEditModal = function() {
    const modal = document.getElementById('editProductModal');
    modal.classList.add('opacity-0');
    document.getElementById('editProductModalContent').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('editProductForm').reset();
    }, 300);
};

const editForm = document.getElementById('editProductForm');
if (editForm) {
    editForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const id = document.getElementById('editProductId').value;
        const data = {
            title: document.getElementById('editPTitle').value,
            category: document.getElementById('editPCategory').value,
            price: document.getElementById('editPPrice').value,
            description: document.getElementById('editPDesc').value,
            stockQuantity: document.getElementById('editPQuantity').value,
            sku: document.getElementById('editPSku').value,
            brand: document.getElementById('editPBrand').value,
            warranty: document.getElementById('editPWarranty').value
        };

        const submitBtn = editForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">sync</span> جاري الحفظ...';
        submitBtn.disabled = true;

        try {
            const response = await fetch(`${API_URL}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                closeEditModal();
                showToast('✅ تم تحديث بيانات المنتج بنجاح!');
                loadAdminProducts();
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
// CSV Export & Import
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
        warranty: p.warranty || ''
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // \uFEFF is for UTF-8 BOM to support Arabic
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", "technology_store_catalog.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

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
                    showToast(`✅ تم استيراد ${data.count} منتج بنجاح!`);
                    loadAdminProducts();
                } else {
                    const errorData = await response.json();
                    alert(`خطأ: ${errorData.message}`);
                }
            } catch (error) {
                console.error(error);
                alert('حدث خطأ أثناء استيراد المنتجات.');
            } finally {
                input.value = ''; // Reset input
            }
        },
        error: function(error) {
            console.error(error);
            alert('حدث خطأ أثناء قراءة ملف CSV.');
            input.value = '';
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});