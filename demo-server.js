/* Demo-Modus: die echte Schnittstelle (Code.gs) läuft im Browser auf einem nachgebildeten Google Sheet. */
(function () {
  const KEY = 'wmk-demo-sheet-v2';
  const iso = d => new Date(d).toLocaleDateString('sv-SE');
  const heute = iso(Date.now()), morgen = iso(Date.now() + 864e5);
  const fmt = (d, o) => new Intl.DateTimeFormat('de-DE', Object.assign({ timeZone: 'Europe/Berlin' }, o)).format(d);

  function seed() {
    const sd = window.KASSE_DEMO.stammdaten;
    const zeit = heute + ' 08:00-22:00; ' + morgen + ' 10:00-20:00';
    const T = {
      'Einstellungen': [['schluessel', 'wert', 'erklaerung'], ['app_titel', 'Weihnachtsmarkt-Kasse', ''], ['verein', 'Pfadfinderbund Süd', ''], ['schnellbetraege', '5;10;20;50', ''], ['storno_anzahl', 2, ''], ['abgleich_sekunden', 60, ''], ['bilder_ordner_id', 'FB', ''], ['info_ordner_id', 'FI', ''], ['aufgaben', 'Standleitung;Kasse;Waffeln;Punsch;Fritteuse', '']],
      'Kategorien': [['kategorie', 'sortierung', 'farbe', 'preis_je_markt', 'notiz']].concat(sd.kategorien.map(k => [k.kategorie, k.sortierung, k.farbe, k.kategorie === 'Pfand' ? 'JA' : 'NEIN', ''])),
      'Produkte': [['produkt_id', 'name', 'kategorie', 'preis', 'bild', 'sortierung', 'aktiv', 'beschreibung', 'info_dateien', 'vorgeschlagen_von', 'notiz']]
        .concat(sd.produkte.map(p => [p.produkt_id, p.name, p.kategorie, p.preis / 100, p.bild, p.sortierung, 'JA', p.beschreibung || '', (p.info || []).map(i => i.name).join(';'), '', ''])),
      'Märkte': [['markt_id', 'name', 'ort', 'datum_von', 'datum_bis', 'archiviert', 'notiz'], ['MK001', 'WM Musterstadt', 'Marktplatz', heute, morgen, 'NEIN', ''], ['MK002', 'Adventsbasar', 'Gemeindehaus', morgen, morgen, 'NEIN', '']],
      'Stände': [['stand_id', 'markt_id', 'name', 'kategorien', 'standzeiten', 'archiviert', 'notiz'], ['S001', 'MK001', 'Holzstand', 'Holzwerk;Deko', zeit, 'NEIN', ''], ['S002', 'MK001', 'Café', 'Gebäck;Getränke;Pfand', zeit, 'NEIN', ''], ['S003', 'MK002', 'Basar', 'ALLE', morgen + ' 14:00-18:00', 'NEIN', '']],
      'Benutzer': [['benutzer_id', 'name', 'registriert_am', 'geraet_id', 'rolle', 'aktiv', 'pin_hash', 'pin_fehler', 'pin_gesperrt_bis', 'eingeladen_von'],
        ['u-fritz', 'Fritz', new Date(), '', 'Admin', 'JA', '', 0, '', ''], ['u-anna', 'Anna', new Date(), '', 'Standleitung', 'JA', '', 0, '', ''], ['u-ben', 'Ben', new Date(), '', 'Helfer', 'JA', '', 0, '', ''], ['u-tom', 'Tom', new Date(), 'x', 'Helfer', 'WARTET', '', 0, '', '']],
      'Zuständigkeiten': [['art', 'ref_id', 'benutzer_id', 'erstellt_von', 'erstellt_am'], ['stand', 'S002', 'u-anna', '', new Date()]],
      'Schichten': [['schicht_id', 'stand_id', 'datum', 'von', 'bis', 'aufgabe', 'benutzer_id', 'platzhalter', 'status', 'erstellt_von'],
        ['sch1', 'S002', heute, '10:00', '14:00', 'Standleitung', 'u-anna', '', 'geplant', ''], ['sch2', 'S002', heute, '10:00', '16:00', 'Kasse', 'u-ben', '', 'geplant', ''],
        ['sch3', 'S002', heute, '14:00', '20:00', 'Waffeln', '', 'Lisa', 'geplant', ''], ['sch4', 'S002', heute, '16:00', '20:00', 'Punsch', 'u-ben', '', 'vorgeschlagen', '']]
    };
    return T;
  }
  const revive = v => (v && v.__d) ? new Date(v.__d) : v;
  let store;
  try { const raw = JSON.parse(localStorage.getItem(KEY)); if (raw) { store = {}; for (const n in raw) store[n] = raw[n].map(r => (r || []).map(revive)); } } catch (e) {}
  if (!store) store = seed();
  const persist = () => { try { const o = {}; for (const n in store) o[n] = store[n].map(r => (r || []).map(v => v instanceof Date ? { __d: v.toISOString() } : v)); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
  const norm = v => typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v;

  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = this.sh.d()[this.r - 1 + i] || []; o.push(Array.from({ length: this.nc }, (_, j) => row[this.c - 1 + j] == null ? '' : row[this.c - 1 + j])); } return o; }
    setValues(v) { const d = this.sh.d(); v.forEach((row, i) => { const R = this.r - 1 + i; d[R] = d[R] || []; row.forEach((x, j) => { d[R][this.c - 1 + j] = norm(x); }); }); }
    setValue(x) { this.setValues([[x]]); }
  }
  class Sheet {
    constructor(n) { this.n = n; }
    d() { return store[this.n]; }
    setName(nn) { store[nn] = store[this.n]; delete store[this.n]; this.n = nn; }
    getLastColumn() { return Math.max(0, ...this.d().map(r => { let l = 0; (r || []).forEach((v, i) => { if (v !== '' && v != null) l = i + 1; }); return l; })); }
    deleteRow(r) { this.d().splice(r - 1, 1); }
    getLastRow() { let l = 0; this.d().forEach((r, i) => { if (r && r.some(v => v !== '' && v != null)) l = i + 1; }); return l; }
    getDataRange() { const w = Math.max(1, ...this.d().map(r => (r || []).length)); return new Range(this, 1, 1, Math.max(1, this.getLastRow()), w); }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  }

  /* kleines SHA-256 (synchron) */
  function sha256(str) {
    const K = [], H = [];
    let n = 2, c = 0;
    const frac = x => ((x - Math.floor(x)) * 4294967296) | 0;
    while (c < 64) { let p = true; for (let i = 2; i * i <= n; i++) if (n % i === 0) { p = false; break; } if (p) { if (c < 8) H[c] = frac(Math.pow(n, 1 / 2)); K[c++] = frac(Math.pow(n, 1 / 3)); } n++; }
    const bytes = Array.from(new TextEncoder().encode(str));
    const l = bytes.length * 8;
    bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
    const w = new Array(64), r = (x, y) => (x >>> y) | (x << (32 - y));
    for (let o = 0; o < bytes.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) { const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, b, cc, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & cc) ^ (b & cc))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = cc; cc = b; b = a; a = (t1 + t2) | 0;
      }
      [a, b, cc, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) | 0; });
    }
    const out = []; H.forEach(v => { for (let i = 3; i >= 0; i--) out.push((v >>> (i * 8)) & 255); });
    return out;
  }

  const demoFiles = () => {
    const b = window.KASSE_DEMO.bilder, out = { FB: {}, FI: {} };
    Object.keys(b).forEach(n => { (/detail|anleitung|info/.test(n) ? out.FI : out.FB)[n] = b[n]; });
    out.FI['Pflegeanleitung.pdf'] = 'pdf';
    return out;
  };
  window.SpreadsheetApp = { getActive: () => ({ getSheetByName: n => store[n] ? new Sheet(n) : null, insertSheet: n => { store[n] = []; return new Sheet(n); } }), flush() {} };
  window.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => s }) };
  window.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  window.CacheService = { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) };
  window.MailApp = { sendEmail() {} };
  window.Utilities = {
    DigestAlgorithm: { SHA_256: 's', MD5: 'm' }, Charset: { UTF_8: 'u' },
    computeDigest: (a, s) => sha256(s),
    getUuid: () => { try { return crypto.randomUUID(); } catch (e) { return 'u' + Math.random().toString(36).slice(2) + Date.now().toString(36) + 'x0000000000000000'; } },
    newBlob: (bytes, mime, name) => ({ bytes, mime, name }), base64Decode: b => b, base64Encode: b => b,
    formatDate: (d, tz, f) => {
      if (f === 'yyyy-MM-dd') return new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      if (f === 'HH:mm') return fmt(d, { hour: '2-digit', minute: '2-digit' });
      return String(d.getTime());
    }
  };
  window.DriveApp = {
    Access: { ANYONE_WITH_LINK: 1 }, Permission: { VIEW: 1 },
    createFolder: () => ({ getId: () => 'FB' }),
    getFolderById: id => ({
      createFile: b => { window.KASSE_DEMO.bilder[b.name] = b.mime === 'application/pdf' ? 'pdf' : 'data:' + b.mime + ';base64,' + b.bytes; return { setSharing() {} }; },
      getFiles: () => { const l = Object.keys(demoFiles()[id] || {}); return { hasNext: () => l.length > 0, next: () => { const n = l.shift(); return { getName: () => n, getId: () => n, getMimeType: () => /\.pdf$/.test(n) ? 'application/pdf' : 'image/jpeg', getLastUpdated: () => new Date(1) }; } }; }
    })
  };

  window.DEMO_SERVER = {
    call(p, post) {
      const gs = window.__GS;
      for (const k in gs.cache_) delete gs.cache_[k];
      const out = post ? gs.doPost({ parameter: {}, postData: { contents: JSON.stringify(p) } }) : gs.doGet({ parameter: p });
      persist();
      return JSON.parse(out);
    },
    setRolle(id, rolle) {
      const t = store['Benutzer'], h = t[0];
      const row = t.find(r => r[0] === id); if (!row) return;
      row[h.indexOf('rolle')] = rolle;
      const z = store['Zuständigkeiten'];
      for (let i = z.length - 1; i > 0; i--) if (z[i][2] === id) z.splice(i, 1);
      if (rolle === 'Standleitung') store['Stände'].slice(1).forEach(s => z.push(['stand', s[0], id, '', new Date()]));
      if (rolle === 'Marktleitung') store['Märkte'].slice(1).forEach(m => z.push(['markt', m[0], id, '', new Date()]));
      persist();
    },
    reset() { localStorage.removeItem(KEY); }
  };
})();
