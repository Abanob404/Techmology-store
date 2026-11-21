/* Technology Store V10.6 — custom lightweight dashboard (zero chart dependencies). */
(() => {
  'use strict';
  const fmt = n => new Intl.NumberFormat('ar-EG',{maximumFractionDigits:0}).format(Number(n)||0);
  const money=n=>fmt(n)+' ج.م';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let days=7,request=0,loaded=false;
  function build(){
    const host=document.querySelector('#panel-dashboard > .flex');if(!host||document.getElementById('techInsightPanel'))return;
    const section=document.createElement('section');section.id='techInsightPanel';section.className='tech-insight';
    section.innerHTML=`<header class="tech-insight-header"><div><span class="tech-eyebrow">TECHNOLOGY / SALES INTELLIGENCE</span><h3>مركز متابعة المبيعات</h3><p>المبيعات دي تخص طلبات الموقع اللي تم إصدار فاتورة لها في Technology POS، وطلبات الموقع غير المؤكدة ظاهرة لوحدها.</p></div><div class="tech-insight-tabs" role="group" aria-label="الفترة"><button data-days="7" class="active" type="button">7 أيام</button><button data-days="14" type="button">14 يوم</button><button data-days="30" type="button">30 يوم</button></div></header>
    <div class="tech-insight-metrics"><article><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/><circle cx="12" cy="14" r="2"/></svg><small>مبيعات الموقع المؤكدة في POS</small><strong id="techInsightSales">—</strong></article><article><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2H4Z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg><small>طلبات بفواتير POS</small><strong id="techInsightInvoices">—</strong></article><article><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16l-1 13H5L4 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg><small>طلبات الموقع</small><strong id="techInsightRequests">—</strong></article><article><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18V9l5 4 4-8 4 7 5-3"/><path d="M3 21h18"/></svg><small>متوسط الفاتورة</small><strong id="techInsightAverage">—</strong></article></div>
    <div class="tech-insight-columns"><div class="tech-insight-card"><div class="tech-insight-card-top"><div><h4>اتجاه المبيعات</h4><small>قيمة طلبات الموقع المؤكدة بالفواتير يوميًا</small></div><span class="tech-insight-pill">EGP</span></div><div id="techInsightChart" class="tech-insight-chart" role="img" aria-label="رسم المبيعات اليومية"><div class="tech-insight-loading">جاري تحميل الرسم...</div></div></div><div class="tech-insight-card"><div class="tech-insight-card-top"><div><h4>أكثر المنتجات بيعًا</h4><small>حسب عدد القطع في فواتير POS</small></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="m8 12-2 10 6-3 6 3-2-10"/></svg></div><div id="techInsightTop" class="tech-insight-top">جاري تحميل المنتجات...</div></div></div>
    <div class="tech-insight-actions"><button type="button" data-go="products"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M9 13h6"/></svg> إدارة المنتجات</button><button type="button" data-go="orders"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2H4Z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg> متابعة الطلبات</button><button type="button" data-go="analytics"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20V5M3 20h18"/><path d="m6 16 4-4 3 2 6-8"/></svg> التحليلات</button><span id="techInsightStatus" role="status"></span></div>`;
    // Keep dashboard summary above recent orders, but after the introductory heading.
    host.children[0]?.after(section);
    section.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{
      days=Number(b.dataset.days);section.querySelectorAll('[data-days]').forEach(x=>x.classList.toggle('active',x===b));load();
    }));
    section.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>window.switchTab?.(b.dataset.go)));
  }
  function lineChart(series){
    const el=document.getElementById('techInsightChart');if(!el)return;
    const values=series.map(d=>Math.max(0,Number(d.confirmedRevenue)||0));
    const max=Math.max(1,...values),width=700,height=230,pad=28;
    if(!values.some(v=>v>0)) {
      el.innerHTML='<div class="tech-insight-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20V5M3 20h18"/><path d="M6 15l5-6 4 3 4-7"/></svg><strong>لا توجد فواتير POS مؤكدة خلال الفترة</strong><small>عند تسجيل مبيعات فعلية سيظهر الاتجاه هنا.</small></div>';return;
    }
    const xp=i=>pad+(width-2*pad)*(i/Math.max(1,values.length-1));
    const yp=v=>height-pad-(height-2*pad)*v/max;
    const pts=values.map((v,i)=>[xp(i),yp(v)]);
    const poly=pts.map(p=>p.join(',')).join(' ');
    const area=`M ${pts[0][0]} ${height-pad} L ${pts.map(p=>p.join(' ')).join(' L ')} L ${pts.at(-1)[0]} ${height-pad} Z`;
    const ids=['techLineGradient','techFillGradient'];
    el.innerHTML=`<svg class="tech-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${ids[0]}" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#1298d3"/><stop offset="1" stop-color="#1dcb9d"/></linearGradient><linearGradient id="${ids[1]}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#219fe0" stop-opacity=".34"/><stop offset="1" stop-color="#219fe0" stop-opacity="0"/></linearGradient></defs>${[.25,.5,.75,1].map(f=>`<line x1="${pad}" x2="${width-pad}" y1="${yp(max*f)}" y2="${yp(max*f)}" stroke="currentColor" opacity=".10" stroke-dasharray="4 7"/>`).join('')}<path d="${area}" fill="url(#${ids[1]})"/><polyline points="${poly}" fill="none" stroke="url(#${ids[0]})" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="tech-chart-line"/>${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#1699cf"><title>${esc(series[i].date)}: ${money(values[i])}</title></circle>`).join('')}</svg><div class="tech-chart-labels"><span>${esc(series[0]?.date||'')}</span><span>${esc(series[Math.floor(series.length/2)]?.date||'')}</span><span>${esc(series.at(-1)?.date||'')}</span></div>`;
  }
  async function load(){
    if(!document.getElementById('techInsightPanel'))return;
    const call=++request;
    const status=document.getElementById('techInsightStatus');if(status)status.textContent='جاري تحديث المؤشرات...';
    try {
      const res=await window.adminFetch(`/api/admin/dashboard/insights?days=${days}`,{cache:'no-store'});
      if(!res.ok)throw new Error(res.status===401?'يجب تسجيل الدخول مجددًا':'تعذر تحميل البيانات');
      const data=await res.json();if(call!==request)return;
      document.getElementById('techInsightSales').textContent=money(data.summary?.posRevenue);
      document.getElementById('techInsightInvoices').textContent=fmt(data.summary?.posInvoices);
      document.getElementById('techInsightRequests').textContent=fmt(data.summary?.requests);
      document.getElementById('techInsightAverage').textContent=money(data.summary?.averageInvoice);
      lineChart(data.period||[]);
      const top=document.getElementById('techInsightTop');
      top.innerHTML=(data.topProducts||[]).length?data.topProducts.map((p,i)=>`<div class="tech-insight-product"><span class="tech-product-rank">${i+1}</span><div><strong>${esc(p.title)}</strong><small>${fmt(p.quantity)} قطعة · ${money(p.revenue)}</small></div></div>`).join(''):'<div class="tech-insight-empty"><strong>لا توجد منتجات مباعة خلال الفترة</strong></div>';
      status.textContent='آخر تحديث: '+new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});loaded=true;
    }catch(e){if(call!==request)return;status.textContent=e.message; if(!loaded)document.getElementById('techInsightChart').textContent='تعذر تحميل الرسم، جرّب تحديث الصفحة.';}
  }
  function boot(){build(); const original=window.loadDashboard;
    if(typeof original==='function'&&!original.__techInsights){
      const wrapped=async function(){const r=await original.apply(this,arguments);if(document.getElementById('panel-dashboard')&&!document.getElementById('panel-dashboard').classList.contains('hidden'))load();return r;};
      wrapped.__techInsights=true;window.loadDashboard=wrapped;
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
