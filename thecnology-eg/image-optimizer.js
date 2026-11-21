/* Technology Store V10.6 — compress each product image locally before upload.
   Server continues to enforce authorization, MIME, and Cloudinary WebP encoding. */
(function(global) {
  'use strict';
  const MAX_INPUT = 10 * 1024 * 1024;
  const MAX_OUTPUT = 8 * 1024 * 1024;
  const allowed = new Set(['image/jpeg','image/png','image/webp']);
  function readable(n) { return n >= 1048576 ? (n/1048576).toFixed(2)+' MB' : Math.max(1,Math.round(n/1024))+' KB'; }
  function loadImage(file) {
    return new Promise((resolve,reject)=>{
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('تعذر قراءة الصورة '+file.name));};
      img.src=url;
    });
  }
  function canvasWebp(canvas,quality) {
    return new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
  }
  async function optimizeFile(file, options={}) {
    if(!allowed.has(file.type)) throw new Error('صيغة غير مدعومة: '+file.name);
    if(file.size>MAX_INPUT) throw new Error('الصورة '+file.name+' أكبر من 10MB. قلّل حجمها أولاً.');
    const limit=Math.min(2000,Math.max(800,Number(options.maxDimension)||1600));
    const quality=Math.max(.65,Math.min(.9,Number(options.quality)||.80));
    const img=await loadImage(file);
    const scale=Math.min(1,limit/Math.max(img.naturalWidth,img.naturalHeight,1));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx) throw new Error('المتصفح لا يدعم ضغط الصور');
    ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,canvas.width,canvas.height);
    let blob=await canvasWebp(canvas,quality);
    if(!blob || blob.type!=='image/webp') throw new Error('المتصفح لا يدعم تحويل WebP. جرّب Chrome أو Edge محدّث.');
    if(blob.size>MAX_OUTPUT) blob=await canvasWebp(canvas,.70);
    if(!blob || blob.size>MAX_OUTPUT) throw new Error('الصورة ما زالت كبيرة؛ جرّب صورة بأبعاد أقل.');
    const base=(file.name.replace(/\.[^.]*$/,'')||'image').replace(/[^\w\u0600-\u06FF-]+/g,'-').slice(0,85);
    const result=new File([blob],base+'.webp',{type:'image/webp',lastModified:Date.now()});
    return {file:result, originalBytes:file.size, outputBytes:result.size, width:canvas.width,height:canvas.height};
  }
  async function optimizeFiles(files, options={}) {
    const list=Array.from(files||[]);
    if(list.length>12) throw new Error('يمكن رفع 12 صورة كحد أقصى في المرة الواحدة.');
    const results=[];
    for(let i=0;i<list.length;i++) {
      options.onProgress?.(`جاري ضغط الصورة ${i+1} من ${list.length}…`);
      results.push(await optimizeFile(list[i],options));
    }
    const before=results.reduce((x,r)=>x+r.originalBytes,0);
    const after=results.reduce((x,r)=>x+r.outputBytes,0);
    options.onProgress?.(`تم التحويل إلى WebP: ${readable(before)} ← ${readable(after)} (${before ? Math.max(0,Math.round((1-after/before)*100)):0}% توفير)`);
    return results;
  }
  global.TechImageOptimizer={optimizeFile,optimizeFiles,readable};
})(window);
