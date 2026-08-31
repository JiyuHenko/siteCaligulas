(function(){
  const API=window.CaligulasAPI;
  const podium=document.querySelector("#rankingPodium"), tbody=document.querySelector("#rankingTableBody"), mobile=document.querySelector("#rankingMobile"), status=document.querySelector("#rankingPageStatus"), search=document.querySelector("#rankingSearch");
  let rows=[];
  function esc(s=""){return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
  function render(){
    const q=(search?.value||"").trim().toLocaleLowerCase("pt-BR");
    const filtered=rows.filter(r=>!q||r.name.toLocaleLowerCase("pt-BR").includes(q));
    if(podium){
      podium.innerHTML=rows.slice(0,3).map((r,i)=>`<article class="podium-card glass ${i===0?"first":""}">
        <div class="place">${i+1}º</div><div class="player">${esc(r.name)}</div><div class="points">${API.fmt(r.finalPoints)}</div>
        <div class="sub">${r.presences} presenças${API.tieSummary(r)?` · ${esc(API.tieSummary(r,2))}`:""}</div>
      </article>`).join("");
    }
    if(tbody){
      tbody.innerHTML=filtered.map(r=>{
        const pos=rows.indexOf(r)+1, tie=API.tieSummary(r,3)||"—";
        return `<tr><td>${pos}</td><td><strong>${esc(r.name)}</strong></td><td>${API.fmt(r.points)}</td><td>${r.presences}</td><td>${String(r.factor).replace(".",",")}x</td><td>${esc(tie)}</td><td>${API.fmt(r.finalPoints)}</td></tr>`;
      }).join("")||`<tr><td colspan="7">Nenhum jogador encontrado.</td></tr>`;
    }
    if(mobile){
      mobile.innerHTML=filtered.map(r=>{
        const pos=rows.indexOf(r)+1,tie=API.tieSummary(r,2);
        return `<article class="rank-row-mobile glass"><div class="p">${String(pos).padStart(2,"0")}</div><div><div class="n">${esc(r.name)}</div><div class="d">${r.presences} presenças · ${String(r.factor).replace(".",",")}x${tie?` · ${esc(tie)}`:""}</div></div><div class="f">${API.fmt(r.finalPoints)}</div></article>`;
      }).join("");
    }
  }
  search?.addEventListener("input",render);
  API.getRanking().then(data=>{
    rows=API.normalizeRows(data.rows);
    if(status)status.innerHTML=`<span class="live-dot ${data.source==="local-fallback"?"demo":""}"></span>${data.source==="local-fallback"?"Dados de demonstração":"Publicado em "+API.fmtDate(data.updatedAt)}`;
    render();
  });
})();
