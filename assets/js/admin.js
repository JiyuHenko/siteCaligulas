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
  let MONTHLY_STAGES = [
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
    tournaments: [],
    stages: [],
    previewHistoryId: null
  };

  let tournamentEntries = new Map();
  let editingTournamentId = null;
  let activeManagementTab = "players";
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

  // Apps Script/Sheets may return calendar dates as ISO strings, Date objects
  // or "Sun Oct 11 2026 00:00:00 GMT-0300 (Horário Padrão de Brasília)".
  // Keep an ISO calendar key for comparisons and inputs (without timezone drift).
  function dateKey(value) {
    if (value === null || value === undefined || value === '') return '';
    const raw = String(value).trim();
    let year, month, day;
    let match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(raw);
    if (match) {
      year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
    } else if ((match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw))) {
      day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
    } else if ((match = /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})\b/i.exec(raw))) {
      const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      year = Number(match[3]); month = months.indexOf(match[1].toLowerCase()) + 1; day = Number(match[2]);
    } else {
      const parsed = new Date(value);
      if (!Number.isFinite(parsed.getTime())) return '';
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(parsed);
      const part = type => Number(parts.find(item => item.type === type)?.value);
      year = part('year'); month = part('month'); day = part('day');
    }
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '';
    return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
  }

  function fmtDateOnly(value) {
    const key = dateKey(value);
    return key ? key.slice(8, 10) + '/' + key.slice(5, 7) + '/' + key.slice(0, 4) : '—';
  }

  function normalizeStages(value) {
    return (Array.isArray(value) ? value : MONTHLY_STAGES).map(stage => ({
      ...stage,
      start: dateKey(stage.start),
      end: dateKey(stage.end)
    }));
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

  const MONTHLY_FIELDS = ['monthlyPoints', 'monthlyPresences', 'monthlyFinishes'];
  const GENERAL_FIELDS = ['name', 'points', 'presences', 'bonus', 'finishes'];

  function sameMonthlyFields(a, b) {
    return Boolean(a && b
      && round1(a.monthlyPoints) === round1(b.monthlyPoints)
      && Number(a.monthlyPresences) === Number(b.monthlyPresences)
      && JSON.stringify(cleanFinishes(a.monthlyFinishes)) === JSON.stringify(cleanFinishes(b.monthlyFinishes)));
  }

  function sameGeneralFields(a, b) {
    return Boolean(a && b && GENERAL_FIELDS.every(field =>
      JSON.stringify(field === 'finishes' ? cleanFinishes(a[field]) : a[field]) ===
      JSON.stringify(field === 'finishes' ? cleanFinishes(b[field]) : b[field])));
  }

  function monthlyChangedPlayerIds() {
    const baseline = new Map(state.publishedRows.map(row => [row.id, row]));
    return state.draftRows.filter(row => baseline.has(row.id)
      && !sameMonthlyFields(baseline.get(row.id), row)).map(row => row.id);
  }

  function generalChangedPlayerIds() {
    const baseline = new Map(state.publishedRows.map(row => [row.id, row]));
    const draft = new Map(state.draftRows.map(row => [row.id, row]));
    return [...new Set([...baseline.keys(), ...draft.keys()])].filter(id =>
      !baseline.has(id) || !draft.has(id) || !sameGeneralFields(baseline.get(id), draft.get(id)));
  }

  function hasMonthlyDraftChanges() { return monthlyChangedPlayerIds().length > 0; }
  function hasGeneralDraftChanges() {
    return generalChangedPlayerIds().length > 0
      || !modifiersEqual(state.publishedModifiers, state.draftModifiers)
      || !monthlyStateEqual(state.publishedMonthlyState, state.draftMonthlyState);
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
      toast('O Apps Script ainda precisa da migração v5.', 'error');
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
    if (Number(data.schemaVersion || 0) < 5) throw new Error('Backend ainda está na v4. Atualize o Apps Script e execute migrateV4ToV5() antes de usar este painel.');
    state.version = Number(data.version) || 1;
    state.updatedAt = data.updatedAt || null;
    const incomingModifiers = Array.isArray(data.modifiers) ? data.modifiers : DEFAULT_MODIFIERS;
    state.publishedModifiers = normalizeModifiers(incomingModifiers);
    state.publishedRows = calculateRows(data.rows || [], state.publishedModifiers);
    state.publishedMonthlyState = normalizeMonthlyState(data.monthlyState || data.monthly || {});
    state.history = Array.isArray(data.history) ? data.history : []; historyPage = 1;
    state.stages = normalizeStages(data.stages);
    MONTHLY_STAGES = clone(state.stages);
    state.tournaments = Array.isArray(data.tournaments) ? data.tournaments : [];

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

  function saveDraftWithoutToast() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      baseVersion: state.version, savedAt: new Date().toISOString(),
      rows: state.draftRows, modifiers: state.draftModifiers, monthlyState: state.draftMonthlyState
    }));
  }
  function saveLocalDraft() {
    saveDraftWithoutToast();
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
    renderPlayers(); renderMonthlyPlayers(); renderTopPreview(); renderMonthlyPreview(); renderModifiers(); renderHistory(); renderDraftState(); renderMonthlyDraftState(); renderMonthlyStatePanel(); renderTournamentRecords(); renderStageEditor();
  }

  function filteredRows() {
    const q = ($('#playerSearch').value || '').trim().toLocaleLowerCase('pt-BR');
    return state.draftRows.filter(row => !q || row.name.toLocaleLowerCase('pt-BR').includes(q));
  }

  function playerActions(row) {
    const baseline = state.publishedRows.find(item => item.id === row.id);
    const modified = Boolean(baseline && !sameGeneralFields(baseline, row)) || !baseline;
    return `<div class="row-actions">${modified ? `<button class="mini-button warning" data-revert-player="${esc(row.id)}" type="button">Remover modificação</button>` : ''}<button class="mini-button" data-edit-player="${esc(row.id)}" type="button">Editar</button><button class="mini-button danger" data-delete-player="${esc(row.id)}" type="button">Excluir</button></div>`;
  }

  function renderPlayers() {
    const rows = filteredRows(); const tbody = $('#playersTableBody'); const mobile = $('#mobilePlayerList');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Nenhum jogador.</td></tr>'; mobile.innerHTML = '<div class="empty-state">Nenhum jogador.</div>'; return; }
    tbody.innerHTML = rows.map(row => `<tr class="${generalChangedPlayerIds().includes(row.id) ? 'is-modified' : ''}"><td><strong>${esc(row.name)}</strong></td><td>${fmt(row.points)}</td><td>${row.presences}</td><td>${fmtFactor(row.factor)}</td><td>${fmt(row.bonus)}</td><td><strong class="gold">${fmt(row.finalPoints)}</strong></td><td>${playerActions(row)}</td></tr>`).join('');
    mobile.innerHTML = rows.map(row => `<article class="player-card ${generalChangedPlayerIds().includes(row.id) ? 'is-modified' : ''}"><div class="player-card-head"><strong>${esc(row.name)}</strong><span>${fmt(row.finalPoints)}</span></div><div class="player-stats"><span>${fmt(row.points)} pts</span><span>${row.presences} pres.</span><span>${fmtFactor(row.factor)}</span><span>bônus ${fmt(row.bonus)}</span></div>${playerActions(row)}</article>`).join('');
  }

  function filteredMonthlyRows() {
    const query = ($('#monthlyPlayerSearch').value || '').trim().toLocaleLowerCase('pt-BR');
    return state.draftRows.slice().sort(compareMonthlyRows).filter(row => !query || row.name.toLocaleLowerCase('pt-BR').includes(query));
  }

  function renderMonthlyPlayers() {
    const rows = filteredMonthlyRows();
    const all = state.draftRows.slice().sort(compareMonthlyRows);
    const modified = new Set(monthlyChangedPlayerIds());
    const finished = Boolean(state.draftMonthlyState?.finalized);
    const tbody = $('#monthlyPlayersTableBody');
    const cards = $('#monthlyMobilePlayerList');
    const action = row => `<div class="row-actions">
      ${modified.has(row.id) ? `<button class="mini-button warning" type="button" data-revert-monthly="${esc(row.id)}">Desfazer</button>` : ''}
      <button class="mini-button" type="button" data-edit-monthly="${esc(row.id)}" ${finished || !state.publishedRows.some(item => item.id === row.id) ? 'disabled' : ''}>Editar</button>
    </div>`;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Nenhum jogador encontrado.</td></tr>';
      cards.innerHTML = '<div class="empty-state">Nenhum jogador encontrado.</div>';
      return;
    }
    tbody.innerHTML = rows.map(row => `
      <tr class="${modified.has(row.id) ? 'is-modified' : ''}">
        <td>${all.indexOf(row) + 1}º</td>
        <td><strong>${esc(row.name)}</strong></td>
        <td>${fmt(row.monthlyPoints)}</td>
        <td>${row.monthlyPresences}</td>
        <td><strong class="gold">${fmt(row.monthlyFinalPoints)}</strong></td>
        <td>${action(row)}</td>
      </tr>`).join('');
    cards.innerHTML = rows.map(row => `
      <article class="player-card ${modified.has(row.id) ? 'is-modified' : ''}">
        <div class="player-card-head"><strong>${esc(row.name)}</strong><span>${fmt(row.monthlyFinalPoints)} pts</span></div>
        <div class="player-stats"><span>${fmt(row.monthlyPoints)} pontos</span><span>${row.monthlyPresences} presenças</span></div>
        ${action(row)}
      </article>`).join('');
  }

  function renderMonthlyDraftState() {
    const changed = monthlyChangedPlayerIds().length;
    const status = $('#monthlyDraftState');
    status.textContent = changed ? 'Alterações pendentes' : 'Sem alterações';
    status.classList.toggle('dirty', changed > 0);
    const finalized = Boolean(state.draftMonthlyState?.finalized);
    $('#publishMonthlyBtn').disabled = !changed || finalized;
    $('#monthlyPublishSummary').textContent = changed
      ? `${changed} jogador${changed === 1 ? '' : 'es'} com pontuação mensal alterada`
      : 'Nenhuma alteração mensal pendente';
    $('#monthlyPublishSubline').textContent = finalized
      ? 'Etapa já finalizada. Resultados mensais bloqueados.'
      : changed ? 'As alterações mensais só aparecem no site após publicar.'
        : 'Somente a etapa mensal atual é alterada nesta aba.';
    const stage = stageById(state.draftMonthlyState?.stageId);
    $('#monthlyEditorStage').textContent = stage
      ? `${stage.label} · ${fmtDateOnly(stage.start)} a ${fmtDateOnly(stage.end)}`
      : 'Etapa mensal atual';
  }

  function openMonthlyPlayerModal(id) {
    const row = state.draftRows.find(item => item.id === id);
    if (!row) return;
    if (state.draftMonthlyState?.finalized) return toast('A etapa já foi finalizada. Não é possível editar os resultados mensais.', 'error');
    if (!state.publishedRows.some(item => item.id === id)) return toast('Publique primeiro o jogador novo no ranking geral.', 'error');
    $('#monthlyPlayerIdInput').value = row.id;
    $('#monthlyPlayerModalTitle').textContent = row.name;
    const stage = stageById(state.draftMonthlyState?.stageId);
    $('#monthlyPlayerStageInfo').textContent = stage ? `${stage.label} · ${fmtDateOnly(stage.start)} a ${fmtDateOnly(stage.end)}` : '';
    $('#monthlyPointsInput').value = row.monthlyPoints;
    $('#monthlyPresencesInput').value = row.monthlyPresences;
    $('#monthlyFinishInputs').innerHTML = cleanFinishes(row.monthlyFinishes).map((value, i) =>
      `<label class="field compact-field"><span>${i + 1}º lugares</span><input type="number" min="0" step="1" value="${value}" data-monthly-finish-input="${i}"></label>`).join('');
    $('#monthlyPlayerModal').showModal();
    setTimeout(() => $('#monthlyPointsInput').focus(), 50);
  }

  function saveMonthlyPlayerFromModal() {
    const row = state.draftRows.find(item => item.id === $('#monthlyPlayerIdInput').value);
    if (!row) return toast('Jogador não encontrado.', 'error');
    if (state.draftMonthlyState?.finalized) return toast('Etapa mensal já finalizada.', 'error');
    const pointsField = $('#monthlyPointsInput');
    const presenceField = $('#monthlyPresencesInput');
    const points = Number(pointsField.value);
    const presences = Number(presenceField.value);
    if (!pointsField.value.trim() || !Number.isFinite(points) || points < 0 ||
        !presenceField.value.trim() || !Number.isInteger(presences) || presences < 0) {
      return toast('Informe pontos válidos e presenças inteiras, sem valores negativos.', 'error');
    }
    const finishes = $('[data-monthly-finish-input]').map(field => Number(field.value));
    if (finishes.some(value => !Number.isInteger(value) || value < 0)) return toast('As colocações precisam ser números inteiros e não negativos.', 'error');
    row.monthlyPoints = round1(points);
    row.monthlyPresences = presences;
    row.monthlyFinishes = finishes;
    $('#monthlyPlayerModal').close();
    renderAll();
    toast('Pontuação mensal alterada no rascunho.');
  }

  function revertMonthlyPlayer(id) {
    const base = state.publishedRows.find(row => row.id === id);
    const row = state.draftRows.find(row => row.id === id);
    if (!base || !row) return;
    MONTHLY_FIELDS.forEach(field => { row[field] = clone(base[field]); });
    renderAll();
    toast('Alteração mensal desfeita.');
  }

  function discardMonthlyDraft() {
    if (!hasMonthlyDraftChanges()) return;
    if (!confirm('Descartar somente as alterações mensais deste rascunho?')) return;
    state.draftRows.forEach(row => {
      const base = state.publishedRows.find(item => item.id === row.id);
      if (base) MONTHLY_FIELDS.forEach(field => { row[field] = clone(base[field]); });
    });
    renderAll();
    saveDraftWithoutToast();
    toast('Alterações mensais descartadas.');
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
    const changed = generalChangedPlayerIds();
    const modifierChanged = !modifiersEqual(state.publishedModifiers, state.draftModifiers);
    const stageChanged = !monthlyStateEqual(state.publishedMonthlyState, state.draftMonthlyState);
    const dirty = changed.length > 0 || modifierChanged || stageChanged;
    $('#draftState').textContent = dirty ? 'Alterações pendentes' : 'Sem alterações';
    $('#draftState').classList.toggle('dirty', dirty);
    $('#publishBtn').disabled = !dirty;
    const parts = [];
    if (changed.length) parts.push(`${changed.length} jogador${changed.length === 1 ? '' : 'es'} alterado${changed.length === 1 ? '' : 's'}`);
    if (modifierChanged) parts.push('fatores alterados');
    if (stageChanged) parts.push('etapa mensal para finalização');
    $('#publishSummary').textContent = parts.length ? parts.join(' · ') : 'Nenhuma alteração geral pendente';
    $('#publishSubline').textContent = dirty
      ? 'Publica somente o geral e eventuais alterações de finalização da etapa.'
      : `Publicado em ${fmtDate(state.updatedAt)}.`;
  }

  function openPlayerModal(row = null) {
    $('#playerModalTitle').textContent = row ? 'Editar jogador' : 'Adicionar jogador';
    $('#playerIdInput').value = row?.id || ''; $('#playerNameInput').value = row?.name || '';
    $('#playerPointsInput').value = row?.points ?? 0; $('#playerPresencesInput').value = row?.presences ?? 0; $('#playerBonusInput').value = row?.bonus ?? 0;
    $('#finishInputs').innerHTML = cleanFinishes(row?.finishes).map((value, i) => `<label class="field compact-field"><span>${i + 1}º lugares</span><input type="number" min="0" step="1" value="${value}" data-finish-input="${i}"></label>`).join('');
    $('#playerModal').showModal(); setTimeout(() => $('#playerNameInput').focus(), 50);
  }

  function savePlayerFromModal() {
    const id = $('#playerIdInput').value || uid();
    const name = $('#playerNameInput').value.trim();
    if (!name) return toast('Informe o nome do jogador.', 'error');
    const existing = state.draftRows.find(item => item.id === id);
    const row = {
      id, name,
      points: Math.max(0, Number($('#playerPointsInput').value) || 0),
      presences: Math.max(0, Math.floor(Number($('#playerPresencesInput').value) || 0)),
      bonus: Math.max(0, Number($('#playerBonusInput').value) || 0),
      finishes: $$('[data-finish-input]').map(input => Math.max(0, Math.floor(Number(input.value) || 0))),
      monthlyPoints: existing?.monthlyPoints ?? 0,
      monthlyPresences: existing?.monthlyPresences ?? 0,
      monthlyFinishes: cleanFinishes(existing?.monthlyFinishes),
      active: true
    };
    const index = state.draftRows.findIndex(item => item.id === id);
    if (index >= 0) state.draftRows[index] = row;
    else state.draftRows.push(row);
    $('#playerModal').close();
    renderAll();
  }

  function deletePlayer(id) { const row = state.draftRows.find(item => item.id === id); if (!row) return; if (state.publishedRows.some(item => item.id === id) && monthlyChangedPlayerIds().includes(id)) return toast('Publique ou descarte as alterações mensais deste jogador antes de excluí-lo.', 'error'); if (state.tournaments.some(event => event.entries.some(entry => entry.playerId === id))) return toast('Jogador vinculado a torneios registrados. Edite ou remova esses torneios antes.', 'error'); if (!confirm(`Excluir ${row.name} do rascunho?`)) return; state.draftRows = state.draftRows.filter(item => item.id !== id); renderAll(); }
  function revertPlayer(id) {
    const baseline = state.publishedRows.find(item => item.id === id);
    if (baseline) {
      const current = state.draftRows.find(item => item.id === id);
      if (current) GENERAL_FIELDS.forEach(field => { current[field] = clone(baseline[field]); });
      else state.draftRows.push(clone(baseline));
    } else {
      state.draftRows = state.draftRows.filter(item => item.id !== id);
    }
    renderAll();
    toast('Modificação do geral removida.');
  }


  function openTournamentModal(eventRecord = null) {
    if (hasDraftChanges()) return toast('Publique ou descarte o rascunho dos jogadores antes de registrar ou alterar torneios.', 'error');
    editingTournamentId = eventRecord?.id || null;
    tournamentEntries = new Map((eventRecord?.entries || []).map(entry => [
      entry.playerId, {presence: Boolean(entry.presence), placement: entry.placement || null}
    ]));
    $('#tournamentDate').value = eventRecord?.date || localDateKey();
    $('#tournamentType').value = eventRecord?.type || 'regular';
    $('#tournamentName').value = eventRecord?.name || '';
    $('#tournamentGeneral').checked = eventRecord ? eventRecord.applyGeneral !== false : true;
    $('#tournamentMonthly').checked = eventRecord ? eventRecord.applyMonthly !== false : true;
    $('#tournamentSearch').value = '';
    renderTournamentStages(eventRecord?.stageId);
    renderParticipants(); renderTournamentPreview();
    $('#applyTournamentBtn').textContent = editingTournamentId ? 'Salvar alterações' : 'Salvar torneio';
    $('#tournamentModal').showModal();
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

  function renderTournamentPreview() {
    const rows = clone(state.draftRows);
    const byId = new Map(rows.map(row => [row.id, row]));
    const points = $('#tournamentType').value === 'special' ? SPECIAL_POINTS : REGULAR_POINTS;
    function adjust(entries, type, sign) {
      const scale = type === 'special' ? SPECIAL_POINTS : REGULAR_POINTS;
      entries.forEach(entry => {
        const row = byId.get(entry.playerId || entry.id);
        if (!row || !entry.presence) return;
        row.presences += sign;
        if (entry.placement) {
          row.points += sign * scale[entry.placement - 1];
          row.finishes = cleanFinishes(row.finishes);
          row.finishes[entry.placement - 1] += sign;
        }
      });
    }
    const old = state.tournaments.find(item => item.id === editingTournamentId);
    if (old?.applyGeneral) adjust(old.entries, old.type, -1);
    if ($('#tournamentGeneral').checked) adjust(
      tournamentInputState().map(item => ({playerId:item.id,presence:item.presence,placement:item.placement})),
      $('#tournamentType').value, 1
    );
    renderTopList(calculateRows(rows, state.draftModifiers), $('#tournamentPreview'));
  }

  async function applyTournament() {
    const entries = tournamentInputState();
    if (!entries.length) return toast('Marque pelo menos uma presença.', 'error');
    if (hasDraftChanges()) return toast('Publique ou descarte o rascunho antes de editar torneios.', 'error');
    const applyGeneral = $('#tournamentGeneral').checked;
    const applyMonthly = $('#tournamentMonthly').checked;
    if (!applyGeneral && !applyMonthly) return toast('Marque ranking geral, mensal ou ambos.', 'error');
    const date = $('#tournamentDate').value;
    if (!date) return toast('Informe a data do torneio.', 'error');
    const stageId = applyMonthly ? $('#tournamentStage').value : '';
    if (applyMonthly && !stageId) return toast('Escolha a etapa mensal.', 'error');
    const button = $('#applyTournamentBtn');
    button.disabled = true;
    try {
      const data = await api({
        action: 'saveTournament', token: state.token, baseVersion: state.version,
        tournament: {
          id: editingTournamentId || undefined,
          date, type: $('#tournamentType').value, name: $('#tournamentName').value.trim(),
          applyGeneral, applyMonthly, stageId,
          entries: entries.map(entry => ({playerId: entry.id, presence: entry.presence, placement: entry.placement || 0}))
        }
      });
      absorbPublished(data); $('#tournamentModal').close();
      toast('Torneio salvo no Google Sheets e rankings atualizados.');
      activateManagementTab('tournaments');
    } catch (error) { handleApiError(error); }
    finally { button.disabled = false; }
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
    state.history = data.history || []; historyPage = 1;
    state.stages = normalizeStages(data.stages);
    MONTHLY_STAGES = clone(state.stages);
    state.tournaments = Array.isArray(data.tournaments) ? data.tournaments : [];
    clearLocalDraft(); renderAll();
  }

  // Publish only the selected ranking. The v5 API accepts complete rows, so each
  // request merges the chosen draft fields with the last published other ranking.
  function scopedPublishRows(scope) {
    const published = new Map(state.publishedRows.map(row => [row.id, row]));
    if (scope === 'monthly') {
      const drafts = new Map(state.draftRows.map(row => [row.id, row]));
      return state.publishedRows.map(row => {
        const result = clone(row);
        const draft = drafts.get(row.id);
        if (draft) MONTHLY_FIELDS.forEach(field => { result[field] = clone(draft[field]); });
        return result;
      });
    }
    return state.draftRows.map(row => {
      const result = clone(row);
      const base = published.get(row.id);
      if (base) MONTHLY_FIELDS.forEach(field => { result[field] = clone(base[field]); });
      return result;
    });
  }

  // Keep unpublished changes from the other tab after the server increments
  // its version, rather than silently losing them on refresh or publish.
  function recoverOtherDraft(scope, previous) {
    const originalBase = new Map(previous.publishedRows.map(row => [row.id, row]));
    const oldDraft = new Map(previous.draftRows.map(row => [row.id, row]));
    if (scope === 'monthly') {
      state.draftRows = state.draftRows.filter(row => !originalBase.has(row.id) || oldDraft.has(row.id));
      state.draftRows.forEach(row => {
        const draft = oldDraft.get(row.id);
        if (draft && originalBase.has(row.id) && !sameGeneralFields(originalBase.get(row.id), draft)) {
          GENERAL_FIELDS.forEach(field => { row[field] = clone(draft[field]); });
        }
      });
      previous.draftRows.filter(row => !originalBase.has(row.id))
        .forEach(row => state.draftRows.push(clone(row)));
      state.draftModifiers = clone(previous.draftModifiers);
      state.draftMonthlyState = clone(previous.draftMonthlyState);
    } else {
      state.draftRows.forEach(row => {
        const before = originalBase.get(row.id);
        const draft = oldDraft.get(row.id);
        if (before && draft && !sameMonthlyFields(before, draft)) {
          MONTHLY_FIELDS.forEach(field => { row[field] = clone(draft[field]); });
        }
      });
    }
    state.draftRows = calculateRows(state.draftRows, state.draftModifiers);
    if (hasDraftChanges()) saveDraftWithoutToast();
    else clearLocalDraft();
    renderAll();
  }

  async function publishDraft(scope = 'general') {
    const monthly = scope === 'monthly';
    const dirty = monthly ? hasMonthlyDraftChanges() : hasGeneralDraftChanges();
    if (!dirty) return;
    if (monthly && state.draftMonthlyState?.finalized) {
      return toast('Etapa já finalizada. Não é possível publicar alterações mensais.', 'error');
    }
    if (!monthly && !monthlyStateEqual(state.publishedMonthlyState, state.draftMonthlyState) && hasMonthlyDraftChanges()) {
      return toast('Publique primeiro as alterações mensais antes de finalizar a etapa.', 'error');
    }
    if (!monthly) {
      const draftIds = new Set(state.draftRows.map(row => row.id));
      if (monthlyChangedPlayerIds().some(id => !draftIds.has(id))) {
        return toast('Revise as alterações mensais de jogadores excluídos antes de publicar.', 'error');
      }
    }
    const label = monthly ? 'mensal' : 'geral';
    if (!confirm(`Publicar somente o ranking ${label}?`)) return;

    const btn = $(monthly ? '#publishMonthlyBtn' : '#publishBtn');
    const title = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Publicando...';
    const previous = {
      publishedRows: clone(state.publishedRows),
      draftRows: clone(state.draftRows),
      draftModifiers: clone(state.draftModifiers),
      draftMonthlyState: clone(state.draftMonthlyState)
    };
    try {
      const data = await api({
        action: 'publish',
        token: state.token,
        baseVersion: state.version,
        rows: scopedPublishRows(scope),
        modifiers: monthly ? state.publishedModifiers : state.draftModifiers,
        monthlyState: monthly ? state.publishedMonthlyState : state.draftMonthlyState
      });
      absorbPublished(data);
      recoverOtherDraft(scope, previous);
      toast(`Ranking ${label} publicado. Alterações do outro ranking foram preservadas.`);
    } catch (error) {
      handleApiError(error);
    } finally {
      btn.textContent = title;
      btn.disabled = !(monthly ? hasMonthlyDraftChanges() : hasGeneralDraftChanges());
    }
  }

  async function previewHistory(id) {
    try {
      const data = await api({ action: 'historySnapshot', token: state.token, historyId: id }); state.previewHistoryId = id;
      $('#historyPreviewTitle').textContent = `Versão ${data.history.version}`; $('#historyPreviewMeta').textContent = `${fmtDate(data.history.createdAt)} · ${data.history.total} jogadores${data.history.schemaVersion < 5 ? ' · histórico legado (v4 ou anterior)' : ''}`;
      $('#historyRankingPreview').innerHTML = data.rows.map((row, index) => `<div class="history-rank-row"><span>${index + 1}</span><strong>${esc(row.name)}</strong><em>${fmt(row.finalPoints)}</em></div>`).join('') || '<div class="empty-state">Ranking vazio.</div>';
      $('#historyModifierPreview').innerHTML = ['<div class="history-mod-row"><span>0+ presenças</span><strong>1,0x</strong></div>', ...(data.modifiers || []).map(rule => `<div class="history-mod-row"><span>${rule.minPresences}+ presenças</span><strong>${fmtFactor(rule.factor)}</strong></div>`)].join('');
      $('#restoreFromPreviewBtn').hidden = data.history.schemaVersion < 5; $('#historyPreviewModal').showModal();
    } catch (error) { handleApiError(error); }
  }

  async function restoreHistory(id) {
    const item = state.history.find(history => history.id === id); if (item?.restorable === false) return toast('Versões anteriores à v4 são somente leitura.', 'error');
    if (!confirm(`Restaurar a versão ${item?.version ?? ''}? O ranking atual será salvo no histórico antes da restauração.`)) return;
    try { const data = await api({ action: 'restore', token: state.token, baseVersion: state.version, historyId: id }); absorbPublished(data); $('#historyPreviewModal').close(); toast('Versão restaurada e publicada.'); } catch (error) { handleApiError(error); }
  }

  async function deleteHistory(id) { const item = state.history.find(history => history.id === id); if (!confirm(`Excluir definitivamente a versão ${item?.version ?? ''} do histórico?`)) return; try { const data = await api({ action: 'deleteHistory', token: state.token, historyId: id }); state.history = data.history || []; renderHistory(); toast('Histórico excluído.'); } catch (error) { handleApiError(error); } }
  function discardDraft() {
    if (!hasGeneralDraftChanges()) return;
    if (!confirm('Descartar somente as alterações do ranking geral?')) return;
    const editedMonthly = new Map(state.draftRows.map(row => [row.id, row]));
    state.draftRows = clone(state.publishedRows);
    state.draftRows.forEach(row => {
      const before = state.publishedRows.find(item => item.id === row.id);
      const old = editedMonthly.get(row.id);
      if (before && old && !sameMonthlyFields(before, old)) {
        MONTHLY_FIELDS.forEach(field => { row[field] = clone(old[field]); });
      }
    });
    state.draftModifiers = clone(state.publishedModifiers);
    state.draftMonthlyState = clone(state.publishedMonthlyState);
    renderAll();
    if (hasDraftChanges()) saveDraftWithoutToast();
    else clearLocalDraft();
    toast('Alterações do geral descartadas.');
  }


  function activateManagementTab(tab) {
    if (!['players','monthly','tournaments','stages'].includes(tab)) return;
    activeManagementTab = tab;
    $('#adminToolbar').hidden = tab !== 'players';
    $('#playersDashboard').hidden = tab !== 'players';
    $('#monthlyDashboard').hidden = tab !== 'monthly';
    $('#tournamentsDashboard').hidden = tab !== 'tournaments';
    $('#stagesDashboard').hidden = tab !== 'stages';
    $('[data-admin-tab]').forEach(button => {
      const active = button.dataset.adminTab === tab;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function renderTournamentStages(preferred = null) {
    const date = $('#tournamentDate').value;
    const candidate = state.stages.find(stage => date >= stage.start && date <= stage.end);
    const selected = preferred || candidate?.id || state.draftMonthlyState?.stageId || state.stages[0]?.id;
    $('#tournamentStage').innerHTML = state.stages.map(stage =>
      '<option value="' + esc(stage.id) + '"' + (stage.id === selected ? ' selected' : '') + '>' +
      esc(stage.label) + ' · ' + fmtDateOnly(stage.start) + '–' + fmtDateOnly(stage.end) +
      '</option>'
    ).join('');
    toggleTournamentMonthly();
  }

  function toggleTournamentMonthly() {
    const enabled = $('#tournamentMonthly').checked;
    $('#monthlyStageField').hidden = !enabled;
    $('#tournamentStage').disabled = !enabled;
    renderTournamentPreview();
  }

  function renderTournamentRecords() {
    const root = $('#tournamentRecordList');
    if (!root) return;
    const events = Array.isArray(state.tournaments) ? state.tournaments : [];
    root.innerHTML = events.map(item => {
      const stage = state.stages.find(s => s.id === item.stageId);
      const badges = [
        item.applyGeneral ? '<span class="record-tag">Geral</span>' : '<span class="record-tag record-tag-muted">Fora do geral</span>',
        item.applyMonthly ? '<span class="record-tag monthly">' + esc(stage?.label || item.stageId) + '</span>' : '<span class="record-tag record-tag-muted">Fora do mensal</span>'
      ].join('');
      return '<article class="tournament-record">' +
        '<div class="tournament-record-copy"><strong>' + esc(item.name || (item.type === 'special' ? 'Especial' : 'Regular')) + '</strong>' +
        '<span>' + fmtDateOnly(item.date) + ' · ' + item.entries.length + ' participante' + (item.entries.length === 1 ? '' : 's') + '</span>' +
        '<div class="record-badges">' + badges + '</div></div>' +
        '<div class="tournament-record-actions">' +
        '<button class="mini-button" type="button" data-tournament-edit="' + esc(item.id) + '">Editar</button>' +
        '<button class="mini-button danger" type="button" data-tournament-delete="' + esc(item.id) + '">Excluir</button>' +
        '</div></article>';
    }).join('') || '<div class="empty-state">Nenhum torneio cadastrado nesta versão. Registros antigos que já somaram no geral devem ser lançados somente no mensal para evitar pontuação duplicada.</div>';
  }

  function renderStageEditor() {
    const list = $('#stageEditorList');
    if (!list) return;
    list.innerHTML = (state.stages || []).map(item => stageEditorMarkup(item)).join('');
    const index = state.stages.findIndex(st => st.id === state.draftMonthlyState?.stageId);
    const hasNext = index >= 0 && index < state.stages.length - 1;
    const button = $('#advanceStageBtn');
    button.disabled = !hasNext || !state.draftMonthlyState?.finalized;
    button.textContent = hasNext ? 'Ativar ' + state.stages[index + 1].label : 'Última etapa';
  }

  function stageEditorMarkup(item) {
    return '<div class="stage-editor-row" data-stage-row="' + esc(item.id) + '">' +
      '<label class="field"><span>Nome da etapa</span><input data-stage-name maxlength="80" value="' + esc(item.label) + '" required></label>' +
      '<label class="field"><span>Início</span><input type="date" data-stage-start value="' + esc(item.start) + '" required></label>' +
      '<label class="field"><span>Fim</span><input type="date" data-stage-end value="' + esc(item.end) + '" required></label>' +
      '<button type="button" class="mini-button danger" data-stage-remove="' + esc(item.id) + '" aria-label="Remover etapa">Remover</button>' +
      '</div>';
  }

  function addStageEditorRow() {
    const rows = $('[data-stage-row]');
    const last = rows[rows.length - 1];
    const start = last?.querySelector('[data-stage-end]')?.value || '2027-04-12';
    const date = new Date(start + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + 1);
    const key = date.toISOString().slice(0,10);
    if (rows.some(row => row.dataset.stageRow === key)) return toast('Já existe uma etapa com esta data de identificação.', 'error');
    $('#stageEditorList').insertAdjacentHTML('beforeend', stageEditorMarkup({
      id: key, label: 'Etapa ' + (rows.length + 1), start: key, end: key
    }));
  }

  function removeStageEditorRow(id) {
    if (id === state.draftMonthlyState?.stageId) return toast('Não é possível remover a etapa atual.', 'error');
    const activeEvents = state.tournaments.some(t => t.applyMonthly && t.stageId === id);
    if (activeEvents) return toast('Esta etapa possui torneios vinculados.', 'error');
    const row = $('[data-stage-row]').find(element => element.dataset.stageRow === id);
    row?.remove();
  }

  function readEditedStages() {
    return $('[data-stage-row]').map(row => ({
      id: row.dataset.stageRow,
      label: row.querySelector('[data-stage-name]').value.trim(),
      start: row.querySelector('[data-stage-start]').value,
      end: row.querySelector('[data-stage-end]').value
    }));
  }

  async function saveMonthlyStages() {
    if (hasDraftChanges()) return toast('Publique ou descarte o rascunho dos jogadores antes de salvar etapas.', 'error');
    const stages = readEditedStages();
    if (!stages.length || stages.some(x => !x.label || !x.start || !x.end)) return toast('Preencha as datas e nomes das etapas.', 'error');
    if (!confirm('Salvar os períodos das etapas? Os torneios existentes continuarão associados à etapa que foi selecionada no cadastro.')) return;
    const button = $('#saveStagesBtn'); button.disabled = true;
    try {
      const data = await api({action:'saveStages',token:state.token,baseVersion:state.version,stages});
      absorbPublished(data); toast('Etapas atualizadas.');
    } catch (error) { handleApiError(error); }
    finally { button.disabled = false; }
  }

  async function deleteSavedTournament(id) {
    const record = state.tournaments.find(item => item.id === id);
    if (!record) return;
    if (hasDraftChanges()) return toast('Publique ou descarte o rascunho dos jogadores antes de excluir torneios.', 'error');
    if (!confirm('Excluir o torneio de ' + fmtDateOnly(record.date) + '? Os pontos que ele lançou serão revertidos automaticamente.')) return;
    try {
      const data = await api({action:'deleteTournament',token:state.token,baseVersion:state.version,tournamentId:id});
      absorbPublished(data); activateManagementTab('tournaments'); toast('Torneio removido, pontuação recalculada.');
    } catch (error) { handleApiError(error); }
  }

  async function advanceMonthlyStage() {
    if (hasDraftChanges()) return toast('Publique ou descarte o rascunho antes de avançar.', 'error');
    if (!state.draftMonthlyState.finalized) return toast('Finalize a etapa atual e publique antes de avançar.', 'error');
    if (!confirm('Ativar a próxima etapa? A pontuação mensal da etapa anterior será zerada e torneios já registrados para a próxima serão aplicados. O geral será preservado.')) return;
    try {
      const data = await api({action:'advanceStage',token:state.token,baseVersion:state.version});
      absorbPublished(data); activateManagementTab('stages'); toast('Próxima etapa ativada.');
    } catch (error) { handleApiError(error); }
  }

  function bindEvents() {
    $('#historyPagination').addEventListener('click', event => {
      const target = event.target.closest('[data-history-page]');
      if (!target || target.disabled) return;
      const next = Number(target.dataset.historyPage);
      if (!Number.isInteger(next) || next < 1) return;
      historyPage = next;
      renderHistory();
    });
    $('#monthlyPlayerSearch').addEventListener('input', renderMonthlyPlayers);
    $('#monthlySaveLocalBtn').addEventListener('click', saveLocalDraft);
    $('#monthlyDiscardBtn').addEventListener('click', discardMonthlyDraft);
    $('#publishMonthlyBtn').addEventListener('click', () => publishDraft('monthly'));
    $('#saveMonthlyPlayerBtn').addEventListener('click', saveMonthlyPlayerFromModal);
    $('#managementTabs').addEventListener('click', event => {
      const tab = event.target.closest('[data-admin-tab]');
      if (tab) activateManagementTab(tab.dataset.adminTab);
    });
    $('#newTournamentBtn').addEventListener('click', () => openTournamentModal());
    $('#tournamentRecordList').addEventListener('click', event => {
      const edit = event.target.closest('[data-tournament-edit]');
      const del = event.target.closest('[data-tournament-delete]');
      if (edit) return openTournamentModal(state.tournaments.find(t => t.id === edit.dataset.tournamentEdit));
      if (del) return deleteSavedTournament(del.dataset.tournamentDelete);
    });
    $('#tournamentMonthly').addEventListener('change', toggleTournamentMonthly);
    $('#tournamentGeneral').addEventListener('change', renderTournamentPreview);
    $('#tournamentStage').addEventListener('change', renderTournamentPreview);
    $('#tournamentDate').addEventListener('change', () => {
      renderTournamentStages();
      renderTournamentPreview();
    });
    $('#addStageBtn').addEventListener('click', addStageEditorRow);
    $('#saveStagesBtn').addEventListener('click', saveMonthlyStages);
    $('#advanceStageBtn').addEventListener('click', advanceMonthlyStage);
    $('#stageEditorList').addEventListener('click', event => {
      const remove = event.target.closest('[data-stage-remove]');
      if (remove) removeStageEditorRow(remove.dataset.stageRemove);
    });
        $('#loginForm').addEventListener('submit', async event => { event.preventDefault(); const status = $('#loginStatus'); status.textContent = 'Entrando...'; try { await login($('#passwordInput').value); status.textContent = ''; } catch (error) { status.textContent = error.message || 'Não foi possível entrar.'; } });
    $('#logoutBtn').addEventListener('click', () => logout()); $('#openTournamentBtn').addEventListener('click', () => openTournamentModal()); $('#addPlayerBtn').addEventListener('click', () => openPlayerModal()); $('#savePlayerBtn').addEventListener('click', savePlayerFromModal);
    $('#saveLocalBtn').addEventListener('click', saveLocalDraft); $('#exportBtn').addEventListener('click', exportDraft); $('#importBtn').addEventListener('click', () => $('#importFileInput').click());
    $('#importFileInput').addEventListener('change', event => { importDraftFile(event.target.files?.[0]); event.target.value = ''; }); $('#discardDraftBtn').addEventListener('click', discardDraft); $('#publishBtn').addEventListener('click', () => publishDraft('general')); $('#playerSearch').addEventListener('input', renderPlayers);
    $('#addModifierBtn').addEventListener('click', addModifier); $('#resetModifiersBtn').addEventListener('click', resetModifiers); $('#finalizeMonthlyBtn').addEventListener('click', finalizeMonthlyDraft);
    $('#tournamentSearch').addEventListener('input', renderParticipants); $('#tournamentType').addEventListener('change', renderTournamentPreview); 
    $('#participantList').addEventListener('change', event => { const participant = event.target.closest('[data-participant-id]'); if (!participant) return; const id = participant.dataset.participantId; const checkbox = participant.querySelector('[data-presence-id]'); const select = participant.querySelector('[data-placement-id]'); if (event.target.matches('[data-placement-id]') && select.value) checkbox.checked = true; tournamentEntries.set(id, { presence: checkbox.checked, placement: select.value ? Number(select.value) : null }); renderTournamentPreview(); });
    $('#applyTournamentBtn').addEventListener('click', applyTournament);

    document.addEventListener('click', event => {
      const editMonthly = event.target.closest('[data-edit-monthly]');
      if (editMonthly) return openMonthlyPlayerModal(editMonthly.dataset.editMonthly);
      const revertMonthly = event.target.closest('[data-revert-monthly]');
      if (revertMonthly) return revertMonthlyPlayer(revertMonthly.dataset.revertMonthly);
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