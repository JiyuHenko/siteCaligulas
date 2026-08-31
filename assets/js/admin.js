(function(){
  const API=window.CaligulasAPI;
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const DRAFT_KEY="caligulas-ranking-draft-v2",SESSION_KEY="caligulas-admin-session-v2";
  let state={token:"",version:1,updatedAt:null,rows:[],history:[],mode:API.configured()?"live":"demo"};
  let finishEditingId=null;
  let roundSelection={};

  const E={
    loginView:$("#loginView"),adminView:$("#adminView"),loginForm:$("#loginForm"),password:$("#adminPassword"),loginMsg:$("#loginMsg"),
    demoBtn:$("#demoLogin"),modeBadge:$("#modeBadge"),search:$("#playerSearch"),table:$("#adminRows"),mobile:$("#playerCards"),
    preview:$("#previewRows"),history:$("#historyList"),draftMeta:$("#draftMeta"),publishBtn:$("#publishBtn"),saveDraft:$("#saveDraftBtn"),
    discardDraft:$("#discardDraftBtn"),addBtn:$("#addPlayerBtn"),roundBtn:$("#roundBtn"),logout:$("#logoutBtn"),addDialog:$("#playerDialog"),
    addForm:$("#addPlayerForm"),addName:$("#newPlayerName"),addPoints:$("#newPlayerPoints"),addPres:$("#newPlayerPresences"),
    finishesDialog:$("#finishesDialog"),finishTitle:$("#finishTitle"),finishesGrid:$("#finishesGrid"),finishForm:$("#finishForm"),
    roundDialog:$("#roundDialog"),roundForm:$("#roundForm"),roundType:$("#roundType"),roundSearch:$("#roundSearch"),roundList:$("#roundList"),
    exportBtn:$("#exportBtn"),importInput:$("#importInput")
  };

  function clone(x){return JSON.parse(JSON.stringify(x))}
  function uuid(){return crypto.randomUUID?crypto.randomUUID():`p_${Date.now()}_${Math.random().toString(36).slice(2)}`}
  function esc(s=""){return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
  function rows(){return API.normalizeRows(state.rows)}
  function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2300)}
  function setMeta(msg){E.draftMeta.textContent=msg||`Base v${state.version} · ${state.rows.length} jogadores`}
  function saveDraft(){localStorage.setItem(DRAFT_KEY,JSON.stringify({baseVersion:state.version,savedAt:new Date().toISOString(),rows:state.rows}));setMeta("Rascunho salvo neste navegador");toast("Rascunho salvo")}
  function readDraft(){try{return JSON.parse(localStorage.getItem(DRAFT_KEY)||"null")}catch{return null}}
  function clearDraft(){localStorage.removeItem(DRAFT_KEY)}
  function saveSession(){if(state.mode==="live")sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:state.token}))}
  function clearSession(){sessionStorage.removeItem(SESSION_KEY)}

  async function enter(token,demo=false){
    state.token=token||"";state.mode=demo?"demo":"live";
    E.loginView.hidden=true;E.adminView.hidden=false;E.modeBadge.textContent=demo?"MODO DEMO":"PLANILHA CONECTADA";
    if(demo){
      const d=clone(window.CALIGULAS_RANKING_FALLBACK);state.version=d.version||1;state.updatedAt=d.updatedAt;state.rows=d.rows||[];state.history=[];
    }else{
      const d=await API.post({action:"adminState",token:state.token});state.version=d.version;state.updatedAt=d.updatedAt;state.rows=d.rows||[];state.history=d.history||[];saveSession();
    }
    const draft=readDraft();
    if(draft&&Array.isArray(draft.rows)&&draft.baseVersion===state.version&&confirm("Existe um rascunho salvo para esta versão. Recuperar?"))state.rows=draft.rows;
    renderAll();
  }

  E.loginForm?.addEventListener("submit",async e=>{
    e.preventDefault();if(!API.configured())return;
    E.loginMsg.textContent="Entrando...";
    try{const d=await API.post({action:"login",password:E.password.value});E.password.value="";E.loginMsg.textContent="";await enter(d.token,false)}
    catch(err){E.loginMsg.textContent=err.message}
  });
  E.demoBtn?.addEventListener("click",()=>enter("",true));
  if(API.configured()){
    E.demoBtn.hidden=true;const s=JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null");if(s?.token)enter(s.token,false).catch(()=>clearSession());
  }else E.loginMsg.textContent="Apps Script ainda não configurado. Use o modo demonstração.";

  function renderAll(){renderPlayers();renderPreview();renderHistory();setMeta()}
  function filtered(){
    const q=(E.search.value||"").trim().toLocaleLowerCase("pt-BR");
    return rows().filter(r=>!q||r.name.toLocaleLowerCase("pt-BR").includes(q));
  }
  function updateById(id,patch){
    const i=state.rows.findIndex(r=>String(r.id)===String(id));if(i<0)return;
    state.rows[i]={...state.rows[i],...patch};renderAll();
  }
  function removeById(id){
    const r=state.rows.find(x=>String(x.id)===String(id));if(!r)return;
    if(confirm(`Excluir ${r.name} do rascunho?`)){state.rows=state.rows.filter(x=>String(x.id)!==String(id));renderAll()}
  }

  function renderPlayers(){
    const list=filtered(),ordered=rows();
    E.table.innerHTML=list.length?list.map(r=>{
      const pos=ordered.findIndex(x=>x.id===r.id)+1,tie=API.tieSummary(r,2)||"—";
      return `<tr data-id="${esc(r.id)}"><td class="admin-readonly">${pos}</td>
      <td><input class="name" data-field="name" value="${esc(r.name)}"></td>
      <td><input class="num" type="number" min="0" step="1" data-field="points" value="${r.points}"></td>
      <td><input class="num" type="number" min="0" step="1" data-field="presences" value="${r.presences}"></td>
      <td class="admin-readonly">${String(r.factor).replace(".",",")}x</td>
      <td class="admin-readonly">${API.fmt(r.finalPoints)}</td>
      <td><button class="btn btn-small" data-finishes="${esc(r.id)}">${esc(tie)}</button></td>
      <td><button class="btn btn-small danger" data-remove="${esc(r.id)}">Excluir</button></td></tr>`;
    }).join(""):`<tr><td colspan="8"><div class="admin-empty">Nenhum jogador encontrado.</div></td></tr>`;

    E.mobile.innerHTML=list.length?list.map(r=>{
      const pos=ordered.findIndex(x=>x.id===r.id)+1,tie=API.tieSummary(r,2)||"Sem colocações cadastradas";
      return `<article class="player-card" data-id="${esc(r.id)}">
        <div class="player-card-head"><div><div class="player-card-pos">${String(pos).padStart(2,"0")}</div><input class="admin-input" data-field="name" value="${esc(r.name)}" aria-label="Nome"></div><div class="player-card-score">${API.fmt(r.finalPoints)}</div></div>
        <div class="player-card-grid"><label>Pontos<input class="admin-input" type="number" min="0" step="1" data-field="points" value="${r.points}"></label><label>Presenças<input class="admin-input" type="number" min="0" step="1" data-field="presences" value="${r.presences}"></label></div>
        <div class="player-card-bottom"><button class="btn btn-small" data-finishes="${esc(r.id)}">Colocações</button><span class="tie-mini">${esc(tie)}</span><button class="btn btn-small danger" data-remove="${esc(r.id)}">Excluir</button></div>
      </article>`;
    }).join(""):`<div class="admin-empty">Nenhum jogador encontrado.</div>`;
  }

  function fieldHandler(e){
    const target=e.target.closest("[data-field]");if(!target)return;
    const holder=target.closest("[data-id]");if(!holder)return;
    const id=holder.dataset.id,field=target.dataset.field;
    const value=field==="name"?target.value:Math.max(0,Number(target.value)||0);
    const i=state.rows.findIndex(r=>String(r.id)===String(id));if(i<0)return;
    state.rows[i][field]=value;renderPreview();setMeta("Alterações ainda não publicadas");
  }
  E.table.addEventListener("input",fieldHandler);E.mobile.addEventListener("input",fieldHandler);
  E.table.addEventListener("change",renderAll);E.mobile.addEventListener("change",renderAll);
  function clickHandler(e){
    const f=e.target.closest("[data-finishes]");if(f){openFinishes(f.dataset.finishes);return}
    const d=e.target.closest("[data-remove]");if(d)removeById(d.dataset.remove);
  }
  E.table.addEventListener("click",clickHandler);E.mobile.addEventListener("click",clickHandler);
  E.search.addEventListener("input",renderPlayers);

  function renderPreview(){
    E.preview.innerHTML=rows().slice(0,10).map((r,i)=>`<div class="preview-row"><span class="pos">${String(i+1).padStart(2,"0")}</span><span>${esc(r.name)}</span><strong>${API.fmt(r.finalPoints)}</strong></div>`).join("")||`<div class="admin-empty">Sem jogadores.</div>`;
  }
  function renderHistory(){
    if(state.mode==="demo"){E.history.innerHTML=`<div class="admin-empty">Histórico disponível após conectar a planilha.</div>`;return}
    E.history.innerHTML=(state.history||[]).map(h=>`<div class="history-row"><div><strong>Versão ${h.version}</strong><span>${API.fmtDate(h.createdAt)} · ${h.total} jogadores</span></div><button class="btn btn-small" data-restore="${esc(h.id)}">Restaurar</button></div>`).join("")||`<div class="admin-empty">Nenhuma publicação anterior.</div>`;
  }
  E.history.addEventListener("click",async e=>{
    const b=e.target.closest("[data-restore]");if(!b)return;
    if(!confirm("Restaurar esta versão? A versão atual será guardada no histórico."))return;
    try{
      const d=await API.post({action:"restore",token:state.token,baseVersion:state.version,historyId:b.dataset.restore});
      state.version=d.version;state.updatedAt=d.updatedAt;state.rows=d.rows;state.history=d.history;clearDraft();renderAll();toast("Versão restaurada");
    }catch(err){alert(err.message)}
  });

  E.addBtn.addEventListener("click",()=>E.addDialog.showModal());
  E.addForm.addEventListener("submit",e=>{
    e.preventDefault();state.rows.push({id:uuid(),name:E.addName.value.trim(),points:+E.addPoints.value||0,presences:+E.addPres.value||0,finishes:Array(9).fill(0)});
    E.addForm.reset();E.addPoints.value=0;E.addPres.value=0;E.addDialog.close();renderAll();setMeta("Novo jogador no rascunho");
  });

  function openFinishes(id){
    finishEditingId=id;const row=state.rows.find(r=>String(r.id)===String(id));if(!row)return;
    E.finishTitle.textContent=`Colocações — ${row.name}`;
    const f=API.cleanFinishes(row.finishes);
    E.finishesGrid.innerHTML=f.map((n,i)=>`<div class="finish-field"><label>${i+1}º lugar<input class="admin-input" type="number" min="0" step="1" data-finish-index="${i}" value="${n}"></label></div>`).join("");
    E.finishesDialog.showModal();
  }
  E.finishForm.addEventListener("submit",e=>{
    e.preventDefault();const row=state.rows.find(r=>String(r.id)===String(finishEditingId));if(!row)return;
    row.finishes=Array.from({length:9},(_,i)=>Math.max(0,Math.floor(Number(E.finishesGrid.querySelector(`[data-finish-index="${i}"]`).value)||0)));
    E.finishesDialog.close();renderAll();setMeta("Colocações alteradas no rascunho");
  });

  E.roundBtn.addEventListener("click",()=>{
    roundSelection={};rows().forEach(r=>roundSelection[r.id]={present:false,placement:""});
    E.roundSearch.value="";renderRoundList();E.roundDialog.showModal();
  });
  E.roundSearch.addEventListener("input",renderRoundList);
  function renderRoundList(){
    const q=(E.roundSearch.value||"").trim().toLocaleLowerCase("pt-BR");
    const list=rows().filter(r=>!q||r.name.toLocaleLowerCase("pt-BR").includes(q));
    E.roundList.innerHTML=list.map(r=>{
      const sel=roundSelection[r.id]||{present:false,placement:""};
      return `<div class="round-player" data-round-id="${esc(r.id)}"><input type="checkbox" data-present aria-label="Presente" ${sel.present?"checked":""}><span class="rname">${esc(r.name)}</span><select class="admin-select" data-placement aria-label="Colocação"><option value="">—</option>${Array.from({length:9},(_,i)=>`<option value="${i+1}" ${String(sel.placement)===String(i+1)?"selected":""}>${i+1}º</option>`).join("")}</select></div>`;
    }).join("");
  }
  E.roundList.addEventListener("change",e=>{
    const el=e.target.closest(".round-player");if(!el)return;
    const id=el.dataset.roundId;roundSelection[id]=roundSelection[id]||{present:false,placement:""};
    if(e.target.matches("[data-placement]")){
      roundSelection[id].placement=e.target.value;
      if(e.target.value){roundSelection[id].present=true;el.querySelector("[data-present]").checked=true}
    }
    if(e.target.matches("[data-present]")){
      roundSelection[id].present=e.target.checked;
      if(!e.target.checked){roundSelection[id].placement="";el.querySelector("[data-placement]").value="";}
    }
  });
  E.roundForm.addEventListener("submit",e=>{
    e.preventDefault();let changed=0;
    Object.entries(roundSelection).forEach(([id,sel])=>{
      if(!sel.present)return;
      const placement=Number(sel.placement)||0;
      const row=state.rows.find(r=>String(r.id)===String(id));if(!row)return;
      row.presences=(Number(row.presences)||0)+1;row.finishes=API.cleanFinishes(row.finishes);
      if(placement){row.points=(Number(row.points)||0)+API.pointsFor(E.roundType.value,placement);row.finishes[placement-1]+=1}
      changed++;
    });
    if(!changed){toast("Selecione pelo menos um participante");return}
    E.roundDialog.close();E.roundSearch.value="";roundSelection={};renderAll();setMeta(`${changed} participações adicionadas ao rascunho`);toast("Torneio aplicado ao rascunho");
  });

  E.saveDraft.addEventListener("click",saveDraft);
  E.discardDraft.addEventListener("click",async()=>{
    if(!confirm("Descartar as alterações locais e voltar ao ranking publicado?"))return;
    clearDraft();
    if(state.mode==="demo"){const d=clone(window.CALIGULAS_RANKING_FALLBACK);state.rows=d.rows}
    else{const d=await API.post({action:"adminState",token:state.token});state.version=d.version;state.rows=d.rows;state.history=d.history}
    renderAll();toast("Rascunho descartado");
  });
  E.publishBtn.addEventListener("click",async()=>{
    if(state.mode==="demo"){toast("Conecte o Apps Script para publicar");return}
    if(!confirm("Publicar o ranking inteiro agora? A versão atual será salva no histórico."))return;
    E.publishBtn.disabled=true;E.publishBtn.textContent="Publicando...";
    try{
      const d=await API.post({action:"publish",token:state.token,baseVersion:state.version,rows:state.rows});
      state.version=d.version;state.updatedAt=d.updatedAt;state.rows=d.rows;state.history=d.history;clearDraft();renderAll();toast("Ranking publicado");
    }catch(err){if(err.code==="VERSION_CONFLICT")alert("O ranking foi alterado em outra sessão. Recarregue o painel.");else alert(err.message)}
    finally{E.publishBtn.disabled=false;E.publishBtn.textContent="Publicar ranking"}
  });

  E.exportBtn.addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify({baseVersion:state.version,exportedAt:new Date().toISOString(),rows:state.rows},null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`caligulas-ranking-rascunho-v${state.version}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
  });
  E.importInput.addEventListener("change",async()=>{
    const file=E.importInput.files?.[0];if(!file)return;
    try{const d=JSON.parse(await file.text());if(!Array.isArray(d.rows))throw new Error("Arquivo inválido.");state.rows=d.rows;renderAll();setMeta("JSON importado para o rascunho");toast("Rascunho importado")}catch(err){alert(err.message)}
    E.importInput.value="";
  });

  $$("[data-close-dialog]").forEach(b=>b.addEventListener("click",()=>b.closest("dialog").close()));
  E.logout.addEventListener("click",()=>{clearSession();location.reload()});
})();
