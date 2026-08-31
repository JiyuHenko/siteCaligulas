(function(){
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const cfg=window.CALIGULAS_CONFIG||{};
  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  const compact=matchMedia("(max-width: 699px)").matches;
  const finePointer=matchMedia("(hover: hover) and (pointer: fine)").matches;

  // public links
  $$("[data-instagram]").forEach(a=>{a.href=cfg.instagram||"#";a.target="_blank";a.rel="noopener"});
  $$("[data-whatsapp]").forEach(a=>{
    const msg=encodeURIComponent(a.dataset.message||cfg.whatsappMessage||"Olá!");
    a.href=`https://wa.me/${cfg.whatsappNumber}?text=${msg}`;a.target="_blank";a.rel="noopener";
  });
  $$("[data-map]").forEach(a=>{
    a.href=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cfg.mapsQuery||cfg.address||"")}`;a.target="_blank";a.rel="noopener";
  });
  $$("[data-address]").forEach(el=>el.textContent=cfg.address||"");
  const mapFrames=$$('iframe[data-map-embed]');
  const loadMap=frame=>{
    if(frame.dataset.mapLoaded==='1')return;
    const q=encodeURIComponent(cfg.mapsQuery||cfg.address||'Caligulas Poker Live, Passos, MG');
    frame.src=`https://www.google.com/maps?q=${q}&output=embed`;
    frame.dataset.mapLoaded='1';
  };
  if(mapFrames.length&&'IntersectionObserver'in window){
    const mapObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){loadMap(entry.target);mapObserver.unobserve(entry.target)}
    }),{rootMargin:'100px 0px',threshold:.01});
    mapFrames.forEach(frame=>mapObserver.observe(frame));
  }else mapFrames.forEach(loadMap);
  $$(".js-year").forEach(el=>el.textContent=new Date().getFullYear());

  // navigation
  const header=$(".site-header"),menuBtn=$("#menuBtn"),mobileNav=$("#mobileNav");
  addEventListener("scroll",()=>header?.classList.toggle("scrolled",scrollY>20),{passive:true});
  menuBtn?.addEventListener("click",()=>{
    const open=!mobileNav.classList.contains("open");
    mobileNav.classList.toggle("open",open);document.body.classList.toggle("menu-open",open);
    menuBtn.setAttribute("aria-expanded",String(open));
  });
  $$("#mobileNav a").forEach(a=>a.addEventListener("click",()=>{mobileNav.classList.remove("open");document.body.classList.remove("menu-open");menuBtn?.setAttribute("aria-expanded","false")}));

  // controlled reveal: mobile renders immediately; desktop keeps restrained motion.
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
  }

  // Hero V3: intentionally static. The premium treatment comes from framing,
  // glass and crop rather than a full-viewport shrink effect.

  // generic lightbox
  const lb=$("#lightbox"),lbImg=$("#lightboxImg");
  $$("[data-lightbox]").forEach(img=>img.addEventListener("click",()=>{
    if(!lb||!lbImg)return;lbImg.src=img.dataset.full||img.currentSrc||img.src;lbImg.alt=img.alt||"";lb.classList.add("open");
  }));
  function closeLb(){lb?.classList.remove("open")}
  lb?.addEventListener("click",e=>{if(e.target===lb||e.target.closest("[data-close-lightbox]"))closeLb()});
  addEventListener("keydown",e=>{if(e.key==="Escape")closeLb()});

  // Home ranking preview is below the fold. Build it when the main thread is idle.
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
  }

  // gallery filter
  const filterButtons=$$("[data-gallery-filter]");
  if(filterButtons.length){
    filterButtons.forEach(btn=>btn.addEventListener("click",()=>{
      filterButtons.forEach(b=>b.classList.remove("active"));btn.classList.add("active");
      const f=btn.dataset.galleryFilter;
      $$("[data-category]").forEach(item=>item.classList.toggle("hidden",f!=="all"&&!item.dataset.category.split(" ").includes(f)));
    }));
  }

  function esc(s=""){return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
})();
