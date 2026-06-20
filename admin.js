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
                    <select id="avail-${p._id}" class="bg-surface border ${p.inStock ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'} rounded px-2 py-1 focus:outline-none text-xs font-bold" onchange="updateStock('${p._id}', this.value)">
                        <option value="true" ${p.inStock ? 'selected' : ''}>متوفر</option>
                        <option value="false" ${!p.inStock ? 'selected' : ''}>نفذت الكمية</option>
                    </select>
                </td>
                <td class="py-4 text-center flex items-center justify-center gap-2 h-full min-h-[73px]">
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
// Update Stock Status
// ==========================================
window.updateStock = async function(id, inStockValue) {
    const inStock = inStockValue === 'true';
    try {
        const response = await fetch(`${API_URL}/${id}/stock`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inStock })
        });
        
        if (response.ok) {
            showToast('✅ تم تحديث حالة التوفر بنجاح!');
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

        const formData = new FormData();
        formData.append('title', title);
        formData.append('category', category);
        formData.append('price', price);
        formData.append('description', desc);
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
                const base64Logo = event.target.result;
                localStorage.setItem('tech_store_logo', base64Logo);
                if (currentLogoPreview) {
                    currentLogoPreview.src = base64Logo;
                    currentLogoPreview.classList.remove('hidden');
                }
                showToast('✅ تم تغيير اللوجو بنجاح!');
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
                const base64Bg = event.target.result;
                localStorage.setItem('tech_store_bg', base64Bg);
                if (currentBgPreview) {
                    currentBgPreview.src = base64Bg;
                    currentBgPreview.classList.remove('hidden');
                }
                showToast('✅ تم تغيير الخلفية بنجاح!');
            };
            reader.readAsDataURL(file);
        }
    });
}

// ==========================================
// Initialize
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});