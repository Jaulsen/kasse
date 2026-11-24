/* Weihnachtsmarkt-Kasse · App 2.1 · Kern: Zustand, Abgleich, Rahmen, Seitenleiste, Kasse */
'use strict';

const CFG = window.KASSE_CONFIG || {};
const API = (CFG.API_URL || '').trim();
const DEMO = !API;
const APP_VERSION = '2.2';
const KEY_STATE = 'wmk-v2', KEY_DATA = 'wmk-stamm-v2';
const ROLLEN = { Helfer: 1, Standleitung: 2, Marktleitung: 3, Admin: 4 };

/* ---------- Hilfen ---------- */
function uid() { try { return crypto.randomUUID(); } catch (e) { return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12); } }
const eur = c => (c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmtTime = iso => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtClock = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '';
const today = () => new Date().toLocaleDateString('sv-SE');
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const toMin = hm => { const p = String(hm || '').split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); };
const fmtCode = c => String(c).slice(0, 3) + ' ' + String(c).slice(3);
const initials = n => n.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('Speichern fehlgeschlagen', e); } }

const IDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try { const r = indexedDB.open('wmk-dateien', 1); r.onupgradeneeded = () => r.result.createObjectStore('d'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
  }));
  return {
    put: (k, v) => open().then(db => new Promise(res => { const t = db.transaction('d', 'readwrite'); t.objectStore('d').put(v, k); t.oncomplete = res; t.onerror = res; })).catch(() => {}),
    all: () => open().then(db => new Promise(res => {
      const out = {}; const c = db.transaction('d', 'readonly').objectStore('d').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); };
      c.onerror = () => res(out);
    })).catch(() => ({}))
  };
})();
const IMG = {};

/* ---------- Zustand ---------- */
const defaultState = () => ({ user: null, geraet_id: uid(), stand_id: null, bons: [], queue: [], fehlerlog: [], cart: {}, nachtrag: null, zugang: {}, letzterAbgleich: null, letzterFehler: null, anzeige: 1 });
let S = Object.assign(defaultState(), lsGet(KEY_STATE) || {});
(function uebernehmen() {   // Warteschlange aus Version 1.x weiter übertragen
  const alt = lsGet('wmk-v1');
  if (!alt || lsGet(KEY_STATE)) return;
  if (alt.geraet_id) S.geraet_id = alt.geraet_id;
  S.queue = (alt.queue || []).filter(q => q.typ !== 'Benutzer');
  try { localStorage.removeItem('wmk-v1'); localStorage.removeItem('wmk-stamm-v1'); } catch (e) {}
  lsSet(KEY_STATE, S);
})();
let D = lsGet(KEY_DATA);
let ui = { page: null, drawer: false, acc: null, overlay: null, animDone: null, toast: null, toastNew: false, busy: false, kat: 'Alle', q: '', payGiven: null, payParts: [], payInput: '', confirm: null, msg: null, loginMsg: null };
let net = { syncing: false, ok: null };
const OV = {};   // Fenster über der Kasse (Warenkorb, Bezahlen, Info): { titel, body, footer, bind }
const P = {};    // Seiten: { titel, eltern, body, leiste, bind, open, form }

function save() { S.bons = S.bons.slice(-300); S.fehlerlog = (S.fehlerlog || []).slice(-30); lsSet(KEY_STATE, S); }
function keepDevice() { return { geraet_id: S.geraet_id, queue: S.queue, fehlerlog: S.fehlerlog, letzterAbgleich: S.letzterAbgleich, anzeige: S.anzeige }; }

const E = () => (D && D.einstellungen) || { schnellbetraege: [1, 2, 5, 10, 20, 50], storno_anzahl: 2, abgleich_sekunden: 60, app_titel: 'Weihnachtsmarkt-Kasse', puffer_min: 30 };
const KATS = () => (D && D.kategorien) || [];
const PRODS = () => (D && D.produkte) || [];
const STAENDE = () => (D && D.staende) || [];
const MAERKTE = () => (D && D.maerkte) || [];
const kat = name => KATS().find(k => k.kategorie === name) || { farbe: '#5E6A61', sortierung: 99 };
const stand = (id = S.stand_id) => STAENDE().find(s => s.stand_id === id);
const marktVon = st => st && MAERKTE().find(m => m.markt_id === st.markt_id);
const prod = pid => PRODS().find(p => p.produkt_id === pid);
const standName = id => { const s = stand(id); return s ? s.name : ''; };
const role = () => (S.user && S.user.rolle) || 'Helfer';
const rang = () => ROLLEN[role()] || 1;
const leitet = (sid = S.stand_id) => !!(sid && D && D.rechte && D.rechte.staende.includes(sid));
const hinweisZahl = () => ((D && Array.isArray(D.hinweise)) ? D.hinweise.length : 0);
const online = () => net.ok !== false;
const needsCode = sid => !leitet(sid) && (S.zugang || {})[sid] !== today();

function preis(p, st = stand()) {
  if (!p) return 0;
  if (st && kat(p.kategorie).preis_je_markt) {
    const x = (D.preise || []).find(r => r.markt_id === st.markt_id && r.produkt_id === p.produkt_id);
    if (x) return x.preis;
  }
  return p.preis;
}
function availOf(sid, pid) {
  for (let i = S.queue.length - 1; i >= 0; i--) {
    const q = S.queue[i];
    if (q.typ === 'Verfuegbarkeit' && q.data.stand_id === sid && q.data.produkt_id === pid) return q.data.status;
  }
  const v = ((D && D.verfuegbarkeit) || []).find(x => x.stand_id === sid && x.produkt_id === pid);
  return v ? v.status : 'verfuegbar';
}
function sortimentFor(st) {
  if (!st) return [];
  return PRODS().filter(p => st.kategorien === 'ALLE' || st.kategorien.includes(p.kategorie))
    .sort((a, b) => kat(a.kategorie).sortierung - kat(b.kategorie).sortierung || a.sortierung - b.sortierung);
}
function inStandzeit(st, d = new Date()) {
  const tag = d.toLocaleDateString('sv-SE'), m = d.getHours() * 60 + d.getMinutes(), pf = E().puffer_min || 30;
  return (st && st.standzeiten || []).some(z => z.datum === tag && m >= toMin(z.von) - pf && m <= toMin(z.bis) + pf);
}
function cartLines() {
  return Object.entries(S.cart).filter(([pid, q]) => q > 0 && prod(pid)).map(([pid, menge]) => { const p = prod(pid); const e = preis(p); return { p, menge, einzel: e, summe: e * menge }; });
}
const cartTotal = () => cartLines().reduce((a, l) => a + l.summe, 0);
const cartCount = () => cartLines().reduce((a, l) => a + l.menge, 0);
const imgUrl = (ordner, name) => { const x = IMG[ordner + ':' + name]; return x ? x.url : (DEMO && window.KASSE_DEMO && window.KASSE_DEMO.bilder[name]) || ''; };


/* ---------- Schnittstelle ---------- */
async function api(params, post) {
  const p = Object.assign({ benutzer_id: S.user ? S.user.benutzer_id : '', geraet_id: S.geraet_id }, params);
  if (DEMO) {
    await new Promise(r => setTimeout(r, window.DEMO_LATENZ || 150));
    if (window.DEMO_NETZ === false) { net.ok = false; throw new TypeError('offline'); }
    net.ok = true;
    return window.DEMO_SERVER.call(p, post);
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), post ? 45000 : 25000);
  try {
    let res;
    if (post) res = await fetch(API, { method: 'POST', body: JSON.stringify(p), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctl.signal, redirect: 'follow' });
    else res = await fetch(API + (API.includes('?') ? '&' : '?') + new URLSearchParams(p).toString(), { signal: ctl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('Antwort der Schnittstelle unlesbar'); }
    net.ok = true;
    return j;
  } catch (e) {
    if (e.name === 'AbortError' || e instanceof TypeError || /HTTP/.test(e.message)) net.ok = false;
    throw e;
  } finally { clearTimeout(timer); }
}
async function call(params, post) {
  try { const r = await api(params, post); if (!r.ok) toast(esc(r.fehler === 'NICHT_ANGEMELDET' ? 'Bitte neu anmelden' : r.fehler)); return r; }
  catch (e) { toast(net.ok === false ? 'Kein Netz' : esc(e.message)); return { ok: false }; }
}

/* Knopf sperren, solange eine Anfrage läuft: kein doppeltes Auslösen */
async function tue(btn, fn) {
  if (!btn || btn.dataset.busy) return;
  btn.dataset.busy = '1'; btn.classList.add('busy'); btn.disabled = true;
  try { await fn(); } finally { if (btn.isConnected) { delete btn.dataset.busy; btn.classList.remove('busy'); btn.disabled = false; } }
}

/* Warteschlange: alles, was nicht auf die Antwort warten muss, wirkt sofort und wird im Hintergrund übertragen */
function enqueue(typ, data) {
  const en = { id: uid(), typ, data, benutzer_id: S.user ? S.user.benutzer_id : '', t: Date.now() };
  S.queue.push(en);
  lokal(en);
  save();
  clearTimeout(enqueue.t);
  enqueue.t = setTimeout(sync, 400);
}
const aktion = (name, data) => enqueue('Aktion', Object.assign({ aktion: name }, data));

/* Wirkung einer Aktion sofort auf die lokalen Daten anwenden */
function lokal(en) {
  if (!D || en.typ !== 'Aktion') return;
  const d = en.data;
  if (d.aktion === 'schicht_speichern') {
    const s = d.schicht, l = D.schichten || (D.schichten = []);
    const i = l.findIndex(x => x.schicht_id === s.schicht_id);
    const pers = (D.personen || []).find(p => p.benutzer_id === s.benutzer_id);
    const neu = Object.assign({}, i >= 0 ? l[i] : {}, s, {
      name: s.benutzer_id ? (pers ? pers.name : S.user.name) : s.platzhalter, platzhalter: !s.benutzer_id,
      status: leitet(s.stand_id) ? 'geplant' : 'vorgeschlagen', lokal: true });
    if (i >= 0) l[i] = neu; else l.push(neu);
  } else if (d.aktion === 'schicht_loeschen') {
    D.schichten = (D.schichten || []).filter(x => x.schicht_id !== d.schicht_id);
  } else if (d.aktion === 'hinweis_aktion') {
    D.hinweise = (D.hinweise || []).filter(h => !(h.typ === d.typ && h.id === d.id));
    if (d.typ === 'schicht' || d.typ === 'verknuepfung') {
      const s = (D.schichten || []).find(x => x.schicht_id === d.id);
      if (s) { if (d.aktion2 === 'ja') s.status = 'geplant'; else if (d.typ === 'schicht') s.status = 'abgelehnt'; else { s.status = 'geplant'; s.benutzer_id = ''; s.platzhalter = true; } }
    }
    if (d.typ === 'ausverkauft' && d.aktion2 === 'nein') { const [sid, pid] = d.id.split('|'); D.verfuegbarkeit = (D.verfuegbarkeit || []).filter(v => !(v.stand_id === sid && v.produkt_id === pid)); }
  }
}
const wartet = id => S.queue.some(q => q.typ === 'Aktion' && ((q.data.schicht && q.data.schicht.schicht_id === id) || q.data.schicht_id === id));

async function sync() {
  if (net.syncing) { net.again = true; return; }
  if (!S.user && !S.queue.length) return;
  const angemeldet = S.user && S.user.status === 'aktiv';
  net.syncing = true; paintChip();
  if (S.user && !D) render();
  let changed = false;
  try {
    while (S.queue.length) {
      const batch = S.queue.slice(0, 40);
      const r = await api({ aktion: 'sync', eintraege: batch }, true);
      if (!r.ok) throw new Error(r.fehler || 'Abgleich abgelehnt');
      const done = new Set(r.erledigt || []);
      (r.fehler || []).forEach(f => {
        done.add(f.id); changed = true;
        S.fehlerlog.push({ zeit: new Date().toISOString(), typ: f.typ, fehler: f.fehler });
        toast('Nicht gespeichert: ' + esc(f.fehler));
      });
      S.queue = S.queue.filter(q => !done.has(q.id));
      save();
      if (!done.size) break;
    }
    if (!S.user) return;
    if (S.queue.length) throw new Error('Übertragung unvollständig');
    const st = await api({ aktion: 'stammdaten', hash: angemeldet && D ? D.hash || '' : '' });
    const vorher = JSON.stringify([D, S.user, S.zugang]);
    applyStamm(st);
    changed = changed || vorher !== JSON.stringify([D, S.user, S.zugang]);
    S.letzterAbgleich = new Date().toISOString(); S.letzterFehler = null;
    save();
    loadImages();
  } catch (e) {
    S.letzterFehler = (e.name === 'AbortError' ? 'Zeitüberschreitung' : String(e.message || e)); save();
  } finally {
    net.syncing = false;
    softRender(changed || !D);
    if (net.again) { net.again = false; setTimeout(sync, 50); }
  }
}

function applyStamm(st) {
  if (!st.ok) {
    if (st.abgemeldet || st.fehler === 'NICHT_ANGEMELDET') { ui.loginMsg = 'Auf einem anderen Gerät angemeldet.'; S = Object.assign(defaultState(), keepDevice()); D = null; ui.page = null; ui.drawer = false; ui.overlay = null; }
    else throw new Error(st.fehler);
    return;
  }
  if (!st.version || !/^2\.[1-9]/.test(String(st.version))) throw new Error('Schnittstelle ist noch Version ' + (st.version || '1.x'));
  if (st.benutzer) Object.assign(S.user, { rolle: st.benutzer.rolle, status: st.benutzer.status, name: st.benutzer.name });
  if (!st.benutzer || st.benutzer.status !== 'aktiv') return;
  if (!(st.unveraendert && D)) {
    D = { einstellungen: st.einstellungen, aufgaben: st.aufgaben, kategorien: st.kategorien, produkte: st.produkte, maerkte: st.maerkte, staende: st.staende, preise: st.preise, verfuegbarkeit: st.verfuegbarkeit, hash: st.hash };
  }
  Object.assign(D, { rechte: st.rechte, hinweise: st.hinweise || [], schichten: st.schichten || [], personen: st.personen || [] });
  S.queue.forEach(lokal);
  lsSet(KEY_DATA, D);
  const hatte = S.stand_id && (S.zugang || {})[S.stand_id] === today();
  S.zugang = st.zugang || {};
  if (hatte && needsCode(S.stand_id)) ui.msg = 'Freischaltung beendet.';
  if (S.stand_id && !stand()) S.stand_id = null;
}

async function loadImages() {
  if (DEMO || !D || loadImages.running) return;
  loadImages.running = true;
  try {
    const want = { bilder: new Map(), info: new Map() };
    const liste = S.stand_id ? sortimentFor(stand()) : [];
    liste.forEach(p => {
      if (p.bild && (!IMG['bilder:' + p.bild] || IMG['bilder:' + p.bild].t !== p.bild_t)) want.bilder.set(p.bild, p.bild_t);
      (p.info || []).forEach(i => { if (i.typ === 'bild' && (!IMG['info:' + i.name] || IMG['info:' + i.name].t !== i.t)) want.info.set(i.name, i.t); });
    });
    for (const ordner of ['bilder', 'info']) {
      const names = [...want[ordner].keys()];
      for (let i = 0; i < names.length; i += 8) {
        const r = await api({ aktion: 'dateien', ordner, namen: names.slice(i, i + 8).join('|') });
        if (!r.ok) break;
        let neu = 0;
        for (const [n, f] of Object.entries(r.dateien || {})) {
          if (!f.data) continue;
          const v = { t: f.t, url: 'data:' + f.mime + ';base64,' + f.data };
          IMG[ordner + ':' + n] = v; IDB.put(ordner + ':' + n, v); neu++;
        }
        if (neu) softRender(true);
      }
    }
  } catch (e) { /* später erneut */ } finally { loadImages.running = false; }
}

/* ---------- Symbole ---------- */
const svg = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I = {
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>', 2.2),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>', 2.4),
  netz: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="15" width="3.6" height="5" rx="1"/><rect x="8.5" y="11" width="3.6" height="9" rx="1"/><rect x="14" y="7" width="3.6" height="13" rx="1"/><rect x="19.5" y="3" width="3.6" height="17" rx="1" opacity=".55"/></svg>',
  netzAus: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="15" width="3.6" height="5" rx="1"/><rect x="8.5" y="11" width="3.6" height="9" rx="1" opacity=".35"/><rect x="14" y="7" width="3.6" height="13" rx="1" opacity=".35"/><path d="M15 3l7 7M22 3l-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 2.2),
  bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  cart: svg('<path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>'),
  receipt: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  box: svg('<path d="m3 7 9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2.2),
  chart: svg('<path d="M5 20V10M12 20V4M19 20v-7"/>', 2.2),
  pin: svg('<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.6 3.5 5.2"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6.5 8-6.5s7 2.5 8 6.5"/>'),
  cal: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>', 2.2),
  tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  send: svg('<path d="M3 11 21 3l-8 18-2-8z"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  euro: svg('<path d="M17 6a7 7 0 1 0 0 12M4 10h9M4 14h9"/>'),
  check: svg('<path d="m5 12 5 5 9-10"/>', 2.4),
  out: svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
  back: svg('<path d="m15 5-7 7 7 7"/>', 2.4),
  down: svg('<path d="m6 9 6 6 6-6"/>', 2.4),
  sync: svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M4 4v4h4M20 20v-4h-4"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 1.6)
};

/* ---------- Rahmen ---------- */
const app = document.getElementById('app');
const ladeHtml = '<p class="center"><span class="spin"></span></p>';
const listeLeer = t => `<p class="empty">${esc(t)}</p>`;

/* Verbindungsanzeige: Balken wie beim Handyempfang, Zahl = noch nicht übertragene Einträge */
function chipHtml() {
  const n = S.queue.length, off = !online();
  const label = off ? 'Offline' + (n ? ', ' + n + ' wartend' : '') : n ? n + ' werden übertragen' : 'Verbunden, alles übertragen';
  return `<button class="netz${off ? ' off' : n ? ' wait' : ''}${net.syncing ? ' busy' : ''}" id="chip" data-go="abgleich" aria-label="${label}" title="${label}">${off ? I.netzAus : I.netz}${n ? `<span class="nz num">${n}</span>` : ''}</button>`;
}
function paintChip() {
  const c = document.getElementById('chip');
  if (!c) return;
  c.outerHTML = chipHtml();
  const n = document.getElementById('chip'); if (n) n.addEventListener('click', () => go('abgleich'));
}
function softRender(changed) {
  const ae = document.activeElement;
  const tippt = ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && ae.id !== 'c-in' && ae.id !== 'q';
  const form = (ui.page && P[ui.page] && P[ui.page].form) || (ui.overlay && OV[ui.overlay] && OV[ui.overlay].form);
  if (!changed || tippt || form) return paintChip();
  render();
}

function render() {
  save();
  app.className = 'gross-' + (S.anzeige || 1);
  const t = einladungToken();
  if (t && !S.user) return renderRegistrierung(t);
  if (!S.user) return renderStart();
  if (S.user.status === 'wartet') return renderWartet();
  if (S.user.status === 'gesperrt') return renderInfo('Zugang gesperrt');
  if (!D) return renderErsteDaten();
  if (S.stand_id && !stand()) S.stand_id = null;
  if (ui.page && (!P[ui.page] || (P[ui.page].stand && !S.stand_id))) ui.page = null;

  const keep = sel => { const el = app.querySelector(sel); return el ? [el.scrollTop, el.scrollLeft] : null; };
  const pos = { gw: keep('#gw'), chips: keep('.filters .chips'), pb: keep('#pb'), page: render.page, dr: keep('.drawer .dbody'), sb: keep('.sheet .body'), ov: render.ov };

  let main, bindMain;
  if (ui.page) { [main, bindMain] = seite(ui.page); }
  else if (!S.stand_id) { [main, bindMain] = seite('staende'); }
  else if (needsCode(S.stand_id) && !S.nachtrag) { [main, bindMain] = codeAnsicht(); }
  else { [main, bindMain] = kasse(); }

  const st = stand(), m = marktVon(st);
  app.innerHTML = `<header class="top">
      <button class="logo" data-home aria-label="Zur Kasse"><img src="icon-192.png" alt=""></button>
      <button class="where" data-ort aria-label="${esc(ortZiel()[1])}">
        <small>${esc(m ? m.name : S.user.name)}</small><span>${esc(st ? st.name : 'Stand wählen')}</span></button>
      ${chipHtml()}
      ${rang() >= 2 ? `<button class="iconbtn bellbtn${hinweisZahl() ? ' neu' : ''}" data-go="hinweise" aria-label="${hinweisZahl() ? hinweisZahl() + ' Nachrichten' : 'Nachrichten'}">${I.bell}${hinweisZahl() ? `<span class="badge">${hinweisZahl()}</span>` : ''}</button>` : ''}
      <button class="iconbtn${ui.drawer ? ' auf' : ''}" data-burger aria-label="${ui.drawer ? 'Menü schließen' : 'Menü'}" aria-expanded="${ui.drawer}">${ui.drawer ? I.x : I.menu}</button>
    </header>
    ${main}
    ${ui.drawer ? drawerHtml() : ''}`;
  if (!ui.drawer) ui.drawerShown = false;
  bindMain(app);
  app.querySelector('[data-home]').addEventListener('click', home);
  app.querySelector('[data-ort]').addEventListener('click', () => { const z = ortZiel()[0]; z ? go(z) : home(); });
  app.querySelector('[data-burger]').addEventListener('click', () => { ui.drawer = !ui.drawer; if (ui.drawer && !ui.acc) ui.acc = accFuer(ui.page); render(); });
  app.querySelectorAll('.top [data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  if (ui.drawer) bindDrawer();
  renderSheet();
  const restore = (sel, v) => { const el = app.querySelector(sel); if (el && v) { el.scrollTop = v[0]; el.scrollLeft = v[1]; } };
  restore('#gw', pos.gw); restore('.filters .chips', pos.chips); restore('.drawer .dbody', pos.dr);
  if (pos.page === ui.page) restore('#pb', pos.pb);
  if (pos.ov === ui.overlay) restore('.sheet .body', pos.sb);
  render.page = ui.page; render.ov = ui.overlay;
}

/* Tipp auf Markt/Stand oben: führt je nach Rolle an die passende Stelle */
function ortZiel() {
  if (!S.stand_id) return [null, 'Stand wählen'];
  if (rang() >= 3) return ['struktur', 'Märkte & Stände'];
  if (leitet()) return ['standedit', 'Stand einrichten'];
  return ['schichten', 'Meine Schichten'];
}

/* Seite: Kopf mit Titel (und Zurück bei Unterseiten), Inhalt, feste Leiste unten */
function seite(name) {
  const p = P[name];
  const titel = typeof p.titel === 'function' ? p.titel() : p.titel;
  const eltern = p.eltern && (typeof p.eltern === 'function' ? p.eltern() : p.eltern);
  const leiste = p.leiste ? p.leiste() : '';
  const html = `<section class="page" aria-label="${esc(titel)}">
      <div class="phead">${eltern ? `<button class="pback" data-back aria-label="Zurück">${I.back}</button>` : ''}<h1>${esc(titel)}</h1>${p.kopf ? p.kopf() : ''}</div>
      <div class="pbody" id="pb">${p.body()}</div>
      ${leiste ? `<div class="pbar">${leiste}</div>` : ''}
    </section>`;
  return [html, root => {
    const s = root.querySelector('.page');
    const b = s.querySelector('[data-back]'); if (b) b.addEventListener('click', () => go(eltern, { zurueck: true }));
    s.querySelectorAll('[data-go]').forEach(x => x.addEventListener('click', () => go(x.dataset.go)));
    if (p.bind) p.bind(s);
  }];
}

function go(name, data) {
  ui.drawer = false; ui.confirm = null;
  if (OV[name]) { if (OV[name].open) OV[name].open(data); ui.overlay = name; return render(); }
  if (!P[name]) return;
  if (P[name].stand && !S.stand_id) name = 'staende';
  ui.overlay = null;
  const vorher = ui.page;
  ui.page = name;
  if (P[name].open) P[name].open(data);
  if (vorher !== name) { try { history.pushState({ page: name }, ''); } catch (e) {} }
  render();
  const pb = app.querySelector('#pb'); if (pb && vorher !== name) pb.scrollTop = 0;
}
function home() { ui.drawer = false; ui.overlay = null; ui.confirm = null; if (ui.page) { ui.page = null; try { history.pushState({ page: null }, ''); } catch (e) {} } render(); }

let toastTimer = null;
function toast(msg) {
  ui.toast = msg;
  const alt = app.querySelector('.toast'); if (alt) alt.remove();
  app.insertAdjacentHTML('beforeend', `<div class="toast anim" role="status">${msg}</div>`);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = null; const t = app.querySelector('.toast'); if (t) t.remove(); }, 2800);
}

/* ---------- Seitenleiste ---------- */
function eintrag(name, ic, text, badge) {
  return `<button class="ditem${ui.page === name || (!ui.page && name === 'kasse') ? ' aktiv' : ''}" data-dgo="${name}"><span class="ic">${ic}</span><span>${esc(text)}</span>${badge ? `<span class="dbadge">${badge}</span>` : ''}</button>`;
}
/* Seitenleiste: Bereich der eigenen Rolle oben und offen, Tieferes darunter zum Aufklappen */
function gruppen() {
  const l = leitet(), mitStand = !!S.stand_id, r = rang();
  const verkauf = [mitStand && ['kasse', I.cart, 'Kasse'], ['bons', I.receipt, 'Meine Bons & Storno'], mitStand && ['verfuegbarkeit', I.box, l ? 'Verfügbarkeit' : 'Ausverkauft melden'], ['schichten', I.clock, 'Meine Schichten']].filter(Boolean);
  const stl = [l && ['plan', I.cal, 'Personalplanung'], ['personal', I.users, 'Personalverwaltung'], l && ['uebersicht', I.chart, 'Umsatz heute'],
    l && ['standbons', I.receipt, 'Bons & Storno des Stands'], l && ['nachtrag', I.plus, 'Nachtrag erfassen'], l && ['standedit', I.edit, 'Stand einrichten']].filter(Boolean);
  const mkt = [['struktur', I.pin, 'Märkte & Stände'], ['produkte', I.tag, 'Produkte'], ['kategorien', I.list, 'Kategorien'], ['personen', I.users, 'Personen & Rollen'], ['rueckmeldungen', I.chat, 'Rückmeldungen']];
  if (r >= 4) mkt.push(['einstellungen', I.gear, 'Einstellungen']);
  if (r <= 1) return [{ titel: 'Verkauf & Schichten', items: verkauf }];
  if (r === 2) return [{ titel: 'Standleitung · ' + (standName() || 'kein Stand'), items: stl }, { acc: 'verkauf', titel: 'Verkauf & Schichten', ic: I.cart, items: verkauf }];
  return [{ titel: r >= 4 ? 'Admin & Marktleitung' : 'Marktleitung', items: mkt }, { acc: 'standleitung', titel: 'Standleitung', ic: I.user, items: stl }, { acc: 'verkauf', titel: 'Verkauf & Schichten', ic: I.cart, items: verkauf }];
}
function accFuer(page) { if (!page) return null; const g = gruppen().find(x => x.acc && x.items.some(i => i[0] === page)); return g ? g.acc : null; }
function drawerHtml() {
  const st = stand();
  const standListe = MAERKTE().map(m => ({ m, st: STAENDE().filter(s => s.markt_id === m.markt_id) })).filter(x => x.st.length);
  const anim = !ui.drawerShown; ui.drawerShown = true;
  return `<div class="dscrim${anim ? ' anim' : ''}" data-dscrim><nav class="drawer" aria-label="Menü">
    <div class="dhead"><b>${esc(S.user.name)}</b><small>${esc(role())}</small></div>
    <div class="dbody">
      <div class="dacc${ui.acc === 'stand' ? ' offen' : ''}">
        <button class="dacchead stand" data-acc="stand"><span class="ic">${I.pin}</span><span><small>Stand</small>${esc(st ? st.name : 'wählen')}</span>${I.down}</button>
        ${ui.acc === 'stand' ? `<div class="daccbody">${standListe.map(x => `<div class="dmarkt">${esc(x.m.name)}</div>${x.st.map(s => `<button class="ditem${s.stand_id === S.stand_id ? ' aktiv' : ''}" data-stand="${esc(s.stand_id)}"><span class="ic">${leitet(s.stand_id) ? I.user : !needsCode(s.stand_id) ? I.check : ''}</span><span>${esc(s.name)}</span><small class="dzeit">${esc(naechsteZeit(s))}</small></button>`).join('')}`).join('')}</div>` : ''}
      </div>
      ${gruppen().map(g => g.acc
        ? (g.items.length ? `<div class="dacc${ui.acc === g.acc ? ' offen' : ''}"><button class="dacchead" data-acc="${g.acc}"><span class="ic">${g.ic}</span><span>${esc(g.titel)}</span>${I.down}</button>
            ${ui.acc === g.acc ? `<div class="daccbody">${g.items.map(i => eintrag(...i)).join('')}</div>` : ''}</div>` : '')
        : (g.items.length ? `<h4>${esc(g.titel)}</h4><div class="dsec">${g.items.map(i => eintrag(...i)).join('')}</div>` : '')).join('')}
    <div class="dfoot">
      ${eintrag('feedback', I.chat, 'Rückmeldung')}${eintrag('anzeige', I.eye, 'Anzeige')}
      <button class="ditem" data-logout><span class="ic">${I.out}</span><span>Abmelden</span></button>
      ${DEMO ? demoHtml() : ''}
      <p class="hint">Version ${APP_VERSION}</p>
    </div></div></nav></div>`;
}
function bindDrawer() {
  const sc = app.querySelector('[data-dscrim]');
  const zu = () => { ui.drawer = false; render(); };
  sc.addEventListener('click', e => { if (e.target === sc) zu(); });
  sc.querySelectorAll('[data-acc]').forEach(b => b.addEventListener('click', () => { ui.acc = ui.acc === b.dataset.acc ? null : b.dataset.acc; render(); }));
  sc.querySelectorAll('[data-dgo]').forEach(b => b.addEventListener('click', () => b.dataset.dgo === 'kasse' ? home() : go(b.dataset.dgo)));
  sc.querySelectorAll('[data-stand]').forEach(b => b.addEventListener('click', () => standWaehlen(b.dataset.stand)));
  sc.querySelector('[data-logout]').addEventListener('click', () => { if (S.queue.length && !confirmLogout()) return; logout(); });
  if (DEMO) bindDemo(sc);
}
function confirmLogout() { return window.confirm(S.queue.length + ' Einträge sind noch nicht übertragen. Sie werden weiter übertragen. Abmelden?'); }
function standWaehlen(id) {
  if (S.stand_id !== id) { S.cart = {}; ui.kat = 'Alle'; ui.q = ''; }
  S.stand_id = id; ui.drawer = false; ui.acc = null; ui.page = null; ui.overlay = null;
  render(); loadImages();
}
function demoHtml() {
  return `<div class="demo"><div class="row">Rolle<div class="seg">${Object.keys(ROLLEN).map(r => `<button data-role="${r}" aria-pressed="${role() === r}">${r.replace('leitung', '-L.')}</button>`).join('')}</div></div>
    <div class="row">Netz<div class="seg"><button data-net="1" aria-pressed="${window.DEMO_NETZ !== false}">Online</button><button data-net="0" aria-pressed="${window.DEMO_NETZ === false}">Offline</button></div></div>
    <button class="btn ghost sm" data-dreset>Demo zurücksetzen</button></div>`;
}
function bindDemo(root) {
  root.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', async () => { window.DEMO_SERVER.setRolle(S.user.benutzer_id, b.dataset.role); await sync(); render(); }));
  root.querySelectorAll('[data-net]').forEach(b => b.addEventListener('click', () => { window.DEMO_NETZ = b.dataset.net === '1'; if (window.DEMO_NETZ) net.ok = null; render(); sync(); }));
  const r = root.querySelector('[data-dreset]'); if (r) r.addEventListener('click', () => { window.DEMO_SERVER.reset(); localStorage.removeItem(KEY_STATE); lsSet(KEY_DATA, null); location.reload(); });
}

/* ---------- Fenster über der Kasse ---------- */
function renderSheet() {
  if (!ui.overlay || !OV[ui.overlay]) return;
  const o = OV[ui.overlay];
  const html = o.screen ? `<div class="screen" data-ov>${o.body()}</div>`
    : `<div class="scrim" data-scrim><section class="sheet${ui.animDone !== ui.overlay ? ' anim' : ''}" role="dialog" aria-modal="true" aria-label="${esc(o.titel())}">
      <header><h2>${esc(o.titel())}</h2><button class="close" data-close aria-label="Schließen">×</button></header>
      <div class="body">${o.body()}</div>${o.footer ? (f => f ? `<footer>${f}</footer>` : '')(o.footer()) : ''}</section></div>`;
  app.insertAdjacentHTML('beforeend', html);
  ui.animDone = ui.overlay;
  const root = app.querySelector('[data-scrim], [data-ov]');
  root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeOverlay));
  if (root.matches('[data-scrim]')) root.addEventListener('click', e => { if (e.target === root) closeOverlay(); });
  if (o.bind) o.bind(root);
}
function closeOverlay() { const o = OV[ui.overlay]; ui.overlay = (o && o.zurueck && o.zurueck()) || null; ui.confirm = null; render(); }

/* ---------- Anmeldung, Registrierung ---------- */
function einladungToken() {
  const m = /[?&#]e=([A-Za-z0-9]+)/.exec(location.search + location.hash);
  return m ? m[1] : null;
}
const loginKopf = () => `<img class="corner" src="logo.png" alt="Pfadfinderbund Süd"><h1 class="apptitle">${esc(E().app_titel)}</h1>`;
function renderStart(err) {
  app.innerHTML = `<div class="screen"><form class="start login" id="reg" novalidate>
    ${loginKopf()}
    ${ui.loginMsg ? `<p class="info-msg">${esc(ui.loginMsg)}</p>` : ''}
    <div class="field"><label for="r-name">Name</label><input id="r-name" autocomplete="username" autocapitalize="words"></div>
    <div class="field"><label for="r-pin">PIN</label><input id="r-pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6"></div>
    ${err ? `<p class="err">${esc(err)}</p>` : ''}
    <button class="btn wide${ui.busy ? ' busy' : ''}" type="submit" ${ui.busy ? 'disabled' : ''}>Anmelden</button>
    ${DEMO ? '<p class="hint center">Demo · Fritz, Anna, Ben · PIN beliebig</p>' : ''}
  </form></div>`;
  document.getElementById('reg').addEventListener('submit', e => {
    e.preventDefault();
    if (ui.busy) return;
    login(document.getElementById('r-name').value.trim().replace(/\s+/g, ' '), document.getElementById('r-pin').value.trim());
  });
}
async function login(name, pin) {
  if (name.length < 2) return renderStart('Bitte Namen eingeben.');
  if (!/^\d{4,6}$/.test(pin)) return renderStart('PIN: 4–6 Ziffern.');
  ui.busy = true; renderStart();
  document.getElementById('r-name').value = name;
  let r;
  try { r = await api({ aktion: 'anmelden', name, pin }, true); }
  catch (e) { ui.busy = false; return renderStart('Kein Netz.'); }
  ui.busy = false;
  if (!r.ok) return renderStart(r.fehler);
  if (!r.benutzer.status) return renderStart('Schnittstelle ist noch Version 1.x');
  angemeldet(r.benutzer);
}
function angemeldet(b) {
  ui.loginMsg = null;
  S = Object.assign(defaultState(), keepDevice());
  S.user = { benutzer_id: b.benutzer_id, name: b.name, rolle: b.rolle, status: b.status };
  D = null; lsSet(KEY_DATA, null);
  Object.assign(ui, { page: null, drawer: false, acc: null, overlay: null });
  if (einladungToken()) history.replaceState(null, '', location.pathname);
  save(); render(); sync();
}
function logout() { S = Object.assign(defaultState(), keepDevice()); D = null; lsSet(KEY_DATA, null); Object.assign(ui, { page: null, drawer: false, acc: null, overlay: null }); render(); }

async function renderRegistrierung(token, err) {
  if (!renderRegistrierung.info || renderRegistrierung.info.token !== token) {
    app.innerHTML = `<div class="screen"><div class="start login">${loginKopf()}${ladeHtml}</div></div>`;
    let r;
    try { r = await api({ aktion: 'einladung_info', token }); } catch (e) { r = { ok: false, fehler: 'Kein Netz.' }; }
    renderRegistrierung.info = { token, r };
  }
  const r = renderRegistrierung.info.r;
  if (!r.ok) {
    app.innerHTML = `<div class="screen"><div class="start login">${loginKopf()}<p class="err">${esc(r.fehler)}</p><button class="btn ghost wide" id="zl">Zur Anmeldung</button></div></div>`;
    document.getElementById('zl').addEventListener('click', () => { history.replaceState(null, '', location.pathname); renderRegistrierung.info = null; render(); });
    return;
  }
  app.innerHTML = `<div class="screen"><form class="start login" id="rf" novalidate>
    ${loginKopf()}
    <div class="field"><label>Name</label><input value="${esc(r.name)}" readonly></div>
    <div class="field"><label for="p1">PIN wählen (4–6 Ziffern)</label><input id="p1" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
    <div class="field"><label for="p2">PIN wiederholen</label><input id="p2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
    ${err ? `<p class="err">${esc(err)}</p>` : ''}
    <button class="btn wide${ui.busy ? ' busy' : ''}" type="submit" ${ui.busy ? 'disabled' : ''}>Registrieren</button>
  </form></div>`;
  document.getElementById('rf').addEventListener('submit', async e => {
    e.preventDefault();
    if (ui.busy) return;
    const p1 = document.getElementById('p1').value.trim(), p2 = document.getElementById('p2').value.trim();
    if (!/^\d{4,6}$/.test(p1)) return renderRegistrierung(token, 'PIN: 4–6 Ziffern.');
    if (p1 !== p2) return renderRegistrierung(token, 'PINs stimmen nicht überein.');
    ui.busy = true; renderRegistrierung(token);
    let res;
    try { res = await api({ aktion: 'registrieren', token, pin: p1 }, true); } catch (x) { res = { ok: false, fehler: 'Kein Netz.' }; }
    ui.busy = false;
    if (!res.ok) return renderRegistrierung(token, res.fehler);
    renderRegistrierung.info = null;
    angemeldet(res.benutzer);
  });
}
function renderWartet() {
  app.innerHTML = `<div class="screen"><div class="start login">${loginKopf()}
    <p class="info-msg">${esc(S.user.name)} · wartet auf Freigabe</p>
    <button class="btn wide${net.syncing ? ' busy' : ''}" id="wp" ${net.syncing ? 'disabled' : ''}>Erneut prüfen</button>
    <div class="whoami"><span>${esc(S.user.name)}</span><button class="mini-btn" id="lo">Abmelden</button></div></div></div>`;
  document.getElementById('wp').addEventListener('click', () => sync());
  document.getElementById('lo').addEventListener('click', logout);
}
function renderInfo(text) {
  app.innerHTML = `<div class="screen"><div class="start"><h1>${esc(text)}</h1><button class="btn ghost wide" id="lo">Abmelden</button></div></div>`;
  document.getElementById('lo').addEventListener('click', logout);
}
function renderErsteDaten() {
  app.innerHTML = `<div class="screen"><div class="start">${loginKopf()}
    ${net.syncing || (!S.letzterFehler && !S.letzterAbgleich) ? ladeHtml : `<p class="err">${esc(S.letzterFehler || 'Keine Daten')}</p><button class="btn wide" id="rt">Erneut</button>`}
    <div class="whoami"><span>${esc(S.user.name)}</span><button class="mini-btn" id="lo">Abmelden</button></div></div></div>`;
  const rt = document.getElementById('rt'); if (rt) rt.addEventListener('click', () => sync());
  document.getElementById('lo').addEventListener('click', logout);
}

/* ---------- Stand wählen (Startseite ohne Stand) ---------- */
function naechsteZeit(st) {
  const t = today();
  const z = (st.standzeiten || []).find(x => x.datum >= t);
  return z ? (z.datum === t ? 'heute ' : fmtDate(z.datum) + ' ') + z.von + '–' + z.bis : '';
}
P.staende = {
  titel: 'Stand wählen',
  body: () => {
    const gruppen = MAERKTE().map(m => ({ m, st: STAENDE().filter(s => s.markt_id === m.markt_id) })).filter(g => g.st.length);
    if (!gruppen.length) return listeLeer('Kein Stand');
    return gruppen.map(g => `<div class="mgroup"><h3>${esc(g.m.name)}</h3>${g.st.map(s => `<button class="mbtn" data-stand="${esc(s.stand_id)}" aria-current="${s.stand_id === S.stand_id}">
        <b>${esc(s.name)}</b><span class="muted">${esc(naechsteZeit(s))}</span>
        ${leitet(s.stand_id) ? '<span class="pill s" style="align-self:flex-start">Leitung</span>' : !needsCode(s.stand_id) ? '<span class="pill ok" style="align-self:flex-start">freigeschaltet</span>' : ''}
      </button>`).join('')}</div>`).join('');
  },
  bind: root => root.querySelectorAll('[data-stand]').forEach(b => b.addEventListener('click', () => standWaehlen(b.dataset.stand)))
};

/* ---------- Code ---------- */
function codeAnsicht() {
  const err = ui.msg; ui.msg = null;
  const meine = (D.schichten || []).filter(s => s.benutzer_id === S.user.benutzer_id && s.stand_id === S.stand_id && s.datum >= today() && s.status === 'geplant');
  const html = `<section class="page"><div class="pbody"><form class="start" id="codeform" novalidate>
    <h1>${esc(standName(S.stand_id))}</h1>
    <div class="field"><label for="c-in">Code der Standleitung</label>
      <input id="c-in" class="codein num" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000 000"></div>
    ${err || ui.codeErr ? `<p class="err">${esc(err || ui.codeErr)}</p>` : ''}
    <button class="btn wide" type="submit">Freischalten</button>
    ${meine.length ? `<p class="muted center">Deine Schicht: ${meine.slice(0, 2).map(s => (s.datum === today() ? 'heute' : fmtDate(s.datum)) + ' ' + s.von + '–' + s.bis).join(', ')}</p>` : ''}
    <button class="btn ghost wide" type="button" data-go="schichten">Meine Schichten</button>
  </form></div></section>`;
  return [html, root => {
    const inp = root.querySelector('#c-in');
    if (!ui.drawer && !ui.overlay) inp.focus();
    root.querySelector('#codeform').addEventListener('submit', e => { e.preventDefault(); tue(e.submitter || root.querySelector('#codeform [type=submit]'), () => redeem(inp.value.replace(/\D/g, ''))); });
    root.querySelector('[data-go="schichten"]').addEventListener('click', () => go('schichten'));
  }];
}
async function redeem(code) {
  ui.codeErr = null;
  if (code.length !== 6) { ui.codeErr = '6 Ziffern.'; return render(); }
  let r;
  try { r = await api({ aktion: 'code_einloesen', code, stand_id: S.stand_id }, true); } catch (e) { r = { ok: false, fehler: 'Kein Netz.' }; }
  if (!r.ok) { ui.codeErr = r.fehler; return render(); }
  S.zugang[S.stand_id] = r.datum || today();
  render(); toast('Freigeschaltet');
  sync();
}

/* ---------- Kasse ---------- */
function kasse() {
  const st = stand();
  const sortiment = sortimentFor(st);
  const cats = [...new Set(sortiment.map(p => p.kategorie))];
  if (ui.kat !== 'Alle' && !cats.includes(ui.kat)) ui.kat = 'Alle';
  let items = sortiment.filter(p => availOf(st.stand_id, p.produkt_id) !== 'nicht_da');
  const q = ui.q.trim().toLowerCase();
  if (q) items = items.filter(p => p.name.toLowerCase().includes(q));
  else if (ui.kat !== 'Alle') items = items.filter(p => p.kategorie === ui.kat);
  let grid = '', last = null;
  const grouped = !q && ui.kat === 'Alle' && cats.length > 1;
  for (const p of items) {
    if (grouped && p.kategorie !== last) { grid += `<div class="grouphead">${esc(p.kategorie)}</div>`; last = p.kategorie; }
    const n = S.cart[p.produkt_id] || 0, pr = preis(p, st);
    const out = availOf(st.stand_id, p.produkt_id) === 'ausverkauft';
    const src = p.bild ? imgUrl('bilder', p.bild) : '';
    const info = p.bild || p.beschreibung || (p.info && p.info.length);
    grid += `<div class="cell"><button class="tile${n ? ' in' : ''}${out ? ' out' : ''}" data-p="${esc(p.produkt_id)}" aria-label="${esc(p.name)}, ${eur(pr)}${n ? ', ' + n + ' im Warenkorb' : ''}${out ? ', ausverkauft' : ''}">
      <span class="pic" style="background:${esc(kat(p.kategorie).farbe || '#5E6A61')}">${src ? `<img src="${src}" alt="">` : esc(initials(p.name))}${out ? '<span class="tag">ausverkauft</span>' : ''}</span>
      ${n ? `<span class="qty num">${n}</span>` : ''}
      <span class="tx"><span class="nm">${esc(p.name)}</span><span class="pr num${pr < 0 ? ' neg' : ''}">${eur(pr)}</span></span>
    </button>${info ? `<button class="info" data-info="${esc(p.produkt_id)}" aria-label="Infos zu ${esc(p.name)}">i</button>` : ''}${n ? `<button class="tiledel" data-tdel="${esc(p.produkt_id)}" aria-label="${esc(p.name)} entfernen">${I.trash}</button>` : ''}</div>`;
  }
  if (!items.length) grid = listeLeer(q ? 'Nichts gefunden' : 'Keine Produkte');
  const total = cartTotal(), count = cartCount(), payout = total < 0;
  const ausserhalb = !S.nachtrag && !inStandzeit(st);
  const html = `
  ${S.nachtrag ? `<div class="banner"><span>Nachtrag · ${fmtTime(S.nachtrag.zeit)}</span><button data-endnt>Beenden</button></div>` : ''}
  ${ausserhalb ? '<div class="banner">Außerhalb der Standzeit</div>' : ''}
  <div class="filters">
    <label class="search">${I.search}<input id="q" type="search" placeholder="Suchen" value="${esc(ui.q)}" aria-label="Produkt suchen"></label>
    <div class="chips" role="toolbar" aria-label="Kategorien">${['Alle', ...cats].map(c => `<button class="chip" data-k="${esc(c)}" aria-pressed="${!q && ui.kat === c}">${esc(c)}</button>`).join('')}</div>
  </div>
  <div class="gridwrap" id="gw"><div class="grid">${grid}</div></div>
  <div class="bar">
    <button class="sum${payout ? ' payout' : ''}" data-cart ${count ? '' : 'disabled'}>
      <small>${payout ? 'Auszahlung · ' : ''}${count} Artikel</small>
      <b class="num">${payout ? '↑ ' + eur(-total) : eur(total)}</b>
    </button>
    <button class="btn${payout && !S.nachtrag ? ' payout' : ''}" data-pay ${count ? '' : 'disabled'}>${S.nachtrag ? 'Speichern' : payout ? 'Auszahlen' : 'Kassieren'}</button>
  </div>`;
  return [html, root => {
    const qi = root.querySelector('#q');
    qi.addEventListener('input', () => { ui.q = qi.value; const pos = qi.selectionStart; render(); const n = document.getElementById('q'); n.focus(); n.setSelectionRange(pos, pos); });
    root.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { ui.kat = b.dataset.k; ui.q = ''; render(); document.getElementById('gw').scrollTop = 0; }));
    root.querySelectorAll('.tile').forEach(t => {
      let timer = null, long = false;
      const pid = t.dataset.p;
      t.addEventListener('pointerdown', () => { long = false; timer = setTimeout(() => { long = true; change(pid, -1); }, 480); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => t.addEventListener(ev, () => clearTimeout(timer)));
      t.addEventListener('contextmenu', e => e.preventDefault());
      t.addEventListener('click', () => { if (long) { long = false; return; } change(pid, +1); });
    });
    root.querySelectorAll('[data-info]').forEach(b => b.addEventListener('click', () => go('info', b.dataset.info)));
    root.querySelectorAll('[data-tdel]').forEach(b => b.addEventListener('click', () => { delete S.cart[b.dataset.tdel]; render(); }));
    root.querySelector('[data-cart]').addEventListener('click', () => go('cart'));
    root.querySelector('[data-pay]').addEventListener('click', () => S.nachtrag ? saveBon() : go('pay'));
    const nt = root.querySelector('[data-endnt]'); if (nt) nt.addEventListener('click', () => { S.nachtrag = null; S.cart = {}; render(); });
  }];
}
function change(pid, d) {
  if (d > 0 && availOf(S.stand_id, pid) === 'ausverkauft') return toast('Ausverkauft');
  const n = Math.max(0, (S.cart[pid] || 0) + d);
  if (n) S.cart[pid] = n; else delete S.cart[pid];
  render();
}

function linesHtml() {
  return `<div class="lines">${cartLines().map(l => `<div class="line">
    <div class="n"><b>${esc(l.p.name)}</b><small class="num">${l.menge} × ${eur(l.einzel)}</small></div>
    <div class="step"><button data-dec="${esc(l.p.produkt_id)}" aria-label="weniger">−</button><span class="num">${l.menge}</span><button data-inc="${esc(l.p.produkt_id)}" aria-label="mehr">+</button></div>
    <div class="ls num${l.summe < 0 ? ' neg' : ''}">${eur(l.summe)}</div>
    <button class="del" data-del="${esc(l.p.produkt_id)}" aria-label="entfernen">${I.trash}</button></div>`).join('')}</div>`;
}
function bindLines(root) {
  root.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => { S.cart[b.dataset.inc] = (S.cart[b.dataset.inc] || 0) + 1; render(); }));
  root.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.dec; S.cart[id] = (S.cart[id] || 0) - 1; if (S.cart[id] <= 0) delete S.cart[id]; if (!cartCount()) ui.overlay = null; render(); }));
  root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { delete S.cart[b.dataset.del]; if (!cartCount()) ui.overlay = null; render(); }));
}

OV.cart = {
  titel: () => 'Warenkorb',
  body: () => { const t = cartTotal(); return cartLines().length ? linesHtml() + `<div class="line" style="border:0"><div class="n"><b>${t < 0 ? 'Auszahlen' : 'Summe'}</b></div><div class="ls num${t < 0 ? ' neg' : ''}" style="font-size:20px">${eur(Math.abs(t))}</div></div>` : listeLeer('Leer'); },
  footer: () => `<button class="btn ghost" data-x="clear">Leeren</button><button class="btn${cartTotal() < 0 && !S.nachtrag ? ' payout' : ''}" style="flex:1" data-x="topay">${S.nachtrag ? 'Speichern' : cartTotal() < 0 ? 'Auszahlen' : 'Kassieren'}</button>`,
  bind: root => {
    bindLines(root);
    root.querySelector('[data-x="clear"]').addEventListener('click', () => { S.cart = {}; ui.overlay = null; render(); });
    root.querySelector('[data-x="topay"]').addEventListener('click', () => { if (S.nachtrag) saveBon(); else go('pay'); });
  }
};

OV.pay = {
  open: () => { ui.payGiven = null; ui.payParts = []; ui.payInput = ''; },
  titel: () => cartTotal() < 0 ? 'Auszahlen' : 'Kassieren',
  body: () => {
    const total = cartTotal(), payout = total < 0, given = ui.payGiven;
    let change = '';
    if (!payout && given != null) change = given < total ? `<div class="change short"><small>Es fehlen</small><b class="num">${eur(total - given)}</b></div>` : `<div class="change"><small>Rückgeld</small><b class="num">${eur(given - total)}</b></div>`;
    const notes = (E().schnellbetraege || [1, 2, 5, 10, 20, 50]).slice().sort((a, b) => a - b);
    return `${linesHtml()}
      ${payout ? `<div class="due payout"><small>Auszahlen</small><b class="num">↑ ${eur(-total)}</b></div>`
      : `<div class="due"><small>Zu zahlen</small><b class="num">${eur(total)}</b></div>
      <div class="field"><label>Gegeben</label>
        <div class="cash">${notes.map(v => { const c = ui.payParts.filter(x => x === v * 100).length; return `<button data-g="${v * 100}">${v} €${c ? `<span class="cnt">${c}×</span>` : ''}</button>`; }).join('')}</div>
        <div class="givenrow"><span class="num">${given == null ? '' : '<b>' + eur(given) + '</b>' + (ui.payParts.length > 1 ? ' (' + ui.payParts.map(x => x / 100 + ' €').join(' + ') + ')' : '')}</span>
          <span><button class="mini-btn" data-x="passend">Passend</button>${given != null ? '<button class="mini-btn" data-x="reset">Zurücksetzen</button>' : ''}</span></div></div>
      <div class="field"><input id="g-in" inputmode="decimal" placeholder="Betrag" aria-label="Gegebener Betrag" value="${esc(ui.payInput)}"></div>
      ${change}`}`;
  },
  footer: () => { const t = cartTotal(), short = t >= 0 && ui.payGiven != null && ui.payGiven < t; return `<button class="btn ghost" data-close>Zurück</button><button class="btn${t < 0 ? ' payout' : ''}" style="flex:1" data-x="save" ${short ? 'disabled' : ''}>${t < 0 ? 'Ausgezahlt' : 'Bezahlt'}</button>`; },
  bind: root => {
    bindLines(root);
    root.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { ui.payParts.push(+b.dataset.g); ui.payGiven = ui.payParts.reduce((a, x) => a + x, 0); ui.payInput = ''; render(); }));
    const gi = root.querySelector('#g-in');
    if (gi) gi.addEventListener('input', () => { ui.payInput = gi.value; const v = parseFloat(gi.value.replace(',', '.')); ui.payGiven = isNaN(v) ? null : Math.round(v * 100); ui.payParts = []; const pos = gi.selectionStart; render(); const n = app.querySelector('#g-in'); n.focus(); n.setSelectionRange(pos, pos); });
    const x = (k, f) => { const b = root.querySelector(`[data-x="${k}"]`); if (b) b.addEventListener('click', f); };
    x('passend', () => { ui.payGiven = cartTotal(); ui.payParts = []; ui.payInput = ''; render(); });
    x('reset', () => { ui.payGiven = null; ui.payParts = []; ui.payInput = ''; render(); });
    x('save', saveBon);
  }
};

function saveBon() {
  const lines = cartLines(); if (!lines.length) return;
  const total = cartTotal(), nt = S.nachtrag;
  const bon = {
    bon_id: uid(), zeit: nt ? nt.zeit : new Date().toISOString(), stand_id: nt ? nt.stand_id : S.stand_id,
    benutzer_id: S.user.benutzer_id, geraet_id: S.geraet_id, anzahl_artikel: cartCount(), summe: total,
    gegeben: nt ? null : (total < 0 ? 0 : (ui.payGiven == null ? total : ui.payGiven)),
    rueckgeld: nt ? null : (total < 0 ? -total : (ui.payGiven == null ? 0 : ui.payGiven - total)),
    status: 'ok', art: nt ? 'nachtrag' : 'kasse',
    positionen: lines.map((l, i) => ({ pos_nr: i + 1, produkt_id: l.p.produkt_id, produktname: l.p.name, kategorie: l.p.kategorie, einzelpreis: l.einzel, menge: l.menge, zeilensumme: l.summe }))
  };
  S.bons.push(bon);
  S.cart = {}; ui.overlay = null;
  enqueue('Bon', bon);
  render();
  if (nt) toast(`Nachtrag ${eur(total)}`);
  else if (total < 0) toast(`<b class="neg-t">↑ ${eur(-total)} auszahlen</b>`);
  else toast(bon.rueckgeld ? `Rückgeld <b>${eur(bon.rueckgeld)}</b>` : 'Gespeichert');
}

/* Hinweis, wenn die Aufgabe Standleitung nicht zur Rolle passt */
OV.rolle = {
  zurueck: () => null,
  titel: () => 'Rolle passt nicht',
  body: () => `<p style="margin:0">${ui.rollePerson ? `<b>${esc(ui.rollePerson.name)}</b> hat die Rolle ${esc(ui.rollePerson.rolle)}.` : 'Ein Platzhalter hat noch keine Rolle.'} Die Aufgabe Standleitung braucht mindestens die Rolle Standleitung.</p>`,
  footer: () => `<button class="btn ghost" data-close>Schließen</button>${rang() >= 3 && ui.rollePerson ? '<button class="btn" style="flex:1" data-x="rollen">Zur Rollenverteilung</button>' : ''}`,
  bind: root => { const b = root.querySelector('[data-x="rollen"]'); if (b) b.addEventListener('click', () => { ui.overlay = null; go('personen', { offen: ui.rollePerson.benutzer_id }); }); }
};

/* ---------- Info und Bild ---------- */
OV.info = {
  open: pid => { ui.info = pid; },
  titel: () => (prod(ui.info) || {}).name || '',
  body: () => {
    const p = prod(ui.info); if (!p) return '';
    const out = availOf(S.stand_id, p.produkt_id) === 'ausverkauft';
    const pics = [];
    if (p.bild) pics.push({ src: imgUrl('bilder', p.bild), name: p.name });
    (p.info || []).filter(i => i.typ === 'bild').forEach(i => pics.push({ src: imgUrl('info', i.name), name: i.name }));
    return `<div class="infohead"><b class="num">${eur(preis(p))}</b><span class="muted">${esc(p.kategorie)}${out ? ' · ausverkauft' : ''}</span></div>
      ${pics.length ? `<div class="gallery">${pics.map(x => `<figure>${x.src ? `<button class="zoom" data-zoom="${esc(x.src)}"><img src="${x.src}" alt="${esc(x.name)}"></button>` : `<div class="ph">${ladeHtml}</div>`}</figure>`).join('')}</div>` : ''}
      ${p.beschreibung ? `<p class="desc">${esc(p.beschreibung)}</p>` : ''}
      ${(p.info || []).filter(i => i.typ === 'dok').map(d => d.url ? `<a class="doc" href="${esc(d.url)}" target="_blank" rel="noopener"><span class="ic">PDF</span><span>${esc(d.name)}</span></a>` : `<div class="doc"><span class="ic">PDF</span><span>${esc(d.name)}</span></div>`).join('')}`;
  },
  footer: () => `<button class="btn ghost" data-close>Schließen</button>${rang() >= 3 ? '<button class="btn blue" data-x="edit">Bearbeiten</button>' : ''}<button class="btn" style="flex:1" data-x="add" ${availOf(S.stand_id, ui.info) === 'ausverkauft' ? 'disabled' : ''}>+ 1</button>`,
  bind: root => {
    root.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => { ui.zoom = b.dataset.zoom; go('bild'); }));
    const add = root.querySelector('[data-x="add"]'); if (add) add.addEventListener('click', () => { ui.overlay = null; change(ui.info, +1); });
    const ed = root.querySelector('[data-x="edit"]'); if (ed) ed.addEventListener('click', () => { ui.overlay = null; openProdukt(ui.info, null); });
  }
};
OV.bild = {
  screen: true, zurueck: () => 'info',
  body: () => `<div class="zoomview"><img src="${ui.zoom}" alt=""><button class="close big" data-close aria-label="Schließen">×</button></div>`
};

/* ---------- Start ---------- */
let wakeLock = null;
async function keepAwake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {} }

window.addEventListener('DOMContentLoaded', async () => {
  if (!DEMO) Object.assign(IMG, await IDB.all());
  if (S.user && !S.user.status) S.user = null;
  if (D && !Array.isArray(D.hinweise)) D.hinweise = [];
  try { history.replaceState({ page: null }, ''); } catch (e) {}
  render();
  if (S.user || S.queue.length) sync();
  const every = () => Math.max(20, (E().abgleich_sekunden || 60)) * 1000;
  (function loop() { setTimeout(() => { if (!document.hidden) sync(); loop(); }, every()); })();
  window.addEventListener('online', () => { net.ok = null; sync(); });
  window.addEventListener('offline', () => { net.ok = false; paintChip(); });
  window.addEventListener('popstate', e => {
    if (ui.drawer) { ui.drawer = false; return render(); }
    if (ui.overlay) { ui.overlay = null; return render(); }
    const p = e.state && e.state.page;
    ui.page = p && P[p] ? p : null; render();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { keepAwake(); sync(); } });
  keepAwake();
  if ('serviceWorker' in navigator && !DEMO) { try { navigator.serviceWorker.register('sw.js'); } catch (e) {} }
});
