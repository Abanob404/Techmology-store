/* Technology Store V10.8 — storefront-aligned service catalogue, quotations and ticket tracking. */
(() => {
'use strict';
const byId = id => document.getElementById(id);
const statuses = {new:'تم استلام الطلب',contacted:'تم التواصل مع العميل',inspecting:'جاري فحص المشكلة',waiting_parts:'بانتظار قطع الغيار',repairing:'جاري تنفيذ الصيانة',ready:'جاهز للاستلام',completed:'اكتملت الصيانة',cancelled:'تم إلغاء الطلب'};
let catalog = { categories: [], services: [] };
const toggle = (node, show) => {if(node)node.hidden=!show;};
const cleanPhone = x => String(x||'').replace(/\D/g,'').slice(0,20);
const validPhone = x => /^[0-9]{10,15}$/.test(cleanPhone(x));
const showError = (id,msg) => {const node=byId(id);if(node){node.textContent=msg;toggle(node,!!msg);}};
const date = val => {try{return new Date(val).toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'});}catch(_){return '—'}};
async function api(url,opts={}){const r=await fetch(url,{...opts,cache:'no-store'});let data={};try{data=await r.json()}catch(_){}if(!r.ok)throw new Error(data.message||'تعذر الاتصال بالخادم');return data;}
const visibleCategories = () => catalog.categories.filter(c=>c.enabled);
const categoryName = id => catalog.categories.find(c=>c.id===id)?.title||'صيانة';
const currentServices = categoryId => catalog.services.filter(s=>s.enabled&&s.categoryId===categoryId&&catalog.categories.some(c=>c.id===s.categoryId&&c.enabled));
const priceLabel = service => catalog.showPrices===false ? 'اطلب لمعرفة السعر' : service.priceType==='quote' ? 'السعر بعد الفحص' : `${service.priceType==='from'?'يبدأ من ':''}${Number(service.price||0).toLocaleString('ar-EG')} ج.م — استرشادي`;
function selectCategory(id,{scroll=false}={}){
  const select=byId('maintServiceType');
  if(!visibleCategories().some(c=>c.id===id))return;
  select.value=id;
  refreshServiceSelect();
  renderCategories();renderServiceCards();
  if(scroll){const section=byId('techMaintServiceBrowser');section?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
}
function selectService(categoryId,id){
  if(!currentServices(categoryId).some(s=>s.id===id))return;
  selectCategory(categoryId);
  byId('maintServiceId').value=id;
  refreshPrice();renderServiceCards();
  byId('request')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  byId('maintCustomerName')?.focus({preventScroll:true});
}
function renderCategories(){
  const host=byId('techMaintCategories');host.replaceChildren();
  const active=byId('maintServiceType').value;
  visibleCategories().forEach(c=>{
    const btn=document.createElement('button');btn.type='button';btn.dataset.serviceChoice=c.id;
    btn.classList.toggle('is-selected',c.id===active);btn.setAttribute('aria-pressed',String(c.id===active));
    const icon=document.createElement('span');icon.className='tech-maint-type-icon';icon.textContent=c.icon||'🔧';
    const name=document.createElement('strong');name.textContent=c.title;
    const note=document.createElement('small');note.textContent=c.description||'اختار الخدمة المتاحة';
    btn.append(icon,name,note);btn.addEventListener('click',()=>selectCategory(c.id,{scroll:true}));host.appendChild(btn);
  });
}
function refreshServiceSelect(){
  const select=byId('maintServiceId');const previous=select.value;
  select.replaceChildren(new Option('اختار خدمة أو اكتب المشكلة بنفسك',''));
  currentServices(byId('maintServiceType').value).forEach(s=>select.add(new Option(s.title,s.id)));
  if(currentServices(byId('maintServiceType').value).some(s=>s.id===previous))select.value=previous;
  else select.value='';
  refreshPrice();
}
function renderServiceCards(){
  const id=byId('maintServiceType').value;
  byId('techMaintSelectedCategory').textContent=categoryName(id);
  const services=currentServices(id);const host=byId('techMaintServices');host.replaceChildren();
  if(!services.length){const p=document.createElement('p');p.textContent='ممكن توصف المشكلة في نموذج الطلب، وهنساعدك تحدد الخدمة المناسبة.';host.append(p);return;}
  services.forEach(s=>{
    const btn=document.createElement('button');btn.type='button';btn.className='tech-maint-service-option';
    btn.classList.toggle('is-selected',byId('maintServiceId').value===s.id);
    const title=document.createElement('strong');title.textContent=s.title;
    const desc=document.createElement('small');desc.textContent=s.description||'التفاصيل بتتحدد عند التواصل';
    const price=document.createElement('em');price.textContent=priceLabel(s);
    btn.append(title,desc,price);btn.addEventListener('click',()=>selectService(id,s.id));host.appendChild(btn);
  });
}
function refreshPrice(){
  const s=currentServices(byId('maintServiceType').value).find(x=>x.id===byId('maintServiceId').value);
  byId('maintSelectedPrice').textContent=s?`${s.title} — ${priceLabel(s)}. السعر النهائي والموعد بعد التواصل والتأكيد.`:'اختار خدمة علشان تشوف تفاصيلها والسعر الاسترشادي.';
  byId('maintProblemHint').textContent=s?'اختياري — اكتب تفاصيل إضافية زي أسماء البرامج أو نوع المشكلة':'لو مختارتش خدمة محددة، اكتب وصف المشكلة (10 حروف على الأقل)';
}
async function loadCatalog(){
  const data=await api('/api/maintenance/catalog');
  if(!Array.isArray(data.categories)||!Array.isArray(data.services))throw new Error('بيانات الخدمات غير مكتملة');
  catalog=data;
  byId('maintHeroTitle').textContent=data.heroTitle||'جهازك محتاج صيانة؟ إحنا معاك.';
  byId('maintHeroDescription').textContent=data.heroDescription||'';
  byId('types-title').textContent=data.sectionTitle||'بنساعدك في إيه؟';
  byId('maintSectionDescription').textContent=data.sectionDescription||'';
  byId('techMaintPrimaryCta').textContent=data.primaryCta||'اطلب صيانة الآن';
  byId('techMaintSecondaryCta').textContent=data.secondaryCta||'متابعة طلب سابق';
  byId('form-heading').textContent=data.requestTitle||'سجّل طلب صيانة';
  byId('techMaintRequestDescription').textContent=data.requestDescription||'';
  byId('techMaintTrackTitle').textContent=data.trackTitle||'تابع حالة الصيانة';
  byId('techMaintTrackDescription').textContent=data.trackDescription||'';
  byId('techMaintFooterTagline').textContent=data.footerTagline||'';
  toggle(byId('techMaintHeroVisual'),data.showHeroVisual!==false);
  document.querySelector('.tech-maint-hero')?.classList.toggle('tech-maint-hero--no-visual',data.showHeroVisual===false);
  byId('techMaintPriceNotice').textContent=data.showPrices!==false?'الأسعار المعروضة استرشادية ويتم تأكيدها قبل التنفيذ':'التكلفة تُحدد بعد التواصل والفحص';
  const highlights=byId('techMaintHighlights');highlights.replaceChildren();
  (Array.isArray(data.highlights)?data.highlights:[]).forEach(t=>{const span=document.createElement('span');span.textContent='✓ '+t;highlights.append(span);});
  const steps=byId('techMaintProcessSteps');steps.replaceChildren();
  (Array.isArray(data.processSteps)?data.processSteps:[]).forEach(t=>{const li=document.createElement('li');li.textContent=t;steps.append(li);});
  const selector=byId('maintServiceType');selector.replaceChildren(new Option('اختار قسم الصيانة',''));
  visibleCategories().forEach(c=>selector.add(new Option(c.title,c.id)));
  if(visibleCategories().length)selectCategory(visibleCategories()[0].id);
  else showError('techMaintCatalogError','لا توجد أقسام صيانة متاحة حاليًا. تواصل معنا على واتساب.');
}
function init(){
  loadCatalog().catch(err=>showError('techMaintCatalogError',`${err.message}. حاول تحديث الصفحة قبل تسجيل الطلب.`));
  byId('maintServiceType')?.addEventListener('change',()=>{refreshServiceSelect();renderCategories();renderServiceCards();});
  byId('maintServiceId')?.addEventListener('change',()=>{refreshPrice();renderServiceCards();});
  const form=byId('maintenanceForm');
  form?.addEventListener('submit',async event=>{
    event.preventDefault();showError('maintenanceFormError','');
    const data=Object.fromEntries(new FormData(form).entries());
    if(!visibleCategories().some(c=>c.id===data.serviceType)){showError('maintenanceFormError','اختار قسم الصيانة أولًا.');return;}
    if(!validPhone(data.customerPhone)){showError('maintenanceFormError','اكتب رقم هاتف صحيح من 10 إلى 15 رقمًا.');return;}
    if(!data.serviceId&&String(data.problem||'').trim().length<10){showError('maintenanceFormError','اختار خدمة محددة، أو اكتب وصف المشكلة في 10 حروف على الأقل.');return;}
    const submit=byId('maintenanceSubmit');submit.disabled=true;submit.textContent='جاري تسجيل الطلب...';
    try{
      const response=await api('/api/maintenance/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      toggle(form,false);toggle(byId('maintenanceSuccess'),true);
      byId('maintenanceTicketNumber').textContent=response.ticketNumber;
      byId('maintTrackNumber').value=response.ticketNumber;byId('maintTrackPhone').value=data.customerPhone;
      byId('maintenanceSuccessText').textContent=response.message||'هنراجع التفاصيل ونتواصل معاك.';
      const service=catalog.services.find(s=>s.id===data.serviceId)?.title||categoryName(data.serviceType);
      byId('maintenanceWhatsApp').href='https://wa.me/201515664919?text='+encodeURIComponent(`مرحبًا، سجلت طلب صيانة رقم ${response.ticketNumber}، الخدمة: ${service}. أريد متابعة التفاصيل.`);
      byId('maintenanceSuccess').scrollIntoView({behavior:'smooth',block:'center'});
    }catch(err){showError('maintenanceFormError',err.message);}finally{submit.disabled=false;submit.textContent='تسجيل طلب الصيانة ←';}
  });
  byId('copyMaintenanceTicket')?.addEventListener('click',async()=>{
    const ticket=byId('maintenanceTicketNumber').textContent;
    try{await navigator.clipboard.writeText(ticket);byId('copyMaintenanceTicket').textContent='تم النسخ ✓';}
    catch(_){window.prompt('انسخ رقم المتابعة:',ticket);}
  });
  byId('anotherMaintenanceRequest')?.addEventListener('click',()=>{
    form.reset();toggle(form,true);toggle(byId('maintenanceSuccess'),false);refreshServiceSelect();renderCategories();renderServiceCards();form.querySelector('input')?.focus();
  });
  byId('maintenanceTrackForm')?.addEventListener('submit',async event=>{
    event.preventDefault();const result=byId('maintenanceTrackResult'),btn=byId('maintTrackSubmit');
    const ticket=byId('maintTrackNumber').value.trim().toUpperCase(),phone=cleanPhone(byId('maintTrackPhone').value);
    if(!validPhone(phone)){result.textContent='راجع رقم الهاتف المسجل مع الطلب.';toggle(result,true);return;}
    btn.disabled=true;btn.textContent='جاري البحث...';result.replaceChildren();toggle(result,false);
    try{
      const data=await api('/api/maintenance/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket,phone})});
      const h=document.createElement('strong');h.textContent=statuses[data.status]||data.status;
      const detail=document.createElement('p');detail.textContent=`طلب ${data.ticketNumber} — ${data.serviceTitle||categoryName(data.serviceType)} — ${date(data.createdAt)}`;
      const timeline=document.createElement('ol');timeline.className='tech-maint-track-history';
      (Array.isArray(data.statusHistory)?data.statusHistory:[]).slice(-8).reverse().forEach(row=>{
        const item=document.createElement('li');item.textContent=`${statuses[row.status]||row.status} — ${date(row.at)}`;timeline.appendChild(item);
      });
      result.append(h,detail,timeline);toggle(result,true);
    }catch(err){result.textContent=err.message;toggle(result,true);}finally{btn.disabled=false;btn.textContent='عرض حالة الطلب';}
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
