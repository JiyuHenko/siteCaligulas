(function () {
  'use strict';

  const API = window.CaligulasAPI;
  const generalPanel = document.querySelector('#rankingGeneralPanel');
  const monthlyPanel = document.querySelector('#rankingMonthlyPanel');
  const tabs = Array.from(document.querySelectorAll('[data-ranking-tab]'));
  const podium = document.querySelector('#rankingPodium');
  const tbody = document.querySelector('#rankingTableBody');
  const mobile = document.querySelector('#rankingMobile');
  const monthlyBody = document.querySelector('#monthlyTableBody');
  const monthlyMobile = document.querySelector('#monthlyRankingMobile');
  const monthlyStage = document.querySelector('#monthlyStageLabel');
  const monthlyMeta = document.querySelector('#monthlyStageMeta');
  const monthlyBonus = document.querySelector('#monthlyBonusStatus');
  const status = document.querySelector('#rankingPageStatus');
  const search = document.querySelector('#rankingSearch');
  const monthlySearch = document.querySelector('#monthlyRankingSearch');
  const factorList = document.querySelector('#factorList') || document.querySelector('.factor-list');
  let rows = [];
  let monthly = { rows: [] };

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  function renderModifiers(modifiers) {
    if (!factorList || !Array.isArray(modifiers)) return;
    const rules = modifiers
      .map(rule => ({
        minPresences: Math.max(0, Math.floor(Number(rule.minPresences) || 0)),
        factor: Number(rule.factor) || 1
      }))
      .filter(rule => rule.minPresences > 0 && rule.factor > 0)
      .sort((a, b) => a.minPresences - b.minPresences);

    const ranges = rules.map((rule, index) => {
      const next = rules[index + 1];
      const label = next ? `${rule.minPresences} a ${next.minPresences - 1} torneios` : `${rule.minPresences} ou mais`;
      return `<div class="factor-row"><span>${label}</span><strong>${String(rule.factor).replace('.', ',')}x</strong></div>`;
    });

    factorList.innerHTML = [
      '<div class="factor-row"><span>0 a ' + (rules[0] ? Math.max(0, rules[0].minPresences - 1) : '∞') + ' torneios</span><strong>1,0x</strong></div>',
      ...ranges
    ].join('');
  }

  function renderGeneral() {
    const query = (search?.value || '').trim().toLocaleLowerCase('pt-BR');
    const filtered = rows.filter(row => !query || row.name.toLocaleLowerCase('pt-BR').includes(query));

    if (podium) {
      podium.innerHTML = rows.slice(0, 3).map((row, index) => `
        <article class="podium-card glass ${index === 0 ? 'first' : ''}">
          <div class="place">${index + 1}º</div>
          <div class="player">${esc(row.name)}</div>
          <div class="points">${API.fmt(row.finalPoints)}</div>
          <div class="sub">${row.presences} presenças · ${String(row.factor).replace('.', ',')}x · bônus ${API.fmt(row.bonus)}</div>
        </article>
      `).join('');
    }

    if (tbody) {
      tbody.innerHTML = filtered.map(row => {
        const position = rows.indexOf(row) + 1;
        return `<tr><td>${position}</td><td><strong>${esc(row.name)}</strong></td><td>${API.fmt(row.points)}</td><td>${row.presences}</td><td>${String(row.factor).replace('.', ',')}x</td><td>${API.fmt(row.bonus)}</td><td>${API.fmt(row.finalPoints)}</td></tr>`;
      }).join('') || '<tr><td colspan="7">Nenhum jogador publicado ainda.</td></tr>';
    }

    if (mobile) {
      mobile.innerHTML = filtered.map(row => {
        const position = rows.indexOf(row) + 1;
        return `
          <article class="rank-row-mobile glass">
            <div class="p">${String(position).padStart(2, '0')}</div>
            <div><div class="n">${esc(row.name)}</div><div class="d">${row.presences} pres. · ${String(row.factor).replace('.', ',')}x · bônus ${API.fmt(row.bonus)}</div></div>
            <div class="f">${API.fmt(row.finalPoints)}</div>
          </article>`;
      }).join('') || '<div class="muted">Nenhum jogador publicado ainda.</div>';
    }
  }

  function renderMonthly() {
    const stage = monthly.stage || {};
    if (monthlyStage) monthlyStage.textContent = `${stage.label || 'Etapa mensal'} · ${API.fmtDateOnly(stage.start)} a ${API.fmtDateOnly(stage.end)}`;
    if (monthlyMeta) monthlyMeta.textContent = `${Number(monthly.tournamentCount) || 0} torneio${Number(monthly.tournamentCount) === 1 ? '' : 's'} válido${Number(monthly.tournamentCount) === 1 ? '' : 's'} na etapa`;
    if (monthlyBonus) {
      const recipients = Array.isArray(monthly.bonusRecipients) ? monthly.bonusRecipients : [];
      monthlyBonus.textContent = monthly.finalized
        ? (recipients.length ? `Etapa finalizada · bônus concedido a ${recipients.map(item => item.name).join(', ')}` : 'Etapa finalizada · nenhum jogador cumpriu 100% de presença')
        : 'Bônus de 10 pontos ainda em disputa';
    }

    const query = (monthlySearch?.value || '').trim().toLocaleLowerCase('pt-BR');
    const all = Array.isArray(monthly.rows) ? monthly.rows : [];
    const filtered = all.filter(row => !query || row.name.toLocaleLowerCase('pt-BR').includes(query));

    if (monthlyBody) {
      monthlyBody.innerHTML = filtered.map(row => {
        const position = all.indexOf(row) + 1;
        return `<tr><td>${position}</td><td><strong>${esc(row.name)}</strong></td><td>${API.fmt(row.points)}</td><td>${row.presences}</td><td>${API.fmt(row.finalPoints)}</td><td><span class="eligibility-badge ${row.eligible ? 'ok' : ''}">${row.eligible ? '100% presença' : 'Não elegível'}</span></td></tr>`;
      }).join('') || '<tr><td colspan="6">Nenhuma pontuação mensal registrada nesta etapa.</td></tr>';
    }

    if (monthlyMobile) {
      monthlyMobile.innerHTML = filtered.map(row => {
        const position = all.indexOf(row) + 1;
        return `
          <article class="rank-row-mobile glass">
            <div class="p">${String(position).padStart(2, '0')}</div>
            <div><div class="n">${esc(row.name)}</div><div class="d">${API.fmt(row.points)} colocação + ${row.presences} presença${row.presences === 1 ? '' : 's'} · ${row.eligible ? '100% presença' : 'não elegível'}</div></div>
            <div class="f">${API.fmt(row.finalPoints)}</div>
          </article>`;
      }).join('') || '<div class="muted">Nenhuma pontuação mensal registrada nesta etapa.</div>';
    }
  }

  function activateTab(name) {
    const monthlyActive = name === 'monthly';
    if (generalPanel) generalPanel.hidden = monthlyActive;
    if (monthlyPanel) monthlyPanel.hidden = !monthlyActive;
    tabs.forEach(tab => {
      const active = tab.dataset.rankingTab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const hash = monthlyActive ? '#ranking-mensal' : '#ranking-geral';
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  tabs.forEach(tab => tab.addEventListener('click', () => activateTab(tab.dataset.rankingTab)));
  search?.addEventListener('input', renderGeneral);
  monthlySearch?.addEventListener('input', renderMonthly);

  API.getRanking()
    .then(data => {
      const modifiers = Array.isArray(data.modifiers) ? data.modifiers : (API.DEFAULT_MODIFIERS || []);
      rows = API.normalizeRows(data.rows || [], modifiers);
      monthly = API.normalizeMonthly(data.monthly || {});
      renderModifiers(modifiers);
      if (status) {
        const local = data.source === 'local-fallback';
        status.innerHTML = `<span class="live-dot ${local ? 'demo' : ''}"></span>${local ? 'Dados temporariamente indisponíveis' : 'Publicado em ' + API.fmtDate(data.updatedAt)}`;
      }
      renderGeneral();
      renderMonthly();
      activateTab(location.hash === '#ranking-mensal' ? 'monthly' : 'general');
    })
    .catch(() => {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7">Ranking temporariamente indisponível.</td></tr>';
      if (monthlyBody) monthlyBody.innerHTML = '<tr><td colspan="6">Ranking mensal temporariamente indisponível.</td></tr>';
    });
})();
