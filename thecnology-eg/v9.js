/* Technology Store V9 — conversion funnel, abandoned cart recovery, richer order care */
(() => {
  'use strict';
  const state = () => window.__techStoreState;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n)||0)} ج.م`;
  const statusLabels = {pending:'تم استلام الطلب',received_by_pos:'تم استلامه في النظام',processing:'جاري التجهيز',out_for_delivery:'خرج للتوصيل',completed:'تم التسليم',cancelled:'تم الإلغاء'};
  const returnLabels = {pending:'قيد المراجعة',approved:'تمت الموافقة',rejected:'مرفوض',received:'تم استلام المنتج',refunded:'تم رد المبلغ',replaced:'تم الاستبدال',closed:'مغلق'};

  function ensureIds(){
    let visitorId=localStorage.getItem('tech_store_vid');
    if(!visitorId){visitorId='vid_'+(window.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now());localStorage.setItem('tech_store_vid',visitorId);}
    let sessionId=sessionStorage.getItem('tech_store_session_id');
    if(!sessionId){sessionId='sid_'+(window.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now());sessionStorage.setItem('tech_store_session_id',sessionId);sessionStorage.setItem('tech_store_session_landing',location.pathname+location.search);}
    return {visitorId,sessionId};
  }
  function event(type, extra={}){
    try{
      const ids=ensureIds();
      const payload={...ids,type,path:location.pathname+location.search,...extra};
      fetch('/api/analytics/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
    }catch(_){ }
  }
  window.v9TrackEvent=event;

  let cartTimer=null;
  function cartItems(){return state()?.getCart?.()||[];}
  function syncCart(stage='cart'){
    clearTimeout(cartTimer);
    cartTimer=setTimeout(()=>{
      try{
        const ids=ensureIds();const items=cartItems().map(i=>({productId:i._id,title:i.title,variant:i.variantValue||'',quantity:Number(i.quantity)||1,price:Number(i.price)||0}));
        const customerName=document.getElementById('customerName')?.value.trim()||'';const phone=document.getElementById('customerPhone')?.value.trim()||'';
        fetch('/api/analytics/cart-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...ids,stage,customerName,phone,items}),keepalive:true}).catch(()=>{});
      }catch(_){ }
    },700);
  }
  window.v9SyncCart=syncCart;

  function wrapFunction(name, after){
    const original=window[name];if(typeof original!=='function'||original.__v9Wrapped)return;
    const wrapped=function(...args){const out=original.apply(this,args);try{after?.(args,out);}catch(_){}return out;};wrapped.__v9Wrapped=true;wrapped.__v9Original=original;window[name]=wrapped;
  }

  function bindCommerceTracking(){
    wrapFunction('openProductModal', ([id])=>{const p=(state()?.getProducts?.()||[]).find(x=>String(x._id)===String(id));event('product_view',{productId:id,productTitle:p?.title||''});});
    wrapFunction('addToCart', ([id])=>{const p=(state()?.getProducts?.()||[]).find(x=>String(x._id)===String(id));event('add_to_cart',{productId:id,productTitle:p?.title||'',value:Number(p?.price)||0});syncCart('cart');});
    wrapFunction('removeFromCart', ()=>{event('remove_from_cart');syncCart('cart');});
    wrapFunction('updateCartQuantity', ()=>syncCart('cart'));
    wrapFunction('openCartSidebar', ()=>{if(cartItems().length){event('checkout_started',{value:cartItems().reduce((a,i)=>a+(Number(i.price)||0)*(Number(i.quantity)||0),0)});syncCart('checkout');setTimeout(bindCheckoutFields,100);}});
  }

  let contactTracked=false;
  function bindCheckoutFields(){
    ['customerName','customerPhone','customerAddress','v8Governorate','v8Area'].forEach(id=>{
      const el=document.getElementById(id);if(!el||el.dataset.v9Bound==='1')return;el.dataset.v9Bound='1';el.addEventListener('input',()=>{const name=document.getElementById('customerName')?.value.trim()||'';const phone=document.getElementById('customerPhone')?.value.trim()||'';if(!contactTracked&&(name||phone)){contactTracked=true;event('checkout_contact');}syncCart(name||phone?'contact':'checkout');});el.addEventListener('change',()=>syncCart('checkout'));
    });
  }

  function printInvoice(order){
    const items=(order.items||[]).map(i=>`<tr><td>${esc(i.title)}${i.variant?`<small>${esc(i.variant)}</small>`:''}</td><td>${i.quantity}</td><td>${money(i.price)}</td><td>${money((Number(i.price)||0)*(Number(i.quantity)||0))}</td></tr>`).join('');
    const w=window.open('','_blank','noopener,noreferrer,width=900,height=900');if(!w)return;
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${esc(order.orderNumber)}</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:32px;color:#111}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:18px;margin-bottom:24px}h1{margin:0;font-size:26px}.muted{color:#666;font-size:12px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border-bottom:1px solid #ddd;padding:10px;text-align:right}td small{display:block;color:#666;margin-top:4px}.totals{margin-right:auto;width:min(360px,100%)}.totals div{display:flex;justify-content:space-between;padding:8px 0}.total{font-size:20px;font-weight:bold;border-top:2px solid #111}.badge{display:inline-block;padding:5px 10px;border-radius:20px;background:#eee}@media print{button{display:none}}</style></head><body><header><div><h1>TECHNOLOGY STORE</h1><div class="muted">فاتورة / ملخص طلب إلكتروني</div></div><div><b>${esc(order.orderNumber)}</b><br><span class="muted">${new Date(order.createdAt).toLocaleString('ar-EG')}</span></div></header><p><span class="badge">${esc(statusLabels[order.status]||order.status)}</span></p><table><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items}</tbody></table><div class="totals"><div><span>الشحن</span><b>${money(order.shippingAmount)}</b></div><div><span>الخصم</span><b>${money(order.discountAmount)}</b></div><div class="total"><span>الإجمالي</span><b>${money(order.total)}</b></div></div><p class="muted">هذه الفاتورة تم إنشاؤها من بيانات الطلب المسجلة في المتجر.</p><button onclick="print()">طباعة</button><script>setTimeout(()=>print(),350)<\/script></body></html>`);w.document.close();
  }

  function openReturnForm(order,phone){
    document.getElementById('v9ReturnModal')?.remove();
    const m=document.createElement('div');m.id='v9ReturnModal';m.className='v8-overlay';
    m.innerHTML=`<div class="v8-backdrop"></div><section class="v8-sheet v9-return-sheet"><header><div><small>خدمة ما بعد البيع</small><h3>طلب استبدال أو استرجاع</h3></div><button class="v9-close">×</button></header><div class="v9-return-order"><b>${esc(order.orderNumber)}</b><span>${money(order.total)}</span></div><div class="v8-checkout-grid"><select id="v9ReturnType"><option value="exchange">استبدال</option><option value="return">استرجاع</option></select><select id="v9ReturnReason"><option value="">اختر السبب</option><option>المنتج غير مطابق</option><option>مشكلة أو عيب في المنتج</option><option>تم استلام منتج مختلف</option><option>تغيير الرأي</option><option>سبب آخر</option></select><textarea id="v9ReturnDetails" placeholder="اكتب تفاصيل تساعدنا على مراجعة طلبك"></textarea></div><div class="v9-return-items"><strong>المنتجات</strong>${(order.items||[]).map((i,idx)=>`<label><input type="checkbox" value="${idx}" checked> <span>${esc(i.title)}${i.variant?` — ${esc(i.variant)}`:''}</span><small>x${i.quantity}</small></label>`).join('')}</div><button id="v9ReturnSubmit" class="v8-primary-btn">إرسال الطلب</button><p class="v8-muted">سيتم إنشاء رقم متابعة مستقل لطلب الاستبدال/الاسترجاع.</p></section>`;
    document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v8-backdrop').onclick=close;m.querySelector('.v9-close').onclick=close;
    document.getElementById('v9ReturnSubmit').onclick=async()=>{const type=document.getElementById('v9ReturnType').value,reason=document.getElementById('v9ReturnReason').value,details=document.getElementById('v9ReturnDetails').value.trim(),items=[...m.querySelectorAll('.v9-return-items input:checked')].map(x=>({index:Number(x.value)}));if(!reason){state()?.showToast?.('اختر سبب الطلب');return;}const btn=document.getElementById('v9ReturnSubmit');btn.disabled=true;try{event('return_started',{orderNumber:order.orderNumber});const r=await fetch('/api/returns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNumber:order.orderNumber,phone,type,reason,details,items})});const d=await r.json();if(!r.ok)throw new Error(d.message||'تعذر إرسال الطلب');m.querySelector('.v9-return-sheet').innerHTML=`<div class="v9-return-success"><span class="material-symbols-outlined">assignment_turned_in</span><h3>تم استلام طلبك</h3><p>رقم المتابعة</p><code>${esc(d.returnNumber)}</code><button class="v8-primary-btn" onclick="document.getElementById('v9ReturnModal')?.remove()">تم</button></div>`;}catch(e){alert(e.message);}finally{btn.disabled=false;}};
  }

  function openReturnTracking(){
    document.getElementById('v9ReturnTrack')?.remove();const m=document.createElement('div');m.id='v9ReturnTrack';m.className='v8-overlay';m.innerHTML=`<div class="v8-backdrop"></div><section class="v8-sheet v8-track-sheet"><header><div><small>خدمة ما بعد البيع</small><h3>تتبع استبدال / استرجاع</h3></div><button class="v9-close">×</button></header><div class="v8-checkout-grid"><input id="v9ReturnNumber" dir="ltr" placeholder="رقم RET-..."><input id="v9ReturnPhone" dir="ltr" placeholder="رقم الهاتف"></div><button id="v9ReturnTrackBtn" class="v8-primary-btn">عرض الحالة</button><div id="v9ReturnTrackResult"></div></section>`;document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v8-backdrop').onclick=close;m.querySelector('.v9-close').onclick=close;document.getElementById('v9ReturnTrackBtn').onclick=async()=>{const n=document.getElementById('v9ReturnNumber').value.trim(),p=document.getElementById('v9ReturnPhone').value.trim(),out=document.getElementById('v9ReturnTrackResult');if(!n||!p){out.innerHTML='<p class="v8-error">أدخل رقم الطلب والهاتف.</p>';return;}try{const r=await fetch(`/api/returns/track?returnNumber=${encodeURIComponent(n)}&phone=${encodeURIComponent(p)}`);const d=await r.json();if(!r.ok)throw new Error(d.message);out.innerHTML=`<div class="v8-track-card"><div class="v8-track-head"><strong>${esc(d.returnNumber)}</strong><b>${esc(d.type==='exchange'?'استبدال':'استرجاع')}</b></div><div class="v8-timeline">${(d.history||[]).map((h,i)=>`<div class="${i===(d.history||[]).length-1?'active':''}"><span></span><p><strong>${esc(returnLabels[h.status]||h.status)}</strong><small>${h.at?new Date(h.at).toLocaleString('ar-EG'):''}${h.note?` — ${esc(h.note)}`:''}</small></p></div>`).join('')}</div></div>`;}catch(e){out.innerHTML=`<p class="v8-error">${esc(e.message||'تعذر التتبع')}</p>`;}};
  }

  function installOrderTrackingV9(){
    window.openOrderTracking=function(orderNumber='',phone=''){
      document.getElementById('v8OrderTrack')?.remove();
      const m=document.createElement('div');m.id='v8OrderTrack';m.className='v8-overlay';m.innerHTML=`<div class="v8-backdrop"></div><section class="v8-sheet v8-track-sheet"><header><div><small>متابعة حالة الشحنة</small><h3>تتبع طلبك</h3></div><button class="v9-close">×</button></header><div class="v8-checkout-grid"><input id="v8TrackNumber" dir="ltr" placeholder="رقم الطلب" value="${esc(orderNumber)}"><input id="v8TrackPhone" dir="ltr" placeholder="رقم الهاتف" value="${esc(phone)}"></div><button id="v8TrackSubmit" class="v8-primary-btn">عرض حالة الطلب</button><button id="v9TrackReturn" class="v9-link-btn">لدي رقم استبدال/استرجاع</button><div id="v8TrackResult"></div></section>`;document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.v8-backdrop').onclick=close;m.querySelector('.v9-close').onclick=close;document.getElementById('v9TrackReturn').onclick=()=>{close();openReturnTracking();};
      document.getElementById('v8TrackSubmit').onclick=async()=>{const n=document.getElementById('v8TrackNumber').value.trim(),p=document.getElementById('v8TrackPhone').value.trim(),out=document.getElementById('v8TrackResult');if(!n||!p){out.innerHTML='<p class="v8-error">أدخل رقم الطلب والهاتف.</p>';return;}out.innerHTML='<p class="v8-muted">جاري التحميل...</p>';try{const r=await fetch(`/api/orders/track?orderNumber=${encodeURIComponent(n)}&phone=${encodeURIComponent(p)}`);const d=await r.json();if(!r.ok)throw new Error(d.message||'الطلب غير موجود');const hist=(d.statusHistory?.length?d.statusHistory:[{status:d.status,at:d.createdAt}]);out.innerHTML=`<div class="v8-track-card"><div class="v8-track-head"><strong>${esc(d.orderNumber)}</strong><b>${money(d.total)}</b></div>${(d.shippingCarrier||d.trackingNumber)?`<div class="v101-shipping-track"><div><small>شركة الشحن</small><strong>${esc(d.shippingCarrier||'—')}</strong></div><div><small>رقم التتبع</small><strong dir="ltr">${esc(d.trackingNumber||'—')}</strong></div>${d.estimatedDeliveryAt?`<div><small>التسليم المتوقع</small><strong>${new Date(d.estimatedDeliveryAt).toLocaleDateString('ar-EG')}</strong></div>`:''}${d.trackingUrl?`<a href="${esc(d.trackingUrl)}" target="_blank" rel="noopener">فتح رابط شركة الشحن</a>`:''}</div>`:''}<div class="v8-timeline">${hist.map((h,i)=>`<div class="${i===hist.length-1?'active':''}"><span></span><p><strong>${esc(statusLabels[h.status]||h.status)}</strong><small>${h.at?new Date(h.at).toLocaleString('ar-EG'):''}${h.note?` — ${esc(h.note)}`:''}</small></p></div>`).join('')}</div><div class="v9-order-care"><button id="v9PrintInvoice"><span class="material-symbols-outlined">print</span> فاتورة</button>${d.status!=='cancelled'?'<button id="v9StartReturn"><span class="material-symbols-outlined">assignment_return</span> استبدال / استرجاع</button>':''}</div></div>`;document.getElementById('v9PrintInvoice')?.addEventListener('click',()=>printInvoice(d));document.getElementById('v9StartReturn')?.addEventListener('click',()=>openReturnForm(d,p));}catch(err){out.innerHTML=`<p class="v8-error">${esc(err.message)}</p>`;}};
      if(orderNumber&&phone)setTimeout(()=>document.getElementById('v8TrackSubmit')?.click(),50);
    };
  }

  function bindShareAndWhatsApp(){
    document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const href=a.getAttribute('href')||'';if(/wa\.me|whatsapp/i.test(href))event('whatsapp_click');if(/facebook\.com\/sharer|t\.me\/share|share_source/i.test(href))event('share',{metadata:{href:href.slice(0,300)}});},{passive:true});
  }

  document.addEventListener('DOMContentLoaded',()=>{
    // V9 intentionally has no tracking/privacy popup. Tracking is first-party and non-intrusive.
    ensureIds();event('page_view');
    setTimeout(()=>{bindCommerceTracking();bindCheckoutFields();installOrderTrackingV9();syncCart('cart');},350);
    bindShareAndWhatsApp();
    const mo=new MutationObserver(()=>bindCheckoutFields());mo.observe(document.body,{childList:true,subtree:true});setTimeout(()=>mo.disconnect(),15000);
  });
})();
