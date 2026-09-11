(function () {
  'use strict';

  const API = window.CaligulasAPI;
  const podium = document.querySelector('#rankingPodium');
  const tbody = document.querySelector('#rankingTableBody');
  const mobile = document.querySelector('#rankingMobile');
  const status = document.querySelector('#rankingPageStatus');
  const search = document.querySelector('#rankingSearch');
  let rows = [];

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[char]);

  function render() {
    const query = (search?.value || '').trim().toLocaleLowerCase('pt-BR');
    const filtered = rows.filter(row => !query || row.name.toLocaleLowerCase('pt-BR').includes(query));

    if (podium) {
      podium.innerHTML = rows.slice(0, 3).map((row, index) => `
        <article class="podium-card glass ${index === 0 ? 'first' : ''}">
          <div class="place">${index + 1}º</div>
          <div class="player">${esc(row.name)}</div>
          <div class="points">${API.fmt(row.finalPoints)}</div>
          <div class="sub">${row.presences} presenças · ${String(row.factor).replace('.', ',')}x</div>
        </article>
      `).join('');
    }

    if (tbody) {
      tbody.innerHTML = filtered.map(row => {
        const position = rows.indexOf(row) + 1;
        return `
          <tr>
            <td>${position}</td>
            <td><strong>${esc(row.name)}</strong></td>
            <td>${API.fmt(row.points)}</td>
            <td>${row.presences}</td>
            <td>${String(row.factor).replace('.', ',')}x</td>
            <td>${API.fmt(row.finalPoints)}</td>
          </tr>
        `;
      }).join('') || '<tr><td colspan="6">Nenhum jogador encontrado.</td></tr>';
    }

    if (mobile) {
      mobile.innerHTML = filtered.map(row => {
        const position = rows.indexOf(row) + 1;
        return `
          <article class="rank-row-mobile glass">
            <div class="p">${String(position).padStart(2, '0')}</div>
            <div>
              <div class="n">${esc(row.name)}</div>
              <div class="d">${row.presences} presenças · ${String(row.factor).replace('.', ',')}x</div>
            </div>
            <div class="f">${API.fmt(row.finalPoints)}</div>
          </article>
        `;
      }).join('');
    }
  }

  search?.addEventListener('input', render);

  API.getRanking()
    .then(data => {
      rows = API.normalizeRows(data.rows);
      if (status) {
        const local = data.source === 'local-fallback';
        status.innerHTML = `<span class="live-dot ${local ? 'demo' : ''}"></span>${local ? 'Dados de demonstração' : 'Publicado em ' + API.fmtDate(data.updatedAt)}`;
      }
      render();
    })
    .catch(() => {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6">Ranking temporariamente indisponível.</td></tr>';
      if (mobile) mobile.innerHTML = '<div class="muted">Ranking temporariamente indisponível.</div>';
    });
})();
