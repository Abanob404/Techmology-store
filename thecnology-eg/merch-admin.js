/* Admin merchandising studio. Does not edit POS stock, cost, or order state. */
(() => {
  'use strict';
  const state = { products: [], analytics: {}, changes: new Map(), loaded: false, loading: false, limit: 30 };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const labelTier = { hero: 'رئيسي ⭐', normal: 'عادي', accessory: 'مكمل' };
  function effective(p) { return { ...p, ...(state.changes.get(String(p._id)) || {}) }; }
  function stock(p) { return window.TechMerch.availableQuantity(p); }
  function inform(text, isError = false) {
    const el = $('merchNotice'); if (!el) return;
    el.textContent = text; el.classList.toggle('error', isError);
  }
  function currentFilters() {
    return { query: $('merchSearch')?.value.trim().toLowerCase() || '',
      category: $('merchCategory')?.value || '', offers: $('merchOffers')?.checked || false };
  }
  function visibleProducts() {
    const f = currentFilters();
    let items = state.products.map(effective).filter(p => !p.isHidden && stock(p) > 0 && Number(p.price) > 0 && p.image && !/placehold\.co|no-image|No\+Image/i.test(p.image));
    if (f.category) items = items.filter(p => p.category === f.category);
    if (f.offers) items = items.filter(p => window.TechMerch.isActiveOffer(p));
    if (f.query) {
      const terms = f.query.split(/\s+/).filter(Boolean);
      items = items.filter(p => terms.every(t => [p.title, p.sku, p.publicBrand, p.category].some(v => String(v || '').toLowerCase().includes(t))));
    }
    const opts = { analytics: state.analytics, offers: f.offers,
      categorySpecific: !!f.category, searchTerm: f.query };
    return items.sort((a, b) => window.TechMerch.compare(a, b, opts));
  }
  function draw() {
    const holder = $('merchList'); if (!holder || !state.loaded) return;
    const items = visibleProducts();
    $('merchCount').textContent = `${items.length} منتج مطابق · ${state.changes.size} تعديل غير محفوظ`;
    $('merchSave').disabled = !state.changes.size;
    $('merchMore').hidden = items.length <= state.limit;
    holder.innerHTML = items.slice(0, state.limit).map((p, index) => `
      <div class="merch-row" data-id="${esc(p._id)}">
        <span class="merch-rank">${index + 1}</span>
        <img class="merch-thumb" src="${esc(p.image || '/assets/no-image.svg')}" alt="" loading="lazy" onerror="this.onerror=null;this.src='/assets/no-image.svg'">
        <div class="merch-detail"><strong title="${esc(p.title)}">${esc(p.title)}</strong>
          <small>${esc(p.category)} · ${Number(p.price).toLocaleString('ar-EG')} ج.م${window.TechMerch.isActiveOffer(p) ? ' · عرض نشط' : ''} · ${stock(p)} متوفر</small>
          <small class="merch-meta">مبيعات POS: ${Number(state.analytics.confirmed_sales?.[String(p._id)] || 0)} خلال 90 يومًا</small>
        </div>
        <label class="merch-control"><span>الأولوية</span><input class="merch-priority" type="number" min="0" max="100" step="1" value="${Number(p.merchPriority) || 0}"></label>
        <label class="merch-control"><span>التصنيف</span><select class="merch-tier"><option value="normal" ${!p.merchTier || p.merchTier === 'normal' ? 'selected' : ''}>عادي</option><option value="hero" ${p.merchTier === 'hero' ? 'selected' : ''}>رئيسي</option><option value="accessory" ${p.merchTier === 'accessory' ? 'selected' : ''}>مكمل</option></select></label>
        <label class="merch-featured"><input class="merch-star" type="checkbox" ${p.isFeatured ? 'checked' : ''}> مميز</label>
      </div>`).join('') || '<p class="merch-empty">لا توجد منتجات مطابقة للفلاتر الحالية.</p>';
  }
  function storeChange(row) {
    const id = row.dataset.id;
    const orig = state.products.find(p => String(p._id) === id);
    if (!orig) return;
    const priorityInput = row.querySelector('.merch-priority');
    if (!priorityInput.checkValidity()) { inform('الأولوية يجب أن تكون رقمًا صحيحًا بين 0 و100.', true); return; }
    const priority = Number(priorityInput.value);
    const tier = row.querySelector('.merch-tier').value;
    const featured = row.querySelector('.merch-star').checked;
    if (priority === (Number(orig.merchPriority) || 0) && tier === (orig.merchTier || 'normal') && featured === !!orig.isFeatured) state.changes.delete(id);
    else state.changes.set(id, { merchPriority: priority, merchTier: tier, isFeatured: featured });
    draw();
    inform('التعديل في المعاينة فقط. اضغط «حفظ ونشر» لتطبيقه على المتجر.');
  }
  async function load() {
    if (state.loading) return;
    state.loading = true; inform('جاري تحميل المنتجات وأرقام المبيعات المؤكدة...');
    try {
      const [productRes, popularityRes] = await Promise.all([
        window.adminFetch('/api/products'), fetch('/api/analytics/popular')
      ]);
      if (!productRes.ok) throw new Error(`تعذر تحميل المنتجات (${productRes.status})`);
      const data = await productRes.json();
      state.products = Array.isArray(data) ? data : [];
      state.analytics = popularityRes.ok ? await popularityRes.json() : {};
      state.loaded = true;
      const cats = [...new Set(state.products.map(p => String(p.category || '')).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ar'));
      const selected = $('merchCategory').value;
      $('merchCategory').innerHTML = '<option value="">كل الأقسام</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      if (cats.includes(selected)) $('merchCategory').value = selected;
      draw(); inform('المعاينة محلية حتى تضغط حفظ. الترتيب الفعلي يعتمد أيضًا على نشاط المتجر.');
    } catch (err) { inform(err.message, true); }
    finally { state.loading = false; }
  }
  async function save() {
    const changes = [...state.changes.entries()].map(([id, data]) => ({ id, priority: data.merchPriority, tier: data.merchTier, featured: data.isFeatured }));
    if (!changes.length) return;
    if (changes.length > 100) { inform('الحد الأقصى 100 منتج لكل عملية. احفظ مجموعة أصغر.', true); return; }
    const button = $('merchSave'); button.disabled = true; inform('جاري نشر تغييرات الأولوية...');
    try {
      const response = await window.adminFetch('/api/admin/merchandising/priority', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: changes })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'تعذر حفظ الأولوية');
      for (const [id, fields] of state.changes) {
        const p = state.products.find(p => String(p._id) === id);
        if (p) Object.assign(p, fields);
      }
      state.changes.clear(); draw(); inform(`تم نشر ${changes.length} تعديل بنجاح. حدّث المتجر لرؤية الترتيب.`);
      window.loadAdminProducts?.(true).catch(() => {});
    } catch (err) { inform(err.message, true); button.disabled = false; }
  }
  function boot() {
    const shell = document.querySelector('#panel-products .products-admin-shell');
    if (!shell || !window.TechMerch) return;
    const studio = document.createElement('section'); studio.className = 'merch-studio glass-panel'; studio.id='merchStudio';
    studio.innerHTML = `
      <div class="merch-top"><div><h3>⭐ إدارة ظهور المنتجات والعروض</h3><p>حدد المنتجات الرئيسية، واضبط الأولوية وشاهد ترتيب الظهور قبل النشر. منتجات POS لا يتغير سعرها أو مخزونها من هذه الأداة.</p></div>
        <button type="button" id="merchToggle" class="merch-main-btn" aria-expanded="false">فتح إدارة الظهور</button></div>
      <div id="merchContents" hidden>
        <div class="merch-filters">
          <input id="merchSearch" type="search" placeholder="ابحث باسم المنتج أو SKU..." aria-label="البحث في معاينة ترتيب المنتجات">
          <select id="merchCategory" aria-label="القسم"><option value="">كل الأقسام</option></select>
          <label class="merch-offers"><input id="merchOffers" type="checkbox"> العروض النشطة فقط</label>
          <button type="button" id="merchReload" class="merch-outline">تحديث البيانات</button>
        </div>
        <div class="merch-summary"><strong id="merchCount">—</strong><small>معاينة ترتيب أول المنتجات المطابقة. البحث يعطي الأولوية للصِلة بالاسم.</small></div>
        <div id="merchList" class="merch-list" aria-live="polite"></div>
        <button type="button" id="merchMore" class="merch-outline" hidden>عرض 30 منتجًا إضافيًا</button>
        <div class="merch-bottom"><p id="merchNotice" role="status">افتح الأداة لتحميل البيانات.</p><button type="button" id="merchSave" class="merch-main-btn" disabled>حفظ ونشر التغييرات</button></div>
      </div>`;
    const toolbar = shell.querySelector('.products-toolbar');
    if (toolbar) shell.insertBefore(studio, toolbar); else shell.prepend(studio);
    $('merchToggle').onclick = () => {
      if (typeof hasPermission === 'function' && !hasPermission('edit_product')) { inform('ليس لديك صلاحية تعديل المنتجات.', true); return; }
      const content = $('merchContents'); content.hidden = !content.hidden;
      $('merchToggle').setAttribute('aria-expanded', String(!content.hidden));
      $('merchToggle').textContent = content.hidden ? 'فتح إدارة الظهور' : 'إغلاق إدارة الظهور';
      if (!content.hidden && !state.loaded) load();
    };
    $('merchSearch').addEventListener('input', () => { state.limit=30; draw(); });
    $('merchCategory').addEventListener('change', () => { state.limit=30; draw(); });
    $('merchOffers').addEventListener('change', () => { state.limit=30; draw(); });
    $('merchReload').onclick = () => { if (state.changes.size && !confirm('هناك تعديلات غير محفوظة. هل تريد تجاهلها وتحميل البيانات من جديد؟')) return; state.changes.clear(); load(); };
    $('merchMore').onclick = () => { state.limit += 30; draw(); };
    $('merchSave').onclick = save;
    $('merchList').addEventListener('change', e => {
      const row = e.target.closest('.merch-row'); if (row) storeChange(row);
    });
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
