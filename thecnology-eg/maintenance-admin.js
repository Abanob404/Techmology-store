/* Technology Store — maintenance tickets administration. Requires manage_orders. */
(() => {
'use strict';
const statuses = {new:'طلب جديد',contacted:'تم التواصل',inspecting:'جاري الفحص',waiting_parts:'بانتظار قطع غيار',repairing:'جاري الصيانة',ready:'جاهز للاستلام',completed:'مكتمل',cancelled:'ملغي'};
const types={computer:'كمبيوتر وتجميعات',laptop:'لابتوب',camera:'كاميرات مراقبة',network:'شبكات وراوترات',installation:'تركيب وإعداد',other:'مشكلة أخرى'};
const $=id=>document.getElementById(id);
const esc = val=>String(val??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const date = v => {try{return new Date(v).toLocaleString('ar-EG',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}catch(_){return '—';}};
let page=1;let timeout=null;let lastSeq=0;let loadedOnce=false;
function allowed(){return typeof window.hasPermission==='function'?window.hasPermission('manage_orders'):!!(JSON.parse(sessionStorage.getItem('tech_current_user')||'null')?.permissions||[]).some(x=>x==='manage_orders'||x==='all');}
const api=async(url,opt)=>{const fn=window.adminFetch||window.fetch.bind(window);const res=await fn(url,{...opt,cache:'no-store'});let data={};try{data=await res.json()}catch(_){}if(!res.ok)throw new Error(data.message||'تعذر تنفيذ الطلب');return data;};
function card(item){
 const st=statuses[item.status]||item.status;
 const options=Object.entries(statuses).map(([key,label])=>`<option value="${key}" ${item.status===key?'selected':''}>${label}</option>`).join('');
 return `<article class="tech-srv-card" data-ticket="${esc(item._id)}"><div class="tech-srv-card-head"><div><strong dir="ltr">${esc(item.ticketNumber)}</strong><small>${esc(date(item.createdAt))} · ${esc(types[item.serviceType]||item.serviceType)}</small></div><span class="tech-srv-pill ${item.status==='completed'?'tech-srv-pill--completed':item.status==='cancelled'?'tech-srv-pill--cancelled':''}">${esc(st)}</span></div>
  <div class="tech-srv-card-main"><div><span>اسم العميل</span><strong>${esc(item.customerName)}</strong></div><div><span>الهاتف</span><a href="tel:${esc(item.customerPhone)}" dir="ltr">${esc(item.customerPhone)}</a></div><div><span>الجهاز</span><strong>${esc(item.device||'غير محدد')}</strong></div><div><span>المنطقة</span><strong>${esc(item.area||'غير محددة')}</strong></div></div>
  <div class="tech-srv-card-actions"><button type="button" class="tech-srv-toggle" aria-expanded="false">عرض التفاصيل وتحديث الحالة</button><div class="tech-srv-card-status"><label class="sr-only" for="srvStatus-${esc(item._id)}">حالة الطلب</label><select id="srvStatus-${esc(item._id)}" class="tech-srv-status">${options}</select></div></div>
  <div class="tech-srv-card-detail" hidden><div><strong>وصف المشكلة</strong><p>${esc(item.problem)}</p></div><div><strong>طريقة التواصل</strong><p>${item.preferredContact==='phone'?'مكالمة هاتفية':'واتساب'}</p></div><label>ملاحظات داخلية — لا تظهر للعميل<textarea class="tech-srv-note" maxlength="1200" placeholder="الفحص أو التواصل أو قطع الغيار المطلوبة...">${esc(item.internalNote||'')}</textarea></label><div><button type="button" class="tech-srv-save">حفظ الحالة والملاحظات</button><span class="tech-srv-error" role="alert"></span></div></div></article>`;
}
async function refreshSummary(){
 if(!allowed())return;
 try{
  const data=await api('/api/admin/maintenance/summary');
  if($('techSrvOpenCount'))$('techSrvOpenCount').textContent=String(data.openCount||0);
  const badge=$('techSrvBadge');if(badge){badge.textContent=data.newCount||'';badge.hidden=!(data.newCount>0);}
  const grid=$('dashOrdersToday')?.closest('.grid');
  if(grid&&!$('techSrvDashboardKpi')){
    const box=document.createElement('button');box.type='button';box.id='techSrvDashboardKpi';
    box.className='glass-panel p-4 rounded-xl border border-outline-variant/30 text-right w-full';
    box.innerHTML='<span class="text-xs text-on-surface-variant">طلبات صيانة تحت المتابعة</span><strong class="block text-2xl font-bold text-primary mt-2" id="techSrvDashboardCount">—</strong><span class="block text-xs text-on-surface-variant mt-2">عرض جميع طلبات الصيانة ←</span>';
    box.addEventListener('click',()=>window.switchTab?.('maintenance'));
    grid.appendChild(box);
  }
  if($('techSrvDashboardCount'))$('techSrvDashboardCount').textContent=String(data.openCount||0);
 }catch(_){/* Do not interrupt existing admin dashboard if maintenance service is unavailable. */}
}
async function load(){
 if(!allowed())return;
 const seq=++lastSeq;
 const host=$('techSrvTickets'), pagination=$('techSrvPagination');if(!host)return;
 host.innerHTML='<div class="tech-srv-empty">جاري تحميل طلبات الصيانة...</div>';
 const args=new URLSearchParams({page:String(page)});
 const status=$('techSrvStatusFilter')?.value||'';const search=$('techSrvSearch')?.value.trim()||'';
 if(status)args.set('status',status);if(search)args.set('search',search);
 try{
  const data=await api('/api/admin/maintenance?'+args.toString());if(seq!==lastSeq)return;
  $('techSrvOpenCount').textContent=String(data.openCount||0);
  const badge=$('techSrvBadge');if(badge){badge.textContent=data.openCount||'';badge.hidden=!(data.openCount>0);}
  host.innerHTML=data.items?.length?data.items.map(card).join(''):'<div class="tech-srv-empty">لا توجد طلبات صيانة مطابقة.</div>';
  pagination.innerHTML=`<button type="button" data-page-action="prev" ${page<=1?'disabled':''}>السابق</button><strong>صفحة ${page} من ${data.pages||1} — ${data.total||0} طلب</strong><button type="button" data-page-action="next" ${page>=data.pages?'disabled':''}>التالي</button>`;
  pagination.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{page=Math.max(1,page+(btn.dataset.pageAction==='next'?1:-1));load()}));
  host.querySelectorAll('.tech-srv-card').forEach(el=>{
    const toggle=el.querySelector('.tech-srv-toggle');toggle.addEventListener('click',()=>{const detail=el.querySelector('.tech-srv-card-detail');detail.hidden=!detail.hidden;toggle.setAttribute('aria-expanded',String(!detail.hidden));toggle.textContent=detail.hidden?'عرض التفاصيل وتحديث الحالة':'إخفاء التفاصيل';});
    el.querySelector('.tech-srv-save').addEventListener('click',()=>save(el));
    el.querySelector('.tech-srv-status').addEventListener('change',()=>{el.querySelector('.tech-srv-card-detail').hidden=false;toggle.setAttribute('aria-expanded','true');toggle.textContent='إخفاء التفاصيل';});
  });
 }catch(err){if(seq===lastSeq){host.innerHTML='<div class="tech-srv-empty">تعذر تحميل طلبات الصيانة. حاول تحديث القائمة.</div>';$('techSrvError').textContent=err.message;}}
}
async function save(el){
 if(!allowed())return;
 const status=el.querySelector('.tech-srv-status').value,internalNote=el.querySelector('.tech-srv-note').value;
 const id=el.dataset.ticket,btn=el.querySelector('.tech-srv-save'),msg=el.querySelector('.tech-srv-error');
 btn.disabled=true;btn.textContent='جاري الحفظ...';msg.textContent='';
 try{await api('/api/admin/maintenance/'+encodeURIComponent(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,internalNote})});await load();}
 catch(err){msg.textContent=err.message;btn.disabled=false;btn.textContent='حفظ الحالة والملاحظات';}
}
function boot(){
 const tab=$('tab-maintenance');if(!tab)return;
 const prior=window.switchTab;
 if(typeof prior==='function')window.switchTab=function(name,...args){const r=prior(name,...args);if(allowed())tab.style.display='flex';else tab.style.display='none';if(name==='maintenance'){if(!allowed())return r;load();}if(name==='dashboard'&&allowed())refreshSummary();return r;};
 tab.style.display=allowed()?'flex':'none';
 $('techSrvRefresh').addEventListener('click',()=>{page=1;load()});
 $('techSrvStatusFilter').addEventListener('change',()=>{page=1;load()});
 $('techSrvSearch').addEventListener('input',()=>{clearTimeout(timeout);timeout=setTimeout(()=>{page=1;load()},350)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
