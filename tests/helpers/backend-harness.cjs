const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const clone = value => structuredClone(value);

function createHarness(options = {}) {
  const sheets = new Map();
  const failures = [];
  const properties = new Map();
  let locked = false;
  let uuid = 0;

  function check(sheet, method) {
    const index = failures.findIndex(item => item.sheet === sheet.name && item.method === method);
    if (index !== -1) {
      const failure = failures.splice(index, 1)[0];
      throw new Error(failure.message || 'Simulated Sheets write failure');
    }
  }

  class Range {
    constructor(sheet, row, col, height = 1, width = 1) {
      Object.assign(this, { sheet, row, col, height, width });
    }
    getValues() {
      return Array.from({ length: this.height }, (_, y) => Array.from({ length: this.width }, (_, x) => clone(this.sheet.cells[this.row + y - 1]?.[this.col + x - 1] ?? '')));
    }
    setValues(rows) {
      check(this.sheet, 'setValues');
      if (rows.length !== this.height || rows.some(row => row.length !== this.width)) throw new Error('Range dimensions mismatch');
      rows.forEach((row, y) => row.forEach((value, x) => {
        const r = this.row + y - 1, c = this.col + x - 1;
        this.sheet.cells[r] ||= [];
        this.sheet.cells[r][c] = clone(value);
      }));
      return this;
    }
    setValue(value) { return this.setValues([[value]]); }
    clearContent() {
      check(this.sheet, 'clearContent');
      for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
        this.sheet.cells[this.row + y - 1] ||= [];
        this.sheet.cells[this.row + y - 1][this.col + x - 1] = '';
      }
      return this;
    }
    setNumberFormat(value) {
      this.sheet.formats.push({ row: this.row, col: this.col, height: this.height, width: this.width, value });
      return this;
    }
    clearFormat() { return this; }
    setBackground() { return this; }
    setFontColor() { return this; }
    setFontWeight() { return this; }
    setHorizontalAlignment() { return this; }
  }

  class Sheet {
    constructor(name) { this.name = name; this.cells = []; this.formats = []; this.maxColumns = 100; }
    getRange(...args) { return new Range(this, ...args); }
    getLastRow() {
      for (let i = this.cells.length - 1; i >= 0; i--) if (this.cells[i]?.some(value => value !== '' && value != null)) return i + 1;
      return 0;
    }
    getLastColumn() { return Math.max(0, ...this.cells.map(row => row?.length || 0)); }
    getMaxColumns() { return this.maxColumns; }
    insertColumnsAfter(_, count) { this.maxColumns += count; return this; }
    appendRow(row) { check(this, 'appendRow'); this.cells[this.getLastRow()] = clone(row); return this; }
    deleteRow(row) { check(this, 'deleteRow'); this.cells.splice(row - 1, 1); }
    deleteRows(row, count) { check(this, 'deleteRows'); this.cells.splice(row - 1, count); }
    clear() { check(this, 'clear'); this.cells = []; return this; }
    setFrozenRows() { return this; }
    setColumnWidth() { return this; }
    setColumnWidths() { return this; }
  }

  const spreadsheet = {
    getSheetByName(name) { return sheets.get(name) || null; },
    insertSheet(name) { const sheet = new Sheet(name); sheets.set(name, sheet); return sheet; }
  };
  const context = vm.createContext({
    console,
    Date,
    SpreadsheetApp: { openById: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) || null, setProperty: (key, value) => properties.set(key, value) }) },
    LockService: { getScriptLock: () => ({ waitLock() { if (locked) throw new Error('Concurrent script lock'); locked = true; }, releaseLock() { locked = false; } }) },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: content => ({ content, setMimeType() { return this; } }) },
    Utilities: {
      getUuid: () => 'mock-uuid-' + (++uuid), sleep() {}, Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
      formatDate(value) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value); const part = type => parts.find(p => p.type === type).value; return `${part('year')}-${part('month')}-${part('day')}`; },
      computeDigest: (algorithm, value) => [...crypto.createHash(algorithm).update(value).digest()],
      computeHmacSha256Signature: (value, secret) => [...crypto.createHmac('sha256', secret).update(value).digest()],
      base64EncodeWebSafe: value => Buffer.from(typeof value === 'string' ? value : value).toString('base64url'),
      base64DecodeWebSafe: value => [...Buffer.from(value, 'base64url')],
      newBlob: value => ({ getDataAsString: () => Buffer.from(value).toString('utf8') })
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8'), context, { filename: 'Code.gs' });
  context.setupProject();
  if (options.stages) context.writeStagesV5_(options.stages);
  const rows = options.rows || [{ id: 'p_a', name: 'Ana', points: 26, presences: 4, bonus: 0, finishes: [0, 0, 0, 1, 0, 0, 1, 1, 1], monthlyPoints: 26, monthlyPresences: 4, monthlyFinishes: [0, 0, 0, 1, 0, 0, 1, 1, 1] }];
  context.writePublished_(rows, options.modifiers || context.defaultModifiers_());
  context.setMonthlyState_(options.monthlyState || { stageId: '2026-10-11', tournamentCount: 4, finalized: false, bonusRecipients: [], bonusAwardedAt: null });
  context.writeTournamentsV5_(options.tournaments || []);
  context.setMeta_('version', String(options.version || 36));
  context.setMeta_('schemaVersion', String(options.schemaVersion || 6));
  context.setMeta_('updatedAt', '2026-10-26T12:00:00.000Z');
  const token = context.createToken_();
  function post(payload) {
    return JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ token, ...payload }) } }).content);
  }
  function api(payload) {
    const result = post(payload);
    if (!result.ok) { const error = new Error(result.message); error.code = result.code; throw error; }
    return result;
  }
  return { context, backend: context, spreadsheet, sheets, token, post, api, state: () => clone(context.adminState_()), failNext: (sheet, method = 'setValues', message) => failures.push({ sheet, method, message }) };
}

module.exports = { createHarness };
