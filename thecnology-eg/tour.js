/* Technology Store customer onboarding. No order, cart or analytics mutation. */
(() => {
'use strict';
const VERSION='tech_guided_tour_v1';
const IN_PROGRESS='tech_tour_continue';
const homeSteps=[
 {title:'أهلًا بك في Technology Store 👋',text:'هنوريك في جولة قصيرة مكان المنتجات، البحث، السلة، وإزاي تسجّل طلب شراء بأمان. الجولة شرح فقط — مش هتضيف منتجات أو تبعت طلبات.'},
 {target:'.home-hero-actions a[href="/products"]',title:'ابدأ بتصفح المنتجات',text:'من الزر ده تقدر تفتح الكتالوج كامل، وتشوف الأسعار والصور والعروض الحقيقية.'},
 {target:'.home-feature-grid',title:'اختار القسم المناسب',text:'الأقسام بتساعدك توصل بسرعة لكاميرات المراقبة، الشبكات، وأجهزة الكمبيوتر. ومركز الصيانة موجود في قائمة الموقع.'},
 {title:'جاهز تشوف إزاي تشتري؟',text:'هننقلك لصفحة المنتجات ونكمل الجولة هناك: البحث، الفلاتر، إضافة للسلة، وتأكيد الطلب.',nextRoute:'/products'}
];
const productSteps=[
 {target:'#searchInput',fallback:'#main-content',title:'دور على اللي محتاجه',text:'اكتب اسم المنتج أو الموديل في البحث. على الموبايل هتلاقي البحث في شريط الكتالوج أو قائمة الموقع.'},
 {target:'#techAdvancedFilters',fallback:'#main-content',title:'ضيّق النتائج بالفلاتر',text:'اختار الماركة والسعر، أو فلتر المنتجات حسب الضمان ونسبة الخصم والمواصفات. كده هتوصل للمنتج المناسب أسرع.'},
 {target:'#productsGrid',title:'شوف المنتج قبل ما تشتري',text:'اضغط على صورة أو اسم المنتج لمراجعة التفاصيل والسعر والتوافر. لو المنتج مناسب، استخدم زر «أضف للسلة».'},
 {target:'#floatingCartBtn',fallback:'.mobile-dock-cart',title:'سلة مشترياتك',text:'كل منتج بتضيفه هتلاقيه في السلة. تقدر تزود أو تقلل الكمية، أو تشيل منتج، وتشوف الإجمالي قبل إرسال الطلب.'},
 {title:'إزاي بتكمل عملية الشراء؟',text:'1. افتح السلة بعد إضافة منتج حقيقي.\n2. راجع المنتجات والكميات.\n3. اكتب الاسم ورقم الموبايل، والعنوان لو الشحن متاح.\n4. اضغط «إرسال الطلب عبر واتساب» علشان الموقع يسجّل طلبك أولًا.'},
 {title:'بعد إرسال الطلب بيحصل إيه؟',text:'الموقع بيعرض لك رقم الطلب، وبعدها تقدر تتواصل على واتساب لتأكيد التفاصيل. الفريق بيراجع الطلب، ومش بيتحسب بيعًا نهائيًا إلا لما تتعمل فاتورة في Technology POS. احتفظ برقم الطلب للمتابعة.'},
 {title:'كل حاجة وضحت؟ 🎉',text:'تقدر دلوقتي تبدأ التسوق بنفسك. ولو نسيت خطوة، اضغط في أي وقت على «شرح الموقع» علشان تعيد الجولة.'}
];
const serviceSteps=[
 {title:'أهلًا بك في خدمات Technology 👋',text:'الصفحة دي بتعرفك بخدمات الصيانة والتركيب. تقدر تستفسر عبر واتساب أو تسجّل طلب صيانة مستقل وتتابعه برقم خاص.'},
 {target:'.services-main a[href="/maintenance"]',fallback:'.services-main',title:'سجّل طلب الصيانة أونلاين',text:'من هنا تسجّل الجهاز والمشكلة وبيانات التواصل؛ بعدها يظهر رقم متابعة وتقدر تعرف حالة الطلب من صفحة مركز الصيانة.'},
 {title:'عاوز تشتري منتج؟',text:'المنتجات والأسعار والفلاتر والسلة موجودة في الكتالوج. نقدر ننقلك هناك ونكمل شرح خطوات الشراء.',nextRoute:'/products'}
];
const maintSteps=[
 {title:'أهلًا بك في مركز الصيانة',text:'هنا تقدر تسجّل مشكلة جهازك من غير ما تروح للمحل الأول، وتاخد رقم متابعة للطلب.'},
 {target:'.tech-maint-type-grid',title:'اختار نوع الصيانة',text:'كمبيوتر، لابتوب، كاميرات، شبكات، تركيب، أو مشكلة أخرى. الضغط على الخدمة هيفتح نموذج الطلب ويحدد النوع تلقائيًا.'},
 {target:'#request',title:'اشرح المشكلة وسجّل الطلب',text:'اكتب اسمك ورقم تليفونك ومشكلة الجهاز. بعد الإرسال هيظهر رقم متابعة. مش هتدفع أي مبلغ من الموقع.'},
 {target:'#track',title:'تابع الطلب وقت ما تحب',text:'اكتب رقم المتابعة ورقم الموبايل المسجل علشان تعرف الحالة الحالية للصيانة. التكلفة والموعد بيتأكدوا بعد التواصل معاك.'}
];
const page=document.body.dataset.page|| (location.pathname.includes('products')?'products':'home');
const steps=page==='maintenance'?maintSteps:page==='services'?serviceSteps:page==='products'?productSteps:homeSteps;
let index=0,root=null,dialog=null,spot=null,scrims=[],currentTarget=null,scrollTimer=null,lastFocus=null;
const getVisible=selector=>{
 if(!selector)return null;
 for(const el of document.querySelectorAll(selector)){
   const style=getComputedStyle(el);
   if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0')continue;
   if(el.getClientRects().length && el.getBoundingClientRect().width>8)return el;
 }
 return null;
};
const escape = s => String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function createRoot(){
 if(root)return;
 root=document.createElement('div');root.id='techTourRoot';
 root.innerHTML=`<div class="tech-tour-scrim" data-scrim="top"></div><div class="tech-tour-scrim" data-scrim="bottom"></div><div class="tech-tour-scrim" data-scrim="left"></div><div class="tech-tour-scrim" data-scrim="right"></div><div class="tech-tour-spot"></div><section class="tech-tour-pop" role="dialog" aria-modal="true" aria-label="جولة تعريفية للمتجر" tabindex="-1"><div class="tech-tour-topline"><span class="tech-tour-brand">TECHNOLOGY STORE ✦ GUIDE</span><button type="button" class="tech-tour-exit" aria-label="إغلاق الجولة">×</button></div><div class="tech-tour-progress"></div><div class="tech-tour-steps"></div><h3></h3><p></p><div class="tech-tour-actions"><button type="button" class="tech-tour-primary">التالي</button><div class="tech-tour-secondary"><button type="button" class="tech-tour-back">السابق</button><button type="button" class="tech-tour-skip">تخطي</button></div></div><footer>توضيح تفاعلي — لن يتم إنشاء طلبات أو تعديل السلة.</footer></section>`;
 document.body.appendChild(root);
 scrims=Array.from(root.querySelectorAll('.tech-tour-scrim'));
 spot=root.querySelector('.tech-tour-spot');dialog=root.querySelector('.tech-tour-pop');
 dialog.querySelector('.tech-tour-exit').addEventListener('click',()=>close(false));
 dialog.querySelector('.tech-tour-skip').addEventListener('click',()=>close(false));
 dialog.querySelector('.tech-tour-back').addEventListener('click',()=>show(Math.max(index-1,0)));
 dialog.querySelector('.tech-tour-primary').addEventListener('click',next);
 document.addEventListener('keydown',onKeydown);
 window.addEventListener('resize',position,{passive:true});
 window.addEventListener('scroll',onScroll,{passive:true});
}
function onKeydown(ev){if(!root)return;if(ev.key==='Escape'){ev.preventDefault();close(false);}if(ev.key==='Tab'){const buttons=Array.from(dialog.querySelectorAll('button:not([disabled])'));const first=buttons[0],last=buttons[buttons.length-1];if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}}}
function onScroll(){if(!root)return;if(scrollTimer)cancelAnimationFrame(scrollTimer);scrollTimer=requestAnimationFrame(position);}
function setRect(el,x,y,w,h){Object.assign(el.style,{left:Math.round(Math.max(0,x))+'px',top:Math.round(Math.max(0,y))+'px',width:Math.round(Math.max(0,w))+'px',height:Math.round(Math.max(0,h))+'px'});}
function position(){if(!root)return;
 const vw=window.innerWidth,vh=window.innerHeight;
 let rect=null;
 if(currentTarget&&document.contains(currentTarget)){
  const b=currentTarget.getBoundingClientRect();if(b.width>8&&b.height>8)rect={left:Math.max(8,b.left-8),right:Math.min(vw-8,b.right+8),top:Math.max(8,b.top-8),bottom:Math.min(vh-8,b.bottom+8)};
 }
 if(!rect||rect.right<=rect.left||rect.bottom<=rect.top){spot.style.display='none';setRect(scrims[0],0,0,vw,vh);scrims.slice(1).forEach(s=>setRect(s,0,0,0,0));}
 else {spot.style.display='block';setRect(spot,rect.left,rect.top,rect.right-rect.left,rect.bottom-rect.top);setRect(scrims[0],0,0,vw,rect.top);setRect(scrims[1],0,rect.bottom,vw,vh-rect.bottom);setRect(scrims[2],0,rect.top,rect.left,rect.bottom-rect.top);setRect(scrims[3],rect.right,rect.top,vw-rect.right,rect.bottom-rect.top);}
 if(vw<=630){dialog.style.top='';dialog.style.left='';dialog.style.bottom='';return;}
 const popWidth=Math.min(390,vw-28),popHeight=dialog.offsetHeight;
 let top=vh/2-popHeight/2,left=vw/2-popWidth/2;
 if(rect){const below=rect.bottom+15,above=rect.top-popHeight-15;top=below+popHeight<vh-12?below:above>=12?above:Math.max(12,(vh-popHeight)/2);left=Math.max(14,Math.min(vw-popWidth-14,rect.left+(rect.right-rect.left)/2-popWidth/2));if(top<12)top=12;}
 dialog.style.top=Math.round(Math.max(12,Math.min(vh-popHeight-12,top)))+'px';dialog.style.left=Math.round(left)+'px';dialog.style.bottom='auto';
}
function show(i){if(!root)return;index=i;const step=steps[index];currentTarget=getVisible(step.target)||getVisible(step.fallback);
 dialog.querySelector('h3').textContent=step.title;dialog.querySelector('p').textContent=step.text;
 dialog.querySelector('.tech-tour-steps').textContent=`الخطوة ${index+1} من ${steps.length}`;
 dialog.querySelector('.tech-tour-progress').innerHTML=steps.map((_,ix)=>`<i class="${ix<=index?'active':''}"></i>`).join('');
 dialog.querySelector('.tech-tour-back').hidden=index===0;
 dialog.querySelector('.tech-tour-primary').textContent=step.nextRoute?'روح للمنتجات ←':index===steps.length-1?'إنهاء الجولة ✓':'التالي ←';
 if(currentTarget){
  const r=currentTarget.getBoundingClientRect();if(r.top<85||r.bottom>innerHeight-210){currentTarget.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});}
 }
 position();setTimeout(position,230);
 dialog.focus({preventScroll:true});
}
function next(){const step=steps[index];if(step.nextRoute){try{sessionStorage.setItem(IN_PROGRESS,'products')}catch(_){}location.href=step.nextRoute;return;}if(index===steps.length-1){close(true);return;}show(index+1);}
function close(finished){if(!root)return;try{localStorage.setItem(VERSION,finished?'complete':'dismissed');sessionStorage.removeItem(IN_PROGRESS)}catch(_){ }
 root.remove();root=null;dialog=null;spot=null;currentTarget=null;scrims=[];
 document.removeEventListener('keydown',onKeydown);window.removeEventListener('resize',position);window.removeEventListener('scroll',onScroll);document.body.classList.remove('tech-tour-open');
 if(lastFocus&&document.contains(lastFocus)&&typeof lastFocus.focus==='function')lastFocus.focus({preventScroll:true});lastFocus=null;
}
function start(manual=false){if(root)return;lastFocus=document.activeElement;createRoot();document.body.classList.add('tech-tour-open');show(0);if(manual){try{sessionStorage.removeItem(IN_PROGRESS)}catch(_){}}}
function installHelpButton(){if(document.querySelector('.tech-tour-help'))return;
 const btn=document.createElement('button');btn.type='button';btn.className='tech-tour-help';btn.innerHTML='<span aria-hidden="true">✦</span> شرح الموقع';btn.setAttribute('aria-label','ابدأ جولة شرح الموقع');btn.addEventListener('click',()=>start(true));document.body.append(btn);
 document.querySelectorAll('[data-start-tour]').forEach(el=>el.addEventListener('click',()=>start(true)));
}
function boot(){installHelpButton();let cont=false;try{cont=sessionStorage.getItem(IN_PROGRESS)==='products'&&page==='products';}catch(_){}
 if(cont){try{sessionStorage.removeItem(IN_PROGRESS)}catch(_){}setTimeout(()=>start(false),600);return;}
 if(!['home','products','services','maintenance'].includes(page))return;
 try{if(localStorage.getItem(VERSION))return;}catch(_){}
 setTimeout(()=>{if(!root&&!document.body.classList.contains('ui-overlay-open'))start(false)},1250);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
