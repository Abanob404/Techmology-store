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
    ['sales','المبيعات والعملاء',['orders','recovery','returns']],
    ['marketing','التسويق والمحتوى',['growth','reviews']],
    ['analytics','التحليلات',['intelligence','analytics']],
    ['operations','التشغيل',['system','backup']],
    ['security','الإدارة والنظام',['users','logs','api']],
    ['settings','الإعدادات',['settings']]
  ];
  const LABELS = {
    dashboard:['space_dashboard','لوحة التحكم'], products:['inventory_2','المنتجات والمخزون'], media:['photo_library','الصور والوسائط'],
    orders:['receipt_long','الطلبات'], recovery:['shopping_cart_checkout','السلات غير المكتملة'], returns:['assignment_return','الاستبدال والاسترجاع'],
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
    grid.innerHTML=list.length?list.map(r=>{const st=r.status||(r.approved?'published':'pending');return `<article class="v10-review-card"><header><div><small>${esc(r.productId?.title||'منتج')}</small><h3>${esc(r.name)}</h3></div><span class="v10-review-status ${st}">${statusLabel[st]||st}</span></header><div class="v10-stars">${'★'.repeat(Number(r.rating)||0)}${'☆'.repeat(5-(Number(r.rating)||0))}</div><p>${esc(r.publishedComment||r.comment||r.originalComment||'بدون تعليق')}</p>${r.storeReply?`<div class="v10-reply-preview"><b>رد المتجر</b><span>${esc(r.storeReply)}</span></div>`:''}<footer><small>${new Date(r.createdAt).toLocaleString('ar-EG')}</small><button onclick="window.v10EditReview('${r._id}')">مراجعة وتعديل</button></footer></article>`}).join(''):'<div class="v10-empty">لا توجد تقييمات مطابقة.</div>';
  }
  window.v10EditReview=(id)=>{const r=reviews.find(x=>x._id===id);if(!r)return;document.getElementById('v10ReviewModal')?.remove();const st=r.status||(r.approved?'published':'pending');const m=document.createElement('div');m.id='v10ReviewModal';m.className='v10-modal';m.innerHTML=`<div class="v10-modal-backdrop"></div><section class="v10-review-editor"><header><div><small>مراجعة قبل النشر</small><h2>${esc(r.productId?.title||'تقييم عميل')}</h2><p>${esc(r.name)} · ${new Date(r.createdAt).toLocaleString('ar-EG')}</p></div><button class="v10-close">×</button></header><div class="v10-editor-grid"><label><span>تقييم العميل</span><div class="v10-rating-readonly">${'★'.repeat(Number(r.rating)||0)}${'☆'.repeat(5-(Number(r.rating)||0))} <small>${Number(r.rating)||0}/5</small></div></label><label><span>الحالة الحالية</span><div class="v10-status-readonly">${st==='pending'?'بانتظار المراجعة':st==='published'?'منشور':st==='rejected'?'مرفوض':'مخفي'}</div></label><label class="wide"><span>النص الأصلي من العميل</span><textarea readonly>${esc(r.originalComment||r.comment||'')}</textarea><small>محفوظ للرجوع إليه ولا يتغير عند تعديل النص المنشور.</small></label><label class="wide"><span>النص الذي سيظهر على الموقع</span><textarea id="v10EditPublished">${esc(r.publishedComment||r.comment||r.originalComment||'')}</textarea></label><label class="wide"><span>رد المتجر (اختياري)</span><textarea id="v10EditReply" placeholder="اكتب رد Technology Store...">${esc(r.storeReply||'')}</textarea></label></div><div class="v10-editor-actions"><button data-save="pending" class="secondary">حفظ للمراجعة</button><button data-save="rejected" class="danger">رفض</button><button data-save="hidden" class="secondary">إخفاء</button><button data-save="published" class="primary">اعتماد ونشر</button></div></section>`;document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v10-modal-backdrop').onclick=close;m.querySelector('.v10-close').onclick=close;m.querySelector('.v10-editor-actions').onclick=async e=>{const b=e.target.closest('button[data-save]');if(!b)return;b.disabled=true;try{await api(`/api/admin/reviews/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:b.dataset.save,publishedComment:document.getElementById('v10EditPublished').value,storeReply:document.getElementById('v10EditReply').value})});showToast('✅ تم تحديث التقييم');close();await loadReviews();}catch(err){alert(err.message);}finally{b.disabled=false;}};};

  function wrapSwitch(){if(!window.switchTab||window.switchTab.__v10)return;const old=window.switchTab;const fn=function(name){old(name);if(name==='reviews')setTimeout(loadReviews,40);if(name==='settings')setTimeout(()=>{buildSettingsNavigator();classifySettingsCards();},80);};fn.__v10=true;window.switchTab=fn;}

  function boot(){ensureReviewsTab();organizeSidebar();buildSettingsNavigator();makeDashboardInteractive();enhanceDashboardAlerts();hideLegacyReviewBlock();addGlobalSearch();wrapSwitch();setTimeout(()=>{organizeSidebar();classifySettingsCards();makeDashboardInteractive();enhanceDashboardAlerts();hideLegacyReviewBlock();},800);setTimeout(()=>{organizeSidebar();classifySettingsCards();hideLegacyReviewBlock();},2200);}
  document.addEventListener('DOMContentLoaded',boot);
})();
