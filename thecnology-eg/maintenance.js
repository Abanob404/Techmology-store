(() => {
'use strict';
const types = {computer:'كمبيوتر وتجميعات',laptop:'لابتوب',camera:'كاميرات مراقبة',network:'شبكات وراوترات',installation:'تركيب وإعداد',other:'مشكلة أخرى'};
const statuses = {new:'تم استلام الطلب',contacted:'تم التواصل مع العميل',inspecting:'جاري فحص المشكلة',waiting_parts:'بانتظار قطع الغيار',repairing:'جاري تنفيذ الصيانة',ready:'جاهز للاستلام',completed:'اكتملت الصيانة',cancelled:'تم إلغاء الطلب'};
const byId = id => document.getElementById(id);
const toggle = (el, yes) => { if (el) el.hidden = !yes; };
const cleanPhone = value => String(value || '').replace(/\D/g,'').slice(0,20);
const showError = (id, message) => { const el=byId(id); if (!el) return; el.textContent=message;toggle(el,!!message); };
const isValidPhone = value => /^[0-9]{10,15}$/.test(cleanPhone(value));
const fmt = value => {try{return new Date(value).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'});}catch(_){return ''}};
const fetchJson = async (url, opts) => {const res=await fetch(url, {...opts,cache:'no-store'});let data;try{data=await res.json();}catch(_){data={};}if(!res.ok)throw new Error(data.message || 'تعذر الاتصال بالخادم');return data;};
document.addEventListener('DOMContentLoaded', () => {
  const form=byId('maintenanceForm'); const trackForm=byId('maintenanceTrackForm');
  document.querySelectorAll('[data-service-choice]').forEach(btn=>btn.addEventListener('click',()=>{
    byId('maintServiceType').value=btn.dataset.serviceChoice;
    form.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    setTimeout(()=>byId('maintServiceType').focus({preventScroll:true}),250);
  }));
  form?.addEventListener('submit',async ev=>{
    ev.preventDefault();showError('maintenanceFormError','');
    const data=Object.fromEntries(new FormData(form).entries());
    if(!isValidPhone(data.customerPhone)){showError('maintenanceFormError','تأكد من كتابة رقم هاتف صحيح من 10 إلى 15 رقمًا.');return;}
    const submit=byId('maintenanceSubmit');submit.disabled=true;submit.textContent='جاري تسجيل الطلب...';
    try{
      const result=await fetchJson('/api/maintenance/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      toggle(form,false);toggle(byId('maintenanceSuccess'),true);
      byId('maintenanceTicketNumber').textContent=result.ticketNumber;
      byId('maintTrackNumber').value=result.ticketNumber;byId('maintTrackPhone').value=data.customerPhone;
      byId('maintenanceSuccessText').textContent=result.message;
      const message=`مرحباً، تم تسجيل طلب صيانة رقم ${result.ticketNumber} باسم ${data.customerName}. أريد الاستفسار عن الخطوة التالية.`;
      byId('maintenanceWhatsApp').href='https://wa.me/201515664919?text='+encodeURIComponent(message);
      byId('maintenanceSuccess').scrollIntoView({behavior:'smooth',block:'center'});
    }catch(err){showError('maintenanceFormError',err.message);}
    finally{submit.disabled=false;submit.textContent='تسجيل طلب الصيانة ←';}
  });
  byId('copyMaintenanceTicket')?.addEventListener('click',async()=>{
    const ticket=byId('maintenanceTicketNumber').textContent;
    try{await navigator.clipboard.writeText(ticket);byId('copyMaintenanceTicket').textContent='تم النسخ ✓';}
    catch(_){window.prompt('انسخ رقم المتابعة:',ticket);}
  });
  byId('anotherMaintenanceRequest')?.addEventListener('click',()=>{
    form.reset();toggle(byId('maintenanceSuccess'),false);toggle(form,true);form.querySelector('input')?.focus();
  });
  trackForm?.addEventListener('submit',async ev=>{
    ev.preventDefault();const resultBox=byId('maintenanceTrackResult');const btn=byId('maintTrackSubmit');
    const ticket=byId('maintTrackNumber').value.trim().toUpperCase();const phone=cleanPhone(byId('maintTrackPhone').value);
    if(!isValidPhone(phone)){resultBox.textContent='راجع رقم الهاتف المسجل مع الطلب.';toggle(resultBox,true);return;}
    btn.disabled=true;btn.textContent='جاري البحث...';resultBox.textContent='';toggle(resultBox,false);
    try{
      const data=await fetchJson('/api/maintenance/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket,phone})});
      const h=document.createElement('strong');h.textContent=statuses[data.status]||data.status;
      const detail=document.createElement('p');detail.textContent=`طلب ${data.ticketNumber} — ${types[data.serviceType] || 'صيانة'} — تاريخ التقديم ${fmt(data.createdAt)}`;
      resultBox.append(h,detail);
      const history=(Array.isArray(data.statusHistory)?data.statusHistory:[]).slice().reverse().slice(0,8);
      const ol=document.createElement('ol');ol.className='tech-maint-track-history';
      history.forEach(item=>{const li=document.createElement('li');li.textContent=`${statuses[item.status]||item.status} — ${fmt(item.at)}`;ol.appendChild(li)});
      resultBox.appendChild(ol);toggle(resultBox,true);
    }catch(err){resultBox.textContent=err.message;toggle(resultBox,true);}
    finally{btn.disabled=false;btn.textContent='عرض حالة الطلب';}
  });
});
})();
