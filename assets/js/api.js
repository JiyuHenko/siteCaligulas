(function(){
  const cfg=window.CALIGULAS_CONFIG||{};
  const fallback=window.CALIGULAS_RANKING_FALLBACK||{version:1,rows:[]};
  const REGULAR=[15,12,10,8,7,6,5,4,3];
  const SPECIAL=[20,18,16,14,13,12,11,10,9];
  const DEFAULT_MODIFIERS=[
    {minPresences:10,factor:1.1},
    {minPresences:15,factor:1.2},
    {minPresences:20,factor:1.3},
    {minPresences:25,factor:1.4},
    {minPresences:30,factor:1.5},
    {minPresences:36,factor:2.0}
  ];

  function configured(){return /^https:\/\/script\.google\.com\//.test(String(cfg.appsScriptUrl||"")) || /^https:\/\/script\.googleusercontent\.com\//.test(String(cfg.appsScriptUrl||""))}
  function normalizeModifiers(value){
    const map=new Map();
    (Array.isArray(value)?value:DEFAULT_MODIFIERS).forEach(item=>{
      const minPresences=Math.max(0,Math.floor(Number(item?.minPresences??item?.presences)||0));
      const factor=Number(item?.factor);
      if(!Number.isFinite(factor)||factor<=0)return;
      if(minPresences===0&&factor===1)return;
      map.set(minPresences,Math.round(factor*1000)/1000);
    });
    return Array.from(map.entries()).map(([minPresences,factor])=>({minPresences,factor})).sort((a,b)=>a.minPresences-b.minPresences);
  }
  function factorFor(presences,modifiers=DEFAULT_MODIFIERS){
    const p=Math.max(0,Math.floor(Number(presences)||0));
    let factor=1;
    normalizeModifiers(modifiers).forEach(rule=>{if(p>=rule.minPresences)factor=rule.factor});
    return factor;
  }
  function cleanFinishes(value){
    const arr=Array.isArray(value)?value:[];
    return Array.from({length:9},(_,i)=>Math.max(0,Math.floor(Number(arr[i])||0)));
  }
  function compute(row,modifiers=DEFAULT_MODIFIERS){
    const points=Math.max(0,Number(row.points??row.pontos)||0);
    const presences=Math.max(0,Math.floor(Number(row.presences??row.presencas)||0));
    const factor=factorFor(presences,modifiers);
    const finalPoints=Math.round(((points+presences)*factor)*10)/10;
    return {...row,points,presences,factor,finalPoints,finishes:cleanFinishes(row.finishes)};
  }
  function compareComputedRows(a,b){
    if(b.finalPoints!==a.finalPoints)return b.finalPoints-a.finalPoints;
    for(let i=0;i<9;i++){if(b.finishes[i]!==a.finishes[i])return b.finishes[i]-a.finishes[i]}
    return String(a.name||"").localeCompare(String(b.name||""),"pt-BR");
  }
  function compareRows(a,b,modifiers=DEFAULT_MODIFIERS){return compareComputedRows(compute(a,modifiers),compute(b,modifiers))}
  function normalizeRows(rows,modifiers=DEFAULT_MODIFIERS){return (rows||[]).map(row=>compute(row,modifiers)).sort(compareComputedRows)}
  function pointsFor(type,placement){
    const pos=Number(placement);
    if(!Number.isInteger(pos)||pos<1||pos>9)return 0;
    return (type==="special"?SPECIAL:REGULAR)[pos-1];
  }
  function tieSummary(row,max=3){
    const f=cleanFinishes(row.finishes);const out=[];
    for(let i=0;i<f.length&&out.length<max;i++)if(f[i])out.push(`${f[i]}× ${i+1}º`);
    return out.join(" · ");
  }
  function withNormalizedRanking(data,source){
    const modifiers=Array.isArray(data?.modifiers)?normalizeModifiers(data.modifiers):normalizeModifiers(DEFAULT_MODIFIERS);
    return {...data,source:source||data?.source,modifiers,rows:normalizeRows(data?.rows||[],modifiers)};
  }
  async function getRanking(){
    if(!configured())return withNormalizedRanking(fallback,"local-fallback");
    try{
      const u=new URL(cfg.appsScriptUrl);u.searchParams.set("action","ranking");u.searchParams.set("_",Date.now());
      const r=await fetch(u,{cache:"no-store"});const data=await r.json();
      if(!data.ok)throw new Error(data.message||"Falha ao carregar ranking.");
      return withNormalizedRanking(data,data.source||"google-sheets");
    }catch(err){
      console.warn("Ranking remoto indisponível; usando fallback.",err);
      return {...withNormalizedRanking(fallback,"local-fallback"),error:String(err.message||err)};
    }
  }
  async function post(payload){
    if(!configured())throw new Error("Google Apps Script ainda não configurado.");
    const r=await fetch(cfg.appsScriptUrl,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)});
    const data=await r.json();if(!data.ok){const e=new Error(data.message||"Erro no servidor.");e.code=data.code;throw e}return data;
  }
  function fmt(n){return new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1}).format(Number(n)||0)}
  function fmtDate(s){if(!s)return "—";try{return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(s))}catch{return s}}

  window.CaligulasAPI={configured,normalizeModifiers,factorFor,cleanFinishes,compute,compareRows,normalizeRows,pointsFor,tieSummary,getRanking,post,fmt,fmtDate,REGULAR,SPECIAL,DEFAULT_MODIFIERS};
})();
