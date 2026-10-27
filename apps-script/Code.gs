/**
 * CALIGULAS POKER LIVE — RANKING API / ADMIN v6
 *
 * v6: datas/IDs de etapas canônicos, publicação separada de geral/mensal,
 * contador mensal editável, importação completa e reversão de falhas de escrita.
 *
 * Mudanças v4:
 * - fórmula geral: (pontos x fator) + presenças + bônus;
 * - bônus acumulado separado do multiplicador;
 * - ranking mensal por etapas, sem multiplicador;
 * - presença mensal vale 1 ponto (regra 4.3.3 do regulamento 2026/27);
 * - bônus mensal de 10 pontos, com exigência de 100% de presença;
 * - acordos podem repetir colocação no mesmo torneio (controle feito no admin);
 * - migração v3 -> v4 preserva a planilha PUBLICADO e o histórico existente.
 */

const SETTINGS = Object.freeze({
  SPREADSHEET_ID: '11l9qXZmMKPUHaT0L7azJY0KYqJMu7lujiL3a8toKwQI',
  INITIAL_ADMIN_PASSWORD: 'CHANGE_ME_ONLY_FOR_FRESH_SETUP',
  SHEET_PUBLISHED: 'PUBLICADO',
  SHEET_HISTORY: 'HISTORICO',
  SHEET_META: 'META',
  SHEET_MODIFIERS: 'MODIFICADORES',
  SHEET_TOURNAMENTS: 'TORNEIOS',
  SHEET_STAGES: 'ETAPAS',
  SHEET_HISTORY_PARTS: 'HISTORICO_PARTES',
  SESSION_HOURS: 8,
  MAX_HISTORY: 50,
  SCHEMA_VERSION: 6
});

const MONTHLY_STAGES = Object.freeze([
  {id:'2026-10-11',label:'Etapa 1',start:'2026-10-11',end:'2026-11-14'},
  {id:'2026-11-15',label:'Etapa 2',start:'2026-11-15',end:'2026-12-12'},
  {id:'2026-12-13',label:'Etapa 3',start:'2026-12-13',end:'2027-01-16'},
  {id:'2027-01-17',label:'Etapa 4',start:'2027-01-17',end:'2027-02-13'},
  {id:'2027-02-14',label:'Etapa 5',start:'2027-02-14',end:'2027-03-13'},
  {id:'2027-03-14',label:'Etapa 6',start:'2027-03-14',end:'2027-04-10'},
  {id:'2027-04-11',label:'Etapa 7',start:'2027-04-11',end:'2027-04-12'}
]);

function defaultModifiers_() {
  return [
    {minPresences:15,factor:1.1},
    {minPresences:21,factor:1.2},
    {minPresences:27,factor:1.3},
    {minPresences:33,factor:1.4},
    {minPresences:41,factor:1.5},
    {minPresences:46,factor:2.0}
  ];
}

function defaultMonthlyState_() {
  const stage = stageForDate_(dateKey_(new Date())) || stagesV5_()[0] || MONTHLY_STAGES[0];
  return {
    stageId:stage.id,
    tournamentCount:0,
    finalized:false,
    bonusRecipients:[],
    bonusAwardedAt:null
  };
}

function setupProject() {
  validateSpreadsheetId_();
  const ss = SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
  const pub = ensureSheet_(ss, SETTINGS.SHEET_PUBLISHED, publishedHeaders_());
  ensureSheet_(ss, SETTINGS.SHEET_HISTORY, ['historico_id','criado_em','versao','total_jogadores','snapshot_json']);
  ensureSheet_(ss, SETTINGS.SHEET_META, ['chave','valor']);
  ensureSheet_(ss, SETTINGS.SHEET_TOURNAMENTS, tournamentHeadersV5_());
  ensureSheet_(ss, SETTINGS.SHEET_STAGES, stageHeadersV5_());
  ensureSheet_(ss, SETTINGS.SHEET_HISTORY_PARTS, ['historico_id','numero_parte','conteudo']);
  if (!readStagesV5_().length) writeStagesV5_(MONTHLY_STAGES);
  const modifiers = ensureSheet_(ss, SETTINGS.SHEET_MODIFIERS, ['presencas_minimas','fator']);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN_SECRET')) props.setProperty('TOKEN_SECRET',Utilities.getUuid()+Utilities.getUuid());
  if (!props.getProperty('ADMIN_PASSWORD_HASH')) props.setProperty('ADMIN_PASSWORD_HASH',sha256Hex_(SETTINGS.INITIAL_ADMIN_PASSWORD));

  if (!getMeta_('version')) setMeta_('version','1');
  if (!getMeta_('updatedAt')) setMeta_('updatedAt',new Date().toISOString());
  if (!getMeta_('schemaVersion')) setMeta_('schemaVersion',String(SETTINGS.SCHEMA_VERSION));
  if (!getMeta_('monthlyState')) setMonthlyState_(defaultMonthlyState_());
  if (modifiers.getLastRow() <= 1) saveModifiers_(defaultModifiers_());

  stylePublished_(pub);
  styleModifiers_(modifiers);
  return 'Setup v6 concluído.';
}

/**
 * Execute UMA VEZ ao migrar o backend v3 já preenchido.
 * NÃO use resetAllData() para migrar.
 *
 * A migração:
 * - preserva jogadores, pontos, presenças e colocações atuais;
 * - cria bônus = 0 e campos mensais = 0;
 * - salva uma cópia do estado v3 no HISTORICO (somente leitura);
 * - troca os fatores para o regulamento 2026/27;
 * - recalcula a fórmula geral da v4.
 */
function migrateV3ToV4() {
  validateSpreadsheetId_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
    const meta = ss.getSheetByName(SETTINGS.SHEET_META) || ensureSheet_(ss,SETTINGS.SHEET_META,['chave','valor']);
    const currentSchema = Number(getMeta_('schemaVersion') || 3);
    if (currentSchema >= 4 && hasV4PublishedHeader_(ss.getSheetByName(SETTINGS.SHEET_PUBLISHED))) {
      return 'A planilha já está na v4; nenhuma alteração foi feita.';
    }

    const legacyRows = readPublishedLegacyV3_();
    const oldModifiers = readModifiers_();
    const currentVersion = Number(getMeta_('version') || 1);

    ensureSheet_(ss,SETTINGS.SHEET_HISTORY,['historico_id','criado_em','versao','total_jogadores','snapshot_json']);
    if (legacyRows.length) saveHistory_(legacyRows,currentVersion,oldModifiers,defaultMonthlyState_(),3);

    ensureSheet_(ss,SETTINGS.SHEET_PUBLISHED,publishedHeaders_());
    ensureSheet_(ss,SETTINGS.SHEET_MODIFIERS,['presencas_minimas','fator']);

    const migrated = legacyRows.map(function(r){
      return {
        id:r.id,
        name:r.name,
        points:r.points,
        presences:r.presences,
        bonus:0,
        monthlyPoints:0,
        monthlyPresences:0,
        monthlyFinishes:zeroFinishes_(),
        finishes:cleanFinishes_(r.finishes),
        active:r.active !== false
      };
    });

    const monthlyState = defaultMonthlyState_();
    saveModifiers_(defaultModifiers_());
    setMonthlyState_(monthlyState);
    writePublished_(migrated,defaultModifiers_());

    setMeta_('schemaVersion','4');
    setMeta_('version',String(currentVersion+1));
    setMeta_('updatedAt',new Date().toISOString());
    pruneHistory_();
    return 'Migração v3 -> v4 concluída. Dados gerais preservados; bônus e ranking mensal iniciados em zero.';
  } finally {
    lock.releaseLock();
  }
}

/**
 * OPCIONAL — usar somente se os dados atuais de PUBLICADO pertencem integralmente
 * à primeira etapa do 3º ranking (desde 11/10/2026) e você quer aproveitar esses
 * números como base inicial do mensal.
 *
 * Antes de executar, altere TORNEIOS_JA_REALIZADOS para a quantidade real de
 * torneios válidos já disputados na etapa. Se tiver dúvida, NÃO execute.
 */
function seedCurrentMonthlyFromGeneral() {
  throw makeError_('DISABLED_V5','Na v5, cadastre torneios antigos como somente mensal para evitar duplicidade.');
}

function resetAllData() {
  throw makeError_('DISABLED_V5','Reset geral desativado nesta versão para proteger ranking, histórico e torneios.');
}

function doGet(e) {
  try {
    const action = String((e&&e.parameter&&e.parameter.action)||'ranking');
    if (action==='ranking') return json_(publicRanking_());
    if (action==='health') return json_({ok:true,service:'caligulas-ranking-v6',schemaVersion:SETTINGS.SCHEMA_VERSION,time:new Date().toISOString()});
    return json_({ok:false,code:'NOT_FOUND',message:'Ação não encontrada.'});
  } catch (err) {
    return json_({ok:false,code:err.code||'SERVER_ERROR',message:String(err.message||err)});
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse((e&&e.postData&&e.postData.contents)||'{}');
    const action = String(payload.action||'');
    if (action==='login') return json_(login_(payload.password));
    if (action==='adminState') {requireAuth_(payload.token);return json_(adminState_());}
    if (action==='publish') {requireAuth_(payload.token);return json_(publish_(payload));}
    if (action==='importBackup') {requireAuth_(payload.token);return json_(importBackupV6_(payload));}
    if (action==='restore') {requireAuth_(payload.token);return json_(restore_(payload));}
    if (action==='historySnapshot') {requireAuth_(payload.token);return json_(historySnapshot_(payload));}
    if (action==='deleteHistory') {requireAuth_(payload.token);return json_(deleteHistory_(payload));}
    if (action==='saveTournament') {requireAuth_(payload.token);return json_(saveTournamentV5_(payload));}
    if (action==='deleteTournament') {requireAuth_(payload.token);return json_(deleteTournamentV5_(payload));}
    if (action==='saveStages') {requireAuth_(payload.token);return json_(saveStagesV5_(payload));}
    if (action==='advanceStage') {requireAuth_(payload.token);return json_(advanceStageV5_(payload));}
    if (action==='reopenStage') {requireAuth_(payload.token);return json_(reopenStageV6_(payload));}
    return json_({ok:false,code:'BAD_ACTION',message:'Ação inválida.'});
  } catch (err) {
    return json_({ok:false,code:err.code||'SERVER_ERROR',message:String(err.message||err)});
  }
}

function publicRanking_() {
  const modifiers = readModifiers_();
  const rows = normalizeRows_(readPublished_(),modifiers);
  const monthlyState = readMonthlyState_();
  return {
    ok:true,
    source:'google-sheets',
    schemaVersion:SETTINGS.SCHEMA_VERSION,
    version:Number(getMeta_('version')||1),
    updatedAt:getMeta_('updatedAt')||null,
    modifiers:modifiers,
    monthly:publicMonthly_(rows,monthlyState),
    rows:rows.map(publicRow_)
  };
}

function adminState_() {
  const pub = publicRanking_();
  pub.monthlyState = readMonthlyState_();
  pub.history = listHistory_();
  pub.tournaments = readTournamentsV5_();
  pub.stages = stagesV5_();
  return pub;
}

function login_(password) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD_HASH');
  if (!expected) throw makeError_('SETUP_REQUIRED','Execute setupProject() primeiro.');
  const got = sha256Hex_(String(password||''));
  if (!constantTimeEqual_(expected,got)) {
    Utilities.sleep(350);
    throw makeError_('INVALID_LOGIN','Senha inválida.');
  }
  return {ok:true,token:createToken_(),expiresInHours:SETTINGS.SESSION_HOURS};
}

function requireVersionV6_(payload,version){
  if(Number(payload.baseVersion)!==version)throw makeError_('VERSION_CONFLICT','Os dados mudaram desde que o painel foi aberto. Recarregue antes de publicar.');
}

function captureStateV6_(){
  return {rows:readPublished_(),modifiers:readModifiers_(),monthlyState:readMonthlyState_(),stages:stagesV5_(),tournaments:readTournamentsV5_(),version:Number(getMeta_('version')||1),updatedAt:getMeta_('updatedAt'),schemaVersion:Number(getMeta_('schemaVersion')||5)};
}

function commitStateV6_(before,next){
  // Arquivar somente depois de validar a operação inteira, antes da primeira
  // alteração. O snapshot contém também o livro de torneios e o calendário.
  if(before.rows.length||before.version>1)saveHistory_(before.rows,before.version,before.modifiers,before.monthlyState,Math.max(5,before.schemaVersion));
  try{
    if(JSON.stringify(next.stages)!==JSON.stringify(before.stages))writeStagesV5_(next.stages);
    if(JSON.stringify(next.tournaments)!==JSON.stringify(before.tournaments))writeTournamentsV5_(next.tournaments);
    saveModifiers_(next.modifiers);
    writePublished_(next.rows,next.modifiers);
    setMonthlyState_(next.monthlyState);
    setMeta_('schemaVersion',String(SETTINGS.SCHEMA_VERSION));
    setMeta_('version',String(before.version+1));
    setMeta_('updatedAt',new Date().toISOString());
  }catch(error){
    try{
      writeStagesV5_(before.stages);writeTournamentsV5_(before.tournaments);
      saveModifiers_(before.modifiers);writePublished_(before.rows,before.modifiers);setMonthlyState_(before.monthlyState);
      setMeta_('schemaVersion',String(before.schemaVersion));setMeta_('version',String(before.version));setMeta_('updatedAt',before.updatedAt);
    }catch(rollbackError){
      throw makeError_('PARTIAL_WRITE','Não foi possível concluir nem reverter a gravação. Restaure a última versão de HISTORICO antes de tentar novamente. '+rollbackError.message);
    }
    throw error;
  }
  // Uma falha na limpeza de histórico não transforma publicação concluída em
  // erro aparente (que poderia incentivar uma segunda publicação).
  try{pruneHistory_();}catch(pruneError){console.warn('Histórico preservado sem limpeza: '+pruneError.message);}
}

function mergePublishRowsV6_(scope,input,current,modifiers){
  const incoming=normalizeRows_(input,modifiers);
  const byId={};current.forEach(function(row){byId[row.id]=row;});
  if(scope==='monthly'){
    const edits={};incoming.forEach(function(row){edits[row.id]=row;});
    const rows=current.map(function(row){
      const edit=edits[row.id];
      return edit?Object.assign({},row,{monthlyPoints:edit.monthlyPoints,monthlyPresences:edit.monthlyPresences,monthlyFinishes:edit.monthlyFinishes}):row;
    });
    incoming.filter(function(row){return !byId[row.id];}).forEach(function(row){
      rows.push(Object.assign({},row,{points:0,presences:0,bonus:0,finishes:zeroFinishes_()}));
    });
    return normalizeRows_(rows,modifiers);
  }
  if(scope==='general')return normalizeRows_(incoming.map(function(row){
    const previous=byId[row.id];
    return Object.assign({},row,{monthlyPoints:previous?previous.monthlyPoints:0,monthlyPresences:previous?previous.monthlyPresences:0,monthlyFinishes:previous?previous.monthlyFinishes:zeroFinishes_()});
  }),modifiers);
  return incoming;
}

function sameMonthlyRowsV6_(a,b){
  function data(rows){return rows.filter(function(r){return r.monthlyPoints||r.monthlyPresences||r.monthlyFinishes.some(function(n){return n;});}).map(function(r){return [r.id,r.monthlyPoints,r.monthlyPresences,cleanFinishes_(r.monthlyFinishes)];}).sort(function(x,y){return x[0].localeCompare(y[0]);});}
  return JSON.stringify(data(a))===JSON.stringify(data(b));
}

function validatedMonthlyStateV6_(value,stages){
  const input=value||{};const id=canonicalDateV6_(input.stageId);
  if(!stages.some(function(s){return s.id===id;}))throw makeError_('INVALID_MONTHLY_STAGE','Selecione uma etapa mensal válida.');
  const count=Number(input.tournamentCount);
  if(!Number.isSafeInteger(count)||count<0)throw makeError_('MONTHLY_COUNT','A quantidade de torneios válidos deve ser um inteiro maior ou igual a zero.');
  return {stageId:id,tournamentCount:count,finalized:input.finalized===true,bonusRecipients:Array.isArray(input.bonusRecipients)?input.bonusRecipients.map(function(r){return {id:String(r.id||''),name:String(r.name||''),bonus:round1_(r.bonus)};}):[],bonusAwardedAt:input.bonusAwardedAt?isoTimestampV6_(input.bonusAwardedAt):null};
}

function validateMonthlyCountV6_(state,events){
  const recorded=events.filter(function(e){return e.applyMonthly&&e.stageId===state.stageId;}).length;
  if(state.tournamentCount<recorded)throw makeError_('MONTHLY_COUNT','Há '+recorded+' torneios registrados na etapa. A quantidade válida não pode ser menor que os registros existentes.');
}

function validatePlayerReferencesV6_(rows,events){
  const ids={};rows.forEach(function(r){ids[r.id]=true;});
  events.forEach(function(event){event.entries.forEach(function(entry){
    if(!ids[entry.playerId])throw makeError_('PLAYER_HAS_TOURNAMENTS','Jogador vinculado a torneios ausente: '+entry.playerId+'. Remova ou corrija seus torneios antes de excluir o cadastro.');
  });});
}

function normalizeBackupV6_(backup,before){
  if(!backup||typeof backup!=='object'||!Array.isArray(backup.rows)||!Array.isArray(backup.modifiers))throw makeError_('INVALID_BACKUP','Backup sem jogadores ou modificadores.');
  const mode=String(backup.metadataMode||'');
  if(!['preserve','replace'].includes(mode))throw makeError_('INVALID_BACKUP','Informe se o backup preserva ou substitui torneios e etapas.');
  if(mode==='replace'&&(!Array.isArray(backup.stages)||!Array.isArray(backup.tournaments)))throw makeError_('INVALID_BACKUP','Backup completo precisa incluir etapas e torneios.');
  const stages=normalizeStagesV5_(mode==='replace'?backup.stages:before.stages);
  const modifiers=normalizeModifiers_(backup.modifiers);
  const rows=normalizeRows_(backup.rows,modifiers);
  if(!rows.length)throw makeError_('EMPTY_RANKING','O ranking não pode ser importado vazio.');
  const eventsInput=mode==='replace'?backup.tournaments:before.tournaments;
  const eventIds={};
  const tournaments=eventsInput.map(function(event){
    const id=String(event.id||'').trim();
    if(!id||id.length>100||eventIds[id])throw makeError_('DUPLICATE_TOURNAMENT','Torneio sem ID válido ou com ID duplicado.');
    eventIds[id]=true;
    const normalized=normalizeTournamentV5_(event,stages,event);
    normalized.createdAt=isoTimestampV6_(event.createdAt)||new Date().toISOString();
    normalized.updatedAt=isoTimestampV6_(event.updatedAt)||normalized.createdAt;
    return normalized;
  });
  const monthlyState=validatedMonthlyStateV6_(backup.monthlyState,stages);
  if(mode==='preserve'&&monthlyState.stageId!==before.monthlyState.stageId)throw makeError_('BACKUP_STAGE_MISMATCH','Este backup pertence a outra etapa. Use um backup completo para substituir também as etapas e os torneios.');
  validatePlayerReferencesV6_(rows,tournaments);
  validateMonthlyCountV6_(monthlyState,tournaments);
  const players={};rows.forEach(function(r){players[r.id]=r;});
  const recipients={};
  monthlyState.bonusRecipients.forEach(function(recipient){
    if(!players[recipient.id]||recipients[recipient.id]||!Number.isFinite(recipient.bonus)||recipient.bonus<0||players[recipient.id].bonus<recipient.bonus)throw makeError_('INVALID_BONUS','Beneficiários do bônus mensal inconsistentes no backup.');
    recipients[recipient.id]=true;
  });
  if(!monthlyState.finalized&&(monthlyState.bonusRecipients.length||monthlyState.bonusAwardedAt))throw makeError_('INVALID_BONUS','Etapa em andamento não pode conter bônus já finalizado.');
  if(monthlyState.finalized&&(!monthlyState.tournamentCount||!monthlyState.bonusAwardedAt||!Number.isFinite(Date.parse(monthlyState.bonusAwardedAt))))throw makeError_('INVALID_BONUS','Etapa finalizada precisa ter torneios válidos e data de finalização.');
  if(monthlyState.finalized){
    if(rows.some(function(row){return row.monthlyPresences>monthlyState.tournamentCount;}))throw makeError_('MONTHLY_PRESENCES','Backup finalizado com mais presenças que torneios válidos. Corrija o arquivo antes de importar.');
    const expected=monthlyBonusAward_(rows,monthlyState).recipients;
    function bonusIds(items){return items.map(function(item){return [item.id,item.bonus];}).sort(function(a,b){return a[0].localeCompare(b[0]);});}
    if(JSON.stringify(bonusIds(expected))!==JSON.stringify(bonusIds(monthlyState.bonusRecipients)))throw makeError_('INVALID_BONUS','O bônus finalizado não corresponde ao resultado mensal do backup. Corrija os beneficiários antes de importar.');
  }
  // As pontuações são o estado do backup, incluindo ajustes manuais. Não
  // reaplicar os eventos nem conceder novamente um bônus já contabilizado.
  return {rows:rows,modifiers:modifiers,monthlyState:monthlyState,stages:stages,tournaments:tournaments};
}

function importBackupV6_(payload){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    requireV4_();const before=captureStateV6_();requireVersionV6_(payload,before.version);
    const next=normalizeBackupV6_(payload.backup,before);
    commitStateV6_(before,next);
    return adminState_();
  }finally{lock.releaseLock();}
}

function reopenStageV6_(payload){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    requireV4_();const before=captureStateV6_();requireVersionV6_(payload,before.version);
    if(!before.monthlyState.finalized)throw makeError_('STAGE_NOT_FINALIZED','Esta etapa já está em andamento.');
    const rows=normalizeRows_(before.rows,before.modifiers);const byId={};rows.forEach(function(r){byId[r.id]=r;});
    const seen={};before.monthlyState.bonusRecipients.forEach(function(recipient){
      const row=byId[recipient.id];const amount=Number(recipient.bonus);
      if(!row||seen[recipient.id]||!Number.isFinite(amount)||amount<0||row.bonus<amount)throw makeError_('BONUS_REVERSAL','O bônus de '+String(recipient.name||recipient.id)+' foi alterado manualmente. Corrija o bônus geral antes de reabrir a etapa.');
      seen[recipient.id]=true;row.bonus=round1_(row.bonus-amount);
    });
    const state=Object.assign({},before.monthlyState,{finalized:false,bonusRecipients:[],bonusAwardedAt:null});
    commitStateV6_(before,{rows:rows,modifiers:before.modifiers,monthlyState:state,stages:before.stages,tournaments:before.tournaments});
    return adminState_();
  }finally{lock.releaseLock();}
}

function publish_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    requireV4_();
    const currentVersion = Number(getMeta_('version')||1);
    requireVersionV6_(payload,currentVersion);
    if (!Array.isArray(payload.rows)) throw makeError_('INVALID_ROWS','Lista de jogadores inválida.');
    const scope=String(payload.scope||'all');
    if(!['all','general','monthly'].includes(scope))throw makeError_('INVALID_SCOPE','Publicação inválida.');
    const before=captureStateV6_();
    const currentRows=before.rows,currentModifiers=before.modifiers,currentMonthlyState=before.monthlyState;
    const modifiers=scope==='monthly'?currentModifiers:normalizeModifiers_(payload.modifiers||currentModifiers);
    let monthlyState=scope==='general'?normalizeMonthlyState_(currentMonthlyState):validatedMonthlyStateV6_(payload.monthlyState||currentMonthlyState,before.stages);
    let rows=mergePublishRowsV6_(scope,payload.rows,currentRows,modifiers);
    validatePlayerReferencesV6_(rows,before.tournaments);
    validateMonthlyCountV6_(monthlyState,before.tournaments);
    validateMonthlyTransition_(currentMonthlyState,monthlyState,rows);
    // O cliente não pode reabrir uma etapa nem reescrever o bônus de uma
    // finalização anterior por meio de uma publicação comum.
    if(currentMonthlyState.finalized&&currentMonthlyState.stageId===monthlyState.stageId){
      if(!monthlyState.finalized||monthlyState.tournamentCount!==currentMonthlyState.tournamentCount||!sameMonthlyRowsV6_(currentRows,rows))throw makeError_('STAGE_LOCKED','A etapa está finalizada. Restaure um backup para fazer uma correção auditada.');
      if(currentMonthlyState.bonusRecipients.some(function(recipient){return !rows.some(function(row){return row.id===recipient.id;});}))throw makeError_('BONUS_RECIPIENT_REMOVED','Reabra a etapa antes de excluir um jogador que recebeu o bônus mensal.');
      monthlyState.bonusRecipients=currentMonthlyState.bonusRecipients;
      monthlyState.bonusAwardedAt=currentMonthlyState.bonusAwardedAt;
    }
    const requestedFinalize = currentMonthlyState.stageId===monthlyState.stageId && !currentMonthlyState.finalized && monthlyState.finalized;
    if (requestedFinalize) {
      if(!monthlyState.tournamentCount)throw makeError_('MONTHLY_COUNT','Informe os torneios válidos antes de finalizar.');
      if(rows.some(function(r){return r.monthlyPresences>monthlyState.tournamentCount;}))throw makeError_('MONTHLY_PRESENCES','Há jogador com mais presenças que torneios válidos. Corrija a contagem ou as presenças antes de finalizar.');
      const award = monthlyBonusAward_(rows,monthlyState);
      if (award.recipients.length) {
        rows = rows.map(function(r){
          const hit = award.recipients.find(function(x){return x.id===r.id;});
          if (hit) r.bonus = round1_(Number(r.bonus||0)+Number(hit.bonus||0));
          return r;
        });
      }
      monthlyState.bonusRecipients = award.recipients;
      monthlyState.bonusAwardedAt = new Date().toISOString();
      rows = normalizeRows_(rows,modifiers);
    } else if(!monthlyState.finalized){
      monthlyState.bonusRecipients=[];
      monthlyState.bonusAwardedAt=null;
    }
    if (!rows.length) throw makeError_('EMPTY_RANKING','O ranking não pode ser publicado vazio.');
    commitStateV6_(before,{rows:rows,modifiers:modifiers,monthlyState:monthlyState,stages:before.stages,tournaments:before.tournaments});
    return adminState_();
  } finally {
    lock.releaseLock();
  }
}

function restore_(payload) {
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    requireV4_();
    const currentVersion=Number(getMeta_('version')||1);
    requireVersionV6_(payload,currentVersion);
    const historyId=String(payload.historyId||'');
    const record=getHistoryRecord_(historyId);
    if(!record)throw makeError_('HISTORY_NOT_FOUND','Versão histórica não encontrada.');
    if(Number(record.snapshot.schemaVersion||3)<5)throw makeError_('LEGACY_HISTORY','Esta versão é anterior à migração v5. Ela pode ser visualizada, mas não restaurada.');
    const before=captureStateV6_();
    const next=normalizeBackupV6_(Object.assign({},record.snapshot,{metadataMode:'replace'}),before);
    commitStateV6_(before,next);
    return adminState_();
  } finally {
    lock.releaseLock();
  }
}

function historySnapshot_(payload) {
  const info=getHistoryRecord_(String(payload.historyId||''));
  if(!info)throw makeError_('HISTORY_NOT_FOUND','Versão histórica não encontrada.');
  const snap=info.snapshot||{};
  const schemaVersion=Number(snap.schemaVersion||3);
  const modifiers=normalizeModifiers_(snap.modifiers||defaultModifiers_());
  const rows=(snap.rows||[]).map(function(r){
    if(schemaVersion<4){
      const legacyFinal=Number(r.finalPoints);
      const normalized=normalizeRow_(r,modifiers);
      if(Number.isFinite(legacyFinal))normalized.finalPoints=legacyFinal;
      return normalized;
    }
    return normalizeRow_(r,modifiers);
  }).sort(compareRows_).map(publicRow_);
  return {
    ok:true,
    history:{id:info.id,createdAt:info.createdAt,version:info.version,total:info.total,schemaVersion:schemaVersion},
    modifiers:modifiers,
    monthlyState:schemaVersion>=4?normalizeMonthlyState_(snap.monthlyState||defaultMonthlyState_()):null,
    rows:rows
  };
}

function deleteHistory_(payload) {
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
  const historyId=String(payload.historyId||'');
  if(!historyId)throw makeError_('HISTORY_NOT_FOUND','Versão histórica não encontrada.');
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
  const sh=ss.getSheetByName(SETTINGS.SHEET_HISTORY);
  if(!sh||sh.getLastRow()<2)throw makeError_('HISTORY_NOT_FOUND','Versão histórica não encontrada.');
  const values=sh.getRange(2,1,sh.getLastRow()-1,1).getValues();
  for(let i=0;i<values.length;i++){
    if(String(values[i][0])===historyId){sh.deleteRow(i+2);deleteHistoryPartsV5_(historyId);return {ok:true,history:listHistory_()};}
  }
  throw makeError_('HISTORY_NOT_FOUND','Versão histórica não encontrada.');
  }finally{lock.releaseLock();}
}

function normalizeModifiers_(value) {
  const source=Array.isArray(value)?value:defaultModifiers_();
  const byThreshold={};
  source.forEach(function(item){
    const minPresences=Math.max(0,Math.floor(Number(item&&item.minPresences!=null?item.minPresences:item&&item.presences)||0));
    const factor=Number(item&&item.factor);
    if(!Number.isFinite(factor)||factor<=0)return;
    if(minPresences===0&&factor===1)return;
    byThreshold[minPresences]=Math.round(factor*1000)/1000;
  });
  return Object.keys(byThreshold).map(function(key){return {minPresences:Number(key),factor:byThreshold[key]};}).sort(function(a,b){return a.minPresences-b.minPresences;});
}

function factorFor_(presences,modifiers) {
  const p=Math.max(0,Math.floor(Number(presences)||0));
  const rules=normalizeModifiers_(modifiers);
  let factor=1;
  for(let i=0;i<rules.length;i++){if(p>=rules[i].minPresences)factor=rules[i].factor;else break;}
  return factor;
}

function zeroFinishes_(){return [0,0,0,0,0,0,0,0,0];}
function cleanFinishes_(value){const a=Array.isArray(value)?value:[];const out=[];for(let i=0;i<9;i++)out.push(Math.max(0,Math.floor(Number(a[i])||0)));return out;}
function round1_(value){return Math.round((Number(value)||0)*10)/10;}

function normalizeRow_(r,modifiers) {
  const points=Math.max(0,Number(r.points!=null?r.points:r.pontos)||0);
  const presences=Math.max(0,Math.floor(Number(r.presences!=null?r.presences:r.presencas)||0));
  const bonus=Math.max(0,Number(r.bonus)||0);
  const factor=factorFor_(presences,modifiers);
  const monthlyPoints=Math.max(0,Number(r.monthlyPoints)||0);
  const monthlyPresences=Math.max(0,Math.floor(Number(r.monthlyPresences)||0));
  return {
    id:String(r.id||('p_'+Utilities.getUuid())).slice(0,80),
    name:String(r.name||r.nome||'').trim().slice(0,100),
    points:round1_(points),
    presences:presences,
    factor:factor,
    bonus:round1_(bonus),
    finalPoints:round1_(points*factor+presences+bonus),
    finishes:cleanFinishes_(r.finishes),
    monthlyPoints:round1_(monthlyPoints),
    monthlyPresences:monthlyPresences,
    monthlyFinalPoints:round1_(monthlyPoints+monthlyPresences),
    monthlyFinishes:cleanFinishes_(r.monthlyFinishes),
    active:r.active!==false
  };
}

function normalizeRows_(rows,modifiers) {
  const used={};
  return (Array.isArray(rows)?rows:[]).map(function(r){
    const row=normalizeRow_(r,modifiers);
    if(!row.name||row.active===false)return null;
    if(used[row.id])throw makeError_('DUPLICATE_ID','Existem jogadores com ID duplicado.');
    used[row.id]=true;
    return row;
  }).filter(function(x){return !!x;}).sort(compareRows_);
}

function compareRows_(a,b){
  if(b.finalPoints!==a.finalPoints)return b.finalPoints-a.finalPoints;
  for(let i=0;i<9;i++)if(b.finishes[i]!==a.finishes[i])return b.finishes[i]-a.finishes[i];
  return String(a.name).localeCompare(String(b.name),'pt-BR');
}

function compareMonthlyRows_(a,b){
  if(b.monthlyFinalPoints!==a.monthlyFinalPoints)return b.monthlyFinalPoints-a.monthlyFinalPoints;
  for(let i=0;i<9;i++)if(b.monthlyFinishes[i]!==a.monthlyFinishes[i])return b.monthlyFinishes[i]-a.monthlyFinishes[i];
  return String(a.name).localeCompare(String(b.name),'pt-BR');
}

function sameMonthlyResult_(a,b){
  if(!a||!b||a.monthlyFinalPoints!==b.monthlyFinalPoints)return false;
  for(let i=0;i<9;i++)if(a.monthlyFinishes[i]!==b.monthlyFinishes[i])return false;
  return true;
}

function monthlyBonusAward_(rows,state){
  const count=Math.max(0,Math.floor(Number(state.tournamentCount)||0));
  if(!count)return {recipients:[]};
  const eligible=rows.filter(function(r){return r.monthlyPresences===count;}).sort(compareMonthlyRows_);
  if(!eligible.length)return {recipients:[]};
  const winner=eligible[0];
  const tied=eligible.filter(function(r){return sameMonthlyResult_(r,winner);});
  const share=round1_(10/tied.length);
  return {recipients:tied.map(function(r){return {id:r.id,name:r.name,bonus:share};})};
}

function publicMonthly_(rows,state){
  const stage=stageById_(state.stageId)||stagesV5_()[0]||MONTHLY_STAGES[0];
  const count=Math.max(0,Math.floor(Number(state.tournamentCount)||0));
  const monthlyRows=rows.filter(function(r){return r.monthlyPoints>0||r.monthlyPresences>0;}).sort(compareMonthlyRows_).map(function(r){
    return {
      id:r.id,
      name:r.name,
      points:r.monthlyPoints,
      presences:r.monthlyPresences,
      finalPoints:r.monthlyFinalPoints,
      finishes:cleanFinishes_(r.monthlyFinishes),
      eligible:count>0&&r.monthlyPresences===count
    };
  });
  return {
    stage:stage,
    tournamentCount:count,
    finalized:Boolean(state.finalized),
    bonusRecipients:Array.isArray(state.bonusRecipients)?state.bonusRecipients:[],
    bonusAwardedAt:state.bonusAwardedAt||null,
    rows:monthlyRows
  };
}

function validateMonthlyTransition_(current,next,rows){
  const currentStage=stageById_(current.stageId);
  const nextStage=stageById_(next.stageId);
  if(!nextStage)throw makeError_('INVALID_MONTHLY_STAGE','Etapa mensal inválida.');
  if(currentStage&&currentStage.id!==nextStage.id)throw makeError_('MONTHLY_STAGE_CHANGE','Use Avançar etapa para trocar a etapa ativa, ou importe um backup completo.');
}

function normalizeMonthlyState_(value){
  const v=value||{};
  const stage=stageById_(canonicalDateV6_(v.stageId))||stageForDate_(dateKey_(new Date()))||stagesV5_()[0]||MONTHLY_STAGES[0];
  return {
    stageId:stage.id,
    tournamentCount:Math.max(0,Math.floor(Number(v.tournamentCount)||0)),
    finalized:Boolean(v.finalized),
    bonusRecipients:Array.isArray(v.bonusRecipients)?v.bonusRecipients.map(function(x){return {id:String(x.id||''),name:String(x.name||''),bonus:round1_(x.bonus)};}).filter(function(x){return x.id;}):[],
    bonusAwardedAt:v.bonusAwardedAt?String(v.bonusAwardedAt):null
  };
}

function stageById_(id){const key=canonicalDateV6_(id);return stagesV5_().find(function(s){return s.id===key;})||null;}
function stageForDate_(dateKey){return stagesV5_().find(function(s){return dateKey>=s.start&&dateKey<=s.end;})||null;}
function dateKey_(date){return Utilities.formatDate(date,Session.getScriptTimeZone()||'America/Sao_Paulo','yyyy-MM-dd');}

function canonicalDateV6_(value){
  if(Object.prototype.toString.call(value)==='[object Date]')return Number.isFinite(value.getTime())?dateKey_(value):'';
  const raw=String(value==null?'':value).trim();
  const iso=/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/.exec(raw);
  if(iso)return iso[1];
  const localized=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if(localized)return localized[3]+'-'+localized[2]+'-'+localized[1];
  // A versão anterior converteu células Date com String(date). Recuperar a
  // data impressa evita depender do parser/localidade do navegador ou do GAS.
  const verbose=/^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})\b/i.exec(raw);
  if(verbose){
    const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(verbose[1].toLowerCase())+1;
    return verbose[3]+'-'+String(month).padStart(2,'0')+'-'+String(Number(verbose[2])).padStart(2,'0');
  }
  return raw;
}

function isoTimestampV6_(value){
  if(value==null||value==='')return '';
  if(Object.prototype.toString.call(value)==='[object Date]')return Number.isFinite(value.getTime())?value.toISOString():'';
  const raw=String(value);const stamp=new Date(raw);
  return Number.isFinite(stamp.getTime())?stamp.toISOString():raw;
}

function publishedHeaders_(){
  return [
    'posicao','id','nome','pontos','presencas','fator','bonus','pontos_finais',
    '1_lugares','2_lugares','3_lugares','4_lugares','5_lugares','6_lugares','7_lugares','8_lugares','9_lugares',
    'mensal_pontos','mensal_presencas','mensal_total','mensal_1_lugares','mensal_2_lugares','mensal_3_lugares','mensal_4_lugares','mensal_5_lugares','mensal_6_lugares','mensal_7_lugares','mensal_8_lugares','mensal_9_lugares',
    'ativo','atualizado_em'
  ];
}

function hasV4PublishedHeader_(sh){
  if(!sh||sh.getLastColumn()<8)return false;
  const h=sh.getRange(1,1,1,Math.min(sh.getLastColumn(),publishedHeaders_().length)).getValues()[0].map(String);
  return h[6]==='bonus'&&h.indexOf('mensal_pontos')!==-1;
}

function writePublished_(rows,modifiers){
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
  const sh=ss.getSheetByName(SETTINGS.SHEET_PUBLISHED)||ensureSheet_(ss,SETTINGS.SHEET_PUBLISHED,publishedHeaders_());
  const normalized=normalizeRows_(rows,modifiers);
  const now=new Date().toISOString();
  if(sh.getMaxColumns()<publishedHeaders_().length)sh.insertColumnsAfter(sh.getMaxColumns(),publishedHeaders_().length-sh.getMaxColumns());
  sh.getRange(1,1,1,publishedHeaders_().length).setValues([publishedHeaders_()]);
  if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).clearContent().clearFormat();
  if(normalized.length){
    const values=normalized.map(function(r,i){
      return [i+1,r.id,r.name,r.points,r.presences,r.factor,r.bonus,r.finalPoints]
        .concat(r.finishes)
        .concat([r.monthlyPoints,r.monthlyPresences,r.monthlyFinalPoints])
        .concat(r.monthlyFinishes)
        .concat([true,now]);
    });
    sh.getRange(2,1,values.length,values[0].length).setValues(values);
  }
  stylePublished_(sh);
}

function readPublished_(){
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
  const sh=ss.getSheetByName(SETTINGS.SHEET_PUBLISHED);
  if(!sh||sh.getLastRow()<2)return [];
  if(!hasV4PublishedHeader_(sh))return readPublishedLegacyV3_();
  const cols=publishedHeaders_().length;
  const v=sh.getRange(2,1,sh.getLastRow()-1,cols).getValues();
  return v.filter(function(r){return r[1]&&r[29]!==false;}).map(function(r){
    return {
      id:String(r[1]),name:String(r[2]),points:Number(r[3])||0,presences:Number(r[4])||0,
      factor:Number(r[5])||1,bonus:Number(r[6])||0,finalPoints:Number(r[7])||0,
      finishes:r.slice(8,17).map(function(n){return Number(n)||0;}),
      monthlyPoints:Number(r[17])||0,monthlyPresences:Number(r[18])||0,monthlyFinalPoints:Number(r[19])||0,
      monthlyFinishes:r.slice(20,29).map(function(n){return Number(n)||0;}),active:r[29]!==false
    };
  }).sort(compareRows_);
}

function readPublishedLegacyV3_(){
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
  const sh=ss.getSheetByName(SETTINGS.SHEET_PUBLISHED);
  if(!sh||sh.getLastRow()<2)return [];
  if(hasV4PublishedHeader_(sh))return readPublished_();
  const width=Math.min(18,sh.getLastColumn());
  if(width<17)return [];
  const v=sh.getRange(2,1,sh.getLastRow()-1,width).getValues();
  return v.filter(function(r){return r[1]&&r[16]!==false;}).map(function(r){
    return {id:String(r[1]),name:String(r[2]),points:Number(r[3])||0,presences:Number(r[4])||0,factor:Number(r[5])||1,finalPoints:Number(r[6])||0,finishes:r.slice(7,16).map(function(n){return Number(n)||0;}),active:r[16]!==false};
  }).sort(function(a,b){return Number(b.finalPoints||0)-Number(a.finalPoints||0);});
}

function publicRow_(r){return {id:r.id,name:r.name,points:r.points,presences:r.presences,factor:r.factor,bonus:r.bonus,finalPoints:r.finalPoints,finishes:cleanFinishes_(r.finishes),monthlyPoints:r.monthlyPoints,monthlyPresences:r.monthlyPresences,monthlyFinalPoints:r.monthlyFinalPoints,monthlyFinishes:cleanFinishes_(r.monthlyFinishes)};}

function readModifiers_(){
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
  const sh=ss.getSheetByName(SETTINGS.SHEET_MODIFIERS);
  if(!sh)return defaultModifiers_();
  if(sh.getLastRow()<2)return [];
  return normalizeModifiers_(sh.getRange(2,1,sh.getLastRow()-1,2).getValues().map(function(r){return {minPresences:r[0],factor:r[1]};}));
}

function saveModifiers_(modifiers){
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
  const sh=ss.getSheetByName(SETTINGS.SHEET_MODIFIERS)||ensureSheet_(ss,SETTINGS.SHEET_MODIFIERS,['presencas_minimas','fator']);
  const rules=normalizeModifiers_(modifiers);
  sh.getRange(1,1,1,2).setValues([['presencas_minimas','fator']]);
  if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,2).clearContent().clearFormat();
  if(rules.length)sh.getRange(2,1,rules.length,2).setValues(rules.map(function(r){return [r.minPresences,r.factor];}));
  styleModifiers_(sh);
}

function stylePublished_(sh){
  const cols=publishedHeaders_().length;
  sh.setFrozenRows(1);
  sh.getRange(1,1,1,cols).setBackground('#070706').setFontColor('#F5F0E7').setFontWeight('bold').setHorizontalAlignment('center');
  if(sh.getLastRow()>1){
    const n=sh.getLastRow()-1;
    sh.getRange(2,1,n,cols).setFontColor('#181512').setBackground('#FAF8F2');
    if(n>=1)sh.getRange(2,1,1,cols).setBackground('#F2E5BA');
    if(n>=2)sh.getRange(3,1,1,cols).setBackground('#EDE8DE');
    if(n>=3)sh.getRange(4,1,1,cols).setBackground('#E8D8CA');
    sh.getRange(2,6,n,3).setNumberFormat('0.0');
    sh.getRange(2,1,n,1).setHorizontalAlignment('center');
  }
  sh.setColumnWidth(1,70);sh.setColumnWidth(2,160);sh.setColumnWidth(3,190);sh.setColumnWidths(4,5,100);sh.setColumnWidths(9,9,80);sh.setColumnWidths(18,3,110);sh.setColumnWidths(21,9,90);sh.setColumnWidth(30,70);sh.setColumnWidth(31,170);
}

function styleModifiers_(sh){
  sh.setFrozenRows(1);
  sh.getRange(1,1,1,2).setBackground('#070706').setFontColor('#F5F0E7').setFontWeight('bold').setHorizontalAlignment('center');
  if(sh.getLastRow()>1){sh.getRange(2,1,sh.getLastRow()-1,2).setBackground('#FAF8F2').setFontColor('#181512');sh.getRange(2,2,sh.getLastRow()-1,1).setNumberFormat('0.0##');}
  sh.setColumnWidth(1,180);sh.setColumnWidth(2,120);
}

function saveHistory_(rows,version,modifiers,monthlyState,schemaVersion){
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
  const sh=ss.getSheetByName(SETTINGS.SHEET_HISTORY)||ensureSheet_(ss,SETTINGS.SHEET_HISTORY,['historico_id','criado_em','versao','total_jogadores','snapshot_json']);
  const id='h_'+new Date().getTime()+'_'+Math.random().toString(36).slice(2,8);
  const snapshot={schemaVersion:Number(schemaVersion||SETTINGS.SCHEMA_VERSION),rows:rows||[],modifiers:normalizeModifiers_(modifiers||defaultModifiers_()),monthlyState:normalizeMonthlyState_(monthlyState||defaultMonthlyState_())};
  if (Number(schemaVersion)>=5) { snapshot.tournaments=readTournamentsV5_(); snapshot.stages=stagesV5_(); }
  const json=JSON.stringify(snapshot);
  if(json.length<=30000){sh.appendRow([id,new Date().toISOString(),version,(rows||[]).length,json]);return;}
  const parts=ensureSheet_(ss,SETTINGS.SHEET_HISTORY_PARTS,['historico_id','numero_parte','conteudo']);
  // Cada célula do Sheets tem limite de caracteres: dividir snapshots grandes.
  for(let i=0;i<json.length;i+=25000)parts.appendRow([id,Math.floor(i/25000),json.slice(i,i+25000)]);
  sh.appendRow([id,new Date().toISOString(),version,(rows||[]).length,'@PARTS_V5:'+id+':'+Math.ceil(json.length/25000)]);
}

function listHistory_(){
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
  const sh=ss.getSheetByName(SETTINGS.SHEET_HISTORY);
  if(!sh||sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,5).getValues().map(function(r){
    let schemaVersion=3;if(String(r[4]||'').indexOf('@PARTS_V5:')===0) schemaVersion=5;else try{schemaVersion=Number(JSON.parse(String(r[4]||'{}')).schemaVersion||3);}catch(e){}
    return {id:String(r[0]),createdAt:isoTimestampV6_(r[1]),version:Number(r[2]),total:Number(r[3]),schemaVersion:schemaVersion,restorable:schemaVersion>=5};
  }).reverse().slice(0,SETTINGS.MAX_HISTORY);
}

function getHistoryRecord_(id){
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
  const sh=ss.getSheetByName(SETTINGS.SHEET_HISTORY);
  if(!sh||sh.getLastRow()<2)return null;
  const row=sh.getRange(2,1,sh.getLastRow()-1,5).getValues().find(function(r){return String(r[0])===id;});
  if(!row)return null;
  let snapshot;try{snapshot=JSON.parse(readHistorySnapshotV5_(String(row[4]||'{}'),id));}catch(e){snapshot=null;}
  if(!snapshot)return null;
  return {id:String(row[0]),createdAt:isoTimestampV6_(row[1]),version:Number(row[2]),total:Number(row[3]),snapshot:snapshot};
}

function pruneHistory_(){
 const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);const sh=ss.getSheetByName(SETTINGS.SHEET_HISTORY);
 const count=sh?sh.getLastRow()-1:0;
 if(count>SETTINGS.MAX_HISTORY){
   const ids=sh.getRange(2,1,count-SETTINGS.MAX_HISTORY,1).getValues().map(function(r){return String(r[0]);});
   sh.deleteRows(2,count-SETTINGS.MAX_HISTORY);
   ids.forEach(deleteHistoryPartsV5_);
 }
}
function readHistorySnapshotV5_(raw,id){
 if(raw.indexOf('@PARTS_V5:')!==0)return raw;
 const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID),sh=ss.getSheetByName(SETTINGS.SHEET_HISTORY_PARTS);
 if(!sh||sh.getLastRow()<2)throw makeError_('CORRUPT_HISTORY','Partes do histórico ausentes.');
 const parts=sh.getRange(2,1,sh.getLastRow()-1,3).getValues().filter(function(r){return String(r[0])===id;}).sort(function(a,b){return Number(a[1])-Number(b[1]);});
 if(!parts.length)throw makeError_('CORRUPT_HISTORY','Histórico incompleto.');
 const expected=Number(raw.split(':')[2]||0);
 if((expected&&parts.length!==expected)||parts.some(function(part,index){return Number(part[1])!==index;}))throw makeError_('CORRUPT_HISTORY','Histórico com partes ausentes ou duplicadas.');
 return parts.map(function(r){return String(r[2]);}).join('');
}
function deleteHistoryPartsV5_(id){
 const sh=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID).getSheetByName(SETTINGS.SHEET_HISTORY_PARTS);
 if(!sh||sh.getLastRow()<2)return;
 const values=sh.getRange(2,1,sh.getLastRow()-1,1).getValues();
 for(let i=values.length-1;i>=0;i--)if(String(values[i][0])===id)sh.deleteRow(i+2);
}

function readMonthlyState_(){
  const raw=getMeta_('monthlyState');
  if(!raw)return defaultMonthlyState_();
  try{return normalizeMonthlyState_(JSON.parse(raw));}catch(e){return defaultMonthlyState_();}
}
function setMonthlyState_(state){setMeta_('monthlyState',JSON.stringify(normalizeMonthlyState_(state)));}

function ensureSheet_(ss,name,headers){let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);if(sh.getMaxColumns()<headers.length)sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());sh.getRange(1,1,1,headers.length).setValues([headers]);sh.setFrozenRows(1);return sh;}
function resetSheet_(sh,headers){sh.clear();if(sh.getMaxColumns()<headers.length)sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());sh.getRange(1,1,1,headers.length).setValues([headers]);sh.setFrozenRows(1);}

function getMeta_(key){const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);const sh=ss.getSheetByName(SETTINGS.SHEET_META);if(!sh||sh.getLastRow()<2)return '';const row=sh.getRange(2,1,sh.getLastRow()-1,2).getValues().find(function(r){return String(r[0])===key;});return row?String(row[1]):'';}
function setMeta_(key,value){const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);const sh=ss.getSheetByName(SETTINGS.SHEET_META)||ensureSheet_(ss,SETTINGS.SHEET_META,['chave','valor']);const last=sh.getLastRow();if(last>=2){const v=sh.getRange(2,1,last-1,1).getValues();for(let i=0;i<v.length;i++){if(String(v[i][0])===key){sh.getRange(i+2,2).setValue(value);return;}}}sh.appendRow([key,value]);}

// A v6 lê a estrutura v5 sem apagar ou recriar os dados. A primeira gravação
// válida atualiza o marcador; migrateV5ToV6() também corrige as células antigas.
function requireV4_(){if(Number(getMeta_('schemaVersion')||0)<5)throw makeError_('MIGRATION_REQUIRED','Execute migrateV4ToV5() e migrateV5ToV6() antes de usar a gestão de torneios.');}
function validateSpreadsheetId_(){if(!SETTINGS.SPREADSHEET_ID||SETTINGS.SPREADSHEET_ID.indexOf('COLE_AQUI')!==-1)throw new Error('Preencha SETTINGS.SPREADSHEET_ID primeiro.');}

function createToken_(){const props=PropertiesService.getScriptProperties();const secret=props.getProperty('TOKEN_SECRET');if(!secret)throw makeError_('SETUP_REQUIRED','Execute setupProject().');const payload={exp:Date.now()+SETTINGS.SESSION_HOURS*60*60*1000,nonce:Utilities.getUuid()};const body=base64url_(JSON.stringify(payload));return body+'.'+sign_(body,secret);}
function requireAuth_(token){const parts=String(token||'').split('.');if(parts.length!==2)throw makeError_('AUTH_REQUIRED','Sessão inválida. Entre novamente.');const secret=PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');if(!secret||!constantTimeEqual_(parts[1],sign_(parts[0],secret)))throw makeError_('AUTH_REQUIRED','Sessão inválida.');let payload;try{payload=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());}catch(e){throw makeError_('AUTH_REQUIRED','Sessão inválida.');}if(!payload.exp||Date.now()>Number(payload.exp))throw makeError_('AUTH_EXPIRED','Sessão expirada. Entre novamente.');return true;}
function sign_(body,secret){return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body,secret,Utilities.Charset.UTF_8)).replace(/=+$/,'');}
function base64url_(s){return Utilities.base64EncodeWebSafe(s).replace(/=+$/,'');}
function sha256Hex_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8).map(function(b){return (b<0?b+256:b).toString(16).padStart(2,'0');}).join('');}
function constantTimeEqual_(a,b){a=String(a||'');b=String(b||'');let diff=a.length^b.length;const len=Math.max(a.length,b.length);for(let i=0;i<len;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function makeError_(code,message){const e=new Error(message);e.code=code;return e;}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}



/**
 * Migração v4 -> v5, SEM REDEFINIR o ranking. Execute uma vez no Apps Script.
 * Faça uma cópia do Google Sheets antes. Sem histórico de partidas na v4,
 * partidas antigas devem ser cadastradas como mensal apenas (sem geral).
 */
function migrateV4ToV5(){
  validateSpreadsheetId_();
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const ver=Number(getMeta_('schemaVersion')||0);
    if(ver<4)throw makeError_('MIGRATION_REQUIRED','Migre primeiro da v3 para a v4.');
    const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
    if(!hasV4PublishedHeader_(ss.getSheetByName(SETTINGS.SHEET_PUBLISHED)))throw makeError_('INVALID_SCHEMA','A aba PUBLICADO não está no formato v4.');
    ensureSheet_(ss,SETTINGS.SHEET_TOURNAMENTS,tournamentHeadersV5_());
    ensureSheet_(ss,SETTINGS.SHEET_STAGES,stageHeadersV5_());
    ensureSheet_(ss,SETTINGS.SHEET_HISTORY_PARTS,['historico_id','numero_parte','conteudo']);
    if(!readStagesV5_().length)writeStagesV5_(MONTHLY_STAGES);
    if(ver>=5)return 'Estrutura v5 já preparada; dados preservados.';
    // Não altera PUBLICADO, HISTORICO, META.monthlyState nem MODIFICADORES.
    setMeta_('schemaVersion','5');
    setMeta_('version',String(Number(getMeta_('version')||1)+1));
    setMeta_('updatedAt',new Date().toISOString());
    return 'Migração v4 -> v5 concluída: novas abas criadas, ranking e histórico antigos preservados.';
  } finally{lock.releaseLock();}
}

/** Execute uma vez ao substituir o Code.gs v5 por este arquivo. Preserva os
 * totais gerais/mensais e a senha existente; não executa setup nem reset. */
function migrateV5ToV6(){
  validateSpreadsheetId_();const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const schema=Number(getMeta_('schemaVersion')||0);
    if(schema<5)throw makeError_('MIGRATION_REQUIRED','Execute migrateV4ToV5() antes da migração v6.');
    if(schema>=6)return 'Estrutura v6 já preparada; dados preservados.';
    const before=captureStateV6_();const stages=normalizeStagesV5_(before.stages);
    saveHistory_(before.rows,before.version,before.modifiers,before.monthlyState,5);
    try{
      writeStagesV5_(stages);writeTournamentsV5_(before.tournaments);setMonthlyState_(before.monthlyState);
      setMeta_('schemaVersion','6');setMeta_('version',String(before.version+1));setMeta_('updatedAt',new Date().toISOString());
    }catch(error){
      try{writeStagesV5_(before.stages);writeTournamentsV5_(before.tournaments);setMonthlyState_(before.monthlyState);setMeta_('schemaVersion',String(schema));setMeta_('version',String(before.version));setMeta_('updatedAt',before.updatedAt);}
      catch(rollbackError){throw makeError_('PARTIAL_WRITE','Migração interrompida; restaure a última versão de HISTORICO. '+rollbackError.message);}
      throw error;
    }
    return 'Migração v5 -> v6 concluída. Datas e IDs corrigidos; ranking, torneios, senha e histórico preservados.';
  }finally{lock.releaseLock();}
}

function tournamentHeadersV5_(){return ['id','data','tipo','descricao','geral','mensal','etapa_id','participantes_json','criado_em','atualizado_em'];}
function stageHeadersV5_(){return ['id','nome','inicio','fim'];}
function readStagesV5_(){
  const sh=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID).getSheetByName(SETTINGS.SHEET_STAGES);
  if(!sh||sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,4).getValues().filter(function(r){return String(r[0]).trim();}).map(function(r){
    return {id:canonicalDateV6_(r[0]),label:String(r[1]),start:canonicalDateV6_(r[2]),end:canonicalDateV6_(r[3])};
  });
}
function stagesV5_(){const s=readStagesV5_();return s.length?s:MONTHLY_STAGES.map(function(x){return {id:x.id,label:x.label,start:x.start,end:x.end};});}
function validDateV5_(s){return /^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&!isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
function normalizeStagesV5_(input){
  if(!Array.isArray(input)||input.length<1||input.length>24)throw makeError_('INVALID_STAGES','Cadastre de 1 a 24 etapas.');
  const stages=input.map(function(r){return {id:canonicalDateV6_(r.id),label:String(r.label||'').trim().slice(0,80),start:canonicalDateV6_(r.start),end:canonicalDateV6_(r.end)};});
  const seen={};stages.forEach(function(st){
    if(!validDateV5_(st.id)||!st.label||!validDateV5_(st.start)||!validDateV5_(st.end)||st.end<st.start)throw makeError_('INVALID_STAGE','Etapa com ID, nome ou datas inválidas.');
    if(seen[st.id])throw makeError_('DUPLICATE_STAGE','IDs de etapa duplicados.');seen[st.id]=true;
  });
  stages.sort(function(a,b){return a.start.localeCompare(b.start);});
  for(let i=1;i<stages.length;i++)if(stages[i].start<=stages[i-1].end)throw makeError_('OVERLAPPING_STAGES','As datas das etapas não podem se sobrepor.');
  return stages;
}
function writeStagesV5_(stages){
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);const sh=ensureSheet_(ss,SETTINGS.SHEET_STAGES,stageHeadersV5_());
  if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,4).clearContent();
  if(stages.length)sh.getRange(2,1,stages.length,4).setNumberFormat('@').setValues(stages.map(function(x){return [x.id,x.label,x.start,x.end];}));
  sh.setColumnWidth(1,130);sh.setColumnWidth(2,160);sh.setColumnWidths(3,2,130);
}
function normalizeTournamentV5_(r,stages,existing){
  const id=existing?existing.id:String(r.id||'t_'+Utilities.getUuid());
  const date=canonicalDateV6_(r.date);
  const type=String(r.type||'regular');
  const general=r.applyGeneral!==false;
  const monthly=r.applyMonthly!==false;
  if(!validDateV5_(date)||!['regular','special'].includes(type))throw makeError_('INVALID_TOURNAMENT','Data ou tipo de torneio inválido.');
  const stageId=monthly?canonicalDateV6_(r.stageId):'';
  if(monthly&&!stages.some(function(st){return st.id===stageId;}))throw makeError_('INVALID_STAGE','Selecione uma etapa mensal válida.');
  if(!general&&!monthly)throw makeError_('EMPTY_TOURNAMENT','O torneio precisa contar para o geral ou para o mensal.');
  if(!Array.isArray(r.entries)||!r.entries.length||r.entries.length>1000)throw makeError_('INVALID_ENTRIES','Informe os participantes do torneio.');
  const seen={};const entries=r.entries.map(function(e){
    const playerId=String(e.playerId||e.id||''); const presence=Boolean(e.presence||e.placement);
    const placement=e.placement==null||e.placement===''?0:Number(e.placement);
    if(!playerId||seen[playerId]||!Number.isInteger(placement)||placement<0||placement>9)throw makeError_('INVALID_ENTRY','Participante repetido ou colocação inválida.');
    seen[playerId]=true;return {playerId:playerId,presence:presence,placement:placement};
  }).filter(function(e){return e.presence;});
  if(!entries.length)throw makeError_('EMPTY_ENTRIES','Marque ao menos uma presença.');
  return {id:id,date:date,type:type,name:String(r.name||'').trim().slice(0,120),applyGeneral:general,applyMonthly:monthly,stageId:stageId,entries:entries,createdAt:existing?existing.createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
}
function readTournamentsV5_(){
  const sh=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID).getSheetByName(SETTINGS.SHEET_TOURNAMENTS);
  if(!sh||sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,10).getValues().filter(function(r){return String(r[0]).trim();}).map(function(r){
    let entries=[];try{entries=JSON.parse(String(r[7]||'[]'));}catch(e){throw makeError_('INVALID_TOURNAMENT_DATA','Registro de torneio danificado: '+String(r[0]));}
    return {id:String(r[0]),date:canonicalDateV6_(r[1]),type:String(r[2]),name:String(r[3]),applyGeneral:r[4]===true||String(r[4]).toLowerCase()==='true',applyMonthly:r[5]===true||String(r[5]).toLowerCase()==='true',stageId:canonicalDateV6_(r[6]),entries:entries,createdAt:isoTimestampV6_(r[8]),updatedAt:isoTimestampV6_(r[9])};
  }).sort(function(a,b){return b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt);});
}
function writeTournamentsV5_(events){
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);const sh=ensureSheet_(ss,SETTINGS.SHEET_TOURNAMENTS,tournamentHeadersV5_());
  if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,10).clearContent();
  if(events.length){
    sh.getRange(2,1,events.length,4).setNumberFormat('@');
    sh.getRange(2,7,events.length,4).setNumberFormat('@');
    sh.getRange(2,1,events.length,10).setValues(events.map(function(e){return [e.id,canonicalDateV6_(e.date),e.type,e.name,e.applyGeneral,e.applyMonthly,canonicalDateV6_(e.stageId),JSON.stringify(e.entries),e.createdAt,e.updatedAt];}));
  }
  sh.setColumnWidths(1,4,140);sh.setColumnWidth(8,350);
}
function deltaTournamentV5_(rows,state,event,sign){
  if(!event)return;
  const monthly=event.applyMonthly&&event.stageId===state.stageId;
  if(monthly){state.tournamentCount+=sign;if(state.tournamentCount<0)throw makeError_('MONTHLY_COUNT','Contador de torneios não pode ficar negativo.');}
  const score=event.type==='special'?[20,18,16,14,13,12,11,10,9]:[15,12,10,8,7,6,5,4,3];
  const byId={};rows.forEach(function(r){byId[r.id]=r;});
  event.entries.forEach(function(entry){
    const row=byId[entry.playerId];if(!row)throw makeError_('UNKNOWN_PLAYER','Jogador de torneio não encontrado. Não exclua jogadores com histórico ativo.');
    const points=entry.placement?score[entry.placement-1]:0;
    if(event.applyGeneral){
      row.points=round1_(row.points+sign*points);row.presences+=sign;
      if(entry.placement)row.finishes[entry.placement-1]+=sign;
    }
    if(monthly){
      row.monthlyPoints=round1_(row.monthlyPoints+sign*points);row.monthlyPresences+=sign;
      if(entry.placement)row.monthlyFinishes[entry.placement-1]+=sign;
    }
    if(row.points<0||row.presences<0||row.monthlyPoints<0||row.monthlyPresences<0||row.finishes.some(function(n){return n<0;})||row.monthlyFinishes.some(function(n){return n<0;}))throw makeError_('INVALID_DELTA','Esta alteração retiraria pontos/presenças abaixo de zero. Revise lançamentos manuais.');
  });
}
function lockedStageV5_(stageId){
  if(!stageId)return false;
  const current=readMonthlyState_();
  const stages=stagesV5_();const currentIdx=stages.findIndex(function(x){return x.id===current.stageId;});
  const idx=stages.findIndex(function(x){return x.id===stageId;});
  return idx<currentIdx||(stageId===current.stageId&&current.finalized);
}
function writeTournamentChangeV5_(payload,deleteOnly){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    requireV4_();
    const before=captureStateV6_();requireVersionV6_(payload,before.version);
    const events=before.tournaments,stages=before.stages;
    const id=deleteOnly?String(payload.tournamentId||''):String((payload.tournament||{}).id||'');
    const old=events.find(function(e){return e.id===id;})||null;
    if(deleteOnly&&!old)throw makeError_('TOURNAMENT_NOT_FOUND','Torneio não encontrado.');
    const next=deleteOnly?null:normalizeTournamentV5_(payload.tournament||{},stages,old);
    if(old&&old.applyMonthly&&lockedStageV5_(old.stageId))throw makeError_('STAGE_LOCKED','Esta etapa já foi encerrada. Reabra uma correção assistida antes de alterar os resultados.');
    if(next&&next.applyMonthly&&lockedStageV5_(next.stageId))throw makeError_('STAGE_LOCKED','Etapa já finalizada; não é possível alterar torneios que contam para ela.');
    if(next&&!old&&events.some(function(e){return e.id===next.id;}))throw makeError_('DUPLICATE_TOURNAMENT','ID de torneio duplicado.');
    const rows=normalizeRows_(before.rows,before.modifiers);const state=normalizeMonthlyState_(before.monthlyState);
    if(old)deltaTournamentV5_(rows,state,old,-1);
    if(next)deltaTournamentV5_(rows,state,next,1);
    const updated=events.filter(function(e){return e.id!==id;});if(next)updated.push(next);
    validateMonthlyCountV6_(state,updated);
    commitStateV6_(before,{rows:rows,modifiers:before.modifiers,monthlyState:state,stages:stages,tournaments:updated});
    return adminState_();
  } finally{lock.releaseLock();}
}
function saveTournamentV5_(payload){return writeTournamentChangeV5_(payload,false);}
function deleteTournamentV5_(payload){return writeTournamentChangeV5_(payload,true);}
function saveStagesV5_(payload){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    requireV4_();const before=captureStateV6_();requireVersionV6_(payload,before.version);
    const stages=normalizeStagesV5_(payload.stages);
    const current=before.monthlyState;
    if(!stages.some(function(s){return s.id===current.stageId;}))throw makeError_('ACTIVE_STAGE_REMOVED','A etapa atual não pode ser removida.');
    const events=before.tournaments;
    if(events.some(function(t){return t.applyMonthly&&!stages.some(function(s){return s.id===t.stageId;});}))throw makeError_('STAGE_IN_USE','Uma etapa vinculada a torneios não pode ser removida.');
    const originals=before.stages;
    // Preservar a ordem relativa das etapas existentes evita desbloquear uma
    // etapa histórica com bônus já concedido por mera alteração das datas.
    const order=originals.map(function(st){return stages.findIndex(function(next){return next.id===st.id;});}).filter(function(i){return i>=0;});
    for(let i=1;i<order.length;i++)if(order[i]<=order[i-1])throw makeError_('STAGE_REORDER','Não é permitido reordenar etapas já existentes.');
    const active=originals.find(function(s){return s.id===current.stageId;});
    const next=stages.find(function(s){return s.id===current.stageId;});
    if(current.finalized&&(next.start!==active.start||next.end!==active.end))throw makeError_('STAGE_LOCKED','A etapa finalizada não pode ter suas datas alteradas.');
    commitStateV6_(before,{rows:before.rows,modifiers:before.modifiers,monthlyState:current,stages:stages,tournaments:events});
    return adminState_();
  } finally{lock.releaseLock();}
}
function advanceStageV5_(payload){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    requireV4_();const before=captureStateV6_();requireVersionV6_(payload,before.version);
    const state=before.monthlyState;if(!state.finalized)throw makeError_('STAGE_NOT_FINALIZED','Finalize e publique a etapa atual antes de avançar.');
    const stages=before.stages;const index=stages.findIndex(function(s){return s.id===state.stageId;});
    const next=stages[index+1];if(!next)throw makeError_('NO_NEXT_STAGE','Não existe próxima etapa cadastrada.');
    const rows=normalizeRows_(before.rows,before.modifiers);
    rows.forEach(function(r){r.monthlyPoints=0;r.monthlyPresences=0;r.monthlyFinalPoints=0;r.monthlyFinishes=zeroFinishes_();});
    const newState={stageId:next.id,tournamentCount:0,finalized:false,bonusRecipients:[],bonusAwardedAt:null};
    before.tournaments.filter(function(e){return e.applyMonthly&&e.stageId===next.id;}).forEach(function(e){
      // Aplica somente a contribuição mensal; o geral foi contabilizado no registro inicial.
      deltaTournamentV5_(rows,newState,Object.assign({},e,{applyGeneral:false}),1);
    });
    commitStateV6_(before,{rows:rows,modifiers:before.modifiers,monthlyState:newState,stages:stages,tournaments:before.tournaments});
    return adminState_();
  }finally{lock.releaseLock();}
}
