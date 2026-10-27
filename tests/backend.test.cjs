const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/backend-harness.cjs');

const zeros = () => Array(9).fill(0);
const player = (id, extra = {}) => ({ id, name: id, points: 0, presences: 0, bonus: 0, finishes: zeros(), monthlyPoints: 0, monthlyPresences: 0, monthlyFinishes: zeros(), ...extra });
const event = (id, extra = {}) => ({ id, date: '2026-10-25', type: 'regular', name: 'Domingo', applyGeneral: true, applyMonthly: true, stageId: '2026-10-11', entries: [{ playerId: 'p_a', presence: true, placement: 1 }], createdAt: '2026-10-25T20:00:00.000Z', updatedAt: '2026-10-25T20:00:00.000Z', ...extra });
const backup = (h, extra = {}) => { const s = h.state(); return { rows: s.rows, modifiers: s.modifiers, monthlyState: s.monthlyState, metadataMode: 'replace', stages: s.stages, tournaments: s.tournaments, ...extra }; };
const publish = (h, extra = {}) => { const s = h.state(); return h.api({ action: 'publish', baseVersion: s.version, rows: s.rows, modifiers: s.modifiers, monthlyState: s.monthlyState, ...extra }); };
const general = row => ({ id: row.id, name: row.name, points: row.points, presences: row.presences, bonus: row.bonus, finishes: row.finishes, factor: row.factor, finalPoints: row.finalPoints });
const monthly = row => ({ monthlyPoints: row.monthlyPoints, monthlyPresences: row.monthlyPresences, monthlyFinishes: row.monthlyFinishes, monthlyFinalPoints: row.monthlyFinalPoints });
const fails = (fn, code) => assert.throws(fn, error => error.code === code);

test('Sheets Date cells and legacy verbose stage IDs become ISO dates; monthly edits work', () => {
  const h = createHarness();
  const stages = h.sheets.get('ETAPAS');
  stages.cells[1][0] = new Date('2026-10-11T03:00:00Z');
  stages.cells[1][2] = new Date('2026-10-11T03:00:00Z');
  stages.cells[1][3] = new Date('2026-11-14T03:00:00Z');
  const state = h.state().monthlyState;
  state.stageId = 'Sun Oct 11 2026 00:00:00 GMT-0300 (Horário Padrão de Brasília)';
  h.backend.setMeta_('monthlyState', JSON.stringify(state));
  const before = h.state();
  assert.equal(before.stages[0].id, '2026-10-11');
  assert.equal(before.stages[0].end, '2026-11-14');
  assert.equal(before.monthlyState.stageId, '2026-10-11');
  const after = publish(h, { scope: 'monthly', rows: [{ ...before.rows[0], monthlyPresences: 5 }], monthlyState: { ...state, tournamentCount: 5 } });
  assert.equal(after.rows[0].monthlyPresences, 5);
  assert.equal(after.monthlyState.tournamentCount, 5);
  assert.deepEqual(general(after.rows[0]), general(before.rows[0]));
});

test('v5 migration preserves published cells, credentials and history and is idempotent', () => {
  const h = createHarness({ schemaVersion: 5 });
  const before = structuredClone(h.sheets.get('PUBLICADO').cells);
  const hash = h.backend.PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD_HASH');
  h.sheets.get('ETAPAS').cells[1][0] = new Date('2026-10-11T03:00:00Z');
  h.backend.migrateV5ToV6();
  assert.deepEqual(h.sheets.get('PUBLICADO').cells, before);
  assert.equal(h.state().version, 37);
  assert.equal(h.backend.getMeta_('schemaVersion'), '6');
  assert.equal(h.backend.PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD_HASH'), hash);
  assert.equal(h.sheets.get('ETAPAS').cells[1][0], '2026-10-11');
  assert.ok(h.sheets.get('ETAPAS').formats.some(item => item.value === '@'));
  assert.equal(h.state().history[0].schemaVersion, 5);
  h.backend.migrateV5ToV6();
  assert.equal(h.state().version, 37);
});

test('monthly scope preserves general and modifiers, adds a new player with general zero', () => {
  const h = createHarness(); const before = h.state();
  const after = publish(h, { scope: 'monthly', modifiers: [{ minPresences: 1, factor: 99 }], rows: [{ ...before.rows[0], name: 'Unsaved general rename', points: 999, presences: 99, bonus: 99, monthlyPresences: 5 }, player('p_b', { points: 999, presences: 99, bonus: 99, monthlyPoints: 15, monthlyPresences: 1, monthlyFinishes: [1, ...zeros().slice(1)] })] });
  assert.deepEqual(general(after.rows.find(r => r.id === 'p_a')), general(before.rows[0]));
  assert.deepEqual(after.modifiers, before.modifiers);
  const added = after.rows.find(r => r.id === 'p_b');
  assert.equal(added.finalPoints, 0); assert.equal(added.points, 0); assert.equal(added.presences, 0); assert.equal(added.bonus, 0);
  assert.equal(added.monthlyFinalPoints, 16);
  assert.equal(after.rows.find(r => r.id === 'p_a').monthlyPresences, 5);
  assert.equal(publish(h, { scope: 'monthly', rows: [] }).rows.length, 2);
});

test('general scope preserves monthly fields and state; new players have monthly zero', () => {
  const h = createHarness(); const before = h.state();
  const after = publish(h, { scope: 'general', rows: [{ ...before.rows[0], points: 30, monthlyPoints: 999, monthlyPresences: 99 }, player('p_b', { points: 10, monthlyPoints: 999 })], monthlyState: { ...before.monthlyState, tournamentCount: 999, finalized: true } });
  assert.equal(after.rows[0].points, 30);
  assert.deepEqual(monthly(after.rows[0]), monthly(before.rows[0]));
  assert.deepEqual(after.monthlyState, before.monthlyState);
  assert.equal(after.rows.find(r => r.id === 'p_b').monthlyPoints, 0);
});

test('manual count survives publication and increments/decrements by tournament deltas only', () => {
  const h = createHarness();
  publish(h, { scope: 'monthly', monthlyState: { ...h.state().monthlyState, tournamentCount: 7 } });
  let s = h.api({ action: 'saveTournament', baseVersion: h.state().version, tournament: event('t_a', { applyGeneral: false }) });
  assert.equal(s.monthlyState.tournamentCount, 8); assert.equal(s.rows[0].points, 26); assert.equal(s.rows[0].monthlyPoints, 41);
  s = h.api({ action: 'saveTournament', baseVersion: s.version, tournament: event('t_a', { applyGeneral: false, entries: [{ playerId: 'p_a', presence: true, placement: 2 }] }) });
  assert.equal(s.monthlyState.tournamentCount, 8); assert.equal(s.rows[0].monthlyPoints, 38);
  s = h.api({ action: 'deleteTournament', baseVersion: s.version, tournamentId: 't_a' });
  assert.equal(s.monthlyState.tournamentCount, 7); assert.equal(s.rows[0].monthlyPoints, 26);
});

test('count lower than registered tournaments and fractional counts fail before history/write', () => {
  const h = createHarness({ tournaments: [event('t_a')] }); const before = h.state();
  fails(() => publish(h, { scope: 'monthly', monthlyState: { ...before.monthlyState, tournamentCount: 0 } }), 'MONTHLY_COUNT');
  fails(() => publish(h, { monthlyState: { ...before.monthlyState, tournamentCount: 4.5 } }), 'MONTHLY_COUNT');
  assert.deepEqual(h.state(), before);
});

test('stale version cannot write or create history; unknown players cannot be deleted', () => {
  const h = createHarness({ tournaments: [event('t_a')] }); const before = h.state();
  fails(() => publish(h, { baseVersion: 35 }), 'VERSION_CONFLICT');
  fails(() => publish(h, { scope: 'general', rows: [player('p_b')] }), 'PLAYER_HAS_TOURNAMENTS');
  assert.deepEqual(h.state(), before);
});

test('finalization splits tied bonus, is idempotent, reopens exactly and can finalize again', () => {
  const rows = ['p_a', 'p_b'].map(id => player(id, { points: 10, presences: 4, bonus: 2, monthlyPoints: 10, monthlyPresences: 4 }));
  const h = createHarness({ rows });
  let s = publish(h, { scope: 'monthly', monthlyState: { ...h.state().monthlyState, finalized: true } });
  assert.equal(s.monthlyState.bonusRecipients.length, 2); assert.ok(s.rows.every(r => r.bonus === 7));
  s = publish(h, { scope: 'monthly' }); assert.ok(s.rows.every(r => r.bonus === 7));
  s = h.api({ action: 'reopenStage', baseVersion: s.version });
  assert.ok(s.rows.every(r => r.bonus === 2)); assert.equal(s.monthlyState.finalized, false); assert.deepEqual(s.monthlyState.bonusRecipients, []);
  fails(() => h.api({ action: 'reopenStage', baseVersion: s.version }), 'STAGE_NOT_FINALIZED');
  s = publish(h, { scope: 'monthly', monthlyState: { ...s.monthlyState, finalized: true } });
  assert.ok(s.rows.every(r => r.bonus === 7));
});

test('100% attendance requires equality; invalid excess blocks finalization', () => {
  const h = createHarness(); const state = h.state().monthlyState;
  const s = publish(h, { scope: 'monthly', monthlyState: { ...state, tournamentCount: 3 } });
  assert.equal(s.monthly.rows[0].eligible, false);
  fails(() => publish(h, { scope: 'monthly', monthlyState: { ...s.monthlyState, finalized: true } }), 'MONTHLY_PRESENCES');
  assert.equal(h.state().version, s.version);
});

test('closed stage blocks monthly edits but permits new general zero-monthly players', () => {
  const h = createHarness(); let s = publish(h, { scope: 'monthly', monthlyState: { ...h.state().monthlyState, finalized: true } });
  fails(() => publish(h, { scope: 'monthly', rows: [{ ...s.rows[0], monthlyPoints: 100 }] }), 'STAGE_LOCKED');
  s = publish(h, { scope: 'general', rows: [...s.rows, player('p_b', { points: 5 })] });
  assert.equal(s.rows.find(r => r.id === 'p_b').points, 5);
  fails(() => publish(h, { scope: 'general', rows: [player('p_b')] }), 'STAGE_LOCKED');
});

test('reopen refuses insufficient manually edited bonus and preserves state', () => {
  const h = createHarness(); let s = publish(h, { monthlyState: { ...h.state().monthlyState, finalized: true } });
  s = publish(h, { scope: 'general', rows: [{ ...s.rows[0], bonus: 0 }] });
  const before = h.state();
  fails(() => h.api({ action: 'reopenStage', baseVersion: before.version }), 'BONUS_REVERSAL');
  assert.deepEqual(h.state(), before);
});

test('replace backup restores snapshot totals and existing finalization without replaying bonuses/events', () => {
  const h = createHarness(); let s = publish(h, { monthlyState: { ...h.state().monthlyState, finalized: true } });
  const snap = backup(h, { tournaments: [event('t_a')], rows: [{ ...s.rows[0], points: 123, monthlyPoints: 321 }] });
  s = h.api({ action: 'importBackup', baseVersion: s.version, backup: snap });
  assert.equal(s.rows[0].points, 123); assert.equal(s.rows[0].monthlyPoints, 321); assert.equal(s.rows[0].bonus, 10);
  assert.deepEqual(s.monthlyState, snap.monthlyState); assert.equal(s.tournaments.length, 1);
  assert.equal(s.tournaments[0].updatedAt, snap.tournaments[0].updatedAt);
});

test('preserve backup keeps current calendar/tournaments and refuses active-stage mismatch', () => {
  const h = createHarness({ tournaments: [event('t_a')] }); const before = h.state();
  const snap = backup(h, { metadataMode: 'preserve', rows: [{ ...before.rows[0], monthlyPoints: 77 }] }); delete snap.stages; delete snap.tournaments;
  const s = h.api({ action: 'importBackup', baseVersion: before.version, backup: snap });
  assert.deepEqual(s.tournaments, before.tournaments); assert.deepEqual(s.stages, before.stages); assert.equal(s.rows[0].monthlyPoints, 77);
  fails(() => h.api({ action: 'importBackup', baseVersion: s.version, backup: { ...snap, monthlyState: { ...snap.monthlyState, stageId: '2026-11-15' } } }), 'BACKUP_STAGE_MISMATCH');
});

test('malformed backups reject missing metadata, overlaps, duplicates and broken references without writes', () => {
  const h = createHarness(); const before = h.state(); const snap = backup(h);
  const variants = [
    [{ ...snap, tournaments: undefined }, 'INVALID_BACKUP'],
    [{ ...snap, stages: [snap.stages[0], { ...snap.stages[1], start: '2026-11-14' }] }, 'OVERLAPPING_STAGES'],
    [{ ...snap, tournaments: [event('x'), event('x')] }, 'DUPLICATE_TOURNAMENT'],
    [{ ...snap, tournaments: [event('x', { entries: [{ playerId: 'missing', presence: true, placement: 1 }] })] }, 'PLAYER_HAS_TOURNAMENTS'],
    [{ ...snap, monthlyState: { ...snap.monthlyState, finalized: true, bonusAwardedAt: null } }, 'INVALID_BONUS']
  ];
  for (const [bad, code] of variants) fails(() => h.api({ action: 'importBackup', baseVersion: before.version, backup: bad }), code);
  assert.deepEqual(h.state(), before);
});

test('finalized import validates bonus metadata and cannot hide a previously awarded bonus', () => {
  const h = createHarness();
  publish(h, { monthlyState: { ...h.state().monthlyState, finalized: true } });
  const before = h.state(); const snap = backup(h);
  fails(() => h.api({ action: 'importBackup', baseVersion: before.version, backup: { ...snap, monthlyState: { ...snap.monthlyState, bonusRecipients: [] } } }), 'INVALID_BONUS');
  fails(() => h.api({ action: 'importBackup', baseVersion: before.version, backup: { ...snap, rows: [{ ...snap.rows[0], bonus: 99 }], monthlyState: { ...snap.monthlyState, bonusRecipients: [{ id: snap.rows[0].id, name: snap.rows[0].name, bonus: 99 }] } } }), 'INVALID_BONUS');
  assert.deepEqual(h.state(), before);
});

test('v5 history restores calendar and ledger as well as totals and remains reversible', () => {
  const h = createHarness({ schemaVersion: 5, tournaments: [event('t_a')] }); const before = h.state();
  publish(h, { scope: 'monthly', rows: [{ ...before.rows[0], monthlyPoints: 99 }] });
  let s = h.state(); assert.equal(s.history[0].schemaVersion, 5);
  s = h.api({ action: 'restore', baseVersion: s.version, historyId: s.history[0].id });
  assert.deepEqual(s.rows, before.rows); assert.deepEqual(s.tournaments, before.tournaments); assert.deepEqual(s.stages, before.stages);
  assert.equal(s.history.length, 2);
});

test('large multipart v5 history is advertised as restorable and restores without loss', () => {
  const rows = Array.from({ length: 130 }, (_, i) => player('p_' + i, { name: 'Jogador ' + i + ' '.repeat(80), points: i, presences: 4, monthlyPoints: i, monthlyPresences: 4 }));
  const h = createHarness({ schemaVersion: 5, rows }); const before = h.state();
  let s = publish(h, { rows: before.rows.map(row => ({ ...row, points: row.points + 1 })) });
  assert.ok(h.sheets.get('HISTORICO_PARTES').getLastRow() > 2);
  assert.equal(s.history[0].restorable, true);
  assert.equal(s.history[0].schemaVersion, 5);
  s = h.api({ action: 'restore', baseVersion: s.version, historyId: s.history[0].id });
  assert.deepEqual(s.rows, before.rows);
  const source = h.sheets.get('HISTORICO_PARTES'); source.cells[1][1] = 7;
  assert.equal(h.post({ action: 'historySnapshot', historyId: s.history.at(-1).id }).ok, false);
});

test('mid-write publication failure restores rows, state, version and original timestamp', () => {
  const h = createHarness(); const before = h.state();
  h.failNext('PUBLICADO', 'setValues');
  assert.throws(() => publish(h, { rows: [{ ...before.rows[0], points: 999 }], monthlyState: { ...before.monthlyState, tournamentCount: 6 } }), /Simulated Sheets write failure/);
  const after = h.state();
  assert.deepEqual(after.rows, before.rows); assert.deepEqual(after.monthlyState, before.monthlyState); assert.equal(after.version, before.version); assert.equal(after.updatedAt, before.updatedAt);
  assert.equal(after.history.length, 1);
});

test('failed complete backup import reverses earlier calendar writes and preserves ledger', () => {
  const h = createHarness({ tournaments: [event('t_a')] }); const before = h.state();
  const snap = backup(h, { stages: before.stages.map((stage, index) => index ? stage : { ...stage, label: 'Novo nome' }), tournaments: [event('new')] });
  h.failNext('TORNEIOS', 'setValues');
  assert.throws(() => h.api({ action: 'importBackup', baseVersion: before.version, backup: snap }), /Simulated Sheets write failure/);
  const after = h.state();
  assert.deepEqual(after.stages, before.stages); assert.deepEqual(after.tournaments, before.tournaments); assert.deepEqual(after.rows, before.rows); assert.equal(after.version, before.version); assert.equal(after.updatedAt, before.updatedAt);
});

test('tournament edits use replacement deltas, allow tied placements and safely reject unknown players', () => {
  const h = createHarness({ rows: [player('p_a'), player('p_b')], monthlyState: { stageId: '2026-10-11', tournamentCount: 0, finalized: false, bonusRecipients: [], bonusAwardedAt: null } });
  let s = h.api({ action: 'saveTournament', baseVersion: 36, tournament: event('t_a', { entries: ['p_a', 'p_b'].map(playerId => ({ playerId, presence: true, placement: 1 })) }) });
  assert.ok(s.rows.every(row => row.points === 15 && row.monthlyPoints === 15)); assert.equal(s.monthlyState.tournamentCount, 1);
  s = h.api({ action: 'saveTournament', baseVersion: s.version, tournament: event('t_a', { type: 'special', entries: ['p_a', 'p_b'].map(playerId => ({ playerId, presence: true, placement: 2 })) }) });
  assert.ok(s.rows.every(row => row.points === 18 && row.presences === 1 && row.finishes[0] === 0 && row.finishes[1] === 1)); assert.equal(s.monthlyState.tournamentCount, 1);
  const before = h.state();
  fails(() => h.api({ action: 'saveTournament', baseVersion: s.version, tournament: event('bad', { entries: [{ playerId: 'missing', presence: true, placement: 1 }] }) }), 'UNKNOWN_PLAYER');
  assert.deepEqual(h.state(), before);
  s = h.api({ action: 'deleteTournament', baseVersion: s.version, tournamentId: 't_a' });
  assert.ok(s.rows.every(row => row.points === 0 && row.presences === 0 && row.monthlyPoints === 0));
});

test('advancing clears old monthly only and replays future-stage monthly without replaying general', () => {
  const h = createHarness({ tournaments: [event('future', { date: '2026-11-20', stageId: '2026-11-15' })] });
  const finalized = publish(h, { monthlyState: { ...h.state().monthlyState, finalized: true } });
  const s = h.api({ action: 'advanceStage', baseVersion: finalized.version });
  assert.equal(s.monthlyState.stageId, '2026-11-15'); assert.equal(s.monthlyState.tournamentCount, 1); assert.equal(s.monthlyState.finalized, false);
  assert.deepEqual(general(s.rows[0]), general(finalized.rows[0])); assert.equal(s.rows[0].monthlyPoints, 15); assert.equal(s.rows[0].monthlyPresences, 1);
});

test('auth is required for backend mutations and malformed token leaves version untouched', () => {
  const h = createHarness(); const before = h.state();
  assert.equal(h.post({ action: 'reopenStage', baseVersion: 36, token: 'bad' }).code, 'AUTH_REQUIRED');
  assert.equal(h.post({ action: 'importBackup', baseVersion: 36, backup: backup(h), token: 'bad' }).code, 'AUTH_REQUIRED');
  assert.deepEqual(h.state(), before);
});
