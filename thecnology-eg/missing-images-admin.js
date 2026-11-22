/* Technology Store V10.9 — quick missing-product-image work queue.
   Deliberately uses a dedicated image-only API, not the full product edit endpoint. */
(() => {
  'use strict';
  const state = { page: 1, pages: 1, count: 0, totalMissing: 0, items: [], query: '', category: '', visibility: '', sort: 'value', uploading: '', requestId: 0, loaded: false };
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const tidyId = id => /^[a-f0-9]{24}$/i.test(String(id || '')) ? String(id) : '';
  const money = n => Number(n || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 }) + ' ج.م';

  function toast(message) { if (typeof showToast === 'function') showToast(message); else alert(message); }
  function showError(message) {
    const el = $('missingImageNotice');
    if (el) { el.textContent = message || ''; el.hidden = !message; }
  }
  async function jsonFetch(url, init = {}) {
    const response = await window.adminFetch(url, init);
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
    return data;
  }
  function populateCategories() {
    const field = $('missingImageCategory');
    if (!field) return;
    const current = field.value;
    const missing = (window.adminProducts || []).filter(p => typeof productHasValidImage === 'function' ? !productHasValidImage(p) : !p.image);
    const categories = [...new Set(missing.map(p => String(p.category || '').trim()).filter(Boolean))]
      .sort((a,b) => a.localeCompare(b,'ar'));
    field.innerHTML = '<option value="">كل الأقسام</option>' + categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (current && !categories.includes(current)) { const opt=document.createElement('option'); opt.value=current; opt.textContent=current; field.appendChild(opt); }
    if (current) field.value = current;
  }
  function updateCount(count) {
    state.totalMissing = Number(count) || 0;
    const badge = $('missingImagesNavCount');
    if (badge) { badge.textContent = String(state.totalMissing); badge.hidden = !state.totalMissing; }
    const total = $('missingImageTotal');
    if (total) total.textContent = String(state.totalMissing);
    // All admin dashboards share the same missing-image count, but their local product list may be capped.
    const dashboard = $('dashMissingImages');
    if (dashboard) dashboard.textContent = String(state.totalMissing);
  }
  function render() {
    const grid = $('missingImageGrid');
    if (!grid) return;
    const range = $('missingImageRange');
    if (range) range.textContent = state.count ? `صفحة ${state.page} من ${state.pages} • ${state.count} منتج في النتائج` : (state.totalMissing ? 'مفيش نتائج مطابقة للبحث والفلاتر' : 'كل المنتجات لها صور أساسية');
    const prev = $('missingImagesPrev');
    const next = $('missingImagesNext');
    if (prev) prev.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= state.pages;
    if (!state.items.length) {
      grid.innerHTML = `<div class="missing-images-empty"><span class="material-symbols-outlined">${state.totalMissing ? 'manage_search' : 'verified'}</span><strong>${state.totalMissing ? 'مفيش نتائج مطابقة للفلاتر' : 'ممتاز! مفيش منتجات ناقصها صورة'}</strong><small>${state.totalMissing ? 'جرب تغيير البحث أو القسم' : 'أي منتج جديد بدون صورة هيظهر تلقائيًا هنا'}</small></div>`;
      return;
    }
    grid.innerHTML = state.items.map(item => {
      const id = tidyId(item._id);
      if (!id) return '';
      const busy = state.uploading === id;
      return `<article class="missing-images-card" data-product-id="${id}" aria-label="${esc(item.title)}">
        <div class="missing-images-placeholder"><span class="missing-images-photo-emoji" aria-hidden="true">📷</span><small>صورة المنتج غير موجودة</small></div>
        <div class="missing-images-card-body">
          <div class="missing-images-card-meta"><span>${esc(item.category || 'غير مصنف')}</span>${item.isHidden ? '<span class="missing-images-hidden">مخفي</span>' : ''}</div>
          <h4 title="${esc(item.title)}">${esc(item.title || 'منتج بدون اسم')}</h4>
          <p class="missing-images-sku" dir="auto">SKU: ${esc(item.sku || '—')}</p>
          <strong class="missing-images-price">${money(item.price)}</strong>
          <p class="missing-images-progress" role="status" id="missing-image-progress-${id}">${busy ? 'جاري رفع الصورة...' : ''}</p>
          <button type="button" data-action="upload" data-id="${id}" ${busy ? 'disabled' : ''} class="missing-images-upload-btn"><span class="material-symbols-outlined">${busy ? 'progress_activity' : 'cloud_upload'}</span>${busy ? 'جاري الحفظ...' : 'رفع صورة مباشرة'}</button>
          <button type="button" data-action="edit" data-id="${id}" class="missing-images-edit-btn">تعديل المنتج بالكامل</button>
        </div>
      </article>`;
    }).join('');
  }
  async function load(page = 1) {
    if (!hasPermission('edit_product')) return;
    populateCategories();
    const requestId = ++state.requestId;
    state.page = Math.max(1, Number(page) || 1);
    const grid = $('missingImageGrid');
    if (grid) grid.innerHTML = '<div class="missing-images-loading"><span class="material-symbols-outlined">progress_activity</span> جاري البحث عن المنتجات بدون صور...</div>';
    showError('');
    const query = new URLSearchParams({ page: String(state.page), limit: '20', sort: state.sort });
    if (state.query) query.set('q', state.query);
    if (state.category) query.set('category', state.category);
    if (state.visibility) query.set('visibility', state.visibility);
    try {
      const data = await jsonFetch('/api/admin/products/missing-images?' + query.toString());
      if (requestId !== state.requestId) return;
      state.items = Array.isArray(data.items) ? data.items : [];
      state.page = Number(data.page) || 1;
      state.pages = Number(data.pages) || 1;
      state.loaded = true;
      state.count = Number(data.count) || 0;
      updateCount(data.totalMissing ?? data.count);
      render();
    } catch (error) {
      if (requestId !== state.requestId) return;
      if (grid) grid.innerHTML = '';
      showError('تعذر تحميل القائمة: ' + error.message);
    }
  }
  // Fetch the total count without materializing the whole catalogue in the browser.
  async function refreshCount() {
    if (!hasPermission('edit_product')) return;
    try {
      const result = await jsonFetch('/api/admin/products/missing-images?page=1&limit=1');
      updateCount(result.totalMissing ?? result.count);
    } catch (_) { /* Existing admin product KPIs remain available if the endpoint is offline. */ }
  }

  async function uploadImage(id, file) {
    if (!hasPermission('edit_product') || !tidyId(id)) return;
    if (state.uploading) { toast('انتظر حتى يكتمل رفع الصورة الحالية.'); return; }
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) return showError('اختر صورة JPG أو PNG أو WebP فقط.');
    state.uploading = id;
    showError('');
    render();
    const progress = msg => { const el = $('missing-image-progress-' + id); if (el) el.textContent = msg; };
    try {
      if (!window.TechImageOptimizer?.optimizeFile) throw new Error('أداة ضغط الصور غير متاحة. حدّث الصفحة.');
      progress('جاري تصغير الصورة وتحويلها إلى WebP...');
      const optimized = await window.TechImageOptimizer.optimizeFile(file, { maxDimension: 1600, quality: .80 });
      progress('تم ضغط الصورة. جاري رفعها وحفظها...');
      const formData = new FormData();
      formData.append('image', optimized.file);
      const data = await jsonFetch(`/api/admin/products/${id}/missing-image`, { method: 'PUT', body: formData });
      if (data.product?.image) {
        const p = (window.adminProducts || []).find(p => String(p._id) === id);
        if (p) { p.image = data.product.image; p.imagePublicId = data.product.imagePublicId; }
        if (typeof updateProductInventoryKpis === 'function') updateProductInventoryKpis();
        if (typeof filterAdminProducts === 'function') filterAdminProducts(true);
      }
      const a = window.TechImageOptimizer.readable(file.size);
      const b = window.TechImageOptimizer.readable(optimized.outputBytes);
      toast(`✅ تم رفع صورة المنتج بنجاح (${a} ← ${b})`);
      // If the last product on a non-first page was fixed, stay on the previous valid page.
      const nextPage = state.page > 1 && state.items.length === 1 ? state.page - 1 : state.page;
      state.uploading = '';
      await load(nextPage);
    } catch (error) {
      showError('تعذر رفع الصورة: ' + error.message);
      toast('❌ ' + error.message);
      state.uploading = '';
      render();
    } finally {
      state.uploading = '';
    }
  }
  let searchTimeout;
  function boot() {
    const input = $('missingImageFile');
    const grid = $('missingImageGrid');
    if (!input || !grid) return;
    grid.addEventListener('click', event => {
      const btn = event.target.closest('button[data-action]');
      if (!btn || !hasPermission('edit_product')) return;
      const id = tidyId(btn.dataset.id);
      if (!id) return;
      if (btn.dataset.action === 'edit') return window.openEditModal?.(id);
      if (state.uploading) return;
      input.dataset.targetId = id;
      input.value = '';
      input.click();
    });
    input.addEventListener('change', () => {
      const id = tidyId(input.dataset.targetId);
      const file = input.files?.[0];
      if (id && file) uploadImage(id, file);
      input.value = '';
    });
    grid.addEventListener('dragover', e => { const card = e.target.closest('.missing-images-card'); if (!card || state.uploading) return; e.preventDefault(); card.classList.add('missing-images-drop'); });
    grid.addEventListener('dragleave', e => { const card = e.target.closest('.missing-images-card'); if (card && !card.contains(e.relatedTarget)) card.classList.remove('missing-images-drop'); });
    grid.addEventListener('drop', e => { const card = e.target.closest('.missing-images-card'); if (!card) return; e.preventDefault(); card.classList.remove('missing-images-drop'); const id = tidyId(card.dataset.productId); if (id && e.dataTransfer?.files?.length) uploadImage(id, e.dataTransfer.files[0]); });
    $('missingImageSearch')?.addEventListener('input', e => { state.query = e.target.value.trim(); clearTimeout(searchTimeout); searchTimeout = setTimeout(() => load(1), 300); });
    $('missingImageCategory')?.addEventListener('change', e => { state.category = e.target.value; load(1); });
    $('missingImageVisibility')?.addEventListener('change', e => { state.visibility = e.target.value; load(1); });
    $('missingImageSort')?.addEventListener('change', e => { state.sort = e.target.value; load(1); });
    $('missingImagesPrev')?.addEventListener('click', () => load(state.page - 1));
    $('missingImagesNext')?.addEventListener('click', () => load(state.page + 1));
    $('missingImagesRefresh')?.addEventListener('click', () => load(state.page));
  }
  window.loadMissingImageProducts = load;
  window.refreshMissingImageCount = refreshCount;
  document.addEventListener('DOMContentLoaded', boot);
})();
