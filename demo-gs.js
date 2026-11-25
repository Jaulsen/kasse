/* Code.gs der Schnittstelle, für den Demo-Modus im Browser */
window.__GS = (function () {
/**
 * Weihnachtsmarkt-Kasse – Google-Schnittstelle
 * Version 2.4 · 2026-11-25
 *
 * Gehört in das Apps-Script-Projekt am Google Sheet (Erweiterungen › Apps Script).
 * Fehlende Tabs und Spalten legt die Schnittstelle selbst an; ein Sheet aus
 * Version 1.x wird beim ersten Aufruf automatisch umgestellt (Märkte › Stände).
 */

const VERSION = '2.4';
const TZ = 'Europe/Berlin';
const MAX_DATEI_BYTES = 350000;
const PUFFER_MIN = 30;
const RANG = { Helfer: 1, Standleitung: 2, Marktleitung: 3, Admin: 4 };

const TABS = {
  'Einstellungen': ['schluessel', 'wert', 'erklaerung'],
  'Kategorien': ['kategorie', 'sortierung', 'farbe', 'preis_je_markt', 'notiz'],
  'Produkte': ['produkt_id', 'name', 'kategorie', 'preis', 'bild', 'sortierung', 'aktiv', 'beschreibung', 'info_dateien', 'vorgeschlagen_von', 'notiz', 'verantwortlich_id', 'verantwortlich_platzhalter', 'offen_bild', 'offen_beschreibung', 'offen_info', 'offen_von', 'offen_am'],
  'Märkte': ['markt_id', 'name', 'ort', 'datum_von', 'datum_bis', 'archiviert', 'notiz'],
  'Stände': ['stand_id', 'markt_id', 'name', 'kategorien', 'standzeiten', 'archiviert', 'notiz'],
  'Zuständigkeiten': ['art', 'ref_id', 'benutzer_id', 'verantwortlich', 'erstellt_von', 'erstellt_am'],
  'Preise': ['markt_id', 'produkt_id', 'preis', 'geaendert_von', 'geaendert_am'],
  'Benutzer': ['benutzer_id', 'name', 'registriert_am', 'geraet_id', 'rolle', 'aktiv', 'pin_hash', 'pin_fehler', 'pin_gesperrt_bis', 'eingeladen_von', 'entfernt'],
  'Einladungen': ['token', 'name', 'erstellt_von', 'erstellt_am', 'gueltig_bis', 'eingeloest_von'],
  'Schichten': ['schicht_id', 'stand_id', 'datum', 'von', 'bis', 'aufgabe', 'benutzer_id', 'platzhalter', 'status', 'erstellt_von', 'ersetzt', 'anfrage'],
  'Verfügbarkeit': ['stand_id', 'produkt_id', 'status', 'geaendert_von', 'geaendert_am', 'geprueft'],
  'Zugangscodes': ['code', 'stand_id', 'datum', 'erstellt_von', 'erstellt_am', 'eingeloest_von', 'geraet_id', 'eingeloest_am', 'entzogen_am', 'entzogen_von'],
  'Verkäufe': ['bon_id', 'zeit', 'stand_id', 'benutzer_id', 'geraet_id', 'anzahl_artikel', 'summe', 'gegeben', 'rueckgeld', 'status', 'art', 'empfangen_am', 'hinweis', 'bestaetigt_von', 'bestaetigt_am'],
  'Positionen': ['bon_id', 'pos_nr', 'zeit', 'stand_id', 'benutzer_id', 'produkt_id', 'produktname', 'kategorie', 'einzelpreis', 'menge', 'zeilensumme', 'status'],
  'Rückmeldungen': ['rm_id', 'zeit', 'benutzer_id', 'stand_id', 'typ', 'text', 'geraet_info', 'status', 'notiz'],
  'Nachrichten': ['nachricht_id', 'an', 'titel', 'text', 'von', 'am', 'gelesen_am'],
  'Vorschläge': ['vorschlag_id', 'art', 'ref_id', 'daten', 'von', 'an', 'am', 'status'],
  'Checklisten': ['punkt_id', 'art', 'ref_id', 'text', 'zustaendig_id', 'platzhalter', 'faellig', 'sortierung', 'erledigt_von', 'erledigt_am'],
  'Vorlagen': ['vorlage_id', 'name', 'typ', 'besitzer', 'basis_id', 'punkte', 'geaendert_am']
};

/* ===================================================================
   Einstieg
   =================================================================== */
function doGet(e) { return antwort_(verarbeite_((e && e.parameter) || {})); }

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return antwort_({ ok: false, fehler: 'Anfrage nicht lesbar.' }); }
  return antwort_(verarbeite_(Object.assign({}, (e && e.parameter) || {}, body)));
}

const AKTIONEN = {
  ping: function () { return { ok: true, version: VERSION, zeit: new Date().toISOString() }; },
  einladung_info: einladungInfo_, registrieren: registrieren_, anmelden: anmelden_,
  stammdaten: stammdaten_, dateien: dateien_, sync: sync_,
  code_erzeugen: codeErzeugen_, code_einloesen: codeEinloesen_, zugang_entziehen: zugangEntziehen_, personal: personal_,
  uebersicht: uebersicht_, hinweise: hinweise_, hinweis_aktion: hinweisAktion_,
  plan: plan_, schicht_speichern: schichtSpeichern_, schicht_loeschen: schichtLoeschen_,
  einladung_erstellen: einladungErstellen_,
  benutzer_liste: benutzerListe_, benutzer_aendern: benutzerAendern_,
  produkte_admin: produkteAdmin_, produkt_speichern: produktSpeichern_, kategorie_speichern: kategorieSpeichern_, preis_speichern: preisSpeichern_,
  struktur: struktur_, markt_speichern: marktSpeichern_, stand_speichern: standSpeichern_, zustaendigkeit: zustaendigkeit_,
  einstellungen_admin: einstellungenAdmin_, einstellungen_speichern: einstellungenSpeichern_,
  rueckmeldungen_liste: rueckmeldungenListe_, rueckmeldung_status: rueckmeldungStatus_,
  bons_liste: bonsListe_,
  benutzer_loeschen: benutzerLoeschen_, nachricht_senden: nachrichtSenden_, nachricht_gelesen: nachrichtGelesen_,
  verantwortung: verantwortung_, checkpunkt_speichern: checkpunktSpeichern_, checkpunkt_loeschen: checkpunktLoeschen_, checkpunkt_haken: checkpunktHaken_,
  vorlage_speichern: vorlageSpeichern_, vorlage_loeschen: vorlageLoeschen_, vorlage_anwenden: vorlageAnwenden_, markt_kopieren: marktKopieren_
};

function verarbeite_(p) {
  try {
    migrieren_();
    const f = AKTIONEN[p.aktion];
    if (!f) return { ok: false, fehler: 'Unbekannte Aktion: ' + p.aktion };
    return f(p);
  } catch (err) {
    console.error(err && err.stack || err);
    return { ok: false, fehler: String((err && err.message) || err) };
  }
}

function antwort_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ===================================================================
   Tabellen-Hilfen (Spalten über die Überschrift)
   =================================================================== */
const cache_ = {};

function tab_(name) {
  if (cache_[name]) return cache_[name];
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]);
  }
  const werte = sh.getDataRange().getValues();
  const kopf = (werte.shift() || []).map(function (h) { return String(h).trim(); });
  const zeilen = [];
  werte.forEach(function (w, i) {
    if (w.every(function (c) { return c === '' || c === null; })) return;
    const o = { _zeile: i + 2 };
    kopf.forEach(function (h, j) { if (h) o[h] = w[j]; });
    zeilen.push(o);
  });
  const t = { sh: sh, kopf: kopf, zeilen: zeilen, letzte: Math.max(sh.getLastRow(), 1) };
  cache_[name] = t;
  (TABS[name] || []).forEach(function (c) { spalteSicherstellen_(t, c); });
  return t;
}

function spalteSicherstellen_(t, name) {
  if (t.kopf.indexOf(name) >= 0) return;
  let j = t.kopf.indexOf('');
  if (j < 0) j = t.kopf.length;
  t.sh.getRange(1, j + 1).setValue(name);
  t.kopf[j] = name;
}

function spalte_(t, name) { spalteSicherstellen_(t, name); return t.kopf.indexOf(name) + 1; }

function anhaengen_(t, objekte) {
  if (!objekte.length) return [];
  const start = t.letzte + 1;
  const werte = objekte.map(function (o) { return t.kopf.map(function (h) { return o[h] === undefined || o[h] === null ? '' : o[h]; }); });
  t.sh.getRange(start, 1, werte.length, t.kopf.length).setValues(werte);
  t.letzte = start + werte.length - 1;
  return objekte.map(function (o, i) {
    const z = Object.assign({ _zeile: start + i }, o);
    Object.keys(z).forEach(function (k) { if (typeof z[k] === 'string' && z[k].charAt(0) === "'") z[k] = z[k].slice(1); });
    t.zeilen.push(z); return z;
  });
}

function setzen_(t, zeile, spaltenname, wert) {
  t.sh.getRange(zeile._zeile, spalte_(t, spaltenname)).setValue(wert);
  zeile[spaltenname] = typeof wert === 'string' && wert.charAt(0) === "'" ? wert.slice(1) : wert;
}

function loeschen_(t, zeile) {
  t.sh.deleteRow(zeile._zeile);
  t.zeilen = t.zeilen.filter(function (z) { return z !== zeile; });
  t.zeilen.forEach(function (z) { if (z._zeile > zeile._zeile) z._zeile--; });
  t.letzte--;
}

const txt_ = function (v) { return v === null || v === undefined ? '' : String(v).trim(); };
const ja_ = function (v) { return txt_(v).toUpperCase() === 'JA'; };
const nichtNein_ = function (v) { return txt_(v).toUpperCase() !== 'NEIN'; };
const name_ = function (v) { return txt_(v).replace(/\s+/g, ' '); };
const iso_ = function (v) { return v instanceof Date ? v.toISOString() : txt_(v); };
const alsText_ = function (v) { return "'" + v; };
function cent_(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  const n = parseFloat(txt_(v).replace(/[^0-9,.\-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n * 100);
}
const euro_ = function (cent) { return Math.round(Number(cent) || 0) / 100; };
function tag_(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? txt_(v) : Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}
function uhr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  const m = /^(\d{1,2}):(\d{2})/.exec(txt_(v));
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}
const heute_ = function () { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); };
const jetztMin_ = function () { const s = Utilities.formatDate(new Date(), TZ, 'HH:mm').split(':'); return Number(s[0]) * 60 + Number(s[1]); };
const minuten_ = function (hhmm) { const s = txt_(hhmm).split(':'); return Number(s[0]) * 60 + Number(s[1] || 0); };
function neueId_(t, spalte, praefix) {
  let max = 0;
  const re = new RegExp('^' + praefix + '(\\d+)$', 'i');
  t.zeilen.forEach(function (z) { const m = re.exec(txt_(z[spalte])); if (m) max = Math.max(max, Number(m[1])); });
  const n = max + 1;
  return praefix + (n < 100 ? ('00' + n).slice(-3) : String(n));
}
let sperreTiefe_ = 0;
function sperre_(fn) {
  if (sperreTiefe_) return fn();
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  sperreTiefe_++;
  try { return fn(); } finally { sperreTiefe_--; lock.releaseLock(); }
}

/* ===================================================================
   Umstellung eines Sheets aus Version 1.x
   =================================================================== */
function migrieren_() {
  const ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName('Stände')) return migrieren24_();
  const alt = ss.getSheetByName('Märkte');
  if (!alt) return;   // neues Sheet: Tabs entstehen bei Bedarf
  sperre_(function () {
    if (ss.getSheetByName('Stände')) return;
    alt.setName('Stände');
    const umbenennen = function (sh, von, nach) {
      if (!sh) return;
      const kopf = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
      const j = kopf.map(function (h) { return String(h).trim(); }).indexOf(von);
      if (j >= 0) sh.getRange(1, j + 1).setValue(nach);
    };
    umbenennen(alt, 'markt_id', 'stand_id');
    ['Verkäufe', 'Positionen', 'Verfügbarkeit', 'Zugangscodes', 'Rückmeldungen'].forEach(function (n) { umbenennen(ss.getSheetByName(n), 'markt_id', 'stand_id'); });
    const st = tab_('Stände');
    let von = '', bis = '';
    st.zeilen.forEach(function (z) {
      const a = tag_(z.datum_von), b = tag_(z.datum_bis) || a;
      if (a && (!von || a < von)) von = a;
      if (b && (!bis || b > bis)) bis = b;
      setzen_(st, z, 'markt_id', 'MK001');
      if (!txt_(z.standzeiten) && a) {
        const tage = [];
        for (let d = new Date(a + 'T12:00:00'); tag_(d) <= b; d = new Date(d.getTime() + 864e5)) tage.push(tag_(d) + ' 10:00-20:00');
        setzen_(st, z, 'standzeiten', tage.join('; '));
      }
      setzen_(st, z, 'archiviert', txt_(z.aktiv).toUpperCase() === 'NEIN' ? 'JA' : 'NEIN');
    });
    anhaengen_(tab_('Märkte'), [{ markt_id: 'MK001', name: 'Übernommene Stände', ort: '', datum_von: von, datum_bis: bis, archiviert: 'NEIN' }]);
    Object.keys(cache_).forEach(function (k) { delete cache_[k]; });
  });
  migrieren24_();
}
/* 2.4: jeder Stand und Markt bekommt Verantwortliche (bisherige Leitung, sonst der erste Admin) */
function migrieren24_() {
  if (Number(einstellungen_().schema) >= 24) return;
  sperre_(function () {
    if (Number(einstellungen_().schema) >= 24) return;
    const zt = tab_('Zuständigkeiten');
    const admin = tab_('Benutzer').zeilen.filter(function (x) { return rolle_(x) === 'Admin' && status_(x) === 'aktiv'; })[0];
    const einrichten = function (art, ref) {
      const l = zt.zeilen.filter(function (z) { return txt_(z.art) === art && txt_(z.ref_id) === txt_(ref); });
      if (l.some(function (z) { return ja_(z.verantwortlich); })) return;
      if (l.length) l.slice(0, 2).forEach(function (z) { setzen_(zt, z, 'verantwortlich', 'JA'); });
      else if (admin) anhaengen_(zt, [{ art: art, ref_id: ref, benutzer_id: txt_(admin.benutzer_id), verantwortlich: 'JA', erstellt_am: new Date() }]);
    };
    tab_('Stände').zeilen.forEach(function (z) { if (txt_(z.stand_id)) einrichten('stand', txt_(z.stand_id)); });
    tab_('Märkte').zeilen.forEach(function (z) { if (txt_(z.markt_id)) einrichten('markt', txt_(z.markt_id)); });
    if (admin || !tab_('Stände').zeilen.length) einstellungSetzen_('schema', 24);
  });
}

/* ===================================================================
   Personen, Rollen, Rechte
   =================================================================== */
function einstellungen_() {
  const e = {};
  tab_('Einstellungen').zeilen.forEach(function (z) { const k = txt_(z.schluessel); if (k) e[k] = z.wert; });
  return e;
}
function einstellungSetzen_(k, v) {
  const t = tab_('Einstellungen');
  const z = t.zeilen.filter(function (x) { return txt_(x.schluessel) === k; })[0];
  if (z) setzen_(t, z, 'wert', v); else anhaengen_(t, [{ schluessel: k, wert: v }]);
}
function ordnerSicherstellen_(schluessel, name) {
  const id = txt_(einstellungen_()[schluessel]);
  if (id && id.charAt(0) !== '[') return id;
  const neu = DriveApp.createFolder(name).getId();
  einstellungSetzen_(schluessel, neu);
  return neu;
}
function aufgaben_() {
  const a = txt_(einstellungen_().aufgaben || 'Kasse;Waffeln;Punsch;Fritteuse').split(/[;,]/).map(txt_).filter(String);
  if (a.indexOf('Standleitung') < 0) a.unshift('Standleitung');
  return a;
}

function benutzer_(id) {
  if (!id) return null;
  return tab_('Benutzer').zeilen.filter(function (z) { return txt_(z.benutzer_id) === txt_(id); })[0] || null;
}
const rolle_ = function (b) { return b ? (RANG[txt_(b.rolle)] ? txt_(b.rolle) : 'Helfer') : ''; };
const rang_ = function (b) { return b ? RANG[rolle_(b)] : 0; };
const status_ = function (b) { const a = txt_(b.aktiv).toUpperCase(); return a === 'WARTET' ? 'wartet' : a === 'NEIN' ? 'gesperrt' : 'aktiv'; };
function benutzerInfo_(z) {
  return { benutzer_id: txt_(z.benutzer_id), name: name_(z.name), rolle: rolle_(z), status: status_(z), aktiv: status_(z) === 'aktiv', geraet_id: txt_(z.geraet_id) };
}
function pinHash_(id, pin) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, id + ':' + pin, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

/* angemeldete, freigegebene Person auf ihrem Gerät */
function auth_(p, minRang) {
  const b = benutzer_(p.benutzer_id);
  if (!b) throw new Error('NICHT_ANGEMELDET');
  if (p.geraet_id && txt_(b.geraet_id) && txt_(b.geraet_id) !== txt_(p.geraet_id)) throw new Error('NICHT_ANGEMELDET');
  if (status_(b) !== 'aktiv') throw new Error(status_(b) === 'wartet' ? 'Konto wartet auf Freigabe.' : 'Zugang gesperrt.');
  if (minRang && rang_(b) < minRang) throw new Error('Keine Berechtigung.');
  return b;
}

function stand_(id) { return tab_('Stände').zeilen.filter(function (z) { return txt_(z.stand_id) === txt_(id); })[0] || null; }
function markt_(id) { return tab_('Märkte').zeilen.filter(function (z) { return txt_(z.markt_id) === txt_(id); })[0] || null; }
function zustaendig_(b, art, ref) {
  const id = txt_(b.benutzer_id);
  return tab_('Zuständigkeiten').zeilen.some(function (z) { return txt_(z.art) === art && txt_(z.ref_id) === txt_(ref) && txt_(z.benutzer_id) === id; });
}
function marktRecht_(b, marktId) { return rang_(b) >= 3; }
function verantwortliche_(art, ref) {
  return tab_('Zuständigkeiten').zeilen.filter(function (z) { return txt_(z.art) === art && txt_(z.ref_id) === txt_(ref) && ja_(z.verantwortlich); }).map(function (z) { return txt_(z.benutzer_id); });
}
const verantwortlich_ = function (b, art, ref) { return verantwortliche_(art, ref).indexOf(txt_(b.benutzer_id)) >= 0; };
/* Ändern: Verantwortliche und höhere Rollen; andere Leitungen schlagen vor */
function standAendern_(b, standId) { return rang_(b) >= 3 || verantwortlich_(b, 'stand', standId); }
function marktAendern_(b, marktId) { return rang_(b) >= 4 || (rang_(b) >= 3 && verantwortlich_(b, 'markt', marktId)); }
/* Für Hinweise: Stände, um die sich jemand selbst kümmert */
function eigeneStaende_(b) {
  const out = {}, id = txt_(b.benutzer_id);
  const maerkte = {};
  tab_('Zuständigkeiten').zeilen.forEach(function (z) {
    if (txt_(z.benutzer_id) !== id) return;
    if (txt_(z.art) === 'stand') out[txt_(z.ref_id)] = true; else maerkte[txt_(z.ref_id)] = true;
  });
  tab_('Stände').zeilen.forEach(function (s) { if (maerkte[txt_(s.markt_id)]) out[txt_(s.stand_id)] = true; });
  return out;
}

function standRecht_(b, standId) {
  if (rang_(b) >= 3) return !!stand_(standId) || rang_(b) >= 4;
  return rang_(b) >= 2 && zustaendig_(b, 'stand', standId);
}

function standPruefen_(b, standId) { if (!standRecht_(b, standId)) throw new Error('Keine Berechtigung für diesen Stand.'); }

function standzeiten_(text) {
  return txt_(text).split(/[;\n]/).map(txt_).filter(String).map(function (s) {
    const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(s);
    return m ? { datum: m[1], von: uhr_(m[2]), bis: uhr_(m[3]) } : null;
  }).filter(Boolean).sort(function (a, b) { return (a.datum + a.von) < (b.datum + b.von) ? -1 : 1; });
}
function innerhalbStandzeit_(stand, zeit) {
  const d = zeit instanceof Date ? zeit : new Date(zeit);
  const tag = tag_(d), min = minuten_(Utilities.formatDate(d, TZ, 'HH:mm'));
  return standzeiten_(stand && stand.standzeiten).some(function (z) {
    return z.datum === tag && min >= minuten_(z.von) - PUFFER_MIN && min <= minuten_(z.bis) + PUFFER_MIN;
  });
}
function schichtAktiv_(benutzerId, standId, zeit) {
  const d = zeit instanceof Date ? zeit : new Date(zeit);
  const tag = tag_(d), min = minuten_(Utilities.formatDate(d, TZ, 'HH:mm'));
  return tab_('Schichten').zeilen.some(function (z) {
    return txt_(z.benutzer_id) === txt_(benutzerId) && txt_(z.stand_id) === txt_(standId) && txt_(z.status) === 'geplant' &&
      tag_(z.datum) === tag && min >= minuten_(uhr_(z.von)) - PUFFER_MIN && min <= minuten_(uhr_(z.bis)) + PUFFER_MIN;
  });
}
const zugangGueltig_ = function (z, zeit) {
  if (!txt_(z.eingeloest_am)) return false;
  if (!txt_(z.entzogen_am)) return true;
  return zeit ? new Date(zeit) < new Date(z.entzogen_am) : false;
};

/* ===================================================================
   Einladung, Registrierung, Anmeldung
   =================================================================== */
function einladungErstellen_(p) {
  const b = auth_(p, 2);
  const name = name_(p.name);
  if (name.length < 2) throw new Error('Name fehlt.');
  return sperre_(function () {
    if (tab_('Benutzer').zeilen.some(function (x) { return name_(x.name).toLowerCase() === name.toLowerCase(); })) throw new Error('Name gibt es schon.');
    const token = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    anhaengen_(tab_('Einladungen'), [{ token: token, name: name, erstellt_von: txt_(b.benutzer_id), erstellt_am: new Date(), gueltig_bis: new Date(Date.now() + 24 * 3600000) }]);
    return { ok: true, token: token, name: name };
  });
}
function einladung_(token) {
  const z = tab_('Einladungen').zeilen.filter(function (x) { return txt_(x.token) === txt_(token); })[0];
  if (!z) return { fehler: 'Einladung ungültig.' };
  if (txt_(z.eingeloest_von)) return { fehler: 'Einladung schon benutzt.' };
  if (new Date(z.gueltig_bis) < new Date()) return { fehler: 'Einladung abgelaufen.' };
  return { z: z };
}
function einladungInfo_(p) {
  const e = einladung_(p.token);
  return e.fehler ? { ok: false, fehler: e.fehler } : { ok: true, name: name_(e.z.name) };
}
function registrieren_(p) {
  const pin = txt_(p.pin);
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, fehler: 'PIN: 4–6 Ziffern.' };
  return sperre_(function () {
    const e = einladung_(p.token);
    if (e.fehler) return { ok: false, fehler: e.fehler };
    const t = tab_('Benutzer');
    const name = name_(e.z.name);
    if (t.zeilen.some(function (x) { return name_(x.name).toLowerCase() === name.toLowerCase(); })) return { ok: false, fehler: 'Name gibt es schon.' };
    const id = Utilities.getUuid();
    const neu = anhaengen_(t, [{ benutzer_id: id, name: name, registriert_am: new Date(), geraet_id: txt_(p.geraet_id), rolle: 'Helfer', aktiv: 'WARTET', pin_hash: pinHash_(id, pin), pin_fehler: 0, eingeladen_von: txt_(e.z.erstellt_von) }])[0];
    setzen_(tab_('Einladungen'), e.z, 'eingeloest_von', id);
    platzhalterVerknuepfen_(id, name);
    return { ok: true, benutzer: benutzerInfo_(neu) };
  });
}
function platzhalterVerknuepfen_(id, name) {
  const s = tab_('Schichten'), n = name.toLowerCase();
  s.zeilen.forEach(function (z) {
    if (!txt_(z.benutzer_id) && name_(z.platzhalter).toLowerCase() === n && txt_(z.status) === 'geplant' && !ueberschneidung_(id, tag_(z.datum), uhr_(z.von), uhr_(z.bis), z.schicht_id)) {
      setzen_(s, z, 'benutzer_id', id); setzen_(s, z, 'status', 'verknuepfung');
    }
  });
  const pr = tab_('Produkte');
  pr.zeilen.forEach(function (z) { if (!txt_(z.verantwortlich_id) && name_(z.verantwortlich_platzhalter).toLowerCase() === n) { setzen_(pr, z, 'verantwortlich_id', id); setzen_(pr, z, 'verantwortlich_platzhalter', ''); } });
  const ck = tab_('Checklisten');
  ck.zeilen.forEach(function (z) { if (!txt_(z.zustaendig_id) && name_(z.platzhalter).toLowerCase() === n) { setzen_(ck, z, 'zustaendig_id', id); setzen_(ck, z, 'platzhalter', ''); } });
}

function anmelden_(p) {
  const name = name_(p.name), pin = txt_(p.pin);
  if (name.length < 2) return { ok: false, fehler: 'Bitte Namen eingeben.' };
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, fehler: 'PIN: 4–6 Ziffern.' };
  return sperre_(function () {
    const t = tab_('Benutzer');
    const treffer = t.zeilen.filter(function (x) { return name_(x.name).toLowerCase() === name.toLowerCase(); });
    if (!treffer.length) {
      if (t.zeilen.some(function (x) { return txt_(x.benutzer_id); })) return { ok: false, fehler: 'Unbekannter Name. Registrierung nur mit Einladung.' };
      const id = Utilities.getUuid();   // allererste Person: Admin
      const neu = anhaengen_(t, [{ benutzer_id: id, name: name, registriert_am: new Date(), geraet_id: txt_(p.geraet_id), rolle: 'Admin', aktiv: 'JA', pin_hash: pinHash_(id, pin), pin_fehler: 0 }])[0];
      return { ok: true, benutzer: benutzerInfo_(neu) };
    }
    const z = treffer.filter(function (x) { return txt_(x.pin_hash) === pinHash_(txt_(x.benutzer_id), pin); })[0]
      || treffer.filter(function (x) { return !txt_(x.pin_hash); })[0] || treffer[0];
    if (status_(z) === 'gesperrt') return { ok: false, fehler: 'Zugang gesperrt.' };
    const bis = z.pin_gesperrt_bis ? new Date(z.pin_gesperrt_bis) : null;
    if (bis && !isNaN(bis.getTime()) && bis > new Date()) return { ok: false, fehler: 'Zu viele Fehlversuche. Wieder ab ' + Utilities.formatDate(bis, TZ, 'HH:mm') + ' Uhr.' };
    const id = txt_(z.benutzer_id);
    if (!txt_(z.pin_hash)) setzen_(t, z, 'pin_hash', pinHash_(id, pin));
    else if (txt_(z.pin_hash) !== pinHash_(id, pin)) {
      const f = (Number(z.pin_fehler) || 0) + 1;
      if (f >= 5) { setzen_(t, z, 'pin_fehler', 0); setzen_(t, z, 'pin_gesperrt_bis', new Date(Date.now() + 15 * 60000)); }
      else setzen_(t, z, 'pin_fehler', f);
      return { ok: false, fehler: 'Name oder PIN falsch.' };
    }
    if (Number(z.pin_fehler)) setzen_(t, z, 'pin_fehler', 0);
    if (txt_(p.geraet_id)) setzen_(t, z, 'geraet_id', txt_(p.geraet_id));
    if (!t.zeilen.some(function (x) { return rolle_(x) === 'Admin' && status_(x) === 'aktiv'; })) setzen_(t, z, 'rolle', 'Admin');
    return { ok: true, benutzer: benutzerInfo_(z) };
  });
}

/* ===================================================================
   Drive-Ordner
   =================================================================== */
function ordnerListe_(ordnerId) {
  ordnerId = txt_(ordnerId);
  if (!ordnerId || ordnerId.charAt(0) === '[') return {};
  const c = CacheService.getScriptCache();
  const key = 'ordner_' + ordnerId;
  const alt = c.get(key);
  if (alt) return JSON.parse(alt);
  const liste = {};
  const it = DriveApp.getFolderById(ordnerId).getFiles();
  while (it.hasNext()) { const f = it.next(); liste[f.getName()] = { id: f.getId(), mime: f.getMimeType(), t: f.getLastUpdated().getTime() }; }
  try { c.put(key, JSON.stringify(liste), 300); } catch (err) { /* zu groß */ }
  return liste;
}
function dateiSpeichern_(ordnerId, name, base64, mime, oeffentlich) {
  const f = DriveApp.getFolderById(ordnerId).createFile(Utilities.newBlob(Utilities.base64Decode(base64), mime || 'image/jpeg', name));
  if (oeffentlich) { try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) { console.warn('Freigabe', err); } }
  CacheService.getScriptCache().remove('ordner_' + ordnerId);
  return name;
}

/* ===================================================================
   Stammdaten
   =================================================================== */
function zugangFuer_(b, geraetId) {
  const h = heute_(), zugang = {};
  tab_('Zugangscodes').zeilen.forEach(function (z) {
    if (txt_(z.geraet_id) === txt_(geraetId) && tag_(z.datum) === h && zugangGueltig_(z)) zugang[txt_(z.stand_id)] = h;
  });
  tab_('Schichten').zeilen.forEach(function (z) {
    if (txt_(z.benutzer_id) === txt_(b.benutzer_id) && txt_(z.status) === 'geplant' && tag_(z.datum) === h &&
      jetztMin_() >= minuten_(uhr_(z.von)) - PUFFER_MIN && jetztMin_() <= minuten_(uhr_(z.bis)) + PUFFER_MIN) zugang[txt_(z.stand_id)] = h;
  });
  return zugang;
}
function rechteFuer_(b) {
  const r = { staende: [], maerkte: [], stand_aendern: [], markt_aendern: [] };
  tab_('Stände').zeilen.forEach(function (s) { const id = txt_(s.stand_id); if (!id) return; if (standRecht_(b, id)) r.staende.push(id); if (standAendern_(b, id)) r.stand_aendern.push(id); });
  tab_('Märkte').zeilen.forEach(function (m) { const id = txt_(m.markt_id); if (!id) return; if (marktRecht_(b, id)) r.maerkte.push(id); if (marktAendern_(b, id)) r.markt_aendern.push(id); });
  return r;
}
function verantwortungFuer_() {
  const out = {};
  tab_('Zuständigkeiten').zeilen.forEach(function (z) { if (ja_(z.verantwortlich)) (out[txt_(z.art) + ':' + txt_(z.ref_id)] = out[txt_(z.art) + ':' + txt_(z.ref_id)] || []).push(txt_(z.benutzer_id)); });
  return out;
}

function stammdaten_(p) {
  let b;
  try { b = auth_(p); }
  catch (err) {
    const z = benutzer_(p.benutzer_id);
    if (z && status_(z) === 'wartet' && (!txt_(z.geraet_id) || txt_(z.geraet_id) === txt_(p.geraet_id))) return { ok: true, benutzer: benutzerInfo_(z) };
    if (z && status_(z) === 'gesperrt') return { ok: true, benutzer: benutzerInfo_(z) };
    return { ok: false, fehler: 'NICHT_ANGEMELDET', abgemeldet: true };
  }
  const e = einstellungen_();
  const alleNamen = namen_();
  const bilder = ordnerListe_(e.bilder_ordner_id), infos = ordnerListe_(e.info_ordner_id);
  const kategorien = tab_('Kategorien').zeilen.filter(function (z) { return txt_(z.kategorie); }).map(function (z) {
    return { kategorie: txt_(z.kategorie), sortierung: Number(z.sortierung) || 0, farbe: txt_(z.farbe), preis_je_markt: ja_(z.preis_je_markt) };
  });
  const produkte = tab_('Produkte').zeilen.filter(function (z) { return txt_(z.produkt_id) && txt_(z.name) && nichtNein_(z.aktiv) && txt_(z.aktiv).toUpperCase() !== 'VORSCHLAG'; }).map(function (z) {
    const bild = txt_(z.bild);
    const info = txt_(z.info_dateien).split(/[;,\n]/).map(txt_).filter(String).map(function (n) {
      const f = infos[n];
      if (!f) return { name: n, typ: 'fehlt' };
      const istBild = /^image\//.test(f.mime);
      return { name: n, typ: istBild ? 'bild' : 'dok', t: f.t, url: istBild ? '' : 'https://drive.google.com/file/d/' + f.id + '/view' };
    });
    return { produkt_id: txt_(z.produkt_id), name: txt_(z.name), kategorie: txt_(z.kategorie), preis: cent_(z.preis), sortierung: Number(z.sortierung) || 0,
      bild: bild && bilder[bild] ? bild : '', bild_t: bild && bilder[bild] ? bilder[bild].t : 0, beschreibung: txt_(z.beschreibung), info: info,
      verantwortlich_id: txt_(z.verantwortlich_id), verantwortlich: txt_(z.verantwortlich_id) ? (alleNamen[txt_(z.verantwortlich_id)] || '') : name_(z.verantwortlich_platzhalter) };
  });
  const maerkte = tab_('Märkte').zeilen.filter(function (z) { return txt_(z.markt_id) && !ja_(z.archiviert); }).map(function (z) {
    return { markt_id: txt_(z.markt_id), name: txt_(z.name), ort: txt_(z.ort), datum_von: tag_(z.datum_von), datum_bis: tag_(z.datum_bis) };
  });
  const offeneMaerkte = {};
  maerkte.forEach(function (m) { offeneMaerkte[m.markt_id] = true; });
  const staende = tab_('Stände').zeilen.filter(function (z) { return txt_(z.stand_id) && !ja_(z.archiviert) && offeneMaerkte[txt_(z.markt_id)]; }).map(function (z) {
    const k = txt_(z.kategorien);
    return { stand_id: txt_(z.stand_id), markt_id: txt_(z.markt_id), name: txt_(z.name),
      kategorien: !k || k.toUpperCase() === 'ALLE' ? 'ALLE' : k.split(/[;,]/).map(txt_).filter(String), standzeiten: standzeiten_(z.standzeiten) };
  });
  const preise = tab_('Preise').zeilen.filter(function (z) { return txt_(z.markt_id) && txt_(z.produkt_id) && txt_(z.preis) !== ''; })
    .map(function (z) { return { markt_id: txt_(z.markt_id), produkt_id: txt_(z.produkt_id), preis: cent_(z.preis) }; });
  const verfuegbarkeit = tab_('Verfügbarkeit').zeilen.filter(function (z) { return txt_(z.stand_id) && txt_(z.produkt_id) && txt_(z.status) !== 'verfuegbar'; })
    .map(function (z) { return { stand_id: txt_(z.stand_id), produkt_id: txt_(z.produkt_id), status: txt_(z.status) }; });

  const daten = {
    einstellungen: {
      app_titel: txt_(e.app_titel) || 'Weihnachtsmarkt-Kasse', verein: txt_(e.verein),
      schnellbetraege: txt_(e.schnellbetraege || '1;2;5;10;20;50').split(/[;,]/).map(Number).filter(function (n) { return n > 0; }),
      storno_anzahl: Number(e.storno_anzahl) || 2, abgleich_sekunden: Math.max(20, Number(e.abgleich_sekunden) || 60), puffer_min: PUFFER_MIN
    },
    aufgaben: aufgaben_(), kategorien: kategorien, produkte: produkte, maerkte: maerkte, staende: staende, preise: preise, verfuegbarkeit: verfuegbarkeit
  };
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(daten), Utilities.Charset.UTF_8)
    .map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join('');
  const kopf = { ok: true, version: VERSION, heute: heute_(), hash: hash, benutzer: benutzerInfo_(b), zugang: zugangFuer_(b, p.geraet_id), rechte: rechteFuer_(b),
    hinweise: hinweisListe_(b), nachrichten: nachrichtenFuer_(b), schichten: schichtenFuer_(b, staende), checklisten: checklistenFuer_(b),
    verantwortung: verantwortungFuer_(), vorlagen: rang_(b) >= 2 ? vorlagenFuer_(b) : [] };
  if (kopf.rechte.staende.length) kopf.personen = tab_('Benutzer').zeilen.filter(function (z) { return status_(z) === 'aktiv' && !ja_(z.entfernt); })
    .map(function (z) { return { benutzer_id: txt_(z.benutzer_id), name: name_(z.name), rolle: rolle_(z) }; }).sort(function (a, c) { return a.name.localeCompare(c.name); });
  if (p.hash && p.hash === hash) return Object.assign(kopf, { unveraendert: true });
  return Object.assign(kopf, daten);
}

function schichtenFuer_(b, staende) {
  const sichtbar = {}, namen = namen_(), ab = Utilities.formatDate(new Date(Date.now() - 864e5), TZ, 'yyyy-MM-dd');
  staende.forEach(function (s) { sichtbar[s.stand_id] = true; });
  return tab_('Schichten').zeilen.filter(function (z) { return sichtbar[txt_(z.stand_id)] && tag_(z.datum) >= ab && (txt_(z.status) !== 'abgelehnt' || standRecht_(b, z.stand_id)); }).map(function (z) {
    return { schicht_id: txt_(z.schicht_id), stand_id: txt_(z.stand_id), datum: tag_(z.datum), von: uhr_(z.von), bis: uhr_(z.bis), aufgabe: txt_(z.aufgabe),
      benutzer_id: txt_(z.benutzer_id), name: txt_(z.benutzer_id) ? (namen[txt_(z.benutzer_id)] || '?') : name_(z.platzhalter), platzhalter: !txt_(z.benutzer_id), status: txt_(z.status) || 'geplant', ersetzt: txt_(z.ersetzt), anfrage: ja_(z.anfrage) };
  });
}

function dateien_(p) {
  auth_(p);
  const e = einstellungen_();
  const liste = ordnerListe_(p.ordner === 'info' ? e.info_ordner_id : e.bilder_ordner_id);
  const namen = (Array.isArray(p.namen) ? p.namen : txt_(p.namen).split('|')).map(txt_).filter(String).slice(0, 12);
  const out = {};
  namen.forEach(function (n) {
    const f = liste[n];
    if (!f || !/^image\//.test(f.mime)) { out[n] = { fehlt: true }; return; }
    const datei = DriveApp.getFileById(f.id);
    let blob = datei.getBlob();
    if (blob.getBytes().length > MAX_DATEI_BYTES) { const k = datei.getThumbnail(); if (k) blob = k; }
    out[n] = { mime: blob.getContentType() || f.mime, t: f.t, data: Utilities.base64Encode(blob.getBytes()) };
  });
  return { ok: true, dateien: out };
}

/* ===================================================================
   Abgleich (Warteschlange eines Geräts)
   =================================================================== */
function sync_(p) {
  return sperre_(function () {
    const erledigt = [], fehler = [];
    (p.eintraege || []).forEach(function (en) {
      try {
        const d = en.data || {}, bid = en.benutzer_id || p.benutzer_id;
        if (en.typ === 'Bon') bonSpeichern_(d);
        else if (en.typ === 'Storno') stornieren_(d, bid);
        else if (en.typ === 'Verfuegbarkeit') verfuegbarkeitSetzen_(d, bid);
        else if (en.typ === 'Rueckmeldung') rueckmeldungSpeichern_(d);
        else if (en.typ === 'Aktion') aktionAusfuehren_(d, bid, p.geraet_id);
        else if (en.typ === 'Benutzer') { /* alte App-Versionen: ignorieren */ }
        else throw new Error('Unbekannter Eintrag: ' + en.typ);
        erledigt.push(en.id);
      } catch (err) {
        fehler.push({ id: en.id, typ: en.typ, fehler: String((err && err.message) || err) });
      }
    });
    SpreadsheetApp.flush();
    return { ok: true, erledigt: erledigt, fehler: fehler };
  });
}

/* Aktionen, die die App ohne Warten in die Warteschlange stellt */
const WARTESCHLANGE = ['hinweis_aktion', 'schicht_speichern', 'schicht_loeschen', 'rueckmeldung_status', 'benutzer_aendern', 'preis_speichern', 'zustaendigkeit', 'nachricht_gelesen', 'checkpunkt_speichern', 'checkpunkt_loeschen', 'checkpunkt_haken', 'verantwortung'];
function aktionAusfuehren_(d, benutzerId, geraetId) {
  if (WARTESCHLANGE.indexOf(d.aktion) < 0) throw new Error('Aktion nicht erlaubt: ' + d.aktion);
  const r = AKTIONEN[d.aktion](Object.assign({}, d, { benutzer_id: benutzerId, geraet_id: geraetId }));
  if (!r || !r.ok) throw new Error((r && r.fehler) || 'Fehler');
}

function bonSpeichern_(d) {
  if (!d.bon_id || !Array.isArray(d.positionen)) throw new Error('Bon unvollständig.');
  const vk = tab_('Verkäufe');
  if (vk.zeilen.some(function (z) { return txt_(z.bon_id) === d.bon_id; })) return;
  const standId = txt_(d.stand_id || d.markt_id);
  const zeit = new Date(d.zeit);
  const hinweise = [];
  const b = benutzer_(d.benutzer_id);
  const s = stand_(standId);
  if (!b) hinweise.push('Person unbekannt');
  else if (status_(b) !== 'aktiv') hinweise.push('Person nicht freigegeben');
  const leitung = b && standRecht_(b, standId);
  if (d.art === 'nachtrag') {
    if (!leitung) hinweise.push('Nachtrag ohne Berechtigung');
  } else {
    if (!leitung && !schichtAktiv_(d.benutzer_id, standId, zeit)) {
      const tag = tag_(zeit);
      const frei = tab_('Zugangscodes').zeilen.some(function (z) {
        return txt_(z.geraet_id) === d.geraet_id && txt_(z.stand_id) === standId && tag_(z.datum) === tag && zugangGueltig_(z, zeit);
      });
      if (!frei) hinweise.push('ohne Freischaltung');
    }
    if (s && !innerhalbStandzeit_(s, zeit)) hinweise.push('außerhalb Standzeit');
  }
  anhaengen_(vk, [{
    bon_id: d.bon_id, zeit: zeit, stand_id: standId, benutzer_id: d.benutzer_id, geraet_id: d.geraet_id,
    anzahl_artikel: Number(d.anzahl_artikel) || 0, summe: euro_(d.summe),
    gegeben: d.gegeben === null || d.gegeben === undefined ? '' : euro_(d.gegeben),
    rueckgeld: d.rueckgeld === null || d.rueckgeld === undefined ? '' : euro_(d.rueckgeld),
    status: d.status === 'storniert' ? 'storniert' : 'ok', art: d.art === 'nachtrag' ? 'nachtrag' : 'kasse',
    empfangen_am: new Date(), hinweis: hinweise.join('; ')
  }]);
  anhaengen_(tab_('Positionen'), d.positionen.map(function (pos, i) {
    return { bon_id: d.bon_id, pos_nr: pos.pos_nr || i + 1, zeit: zeit, stand_id: standId, benutzer_id: d.benutzer_id,
      produkt_id: pos.produkt_id, produktname: pos.produktname, kategorie: pos.kategorie,
      einzelpreis: euro_(pos.einzelpreis), menge: Number(pos.menge) || 0, zeilensumme: euro_(pos.zeilensumme),
      status: d.status === 'storniert' ? 'storniert' : 'ok' };
  }));
}

function stornieren_(d, benutzerId) {
  const vk = tab_('Verkäufe');
  const bon = vk.zeilen.filter(function (z) { return txt_(z.bon_id) === d.bon_id; })[0];
  if (!bon) throw new Error('Bon nicht gefunden.');
  const b = benutzer_(benutzerId);
  if (txt_(bon.benutzer_id) !== txt_(benutzerId) && !(b && standRecht_(b, bon.stand_id))) throw new Error('Keine Berechtigung zum Stornieren.');
  if (txt_(bon.status) === 'storniert') return;
  setzen_(vk, bon, 'status', 'storniert');
  const pos = tab_('Positionen');
  pos.zeilen.forEach(function (z) { if (txt_(z.bon_id) === d.bon_id) setzen_(pos, z, 'status', 'storniert'); });
}

function verfuegbarkeitSetzen_(d, benutzerId) {
  const b = benutzer_(benutzerId);
  if (!b || status_(b) !== 'aktiv') throw new Error('Keine Berechtigung.');
  const standId = txt_(d.stand_id || d.markt_id);
  const leitung = standRecht_(b, standId);
  const status = ['verfuegbar', 'ausverkauft', 'nicht_da'].indexOf(d.status) >= 0 ? d.status : 'verfuegbar';
  if (!leitung && status !== 'ausverkauft') throw new Error('Nur „ausverkauft“ melden ist erlaubt.');
  const t = tab_('Verfügbarkeit');
  const z = t.zeilen.filter(function (x) { return txt_(x.stand_id) === standId && txt_(x.produkt_id) === d.produkt_id; })[0];
  const werte = { status: status, geaendert_von: benutzerId, geaendert_am: new Date(d.geaendert_am || Date.now()), geprueft: leitung ? 'JA' : '' };
  if (z) Object.keys(werte).forEach(function (k) { setzen_(t, z, k, werte[k]); });
  else anhaengen_(t, [Object.assign({ stand_id: standId, produkt_id: d.produkt_id }, werte)]);
}

function rueckmeldungSpeichern_(d) {
  const t = tab_('Rückmeldungen');
  if (t.zeilen.some(function (z) { return txt_(z.rm_id) === d.rm_id; })) return;
  anhaengen_(t, [{ rm_id: d.rm_id, zeit: new Date(d.zeit || Date.now()), benutzer_id: d.benutzer_id, stand_id: txt_(d.stand_id || d.markt_id),
    typ: d.typ, text: txt_(d.text).slice(0, 2000), geraet_info: txt_(d.geraet_info).slice(0, 200), status: 'neu' }]);
  const mail = txt_(einstellungen_().benachrichtigung_email);
  if (d.typ === 'Problem' && mail.indexOf('@') > 0) {
    try {
      const b = benutzer_(d.benutzer_id), s = stand_(d.stand_id || d.markt_id);
      MailApp.sendEmail(mail, 'Kassen-App: Problem', (b ? name_(b.name) : '') + ' · ' + (s ? txt_(s.name) : '') + ':\n\n' + txt_(d.text));
    } catch (err) { console.error('Mail', err); }
  }
}

/* ===================================================================
   Einmalcodes
   =================================================================== */
function codeErzeugen_(p) {
  const b = auth_(p, 2);
  standPruefen_(b, p.stand_id);
  return sperre_(function () {
    const t = tab_('Zugangscodes');
    const vorhanden = {};
    t.zeilen.forEach(function (z) { vorhanden[txt_(z.code)] = true; });
    let code;
    do { code = String(Math.floor(100000 + Math.random() * 900000)); } while (vorhanden[code]);
    anhaengen_(t, [{ code: alsText_(code), stand_id: p.stand_id, datum: alsText_(heute_()), erstellt_von: txt_(b.benutzer_id), erstellt_am: new Date() }]);
    return { ok: true, code: code };
  });
}
function codeEinloesen_(p) {
  const b = auth_(p);
  const code = txt_(p.code).replace(/\D/g, '');
  return sperre_(function () {
    const t = tab_('Zugangscodes');
    const z = t.zeilen.filter(function (x) { return txt_(x.code) === code; })[0];
    if (!z) return { ok: false, fehler: 'Code unbekannt.' };
    if (txt_(z.stand_id) !== txt_(p.stand_id)) return { ok: false, fehler: 'Code gilt für einen anderen Stand.' };
    if (tag_(z.datum) !== heute_()) return { ok: false, fehler: 'Code abgelaufen.' };
    if (txt_(z.entzogen_am)) return { ok: false, fehler: 'Freischaltung entzogen.' };
    if (txt_(z.eingeloest_am)) {
      if (txt_(z.geraet_id) === txt_(p.geraet_id)) return { ok: true, datum: heute_() };
      return { ok: false, fehler: 'Code schon benutzt.' };
    }
    setzen_(t, z, 'eingeloest_von', txt_(b.benutzer_id)); setzen_(t, z, 'geraet_id', txt_(p.geraet_id)); setzen_(t, z, 'eingeloest_am', new Date());
    return { ok: true, datum: heute_() };
  });
}
function zugangEntziehen_(p) {
  const b = auth_(p, 2);
  return sperre_(function () {
    const t = tab_('Zugangscodes');
    const z = t.zeilen.filter(function (x) { return txt_(x.code) === txt_(p.code).replace(/\D/g, ''); })[0];
    if (!z) throw new Error('Code nicht gefunden.');
    standPruefen_(b, z.stand_id);
    if (!txt_(z.entzogen_am)) { setzen_(t, z, 'entzogen_am', new Date()); setzen_(t, z, 'entzogen_von', txt_(b.benutzer_id)); }
    return { ok: true };
  });
}
function namen_() {
  const n = {};
  tab_('Benutzer').zeilen.forEach(function (z) { n[txt_(z.benutzer_id)] = name_(z.name); });
  return n;
}
function personal_(p) {
  const b = auth_(p, 2);
  standPruefen_(b, p.stand_id);
  const namen = namen_(), h = heute_();
  const codes = tab_('Zugangscodes').zeilen.filter(function (z) { return txt_(z.stand_id) === txt_(p.stand_id) && tag_(z.datum) === h; }).map(function (z) {
    return { code: txt_(z.code), offen: !txt_(z.eingeloest_am), entzogen: !!txt_(z.entzogen_am), benutzer_id: txt_(z.eingeloest_von), eingeloest_name: namen[txt_(z.eingeloest_von)] || '', eingeloest_am: iso_(z.eingeloest_am) };
  });
  return { ok: true, codes: codes };
}

/* ===================================================================
   Personalplan
   =================================================================== */
function plan_(p) {
  const b = auth_(p);
  const s = stand_(p.stand_id);
  if (!s) throw new Error('Stand nicht gefunden.');
  const leitung = standRecht_(b, p.stand_id);
  const namen = namen_();
  const schichten = tab_('Schichten').zeilen.filter(function (z) { return txt_(z.stand_id) === txt_(p.stand_id); }).map(function (z) {
    return { schicht_id: txt_(z.schicht_id), datum: tag_(z.datum), von: uhr_(z.von), bis: uhr_(z.bis), aufgabe: txt_(z.aufgabe),
      benutzer_id: txt_(z.benutzer_id), name: txt_(z.benutzer_id) ? (namen[txt_(z.benutzer_id)] || '?') : name_(z.platzhalter),
      platzhalter: !txt_(z.benutzer_id), status: txt_(z.status) || 'geplant' };
  }).filter(function (x) { return leitung || x.status !== 'abgelehnt'; });
  const out = { ok: true, schichten: schichten, standzeiten: standzeiten_(s.standzeiten), aufgaben: aufgaben_(), leitung: leitung };
  if (leitung) {
    out.personen = tab_('Benutzer').zeilen.filter(function (z) { return status_(z) === 'aktiv'; })
      .map(function (z) { return { benutzer_id: txt_(z.benutzer_id), name: name_(z.name), rolle: rolle_(z) }; })
      .sort(function (a, c) { return a.name.localeCompare(c.name); });
  }
  return out;
}
function ueberschneidung_(benutzerId, datum, von, bis, ausser) {
  if (!benutzerId) return null;
  return tab_('Schichten').zeilen.filter(function (z) {
    const aus = [].concat(ausser || []).map(txt_);
    return txt_(z.benutzer_id) === txt_(benutzerId) && aus.indexOf(txt_(z.schicht_id)) < 0 && tag_(z.datum) === datum &&
      ['abgelehnt'].indexOf(txt_(z.status)) < 0 && minuten_(uhr_(z.von)) < minuten_(bis) && minuten_(uhr_(z.bis)) > minuten_(von);
  })[0] || null;
}
function ueberschneidungPruefen_(benutzerId, datum, von, bis, ausser) {
  const z = ueberschneidung_(benutzerId, datum, von, bis, ausser);
  if (!z) return;
  const s = stand_(z.stand_id);
  throw new Error((namen_()[txt_(benutzerId)] || 'Person') + ' ist ' + uhr_(z.von) + '–' + uhr_(z.bis) + ' schon eingeteilt' + (s ? ' (' + txt_(s.name) + ')' : '') + '.');
}
function schichtSpeichern_(p) {
  const b = auth_(p);
  const d = p.schicht || {};
  const leitung = standRecht_(b, d.stand_id);
  if (!stand_(d.stand_id)) throw new Error('Stand nicht gefunden.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txt_(d.datum))) throw new Error('Datum fehlt.');
  if (!uhr_(d.von) || !uhr_(d.bis) || minuten_(d.bis) <= minuten_(d.von)) throw new Error('Zeiten prüfen.');
  if (aufgaben_().indexOf(txt_(d.aufgabe)) < 0) throw new Error('Aufgabe unbekannt.');
  return sperre_(function () {
    const t = tab_('Schichten');
    let benutzerId = txt_(d.benutzer_id), platzhalter = name_(d.platzhalter), status = 'geplant';
    if (!leitung) { benutzerId = txt_(b.benutzer_id); platzhalter = ''; status = 'vorgeschlagen'; }
    if (!benutzerId && !platzhalter) throw new Error('Person fehlt.');
    if (benutzerId && txt_(d.aufgabe) === 'Standleitung') {
      const ziel = benutzer_(benutzerId);
      if (rang_(ziel) < 2) throw new Error('Standleitung nur für Personen mit dieser Rolle.');
    }
    if (!benutzerId && txt_(d.aufgabe) === 'Standleitung') throw new Error('Standleitung nur für angemeldete Personen.');
    // Wechsel: eine eigene, schon geplante Schicht soll durch diese ersetzt werden (die Leitung bestätigt)
    let ersetzt = '';
    if (txt_(d.ersetzt)) {
      const alt = t.zeilen.filter(function (x) { return txt_(x.schicht_id) === txt_(d.ersetzt); })[0];
      if (alt && txt_(alt.benutzer_id) === benutzerId) ersetzt = txt_(alt.schicht_id);
    }
    const werte = { stand_id: d.stand_id, datum: alsText_(txt_(d.datum)), von: alsText_(uhr_(d.von)), bis: alsText_(uhr_(d.bis)), aufgabe: txt_(d.aufgabe), benutzer_id: benutzerId, platzhalter: platzhalter, status: status, ersetzt: ersetzt, anfrage: d.anfrage && !leitung ? 'JA' : '' };
    let z = txt_(d.schicht_id) ? t.zeilen.filter(function (x) { return txt_(x.schicht_id) === txt_(d.schicht_id); })[0] : null;
    if (z && !leitung && txt_(z.benutzer_id) !== txt_(b.benutzer_id)) throw new Error('Keine Berechtigung.');
    ueberschneidungPruefen_(benutzerId, txt_(d.datum), uhr_(d.von), uhr_(d.bis), [d.schicht_id, ersetzt]);
    if (z) Object.keys(werte).forEach(function (k) { setzen_(t, z, k, werte[k]); });
    else z = anhaengen_(t, [Object.assign({ schicht_id: txt_(d.schicht_id) || Utilities.getUuid().slice(0, 8), erstellt_von: txt_(b.benutzer_id) }, werte)])[0];
    if (platzhalter && !benutzerId) {
      const treffer = tab_('Benutzer').zeilen.filter(function (x) { return name_(x.name).toLowerCase() === platzhalter.toLowerCase() && status_(x) === 'aktiv'; })[0];
      if (treffer && !ueberschneidung_(treffer.benutzer_id, txt_(d.datum), uhr_(d.von), uhr_(d.bis), z.schicht_id)) { setzen_(t, z, 'benutzer_id', txt_(treffer.benutzer_id)); setzen_(t, z, 'status', 'verknuepfung'); }
    }
    return { ok: true, schicht_id: txt_(z.schicht_id) };
  });
}
function schichtLoeschen_(p) {
  const b = auth_(p);
  return sperre_(function () {
    const t = tab_('Schichten');
    const z = t.zeilen.filter(function (x) { return txt_(x.schicht_id) === txt_(p.schicht_id); })[0];
    if (!z) return { ok: true };
    const eigenerVorschlag = txt_(z.benutzer_id) === txt_(b.benutzer_id) && txt_(z.status) === 'vorgeschlagen';
    if (!eigenerVorschlag) standPruefen_(b, z.stand_id);
    loeschen_(t, z);
    return { ok: true };
  });
}

/* ===================================================================
   Hinweise: was die Leitung erledigen muss
   =================================================================== */
function hinweisListe_(b) {
  const out = [];
  const namen = namen_(), ich = txt_(b.benutzer_id), admin = rang_(b) >= 4;
  const standName = {}, standMarkt = {};
  tab_('Stände').zeilen.forEach(function (s) { standName[txt_(s.stand_id)] = txt_(s.name); standMarkt[txt_(s.stand_id)] = txt_(s.markt_id); });
  const eigene = eigeneStaende_(b);
  const add = function (h, eigen) { if (eigen) out.push(h); else if (admin) out.push(Object.assign(h, { fremd: true })); };
  tab_('Benutzer').zeilen.forEach(function (z) {
    if (status_(z) !== 'wartet' || ja_(z.entfernt)) return;
    add({ typ: 'registrierung', id: txt_(z.benutzer_id), titel: name_(z.name), text: 'Registrierung' + (txt_(z.eingeladen_von) ? ' · eingeladen von ' + (namen[txt_(z.eingeladen_von)] || '') : ''), zeit: iso_(z.registriert_am) }, txt_(z.eingeladen_von) === ich);
  });
  tab_('Verkäufe').zeilen.forEach(function (z) {
    if (!txt_(z.hinweis) || txt_(z.bestaetigt_am) || txt_(z.status) !== 'ok') return;
    add({ typ: 'bon', id: txt_(z.bon_id), titel: euro_(cent_(z.summe)).toFixed(2).replace('.', ',') + ' € · ' + (namen[txt_(z.benutzer_id)] || ''), text: txt_(z.hinweis), stand: standName[txt_(z.stand_id)], zeit: iso_(z.zeit) }, eigene[txt_(z.stand_id)]);
  });
  const produkte = {};
  tab_('Produkte').zeilen.forEach(function (z) { produkte[txt_(z.produkt_id)] = txt_(z.name); });
  tab_('Verfügbarkeit').zeilen.forEach(function (z) {
    if (txt_(z.status) !== 'ausverkauft' || ja_(z.geprueft)) return;
    add({ typ: 'ausverkauft', id: txt_(z.stand_id) + '|' + txt_(z.produkt_id), titel: produkte[txt_(z.produkt_id)] || txt_(z.produkt_id), text: 'ausverkauft · ' + (namen[txt_(z.geaendert_von)] || ''), stand: standName[txt_(z.stand_id)], zeit: iso_(z.geaendert_am) }, eigene[txt_(z.stand_id)]);
  });
  tab_('Schichten').zeilen.forEach(function (z) {
    const st = txt_(z.status);
    if (st !== 'vorgeschlagen' && st !== 'verknuepfung') return;
    const art = st === 'verknuepfung' ? 'Platzhalter „' + name_(z.platzhalter) + '“ · ' : ja_(z.anfrage) ? 'Zugangsanfrage ' : txt_(z.ersetzt) ? 'Wechsel ' : 'Vorschlag ';
    add({ typ: st === 'vorgeschlagen' ? 'schicht' : 'verknuepfung', id: txt_(z.schicht_id), titel: (namen[txt_(z.benutzer_id)] || '') + ' · ' + txt_(z.aufgabe),
      text: art + kurzTag_(z.datum) + ' ' + uhr_(z.von) + '–' + uhr_(z.bis) + wechselText_(z), stand: standName[txt_(z.stand_id)] }, eigene[txt_(z.stand_id)]);
  });
  tab_('Produkte').zeilen.forEach(function (z) {
    if (txt_(z.aktiv).toUpperCase() === 'VORSCHLAG' && rang_(b) >= 3)
      out.push({ typ: 'produkt', id: txt_(z.produkt_id), titel: txt_(z.name) + ' · ' + euro_(cent_(z.preis)).toFixed(2).replace('.', ',') + ' €', text: 'Produktvorschlag · ' + txt_(z.kategorie) + ' · ' + (namen[txt_(z.vorgeschlagen_von)] || '') });
    if (!txt_(z.offen_am)) return;
    const was = [txt_(z.offen_bild) && 'Bild', txt_(z.offen_beschreibung) && 'Beschreibung', txt_(z.offen_info) && 'Infos'].filter(String).join(', ');
    const zust = txt_(z.verantwortlich_id);
    add({ typ: 'produktaenderung', id: txt_(z.produkt_id), titel: txt_(z.name), text: 'Änderung ' + was + ' · ' + (namen[txt_(z.offen_von)] || '') + (txt_(z.offen_beschreibung) ? ' · „' + txt_(z.offen_beschreibung).slice(0, 80) + '“' : ''), zeit: iso_(z.offen_am) },
      zust ? zust === ich : admin);
  });
  tab_('Rückmeldungen').zeilen.forEach(function (z) {
    if (txt_(z.status) !== 'neu') return;
    add({ typ: 'rueckmeldung', id: txt_(z.rm_id), titel: txt_(z.typ) + ' · ' + (namen[txt_(z.benutzer_id)] || ''), text: txt_(z.text), stand: standName[txt_(z.stand_id)], zeit: iso_(z.zeit) }, admin || eigene[txt_(z.stand_id)]);
  });
  tab_('Vorschläge').zeilen.forEach(function (z) {
    if (txt_(z.status) !== 'offen') return;
    const an = txt_(z.an).split(':'), d = JSON.parse(txt_(z.daten) || '{}');
    let eigen = false;
    if (an[0] === 'benutzer') eigen = an[1] === ich;
    else if (an[0] === 'stand') eigen = verantwortlich_(b, 'stand', an[1]) || (rang_(b) >= 3 && eigene[an[1]]);
    else if (an[0] === 'markt') eigen = verantwortlich_(b, 'markt', an[1]);
    add({ typ: txt_(z.art) === 'verantwortung' ? 'verantwortung' : 'aenderung', id: txt_(z.vorschlag_id), titel: d.titel || '', text: (d.text || '') + ' · ' + (namen[txt_(z.von)] || ''), zeit: iso_(z.am) }, eigen);
  });
  return out;
}

function kurzTag_(d) { return tag_(d).split('-').reverse().slice(0, 2).join('.') + '.'; }
function wechselText_(z) {
  if (!txt_(z.ersetzt)) return '';
  const alt = tab_('Schichten').zeilen.filter(function (x) { return txt_(x.schicht_id) === txt_(z.ersetzt); })[0];
  if (!alt) return '';
  const s = stand_(alt.stand_id);
  return ' · statt ' + kurzTag_(alt.datum) + ' ' + uhr_(alt.von) + '–' + uhr_(alt.bis) + ' ' + txt_(alt.aufgabe) + (s ? ' (' + txt_(s.name) + ')' : '');
}
function hinweise_(p) { const b = auth_(p); return { ok: true, hinweise: hinweisListe_(b) }; }

function hinweisAktion_(p) {
  const b = auth_(p);
  const ja = p.aktion2 === 'ja';
  return sperre_(function () {
    if (p.typ === 'registrierung') {
      const t = tab_('Benutzer');
      const z = t.zeilen.filter(function (x) { return txt_(x.benutzer_id) === txt_(p.id); })[0];
      if (!z || status_(z) !== 'wartet') throw new Error('Nicht gefunden.');
      if (!(rang_(b) >= 3 || txt_(z.eingeladen_von) === txt_(b.benutzer_id))) throw new Error('Keine Berechtigung.');
      setzen_(t, z, 'aktiv', ja ? 'JA' : 'NEIN');
    } else if (p.typ === 'bon') {
      const t = tab_('Verkäufe');
      const z = t.zeilen.filter(function (x) { return txt_(x.bon_id) === txt_(p.id); })[0];
      if (!z) throw new Error('Nicht gefunden.');
      standPruefen_(b, z.stand_id);
      if (ja) { setzen_(t, z, 'bestaetigt_von', txt_(b.benutzer_id)); setzen_(t, z, 'bestaetigt_am', new Date()); }
      else { stornieren_({ bon_id: txt_(p.id) }, txt_(b.benutzer_id)); }
    } else if (p.typ === 'ausverkauft') {
      const parts = txt_(p.id).split('|');
      standPruefen_(b, parts[0]);
      const t = tab_('Verfügbarkeit');
      const z = t.zeilen.filter(function (x) { return txt_(x.stand_id) === parts[0] && txt_(x.produkt_id) === parts[1]; })[0];
      if (!z) throw new Error('Nicht gefunden.');
      setzen_(t, z, 'geprueft', 'JA');
      if (!ja) { setzen_(t, z, 'status', 'verfuegbar'); setzen_(t, z, 'geaendert_von', txt_(b.benutzer_id)); setzen_(t, z, 'geaendert_am', new Date()); }
    } else if (p.typ === 'schicht' || p.typ === 'verknuepfung') {
      const t = tab_('Schichten');
      const z = t.zeilen.filter(function (x) { return txt_(x.schicht_id) === txt_(p.id); })[0];
      if (!z) throw new Error('Nicht gefunden.');
      standPruefen_(b, z.stand_id);
      const s = stand_(z.stand_id), info = kurzTag_(z.datum) + ' ' + uhr_(z.von) + '–' + uhr_(z.bis) + ' · ' + txt_(z.aufgabe) + (s ? ' · ' + txt_(s.name) : '');
      if (ja) {
        ueberschneidungPruefen_(z.benutzer_id, tag_(z.datum), uhr_(z.von), uhr_(z.bis), [z.schicht_id, z.ersetzt]);
        const altId = txt_(z.ersetzt);
        setzen_(t, z, 'status', 'geplant'); setzen_(t, z, 'ersetzt', '');
        const alt = altId ? t.zeilen.filter(function (x) { return txt_(x.schicht_id) === altId; })[0] : null;
        if (alt) loeschen_(t, alt);
        if (txt_(z.benutzer_id) !== txt_(b.benutzer_id)) nachricht_(txt_(z.benutzer_id), (altId ? 'Wechsel bestätigt' : ja_(z.anfrage) ? 'Zugang bestätigt' : 'Schicht bestätigt'), info, b);
      } else if (p.typ === 'schicht') {
        setzen_(t, z, 'status', 'abgelehnt');
        if (txt_(z.benutzer_id) !== txt_(b.benutzer_id)) nachricht_(txt_(z.benutzer_id), (txt_(z.ersetzt) ? 'Wechsel abgelehnt' : 'Schicht abgelehnt'), info, b);
      } else { setzen_(t, z, 'benutzer_id', ''); setzen_(t, z, 'status', 'geplant'); }
    } else if (p.typ === 'produkt') {
      if (rang_(b) < 3) throw new Error('Keine Berechtigung.');
      const t = tab_('Produkte');
      const z = t.zeilen.filter(function (x) { return txt_(x.produkt_id) === txt_(p.id); })[0];
      if (!z) throw new Error('Nicht gefunden.');
      setzen_(t, z, 'aktiv', ja ? 'JA' : 'NEIN');
    } else if (p.typ === 'produktaenderung') {
      const t = tab_('Produkte');
      const z = t.zeilen.filter(function (x) { return txt_(x.produkt_id) === txt_(p.id); })[0];
      if (!z || !txt_(z.offen_am)) throw new Error('Nicht gefunden.');
      if (!(rang_(b) >= 4 || txt_(z.verantwortlich_id) === txt_(b.benutzer_id))) throw new Error('Keine Berechtigung.');
      if (ja) {
        if (txt_(z.offen_bild)) setzen_(t, z, 'bild', txt_(z.offen_bild));
        if (txt_(z.offen_beschreibung)) setzen_(t, z, 'beschreibung', txt_(z.offen_beschreibung) === '-' ? '' : txt_(z.offen_beschreibung));
        if (txt_(z.offen_info)) setzen_(t, z, 'info_dateien', txt_(z.offen_info) === '-' ? '' : txt_(z.offen_info));
      }
      nachricht_(txt_(z.offen_von), 'Änderung ' + (ja ? 'übernommen' : 'abgelehnt'), txt_(z.name), b);
      ['offen_bild', 'offen_beschreibung', 'offen_info', 'offen_von', 'offen_am'].forEach(function (k) { setzen_(t, z, k, ''); });
    } else if (p.typ === 'rueckmeldung') {
      const t = tab_('Rückmeldungen');
      const z = t.zeilen.filter(function (x) { return txt_(x.rm_id) === txt_(p.id); })[0];
      if (!z) throw new Error('Nicht gefunden.');
      if (!(rang_(b) >= 4 || standRecht_(b, z.stand_id))) throw new Error('Keine Berechtigung.');
      const st = ja ? 'erledigt' : 'in Arbeit';
      if (txt_(z.benutzer_id) !== txt_(b.benutzer_id)) nachricht_(txt_(z.benutzer_id), 'Rückmeldung: ' + st, txt_(z.text).slice(0, 120), b);
      setzen_(t, z, 'status', st);
    } else if (p.typ === 'aenderung' || p.typ === 'verantwortung') {
      vorschlagEntscheiden_(b, p.id, ja);
    } else throw new Error('Unbekannter Hinweis.');
    return { ok: true };
  });
}

/* ===================================================================
   Nachrichten an Personen
   =================================================================== */
function nachricht_(an, titel, text, von) {
  if (!txt_(an)) return;
  anhaengen_(tab_('Nachrichten'), [{ nachricht_id: Utilities.getUuid().slice(0, 12), an: txt_(an), titel: txt_(titel), text: txt_(text), von: von ? txt_(von.benutzer_id) : '', am: new Date() }]);
}
function nachrichtenFuer_(b) {
  const ich = txt_(b.benutzer_id), namen = namen_(), grenze = Date.now() - 14 * 864e5;
  return tab_('Nachrichten').zeilen.filter(function (z) { return txt_(z.an) === ich && (!txt_(z.gelesen_am) || new Date(z.am).getTime() > grenze); })
    .map(function (z) { return { id: txt_(z.nachricht_id), titel: txt_(z.titel), text: txt_(z.text), von: namen[txt_(z.von)] || '', am: iso_(z.am), gelesen: !!txt_(z.gelesen_am) }; })
    .sort(function (a, c) { return c.am < a.am ? -1 : 1; }).slice(0, 30);
}
function nachrichtGelesen_(p) {
  const b = auth_(p);
  const t = tab_('Nachrichten');
  t.zeilen.forEach(function (z) { if (txt_(z.an) === txt_(b.benutzer_id) && !txt_(z.gelesen_am) && (p.id === 'alle' || txt_(z.nachricht_id) === txt_(p.id))) setzen_(t, z, 'gelesen_am', new Date()); });
  return { ok: true };
}
function nachrichtSenden_(p) {
  const b = auth_(p, 4);
  const titel = txt_(p.titel), text = txt_(p.text).slice(0, 2000);
  if (!titel) throw new Error('Betreff fehlt.');
  const ziel = p.ziel || { art: 'alle' };
  const personen = tab_('Benutzer').zeilen.filter(function (z) { return status_(z) === 'aktiv' && !ja_(z.entfernt); });
  let ids;
  if (ziel.art === 'rolle') ids = personen.filter(function (z) { return rolle_(z) === ziel.wert; }).map(function (z) { return txt_(z.benutzer_id); });
  else if (ziel.art === 'stand' || ziel.art === 'markt') {
    const staende = ziel.art === 'stand' ? [txt_(ziel.wert)] : tab_('Stände').zeilen.filter(function (s) { return txt_(s.markt_id) === txt_(ziel.wert); }).map(function (s) { return txt_(s.stand_id); });
    const set = {};
    tab_('Zuständigkeiten').zeilen.forEach(function (z) { if ((txt_(z.art) === 'stand' && staende.indexOf(txt_(z.ref_id)) >= 0) || (txt_(z.art) === 'markt' && txt_(z.ref_id) === txt_(ziel.wert))) set[txt_(z.benutzer_id)] = true; });
    tab_('Schichten').zeilen.forEach(function (z) { if (txt_(z.benutzer_id) && staende.indexOf(txt_(z.stand_id)) >= 0) set[txt_(z.benutzer_id)] = true; });
    tab_('Checklisten').zeilen.forEach(function (z) { if (txt_(z.zustaendig_id) && ((txt_(z.art) === 'stand' && staende.indexOf(txt_(z.ref_id)) >= 0) || (txt_(z.art) === 'markt' && txt_(z.ref_id) === txt_(ziel.wert)))) set[txt_(z.zustaendig_id)] = true; });
    ids = personen.map(function (z) { return txt_(z.benutzer_id); }).filter(function (id) { return set[id]; });
  } else ids = personen.map(function (z) { return txt_(z.benutzer_id); });
  return sperre_(function () {
    ids.forEach(function (id) { nachricht_(id, titel, text, b); });
    return { ok: true, anzahl: ids.length };
  });
}

/* ===================================================================
   Vorschläge (Änderungen, Verantwortung)
   =================================================================== */
function vorschlag_(b, art, ref, an, daten) {
  anhaengen_(tab_('Vorschläge'), [{ vorschlag_id: Utilities.getUuid().slice(0, 12), art: art, ref_id: ref, daten: JSON.stringify(daten), von: txt_(b.benutzer_id), an: an, am: new Date(), status: 'offen' }]);
  return { ok: true, vorschlag: true };
}
function vorschlagEntscheiden_(b, id, ja) {
  const t = tab_('Vorschläge');
  const z = t.zeilen.filter(function (x) { return txt_(x.vorschlag_id) === txt_(id) && txt_(x.status) === 'offen'; })[0];
  if (!z) throw new Error('Nicht gefunden.');
  const an = txt_(z.an).split(':'), d = JSON.parse(txt_(z.daten) || '{}'), von = benutzer_(z.von);
  const darf = an[0] === 'benutzer' ? an[1] === txt_(b.benutzer_id) || rang_(b) >= 4
    : an[0] === 'stand' ? standAendern_(b, an[1]) : marktAendern_(b, an[1]);
  if (!darf) throw new Error('Keine Berechtigung.');
  if (ja) {
    if (txt_(z.art) === 'stand') standUebernehmen_(d.stand);
    else if (txt_(z.art) === 'markt') marktUebernehmen_(d.markt);
    else if (txt_(z.art) === 'preis') preisUebernehmen_(von || b, d.markt_id, d.produkt_id, d.preis);
    else if (txt_(z.art) === 'verantwortung') verantwortungUebernehmen_(b, d);
  }
  setzen_(t, z, 'status', ja ? 'angenommen' : 'abgelehnt');
  if (txt_(z.von) !== txt_(b.benutzer_id)) nachricht_(txt_(z.von), (d.titel || 'Vorschlag') + (ja ? ' angenommen' : ' abgelehnt'), d.text || '', b);
}

/* ===================================================================
   Übersicht
   =================================================================== */
function uebersicht_(p) {
  const b = auth_(p, 2);
  const h = heute_();
  const proStand = {};
  tab_('Verkäufe').zeilen.forEach(function (z) {
    if (txt_(z.status) !== 'ok' || tag_(z.zeit) !== h || !standRecht_(b, z.stand_id)) return;
    const s = txt_(z.stand_id);
    proStand[s] = proStand[s] || { bons: 0, summe: 0 };
    proStand[s].bons += 1; proStand[s].summe += cent_(z.summe);
  });
  const top = {};
  tab_('Positionen').zeilen.forEach(function (z) {
    if (txt_(z.status) !== 'ok' || tag_(z.zeit) !== h || txt_(z.stand_id) !== txt_(p.stand_id)) return;
    top[txt_(z.produktname)] = (top[txt_(z.produktname)] || 0) + (Number(z.menge) || 0);
  });
  return { ok: true, staende: proStand, top: Object.keys(top).map(function (n) { return { name: n, menge: top[n] }; }).sort(function (a, c) { return c.menge - a.menge; }).slice(0, 8) };
}

/* ===================================================================
   Personen verwalten
   =================================================================== */
function benutzerListe_(p) {
  auth_(p, 3);
  const zust = {}, plan = {}, prod = {}, aktiv = {};
  tab_('Zuständigkeiten').zeilen.forEach(function (z) { const id = txt_(z.benutzer_id); (zust[id] = zust[id] || []).push({ art: txt_(z.art), ref_id: txt_(z.ref_id), verantwortlich: ja_(z.verantwortlich) }); });
  tab_('Schichten').zeilen.forEach(function (z) { const id = txt_(z.benutzer_id); if (!id) return; aktiv[id] = true; (plan[id] = plan[id] || {})[txt_(z.stand_id)] = true; });
  tab_('Produkte').zeilen.forEach(function (z) { const id = txt_(z.verantwortlich_id); if (id) (prod[id] = prod[id] || []).push(txt_(z.name)); });
  tab_('Verkäufe').zeilen.forEach(function (z) { aktiv[txt_(z.benutzer_id)] = true; });
  return { ok: true, benutzer: tab_('Benutzer').zeilen.filter(function (z) { return txt_(z.benutzer_id) && !ja_(z.entfernt); }).map(function (z) {
    const id = txt_(z.benutzer_id);
    return Object.assign(benutzerInfo_(z), { pin: !!txt_(z.pin_hash), zust: zust[id] || [], plan: Object.keys(plan[id] || {}), produkte: prod[id] || [], loeschbar: !aktiv[id] });
  }) };
}
function benutzerLoeschen_(p) {
  const b = auth_(p, 3);
  return sperre_(function () {
    const t = tab_('Benutzer');
    const z = t.zeilen.filter(function (x) { return txt_(x.benutzer_id) === txt_(p.ziel_id); })[0];
    if (!z) throw new Error('Person nicht gefunden.');
    if (txt_(z.benutzer_id) === txt_(b.benutzer_id)) throw new Error('Nicht bei dir selbst.');
    if (rang_(b) < 4 && rang_(z) >= 3) throw new Error('Keine Berechtigung.');
    if (rolle_(z) === 'Admin' && t.zeilen.filter(function (x) { return rolle_(x) === 'Admin' && status_(x) === 'aktiv' && !ja_(x.entfernt); }).length <= 1) throw new Error('Es muss mindestens einen Admin geben.');
    const id = txt_(z.benutzer_id);
    const benutzt = tab_('Verkäufe').zeilen.some(function (x) { return txt_(x.benutzer_id) === id; }) || tab_('Schichten').zeilen.some(function (x) { return txt_(x.benutzer_id) === id; });
    const zt = tab_('Zuständigkeiten');
    zt.zeilen.filter(function (x) { return txt_(x.benutzer_id) === id; }).forEach(function (x) {
      if (ja_(x.verantwortlich) && verantwortliche_(txt_(x.art), txt_(x.ref_id)).length <= 1) throw new Error('Ist einzige verantwortliche Person – erst Verantwortung weitergeben.');
    });
    zt.zeilen.filter(function (x) { return txt_(x.benutzer_id) === id; }).forEach(function (x) { loeschen_(zt, x); });
    if (benutzt) { setzen_(t, z, 'aktiv', 'NEIN'); setzen_(t, z, 'entfernt', 'JA'); return { ok: true, entfernt: true }; }
    loeschen_(t, z);
    return { ok: true, geloescht: true };
  });
}

function benutzerAendern_(p) {
  const admin = auth_(p, 3);
  return sperre_(function () {
    const t = tab_('Benutzer');
    const z = t.zeilen.filter(function (x) { return txt_(x.benutzer_id) === txt_(p.ziel_id); })[0];
    if (!z) throw new Error('Person nicht gefunden.');
    const istAdmin = rang_(admin) >= 4;
    if (!istAdmin && rang_(z) >= 3) throw new Error('Keine Berechtigung.');
    const adminsAktiv = t.zeilen.filter(function (x) { return rolle_(x) === 'Admin' && status_(x) === 'aktiv'; }).length;
    const letzterAdmin = rolle_(z) === 'Admin' && status_(z) === 'aktiv' && adminsAktiv <= 1;
    if (p.rolle) {
      if (!RANG[p.rolle]) throw new Error('Unbekannte Rolle.');
      if (!istAdmin && RANG[p.rolle] >= 3) throw new Error('Keine Berechtigung.');
      if (letzterAdmin && p.rolle !== 'Admin') throw new Error('Es muss mindestens einen Admin geben.');
      if (rolle_(z) !== p.rolle) nachricht_(txt_(z.benutzer_id), 'Neue Rolle: ' + p.rolle, 'Deine Rolle wurde von ' + name_(admin.name) + ' geändert.', admin);
      setzen_(t, z, 'rolle', p.rolle);
    }
    if (p.status) {
      if (txt_(z.benutzer_id) === txt_(admin.benutzer_id) && p.status !== 'aktiv') throw new Error('Nicht bei dir selbst.');
      if (letzterAdmin && p.status !== 'aktiv') throw new Error('Es muss mindestens einen Admin geben.');
      if (status_(z) === 'gesperrt' && p.status === 'aktiv') nachricht_(txt_(z.benutzer_id), 'Zugang freigegeben', '', admin);
      setzen_(t, z, 'aktiv', p.status === 'aktiv' ? 'JA' : 'NEIN');
      if (p.status === 'aktiv' && ja_(z.entfernt)) setzen_(t, z, 'entfernt', '');
    }
    if (p.neue_pin) {
      if (!istAdmin) throw new Error('Keine Berechtigung.');
      if (!/^\d{4,6}$/.test(txt_(p.neue_pin))) throw new Error('PIN: 4–6 Ziffern.');
      setzen_(t, z, 'pin_hash', pinHash_(txt_(z.benutzer_id), txt_(p.neue_pin))); setzen_(t, z, 'pin_fehler', 0); setzen_(t, z, 'pin_gesperrt_bis', '');
    }
    return { ok: true, benutzer: benutzerInfo_(z) };
  });
}

/* ===================================================================
   Produkte, Kategorien, Preise
   =================================================================== */
function produkteAdmin_(p) {
  auth_(p, 2);
  const namen = namen_();
  return { ok: true, produkte: tab_('Produkte').zeilen.filter(function (z) { return txt_(z.produkt_id); }).map(function (z) {
    const a = txt_(z.aktiv).toUpperCase();
    return { produkt_id: txt_(z.produkt_id), name: txt_(z.name), kategorie: txt_(z.kategorie), preis: cent_(z.preis), bild: txt_(z.bild),
      sortierung: Number(z.sortierung) || 0, aktiv: a !== 'NEIN' && a !== 'VORSCHLAG', vorschlag: a === 'VORSCHLAG', beschreibung: txt_(z.beschreibung),
      info_dateien: txt_(z.info_dateien).split(/[;,\n]/).map(txt_).filter(String),
      verantwortlich_id: txt_(z.verantwortlich_id), verantwortlich_platzhalter: name_(z.verantwortlich_platzhalter), verantwortlich: namen[txt_(z.verantwortlich_id)] || '', offen: !!txt_(z.offen_am) };
  }) };
}

function produktSpeichern_(p) {
  const b = auth_(p);
  const marktleitung = rang_(b) >= 3;
  const d = p.produkt || {};
  return sperre_(function () {
    const t = tab_('Produkte');
    let z = null;
    if (txt_(d.produkt_id)) {
      z = t.zeilen.filter(function (x) { return txt_(x.produkt_id) === txt_(d.produkt_id); })[0];
      if (!z) throw new Error('Produkt nicht gefunden.');
    }
    if (!marktleitung && !z) throw new Error('Neue Produkte legt die Marktleitung an.');
    const istVerantwortlich = z && txt_(z.verantwortlich_id) === txt_(b.benutzer_id);
    if (!marktleitung && !istVerantwortlich && rang_(b) < 2) throw new Error('Keine Berechtigung.');
    const id = z ? txt_(z.produkt_id) : neueId_(t, 'produkt_id', 'P');
    const stempel = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss');
    const info = (Array.isArray(d.info_dateien) ? d.info_dateien : []).map(txt_).filter(String);
    let bild = '';
    if (p.bild && p.bild.data) bild = dateiSpeichern_(ordnerSicherstellen_('bilder_ordner_id', 'Kassen-App Produktbilder'), id.toLowerCase() + '_' + stempel + '.jpg', p.bild.data, 'image/jpeg', false);
    (p.zusatzdateien || []).forEach(function (f, i) {
      if (!f || !f.data) return;
      const pdf = f.mime === 'application/pdf';
      const basis = txt_(f.name).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[äöüß]/g, function (c) { return { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[c]; }).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      info.push(dateiSpeichern_(ordnerSicherstellen_('info_ordner_id', 'Kassen-App Produktinfos'), id.toLowerCase() + '_' + (basis || 'info') + '_' + stempel + '_' + (i + 1) + (pdf ? '.pdf' : '.jpg'), f.data, pdf ? 'application/pdf' : 'image/jpeg', true));
    });
    const inhalt = { beschreibung: txt_(d.beschreibung), info_dateien: info.join(';') };
    if (bild) inhalt.bild = bild;
    // Bild und Beschreibung: Produktverantwortliche und Admins direkt, andere Leitungen als Vorschlag
    if (!marktleitung && !istVerantwortlich && rang_(b) < 4) {
      const geaendert = bild || inhalt.beschreibung !== txt_(z.beschreibung) || inhalt.info_dateien !== txt_(z.info_dateien);
      if (!geaendert) return { ok: true, produkt_id: id };
      setzen_(t, z, 'offen_bild', bild); setzen_(t, z, 'offen_beschreibung', inhalt.beschreibung !== txt_(z.beschreibung) ? (inhalt.beschreibung || '-') : '');
      setzen_(t, z, 'offen_info', inhalt.info_dateien !== txt_(z.info_dateien) ? (inhalt.info_dateien || '-') : ''); setzen_(t, z, 'offen_von', txt_(b.benutzer_id)); setzen_(t, z, 'offen_am', new Date());
      return { ok: true, produkt_id: id, vorschlag: true };
    }
    const werte = Object.assign({}, inhalt);
    if (marktleitung) {
      if (!txt_(d.name)) throw new Error('Name fehlt.');
      if (!txt_(d.kategorie)) throw new Error('Kategorie fehlt.');
      Object.assign(werte, { name: txt_(d.name), kategorie: txt_(d.kategorie), preis: euro_(d.preis), sortierung: Number(d.sortierung) || 0, aktiv: d.aktiv === false ? 'NEIN' : 'JA' });
      if (d.verantwortlich_id !== undefined || d.verantwortlich_platzhalter !== undefined) {
        let vid = txt_(d.verantwortlich_id), ph = vid ? '' : name_(d.verantwortlich_platzhalter);
        if (ph) { const tr = tab_('Benutzer').zeilen.filter(function (x) { return name_(x.name).toLowerCase() === ph.toLowerCase() && status_(x) === 'aktiv'; })[0]; if (tr) { vid = txt_(tr.benutzer_id); ph = ''; } }
        if (vid && vid !== (z ? txt_(z.verantwortlich_id) : '') && vid !== txt_(b.benutzer_id)) nachricht_(vid, 'Produktverantwortung: ' + txt_(d.name), 'Du bist jetzt für dieses Produkt verantwortlich.', b);
        werte.verantwortlich_id = vid; werte.verantwortlich_platzhalter = ph;
      }
      const vz = z ? txt_(z.verantwortlich_id) : '';
      if (z && vz && vz !== txt_(b.benutzer_id) && (bild || inhalt.beschreibung !== txt_(z.beschreibung) || inhalt.info_dateien !== txt_(z.info_dateien)))
        nachricht_(vz, 'Produkt geändert: ' + txt_(d.name), 'Bild oder Beschreibung geändert von ' + name_(b.name), b);
    }
    if (z) Object.keys(werte).forEach(function (k) { setzen_(t, z, k, werte[k]); });
    else anhaengen_(t, [Object.assign({ produkt_id: id }, werte)]);
    return { ok: true, produkt_id: id, bild: werte.bild || (z ? txt_(z.bild) : '') };
  });
}

function kategorieSpeichern_(p) {
  auth_(p, 3);
  const neu = txt_(p.kategorie), alt = txt_(p.alt);
  if (!neu) throw new Error('Name fehlt.');
  if (/[;,]/.test(neu) || neu.toUpperCase() === 'ALLE') throw new Error('Name ungültig.');
  return sperre_(function () {
    const t = tab_('Kategorien');
    if (t.zeilen.some(function (x) { return txt_(x.kategorie).toLowerCase() === neu.toLowerCase() && txt_(x.kategorie) !== alt; })) throw new Error('Kategorie gibt es schon.');
    const z = alt ? t.zeilen.filter(function (x) { return txt_(x.kategorie) === alt; })[0] : null;
    if (alt && !z) throw new Error('Kategorie nicht gefunden.');
    const werte = { kategorie: neu, sortierung: Number(p.sortierung) || 0, farbe: /^#[0-9a-f]{6}$/i.test(txt_(p.farbe)) ? txt_(p.farbe) : '', preis_je_markt: p.preis_je_markt ? 'JA' : 'NEIN' };
    if (z) Object.keys(werte).forEach(function (k) { setzen_(t, z, k, werte[k]); }); else anhaengen_(t, [werte]);
    if (alt && alt !== neu) {
      const pr = tab_('Produkte');
      pr.zeilen.forEach(function (x) { if (txt_(x.kategorie) === alt) setzen_(pr, x, 'kategorie', neu); });
      const st = tab_('Stände');
      st.zeilen.forEach(function (x) {
        const l = txt_(x.kategorien).split(/[;,]/).map(txt_);
        if (l.indexOf(alt) >= 0) setzen_(st, x, 'kategorien', l.map(function (k) { return k === alt ? neu : k; }).join(';'));
      });
    }
    return { ok: true };
  });
}
function preisSpeichern_(p) {
  const b = auth_(p, 2);
  const markt = markt_(p.markt_id);
  if (!markt) throw new Error('Markt nicht gefunden.');
  const staende = tab_('Stände').zeilen.filter(function (s) { return txt_(s.markt_id) === txt_(p.markt_id); });
  const direkt = marktAendern_(b, p.markt_id) || staende.some(function (s) { return standAendern_(b, s.stand_id); });
  return sperre_(function () {
    if (direkt) { preisUebernehmen_(b, p.markt_id, p.produkt_id, p.preis); return { ok: true }; }
    const s = staende.filter(function (x) { return txt_(x.stand_id) === txt_(p.stand_id) && standRecht_(b, x.stand_id); })[0];
    if (!s) throw new Error('Keine Berechtigung.');
    const pr = tab_('Produkte').zeilen.filter(function (x) { return txt_(x.produkt_id) === txt_(p.produkt_id); })[0];
    const wert = p.preis === null || p.preis === '' || p.preis === undefined ? 'Standardpreis' : euro_(p.preis).toFixed(2).replace('.', ',') + ' €';
    return vorschlag_(b, 'preis', txt_(p.markt_id), 'stand:' + txt_(s.stand_id), { titel: 'Preis ' + (pr ? txt_(pr.name) : ''), text: wert + ' · ' + txt_(markt.name), markt_id: txt_(p.markt_id), produkt_id: txt_(p.produkt_id), preis: p.preis });
  });
}
function preisUebernehmen_(b, marktId, produktId, preis) {
  const t = tab_('Preise');
  const z = t.zeilen.filter(function (x) { return txt_(x.markt_id) === txt_(marktId) && txt_(x.produkt_id) === txt_(produktId); })[0];
  if (preis === null || preis === '' || preis === undefined) { if (z) loeschen_(t, z); return; }
  const werte = { preis: euro_(preis), geaendert_von: txt_(b.benutzer_id), geaendert_am: new Date() };
  if (z) Object.keys(werte).forEach(function (k) { setzen_(t, z, k, werte[k]); });
  else anhaengen_(t, [Object.assign({ markt_id: marktId, produkt_id: produktId }, werte)]);
}

/* ===================================================================
   Märkte, Stände, Zuständigkeiten
   =================================================================== */
function struktur_(p) {
  const b = auth_(p, 2);
  const namen = namen_();
  const zust = tab_('Zuständigkeiten').zeilen.map(function (z) { return { art: txt_(z.art), ref_id: txt_(z.ref_id), benutzer_id: txt_(z.benutzer_id), name: namen[txt_(z.benutzer_id)] || '', verantwortlich: ja_(z.verantwortlich) }; });
  const maerkte = tab_('Märkte').zeilen.filter(function (z) { return txt_(z.markt_id); }).map(function (z) {
    return { markt_id: txt_(z.markt_id), name: txt_(z.name), ort: txt_(z.ort), datum_von: tag_(z.datum_von), datum_bis: tag_(z.datum_bis), archiviert: ja_(z.archiviert),
      recht: marktRecht_(b, z.markt_id), aendern: marktAendern_(b, z.markt_id), leitung: zust.filter(function (x) { return x.art === 'markt' && x.ref_id === txt_(z.markt_id); }) };
  });
  const staende = tab_('Stände').zeilen.filter(function (z) { return txt_(z.stand_id); }).map(function (z) {
    const k = txt_(z.kategorien);
    return { stand_id: txt_(z.stand_id), markt_id: txt_(z.markt_id), name: txt_(z.name), archiviert: ja_(z.archiviert),
      kategorien: !k || k.toUpperCase() === 'ALLE' ? 'ALLE' : k.split(/[;,]/).map(txt_).filter(String), standzeiten: standzeiten_(z.standzeiten),
      recht: standRecht_(b, z.stand_id), aendern: standAendern_(b, z.stand_id), leitung: zust.filter(function (x) { return x.art === 'stand' && x.ref_id === txt_(z.stand_id); }) };
  }).filter(function (s) { return s.recht || maerkte.some(function (m) { return m.markt_id === s.markt_id && m.recht; }); });
  const sichtbar = maerkte.filter(function (m) { return m.recht || staende.some(function (s) { return s.markt_id === m.markt_id; }); });
  const out = { ok: true, maerkte: sichtbar, staende: staende };
  out.personen = tab_('Benutzer').zeilen.filter(function (z) { return status_(z) === 'aktiv' && !ja_(z.entfernt) && rang_(z) >= 2; }).map(function (z) { return { benutzer_id: txt_(z.benutzer_id), name: name_(z.name), rolle: rolle_(z) }; });
  return out;
}

function marktSpeichern_(p) {
  const b = auth_(p, 3);
  const d = p.markt || {};
  if (!txt_(d.name)) throw new Error('Name fehlt.');
  return sperre_(function () {
    if (txt_(d.markt_id)) {
      const z = markt_(d.markt_id);
      if (!z) throw new Error('Markt nicht gefunden.');
      if (!marktAendern_(b, d.markt_id)) return vorschlag_(b, 'markt', txt_(d.markt_id), 'markt:' + txt_(d.markt_id), { titel: 'Änderung Markt ' + txt_(z.name), text: aenderungsText_(z, d, ['name', 'ort', 'datum_von', 'datum_bis']) + (d.archiviert && !ja_(z.archiviert) ? ' archivieren' : ''), markt: d });
      marktUebernehmen_(d);
      return { ok: true, markt_id: txt_(d.markt_id) };
    }
    const t = tab_('Märkte');
    const id = neueId_(t, 'markt_id', 'MK');
    anhaengen_(t, [Object.assign({ markt_id: id }, marktWerte_(d))]);
    verantwortlichSetzen_('markt', id, b.benutzer_id, b.benutzer_id);
    return { ok: true, markt_id: id };
  });
}
function marktWerte_(d) {
  const datum = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(txt_(v)) ? alsText_(txt_(v)) : ''; };
  return { name: txt_(d.name), ort: txt_(d.ort), datum_von: datum(d.datum_von), datum_bis: datum(d.datum_bis || d.datum_von), archiviert: d.archiviert ? 'JA' : 'NEIN' };
}
function marktUebernehmen_(d) {
  const t = tab_('Märkte'), z = markt_(d.markt_id);
  if (!z) throw new Error('Markt nicht gefunden.');
  const w = marktWerte_(d);
  Object.keys(w).forEach(function (k) { setzen_(t, z, k, w[k]); });
}
function aenderungsText_(alt, neu, felder) {
  return felder.filter(function (f) { return neu[f] !== undefined && txt_(neu[f]) !== (f.indexOf('datum') === 0 ? tag_(alt[f]) : txt_(alt[f])); }).map(function (f) { return f.replace('_', ' ') + ': ' + txt_(neu[f]); }).join(', ');
}

function standSpeichern_(p) {
  const b = auth_(p, 2);
  const d = p.stand || {};
  if (!txt_(d.name)) throw new Error('Name fehlt.');
  return sperre_(function () {
    if (txt_(d.stand_id)) {
      const z = stand_(d.stand_id);
      if (!z) throw new Error('Stand nicht gefunden.');
      if (!standAendern_(b, d.stand_id)) {
        standPruefen_(b, d.stand_id);
        const w = standWerte_(d), was = [];
        if (w.name !== txt_(z.name)) was.push('Name');
        if (w.standzeiten !== txt_(z.standzeiten)) was.push('Standzeiten');
        if (w.kategorien !== (txt_(z.kategorien) || 'ALLE')) was.push('Sortiment');
        if (w.archiviert === 'JA' && !ja_(z.archiviert)) was.push('archivieren');
        if (!was.length) return { ok: true, stand_id: txt_(d.stand_id) };
        return vorschlag_(b, 'stand', txt_(d.stand_id), 'stand:' + txt_(d.stand_id), { titel: 'Änderung Stand ' + txt_(z.name), text: was.join(', '), stand: d });
      }
      standUebernehmen_(d);
      return { ok: true, stand_id: txt_(d.stand_id) };
    }
    if (!marktAendern_(b, d.markt_id)) throw new Error('Nur Marktverantwortliche legen Stände an.');
    const t = tab_('Stände');
    const id = neueId_(t, 'stand_id', 'S');
    anhaengen_(t, [Object.assign({ stand_id: id, markt_id: txt_(d.markt_id) }, standWerte_(d))]);
    verantwortlichSetzen_('stand', id, b.benutzer_id, b.benutzer_id);
    return { ok: true, stand_id: id };
  });
}
function standWerte_(d) {
  const zeiten = (Array.isArray(d.standzeiten) ? d.standzeiten : []).filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(txt_(x.datum)) && uhr_(x.von) && uhr_(x.bis); })
    .map(function (x) { return txt_(x.datum) + ' ' + uhr_(x.von) + '-' + uhr_(x.bis); });
  return { name: txt_(d.name), kategorien: d.kategorien === 'ALLE' || !Array.isArray(d.kategorien) || !d.kategorien.length ? 'ALLE' : d.kategorien.map(txt_).join(';'),
    standzeiten: zeiten.join('; '), archiviert: d.archiviert ? 'JA' : 'NEIN' };
}
function standUebernehmen_(d) {
  const t = tab_('Stände'), z = stand_(d.stand_id);
  if (!z) throw new Error('Stand nicht gefunden.');
  const w = standWerte_(d);
  Object.keys(w).forEach(function (k) { setzen_(t, z, k, w[k]); });
}

function zustaendigkeit_(p) {
  const b = auth_(p, 2);
  const art = p.art === 'markt' ? 'markt' : 'stand';
  return sperre_(function () {
    if (art === 'markt' ? !marktAendern_(b, p.ref_id) : !standAendern_(b, p.ref_id)) throw new Error('Nur Verantwortliche.');
    const ziel = benutzer_(p.ziel_id);
    if (!ziel) throw new Error('Person nicht gefunden.');
    if (rang_(ziel) < (art === 'markt' ? 3 : 2)) throw new Error('Person hat nicht die nötige Rolle.');
    const t = tab_('Zuständigkeiten');
    const z = t.zeilen.filter(function (x) { return txt_(x.art) === art && txt_(x.ref_id) === txt_(p.ref_id) && txt_(x.benutzer_id) === txt_(p.ziel_id); })[0];
    if (p.an && !z) anhaengen_(t, [{ art: art, ref_id: p.ref_id, benutzer_id: p.ziel_id, erstellt_von: txt_(b.benutzer_id), erstellt_am: new Date() }]);
    if (!p.an && z) {
      if (ja_(z.verantwortlich)) throw new Error('Verantwortliche zuerst über „Verantwortung“ ändern.');
      loeschen_(t, z);
    }
    return { ok: true };
  });
}

/* ===================================================================
   Verantwortliche je Stand und Markt (höchstens zwei)
   =================================================================== */
function verantwortung_(p) {
  const b = auth_(p, 2);
  const art = p.art === 'markt' ? 'markt' : 'stand', ref = txt_(p.ref_id);
  const obj = art === 'stand' ? stand_(ref) : markt_(ref);
  if (!obj) throw new Error('Nicht gefunden.');
  const hoeher = art === 'stand' ? rang_(b) >= 3 : rang_(b) >= 4;
  const ich = verantwortlich_(b, art, ref);
  if (!ich && !hoeher) throw new Error('Nur Verantwortliche.');
  return sperre_(function () {
    const liste = verantwortliche_(art, ref);
    const zt = tab_('Zuständigkeiten');
    const zeile = function (id) { return zt.zeilen.filter(function (x) { return txt_(x.art) === art && txt_(x.ref_id) === ref && txt_(x.benutzer_id) === txt_(id); })[0]; };
    if (p.modus === 'zuruecktreten' || p.modus === 'entfernen') {
      const wer = p.modus === 'zuruecktreten' ? txt_(b.benutzer_id) : txt_(p.ziel_id);
      if (p.modus === 'entfernen' && !hoeher) throw new Error('Keine Berechtigung.');
      if (liste.indexOf(wer) < 0) throw new Error('Nicht verantwortlich.');
      if (liste.length <= 1) throw new Error('Die letzte verantwortliche Person kann nicht ausscheiden.');
      setzen_(zt, zeile(wer), 'verantwortlich', '');
      return { ok: true };
    }
    const ziel = benutzer_(p.ziel_id);
    if (!ziel || status_(ziel) !== 'aktiv') throw new Error('Person nicht gefunden.');
    if (rang_(ziel) < (art === 'markt' ? 3 : 2)) throw new Error('Person hat nicht die nötige Rolle.');
    if (liste.indexOf(txt_(ziel.benutzer_id)) >= 0) throw new Error('Ist schon verantwortlich.');
    const abgeben = p.modus === 'abgeben' && ich;
    if (!abgeben && liste.length >= 2) throw new Error('Höchstens zwei Verantwortliche.');
    const offen = tab_('Vorschläge').zeilen.some(function (x) { return txt_(x.status) === 'offen' && txt_(x.art) === 'verantwortung' && txt_(x.ref_id) === art + ':' + ref && txt_(x.an) === 'benutzer:' + txt_(ziel.benutzer_id); });
    if (offen) throw new Error('Anfrage läuft schon.');
    const name = txt_(obj.name);
    return vorschlag_(b, 'verantwortung', art + ':' + ref, 'benutzer:' + txt_(ziel.benutzer_id),
      { titel: 'Verantwortung ' + (art === 'markt' ? 'Markt ' : 'Stand ') + name, text: abgeben ? 'übernehmen statt ' + name_(b.name) : 'gemeinsam übernehmen', art: art, ref: ref, abgeben: abgeben, ziel: txt_(ziel.benutzer_id) });
  });
}
function verantwortungUebernehmen_(b, d) {
  const zt = tab_('Zuständigkeiten');
  const liste = verantwortliche_(d.art, d.ref);
  const von = tab_('Vorschläge').zeilen.filter(function (x) { return txt_(x.ref_id) === d.art + ':' + d.ref && txt_(x.status) === 'offen' && txt_(x.an) === 'benutzer:' + d.ziel; })[0];
  const abgebender = d.abgeben && von ? txt_(von.von) : '';
  if (liste.length - (abgebender && liste.indexOf(abgebender) >= 0 ? 1 : 0) >= 2) throw new Error('Höchstens zwei Verantwortliche.');
  const z = zt.zeilen.filter(function (x) { return txt_(x.art) === d.art && txt_(x.ref_id) === d.ref && txt_(x.benutzer_id) === d.ziel; })[0];
  if (z) setzen_(zt, z, 'verantwortlich', 'JA');
  else anhaengen_(zt, [{ art: d.art, ref_id: d.ref, benutzer_id: d.ziel, verantwortlich: 'JA', erstellt_von: txt_(b.benutzer_id), erstellt_am: new Date() }]);
  if (abgebender) { const a = zt.zeilen.filter(function (x) { return txt_(x.art) === d.art && txt_(x.ref_id) === d.ref && txt_(x.benutzer_id) === abgebender; })[0]; if (a) setzen_(zt, a, 'verantwortlich', ''); }
}
function verantwortlichSetzen_(art, ref, id, von) {
  const zt = tab_('Zuständigkeiten');
  const z = zt.zeilen.filter(function (x) { return txt_(x.art) === art && txt_(x.ref_id) === ref && txt_(x.benutzer_id) === txt_(id); })[0];
  if (z) setzen_(zt, z, 'verantwortlich', 'JA');
  else anhaengen_(zt, [{ art: art, ref_id: ref, benutzer_id: txt_(id), verantwortlich: 'JA', erstellt_von: txt_(von), erstellt_am: new Date() }]);
}

/* ===================================================================
   Checklisten und Vorlagen
   =================================================================== */
function checkAendern_(b, art, ref) { return art === 'markt' ? marktAendern_(b, ref) : standAendern_(b, ref); }
function startDatum_(art, ref) {
  if (art === 'markt') { const m = markt_(ref); return m ? tag_(m.datum_von) : ''; }
  const z = standzeiten_((stand_(ref) || {}).standzeiten)[0];
  return z ? z.datum : '';
}
function plusTage_(datum, n) { return datum ? tag_(new Date(new Date(datum + 'T12:00:00').getTime() + n * 864e5)) : ''; }
function checklistenFuer_(b) {
  const namen = namen_(), ich = txt_(b.benutzer_id);
  const sichtbar = function (z) {
    if (txt_(z.zustaendig_id) === ich) return true;
    if (txt_(z.art) === 'stand') { const s = stand_(z.ref_id); return !!s && !ja_(s.archiviert) && standRecht_(b, z.ref_id); }
    const m = markt_(z.ref_id); return !!m && !ja_(m.archiviert) && (rang_(b) >= 3 || zustaendig_(b, 'markt', z.ref_id));
  };
  return tab_('Checklisten').zeilen.filter(function (z) { return txt_(z.punkt_id) && sichtbar(z); }).map(function (z) {
    return { punkt_id: txt_(z.punkt_id), art: txt_(z.art), ref_id: txt_(z.ref_id), text: txt_(z.text), zustaendig_id: txt_(z.zustaendig_id),
      zustaendig: txt_(z.zustaendig_id) ? (namen[txt_(z.zustaendig_id)] || '') : name_(z.platzhalter), platzhalter: !txt_(z.zustaendig_id) && !!txt_(z.platzhalter),
      faellig: tag_(z.faellig), sortierung: Number(z.sortierung) || 0, erledigt: !!txt_(z.erledigt_am), erledigt_von: namen[txt_(z.erledigt_von)] || '' };
  });
}
function checkpunkt_(id) { return tab_('Checklisten').zeilen.filter(function (x) { return txt_(x.punkt_id) === txt_(id); })[0] || null; }
function checkpunktSpeichern_(p) {
  const b = auth_(p, 2);
  const d = p.punkt || {};
  const art = d.art === 'markt' ? 'markt' : 'stand';
  if (!checkAendern_(b, art, d.ref_id)) throw new Error('Nur Verantwortliche.');
  if (!txt_(d.text)) throw new Error('Text fehlt.');
  return sperre_(function () {
    const t = tab_('Checklisten');
    let z = checkpunkt_(d.punkt_id);
    const vorher = z ? txt_(z.zustaendig_id) : '';
    let zid = txt_(d.zustaendig_id), ph = zid ? '' : name_(d.platzhalter);
    if (ph) { const tr = tab_('Benutzer').zeilen.filter(function (x) { return name_(x.name).toLowerCase() === ph.toLowerCase() && status_(x) === 'aktiv'; })[0]; if (tr) { zid = txt_(tr.benutzer_id); ph = ''; } }
    const werte = { art: art, ref_id: txt_(d.ref_id), text: txt_(d.text).slice(0, 300), zustaendig_id: zid, platzhalter: ph,
      faellig: /^\d{4}-\d{2}-\d{2}$/.test(txt_(d.faellig)) ? alsText_(txt_(d.faellig)) : '', sortierung: Number(d.sortierung) || (z ? Number(z.sortierung) : t.zeilen.length + 1) * 10 };
    if (z) Object.keys(werte).forEach(function (k) { setzen_(t, z, k, werte[k]); });
    else z = anhaengen_(t, [Object.assign({ punkt_id: txt_(d.punkt_id) || Utilities.getUuid().slice(0, 10) }, werte)])[0];
    if (zid && zid !== vorher && zid !== txt_(b.benutzer_id)) {
      const o = art === 'markt' ? markt_(d.ref_id) : stand_(d.ref_id);
      nachricht_(zid, 'Neue Aufgabe: ' + werte.text.slice(0, 60), (o ? txt_(o.name) : '') + (werte.faellig ? ' · bis ' + kurzTag_(txt_(d.faellig)) : ''), b);
    }
    return { ok: true, punkt_id: txt_(z.punkt_id) };
  });
}
function checkpunktLoeschen_(p) {
  const b = auth_(p, 2);
  return sperre_(function () {
    const z = checkpunkt_(p.punkt_id);
    if (!z) return { ok: true };
    if (!checkAendern_(b, txt_(z.art), txt_(z.ref_id))) throw new Error('Nur Verantwortliche.');
    loeschen_(tab_('Checklisten'), z);
    return { ok: true };
  });
}
function checkpunktHaken_(p) {
  const b = auth_(p, 2);
  return sperre_(function () {
    const t = tab_('Checklisten'), z = checkpunkt_(p.punkt_id);
    if (!z) throw new Error('Nicht gefunden.');
    if (!checkAendern_(b, txt_(z.art), txt_(z.ref_id))) throw new Error('Nur Verantwortliche.');
    setzen_(t, z, 'erledigt_am', p.erledigt ? new Date() : ''); setzen_(t, z, 'erledigt_von', p.erledigt ? txt_(b.benutzer_id) : '');
    return { ok: true };
  });
}
function vorlagenFuer_(b) {
  return tab_('Vorlagen').zeilen.filter(function (z) { return txt_(z.vorlage_id) && (txt_(z.typ) === 'global' || txt_(z.besitzer) === txt_(b.benutzer_id)); }).map(function (z) {
    let punkte = []; try { punkte = JSON.parse(txt_(z.punkte) || '[]'); } catch (e) { }
    return { vorlage_id: txt_(z.vorlage_id), name: txt_(z.name), typ: txt_(z.typ), basis_id: txt_(z.basis_id), punkte: punkte, eigen: txt_(z.besitzer) === txt_(b.benutzer_id) };
  });
}
function vorlageSpeichern_(p) {
  const b = auth_(p, 2);
  const d = p.vorlage || {};
  const typ = d.typ === 'global' ? 'global' : 'individuell';
  if (typ === 'global' && rang_(b) < 3) throw new Error('Globale Vorlagen pflegt die Marktleitung.');
  if (!txt_(d.name)) throw new Error('Name fehlt.');
  const punkte = (Array.isArray(d.punkte) ? d.punkte : []).filter(function (x) { return txt_(x.text); }).map(function (x) { return { text: txt_(x.text).slice(0, 300), tage: x.tage === '' || x.tage === null || x.tage === undefined ? '' : Number(x.tage) || 0 }; });
  return sperre_(function () {
    const t = tab_('Vorlagen');
    let z = t.zeilen.filter(function (x) { return txt_(x.vorlage_id) === txt_(d.vorlage_id); })[0];
    if (z && !(txt_(z.besitzer) === txt_(b.benutzer_id) || (txt_(z.typ) === 'global' && rang_(b) >= 3))) throw new Error('Keine Berechtigung.');
    const werte = { name: txt_(d.name), typ: typ, basis_id: typ === 'individuell' ? txt_(d.basis_id) : '', punkte: JSON.stringify(punkte), geaendert_am: new Date() };
    if (z) Object.keys(werte).forEach(function (k) { setzen_(t, z, k, werte[k]); });
    else z = anhaengen_(t, [Object.assign({ vorlage_id: txt_(d.vorlage_id) || Utilities.getUuid().slice(0, 10), besitzer: txt_(b.benutzer_id) }, werte)])[0];
    return { ok: true, vorlage_id: txt_(z.vorlage_id) };
  });
}
function vorlageLoeschen_(p) {
  const b = auth_(p, 2);
  return sperre_(function () {
    const t = tab_('Vorlagen');
    const z = t.zeilen.filter(function (x) { return txt_(x.vorlage_id) === txt_(p.vorlage_id); })[0];
    if (!z) return { ok: true };
    if (!(txt_(z.besitzer) === txt_(b.benutzer_id) || (txt_(z.typ) === 'global' && rang_(b) >= 3))) throw new Error('Keine Berechtigung.');
    loeschen_(t, z);
    return { ok: true };
  });
}
function vorlageAnwenden_(p) {
  const b = auth_(p, 2);
  const art = p.art === 'markt' ? 'markt' : 'stand';
  if (!checkAendern_(b, art, p.ref_id)) throw new Error('Nur Verantwortliche.');
  const alle = vorlagenFuer_(b);
  const v = alle.filter(function (x) { return x.vorlage_id === txt_(p.vorlage_id); })[0];
  if (!v) throw new Error('Vorlage nicht gefunden.');
  const basis = v.basis_id ? alle.filter(function (x) { return x.vorlage_id === v.basis_id; })[0] : null;
  const punkte = (basis ? basis.punkte : []).concat(v.punkte);
  const start = startDatum_(art, p.ref_id);
  return sperre_(function () {
    const t = tab_('Checklisten');
    const da = t.zeilen.filter(function (x) { return txt_(x.art) === art && txt_(x.ref_id) === txt_(p.ref_id); });
    const vorhanden = {}; da.forEach(function (x) { vorhanden[txt_(x.text).toLowerCase()] = true; });
    let n = da.length;
    const neu = punkte.filter(function (x) { return !vorhanden[txt_(x.text).toLowerCase()]; }).map(function (x) {
      n++; return { punkt_id: Utilities.getUuid().slice(0, 10), art: art, ref_id: txt_(p.ref_id), text: x.text, faellig: x.tage !== '' && start ? alsText_(plusTage_(start, -x.tage)) : '', sortierung: n * 10 };
    });
    anhaengen_(t, neu);
    return { ok: true, anzahl: neu.length };
  });
}

/* ===================================================================
   Markt kopieren (ohne Personalplan)
   =================================================================== */
function marktKopieren_(p) {
  const b = auth_(p, 3);
  const alt = markt_(p.markt_id);
  if (!alt) throw new Error('Markt nicht gefunden.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txt_(p.datum_von))) throw new Error('Startdatum fehlt.');
  const altStart = tag_(alt.datum_von);
  const versatz = altStart ? Math.round((new Date(p.datum_von + 'T12:00:00') - new Date(altStart + 'T12:00:00')) / 864e5) : 0;
  return sperre_(function () {
    const mt = tab_('Märkte'), st = tab_('Stände'), zt = tab_('Zuständigkeiten'), ck = tab_('Checklisten'), pr = tab_('Preise');
    const mid = neueId_(mt, 'markt_id', 'MK');
    anhaengen_(mt, [{ markt_id: mid, name: txt_(p.name) || txt_(alt.name), ort: txt_(alt.ort), datum_von: alsText_(txt_(p.datum_von)), datum_bis: alsText_(plusTage_(tag_(alt.datum_bis) || altStart, versatz) || txt_(p.datum_von)), archiviert: 'NEIN' }]);
    const mv = [txt_(b.benutzer_id)].concat(verantwortliche_('markt', alt.markt_id).filter(function (id) { return id !== txt_(b.benutzer_id); })).slice(0, 2);
    mv.forEach(function (id) { verantwortlichSetzen_('markt', mid, id, b.benutzer_id); });
    const kopieCheck = function (art, altRef, neuRef) {
      ck.zeilen.filter(function (x) { return txt_(x.art) === art && txt_(x.ref_id) === txt_(altRef); }).forEach(function (x) {
        anhaengen_(ck, [{ punkt_id: Utilities.getUuid().slice(0, 10), art: art, ref_id: neuRef, text: txt_(x.text), zustaendig_id: txt_(x.zustaendig_id), platzhalter: txt_(x.platzhalter), faellig: tag_(x.faellig) ? alsText_(plusTage_(tag_(x.faellig), versatz)) : '', sortierung: x.sortierung }]);
      });
    };
    kopieCheck('markt', alt.markt_id, mid);
    let n = 0;
    st.zeilen.filter(function (x) { return txt_(x.markt_id) === txt_(alt.markt_id) && !ja_(x.archiviert); }).forEach(function (x) {
      const sid = neueId_(st, 'stand_id', 'S');
      const zeiten = standzeiten_(x.standzeiten).map(function (z) { return plusTage_(z.datum, versatz) + ' ' + z.von + '-' + z.bis; }).join('; ');
      anhaengen_(st, [{ stand_id: sid, markt_id: mid, name: txt_(x.name), kategorien: txt_(x.kategorien), standzeiten: zeiten, archiviert: 'NEIN' }]);
      zt.zeilen.filter(function (z) { return txt_(z.art) === 'stand' && txt_(z.ref_id) === txt_(x.stand_id); }).forEach(function (z) {
        anhaengen_(zt, [{ art: 'stand', ref_id: sid, benutzer_id: txt_(z.benutzer_id), verantwortlich: txt_(z.verantwortlich), erstellt_von: txt_(b.benutzer_id), erstellt_am: new Date() }]);
      });
      if (!verantwortliche_('stand', sid).length) verantwortlichSetzen_('stand', sid, b.benutzer_id, b.benutzer_id);
      kopieCheck('stand', x.stand_id, sid);
      n++;
    });
    pr.zeilen.filter(function (x) { return txt_(x.markt_id) === txt_(alt.markt_id); }).forEach(function (x) {
      anhaengen_(pr, [{ markt_id: mid, produkt_id: txt_(x.produkt_id), preis: x.preis, geaendert_von: txt_(b.benutzer_id), geaendert_am: new Date() }]);
    });
    return { ok: true, markt_id: mid, staende: n };
  });
}

/* ===================================================================
   Einstellungen, Rückmeldungen, Bons
   =================================================================== */
const EINSTELLBAR = ['app_titel', 'verein', 'schnellbetraege', 'storno_anzahl', 'abgleich_sekunden', 'benachrichtigung_email', 'aufgaben'];
function einstellungenAdmin_(p) {
  auth_(p, 4);
  const e = einstellungen_(), out = {};
  EINSTELLBAR.forEach(function (k) { out[k] = txt_(e[k]).charAt(0) === '[' ? '' : txt_(e[k]); });
  if (!out.aufgaben) out.aufgaben = aufgaben_().join(';');
  return { ok: true, einstellungen: out };
}
function einstellungenSpeichern_(p) {
  auth_(p, 4);
  const d = p.einstellungen || {};
  if (d.schnellbetraege !== undefined && !/^\s*\d+(\s*;\s*\d+)*\s*$/.test(txt_(d.schnellbetraege))) throw new Error('Schnelltasten: z. B. 1;2;5;10;20;50');
  if (d.benachrichtigung_email && txt_(d.benachrichtigung_email).indexOf('@') < 1) throw new Error('E-Mail ungültig.');
  EINSTELLBAR.forEach(function (k) { if (d[k] !== undefined) einstellungSetzen_(k, txt_(d[k])); });
  return { ok: true };
}
function rueckmeldungenListe_(p) {
  const b = auth_(p, 2);
  const namen = namen_(), staende = {};
  tab_('Stände').zeilen.forEach(function (z) { staende[txt_(z.stand_id)] = txt_(z.name); });
  return { ok: true, rueckmeldungen: tab_('Rückmeldungen').zeilen.filter(function (z) { return txt_(z.rm_id) && (rang_(b) >= 4 || standRecht_(b, z.stand_id)); }).map(function (z) {
    return { rm_id: txt_(z.rm_id), zeit: iso_(z.zeit), name: namen[txt_(z.benutzer_id)] || '', stand: staende[txt_(z.stand_id)] || '', typ: txt_(z.typ), text: txt_(z.text), status: txt_(z.status) || 'neu' };
  }).sort(function (a, c) { return c.zeit < a.zeit ? -1 : 1; }).slice(0, 100) };
}
function rueckmeldungStatus_(p) {
  const b = auth_(p, 2);
  if (['neu', 'in Arbeit', 'erledigt'].indexOf(p.status) < 0) throw new Error('Status ungültig.');
  const t = tab_('Rückmeldungen');
  const z = t.zeilen.filter(function (x) { return txt_(x.rm_id) === txt_(p.rm_id); })[0];
  if (!z) throw new Error('Nicht gefunden.');
  if (!(rang_(b) >= 4 || standRecht_(b, z.stand_id))) throw new Error('Keine Berechtigung.');
  if (txt_(z.status) !== p.status && txt_(z.benutzer_id) !== txt_(b.benutzer_id)) nachricht_(txt_(z.benutzer_id), 'Rückmeldung: ' + p.status, txt_(z.text).slice(0, 120), b);
  setzen_(t, z, 'status', p.status);
  return { ok: true };
}
function bonsListe_(p) {
  const b = auth_(p, 2);
  standPruefen_(b, p.stand_id);
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(txt_(p.datum)) ? txt_(p.datum) : heute_();
  const namen = namen_(), pos = {};
  tab_('Positionen').zeilen.forEach(function (z) {
    if (tag_(z.zeit) !== tag || txt_(z.stand_id) !== txt_(p.stand_id)) return;
    (pos[txt_(z.bon_id)] = pos[txt_(z.bon_id)] || []).push((Number(z.menge) || 0) + '× ' + txt_(z.produktname));
  });
  return { ok: true, datum: tag, bons: tab_('Verkäufe').zeilen.filter(function (z) { return tag_(z.zeit) === tag && txt_(z.stand_id) === txt_(p.stand_id); }).map(function (z) {
    return { bon_id: txt_(z.bon_id), zeit: iso_(z.zeit), name: namen[txt_(z.benutzer_id)] || '', summe: cent_(z.summe), status: txt_(z.status), art: txt_(z.art), hinweis: txt_(z.hinweis), bestaetigt: !!txt_(z.bestaetigt_am), positionen: (pos[txt_(z.bon_id)] || []).join(', ') };
  }).sort(function (a, c) { return c.zeit < a.zeit ? -1 : 1; }) };
}

/* ===================================================================
   Test im Editor: Funktion „test“ ausführen
   =================================================================== */
function test() {
  migrieren_();
  Object.keys(TABS).forEach(function (n) { tab_(n); });
  const st = tab_('Stände').zeilen.length, pr = tab_('Produkte').zeilen.length;
  console.log('Version ' + VERSION + ' · ' + tab_('Märkte').zeilen.length + ' Märkte · ' + st + ' Stände · ' + pr + ' Produkte · ' + tab_('Benutzer').zeilen.length + ' Personen');
  const bilder = ordnerListe_(einstellungen_().bilder_ordner_id);
  const fehlt = tab_('Produkte').zeilen.filter(function (z) { return txt_(z.bild) && !bilder[txt_(z.bild)]; });
  if (fehlt.length) console.warn('Bild fehlt im Ordner: ' + fehlt.map(function (z) { return txt_(z.name); }).join(', '));
  console.log('OK');
}

return { doGet: doGet, doPost: doPost, cache_: cache_ };
})();
