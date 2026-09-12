(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const cfg = window.CALIGULAS_CONFIG || {};
  const API_URL = cfg.appsScriptUrl || '';
  const TOKEN_KEY = 'caligulas_admin_token_v3';
  const DRAFT_KEY = 'caligulas_admin_draft_v3';

  const REGULAR_POINTS = [15, 12, 10, 8, 7, 6, 5, 4, 3];
  const SPECIAL_POINTS = [20, 18, 16, 14, 13, 12, 11, 10, 9];

  const DEFAULT_MODIFIERS = [
    { minPresences: 10, factor: 1.1 },
    { minPresences: 15, factor: 1.2 },
    { minPresences: 20, factor: 1.3 },
    { minPresences: 25, factor: 1.4 },
    { minPresences: 30, factor: 1.5 },
    { minPresences: 36, factor: 2.0 }
  ];

  const state = {
    token: sessionStorage.getItem(TOKEN_KEY) || '',
    version: 1,
    updatedAt: null,
    publishedRows: [],
    draftRows: [],
    publishedModifiers: [],
    draftModifiers: [],
    history: [],
    previewHistoryId: null
  };

  let tournamentEntries = new Map();

  function esc(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return 'p_' + crypto.randomUUID();
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function fmt(value) {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(value) || 0);
  }

  function fmtFactor(value) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 }).format(Number(value) || 1) + 'x';
  }

  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(date);
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
    return Array.from(map.entries())
      .map(([minPresences, factor]) => ({ minPresences, factor }))
      .sort((a, b) => a.minPresences - b.minPresences);
  }

  function factorFor(presences, modifiers = state.draftModifiers) {
    const p = Math.max(0, Math.floor(Number(presences) || 0));
    let factor = 1;
    normalizeModifiers(modifiers).forEach(rule => {
      if (p >= rule.minPresences) factor = rule.factor;
    });
    return factor;
  }

  function compareRows(a, b) {
    if (b.finalPoints !== a.finalPoints) return b.finalPoints - a.finalPoints;
    const af = cleanFinishes(a.finishes);
    const bf = cleanFinishes(b.finishes);
    for (let i = 0; i < 9; i += 1) {
      if (bf[i] !== af[i]) return bf[i] - af[i];
    }
    return String(a.name).localeCompare(String(b.name), 'pt-BR');
  }

  function calculateRows(rows, modifiers = state.draftModifiers) {
    return clone(rows || []).map(row => {
      const points = Math.max(0, Number(row.points) || 0);
      const presences = Math.max(0, Math.floor(Number(row.presences) || 0));
      const factor = factorFor(presences, modifiers);
      return {
        id: String(row.id || uid()),
        name: String(row.name || '').trim(),
        points,
        presences,
        factor,
        finalPoints: Math.round(((points + presences) * factor) * 10) / 10,
        finishes: cleanFinishes(row.finishes),
        active: row.active !== false
      };
    }).filter(row => row.name && row.active !== false).sort(compareRows);
  }

  function comparableRow(row) {
    return {
      id: row.id,
      name: String(row.name || '').trim(),
      points: Number(row.points) || 0,
      presences: Math.floor(Number(row.presences) || 0),
      finishes: cleanFinishes(row.finishes)
    };
  }

  function sameRow(a, b) {
    if (!a || !b) return false;
    return JSON.stringify(comparableRow(a)) === JSON.stringify(comparableRow(b));
  }

  function modifiersEqual(a, b) {
    return JSON.stringify(normalizeModifiers(a)) === JSON.stringify(normalizeModifiers(b));
  }

  function changedPlayerIds() {
    const baseline = new Map(state.publishedRows.map(row => [row.id, row]));
    const draft = new Map(state.draftRows.map(row => [row.id, row]));
    const ids = new Set([...baseline.keys(), ...draft.keys()]);
    return Array.from(ids).filter(id => !sameRow(baseline.get(id), draft.get(id)));
  }

  function hasDraftChanges() {
    return changedPlayerIds().length > 0 || !modifiersEqual(state.publishedModifiers, state.draftModifiers);
  }

  function toast(message, type = '') {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  async function api(payload) {
    if (!API_URL) throw new Error('Endpoint do ranking não configurado.');
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow'
    });
    const data = await response.json();
    if (!data.ok) {
      const error = new Error(data.message || 'Erro na API.');
      error.code = data.code || 'API_ERROR';
      throw error;
    }
    return data;
  }

  function handleApiError(error) {
    if (error?.code === 'AUTH_REQUIRED' || error?.code === 'AUTH_EXPIRED') {
      logout(false);
      toast('Sua sessão expirou. Entre novamente.', 'error');
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
    state.version = Number(data.version) || 1;
    state.updatedAt = data.updatedAt || null;
    const incomingModifiers = Array.isArray(data.modifiers) ? data.modifiers : DEFAULT_MODIFIERS;
    state.publishedRows = calculateRows(data.rows || [], incomingModifiers);
    state.publishedModifiers = normalizeModifiers(incomingModifiers);
    state.history = Array.isArray(data.history) ? data.history : [];

    const saved = readLocalDraft();
    if (saved && saved.baseVersion === state.version) {
      state.draftModifiers = normalizeModifiers(saved.modifiers || state.publishedModifiers);
      state.draftRows = calculateRows(saved.rows || state.publishedRows, state.draftModifiers);
      toast('Rascunho local recuperado.');
    } else {
      state.draftModifiers = clone(state.publishedModifiers);
      state.draftRows = clone(state.publishedRows);
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

  function showDashboard() {
    $('#loginView').hidden = true;
    $('#dashboard').hidden = false;
  }

  function saveLocalDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      baseVersion: state.version,
      savedAt: new Date().toISOString(),
      rows: state.draftRows,
      modifiers: state.draftModifiers
    }));
    toast('Rascunho salvo neste navegador.');
  }

  function readLocalDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function clearLocalDraft() {
    localStorage.removeItem(DRAFT_KEY);
  }


  function exportDraft() {
    const payload = {
      exportedAt: new Date().toISOString(),
      baseVersion: state.version,
      rows: state.draftRows,
      modifiers: state.draftModifiers
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caligulas-ranking-rascunho-v${state.version}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importDraftFile(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const rows = Array.isArray(parsed) ? parsed : parsed.rows;
      if (!Array.isArray(rows)) throw new Error('Arquivo sem lista de jogadores.');
      const modifiers = Array.isArray(parsed.modifiers) ? parsed.modifiers : state.draftModifiers;
      state.draftModifiers = normalizeModifiers(modifiers);
      state.draftRows = calculateRows(rows, state.draftModifiers);
      renderAll();
      toast('Rascunho importado. Revise antes de publicar.');
    } catch (error) {
      toast(error.message || 'Arquivo inválido.', 'error');
    }
  }

  function renderAll() {
    state.draftModifiers = normalizeModifiers(state.draftModifiers);
    state.draftRows = calculateRows(state.draftRows, state.draftModifiers);
    $('#versionBadge').textContent = 'v' + state.version;
    renderPlayers();
    renderTopPreview();
    renderModifiers();
    renderHistory();
    renderDraftState();
  }

  function filteredRows() {
    const q = ($('#playerSearch').value || '').trim().toLocaleLowerCase('pt-BR');
    return state.draftRows.filter(row => !q || row.name.toLocaleLowerCase('pt-BR').includes(q));
  }

  function playerActions(row) {
    const baseline = state.publishedRows.find(item => item.id === row.id);
    const modified = !sameRow(baseline, row);
    return `
      <div class="row-actions">
        ${modified ? `<button class="mini-button warning" data-revert-player="${esc(row.id)}" type="button">Remover modificação</button>` : ''}
        <button class="mini-button" data-edit-player="${esc(row.id)}" type="button">Editar</button>
        <button class="mini-button danger" data-delete-player="${esc(row.id)}" type="button">Excluir</button>
      </div>
    `;
  }

  function renderPlayers() {
    const rows = filteredRows();
    const tbody = $('#playersTableBody');
    const mobile = $('#mobilePlayerList');

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Nenhum jogador.</td></tr>';
      mobile.innerHTML = '<div class="empty-state">Nenhum jogador.</div>';
      return;
    }

    tbody.innerHTML = rows.map(row => `
      <tr class="${changedPlayerIds().includes(row.id) ? 'is-modified' : ''}">
        <td><strong>${esc(row.name)}</strong></td>
        <td>${fmt(row.points)}</td>
        <td>${row.presences}</td>
        <td>${fmtFactor(row.factor)}</td>
        <td><strong class="gold">${fmt(row.finalPoints)}</strong></td>
        <td>${playerActions(row)}</td>
      </tr>
    `).join('');

    mobile.innerHTML = rows.map(row => `
      <article class="player-card ${changedPlayerIds().includes(row.id) ? 'is-modified' : ''}">
        <div class="player-card-head"><strong>${esc(row.name)}</strong><span>${fmt(row.finalPoints)}</span></div>
        <div class="player-stats"><span>${fmt(row.points)} pts</span><span>${row.presences} pres.</span><span>${fmtFactor(row.factor)}</span></div>
        ${playerActions(row)}
      </article>
    `).join('');
  }

  function renderTopList(rows, target) {
    target.innerHTML = rows.slice(0, 10).map((row, index) => `
      <div class="top-row">
        <span class="top-pos">${String(index + 1).padStart(2, '0')}</span>
        <span class="top-name">${esc(row.name)}</span>
        <strong>${fmt(row.finalPoints)}</strong>
      </div>
    `).join('') || '<div class="empty-state">Ranking vazio.</div>';
  }

  function renderTopPreview() {
    renderTopList(state.draftRows, $('#topPreview'));
  }

  function renderModifiers() {
    const list = $('#modifierList');
    const rules = normalizeModifiers(state.draftModifiers);
    list.innerHTML = rules.map((rule, index) => `
      <div class="modifier-row" data-modifier-index="${index}">
        <label><span>Presenças</span><input type="number" min="1" step="1" value="${rule.minPresences}" data-modifier-presences="${index}"></label>
        <label><span>Fator</span><input type="number" min="0.1" step="0.1" value="${rule.factor}" data-modifier-factor="${index}"></label>
        <button class="icon-button danger-soft" data-remove-modifier="${index}" type="button" aria-label="Remover modificador">×</button>
      </div>
    `).join('') || '<div class="empty-state">Sem modificadores adicionais. Todos usam 1,0x.</div>';
  }

  function renderHistory() {
    const list = $('#historyList');
    list.innerHTML = state.history.map(item => `
      <article class="history-item">
        <div>
          <strong>Versão ${item.version}</strong>
          <span>${fmtDate(item.createdAt)} · ${item.total} jogador${item.total === 1 ? '' : 'es'}</span>
        </div>
        <div class="history-actions">
          <button class="mini-button" data-preview-history="${esc(item.id)}" type="button">Visualizar</button>
          <button class="mini-button warning" data-restore-history="${esc(item.id)}" type="button">Restaurar</button>
          <button class="mini-button danger" data-delete-history="${esc(item.id)}" type="button">Excluir</button>
        </div>
      </article>
    `).join('') || '<div class="empty-state">Nenhuma publicação anterior.</div>';
  }

  function renderDraftState() {
    const changed = changedPlayerIds();
    const modifierChanged = !modifiersEqual(state.publishedModifiers, state.draftModifiers);
    const dirty = changed.length > 0 || modifierChanged;

    $('#draftState').textContent = dirty ? 'Alterações pendentes' : 'Sem alterações';
    $('#draftState').classList.toggle('dirty', dirty);
    $('#publishBtn').disabled = !dirty;

    let summary = 'Nenhuma alteração pendente';
    const parts = [];
    if (changed.length) parts.push(`${changed.length} jogador${changed.length === 1 ? '' : 'es'} alterado${changed.length === 1 ? '' : 's'}`);
    if (modifierChanged) parts.push('fatores alterados');
    if (parts.length) summary = parts.join(' · ');
    $('#publishSummary').textContent = summary;
    $('#publishSubline').textContent = dirty
      ? 'As mudanças só chegam ao site depois de publicar.'
      : `Publicado em ${fmtDate(state.updatedAt)}.`;
  }

  function openPlayerModal(row = null) {
    $('#playerModalTitle').textContent = row ? 'Editar jogador' : 'Adicionar jogador';
    $('#playerIdInput').value = row?.id || '';
    $('#playerNameInput').value = row?.name || '';
    $('#playerPointsInput').value = row?.points ?? 0;
    $('#playerPresencesInput').value = row?.presences ?? 0;
    const finishes = cleanFinishes(row?.finishes);
    $('#finishInputs').innerHTML = finishes.map((value, i) => `
      <label class="field compact-field"><span>${i + 1}º lugares</span><input type="number" min="0" step="1" value="${value}" data-finish-input="${i}"></label>
    `).join('');
    $('#playerModal').showModal();
    setTimeout(() => $('#playerNameInput').focus(), 50);
  }

  function savePlayerFromModal() {
    const id = $('#playerIdInput').value || uid();
    const name = $('#playerNameInput').value.trim();
    if (!name) return toast('Informe o nome do jogador.', 'error');

    const row = {
      id,
      name,
      points: Math.max(0, Number($('#playerPointsInput').value) || 0),
      presences: Math.max(0, Math.floor(Number($('#playerPresencesInput').value) || 0)),
      finishes: $$('[data-finish-input]').map(input => Math.max(0, Math.floor(Number(input.value) || 0))),
      active: true
    };

    const index = state.draftRows.findIndex(item => item.id === id);
    if (index >= 0) state.draftRows[index] = row;
    else state.draftRows.push(row);
    state.draftRows = calculateRows(state.draftRows, state.draftModifiers);
    $('#playerModal').close();
    renderAll();
  }

  function deletePlayer(id) {
    const row = state.draftRows.find(item => item.id === id);
    if (!row) return;
    if (!confirm(`Excluir ${row.name} do rascunho?`)) return;
    state.draftRows = state.draftRows.filter(item => item.id !== id);
    renderAll();
  }

  function revertPlayer(id) {
    const baseline = state.publishedRows.find(item => item.id === id);
    if (baseline) {
      const index = state.draftRows.findIndex(item => item.id === id);
      if (index >= 0) state.draftRows[index] = clone(baseline);
      else state.draftRows.push(clone(baseline));
    } else {
      state.draftRows = state.draftRows.filter(item => item.id !== id);
    }
    state.draftRows = calculateRows(state.draftRows, state.draftModifiers);
    renderAll();
    toast('Modificação removida.');
  }

  function openTournamentModal() {
    tournamentEntries = new Map();
    $('#tournamentType').value = 'regular';
    $('#tournamentSearch').value = '';
    renderParticipants();
    renderTournamentPreview();
    $('#tournamentModal').showModal();
  }

  function renderParticipants() {
    const q = ($('#tournamentSearch').value || '').trim().toLocaleLowerCase('pt-BR');
    const rows = clone(state.draftRows).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .filter(row => !q || row.name.toLocaleLowerCase('pt-BR').includes(q));

    $('#participantList').innerHTML = rows.map(row => {
      const entry = tournamentEntries.get(row.id) || { presence: false, placement: null };
      return `
        <div class="participant-row" data-participant-id="${esc(row.id)}">
          <label class="presence-check">
            <input type="checkbox" data-presence-id="${esc(row.id)}" ${entry.presence ? 'checked' : ''}>
            <span>${esc(row.name)}</span>
          </label>
          <select data-placement-id="${esc(row.id)}" aria-label="Colocação de ${esc(row.name)}">
            <option value="">Sem colocação</option>
            ${Array.from({ length: 9 }, (_, i) => `<option value="${i + 1}" ${entry.placement === i + 1 ? 'selected' : ''}>${i + 1}º</option>`).join('')}
          </select>
        </div>
      `;
    }).join('') || '<div class="empty-state">Nenhum jogador encontrado.</div>';
  }

  function tournamentInputState() {
    return Array.from(tournamentEntries.entries()).map(([id, entry]) => ({
      id,
      presence: Boolean(entry.presence || entry.placement),
      placement: entry.placement ? Number(entry.placement) : null
    })).filter(entry => entry.presence || entry.placement);
  }

  function tournamentPreviewRows() {
    const type = $('#tournamentType').value;
    const pointsMap = type === 'special' ? SPECIAL_POINTS : REGULAR_POINTS;
    const rows = clone(state.draftRows);
    const byId = new Map(rows.map(row => [row.id, row]));

    tournamentInputState().forEach(entry => {
      const row = byId.get(entry.id);
      if (!row || !entry.presence) return;
      row.presences = Math.max(0, Math.floor(Number(row.presences) || 0)) + 1;
      if (entry.placement && entry.placement >= 1 && entry.placement <= 9) {
        row.points = Math.max(0, Number(row.points) || 0) + pointsMap[entry.placement - 1];
        row.finishes = cleanFinishes(row.finishes);
        row.finishes[entry.placement - 1] += 1;
      }
    });

    return calculateRows(rows, state.draftModifiers);
  }

  function renderTournamentPreview() {
    renderTopList(tournamentPreviewRows(), $('#tournamentPreview'));
  }

  function applyTournament() {
    const entries = tournamentInputState();
    if (!entries.length) return toast('Marque pelo menos uma presença.', 'error');

    const placements = entries.filter(entry => entry.placement).map(entry => entry.placement);
    const unique = new Set(placements);
    if (unique.size !== placements.length) return toast('Uma colocação não pode ser usada por dois jogadores.', 'error');

    state.draftRows = tournamentPreviewRows();
    $('#tournamentModal').close();
    renderAll();
    toast('Torneio adicionado ao rascunho.');
  }

  function addModifier() {
    const rules = normalizeModifiers(state.draftModifiers);
    const last = rules[rules.length - 1];
    state.draftModifiers.push({
      minPresences: last ? last.minPresences + 5 : 10,
      factor: last ? Math.round((last.factor + 0.1) * 10) / 10 : 1.1
    });
    renderAll();
  }

  function updateModifier(index, field, value) {
    const rules = normalizeModifiers(state.draftModifiers);
    if (!rules[index]) return;
    if (field === 'minPresences') rules[index].minPresences = Math.max(1, Math.floor(Number(value) || 1));
    if (field === 'factor') rules[index].factor = Math.max(0.1, Number(value) || 1);
    state.draftModifiers = normalizeModifiers(rules);
    state.draftRows = calculateRows(state.draftRows, state.draftModifiers);
    renderAll();
  }

  function removeModifier(index) {
    const rules = normalizeModifiers(state.draftModifiers);
    rules.splice(index, 1);
    state.draftModifiers = normalizeModifiers(rules);
    state.draftRows = calculateRows(state.draftRows, state.draftModifiers);
    renderAll();
  }

  function resetModifiers() {
    state.draftModifiers = clone(state.publishedModifiers);
    state.draftRows = calculateRows(state.draftRows, state.draftModifiers);
    renderAll();
  }

  async function publishDraft() {
    if (!hasDraftChanges()) return;
    if (!confirm('Publicar este rascunho no ranking do site?')) return;

    const btn = $('#publishBtn');
    btn.disabled = true;
    btn.textContent = 'Publicando...';
    try {
      const data = await api({
        action: 'publish',
        token: state.token,
        baseVersion: state.version,
        rows: state.draftRows,
        modifiers: state.draftModifiers
      });
      state.version = data.version;
      state.updatedAt = data.updatedAt;
      state.publishedModifiers = normalizeModifiers(Array.isArray(data.modifiers) ? data.modifiers : DEFAULT_MODIFIERS);
      state.draftModifiers = clone(state.publishedModifiers);
      state.publishedRows = calculateRows(data.rows || [], state.publishedModifiers);
      state.draftRows = clone(state.publishedRows);
      state.history = data.history || [];
      clearLocalDraft();
      renderAll();
      toast('Ranking publicado.');
    } catch (error) {
      handleApiError(error);
    } finally {
      btn.textContent = 'Publicar ranking';
      btn.disabled = !hasDraftChanges();
    }
  }

  async function previewHistory(id) {
    try {
      const data = await api({ action: 'historySnapshot', token: state.token, historyId: id });
      state.previewHistoryId = id;
      $('#historyPreviewTitle').textContent = `Versão ${data.history.version}`;
      $('#historyPreviewMeta').textContent = `${fmtDate(data.history.createdAt)} · ${data.history.total} jogadores`;
      $('#historyRankingPreview').innerHTML = data.rows.map((row, index) => `
        <div class="history-rank-row"><span>${index + 1}</span><strong>${esc(row.name)}</strong><em>${fmt(row.finalPoints)}</em></div>
      `).join('') || '<div class="empty-state">Ranking vazio.</div>';
      $('#historyModifierPreview').innerHTML = [
        '<div class="history-mod-row"><span>0+ presenças</span><strong>1,0x</strong></div>',
        ...(data.modifiers || []).map(rule => `<div class="history-mod-row"><span>${rule.minPresences}+ presenças</span><strong>${fmtFactor(rule.factor)}</strong></div>`)
      ].join('');
      $('#historyPreviewModal').showModal();
    } catch (error) {
      handleApiError(error);
    }
  }

  async function restoreHistory(id) {
    const item = state.history.find(history => history.id === id);
    if (!confirm(`Restaurar a versão ${item?.version ?? ''}? O ranking atual será salvo no histórico antes da restauração.`)) return;

    try {
      const data = await api({
        action: 'restore',
        token: state.token,
        baseVersion: state.version,
        historyId: id
      });
      state.version = data.version;
      state.updatedAt = data.updatedAt;
      state.publishedModifiers = normalizeModifiers(Array.isArray(data.modifiers) ? data.modifiers : DEFAULT_MODIFIERS);
      state.draftModifiers = clone(state.publishedModifiers);
      state.publishedRows = calculateRows(data.rows || [], state.publishedModifiers);
      state.draftRows = clone(state.publishedRows);
      state.history = data.history || [];
      clearLocalDraft();
      $('#historyPreviewModal').close();
      renderAll();
      toast('Versão restaurada e publicada.');
    } catch (error) {
      handleApiError(error);
    }
  }

  async function deleteHistory(id) {
    const item = state.history.find(history => history.id === id);
    if (!confirm(`Excluir definitivamente a versão ${item?.version ?? ''} do histórico?`)) return;
    try {
      const data = await api({ action: 'deleteHistory', token: state.token, historyId: id });
      state.history = data.history || [];
      renderHistory();
      toast('Histórico excluído.');
    } catch (error) {
      handleApiError(error);
    }
  }

  function discardDraft() {
    if (hasDraftChanges() && !confirm('Descartar todas as alterações do rascunho?')) return;
    state.draftRows = clone(state.publishedRows);
    state.draftModifiers = clone(state.publishedModifiers);
    clearLocalDraft();
    renderAll();
  }

  function bindEvents() {
    $('#loginForm').addEventListener('submit', async event => {
      event.preventDefault();
      const status = $('#loginStatus');
      status.textContent = 'Entrando...';
      try {
        await login($('#passwordInput').value);
        status.textContent = '';
      } catch (error) {
        status.textContent = error.message || 'Não foi possível entrar.';
      }
    });

    $('#logoutBtn').addEventListener('click', () => logout());
    $('#openTournamentBtn').addEventListener('click', openTournamentModal);
    $('#addPlayerBtn').addEventListener('click', () => openPlayerModal());
    $('#savePlayerBtn').addEventListener('click', savePlayerFromModal);
    $('#saveLocalBtn').addEventListener('click', saveLocalDraft);
    $('#exportBtn').addEventListener('click', exportDraft);
    $('#importBtn').addEventListener('click', () => $('#importFileInput').click());
    $('#importFileInput').addEventListener('change', event => {
      importDraftFile(event.target.files?.[0]);
      event.target.value = '';
    });
    $('#discardDraftBtn').addEventListener('click', discardDraft);
    $('#publishBtn').addEventListener('click', publishDraft);
    $('#playerSearch').addEventListener('input', renderPlayers);

    $('#addModifierBtn').addEventListener('click', addModifier);
    $('#resetModifiersBtn').addEventListener('click', resetModifiers);

    $('#tournamentSearch').addEventListener('input', renderParticipants);
    $('#tournamentType').addEventListener('change', renderTournamentPreview);
    $('#participantList').addEventListener('change', event => {
      const participant = event.target.closest('[data-participant-id]');
      if (!participant) return;
      const id = participant.dataset.participantId;
      const checkbox = participant.querySelector('[data-presence-id]');
      const select = participant.querySelector('[data-placement-id]');
      if (event.target.matches('[data-placement-id]') && select.value) checkbox.checked = true;
      tournamentEntries.set(id, {
        presence: checkbox.checked,
        placement: select.value ? Number(select.value) : null
      });
      renderTournamentPreview();
    });
    $('#applyTournamentBtn').addEventListener('click', applyTournament);

    document.addEventListener('click', event => {
      const edit = event.target.closest('[data-edit-player]');
      if (edit) {
        const row = state.draftRows.find(item => item.id === edit.dataset.editPlayer);
        if (row) openPlayerModal(row);
        return;
      }

      const revert = event.target.closest('[data-revert-player]');
      if (revert) return revertPlayer(revert.dataset.revertPlayer);

      const del = event.target.closest('[data-delete-player]');
      if (del) return deletePlayer(del.dataset.deletePlayer);

      const removeModifierBtn = event.target.closest('[data-remove-modifier]');
      if (removeModifierBtn) return removeModifier(Number(removeModifierBtn.dataset.removeModifier));

      const preview = event.target.closest('[data-preview-history]');
      if (preview) return previewHistory(preview.dataset.previewHistory);

      const restore = event.target.closest('[data-restore-history]');
      if (restore) return restoreHistory(restore.dataset.restoreHistory);

      const deleteHistoryBtn = event.target.closest('[data-delete-history]');
      if (deleteHistoryBtn) return deleteHistory(deleteHistoryBtn.dataset.deleteHistory);

      const closer = event.target.closest('[data-close-dialog]');
      if (closer) document.getElementById(closer.dataset.closeDialog)?.close();
    });

    $('#modifierList').addEventListener('change', event => {
      if (event.target.matches('[data-modifier-presences]')) {
        updateModifier(Number(event.target.dataset.modifierPresences), 'minPresences', event.target.value);
      }
      if (event.target.matches('[data-modifier-factor]')) {
        updateModifier(Number(event.target.dataset.modifierFactor), 'factor', event.target.value);
      }
    });

    $('#restoreFromPreviewBtn').addEventListener('click', () => {
      if (state.previewHistoryId) restoreHistory(state.previewHistoryId);
    });

    window.addEventListener('beforeunload', event => {
      if (!hasDraftChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  async function boot() {
    bindEvents();
    if (!state.token) return;
    try {
      await loadAdminState();
    } catch (error) {
      sessionStorage.removeItem(TOKEN_KEY);
      state.token = '';
      handleApiError(error);
    }
  }

  boot();
})();
