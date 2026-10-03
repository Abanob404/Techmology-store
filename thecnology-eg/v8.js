/* Technology Store V8 — commerce, attribution, reviews, variants, smoother mobile UX */
(() => {
  'use strict';
  const state = () => window.__techStoreState;
  const money = n => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n)||0)} ج.م`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const selectedVariant = new Map();
  const checkoutState = { shippingAmount:0, discountAmount:0, couponCode:'', quotePending:false };
  const statusLabels = {
    pending:'تم استلام الطلب', received_by_pos:'تم استلامه في النظام', processing:'جاري التجهيز', out_for_delivery:'خرج للتوصيل', completed:'تم التسليم', cancelled:'تم الإلغاء'
  };

  function products(){ return state()?.getProducts?.() || []; }
  function cart(){ return state()?.getCart?.() || []; }
  function settings(){ return state()?.getSettings?.() || window.storeSettings || {}; }
  function saveCart(next){ state()?.setCart?.(next); }
  function productById(id){ return products().find(p => String(p._id) === String(id)); }
  function variantFor(product, raw){
    const arr = Array.isArray(product?.variants) ? product.variants : [];
    if (!arr.length) return null;
    const wanted = typeof raw === 'object' ? String(raw?.value || raw?.sku || '') : String(raw || '');
    return arr.find(v => String(v.value) === wanted || String(v.sku || '') === wanted) || null;
  }
  function cartKey(id, variant){ return `${id}::${variant?.value || ''}`; }
  function itemKey(item){ return item.cartKey || cartKey(item._id, item.variantData || (item.variantValue ? {value:item.variantValue}:null)); }
  function subtotal(){ return cart().reduce((sum, i) => sum + Number(i.price||0) * Number(i.quantity||0), 0); }

  // ---------- Exact share-source attribution ----------
  function attributedUrl(baseUrl, source){
    const u = new URL(baseUrl, location.origin);
    u.searchParams.set('utm_source', source);
    u.searchParams.set('utm_medium', 'product_share');
    u.searchParams.set('utm_campaign', 'product_share');
    u.searchParams.set('share_source', source);
    return u.toString();
  }
  function closeShareSheet(){ document.getElementById('v8ShareSheet')?.remove(); }
  window.shareProduct = function(title, price, url){
    closeShareSheet();
    const sheet = document.createElement('div');
    sheet.id='v8ShareSheet'; sheet.className='v8-overlay';
    const msg = `${title}${price ? ` — ${money(price)}` : ''}`;
    const links = {
      whatsapp:`https://wa.me/?text=${encodeURIComponent(msg+'\n'+attributedUrl(url,'whatsapp'))}`,
      facebook:`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(attributedUrl(url,'facebook'))}`,
      telegram:`https://t.me/share/url?url=${encodeURIComponent(attributedUrl(url,'telegram'))}&text=${encodeURIComponent(msg)}`
    };
    sheet.innerHTML=`<div class="v8-backdrop" onclick="document.getElementById('v8ShareSheet')?.remove()"></div>
      <section class="v8-sheet v8-share-sheet" dir="rtl">
        <header><div><small>رابط متتبع للمصدر</small><h3>مشاركة المنتج</h3></div><button onclick="document.getElementById('v8ShareSheet')?.remove()">×</button></header>
        <p class="v8-muted">عند استخدام أحد الأزرار التالية ستعرف من لوحة الإدارة إن الزيارة جاءت من واتساب أو فيسبوك أو تليجرام.</p>
        <div class="v8-share-grid">
          <a href="${links.whatsapp}" target="_blank" rel="noopener" class="wa"><i class="fa-brands fa-whatsapp"></i><span>واتساب</span></a>
          <a href="${links.facebook}" target="_blank" rel="noopener" class="fb"><i class="fa-brands fa-facebook-f"></i><span>فيسبوك</span></a>
          <a href="${links.telegram}" target="_blank" rel="noopener" class="tg"><i class="fa-brands fa-telegram-plane"></i><span>تليجرام</span></a>
          <button id="v8CopyShare"><span class="material-symbols-outlined">link</span><span>نسخ الرابط</span></button>
        </div>
        <button id="v8SystemShare" class="v8-secondary-btn"><span class="material-symbols-outlined">ios_share</span> مشاركة من الهاتف</button>
      </section>`;
    document.body.appendChild(sheet);
    document.getElementById('v8CopyShare').onclick=async()=>{
      const shareUrl=attributedUrl(url,'copied_link');
      try{await navigator.clipboard.writeText(`${msg}\n${shareUrl}`); state()?.showToast?.('تم نسخ رابط متتبع');}catch(_){prompt('انسخ الرابط',shareUrl);}
    };
    document.getElementById('v8SystemShare').onclick=async()=>{
      const shareUrl=attributedUrl(url,'system_share');
      if(navigator.share){ try{await navigator.share({title,text:msg,url:shareUrl});}catch(_){} }
      else { try{await navigator.clipboard.writeText(shareUrl);state()?.showToast?.('تم نسخ الرابط');}catch(_){} }
    };
  };

  // ---------- Cart with variants ----------
  window.addToCart = function(productId, variantValue){
    const p=productById(productId); if(!p) return;
    const v=variantFor(p, variantValue || selectedVariant.get(String(productId)));
    const stock=v ? Number(v.stockQuantity||0) : Number(p.stockQuantity||0);
    if(stock<=0){ openStockNotify(p); return; }
    const price=v && Number.isFinite(Number(v.price)) ? Number(v.price) : Number(p.price)||0;
    const next=[...cart()]; const key=cartKey(p._id,v); const existing=next.find(i=>itemKey(i)===key);
    if(existing){ if(existing.quantity>=stock){ alert('لا يوجد مخزون كافٍ لهذه الكمية.'); return; } existing.quantity+=1; }
    else next.push({_id:p._id,cartKey:key,title:p.title,price,image:(v?.image||p.image),sku:(v?.sku||p.sku||''),posItemId:p.posItemId,stockQuantity:stock,quantity:1,variantValue:v?.value||'',variantLabel:v?.label||'',variantData:v?{label:v.label,value:v.value,sku:v.sku||''}:null});
    saveCart(next); window.renderCart?.(); window.updateCartBadge?.(); state()?.showToast?.('تمت الإضافة للسلة');
    try{ window.trackEvent?.('cart_adds',p._id,p.title); if(window.fbq) fbq('track','AddToCart',{value:price,currency:'EGP'}); }catch(_){}
  };
  window.removeFromCart = function(key){ const next=cart().filter(i=>itemKey(i)!==String(key) && String(i._id)!==String(key)); saveCart(next); window.renderCart?.(); window.updateCartBadge?.(); };
  window.updateCartQuantity = function(key,change){
    const next=[...cart()]; const item=next.find(i=>itemKey(i)===String(key) || String(i._id)===String(key)); if(!item) return;
    const q=Number(item.quantity||0)+Number(change||0); if(q<=0){window.removeFromCart(itemKey(item));return;} if(q>Number(item.stockQuantity||0)){alert('لا يوجد مخزون كافٍ.');return;} item.quantity=q; saveCart(next); window.renderCart?.(); window.updateCartBadge?.();
  };

  window.renderCart = function(){
    const container=document.getElementById('cartItemsContainer'); const totalEl=document.getElementById('cartTotalPrice'); if(!container||!totalEl)return;
    const c=cart();
    if(!c.length){container.innerHTML='<div class="v8-empty-cart"><span class="material-symbols-outlined">shopping_cart</span><strong>سلة التسوق فارغة</strong><small>أضف منتجاتك ثم أكمل الطلب من هنا.</small></div>';totalEl.textContent=money(0);document.getElementById('cartCustomerForm')?.classList.add('hidden');return;}
    container.innerHTML=c.map(item=>{
      const key=itemKey(item); const p=productById(item._id); const image=item.image||p?.image||'/assets/no-image.svg'; const variant=item.variantValue?`<span class="v8-cart-variant">${esc(item.variantLabel||'الخيار')}: ${esc(item.variantValue)}</span>`:'';
      return `<article class="v8-cart-line"><img src="${esc(image)}" alt="${esc(item.title)}" loading="lazy" decoding="async"><div class="v8-cart-copy"><strong>${esc(item.title)}</strong>${variant}<b>${money(item.price)}</b></div><div class="v8-qty"><button onclick="updateCartQuantity('${esc(key)}',-1)">−</button><span>${item.quantity}</span><button onclick="updateCartQuantity('${esc(key)}',1)">+</button></div><button class="v8-remove" onclick="removeFromCart('${esc(key)}')" aria-label="حذف">×</button></article>`;
    }).join('');
    totalEl.textContent=money(Math.max(0,subtotal()-checkoutState.discountAmount+checkoutState.shippingAmount));
    updateCheckoutSummary();
  };

  // ---------- Checkout ----------
  function buildCheckoutForm(){
    const box=document.getElementById('cartCustomerForm'); if(!box) return; if(box.dataset.v8==='1'){refreshCheckoutConfig();return;} box.dataset.v8='1';
    box.innerHTML=`
      <div class="v8-checkout-grid">
        <input id="customerName" autocomplete="name" placeholder="الاسم الكامل">
        <input id="customerPhone" autocomplete="tel" inputmode="tel" dir="ltr" placeholder="رقم الهاتف">
      </div>
      <div class="v8-segment" id="v8DeliverySegment"><button type="button" data-delivery="pickup" class="active">استلام من المعرض</button><button type="button" data-delivery="shipping">شحن</button></div>
      <div id="addressFieldContainer"><div id="v8ShippingFields" class="hidden v8-checkout-grid">
        <select id="v8Governorate"><option value="">اختر منطقة الشحن</option></select>
        <input id="v8Area" placeholder="المنطقة / الحي">
        <textarea id="customerAddress" placeholder="العنوان بالتفصيل"></textarea>
      </div></div><p id="pickupOnlyNote" class="hidden"></p>
      <textarea id="v8OrderNotes" class="v8-notes-field" placeholder="ملاحظات على الطلب (اختياري)"></textarea>
      <div><label class="v8-label">طريقة الدفع</label><select id="v8PaymentMethod"></select></div>
      <div class="v8-coupon"><input id="v8Coupon" placeholder="كود الخصم"><button type="button" id="v8ApplyCoupon">تطبيق</button></div>
      <div id="v8CheckoutMessage" class="v8-quote-note"></div>
      <div class="v8-order-summary"><div><span>المنتجات</span><b id="v8SubTotal">0</b></div><div><span>الخصم</span><b id="v8Discount">0</b></div><div><span>الشحن</span><b id="v8Shipping">0</b></div><div class="total"><span>الإجمالي</span><b id="v8GrandTotal">0</b></div></div>
      <button type="button" class="v8-track-link" onclick="openOrderTracking()"><span class="material-symbols-outlined">local_shipping</span> لديك طلب سابق؟ تتبع طلبك</button>`;
    refreshCheckoutConfig();
    box.querySelectorAll('[data-delivery]').forEach(btn=>btn.onclick=()=>{ if(btn.disabled)return; box.querySelectorAll('[data-delivery]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.getElementById('v8ShippingFields').classList.toggle('hidden',btn.dataset.delivery!=='shipping');fillPaymentMethods();requestQuote(); });
    document.getElementById('v8Governorate').onchange=requestQuote; document.getElementById('v8ApplyCoupon').onclick=requestQuote;
    document.getElementById('v8Coupon').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();requestQuote();}});
    updateCheckoutSummary();
  }
  function refreshCheckoutConfig(){
    const box=document.getElementById('cartCustomerForm');if(!box||box.dataset.v8!=='1')return;const s=settings();const pickupBtn=box.querySelector('[data-delivery="pickup"]'),shippingBtn=box.querySelector('[data-delivery="shipping"]');
    if(pickupBtn){pickupBtn.disabled=s.pickupEnabled===false;pickupBtn.title=pickupBtn.disabled?'الاستلام من المعرض غير متاح':'';}
    if(shippingBtn){shippingBtn.disabled=!s.isShippingEnabled;shippingBtn.title=shippingBtn.disabled?'الشحن غير مفعل':'';}
    let active=box.querySelector('[data-delivery].active');
    if(!active||active.disabled){box.querySelectorAll('[data-delivery]').forEach(b=>b.classList.remove('active'));active=[pickupBtn,shippingBtn].find(b=>b&&!b.disabled);active?.classList.add('active');}
    const gov=document.getElementById('v8Governorate');if(gov){const current=gov.value;const zones=Array.isArray(s.shippingZones)?s.shippingZones.filter(z=>z.enabled!==false):[];gov.innerHTML='<option value="">اختر منطقة الشحن</option>'+zones.map(z=>`<option value="${esc(z.name)}">${esc(z.name)} — ${money(z.fee)}${z.eta?` (${esc(z.eta)})`:''}</option>`).join('');if([...gov.options].some(o=>o.value===current))gov.value=current;}
    const fields=document.getElementById('v8ShippingFields');if(fields)fields.classList.toggle('hidden',deliveryMethod()!=='shipping');fillPaymentMethods();updateCheckoutSummary();
  }
  function deliveryMethod(){ return document.querySelector('#v8DeliverySegment [data-delivery].active')?.dataset.delivery || 'pickup'; }
  function fillPaymentMethods(){
    const el=document.getElementById('v8PaymentMethod'); if(!el)return; const s=settings(); const d=deliveryMethod(); const arr=[];
    if(s.paymentCashOnDelivery!==false && d==='shipping') arr.push(['cash_on_delivery','الدفع عند الاستلام']);
    if(s.paymentInstapay) arr.push(['instapay',`InstaPay${s.instapayHandle?` — ${s.instapayHandle}`:''}`]);
    if(s.paymentStorePickup!==false && d==='pickup') arr.push(['pay_at_store','الدفع عند الاستلام من المعرض']);
    if(!arr.length && s.paymentCashOnDelivery!==false) arr.push(['cash_on_delivery','الدفع عند الاستلام']);
    el.innerHTML=arr.map(x=>`<option value="${x[0]}">${esc(x[1])}</option>`).join('');
  }
  async function requestQuote(){
    const note=document.getElementById('v8CheckoutMessage'); const gov=document.getElementById('v8Governorate')?.value||''; const coupon=document.getElementById('v8Coupon')?.value.trim()||''; const d=deliveryMethod();
    if(d==='shipping' && !gov){ checkoutState.shippingAmount=0; checkoutState.discountAmount=0; if(note)note.textContent='اختر منطقة الشحن لحساب التكلفة.'; updateCheckoutSummary(); return; }
    checkoutState.quotePending=true; if(note)note.textContent='جاري حساب الإجمالي...';
    try{const r=await fetch('/api/checkout/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subtotal:subtotal(),deliveryMethod:d,governorate:gov,couponCode:coupon})});const data=await r.json();if(!r.ok)throw new Error(data.message||'تعذر حساب الطلب');checkoutState.shippingAmount=Number(data.shippingAmount||0);checkoutState.discountAmount=Number(data.discountAmount||0);checkoutState.couponCode=data.couponCode||'';if(note)note.textContent=data.eta?`مدة الشحن المتوقعة: ${data.eta}`:(checkoutState.couponCode?'تم تطبيق الخصم بنجاح':'');}
    catch(err){checkoutState.shippingAmount=0;checkoutState.discountAmount=0;checkoutState.couponCode='';if(note)note.textContent=err.message;}
    finally{checkoutState.quotePending=false;updateCheckoutSummary();}
  }
  function updateCheckoutSummary(){
    const sub=subtotal(); const total=Math.max(0,sub-checkoutState.discountAmount+checkoutState.shippingAmount);
    const map={v8SubTotal:sub,v8Discount:checkoutState.discountAmount,v8Shipping:checkoutState.shippingAmount,v8GrandTotal:total}; Object.entries(map).forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=money(v);}); const old=document.getElementById('cartTotalPrice');if(old)old.textContent=money(total);
  }
  const oldOpenCart=window.openCartSidebar;
  window.openCartSidebar=function(){ oldOpenCart?.(); setTimeout(()=>{buildCheckoutForm();document.getElementById('cartCustomerForm')?.classList.toggle('hidden',cart().length===0);},0); };

  window.checkoutWhatsApp = async function(){
    if(!cart().length){alert('عربة التسوق فارغة.');return;}
    buildCheckoutForm(); const name=document.getElementById('customerName')?.value.trim()||''; const phone=document.getElementById('customerPhone')?.value.trim()||''; const d=deliveryMethod(); const gov=document.getElementById('v8Governorate')?.value||''; const area=document.getElementById('v8Area')?.value.trim()||''; const address=document.getElementById('customerAddress')?.value.trim()||''; const payment=document.getElementById('v8PaymentMethod')?.value||'';
    if(!name||!phone){alert('أدخل الاسم ورقم الهاتف.');return;} if(d==='shipping'&&(!gov||!address)){alert('اختر منطقة الشحن وأدخل العنوان بالتفصيل.');return;}
    await requestQuote();
    const payload={customerName:name,customerPhone:phone,customerAddress:d==='shipping'?address:'استلام من المعرض',deliveryMethod:d,governorate:gov,area,notes:document.getElementById('v8OrderNotes')?.value.trim()||'',paymentMethod:payment,couponCode:checkoutState.couponCode||document.getElementById('v8Coupon')?.value.trim()||'',visitorId:localStorage.getItem('tech_store_vid')||'',sessionId:sessionStorage.getItem('tech_store_session_id')||'',items:cart().map(i=>({productId:i._id,sku:i.sku,posItemId:i.posItemId,title:i.title,quantity:i.quantity,variant:i.variantValue?{value:i.variantValue}:undefined}))};
    const btn=document.querySelector('button[onclick="checkoutWhatsApp()"]'); const old=btn?.innerHTML;if(btn){btn.disabled=true;btn.innerHTML='<span class="material-symbols-outlined animate-spin">sync</span> جاري إنشاء الطلب...';}
    try{const r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.message||'تعذر إرسال الطلب');showOrderSuccess(data,name,phone);try{if(window.fbq)fbq('track','Purchase',{currency:'EGP',value:data.total});}catch(_){} }
    catch(err){alert(err.message);}finally{if(btn){btn.disabled=false;btn.innerHTML=old;}}
  };
  function showOrderSuccess(data,name,phone){
    const msg=`مرحباً، أريد متابعة الطلب رقم ${data.orderNumber||data.orderId}\nالاسم: ${name}\nالهاتف: ${phone}\nالإجمالي: ${money(data.total)}`; const wa=state()?.buildWhatsappUrl?.(msg)||'#';
    const m=document.createElement('div');m.className='v8-overlay';m.innerHTML=`<div class="v8-backdrop"></div><section class="v8-sheet v8-success"><span class="material-symbols-outlined success-icon">check_circle</span><h2>تم استلام طلبك</h2><p>احتفظ برقم الطلب لتتبعه في أي وقت.</p><code>${esc(data.orderNumber||data.orderId)}</code><div class="v8-order-mini"><span>الشحن: ${money(data.shippingAmount)}</span><span>الخصم: ${money(data.discountAmount)}</span><strong>الإجمالي: ${money(data.total)}</strong></div><div class="v8-actions"><button id="v8TrackNow">تتبع الطلب</button><a href="${wa}" target="_blank" rel="noopener">متابعة عبر واتساب</a></div><button id="v8DoneOrder" class="v8-secondary-btn">تم</button></section>`;document.body.appendChild(m);
    localStorage.setItem('tech_last_order',JSON.stringify({orderNumber:data.orderNumber||data.orderId,phone}));
    document.getElementById('v8DoneOrder').onclick=()=>{saveCart([]);window.renderCart?.();window.closeCartSidebar?.();m.remove();};
    document.getElementById('v8TrackNow').onclick=()=>{m.remove();saveCart([]);window.renderCart?.();window.closeCartSidebar?.();openOrderTracking(data.orderNumber||data.orderId,phone);};
  }

  // ---------- Order tracking ----------
  window.openOrderTracking=function(orderNumber='',phone=''){
    document.getElementById('v8OrderTrack')?.remove();
    try{const last=JSON.parse(localStorage.getItem('tech_last_order')||'{}');orderNumber=orderNumber||last.orderNumber||'';phone=phone||last.phone||'';}catch(_){}
    const m=document.createElement('div');m.id='v8OrderTrack';m.className='v8-overlay';m.innerHTML=`<div class="v8-backdrop" onclick="document.getElementById('v8OrderTrack')?.remove()"></div><section class="v8-sheet v8-track-sheet"><header><div><small>متابعة حالة الشحنة</small><h3>تتبع طلبك</h3></div><button onclick="document.getElementById('v8OrderTrack')?.remove()">×</button></header><div class="v8-checkout-grid"><input id="v8TrackNumber" dir="ltr" placeholder="رقم الطلب" value="${esc(orderNumber)}"><input id="v8TrackPhone" dir="ltr" placeholder="رقم الهاتف" value="${esc(phone)}"></div><button id="v8TrackSubmit" class="v8-primary-btn">عرض حالة الطلب</button><div id="v8TrackResult"></div></section>`;document.body.appendChild(m);document.getElementById('v8TrackSubmit').onclick=async()=>{const n=document.getElementById('v8TrackNumber').value.trim(),p=document.getElementById('v8TrackPhone').value.trim(),out=document.getElementById('v8TrackResult');if(!n||!p){out.innerHTML='<p class="v8-error">أدخل رقم الطلب والهاتف.</p>';return;}out.innerHTML='<p class="v8-muted">جاري التحميل...</p>';try{const r=await fetch(`/api/orders/track?orderNumber=${encodeURIComponent(n)}&phone=${encodeURIComponent(p)}`);const d=await r.json();if(!r.ok)throw new Error(d.message||'الطلب غير موجود');const hist=(d.statusHistory?.length?d.statusHistory:[{status:d.status,at:d.createdAt}]);out.innerHTML=`<div class="v8-track-card"><div class="v8-track-head"><strong>${esc(d.orderNumber)}</strong><b>${money(d.total)}</b></div><div class="v8-timeline">${hist.map((h,i)=>`<div class="${i===hist.length-1?'active':''}"><span></span><p><strong>${esc(statusLabels[h.status]||h.status)}</strong><small>${h.at?new Date(h.at).toLocaleString('ar-EG'):''}${h.note?` — ${esc(h.note)}`:''}</small></p></div>`).join('')}</div></div>`;}catch(err){out.innerHTML=`<p class="v8-error">${esc(err.message)}</p>`;}};
  };

  // ---------- Product variants, reviews, stock alert, zoom ----------
  const oldOpenProduct=window.openProductModal;
  window.openProductModal=function(id){ oldOpenProduct?.(id); setTimeout(()=>enhanceProductModal(id),10); };
  function enhanceProductModal(id){
    const p=productById(id); if(!p)return; const info=document.querySelector('.product-detail-info'); if(!info)return;
    injectVariants(p,info); injectReviews(p,info); bindImageViewer(p); injectMobileProductDock(p);
    const share=document.getElementById('modalShareBtn'); if(share)share.onclick=()=>window.shareProduct(p.title,p.price,state()?.getProductShareUrl?.(p)||location.href);
    const add=document.getElementById('modalAddToCartBtn'); if(add && Number(p.stockQuantity)>0) add.onclick=()=>window.addToCart(p._id,selectedVariant.get(String(p._id)));
    if((Array.isArray(p.variants)&&p.variants.length?Math.max(...p.variants.map(v=>Number(v.stockQuantity||0))):Number(p.stockQuantity||0))<=0) setupNotifyButton(p);
    const modal=document.getElementById('productModalContent'); if(modal) modal.scrollTop=0;
  }
  function injectMobileProductDock(p){
    const modal=document.getElementById('productModalContent');if(!modal)return;modal.querySelector('#v8MobileProductDock')?.remove();
    const totalStock=Array.isArray(p.variants)&&p.variants.length?p.variants.reduce((a,v)=>a+Math.max(0,Number(v.stockQuantity)||0),0):Number(p.stockQuantity||0);
    const dock=document.createElement('div');dock.id='v8MobileProductDock';dock.className='v8-mobile-product-dock';
    dock.innerHTML=totalStock>0?`<button class="buy"><span class="material-symbols-outlined">bolt</span> شراء الآن</button><button class="cart"><span class="material-symbols-outlined">add_shopping_cart</span> للسلة</button><button class="ask"><i class="fa-brands fa-whatsapp"></i> واتساب</button>`:`<button class="notify"><span class="material-symbols-outlined">notifications_active</span> بلغني عند التوفر</button><button class="ask"><i class="fa-brands fa-whatsapp"></i> استفسر</button>`;
    modal.appendChild(dock);
    dock.querySelector('.cart')?.addEventListener('click',()=>window.addToCart(p._id,selectedVariant.get(String(p._id))));
    dock.querySelector('.buy')?.addEventListener('click',()=>{window.addToCart(p._id,selectedVariant.get(String(p._id)));window.closeProductModal?.();setTimeout(()=>window.openCartSidebar?.(),180);});
    dock.querySelector('.notify')?.addEventListener('click',()=>openStockNotify(p));
    dock.querySelector('.ask')?.addEventListener('click',()=>window.open(state()?.buildWhatsappUrl?.(`أريد الاستفسار عن منتج: ${p.title}`)||'#','_blank','noopener'));
  }

  function injectVariants(p,info){
    info.querySelector('#v8VariantBox')?.remove(); const arr=(p.variants||[]).filter(v=>v.value); if(!arr.length)return;
    const available=arr.find(v=>Number(v.stockQuantity)>0)||arr[0]; selectedVariant.set(String(p._id),available.value);
    const box=document.createElement('div');box.id='v8VariantBox';box.className='v8-variant-box';box.innerHTML=`<label>${esc(available.label||'اختر الخيار')}</label><div class="v8-variant-options">${arr.map(v=>`<button type="button" data-value="${esc(v.value)}" class="${v.value===available.value?'active':''}" ${Number(v.stockQuantity)<=0?'disabled':''}><span>${esc(v.value)}</span><small>${Number(v.stockQuantity)<=0?'غير متوفر':money(Number.isFinite(Number(v.price))?v.price:p.price)}</small></button>`).join('')}</div>`;
    const price=document.getElementById('modalPrice'); price?.insertAdjacentElement('afterend',box);
    box.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{box.querySelectorAll('button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');selectedVariant.set(String(p._id),btn.dataset.value);const v=variantFor(p,btn.dataset.value);if(price)price.innerHTML=formatVariantPrice(v,p);const img=document.getElementById('modalImage');if(v?.image&&img)img.src=v.image;const add=document.getElementById('modalAddToCartBtn');if(add)add.onclick=()=>window.addToCart(p._id,v.value);});
    if(price)price.innerHTML=formatVariantPrice(available,p);
  }
  function formatVariantPrice(v,p){const now=Number.isFinite(Number(v?.price))?Number(v.price):Number(p.price)||0;const old=Number(v?.oldPrice||0)>now?`<del>${money(v.oldPrice)}</del>`:'';return `<span>${money(now)}</span>${old}`;}
  function injectReviews(p,info){
    info.querySelector('#v8Reviews')?.remove(); const sec=document.createElement('section');sec.id='v8Reviews';sec.className='v8-reviews';sec.innerHTML=`<div class="v8-section-heading"><div><small>تجارب العملاء</small><h4>التقييمات والمراجعات</h4></div><button id="v8WriteReview">اكتب تقييمك</button></div><div id="v8ReviewSummary" class="v8-muted">جاري تحميل التقييمات...</div><div id="v8ReviewList"></div>`; const related=document.getElementById('modalRelatedProducts');(related||info).insertAdjacentElement(related?'beforebegin':'beforeend',sec);document.getElementById('v8WriteReview').onclick=()=>openReviewForm(p);
    fetch(`/api/reviews/${p._id}`).then(r=>r.json()).then(d=>{const sum=document.getElementById('v8ReviewSummary'),list=document.getElementById('v8ReviewList');if(!sum||!list)return;sum.innerHTML=d.count?`<strong>${'★'.repeat(Math.round(d.average))}${'☆'.repeat(5-Math.round(d.average))}</strong> ${d.average}/5 من ${d.count} مراجعة`:'لا توجد مراجعات منشورة بعد.';list.innerHTML=(d.reviews||[]).slice(0,5).map(r=>`<article><div><strong>${esc(r.name)}</strong><span>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></div><p>${esc(r.comment||'')}</p><small>${new Date(r.createdAt).toLocaleDateString('ar-EG')}</small></article>`).join('');}).catch(()=>{});
  }
  function openReviewForm(p){
    document.getElementById('v8ReviewFormModal')?.remove();const m=document.createElement('div');m.id='v8ReviewFormModal';m.className='v8-overlay';m.innerHTML=`<div class="v8-backdrop"></div><section class="v8-sheet v8-form-sheet"><header><div><small>شارك تجربتك</small><h3>تقييم ${esc(p.title)}</h3></div><button class="v8-close-form">×</button></header><div class="v8-checkout-grid"><input id="v8ReviewName" placeholder="الاسم"><select id="v8ReviewRating"><option value="5">★★★★★ — ممتاز</option><option value="4">★★★★☆ — جيد جداً</option><option value="3">★★★☆☆ — جيد</option><option value="2">★★☆☆☆ — مقبول</option><option value="1">★☆☆☆☆ — ضعيف</option></select><textarea id="v8ReviewComment" placeholder="اكتب رأيك (اختياري)"></textarea></div><p class="v8-muted">سيظهر التقييم بعد اعتماده من إدارة المتجر.</p><button id="v8ReviewSubmit" class="v8-primary-btn">إرسال التقييم</button></section>`;document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v8-backdrop').onclick=close;m.querySelector('.v8-close-form').onclick=close;document.getElementById('v8ReviewSubmit').onclick=async()=>{const name=document.getElementById('v8ReviewName').value.trim(),rating=Number(document.getElementById('v8ReviewRating').value),comment=document.getElementById('v8ReviewComment').value.trim();if(!name){state()?.showToast?.('اكتب الاسم أولاً');return;}const btn=document.getElementById('v8ReviewSubmit');btn.disabled=true;try{const r=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:p._id,name,rating,comment})});const d=await r.json();if(!r.ok)throw new Error(d.message);close();state()?.showToast?.(d.message||'تم إرسال التقييم');}catch(e){alert(e.message||'تعذر إرسال التقييم');}finally{btn.disabled=false;}};
  }
  function setupNotifyButton(p){const wa=document.getElementById('modalWhatsappBtn');if(!wa)return;wa.removeAttribute('href');wa.onclick=e=>{e.preventDefault();openStockNotify(p);};wa.innerHTML='<span class="material-symbols-outlined">notifications_active</span> بلغني عند التوفر';}
  function openStockNotify(p){
    document.getElementById('v8StockNotifyModal')?.remove();const m=document.createElement('div');m.id='v8StockNotifyModal';m.className='v8-overlay';m.innerHTML=`<div class="v8-backdrop"></div><section class="v8-sheet v8-form-sheet"><header><div><small>تنبيه عودة المخزون</small><h3>${esc(p.title)}</h3></div><button class="v8-close-form">×</button></header><div class="v8-checkout-grid"><input id="v8NotifyName" placeholder="الاسم (اختياري)"><input id="v8NotifyPhone" inputmode="tel" dir="ltr" placeholder="رقم الهاتف / واتساب"></div><p class="v8-muted">سيظهر طلب التنبيه للإدارة ويمكن إرسال إشعار واتساب لك عند توفر المنتج.</p><button id="v8NotifySubmit" class="v8-primary-btn">سجل طلب التنبيه</button></section>`;document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v8-backdrop').onclick=close;m.querySelector('.v8-close-form').onclick=close;document.getElementById('v8NotifySubmit').onclick=async()=>{const name=document.getElementById('v8NotifyName').value.trim(),phone=document.getElementById('v8NotifyPhone').value.trim();if(!phone){state()?.showToast?.('اكتب رقم الهاتف');return;}const btn=document.getElementById('v8NotifySubmit');btn.disabled=true;try{const r=await fetch('/api/stock-notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:p._id,name,phone})});const d=await r.json();if(!r.ok)throw new Error(d.message);close();state()?.showToast?.(d.message||'تم تسجيل التنبيه');}catch(e){alert(e.message||'تعذر تسجيل التنبيه');}finally{btn.disabled=false;}};
  }
  function bindImageViewer(p){const img=document.getElementById('modalImage');if(!img)return;img.style.cursor='zoom-in';img.onclick=()=>openImageViewer(collectImages(p),img.src);let x0=0;img.ontouchstart=e=>x0=e.changedTouches[0].clientX;img.ontouchend=e=>{const dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>50)cycleModalGallery(dx<0?1:-1,p);};}
  function collectImages(p){return [p.image,...(p.additionalImages||[]).map(x=>x.url),...(p.variants||[]).map(x=>x.image)].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i);}
  function cycleModalGallery(dir,p){const arr=collectImages(p),img=document.getElementById('modalImage');if(!img||!arr.length)return;let i=Math.max(0,arr.indexOf(img.src));i=(i+dir+arr.length)%arr.length;img.src=arr[i];}
  function openImageViewer(images,current){document.getElementById('v8ImageViewer')?.remove();let idx=Math.max(0,images.indexOf(current));const m=document.createElement('div');m.id='v8ImageViewer';m.className='v8-image-viewer';m.innerHTML=`<button class="close">×</button><button class="prev">‹</button><img><button class="next">›</button><span></span>`;document.body.appendChild(m);const render=()=>{m.querySelector('img').src=images[idx];m.querySelector('span').textContent=`${idx+1} / ${images.length}`;};render();m.querySelector('.close').onclick=()=>m.remove();m.querySelector('.prev').onclick=()=>{idx=(idx-1+images.length)%images.length;render();};m.querySelector('.next').onclick=()=>{idx=(idx+1)%images.length;render();};m.onclick=e=>{if(e.target===m)m.remove();};}

  function injectPrivacyNotice(){
    const s=settings(); const text=String(s.privacyNotice||'').trim(); if(!text || localStorage.getItem('tech_privacy_seen_v8')==='1')return;
    const bar=document.createElement('div');bar.className='v8-privacy-note';bar.innerHTML=`<span class="material-symbols-outlined">shield_lock</span><p>${esc(text)}</p><button type="button">فهمت</button>`;
    bar.querySelector('button').onclick=()=>{localStorage.setItem('tech_privacy_seen_v8','1');bar.remove();};document.body.appendChild(bar);
  }

  // ---------- UI hooks ----------
  function injectTrackingEntry(){
    if(document.getElementById('v8TrackHeaderBtn'))return;
    const mobileMenu=document.getElementById('mobileMenu'); if(mobileMenu){const b=document.createElement('button');b.id='v8TrackHeaderBtn';b.className='v8-menu-track';b.innerHTML='<span class="material-symbols-outlined">local_shipping</span> تتبع طلبك';b.onclick=()=>openOrderTracking();mobileMenu.appendChild(b);}
    const footer=document.querySelector('footer');if(footer&&!document.getElementById('v8FooterTrack')){const b=document.createElement('button');b.id='v8FooterTrack';b.className='v8-footer-track';b.innerHTML='<span class="material-symbols-outlined">local_shipping</span><span>تتبع طلبك</span>';b.onclick=()=>openOrderTracking();footer.prepend(b);}
  }
  function upgradeCheckoutButton(){const btn=document.querySelector('button[onclick="checkoutWhatsApp()"]');if(btn){btn.innerHTML='<span class="material-symbols-outlined">shopping_bag</span> تأكيد الطلب';btn.classList.add('v8-checkout-btn');}}
  function smoothImages(){document.querySelectorAll('img').forEach(img=>{if(!img.hasAttribute('decoding'))img.decoding='async';});}

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{ buildCheckoutForm(); upgradeCheckoutButton(); injectTrackingEntry(); smoothImages(); injectPrivacyNotice(); },80); setTimeout(()=>{refreshCheckoutConfig();injectPrivacyNotice();},1400);
    const mo=new MutationObserver(()=>smoothImages()); mo.observe(document.body,{childList:true,subtree:true}); setTimeout(()=>mo.disconnect(),12000);
  });
})();
