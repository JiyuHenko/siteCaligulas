const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { createHarness } = require('./helpers/backend-harness.cjs');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const target = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!target.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  try { res.setHeader('Content-Type', types[path.extname(target)] || 'text/plain'); res.end(fs.readFileSync(target)); }
  catch { res.writeHead(404); res.end(); }
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  let checks = 0;
  async function scenario(name, fn) {
    const backend = createHarness();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    const calls = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/*', route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      if (route.request().url().startsWith('https://script.google.com/')) {
        const input = JSON.parse(route.request().postData()); calls.push(input);
        return route.fulfill({ json: backend.post(input) });
      }
      return route.abort();
    });
    await page.addInitScript(token => sessionStorage.setItem('caligulas_admin_token_v4', token), backend.token);
    await page.goto(origin + '/admin/index.html');
    await page.waitForSelector('#dashboard:not([hidden])');
    const tab = name => page.locator(`[data-admin-tab="${name}"]`).click();
    const publish = async id => {
      const version = backend.state().version;
      await page.locator('#' + id).click();
      await page.waitForFunction(expected => document.querySelector('#versionBadge').textContent === 'v' + expected && !document.querySelector('#dashboard').inert, version + 1);
    };
    const editMonthly = async (points, presences) => {
      await tab('monthly');
      await page.locator('[data-edit-monthly="p_a"]').first().click();
      await page.locator('#monthlyPointsInput').fill(String(points));
      await page.locator('#monthlyPresencesInput').fill(String(presences));
      await page.locator('#saveMonthlyPlayerBtn').click();
      assert.equal(await page.locator('#monthlyPlayerModal').evaluate(el => el.open), false);
    };
    const editGeneral = async points => {
      await tab('players');
      await page.locator('[data-edit-player="p_a"]').first().click();
      await page.locator('#playerPointsInput').fill(String(points));
      await page.locator('#savePlayerBtn').click();
    };
    try {
      await fn({ page, backend, tab, publish, editMonthly, editGeneral, calls });
      assert.deepEqual(errors, [], 'No uncaught browser errors');
      checks++; console.log('PASS', name);
    } finally { await context.close(); }
  }
  try {
    await scenario('monthly presence-only, count, autosave and new player', async ({ page, backend, tab, publish, editMonthly }) => {
      await editMonthly(0, 3);
      await page.locator('#monthlyTournamentCountInput').fill('5');
      await page.locator('#monthlyTournamentCountInput').blur();
      let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('caligulas_admin_draft_v4')));
      assert.equal(saved.rows[0].monthlyPresences, 3); assert.equal(saved.monthlyState.tournamentCount, 5);
      assert.equal(backend.state().rows[0].monthlyPresences, 4);
      await publish('publishMonthlyBtn');
      assert.equal(backend.state().monthlyState.tournamentCount, 5);
      assert.equal(backend.state().rows[0].points, 26);
      assert.equal(backend.state().rows[0].monthlyPoints, 0);
      await page.locator('#monthlyAddPlayerBtn').click();
      await page.locator('#monthlyPlayerNameInput').fill('Beto');
      await page.locator('#monthlyPresencesInput').fill('1');
      await page.locator('#saveMonthlyPlayerBtn').click();
      await page.reload(); await page.waitForSelector('#dashboard:not([hidden])'); await tab('monthly');
      assert.match(await page.locator('#monthlyPlayersTableBody').textContent(), /Beto/);
      await publish('publishMonthlyBtn');
      const beto = backend.state().rows.find(row => row.name === 'Beto');
      assert.equal(beto.points, 0); assert.equal(beto.presences, 0); assert.equal(beto.monthlyPresences, 1);
      assert.equal(await page.locator('#publishAllBtn').isDisabled(), true);
    });
    await scenario('independent publication preserves other draft and new identities', async ({ page, backend, tab, publish, editMonthly, editGeneral }) => {
      await editGeneral(30); await editMonthly(12, 3);
      await publish('publishMonthlyBtn');
      assert.equal(backend.state().rows[0].points, 26); assert.equal(backend.state().rows[0].monthlyPoints, 12);
      await tab('players'); assert.match(await page.locator('#playersTableBody').textContent(), /30/);
      await publish('publishBtn'); assert.equal(backend.state().rows[0].points, 30);
      await tab('monthly'); await page.locator('#monthlyAddPlayerBtn').click();
      await page.locator('#monthlyPlayerNameInput').fill('Só mensal'); await page.locator('#monthlyPresencesInput').fill('1'); await page.locator('#saveMonthlyPlayerBtn').click();
      await editGeneral(31); await publish('publishBtn');
      assert.equal(backend.state().rows.some(row => row.name === 'Só mensal'), false);
      await tab('monthly'); assert.match(await page.locator('#monthlyPlayersTableBody').textContent(), /Só mensal/);
      await publish('publishMonthlyBtn'); assert.equal(backend.state().rows.filter(row => row.name === 'Só mensal').length, 1);
      await editMonthly(15, 4); await editGeneral(32); await publish('publishBtn');
      assert.equal(backend.state().rows.find(row => row.id === 'p_a').monthlyPoints, 12);
      await tab('monthly'); await publish('publishMonthlyBtn');
      assert.equal(backend.state().rows.find(row => row.id === 'p_a').monthlyPoints, 15);
    });
    await scenario('finalization preserves newly awarded bonus in pending general draft; reopen reverses once', async ({ page, backend, tab, publish, editGeneral }) => {
      await editGeneral(30); await tab('monthly'); await page.locator('#finalizeMonthlyFromTabBtn').click();
      await publish('publishMonthlyBtn'); assert.equal(backend.state().rows[0].bonus, 10);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('caligulas_admin_draft_v4')));
      assert.equal(saved.rows[0].points, 30); assert.equal(saved.rows[0].bonus, 10);
      await tab('players'); await publish('publishBtn'); assert.equal(backend.state().rows[0].bonus, 10);
      await publish('reopenMonthlyBtn'); assert.equal(backend.state().rows[0].bonus, 0); assert.equal(backend.state().monthlyState.finalized, false);
    });
    await scenario('backup import stages locally, validates bad rows, exports full ledger and restores', async ({ page, backend, publish, calls }) => {
      const before = backend.state();
      const backup = { schemaVersion: 6, kind: 'caligulas-ranking-backup', metadataMode: 'preserve', rows: before.rows.map(row => ({ ...row, monthlyPoints: row.points, monthlyPresences: row.presences, monthlyFinishes: row.finishes })), modifiers: before.modifiers, monthlyState: before.monthlyState };
      await page.locator('#importFileInput').setInputFiles({ name: 'corrected.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
      assert.equal(backend.state().version, before.version);
      assert.equal(await page.locator('#publishBtn').isDisabled(), true);
      await publish('publishAllBtn'); assert.equal(calls.at(-1).action, 'importBackup'); assert.equal(calls.at(-1).backup.metadataMode, 'preserve');
      await page.locator('summary').filter({ hasText: 'Backup e recuperação' }).click();
      const pending = page.waitForEvent('download'); await page.locator('#exportBtn').click(); const download = await pending;
      const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
      assert.equal(exported.schemaVersion, 6); assert.equal(exported.metadataMode, 'replace'); assert.equal(exported.stages.length, 7); assert.deepEqual(exported.tournaments, []);
      await page.locator('#importFileInput').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...backup, rows: [backup.rows[0], backup.rows[0]] })) });
      assert.match(await page.locator('#toast').textContent(), /ID repetido/);
      assert.equal(await page.locator('#publishAllBtn').isDisabled(), true);
      await page.locator('#importFileInput').setInputFiles({ name: 'bad-events.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...exported, tournaments: [{ id: 'broken', date: '2026-10-26' }] })) });
      assert.match(await page.locator('#toast').textContent(), /torneio inválido/);
      assert.equal(await page.locator('#publishAllBtn').isDisabled(), true);
      assert.equal(backend.state().version, before.version + 1);
    });
    await scenario('conflicting drafts retain complete import metadata when exported', async ({ page, backend }) => {
      const state = backend.state();
      const stages = state.stages.concat({ id: 'custom', label: 'Etapa extra', start: '2027-04-13', end: '2027-04-30' });
      await page.evaluate(saved => localStorage.setItem('caligulas_admin_draft_v4', JSON.stringify(saved)), {
        baseVersion: state.version - 1, rows: state.rows, modifiers: state.modifiers,
        monthlyState: { ...state.monthlyState, stageId: 'custom' },
        importedBackup: { metadataMode: 'replace', stages, tournaments: [] }
      });
      await page.reload(); await page.waitForSelector('#dashboard:not([hidden])');
      await page.locator('summary').filter({ hasText: 'Backup e recuperação' }).click();
      const pending = page.waitForEvent('download'); await page.locator('#exportBtn').click();
      const download = await pending;
      const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
      assert.equal(exported.metadataMode, 'replace'); assert.equal(exported.stages.at(-1).id, 'custom'); assert.deepEqual(exported.tournaments, []);
      await page.locator('#importFileInput').setInputFiles({ name: 'recovered.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
      assert.match(await page.locator('#monthlyEditorStage').textContent(), /Etapa extra/);
      assert.equal(await page.locator('#publishAllBtn').isDisabled(), false);
    });
    await scenario('draft finalization exports a restorable open snapshot without inventing a bonus', async ({ page, backend, tab, publish }) => {
      await tab('monthly'); await page.locator('#finalizeMonthlyFromTabBtn').click();
      await page.locator('summary').filter({ hasText: 'Backup e recuperação' }).click();
      const pending = page.waitForEvent('download'); await page.locator('#exportBtn').click();
      const download = await pending;
      const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
      assert.equal(exported.pendingFinalization, true); assert.equal(exported.monthlyState.finalized, false);
      assert.equal(exported.rows[0].bonus, 0);
      await page.locator('#importFileInput').setInputFiles({ name: 'pending-close.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
      await publish('publishAllBtn'); assert.equal(backend.state().monthlyState.finalized, false);
      await page.locator('#finalizeMonthlyFromTabBtn').click(); await publish('publishMonthlyBtn');
      assert.equal(backend.state().rows[0].bonus, 10);
    });
    await scenario('stage controls and tournament create, edit, delete preserve manual count', async ({ page, backend, tab, publish }) => {
      await tab('stages'); await page.locator('[data-stage-remove]').last().click(); await page.locator('#addStageBtn').click(); await publish('saveStagesBtn');
      assert.equal(backend.state().stages.length, 7);
      await tab('tournaments'); await page.locator('#newTournamentBtn').click();
      await page.locator('#tournamentDate').fill('2026-10-26');
      await page.locator('[data-presence-id="p_a"]').check(); await publish('applyTournamentBtn');
      assert.equal(backend.state().monthlyState.tournamentCount, 5); assert.equal(backend.state().rows[0].presences, 5);
      await page.locator('[data-tournament-edit]').click(); await page.locator('[data-placement-id="p_a"]').selectOption('1'); await publish('applyTournamentBtn');
      assert.equal(backend.state().rows[0].points, 41); assert.equal(backend.state().monthlyState.tournamentCount, 5);
      const version = backend.state().version; await page.locator('[data-tournament-delete]').click();
      await page.waitForFunction(v => document.querySelector('#versionBadge').textContent === 'v' + v, version + 1);
      assert.equal(backend.state().rows[0].points, 26); assert.equal(backend.state().rows[0].presences, 4); assert.equal(backend.state().monthlyState.tournamentCount, 4);
      await page.setViewportSize({ width: 390, height: 844 }); await tab('monthly');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('#monthlyAddPlayerBtn').click(); assert.equal(await page.locator('#monthlyPlayerModal').evaluate(el => el.open), true);
    });
    console.log(`${checks} browser scenarios passed with real Apps Script code and simulated Sheets; no production requests.`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
