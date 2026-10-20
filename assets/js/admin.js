(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const cfg = window.CALIGULAS_CONFIG || {};
  const API_URL = cfg.appsScriptUrl || '';
  const TOKEN_KEY = 'caligulas_admin_token_v4';
  const DRAFT_KEY = 'caligulas_admin_draft_v4';

  const REGULAR_POINTS = [15, 12, 10, 8, 7, 6, 5, 4, 3];
  const SPECIAL_POINTS = [20, 18, 16, 14, 13, 12, 11, 10, 9];
  const DEFAULT_MODIFIERS = [
    { minPresences: 15, factor: 1.1 },
    { minPresences: 21, factor: 1.2 },
    { minPresences: 27, factor: 1.3 },
    { minPresences: 33, factor: 1.4 },
    { minPresences: 41, factor: 1.5 },
    { minPresences: 46, factor: 2.0 }
  ];
  const MONTHLY_STAGES = [
    { id: '2026-10-11', label: 'Etapa 1', start: '2026-10-11', end: '2026-11-14' },
    { id: '2026-11-15', label: 'Etapa 2', start: '2026-11-15', end: '2026-12-12' },
    { id: '2026-12-13', label: 'Etapa 3', start: '2026-12-13', end: '2027-01-16' },
    { id: '2027-01-17', label: 'Etapa 4', start: '2027-01-17', end: '2027-02-13' },
    { id: '2027-02-14', label: 'Etapa 5', start: '2027-02-14', end: '2027-03-13' },
    { id: '2027-03-14', label: 'Etapa 6', start: '2027-03-14', end: '2027-04-10' },
    { id: '2027-04-11', label: 'Etapa 7', start: '2027-04-11', end: '2027-04-12' }
  ];

  const state = {
    token: sessionStorage.getItem(TOKEN_KEY) || '',
    version: 1,
    updatedAt: null,
    publishedRows: [],
    draftRows: [],
    publishedModifiers: [],
    draftModifiers: [],
    publishedMonthlyState: null,
    draftMonthlyState: null,
    history: [],
    previewHistoryId: null
  };

  let tournamentEntries = new Map();
  const HISTORY_PAGE_SIZE = 5;
  let historyPage = 1;

  const clone = value => JSON.parse(JSON.stringify(value));
  const round1 = value => Math.round((Number(value) || 0) * 10) / 10;
  const uid = () => (window.crypto && crypto.randomUUID ? 'p_' + crypto.randomUUID() : 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const fmt = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(value) || 0);
  const fmtFactor = value => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 }).format(Number(value) || 1) + 'x';

  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function fmtDateOnly(value) {
    if (!value) return '—';
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return String(value);
    return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
  }

  function localDateKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function cleanFinishes(value) {
    const input = Array.isArray(value) ? value : [];
    return Array.from({ length: 9 }, (_, i) => Math.max(0, Math.floor(Number(input[i]) || 0)));
  }

  function normalizeModifiers(value) {
    const map = new Map();
    (Array.isArray(value) ? value : []).forEach(item => {
      const minPresences = Math.max(0, Math.floor(Number(item?.minPresences ?? item?.presences) || 0));
      const factor = Number(item?.factor);
      if (!Number.isFinite(factor) || factor <= 0) return;
      if (minPresences === 0 && factor === 1) return;
      map.set(minPresences, Math.round(factor * 1000) / 1000);
    });
    return Array.from(map.entries()).map(([minPresences, factor]) => ({ minPresences, factor })).sort((a, b) => a.minPresences - b.minPresences);
  }

  function factorFor(presences, modifiers = state.draftModifiers) {
    const p = Math.max(0, Math.floor(Number(presences) || 0));
    let factor = 1;
    normalizeModifiers(modifiers).forEach(rule => { if (p >= rule.minPresences) factor = rule.factor; });
    return factor;
  }

  function calculateRows(rows, modifiers = state.draftModifiers) {
    return clone(rows || []).map(row => {
      const points = Math.max(0, Number(row.points) || 0);
      const presences = Math.max(0, Math.floor(Number(row.presences) || 0));
      const bonus = Math.max(0, Number(row.bonus) || 0);
      const monthlyPoints = Math.max(0, Number(row.monthlyPoints) || 0);
      const monthlyPresences = Math.max(0, Math.floor(Number(row.monthlyPresences) || 0));
      const factor = factorFor(presences, modifiers);
      return {
        id: String(row.id || uid()),
        name: String(row.name || '').trim(),
        points: round1(points),
        presences,
        factor,
        bonus: round1(bonus),
        finalPoints: round1(points * factor + presences + bonus),
        finishes: cleanFinishes(row.finishes),
        monthlyPoints: round1(monthlyPoints),
        monthlyPresences,
        monthlyFinalPoints: round1(monthlyPoints + monthlyPresences),
        monthlyFinishes: cleanFinishes(row.monthlyFinishes),
        active: row.active !== false
      };
    }).filter(row => row.name && row.active !== false).sort(compareRows);
  }

  function compareRows(a, b) {
    if (b.finalPoints !== a.finalPoints) return b.finalPoints - a.finalPoints;
    for (let i = 0; i < 9; i += 1) if (b.finishes[i] !== a.finishes[i]) return b.finishes[i] - a.finishes[i];
    return String(a.name).localeCompare(String(b.name), 'pt-BR');
  }

  function compareMonthlyRows(a, b) {
    if (b.monthlyFinalPoints !== a.monthlyFinalPoints) return b.monthlyFinalPoints - a.monthlyFinalPoints;
    for (let i = 0; i < 9; i += 1) if (b.monthlyFinishes[i] !== a.monthlyFinishes[i]) return b.monthlyFinishes[i] - a.monthlyFinishes[i];
    return String(a.name).localeCompare(String(b.name), 'pt-BR');
  }

  function normalizeMonthlyState(value) {
    const stage = MONTHLY_STAGES.find(item => item.id === value?.stageId) || stageForDate(localDateKey()) || MONTHLY_STAGES[0];
    return {
      stageId: stage.id,
      tournamentCount: Math.max(0, Math.floor(Number(value?.tournamentCount) || 0)),
      finalized: Boolean(value?.finalized),
      bonusRecipients: Array.isArray(value?.bonusRecipients) ? clone(value.bonusRecipients) : [],
      bonusAwardedAt: value?.bonusAwardedAt || null
    };
  }

  function comparableRow(row) {
    return {
      id: row.id,
      name: String(row.name || '').trim(),
      points: Number(row.points) || 0,
      presences: Math.floor(Number(row.presences) || 0),
      bonus: Number(row.bonus) || 0,
      finishes: cleanFinishes(row.finishes),
      monthlyPoints: Number(row.monthlyPoints) || 0,
      monthlyPresences: Math.floor(Number(row.monthlyPresences) || 0),
      monthlyFinishes: cleanFinishes(row.monthlyFinishes)
    };
  }

  const sameRow = (a, b) => Boolean(a && b && JSON.stringify(comparableRow(a)) === JSON.stringify(comparableRow(b)));
  const modifiersEqual = (a, b) => JSON.stringify(normalizeModifiers(a)) === JSON.stringify(normalizeModifiers(b));
  const monthlyStateEqual = (a, b) => JSON.stringify(normalizeMonthlyState(a)) === JSON.stringify(normalizeMonthlyState(b));

  function changedPlayerIds() {
    const baseline = new Map(state.publishedRows.map(row => [row.id, row]));
    const draft = new Map(state.draftRows.map(row => [row.id, row]));
    const ids = new Set([...baseline.keys(), ...draft.keys()]);
    return Array.from(ids).filter(id => !sameRow(baseline.get(id), draft.get(id)));
  }

  function hasDraftChanges() {
    return changedPlayerIds().length > 0 || !modifiersEqual(state.publishedModifiers, state.draftModifiers) || !monthlyStateEqual(state.publishedMonthlyState, state.draftMonthlyState);
  }

  function stageForDate(date) { return MONTHLY_STAGES.find(stage => date >= stage.start && date <= stage.end) || null; }
  function stageById(id) { return MONTHLY_STAGES.find(stage => stage.id === id) || null; }
  function stageIndex(id) { return MONTHLY_STAGES.findIndex(stage => stage.id === id); }

  function toast(message, type = '') {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.className = 'toast'; }, 3400);
  }

  async function api(payload) {
    if (!API_URL) throw new Error('Endpoint do ranking não configurado.');
    const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
    const data = await response.json();
    if (!data.ok) { const error = new Error(data.message || 'Erro na API.'); error.code = data.code || 'API_ERROR'; throw error; }
    return data;
  }

  function handleApiError(error) {
    if (error?.code === 'AUTH_REQUIRED' || error?.code === 'AUTH_EXPIRED') {
      logout(false);
      toast('Sua sessão expirou. Entre novamente.', 'error');
      return;
    }
    if (error?.code === 'MIGRATION_REQUIRED') {
      toast('O Apps Script ainda precisa da migração v4.', 'error');
      return;
    }
    toast(error?.message || 'Não foi possível concluir a ação.', 'error');
  }

  async function login(password) {
    const data = await api({ action: 'login', password });
    state.token = data.token;
    sessionStorage.setItem(TOKEN_KEY, state.token);
    await loadAdminState();
  }

  async function loadAdminState() {
    const data = await api({ action: 'adminState', token: state.token });
    if (Number(data.schemaVersion || 0) < 4) throw new Error('Backend ainda está na v3. Atualize o Apps Script e execute migrateV3ToV4() antes de usar este painel.');
    state.version = Number(data.version) || 1;
    state.updatedAt = data.updatedAt || null;
    const incomingModifiers = Array.isArray(data.modifiers) ? data.modifiers : DEFAULT_MODIFIERS;
    state.publishedModifiers = normalizeModifiers(incomingModifiers);
    state.publishedRows = calculateRows(data.rows || [], state.publishedModifiers);
    state.publishedMonthlyState = normalizeMonthlyState(data.monthlyState || data.monthly || {});
    state.history = Array.isArray(data.history) ? data.history : []; historyPage = 1;

    const saved = readLocalDraft();
    if (saved && saved.baseVersion === state.version) {
      state.draftModifiers = normalizeModifiers(saved.modifiers || state.publishedModifiers);
      state.draftRows = calculateRows(saved.rows || state.publishedRows, state.draftModifiers);
      state.draftMonthlyState = normalizeMonthlyState(saved.monthlyState || state.publishedMonthlyState);
      toast('Rascunho local recuperado.');
    } else {
      state.draftModifiers = clone(state.publishedModifiers);
      state.draftRows = clone(state.publishedRows);
      state.draftMonthlyState = clone(state.publishedMonthlyState);
      if (saved) localStorage.removeItem(DRAFT_KEY);
    }

    showDashboard();
    renderAll();
  }

  function logout(showMessage = true) {
    state.token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    $('#dashboard').hidden = true;
    $('#loginView').hidden = false;
    $('#passwordInput').value = '';
    if (showMessage) toast('Sessão encerrada.');
  }

  function showDashboard() { $('#loginView').hidden = true; $('#dashboard').hidden = false; }

  function saveLocalDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ baseVersion: state.version, savedAt: new Date().toISOString(), rows: state.draftRows, modifiers: state.draftModifiers, monthlyState: state.draftMonthlyState }));
    toast('Rascunho salvo neste navegador.');
  }

  function readLocalDraft() { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch (_) { return null; } }
  function clearLocalDraft() { localStorage.removeItem(DRAFT_KEY); }

  function exportDraft() {
    const payload = { exportedAt: new Date().toISOString(), baseVersion: state.version, rows: state.draftRows, modifiers: state.draftModifiers, monthlyState: state.draftMonthlyState };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `caligulas-ranking-v4-rascunho-v${state.version}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  async function importDraftFile(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const rows = Array.isArray(parsed) ? parsed : parsed.rows;
      if (!Array.isArray(rows)) throw new Error('Arquivo sem lista de jogadores.');
      state.draftModifiers = normalizeModifiers(parsed.modifiers || state.draftModifiers);
      state.draftRows = calculateRows(rows, state.draftModifiers);
      state.draftMonthlyState = normalizeMonthlyState(parsed.monthlyState || state.draftMonthlyState);
      renderAll(); toast('Rascunho importado. Revise antes de publicar.');
    } catch (error) { toast(error.message || 'Arquivo inválido.', 'error'); }
  }

  function renderAll() {
    state.draftModifiers = normalizeModifiers(state.draftModifiers);
    state.draftRows = calculateRows(state.draftRows, state.draftModifiers);
    state.draftMonthlyState = normalizeMonthlyState(state.draftMonthlyState || state.publishedMonthlyState || {});
    $('#versionBadge').textContent = 'v' + state.version;
    renderPlayers(); renderTopPreview(); renderMonthlyPreview(); renderModifiers(); renderHistory(); renderDraftState(); renderMonthlyStatePanel();
  }

  function filteredRows() {
    const q = ($('#playerSearch').value || '').trim().toLocaleLowerCase('pt-BR');
    return state.draftRows.filter(row => !q || row.name.toLocaleLowerCase('pt-BR').includes(q));
  }

  function playerActions(row) {
    const baseline = state.publishedRows.find(item => item.id === row.id);
    const modified = !sameRow(baseline, row);
    return `<div class="row-actions">${modified ? `<button class="mini-button warning" data-revert-player="${esc(row.id)}" type="button">Remover modificação</button>` : ''}<button class="mini-button" data-edit-player="${esc(row.id)}" type="button">Editar</button><button class="mini-button danger" data-delete-player="${esc(row.id)}" type="button">Excluir</button></div>`;
  }

  function renderPlayers() {
    const rows = filteredRows(); const tbody = $('#playersTableBody'); const mobile = $('#mobilePlayerList');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Nenhum jogador.</td></tr>'; mobile.innerHTML = '<div class="empty-state">Nenhum jogador.</div>'; return; }
    tbody.innerHTML = rows.map(row => `<tr class="${changedPlayerIds().includes(row.id) ? 'is-modified' : ''}"><td><strong>${esc(row.name)}</strong></td><td>${fmt(row.points)}</td><td>${row.presences}</td><td>${fmtFactor(row.factor)}</td><td>${fmt(row.bonus)}</td><td><strong class="gold">${fmt(row.finalPoints)}</strong></td><td>${playerActions(row)}</td></tr>`).join('');
    mobile.innerHTML = rows.map(row => `<article class="player-card ${changedPlayerIds().includes(row.id) ? 'is-modified' : ''}"><div class="player-card-head"><strong>${esc(row.name)}</strong><span>${fmt(row.finalPoints)}</span></div><div class="player-stats"><span>${fmt(row.points)} pts</span><span>${row.presences} pres.</span><span>${fmtFactor(row.factor)}</span><span>bônus ${fmt(row.bonus)}</span></div>${playerActions(row)}</article>`).join('');
  }

  function renderTopList(rows, target, monthly = false) {
    target.innerHTML = rows.slice(0, 10).map((row, index) => `<div class="top-row"><span class="top-pos">${String(index + 1).padStart(2, '0')}</span><span class="top-name">${esc(row.name)}</span><strong>${fmt(monthly ? row.monthlyFinalPoints : row.finalPoints)}</strong></div>`).join('') || '<div class="empty-state">Ranking vazio.</div>';
  }

  function renderTopPreview() { renderTopList(state.draftRows, $('#topPreview')); }
  function renderMonthlyPreview() {
    const rows = clone(state.draftRows).filter(row => row.monthlyPoints > 0 || row.monthlyPresences > 0).sort(compareMonthlyRows);
    renderTopList(rows, $('#monthlyPreview'), true);
  }

  function renderModifiers() {
    const list = $('#modifierList'); const rules = normalizeModifiers(state.draftModifiers);
    list.innerHTML = rules.map((rule, index) => `<div class="modifier-row" data-modifier-index="${index}"><label><span>Presenças</span><input type="number" min="1" step="1" value="${rule.minPresences}" data-modifier-presences="${index}"></label><label><span>Fator</span><input type="number" min="0.1" step="0.1" value="${rule.factor}" data-modifier-factor="${index}"></label><button class="icon-button danger-soft" data-remove-modifier="${index}" type="button" aria-label="Remover modificador">×</button></div>`).join('') || '<div class="empty-state">Sem modificadores adicionais. Todos usam 1,0x.</div>';
  }

  function renderHistory() {
    const list = $('#historyList');
    const pager = $('#historyPagination');
    const items = Array.isArray(state.history) ? state.history : [];
    const pageCount = Math.max(1, Math.ceil(items.length / HISTORY_PAGE_SIZE));
    historyPage = Math.min(Math.max(1, historyPage), pageCount);

    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    list.innerHTML = items.slice(start, start + HISTORY_PAGE_SIZE).map(item => `
      <article class="history-item">
        <div>
          <strong>Versão ${item.version}</strong>
          <span>${fmtDate(item.createdAt)} · ${item.total} jogador${item.total === 1 ? '' : 'es'}${item.restorable === false ? ' · legado v3' : ''}</span>
        </div>
        <div class="history-actions">
          <button class="mini-button" data-preview-history="${esc(item.id)}" type="button">Visualizar</button>
          ${item.restorable === false ? '' : `<button class="mini-button warning" data-restore-history="${esc(item.id)}" type="button">Restaurar</button>`}
          <button class="mini-button danger" data-delete-history="${esc(item.id)}" type="button">Excluir</button>
        </div>
      </article>
    `).join('') || '<div class="empty-state">Nenhuma publicação anterior.</div>';

    pager.hidden = pageCount <= 1;
    pager.innerHTML = pageCount <= 1 ? '' : `
      <button class="mini-button" data-history-page="${historyPage - 1}" type="button" ${historyPage === 1 ? 'disabled' : ''} aria-label="Página anterior do histórico">Anterior</button>
      <span class="history-page-label" role="status">Página ${historyPage} de ${pageCount}</span>
      <button class="mini-button" data-history-page="${historyPage + 1}" type="button" ${historyPage === pageCount ? 'disabled' : ''} aria-label="Próxima página do histórico">Próxima</button>
    `;
  }

  function renderMonthlyStatePanel() {
    const ms = state.draftMonthlyState; const stage = stageById(ms.stageId) || MONTHLY_STAGES[0];
    $('#monthlyStageTitle').textContent = `${stage.label} · ${fmtDateOnly(stage.start)} a ${fmtDateOnly(stage.end)}`;
    $('#monthlyTournamentCount').textContent = `${ms.tournamentCount} torneio${ms.tournamentCount === 1 ? '' : 's'} válido${ms.tournamentCount === 1 ? '' : 's'}`;
    const recipients = Array.isArray(ms.bonusRecipients) ? ms.bonusRecipients : [];
    $('#monthlyStageStatus').textContent = ms.finalized ? (recipients.length ? `Finalizada · bônus publicado para ${recipients.map(item => item.name).join(', ')}` : 'Finalizada · sem elegível ao bônus') : 'Em andamento';
    $('#finalizeMonthlyBtn').disabled = ms.finalized || ms.tournamentCount < 1;
    $('#finalizeMonthlyBtn').textContent = ms.finalized ? 'Etapa finalizada' : 'Finalizar etapa mensal';
  }

  function renderDraftState() {
    const changed = changedPlayerIds();
    const modifierChanged = !modifiersEqual(state.publishedModifiers, state.draftModifiers);
    const monthlyChanged = !monthlyStateEqual(state.publishedMonthlyState, state.draftMonthlyState);
    const dirty = changed.length > 0 || modifierChanged || monthlyChanged;
    $('#draftState').textContent = dirty ? 'Alterações pendentes' : 'Sem alterações';
    $('#draftState').classList.toggle('dirty', dirty); $('#publishBtn').disabled = !dirty;
    const parts = [];
    if (changed.length) parts.push(`${changed.length} jogador${changed.length === 1 ? '' : 'es'} alterado${changed.length === 1 ? '' : 's'}`);
    if (modifierChanged) parts.push('fatores alterados');
    if (monthlyChanged) parts.push('etapa mensal alterada');
    $('#publishSummary').textContent = parts.length ? parts.join(' · ') : 'Nenhuma alteração pendente';
    $('#publishSubline').textContent = dirty ? 'As mudanças só chegam ao site depois de publicar.' : `Publicado em ${fmtDate(state.updatedAt)}.`;
  }

  function openPlayerModal(row = null) {
    $('#playerModalTitle').textContent = row ? 'Editar jogador' : 'Adicionar jogador';
    $('#playerIdInput').value = row?.id || ''; $('#playerNameInput').value = row?.name || '';
    $('#playerPointsInput').value = row?.points ?? 0; $('#playerPresencesInput').value = row?.presences ?? 0; $('#playerBonusInput').value = row?.bonus ?? 0;
    $('#playerMonthlyPointsInput').value = row?.monthlyPoints ?? 0; $('#playerMonthlyPresencesInput').value = row?.monthlyPresences ?? 0;
    $('#finishInputs').innerHTML = cleanFinishes(row?.finishes).map((value, i) => `<label class="field compact-field"><span>${i + 1}º lugares</span><input type="number" min="0" step="1" value="${value}" data-finish-input="${i}"></label>`).join('');
    $('#monthlyFinishInputs').innerHTML = cleanFinishes(row?.monthlyFinishes).map((value, i) => `<label class="field compact-field"><span>${i + 1}º lugares</span><input type="number" min="0" step="1" value="${value}" data-monthly-finish-input="${i}"></label>`).join('');
    $('#playerModal').showModal(); setTimeout(() => $('#playerNameInput').focus(), 50);
  }

  function savePlayerFromModal() {
    const id = $('#playerIdInput').value || uid(); const name = $('#playerNameInput').value.trim();
    if (!name) return toast('Informe o nome do jogador.', 'error');
    const row = {
      id, name,
      points: Math.max(0, Number($('#playerPointsInput').value) || 0), presences: Math.max(0, Math.floor(Number($('#playerPresencesInput').value) || 0)), bonus: Math.max(0, Number($('#playerBonusInput').value) || 0),
      finishes: $$('[data-finish-input]').map(input => Math.max(0, Math.floor(Number(input.value) || 0))),
      monthlyPoints: Math.max(0, Number($('#playerMonthlyPointsInput').value) || 0), monthlyPresences: Math.max(0, Math.floor(Number($('#playerMonthlyPresencesInput').value) || 0)),
      monthlyFinishes: $$('[data-monthly-finish-input]').map(input => Math.max(0, Math.floor(Number(input.value) || 0))), active: true
    };
    const index = state.draftRows.findIndex(item => item.id === id); if (index >= 0) state.draftRows[index] = row; else state.draftRows.push(row);
    state.draftRows = calculateRows(state.draftRows, state.draftModifiers); $('#playerModal').close(); renderAll();
  }

  function deletePlayer(id) { const row = state.draftRows.find(item => item.id === id); if (!row) return; if (!confirm(`Excluir ${row.name} do rascunho?`)) return; state.draftRows = state.draftRows.filter(item => item.id !== id); renderAll(); }
  function revertPlayer(id) { const baseline = state.publishedRows.find(item => item.id === id); if (baseline) { const index = state.draftRows.findIndex(item => item.id === id); if (index >= 0) state.draftRows[index] = clone(baseline); else state.draftRows.push(clone(baseline)); } else state.draftRows = state.draftRows.filter(item => item.id !== id); state.draftRows = calculateRows(state.draftRows, state.draftModifiers); renderAll(); toast('Modificação removida.'); }

  function openTournamentModal() {
    tournamentEntries = new Map(); $('#tournamentType').value = 'regular'; $('#tournamentDate').value = localDateKey(); $('#tournamentSearch').value = '';
    renderParticipants(); renderTournamentPreview(); $('#tournamentModal').showModal();
  }

  function renderParticipants() {
    const q = ($('#tournamentSearch').value || '').trim().toLocaleLowerCase('pt-BR');
    const rows = clone(state.draftRows).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).filter(row => !q || row.name.toLocaleLowerCase('pt-BR').includes(q));
    $('#participantList').innerHTML = rows.map(row => {
      const entry = tournamentEntries.get(row.id) || { presence: false, placement: null };
      return `<div class="participant-row" data-participant-id="${esc(row.id)}"><label class="presence-check"><input type="checkbox" data-presence-id="${esc(row.id)}" ${entry.presence ? 'checked' : ''}><span>${esc(row.name)}</span></label><select data-placement-id="${esc(row.id)}" aria-label="Colocação de ${esc(row.name)}"><option value="">Sem colocação</option>${Array.from({ length: 9 }, (_, i) => `<option value="${i + 1}" ${entry.placement === i + 1 ? 'selected' : ''}>${i + 1}º</option>`).join('')}</select></div>`;
    }).join('') || '<div class="empty-state">Nenhum jogador encontrado.</div>';
  }

  function tournamentInputState() {
    return Array.from(tournamentEntries.entries()).map(([id, entry]) => ({ id, presence: Boolean(entry.presence || entry.placement), placement: entry.placement ? Number(entry.placement) : null })).filter(entry => entry.presence || entry.placement);
  }

  function prepareStageForTournament(date, mutate = false) {
    const target = stageForDate(date); if (!target) throw new Error('A data informada está fora do período do ranking 2026/27.');
    const rows = clone(state.draftRows); const monthlyState = clone(state.draftMonthlyState);
    if (monthlyState.stageId !== target.id) {
      if (!monthlyState.finalized) throw new Error('Finalize e publique a etapa mensal anterior antes de registrar um torneio da próxima etapa.');
      if (state.publishedMonthlyState?.stageId === monthlyState.stageId && !state.publishedMonthlyState?.finalized) {
        throw new Error('A etapa foi finalizada apenas no rascunho. Publique a finalização antes de iniciar a próxima etapa.');
      }
      const currentIndex = stageIndex(monthlyState.stageId); const targetIndex = stageIndex(target.id);
      if (targetIndex !== currentIndex + 1) throw new Error('A troca de etapa deve acontecer em sequência. Revise a data do torneio.');
      rows.forEach(row => { row.monthlyPoints = 0; row.monthlyPresences = 0; row.monthlyFinalPoints = 0; row.monthlyFinishes = cleanFinishes(); });
      monthlyState.stageId = target.id; monthlyState.tournamentCount = 0; monthlyState.finalized = false; monthlyState.bonusRecipients = []; monthlyState.bonusAwardedAt = null;
    } else if (monthlyState.finalized) throw new Error('Esta etapa já foi finalizada. Registre o próximo torneio na etapa seguinte.');
    if (mutate) { state.draftRows = rows; state.draftMonthlyState = monthlyState; }
    return { rows, monthlyState, target };
  }

  function tournamentPreviewState() {
    const date = $('#tournamentDate').value || localDateKey(); const type = $('#tournamentType').value; const pointsMap = type === 'special' ? SPECIAL_POINTS : REGULAR_POINTS;
    let snapshot; try { snapshot = prepareStageForTournament(date, false); } catch (_) { return { rows: state.draftRows, monthlyState: state.draftMonthlyState }; }
    const byId = new Map(snapshot.rows.map(row => [row.id, row]));
    tournamentInputState().forEach(entry => {
      const row = byId.get(entry.id); if (!row || !entry.presence) return;
      row.presences += 1; row.monthlyPresences += 1;
      if (entry.placement && entry.placement >= 1 && entry.placement <= 9) {
        const value = pointsMap[entry.placement - 1]; row.points += value; row.monthlyPoints += value;
        row.finishes = cleanFinishes(row.finishes); row.monthlyFinishes = cleanFinishes(row.monthlyFinishes); row.finishes[entry.placement - 1] += 1; row.monthlyFinishes[entry.placement - 1] += 1;
      }
    });
    snapshot.monthlyState.tournamentCount += 1;
    return { rows: calculateRows(snapshot.rows, state.draftModifiers), monthlyState: snapshot.monthlyState };
  }

  function renderTournamentPreview() { renderTopList(tournamentPreviewState().rows, $('#tournamentPreview')); }

  function applyTournament() {
    const entries = tournamentInputState(); if (!entries.length) return toast('Marque pelo menos uma presença.', 'error');
    const date = $('#tournamentDate').value; if (!date) return toast('Informe a data do torneio.', 'error');
    try { prepareStageForTournament(date, true); } catch (error) { return toast(error.message, 'error'); }
    const type = $('#tournamentType').value; const pointsMap = type === 'special' ? SPECIAL_POINTS : REGULAR_POINTS; const byId = new Map(state.draftRows.map(row => [row.id, row]));
    entries.forEach(entry => {
      const row = byId.get(entry.id); if (!row || !entry.presence) return;
      row.presences += 1; row.monthlyPresences += 1;
      if (entry.placement && entry.placement >= 1 && entry.placement <= 9) {
        const value = pointsMap[entry.placement - 1]; row.points += value; row.monthlyPoints += value;
        row.finishes = cleanFinishes(row.finishes); row.monthlyFinishes = cleanFinishes(row.monthlyFinishes); row.finishes[entry.placement - 1] += 1; row.monthlyFinishes[entry.placement - 1] += 1;
      }
    });
    state.draftMonthlyState.tournamentCount += 1; state.draftRows = calculateRows(state.draftRows, state.draftModifiers);
    $('#tournamentModal').close(); renderAll(); toast('Torneio adicionado ao rascunho. Colocações repetidas são aceitas em caso de acordo.');
  }

  function finalizeMonthlyDraft() {
    if (state.draftMonthlyState.finalized) return;
    if (state.draftMonthlyState.tournamentCount < 1) return toast('Não há torneios válidos nesta etapa.', 'error');
    const count = state.draftMonthlyState.tournamentCount;
    const eligible = state.draftRows.filter(row => row.monthlyPresences >= count).sort(compareMonthlyRows);
    const message = eligible.length ? `Finalizar a etapa? Ao publicar, o Apps Script calculará e somará o bônus de 10 pontos ao melhor jogador com 100% de presença.` : 'Finalizar a etapa sem conceder bônus? Nenhum jogador possui 100% de presença.';
    if (!confirm(message)) return;
    state.draftMonthlyState.finalized = true; state.draftMonthlyState.bonusRecipients = []; state.draftMonthlyState.bonusAwardedAt = null; renderAll(); toast('Etapa marcada para finalização. Publique para calcular o bônus.');
  }

  function addModifier() { const rules = normalizeModifiers(state.draftModifiers); const last = rules[rules.length - 1]; state.draftModifiers.push({ minPresences: last ? last.minPresences + 5 : 15, factor: last ? Math.round((last.factor + 0.1) * 10) / 10 : 1.1 }); renderAll(); }
  function updateModifier(index, field, value) { const rules = normalizeModifiers(state.draftModifiers); if (!rules[index]) return; if (field === 'minPresences') rules[index].minPresences = Math.max(1, Math.floor(Number(value) || 1)); if (field === 'factor') rules[index].factor = Math.max(0.1, Number(value) || 1); state.draftModifiers = normalizeModifiers(rules); state.draftRows = calculateRows(state.draftRows, state.draftModifiers); renderAll(); }
  function removeModifier(index) { const rules = normalizeModifiers(state.draftModifiers); rules.splice(index, 1); state.draftModifiers = normalizeModifiers(rules); state.draftRows = calculateRows(state.draftRows, state.draftModifiers); renderAll(); }
  function resetModifiers() { state.draftModifiers = clone(state.publishedModifiers); state.draftRows = calculateRows(state.draftRows, state.draftModifiers); renderAll(); }

  function absorbPublished(data) {
    state.version = data.version; state.updatedAt = data.updatedAt;
    state.publishedModifiers = normalizeModifiers(Array.isArray(data.modifiers) ? data.modifiers : DEFAULT_MODIFIERS); state.draftModifiers = clone(state.publishedModifiers);
    state.publishedRows = calculateRows(data.rows || [], state.publishedModifiers); state.draftRows = clone(state.publishedRows);
    state.publishedMonthlyState = normalizeMonthlyState(data.monthlyState || data.monthly || {}); state.draftMonthlyState = clone(state.publishedMonthlyState);
    state.history = data.history || []; historyPage = 1; clearLocalDraft(); renderAll();
  }

  async function publishDraft() {
    if (!hasDraftChanges()) return; if (!confirm('Publicar este rascunho no ranking do site?')) return;
    const btn = $('#publishBtn'); btn.disabled = true; btn.textContent = 'Publicando...';
    try { const data = await api({ action: 'publish', token: state.token, baseVersion: state.version, rows: state.draftRows, modifiers: state.draftModifiers, monthlyState: state.draftMonthlyState }); absorbPublished(data); toast('Ranking geral e mensal publicados.'); }
    catch (error) { handleApiError(error); }
    finally { btn.textContent = 'Publicar ranking'; btn.disabled = !hasDraftChanges(); }
  }

  async function previewHistory(id) {
    try {
      const data = await api({ action: 'historySnapshot', token: state.token, historyId: id }); state.previewHistoryId = id;
      $('#historyPreviewTitle').textContent = `Versão ${data.history.version}`; $('#historyPreviewMeta').textContent = `${fmtDate(data.history.createdAt)} · ${data.history.total} jogadores${data.history.schemaVersion < 4 ? ' · histórico legado v3' : ''}`;
      $('#historyRankingPreview').innerHTML = data.rows.map((row, index) => `<div class="history-rank-row"><span>${index + 1}</span><strong>${esc(row.name)}</strong><em>${fmt(row.finalPoints)}</em></div>`).join('') || '<div class="empty-state">Ranking vazio.</div>';
      $('#historyModifierPreview').innerHTML = ['<div class="history-mod-row"><span>0+ presenças</span><strong>1,0x</strong></div>', ...(data.modifiers || []).map(rule => `<div class="history-mod-row"><span>${rule.minPresences}+ presenças</span><strong>${fmtFactor(rule.factor)}</strong></div>`)].join('');
      $('#restoreFromPreviewBtn').hidden = data.history.schemaVersion < 4; $('#historyPreviewModal').showModal();
    } catch (error) { handleApiError(error); }
  }

  async function restoreHistory(id) {
    const item = state.history.find(history => history.id === id); if (item?.restorable === false) return toast('Versões anteriores à v4 são somente leitura.', 'error');
    if (!confirm(`Restaurar a versão ${item?.version ?? ''}? O ranking atual será salvo no histórico antes da restauração.`)) return;
    try { const data = await api({ action: 'restore', token: state.token, baseVersion: state.version, historyId: id }); absorbPublished(data); $('#historyPreviewModal').close(); toast('Versão restaurada e publicada.'); } catch (error) { handleApiError(error); }
  }

  async function deleteHistory(id) { const item = state.history.find(history => history.id === id); if (!confirm(`Excluir definitivamente a versão ${item?.version ?? ''} do histórico?`)) return; try { const data = await api({ action: 'deleteHistory', token: state.token, historyId: id }); state.history = data.history || []; renderHistory(); toast('Histórico excluído.'); } catch (error) { handleApiError(error); } }
  function discardDraft() { if (hasDraftChanges() && !confirm('Descartar todas as alterações do rascunho?')) return; state.draftRows = clone(state.publishedRows); state.draftModifiers = clone(state.publishedModifiers); state.draftMonthlyState = clone(state.publishedMonthlyState); clearLocalDraft(); renderAll(); }

  function bindEvents() {
    $('#historyPagination').addEventListener('click', event => {
      const target = event.target.closest('[data-history-page]');
      if (!target || target.disabled) return;
      const next = Number(target.dataset.historyPage);
      if (!Number.isInteger(next) || next < 1) return;
      historyPage = next;
      renderHistory();
    });
    $('#loginForm').addEventListener('submit', async event => { event.preventDefault(); const status = $('#loginStatus'); status.textContent = 'Entrando...'; try { await login($('#passwordInput').value); status.textContent = ''; } catch (error) { status.textContent = error.message || 'Não foi possível entrar.'; } });
    $('#logoutBtn').addEventListener('click', () => logout()); $('#openTournamentBtn').addEventListener('click', openTournamentModal); $('#addPlayerBtn').addEventListener('click', () => openPlayerModal()); $('#savePlayerBtn').addEventListener('click', savePlayerFromModal);
    $('#saveLocalBtn').addEventListener('click', saveLocalDraft); $('#exportBtn').addEventListener('click', exportDraft); $('#importBtn').addEventListener('click', () => $('#importFileInput').click());
    $('#importFileInput').addEventListener('change', event => { importDraftFile(event.target.files?.[0]); event.target.value = ''; }); $('#discardDraftBtn').addEventListener('click', discardDraft); $('#publishBtn').addEventListener('click', publishDraft); $('#playerSearch').addEventListener('input', renderPlayers);
    $('#addModifierBtn').addEventListener('click', addModifier); $('#resetModifiersBtn').addEventListener('click', resetModifiers); $('#finalizeMonthlyBtn').addEventListener('click', finalizeMonthlyDraft);
    $('#tournamentSearch').addEventListener('input', renderParticipants); $('#tournamentType').addEventListener('change', renderTournamentPreview); $('#tournamentDate').addEventListener('change', renderTournamentPreview);
    $('#participantList').addEventListener('change', event => { const participant = event.target.closest('[data-participant-id]'); if (!participant) return; const id = participant.dataset.participantId; const checkbox = participant.querySelector('[data-presence-id]'); const select = participant.querySelector('[data-placement-id]'); if (event.target.matches('[data-placement-id]') && select.value) checkbox.checked = true; tournamentEntries.set(id, { presence: checkbox.checked, placement: select.value ? Number(select.value) : null }); renderTournamentPreview(); });
    $('#applyTournamentBtn').addEventListener('click', applyTournament);

    document.addEventListener('click', event => {
      const edit = event.target.closest('[data-edit-player]'); if (edit) { const row = state.draftRows.find(item => item.id === edit.dataset.editPlayer); if (row) openPlayerModal(row); return; }
      const revert = event.target.closest('[data-revert-player]'); if (revert) return revertPlayer(revert.dataset.revertPlayer);
      const del = event.target.closest('[data-delete-player]'); if (del) return deletePlayer(del.dataset.deletePlayer);
      const removeModifierBtn = event.target.closest('[data-remove-modifier]'); if (removeModifierBtn) return removeModifier(Number(removeModifierBtn.dataset.removeModifier));
      const preview = event.target.closest('[data-preview-history]'); if (preview) return previewHistory(preview.dataset.previewHistory);
      const restore = event.target.closest('[data-restore-history]'); if (restore) return restoreHistory(restore.dataset.restoreHistory);
      const deleteHistoryBtn = event.target.closest('[data-delete-history]'); if (deleteHistoryBtn) return deleteHistory(deleteHistoryBtn.dataset.deleteHistory);
      const closer = event.target.closest('[data-close-dialog]'); if (closer) document.getElementById(closer.dataset.closeDialog)?.close();
    });

    $('#modifierList').addEventListener('change', event => { if (event.target.matches('[data-modifier-presences]')) updateModifier(Number(event.target.dataset.modifierPresences), 'minPresences', event.target.value); if (event.target.matches('[data-modifier-factor]')) updateModifier(Number(event.target.dataset.modifierFactor), 'factor', event.target.value); });
    $('#restoreFromPreviewBtn').addEventListener('click', () => { if (state.previewHistoryId) restoreHistory(state.previewHistoryId); });
    window.addEventListener('beforeunload', event => { if (!hasDraftChanges()) return; event.preventDefault(); event.returnValue = ''; });
  }

  async function boot() {
    bindEvents(); if (!state.token) return;
    try { await loadAdminState(); } catch (error) { sessionStorage.removeItem(TOKEN_KEY); state.token = ''; handleApiError(error); }
  }

  boot();
})();