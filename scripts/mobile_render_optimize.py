from pathlib import Path
import csscompressor
import rjsmin

root = Path(__file__).resolve().parents[1]
cssp = root / 'assets/css/styles.css'
css = cssp.read_text(encoding='utf-8')
marker = '/* V7 — mobile render stability */'
if marker not in css:
    css += r'''

/* V7 — mobile render stability */
@media (max-width:699px){
  /* Preserve the glass look with opacity, but avoid expensive full-surface blur
     while the hero is the LCP candidate on mobile GPUs. */
  .glass,.nav-shell{
    backdrop-filter:none!important;
    -webkit-backdrop-filter:none!important
  }
  .nav-shell{background:rgba(9,9,8,.91)}
  .hero-glass{
    background:linear-gradient(145deg,rgba(34,28,22,.93),rgba(8,8,7,.96));
    box-shadow:inset 0 1px rgba(255,255,255,.055),0 18px 46px rgba(0,0,0,.28)
  }
  [data-reveal]{opacity:1!important;transform:none!important;transition:none!important}
  main>.section{
    content-visibility:auto;
    contain-intrinsic-size:auto 720px
  }
}
'''
cssp.write_text(css, encoding='utf-8')
(root / 'assets/css/styles.min.css').write_text(csscompressor.compress(css), encoding='utf-8')

jsp = root / 'assets/js/site.js'
js = jsp.read_text(encoding='utf-8')
js = js.replace(
    '  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;',
    '  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;\n'
    '  const compact=matchMedia("(max-width: 699px)").matches;\n'
    '  const finePointer=matchMedia("(hover: hover) and (pointer: fine)").matches;'
)

old_reveal = '''  // controlled reveal
  const reveals=$$("[data-reveal]");
  if(!reduce&&"IntersectionObserver"in window){
    const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("is-visible");io.unobserve(e.target)}}),{threshold:.12});
    reveals.forEach(e=>io.observe(e));
  }else reveals.forEach(e=>e.classList.add("is-visible"));

  // restrained spotlight only where explicitly enabled
  $$("[data-spotlight]").forEach(card=>card.addEventListener("pointermove",e=>{
    const r=card.getBoundingClientRect();card.style.setProperty("--mx",`${e.clientX-r.left}px`);card.style.setProperty("--my",`${e.clientY-r.top}px`);
  }));'''
new_reveal = '''  // controlled reveal: mobile renders immediately; desktop keeps restrained motion.
  const reveals=$$("[data-reveal]");
  if(!compact&&!reduce&&"IntersectionObserver"in window){
    const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("is-visible");io.unobserve(e.target)}}),{threshold:.12});
    reveals.forEach(e=>io.observe(e));
  }else reveals.forEach(e=>e.classList.add("is-visible"));

  // Spotlight is a pointer/desktop enhancement; registering it on touch devices is wasted work.
  if(finePointer){
    $$("[data-spotlight]").forEach(card=>card.addEventListener("pointermove",e=>{
      const r=card.getBoundingClientRect();card.style.setProperty("--mx",`${e.clientX-r.left}px`);card.style.setProperty("--my",`${e.clientY-r.top}px`);
    }));
  }'''
if old_reveal in js:
    js = js.replace(old_reveal, new_reveal)

old_rank = '''  // home ranking preview
  const preview=$("#rankingPreview");
  if(preview&&window.CaligulasAPI){
    CaligulasAPI.getRanking().then(data=>{
      const rows=data.rows.slice(0,3);
      preview.innerHTML=rows.map((r,i)=>`<article class="rank-tile glass ${i===0?"first":""}">
        <div class="pos">${String(i+1).padStart(2,"0")}</div>
        <div><div class="name">${esc(r.name)}</div><div class="small">${r.presences} presenças${CaligulasAPI.tieSummary(r)?` · ${esc(CaligulasAPI.tieSummary(r,1))}`:""}</div></div>
        <div class="score">${CaligulasAPI.fmt(r.finalPoints)}</div>
      </article>`).join("");
      const status=$("#homeRankingStatus");
      if(status) status.innerHTML=`<span class="live-dot ${data.source==="local-fallback"?"demo":""}"></span>${data.source==="local-fallback"?"Prévia local":"Atualizado "+CaligulasAPI.fmtDate(data.updatedAt)}`;
    });
  }'''
new_rank = '''  // Home ranking preview is below the fold. Build it when the main thread is idle.
  const preview=$("#rankingPreview");
  const renderRankingPreview=()=>{
    if(!preview||!window.CaligulasAPI)return;
    CaligulasAPI.getRanking().then(data=>{
      const rows=data.rows.slice(0,3);
      preview.innerHTML=rows.map((r,i)=>`<article class="rank-tile glass ${i===0?"first":""}">
        <div class="pos">${String(i+1).padStart(2,"0")}</div>
        <div><div class="name">${esc(r.name)}</div><div class="small">${r.presences} presenças${CaligulasAPI.tieSummary(r)?` · ${esc(CaligulasAPI.tieSummary(r,1))}`:""}</div></div>
        <div class="score">${CaligulasAPI.fmt(r.finalPoints)}</div>
      </article>`).join("");
      const status=$("#homeRankingStatus");
      if(status) status.innerHTML=`<span class="live-dot ${data.source==="local-fallback"?"demo":""}"></span>${data.source==="local-fallback"?"Prévia local":"Atualizado "+CaligulasAPI.fmtDate(data.updatedAt)}`;
    });
  };
  if(preview){
    if("requestIdleCallback" in window) requestIdleCallback(renderRankingPreview,{timeout:2200});
    else setTimeout(renderRankingPreview,500);
  }'''
if old_rank in js:
    js = js.replace(old_rank, new_rank)

jsp.write_text(js, encoding='utf-8')
(root / 'assets/js/site.min.js').write_text(rjsmin.jsmin(js), encoding='utf-8')
print('mobile render optimization applied')
