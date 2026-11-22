/* Weihnachtsmarkt-Kasse · App · Version 1.2
   Läuft im Browser, speichert alles auf dem Gerät und gleicht sich mit der
   Google-Schnittstelle ab, sobald Netz da ist. Ohne API_URL: Demo-Modus. */
'use strict';

const CFG = window.KASSE_CONFIG || {};
const API = (CFG.API_URL || '').trim();
const DEMO = !API;
const KEY_STATE = 'wmk-v1', KEY_DATA = 'wmk-stamm-v1';
const APP_VERSION = '1.2';

/* =====================================================================
   Kleine Hilfen
   ===================================================================== */
function uid() { try { return crypto.randomUUID(); } catch (e) { return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12); } }
const eur = c => (c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmtTime = iso => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtClock = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
const today = () => new Date().toLocaleDateString('sv-SE');
const fmtCode = c => String(c).slice(0, 3) + ' ' + String(c).slice(3);
const initials = n => n.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('Speichern fehlgeschlagen', e); } }

/* ---------- IndexedDB für Bilder ---------- */
const IDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('wmk-dateien', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('d');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  }));
  const tx = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction('d', mode); const out = fn(t.objectStore('d')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }));
  return {
    put: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {}),
    all: () => open().then(db => new Promise(res => {
      const out = {}; const t = db.transaction('d', 'readonly'); const c = t.objectStore('d').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); };
      c.onerror = () => res(out);
    })).catch(() => ({}))
  };
})();
const IMG = {};   // 'bilder:name' / 'info:name' -> { t, url }

/* =====================================================================
   Zustand
   ===================================================================== */
const defaultState = () => ({
  user: null, geraet_id: uid(), markt_id: null,
  bons: [], queue: [], fehlerlog: [], cart: {}, nachtrag: null,
  zugang: {}, demo: { online: true, codes: [], users: [] },
  letzterAbgleich: null, letzterFehler: null
});
let S = Object.assign(defaultState(), lsGet(KEY_STATE) || {});
let D = lsGet(KEY_DATA) || (DEMO ? window.KASSE_DEMO.stammdaten : null);   // Stammdaten
let ui = { kat: 'Alle', q: '', overlay: null, payGiven: null, payParts: [], payInput: '', confirmStorno: null, confirmRevoke: null, availQ: '', toast: null, toastNew: false, info: null, personal: null, uebersicht: null, busy: false, animDone: null, users: null, userEdit: null, prodList: null, prodQ: '', edit: null, msg: null };
let net = { syncing: false, ok: DEMO ? true : null };

function save() { S.bons = S.bons.slice(-300); S.fehlerlog = (S.fehlerlog || []).slice(-30); lsSet(KEY_STATE, S); }

const E = () => (D && D.einstellungen) || { schnellbetraege: [1, 2, 5, 10, 20, 50], storno_anzahl: 2, abgleich_sekunden: 60, app_titel: 'Weihnachtsmarkt-Kasse' };
const KATS = () => (D && D.kategorien) || [];
const PRODS = () => (D && D.produkte) || [];
const MAERKTE = () => (D && D.maerkte) || [];
const kat = name => KATS().find(k => k.kategorie === name) || { farbe: '#5E6A61', sortierung: 99 };
const markt = () => MAERKTE().find(m => m.markt_id === S.markt_id);
const prod = pid => PRODS().find(p => p.produkt_id === pid);
const standName = mid => { const m = MAERKTE().find(x => x.markt_id === mid); return m ? m.name.split(' – ').pop() : mid; };
const role = () => (S.user && S.user.rolle) || 'Helfer';
const isLead = () => role() === 'Standleitung' || role() === 'Admin';
const isAdmin = () => role() === 'Admin';
const online = () => DEMO ? S.demo.online : net.ok !== false;
const needsCode = mid => role() === 'Helfer' && (S.zugang || {})[mid] !== today();

function availOf(mid, pid) {
  for (let i = S.queue.length - 1; i >= 0; i--) {   // noch nicht übertragene Änderung gilt sofort
    const q = S.queue[i];
    if (q.typ === 'Verfuegbarkeit' && q.data.markt_id === mid && q.data.produkt_id === pid) return q.data.status;
  }
  const v = (D && D.verfuegbarkeit || []).find(x => x.markt_id === mid && x.produkt_id === pid);
  return v ? v.status : 'verfuegbar';
}

function sortimentFor(m) {
  if (!m) return [];
  return PRODS().filter(p => m.kategorien === 'ALLE' || m.kategorien.includes(p.kategorie))
    .sort((a, b) => kat(a.kategorie).sortierung - kat(b.kategorie).sortierung || a.sortierung - b.sortierung);
}
const marketCats = m => [...new Set(sortimentFor(m).map(p => p.kategorie))];

function cartLines() {
  return Object.entries(S.cart).filter(([pid, q]) => q > 0 && prod(pid)).map(([pid, menge]) => {
    const p = prod(pid); return { p, menge, summe: p.preis * menge };
  });
}
const cartTotal = () => cartLines().reduce((a, l) => a + l.summe, 0);
const cartCount = () => cartLines().reduce((a, l) => a + l.menge, 0);
const hasInfo = p => !!(p.beschreibung || (p.info && p.info.length));
const imgUrl = (ordner, name) => { const x = IMG[ordner + ':' + name]; return x ? x.url : (DEMO && window.KASSE_DEMO.bilder[name]) || ''; };

/* =====================================================================
   Verbindung zur Google-Schnittstelle
   ===================================================================== */
async function api(params, post) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), post ? 30000 : 25000);
  try {
    let res;
    if (post) {
      res = await fetch(API, { method: 'POST', body: JSON.stringify(params), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctl.signal, redirect: 'follow' });
    } else {
      const qs = new URLSearchParams(params).toString();
      res = await fetch(API + (API.includes('?') ? '&' : '?') + qs, { signal: ctl.signal, redirect: 'follow' });
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    net.ok = true;
    return j;
  } catch (e) {
    if (e.name === 'AbortError' || e instanceof TypeError || /HTTP/.test(e.message)) net.ok = false;
    throw e;
  } finally { clearTimeout(timer); }
}

function enqueue(typ, data) {
  S.queue.push({ id: uid(), typ, data, benutzer_id: S.user ? S.user.benutzer_id : '', t: Date.now() });
  save();
  clearTimeout(enqueue.t);
  enqueue.t = setTimeout(sync, 1200);
}

async function sync() {
  if (DEMO) return demoSync();
  const angemeldet = S.user && (S.user.mitPin || DEMO);
  if (net.syncing || (!angemeldet && !S.queue.length)) return;
  net.syncing = true; paintChip();
  let changed = false;
  try {
    while (S.queue.length) {
      const batch = S.queue.slice(0, 40);
      const r = await api({ aktion: 'sync', geraet_id: S.geraet_id, benutzer_id: angemeldet ? S.user.benutzer_id : '', eintraege: batch }, true);
      if (!r.ok) throw new Error(r.fehler || 'Abgleich abgelehnt');
      const done = new Set(r.erledigt || []);
      (r.fehler || []).forEach(f => { done.add(f.id); S.fehlerlog.push({ zeit: new Date().toISOString(), typ: f.typ, fehler: f.fehler }); });
      S.queue = S.queue.filter(q => !done.has(q.id));
      save();
      if (!done.size) break;
    }
    if (!angemeldet) return;
    const st = await api({ aktion: 'stammdaten', benutzer_id: S.user.benutzer_id, geraet_id: S.geraet_id, hash: (D && D.hash) || '' });
    if (!st.ok) throw new Error(st.fehler || 'Stammdaten nicht lesbar');
    const vorher = JSON.stringify([D, S.user, S.zugang]);
    applyStamm(st);
    changed = vorher !== JSON.stringify([D, S.user, S.zugang]);
    S.letzterAbgleich = new Date().toISOString(); S.letzterFehler = null;
    save();
    loadImages();
  } catch (e) {
    S.letzterFehler = String(e.message || e); save();
  } finally {
    net.syncing = false;
    softRender(changed || ['queue', 'bons'].includes(ui.overlay));
  }
}

function setD(st) {
  if (st.unveraendert && D) return;
  D = { einstellungen: st.einstellungen, kategorien: st.kategorien, produkte: st.produkte, maerkte: st.maerkte, verfuegbarkeit: st.verfuegbarkeit, stand: st.stand, hash: st.hash };
  lsSet(KEY_DATA, D);
}
function applyStamm(st) {
  setD(st);
  if (st.benutzer && st.benutzer.abgemeldet) {
    ui.loginMsg = 'Auf einem anderen Gerät angemeldet.';
    const keep = { geraet_id: S.geraet_id, queue: S.queue, fehlerlog: S.fehlerlog, demo: S.demo, letzterAbgleich: S.letzterAbgleich };
    S = Object.assign(defaultState(), keep); ui.overlay = null;
    return;
  }
  if (st.benutzer) {
    S.user.rolle = st.benutzer.rolle; S.user.gesperrt = !st.benutzer.aktiv;
  } else if (S.user && !S.queue.some(q => q.typ === 'Benutzer')) {
    S.user = null;   // im Sheet nicht mehr vorhanden: neu anmelden
    return;
  }
  const hatte = S.markt_id && (S.zugang || {})[S.markt_id] === today();
  S.zugang = st.zugang || {};   // die Schnittstelle weiß, welche Freischaltungen gelten
  if (hatte && role() === 'Helfer' && S.zugang[S.markt_id] !== today()) ui.msg = 'Freischaltung entzogen.';
  if (S.markt_id && !MAERKTE().some(m => m.markt_id === S.markt_id)) S.markt_id = null;
}

async function loadImages() {
  if (DEMO || !D || loadImages.running) return;
  loadImages.running = true;
  try {
    const want = { bilder: new Map(), info: new Map() };
    const m = markt();
    const ordered = m ? [...sortimentFor(m), ...PRODS()] : PRODS();
    ordered.forEach(p => {
      if (p.bild && (!IMG['bilder:' + p.bild] || IMG['bilder:' + p.bild].t !== p.bild_t)) want.bilder.set(p.bild, p.bild_t);
      (p.info || []).forEach(i => { if (i.typ === 'bild' && (!IMG['info:' + i.name] || IMG['info:' + i.name].t !== i.t)) want.info.set(i.name, i.t); });
    });
    for (const ordner of ['bilder', 'info']) {
      const names = [...want[ordner].keys()];
      for (let i = 0; i < names.length; i += 8) {
        const chunk = names.slice(i, i + 8);
        const r = await api({ aktion: 'dateien', ordner, namen: chunk.join('|') });
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
  } catch (e) { /* nächster Abgleich versucht es wieder */ }
  finally { loadImages.running = false; }
}

/* Demo: Übertragung nur simuliert */
function demoSync() {
  if (!S.demo.online || !S.queue.length || net.syncing) return;
  net.syncing = true; paintChip();
  setTimeout(() => {
    net.syncing = false;
    if (S.demo.online) { S.queue.filter(q => q.typ === 'Verfuegbarkeit').forEach(q => setDemoAvail(q.data)); S.queue = []; S.letzterAbgleich = new Date().toISOString(); save(); }
    softRender(false);
  }, 1000);
}
function setDemoAvail(d) {
  D.verfuegbarkeit = (D.verfuegbarkeit || []).filter(v => !(v.markt_id === d.markt_id && v.produkt_id === d.produkt_id));
  if (d.status !== 'verfuegbar') D.verfuegbarkeit.push({ markt_id: d.markt_id, produkt_id: d.produkt_id, status: d.status });
}

/* =====================================================================
   Darstellung
   ===================================================================== */
const app = document.getElementById('app');
const I = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m3 7 9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.6 3.5 5.2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>'
};

function chipHtml() {
  const n = S.queue.length;
  if (!online()) return `<span class="sync wait" id="chip">Offline${n ? ' · ' + n + ' warten' : ''}</span>`;
  if (net.syncing || n) return `<span class="sync wait" id="chip">Übertrage${n ? ' ' + n : ''} …</span>`;
  return `<span class="sync" id="chip">Alles übertragen</span>`;
}
function paintChip() { const c = document.getElementById('chip'); if (c) c.outerHTML = chipHtml(); }

/* nach einem Abgleich nur neu zeichnen, wenn sich etwas geändert hat – und niemanden beim Tippen stören */
function softRender(changed) {
  const ae = document.activeElement;
  const tippt = ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && ae.id !== 'c-in';
  if (!changed || tippt || ['produkt', 'markt-edit', 'einstellungen'].includes(ui.overlay) || ui.katEdit) return paintChip();
  render();
}

function render() {
  save();
  if (!D) return renderFirstLoad();
  if (!S.user || (!S.user.mitPin && !DEMO)) return renderStart();
  if (S.user.gesperrt) return renderBlocked();
  if (!S.markt_id) { renderMarktwahl(false); if (ui.overlay === 'markt-edit') { renderOverlay(); ui.animDone = ui.overlay; } return; }
  if (needsCode(S.markt_id)) { ui.overlay = null; const m = ui.msg; ui.msg = null; return renderCode(m); }
  const keep = sel => { const el = app.querySelector(sel); return el ? [el.scrollTop, el.scrollLeft] : null; };
  const pos = { gw: keep('#gw'), chips: keep('.chips'), body: keep('.sheet .body'), ov: ui.overlay };
  renderKasse();
  if (ui.overlay) renderOverlay();
  ui.animDone = ui.overlay;
  const restore = (sel, v) => { const el = app.querySelector(sel); if (el && v) { el.scrollTop = v[0]; el.scrollLeft = v[1]; } };
  restore('#gw', pos.gw); restore('.chips', pos.chips);
  if (pos.ov === ui.overlay) restore('.sheet .body', pos.body);
  if (ui.toast) app.insertAdjacentHTML('beforeend', `<div class="toast${ui.toastNew ? ' anim' : ''}" role="status">${ui.toast}</div>`);
  ui.toastNew = false;
}

function renderFirstLoad() {
  app.innerHTML = `<div class="screen"><div class="start">
    <img src="logo.png" alt="Pfadfinderbund Süd">
    <h1>Keine Verbindung</h1>
    ${S.letzterFehler ? `<p class="err">${esc(S.letzterFehler)}</p>` : ''}
    <button class="btn wide" id="retry">${net.syncing ? 'Lädt …' : 'Erneut versuchen'}</button>
  </div></div>`;
  document.getElementById('retry').addEventListener('click', firstLoad);
}
async function firstLoad() {
  net.syncing = true; renderFirstLoad();
  try {
    const st = await api({ aktion: 'stammdaten', geraet_id: S.geraet_id, benutzer_id: S.user ? S.user.benutzer_id : '' });
    if (!st.ok) throw new Error(st.fehler);
    if (!S.user) setD(st); else applyStamm(st);
    S.letzterFehler = null;
  } catch (e) { S.letzterFehler = String(e.message || e); }
  net.syncing = false; render(); loadImages();
}

function renderBlocked() {
  app.innerHTML = `<div class="screen"><div class="start"><h1>Zugang gesperrt</h1><button class="btn ghost wide" id="lo">Abmelden</button></div></div>`;
  document.getElementById('lo').addEventListener('click', logout);
}

/* ---------- Anmeldung mit PIN ---------- */
function renderStart(err) {
  app.innerHTML = `
  <div class="screen"><form class="start login" id="reg" novalidate>
    <img class="corner" src="logo.png" alt="Pfadfinderbund Süd">
    <h1 class="apptitle">${esc(E().app_titel)}</h1>
    ${ui.loginMsg ? `<p class="info-msg">${esc(ui.loginMsg)}</p>` : ''}
    <div class="field"><label for="r-name">Name</label><input id="r-name" autocomplete="username" autocapitalize="words"></div>
    <div class="field"><label for="r-pin">PIN (4–6 Ziffern)</label><input id="r-pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6"></div>
    ${err ? `<p class="err">${esc(err)}</p>` : ''}
    <button class="btn wide" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '…' : 'Anmelden'}</button>
    ${DEMO ? '<p class="hint center">Demo</p>' : ''}
  </form></div>`;
  document.getElementById('reg').addEventListener('submit', e => {
    e.preventDefault();
    login(document.getElementById('r-name').value.trim().replace(/\s+/g, ' '), document.getElementById('r-pin').value.trim());
  });
}

async function login(name, pin) {
  if (name.length < 2) return renderStart('Bitte Namen eingeben.');
  if (!/^\d{4,6}$/.test(pin)) return renderStart('PIN: 4–6 Ziffern.');
  let benutzer;
  if (DEMO) {
    const vorh = S.demo.users.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (vorh && vorh.pin !== pin) return renderStart('Name vergeben oder PIN falsch.');
    benutzer = vorh || { benutzer_id: uid(), name, rolle: S.demo.users.some(x => x.rolle === 'Admin') ? 'Helfer' : 'Admin', aktiv: true, pin };
    if (!vorh) S.demo.users.push(benutzer);
  } else {
    ui.busy = true; renderStart();
    try {
      const r = await api({ aktion: 'anmelden', name, pin, geraet_id: S.geraet_id }, true);
      ui.busy = false;
      if (!r.ok) return renderStart(r.fehler);
      benutzer = r.benutzer;
    } catch (e) {
      ui.busy = false;
      return renderStart('Keine Verbindung. Zum Anmelden braucht das Gerät Netz.');
    }
  }
  ui.loginMsg = null;
  S.user = { benutzer_id: benutzer.benutzer_id, name: benutzer.name, rolle: benutzer.rolle, gesperrt: !benutzer.aktiv, mitPin: true };
  S.markt_id = null; S.zugang = {}; S.cart = {}; S.bons = [];
  save(); render(); sync();
}

function logout() {
  const keep = { geraet_id: S.geraet_id, queue: S.queue, fehlerlog: S.fehlerlog, demo: S.demo, letzterAbgleich: S.letzterAbgleich };
  S = Object.assign(defaultState(), keep);
  ui.overlay = null;
  render();
}

/* ---------- Marktwahl ---------- */
function renderMarktwahl(asOverlay) {
  const list = MAERKTE().filter(m => isAdmin() || !m.datum_bis || m.datum_bis >= today());
  const html = `
  <div class="start">
    <h1>Stand wählen</h1>
    <div class="mlist">
      ${list.length ? list.map(m => `<button class="mbtn" data-m="${esc(m.markt_id)}" aria-current="${m.markt_id === S.markt_id}">
        <b>${esc(m.name)}</b>${role() === 'Helfer' && !needsCode(m.markt_id) ? '<span class="pill ok" style="align-self:flex-start">freigeschaltet</span>' : ''}
        <span class="muted">${esc(m.ort)}${m.datum_von ? ' · ' + fmtDate(m.datum_von) + (m.datum_bis && m.datum_bis !== m.datum_von ? '–' + fmtDate(m.datum_bis) : '') : ''}</span>
        <span class="cats">${(m.kategorien === 'ALLE' ? ['Alle Kategorien'] : m.kategorien).map(k => `<span>${esc(k)}</span>`).join('')}</span>
      </button>`).join('') : `<p class="empty">Kein aktiver Stand</p>${isAdmin() ? '<button class="btn wide" id="mk-new">Stand anlegen</button>' : ''}`}
    </div>
    ${asOverlay ? '<button class="btn ghost wide" data-close>Abbrechen</button>' : ''}
    ${asOverlay ? '' : `<div class="whoami"><span>${esc(S.user.name)}</span><button class="mini-btn" id="lo">Abmelden</button></div>`}
  </div>`;
  if (asOverlay) return html;
  app.innerHTML = `<div class="screen">${html}</div>`;
  bindMarkets(app);
  document.getElementById('lo').addEventListener('click', logout);
  const mk = document.getElementById('mk-new');
  if (mk) mk.addEventListener('click', () => openMarkt(null));
}
function bindMarkets(root) {
  root.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
    if (S.markt_id !== b.dataset.m) { S.cart = {}; ui.kat = 'Alle'; ui.q = ''; }
    S.markt_id = b.dataset.m; ui.overlay = null; render(); loadImages();
  }));
}

/* ---------- Einmalcode ---------- */
function renderCode(err) {
  app.innerHTML = `
  <div class="screen"><form class="start" id="codeform" novalidate>
    <h1>${esc(standName(S.markt_id))}</h1>
    <div class="field"><label for="c-in">Code der Standleitung</label>
      <input id="c-in" class="codein num" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000 000"></div>
    ${err ? `<p class="err">${esc(err)}</p>` : ''}
    <button class="btn wide" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '…' : 'Freischalten'}</button>
    <button class="btn ghost wide" type="button" id="c-back">Anderer Stand</button>
    <div class="whoami"><span>${esc(S.user.name)}</span><button class="mini-btn" type="button" id="lo">Abmelden</button></div>
    ${DEMO ? '<button class="btn blue wide" type="button" id="c-demo">Demo: als Standleitung</button>' : ''}
  </form></div>`;
  const inp = document.getElementById('c-in');
  inp.focus();
  document.getElementById('codeform').addEventListener('submit', e => { e.preventDefault(); redeem(inp.value.replace(/\D/g, '')); });
  document.getElementById('c-back').addEventListener('click', () => { S.markt_id = null; S.cart = {}; render(); });
  document.getElementById('lo').addEventListener('click', logout);
  const demoBtn = document.getElementById('c-demo');
  if (demoBtn) demoBtn.addEventListener('click', () => { S.user.rolle = 'Standleitung'; const du = S.demo.users.find(x => x.benutzer_id === S.user.benutzer_id); if (du) du.rolle = 'Standleitung'; render(); });
}

async function redeem(code) {
  if (code.length !== 6) return renderCode('6 Ziffern.');
  if (DEMO) {
    if (!S.demo.online) return renderCode('Kein Netz.');
    const c = S.demo.codes.find(x => x.code === code);
    if (!c) return renderCode('Code unbekannt.');
    if (c.markt_id !== S.markt_id) return renderCode('Code gilt für einen anderen Stand.');
    if (c.datum !== today()) return renderCode('Code abgelaufen.');
    if (c.eingeloest_am && c.geraet_id !== S.geraet_id) return renderCode('Code schon benutzt.');
    Object.assign(c, { eingeloest_name: S.user.name, geraet_id: S.geraet_id, eingeloest_am: new Date().toISOString() });
    S.zugang[S.markt_id] = today();
    return toast('Freigeschaltet');
  }
  ui.busy = true; renderCode();
  try {
    if (S.queue.some(q => q.typ === 'Benutzer')) await sync();   // Anmeldung muss zuerst ankommen
    const r = await api({ aktion: 'code_einloesen', code, markt_id: S.markt_id, benutzer_id: S.user.benutzer_id, geraet_id: S.geraet_id }, true);
    ui.busy = false;
    if (!r.ok) return renderCode(r.fehler);
    S.zugang[S.markt_id] = r.datum || today();
    toast('Freigeschaltet');
    sync();
  } catch (e) {
    ui.busy = false;
    renderCode('Kein Netz.');
  }
}

/* ---------- Kasse ---------- */
function renderKasse() {
  const m = markt();
  const cats = marketCats(m);
  if (ui.kat !== 'Alle' && !cats.includes(ui.kat)) ui.kat = 'Alle';
  let items = sortimentFor(m).filter(p => availOf(m.markt_id, p.produkt_id) !== 'nicht_da');
  const q = ui.q.trim().toLowerCase();
  if (q) items = items.filter(p => p.name.toLowerCase().includes(q));
  else if (ui.kat !== 'Alle') items = items.filter(p => p.kategorie === ui.kat);

  let gridHtml = '';
  let lastKat = null;
  const grouped = !q && ui.kat === 'Alle' && cats.length > 1;
  for (const p of items) {
    if (grouped && p.kategorie !== lastKat) { gridHtml += `<div class="grouphead">${esc(p.kategorie)}</div>`; lastKat = p.kategorie; }
    const n = S.cart[p.produkt_id] || 0;
    const out = availOf(m.markt_id, p.produkt_id) === 'ausverkauft';
    const src = p.bild ? imgUrl('bilder', p.bild) : '';
    gridHtml += `<div class="cell"><button class="tile${n ? ' in' : ''}${out ? ' out' : ''}" data-p="${esc(p.produkt_id)}" aria-label="${esc(p.name)}, ${eur(p.preis)}${n ? ', ' + n + ' im Warenkorb' : ''}${out ? ', ausverkauft' : ''}">
      <span class="pic" style="background:${esc(kat(p.kategorie).farbe || '#5E6A61')}">${src ? `<img src="${src}" alt="">` : esc(initials(p.name))}${out ? '<span class="tag">ausverkauft</span>' : ''}</span>
      ${n ? `<span class="qty num">${n}</span>` : ''}
      <span class="tx"><span class="nm">${esc(p.name)}</span><span class="pr num${p.preis < 0 ? ' neg' : ''}">${eur(p.preis)}</span></span>
    </button>${hasInfo(p) ? `<button class="info" data-info="${esc(p.produkt_id)}" aria-label="Infos zu ${esc(p.name)}">i</button>` : ''}</div>`;
  }
  if (!items.length) gridHtml = `<p class="empty">${q ? 'Nichts gefunden' : 'Keine Produkte'}</p>`;

  const total = cartTotal(), count = cartCount();
  const payout = total < 0;
  const parts = m.name.split(' – ');
  app.innerHTML = `
  <header class="top">
    <button class="where" data-act="markt" aria-label="Markt wechseln">
      <small>${esc(S.user.name)}${role() !== 'Helfer' ? ' · ' + esc(role()) : ''}${parts.length > 1 ? ' · ' + esc(parts[0]) : ''}</small>
      <span>${esc(parts.pop())}</span>
    </button>
    ${chipHtml()}
    <button class="iconbtn" data-act="menu" aria-label="Menü öffnen">${I.menu}</button>
  </header>
  ${S.nachtrag ? `<div class="banner"><span>Nachtrag · ${esc(standName(S.nachtrag.markt_id))} · ${fmtTime(S.nachtrag.zeit)}</span><button data-act="endNachtrag">Beenden</button></div>` : ''}
  <div class="filters">
    <label class="search">${I.search}<input id="q" type="search" placeholder="Produkt suchen" value="${esc(ui.q)}" aria-label="Produkt suchen"></label>
    <div class="chips" role="toolbar" aria-label="Kategorien">
      ${['Alle', ...cats].map(c => `<button class="chip" data-k="${esc(c)}" aria-pressed="${!q && ui.kat === c}">${esc(c)}</button>`).join('')}
    </div>
  </div>
  <div class="gridwrap" id="gw"><div class="grid">${gridHtml}</div></div>
  <div class="bar">
    <button class="sum${payout ? ' payout' : ''}" data-act="cart" ${count ? '' : 'disabled'} aria-label="Warenkorb öffnen">
      <small>${payout ? 'Auszahlung · ' : ''}${count} Artikel</small>
      <b class="num">${payout ? '↑ ' + eur(-total) : eur(total)}</b>
    </button>
    <button class="btn${payout && !S.nachtrag ? ' payout' : ''}" data-act="pay" ${count ? '' : 'disabled'}>${S.nachtrag ? 'Speichern' : payout ? 'Auszahlen' : 'Kassieren'}</button>
  </div>`;
  bindKasse();
}

function bindKasse() {
  const qi = document.getElementById('q');
  qi.addEventListener('input', () => { ui.q = qi.value; const pos = qi.selectionStart; render(); const n = document.getElementById('q'); n.focus(); n.setSelectionRange(pos, pos); });
  app.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { ui.kat = b.dataset.k; ui.q = ''; render(); document.getElementById('gw').scrollTop = 0; }));
  app.querySelectorAll('.tile').forEach(t => {
    let timer = null, long = false;
    const pid = t.dataset.p;
    t.addEventListener('pointerdown', () => { long = false; timer = setTimeout(() => { long = true; change(pid, -1); }, 480); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => t.addEventListener(ev, () => clearTimeout(timer)));
    t.addEventListener('contextmenu', e => e.preventDefault());
    t.addEventListener('click', () => { if (long) { long = false; return; } change(pid, +1); });
  });
  app.querySelectorAll('[data-info]').forEach(b => b.addEventListener('click', () => { ui.info = b.dataset.info; ui.overlay = 'info'; render(); }));
  app.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => act(b.dataset.act)));
}

function change(pid, d) {
  if (d > 0 && availOf(S.markt_id, pid) === 'ausverkauft') { toast('Ausverkauft'); return; }
  const n = Math.max(0, (S.cart[pid] || 0) + d);
  if (n) S.cart[pid] = n; else delete S.cart[pid];
  render();
}

function act(a) {
  if (a === 'menu') ui.overlay = 'menu';
  else if (a === 'markt') ui.overlay = 'markt';
  else if (a === 'cart') ui.overlay = 'cart';
  else if (a === 'pay') { if (S.nachtrag) return saveBon(); ui.overlay = 'pay'; ui.payGiven = null; ui.payParts = []; ui.payInput = ''; }
  else if (a === 'endNachtrag') { S.nachtrag = null; S.cart = {}; render(); return; }
  render();
}

/* ---------- Overlays ---------- */
function sheet(title, body, footer) {
  return `<div class="scrim" data-scrim><section class="sheet${ui.animDone !== ui.overlay ? ' anim' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><button class="close" data-close aria-label="Schließen">×</button></header>
    <div class="body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</section></div>`;
}

function renderOverlay() {
  const o = ui.overlay;
  let html = '';
  if (o === 'markt') html = `<div class="screen" data-ov>${renderMarktwahl(true)}</div>`;
  else if (o === 'cart') html = sheet('Warenkorb', cartBody(), `<button class="btn ghost" data-x="clear">Leeren</button><button class="btn${cartTotal() < 0 && !S.nachtrag ? ' payout' : ''}" style="flex:1" data-x="topay">${S.nachtrag ? 'Nachtrag speichern' : cartTotal() < 0 ? 'Auszahlen · ' + eur(-cartTotal()) : 'Kassieren · ' + eur(cartTotal())}</button>`);
  else if (o === 'pay') html = payHtml();
  else if (o === 'menu') html = sheet('Menü', menuBody());
  else if (o === 'bons') html = sheet('Meine letzten Bons', bonsBody());
  else if (o === 'feedback') html = sheet('Rückmeldung senden', feedbackBody(), '<button class="btn wide" data-x="sendfb">Senden</button>');
  else if (o === 'avail') html = sheet('Verfügbarkeit', availBody());
  else if (o === 'nachtrag') html = sheet('Nachtrag erfassen', nachtragBody(), '<button class="btn wide blue" data-x="startnt">Weiter</button>');
  else if (o === 'stats') html = sheet('Tagesübersicht', statsBody());
  else if (o === 'personal') html = sheet('Personal · ' + standName(S.markt_id), personalBody());
  else if (o === 'queue') html = sheet('Abgleich', queueBody(), DEMO ? '' : `<button class="btn wide" data-x="syncnow" ${net.syncing ? 'disabled' : ''}>${net.syncing ? '…' : 'Jetzt abgleichen'}</button>`);
  else if (o === 'info') html = infoHtml();
  else if (o === 'logout') html = sheet('Abmelden', logoutBody());
  else if (o === 'users') html = sheet('Personen', usersBody());
  else if (o === 'verwaltung') html = sheet('Verwaltung', verwaltungBody());
  else if (o === 'kategorien') html = sheet('Kategorien', kategorienBody());
  else if (o === 'maerkte') html = sheet('Stände', maerkteBody(), '<button class="btn wide" data-x="newmarkt">Neuer Stand</button>');
  else if (o === 'markt-edit') html = sheet(ui.mEdit && ui.mEdit.markt_id ? 'Stand bearbeiten' : 'Neuer Stand', marktEditBody(), `<button class="btn ghost" data-x="marktback">Zurück</button><button class="btn" style="flex:1" data-x="savemarkt" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '…' : 'Speichern'}</button>`);
  else if (o === 'einstellungen') html = sheet('Einstellungen', einstBody(), `<button class="btn wide" data-x="saveeinst" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '…' : 'Speichern'}</button>`);
  else if (o === 'rueckmeldungen') html = sheet('Rückmeldungen', rmBody());
  else if (o === 'bonsadmin') html = sheet('Bons', bonsAdminBody());
  else if (o === 'produkte') html = sheet('Produkte', produkteBody(), '<button class="btn wide" data-x="newprod">Neues Produkt anlegen</button>');
  else if (o === 'produkt') html = sheet(ui.edit && ui.edit.produkt_id ? 'Produkt bearbeiten' : 'Neues Produkt', editBody(), `<button class="btn ghost" data-x="editback">Zurück</button><button class="btn" style="flex:1" data-x="saveprod" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '…' : 'Speichern'}</button>`);
  app.insertAdjacentHTML('beforeend', html);
  bindOverlay();
}

function linesHtml() {
  return `<div class="lines">${cartLines().map(l => `<div class="line">
    <div class="n"><b>${esc(l.p.name)}</b><small class="num">${l.menge} × ${eur(l.p.preis)}</small></div>
    <div class="step"><button data-dec="${esc(l.p.produkt_id)}" aria-label="${esc(l.p.name)}: eins weniger">−</button><span class="num">${l.menge}</span><button data-inc="${esc(l.p.produkt_id)}" aria-label="${esc(l.p.name)}: eins mehr">+</button></div>
    <div class="ls num${l.summe < 0 ? ' neg' : ''}">${eur(l.summe)}</div>
    <button class="del" data-del="${esc(l.p.produkt_id)}" aria-label="${esc(l.p.name)} entfernen">${I.trash}</button></div>`).join('')}</div>`;
}
function cartBody() {
  if (!cartLines().length) return '<p class="empty">Der Warenkorb ist leer.</p>';
  const t = cartTotal();
  return linesHtml() + `<div class="line" style="border:0"><div class="n"><b>${t < 0 ? 'Auszuzahlen' : 'Summe'}</b></div><div class="ls num${t < 0 ? ' neg' : ''}" style="font-size:20px">${eur(Math.abs(t))}</div></div>`;
}

function payHtml() {
  const total = cartTotal();
  const payout = total < 0;
  const given = ui.payGiven;
  let changeBox = '';
  if (!payout) {
    if (given == null) changeBox = '';
    else if (given < total) changeBox = `<div class="change short"><small>Es fehlen</small><b class="num">${eur(total - given)}</b></div>`;
    else changeBox = `<div class="change"><small>Rückgeld</small><b class="num">${eur(given - total)}</b></div>`;
  }
  const short = !payout && given != null && given < total;
  const notes = (E().schnellbetraege || [1, 2, 5, 10, 20, 50]).slice().sort((a, b) => a - b);
  const body = `
    ${linesHtml()}
    ${payout
      ? `<div class="due payout"><small>Auszahlen</small><b class="num">↑ ${eur(-total)}</b></div>`
      : `<div class="due"><small>Zu zahlen</small><b class="num">${eur(total)}</b></div>
    <div class="field"><label>Gegeben</label>
      <div class="cash">${notes.map(v => `<button data-g="${v * 100}">${v} €${ui.payParts.filter(x => x === v * 100).length ? `<span class="cnt">${ui.payParts.filter(x => x === v * 100).length}×</span>` : ''}</button>`).join('')}</div>
      <div class="givenrow"><span class="num">${given == null ? '' : '<b>' + eur(given) + '</b>' + (ui.payParts.length > 1 ? ' (' + ui.payParts.map(x => x / 100 + ' €').join(' + ') + ')' : '')}</span>
        <span><button class="mini-btn" data-x="passend">Passend</button>${given != null ? '<button class="mini-btn" data-x="givenreset">Zurücksetzen</button>' : ''}</span></div></div>
    <div class="field"><input id="g-in" inputmode="decimal" placeholder="Betrag" aria-label="Gegebener Betrag" value="${esc(ui.payInput)}"></div>
    ${changeBox}`}`;
  return sheet(payout ? 'Auszahlen' : 'Kassieren', body,
    `<button class="btn ghost" data-close>Zurück</button><button class="btn${payout ? ' payout' : ''}" style="flex:1" data-x="save" ${short ? 'disabled' : ''}>${payout ? 'Ausgezahlt' : 'Bezahlt'}</button>`);
}

function infoHtml() {
  const p = prod(ui.info);
  if (!p) return '';
  const out = availOf(S.markt_id, p.produkt_id) === 'ausverkauft';
  const pics = [];
  if (p.bild) pics.push({ src: imgUrl('bilder', p.bild), name: '' });
  (p.info || []).filter(i => i.typ === 'bild').forEach(i => pics.push({ src: imgUrl('info', i.name), name: i.name }));
  const docs = (p.info || []).filter(i => i.typ === 'dok');
  const missing = (p.info || []).filter(i => i.typ === 'fehlt');
  const body = `
    <div class="infohead"><b class="num">${eur(p.preis)}</b><span class="muted">${esc(p.kategorie)}${out ? ' · ausverkauft' : ''}</span></div>
    ${pics.length ? `<div class="gallery">${pics.map(x => `<figure>${x.src ? `<img src="${x.src}" alt="${esc(x.name || p.name)}">` : '<div class="ph"><span class="spin"></span></div>'}</figure>`).join('')}</div>` : ''}
    ${p.beschreibung ? `<p class="desc">${esc(p.beschreibung)}</p>` : ''}
    ${docs.map(d => d.url
      ? `<a class="doc" href="${esc(d.url)}" target="_blank" rel="noopener"><span class="ic">PDF</span><span>${esc(d.name)}</span></a>`
      : `<div class="doc"><span class="ic">PDF</span><span>${esc(d.name)}</span></div>`).join('')}
    ${missing.length && isAdmin() ? `<p class="err" style="margin:0">Fehlt: ${missing.map(m => esc(m.name)).join(', ')}</p>` : ''}`;
  return sheet(p.name, body, `<button class="btn ghost" data-close>Schließen</button>${isAdmin() ? '<button class="btn blue" data-x="editinfo">Bearbeiten</button>' : ''}<button class="btn" style="flex:1" data-x="infoadd" ${out ? 'disabled' : ''}>+ 1</button>`);
}

function menuBody() {
  const items = [
    ['bons', I.receipt, 'Letzte Bons'],
    ['feedback', I.chat, 'Rückmeldung'],
    ['stats', I.chart, 'Tagesübersicht'],
    isLead() ? ['personal', I.users, 'Personal'] : null,
    isLead() ? ['avail', I.box, 'Verfügbarkeit'] : null,
    isAdmin() ? ['verwaltung', I.key, 'Verwaltung'] : null,
    ['markt', I.pin, 'Stand wechseln'],
    ['queue', I.list, 'Abgleich'],
    ['logout', I.out, 'Abmelden']
  ].filter(Boolean);
  return `<div class="menu">${items.map(([k, ic, t]) => `<button class="item" data-go="${k}"><span class="ic">${ic}</span><span>${esc(t)}</span>${k === 'queue' && S.queue.length ? `<span class="pill q" style="margin-left:auto">${S.queue.length}</span>` : ''}</button>`).join('')}</div>
  ${DEMO ? `<div class="demo">
    <div class="row">Rolle<div class="seg">${['Helfer', 'Standleitung', 'Admin'].map(r => `<button data-role="${r}" aria-pressed="${role() === r}">${r}</button>`).join('')}</div></div>
    <div class="row">Netz<div class="seg"><button data-net="1" aria-pressed="${S.demo.online}">Online</button><button data-net="0" aria-pressed="${!S.demo.online}">Offline</button></div></div>
    <button class="btn ghost" data-x="reset">Demo zurücksetzen</button>
  </div>` : ''}
  <p class="hint">${esc(S.user.name)}<span class="role">${esc(role())}</span></p>`;
}

function verwaltungBody() {
  const items = [['produkte', I.tag, 'Produkte'], ['kategorien', I.list, 'Kategorien'], ['maerkte', I.pin, 'Stände'], ['users', I.users, 'Personen'], ['bonsadmin', I.receipt, 'Bons & Storno'], ['rueckmeldungen', I.chat, 'Rückmeldungen'], ['nachtrag', I.plus, 'Nachtrag'], ['einstellungen', I.key, 'Einstellungen']];
  return `<div class="menu">${items.map(([k, ic, t]) => `<button class="item" data-go="${k}"><span class="ic">${ic}</span><span>${esc(t)}</span></button>`).join('')}</div>`;
}

function myBons() { return S.bons.filter(b => b.benutzer_id === S.user.benutzer_id && b.art === 'kasse').sort((a, b) => b.zeit.localeCompare(a.zeit)); }
function stornoable() { return myBons().slice(0, E().storno_anzahl).filter(b => b.status === 'ok').map(b => b.bon_id); }

function bonsBody() {
  const list = myBons().slice(0, 15);
  if (!list.length) return '<p class="empty">Keine Bons</p>';
  const can = stornoable();
  return list.map(b => `<div class="card">
      <div class="hd"><b class="num${b.summe < 0 ? ' neg' : ''}">${b.summe < 0 ? 'Auszahlung ' + eur(-b.summe) : eur(b.summe)}</b><span class="pill ${b.status === 'ok' ? 'ok' : 'st'}">${b.status === 'ok' ? 'gültig' : 'storniert'}</span></div>
      <span class="muted">${fmtTime(b.zeit)} · ${esc(standName(b.markt_id))}${S.queue.some(q => q.typ === 'Bon' && q.data.bon_id === b.bon_id) ? ' · wartet' : ''}</span>
      <span class="muted">${b.positionen.map(p => p.menge + '× ' + esc(p.produktname)).join(', ')}</span>
      ${can.includes(b.bon_id) ? (ui.confirmStorno === b.bon_id
        ? `<div class="confirm">Stornieren? <button class="btn danger" style="padding:6px 12px;font-size:14px" data-storno="${b.bon_id}">Ja</button><button class="btn ghost" style="padding:6px 12px;font-size:14px" data-nostorno>Nein</button></div>`
        : `<button class="btn ghost" style="align-self:flex-start;padding:7px 14px;font-size:14px" data-askstorno="${b.bon_id}">Stornieren</button>`) : ''}
    </div>`).join('');
}

function feedbackBody() {
  return `<div class="field"><label>Art</label><div class="seg" id="fb-typ">${['Problem', 'Idee', 'Kommentar'].map((t, i) => `<button data-t="${t}" aria-pressed="${i === 0}">${t}</button>`).join('')}</div></div>
    <div class="field"><label for="fb-text">Text</label><textarea id="fb-text" rows="5"></textarea></div>`;
}

function availBody() {
  const m = markt();
  const q = ui.availQ.trim().toLowerCase();
  const list = sortimentFor(m).filter(p => !q || p.name.toLowerCase().includes(q));
  const changed = sortimentFor(m).filter(p => availOf(m.markt_id, p.produkt_id) !== 'verfuegbar').length;
  return `<p class="muted" style="margin:0">${changed ? changed + ' eingeschränkt · ' : ''}„ausverkauft“ gilt bis Tagesende</p>
    <label class="search">${I.search}<input id="aq" type="search" placeholder="Produkt suchen" value="${esc(ui.availQ)}" aria-label="Produkt suchen"></label>
    <div>${list.map(p => { const v = availOf(m.markt_id, p.produkt_id); return `<div class="availrow">
      <div class="hd"><span>${esc(p.name)}</span><span class="muted">${esc(p.kategorie)}</span></div>
      <div class="seg avail">${[['verfuegbar', 'verfügbar'], ['ausverkauft', 'ausverkauft'], ['nicht_da', 'nicht da']].map(([k, l]) => `<button data-av="${esc(p.produkt_id)}" data-v="${k}" aria-pressed="${v === k}">${l}</button>`).join('')}</div></div>`; }).join('')}</div>`;
}

function nachtragBody() {
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return `<div class="field"><label for="nt-m">Stand</label><select id="nt-m">${MAERKTE().map(m => `<option value="${esc(m.markt_id)}" ${m.markt_id === S.markt_id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="nt-z">Zeitpunkt</label><input id="nt-z" type="datetime-local" value="${now.toISOString().slice(0, 16)}"></div>`;
}

function statsBody() {
  if (isLead() && !DEMO) {
    if (!ui.uebersicht) { loadUebersicht(); return '<p class="center"><span class="spin"></span></p>'; }
    if (ui.uebersicht.fehler) return `<p class="err">${esc(ui.uebersicht.fehler)}</p>` + localStats();
    const u = ui.uebersicht;
    const rows = Object.entries(u.maerkte || {});
    const sum = rows.reduce((a, [, v]) => a + v.summe, 0), bons = rows.reduce((a, [, v]) => a + v.bons, 0);
    return `<div class="stats"><div class="stat"><small>Bons ${isAdmin() ? 'gesamt' : 'Stand'}</small><b class="num">${bons}</b></div><div class="stat"><small>Umsatz</small><b class="num">${eur(sum)}</b></div></div>
      ${isAdmin() && rows.length ? `<div class="card"><b>Je Stand</b>${rows.map(([mid, v]) => `<div class="hd"><span>${esc(standName(mid))}</span><span class="num">${v.bons} · ${eur(v.summe)}</span></div>`).join('')}</div>` : ''}
      <div class="card"><b>Top · ${esc(standName(S.markt_id))}</b>${(u.top || []).length ? u.top.map(t => `<div class="hd"><span>${esc(t.name)}</span><span class="num">${t.menge}×</span></div>`).join('') : '<span class="muted">–</span>'}</div>
      <p class="hint" style="margin:0">Stand ${fmtClock(u.geladen)}</p>`;
  }
  return localStats();
}
function localStats() {
  const bons = S.bons.filter(b => b.status === 'ok' && b.benutzer_id === S.user.benutzer_id && new Date(b.zeit).toLocaleDateString('sv-SE') === today());
  const sum = bons.reduce((a, b) => a + b.summe, 0);
  const per = {};
  bons.forEach(b => b.positionen.forEach(p => { per[p.produktname] = (per[p.produktname] || 0) + p.menge; }));
  const top = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return `<div class="stats"><div class="stat"><small>Deine Bons heute</small><b class="num">${bons.length}</b></div><div class="stat"><small>Umsatz</small><b class="num">${eur(sum)}</b></div></div>
    <div class="card"><b>Top</b>${top.length ? top.map(([n, c]) => `<div class="hd"><span>${esc(n)}</span><span class="num">${c}×</span></div>`).join('') : '<span class="muted">–</span>'}</div>`;
}
async function loadUebersicht() {
  try {
    const r = await api({ aktion: 'uebersicht', benutzer_id: S.user.benutzer_id, markt_id: S.markt_id });
    ui.uebersicht = r.ok ? Object.assign(r, { geladen: new Date().toISOString() }) : { fehler: r.fehler };
  } catch (e) { ui.uebersicht = { fehler: 'Kein Netz – nur dieses Gerät:' }; }
  if (ui.overlay === 'stats') render();
}

function personalBody() {
  let list;
  if (DEMO) list = S.demo.codes.filter(c => c.markt_id === S.markt_id && c.datum === today()).slice().reverse().map(c => ({ code: c.code, offen: !c.eingeloest_am, entzogen: !!c.entzogen_am, eingeloest_name: c.eingeloest_name, eingeloest_am: c.eingeloest_am }));
  else {
    if (!ui.personal) { loadPersonal(); return '<p class="center"><span class="spin"></span></p>'; }
    if (ui.personal.fehler) return `<p class="err">${esc(ui.personal.fehler)}</p><button class="btn ghost wide" data-x="reloadpers">Erneut</button>`;
    list = ui.personal.codes.slice().reverse();
  }
  const open = list.filter(c => c.offen && !c.entzogen);
  const used = list.filter(c => !c.offen);
  return `${open[0] ? `<div class="codebox"><small>Code · heute · 1 Gerät</small><b class="num">${fmtCode(open[0].code)}</b></div>` : ''}
    <button class="btn wide${open[0] ? ' ghost' : ''}" data-x="newcode" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '…' : open[0] ? 'Weiterer Code' : 'Code erzeugen'}</button>
    <div class="card"><b>Freigeschaltet (${used.filter(c => !c.entzogen).length})</b>
      ${used.length ? used.map(c => `<div class="person">
        <div class="hd"><span>${esc(c.eingeloest_name || 'unbekannt')}</span><span class="muted num">${c.eingeloest_am ? fmtClock(c.eingeloest_am) : ''} · Code ${fmtCode(c.code)}</span></div>
        ${c.entzogen ? '<span class="pill st" style="align-self:flex-start">entzogen</span>'
          : ui.confirmRevoke === c.code ? `<div class="confirm">Entziehen? <button class="btn danger" style="padding:6px 12px;font-size:14px" data-revoke="${c.code}">Ja</button><button class="btn ghost" style="padding:6px 12px;font-size:14px" data-norevoke>Nein</button></div>`
          : `<button class="mini-btn" style="align-self:flex-start;margin:0" data-askrevoke="${c.code}">Entziehen</button>`}
      </div>`).join('') : '<span class="muted">–</span>'}</div>
    ${open.length > 1 ? `<div class="card"><b>Offen</b>${open.map(c => `<div class="hd"><span class="num">${fmtCode(c.code)}</span><span class="pill q">offen</span></div>`).join('')}</div>` : ''}
`;
}
async function loadPersonal() {
  try {
    const r = await api({ aktion: 'personal', benutzer_id: S.user.benutzer_id, markt_id: S.markt_id });
    ui.personal = r.ok ? r : { fehler: r.fehler };
  } catch (e) { ui.personal = { fehler: 'Kein Netz.' }; }
  if (ui.overlay === 'personal') render();
}
async function newCode() {
  if (DEMO) {
    if (!S.demo.online) return toast('Kein Netz');
    let code; do { code = String(Math.floor(100000 + Math.random() * 900000)); } while (S.demo.codes.some(c => c.code === code));
    S.demo.codes.push({ code, markt_id: S.markt_id, datum: today() });
    return render();
  }
  ui.busy = true; render();
  try {
    if (S.queue.some(q => q.typ === 'Benutzer')) await sync();
    const r = await api({ aktion: 'code_erzeugen', benutzer_id: S.user.benutzer_id, markt_id: S.markt_id }, true);
    ui.busy = false;
    if (!r.ok) { toast(esc(r.fehler)); return; }
    ui.personal = null; render();
  } catch (e) { ui.busy = false; toast('Kein Netz'); }
}

function queueBody() {
  const n = S.queue.length;
  const byType = {};
  S.queue.forEach(q => { byType[q.typ] = (byType[q.typ] || 0) + 1; });
  const names = { Bon: 'Bons', Storno: 'Stornos', Benutzer: 'Anmeldung', Verfuegbarkeit: 'Verfügbarkeit', Rueckmeldung: 'Rückmeldungen' };
  return `<div class="stats"><div class="stat"><small>Wartend</small><b class="num">${n}</b></div><div class="stat"><small>Letzter Abgleich</small><b class="num" style="font-size:20px">${S.letzterAbgleich ? fmtTime(S.letzterAbgleich) : '–'}</b></div></div>
    ${n ? `<p class="muted" style="margin:0">${Object.entries(byType).map(([k, v]) => v + ' ' + (names[k] || k)).join(' · ')}</p>` : ''}
    ${!DEMO && S.letzterFehler ? `<p class="errlist">${esc(S.letzterFehler)}</p>` : ''}
    ${(S.fehlerlog || []).length ? `<div class="errlist"><b>Abgelehnt</b><br>${S.fehlerlog.slice(-5).reverse().map(f => `${fmtClock(f.zeit)} · ${esc(f.typ)}: ${esc(f.fehler)}`).join('<br>')}</div>` : ''}
    <p class="hint" style="margin:0">${DEMO ? 'Demo' : 'Gerät ' + esc(S.geraet_id.slice(0, 8))} · Version ${APP_VERSION}</p>`;
}

function logoutBody() {
  return `${S.queue.length ? `<p class="muted" style="margin:0">${S.queue.length} Einträge werden weiter übertragen.</p>` : ''}<button class="btn danger wide" data-x="logout">Abmelden</button>`;
}

function bindOverlay() {
  const root = app.querySelector('[data-scrim], [data-ov]');
  if (!root) return;
  const close = () => { ui.bList = null; ui.mList = null; ui.mEdit = null; ui.katEdit = null; ui.einst = null; ui.rmList = null; ui.overlay = null; ui.confirmStorno = null; ui.confirmRevoke = null; ui.personal = null; ui.uebersicht = null; ui.users = null; ui.userEdit = null; ui.prodList = null; ui.edit = null; render(); };
  root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  if (root.matches('[data-scrim]')) root.addEventListener('click', e => { if (e.target === root) close(); });
  if (ui.overlay === 'markt') bindMarkets(root);
  root.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => { S.cart[b.dataset.inc] = (S.cart[b.dataset.inc] || 0) + 1; render(); }));
  root.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.dec; S.cart[id] = (S.cart[id] || 0) - 1; if (S.cart[id] <= 0) delete S.cart[id]; if (!cartCount()) ui.overlay = null; render(); }));
  root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { delete S.cart[b.dataset.del]; if (!cartCount()) ui.overlay = null; render(); }));
  root.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { ui.payParts.push(+b.dataset.g); ui.payGiven = ui.payParts.reduce((a, x) => a + x, 0); ui.payInput = ''; render(); }));
  const gi = root.querySelector('#g-in');
  if (gi) gi.addEventListener('input', () => {
    ui.payInput = gi.value; const v = parseFloat(gi.value.replace(',', '.'));
    ui.payGiven = isNaN(v) ? null : Math.round(v * 100); ui.payParts = [];
    const pos = gi.selectionStart; render(); const n = app.querySelector('#g-in'); n.focus(); n.setSelectionRange(pos, pos);
  });
  root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { ui.overlay = b.dataset.go; render(); }));
  root.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => { S.user.rolle = b.dataset.role; const du = S.demo.users.find(x => x.benutzer_id === S.user.benutzer_id); if (du) du.rolle = b.dataset.role; render(); }));
  root.querySelectorAll('[data-net]').forEach(b => b.addEventListener('click', () => { S.demo.online = b.dataset.net === '1'; render(); demoSync(); }));
  root.querySelectorAll('[data-askstorno]').forEach(b => b.addEventListener('click', () => { ui.confirmStorno = b.dataset.askstorno; render(); }));
  root.querySelectorAll('[data-nostorno]').forEach(b => b.addEventListener('click', () => { ui.confirmStorno = null; render(); }));
  root.querySelectorAll('[data-storno]').forEach(b => b.addEventListener('click', () => storno(b.dataset.storno)));
  root.querySelectorAll('[data-askrevoke]').forEach(b => b.addEventListener('click', () => { ui.confirmRevoke = b.dataset.askrevoke; render(); }));
  root.querySelectorAll('[data-norevoke]').forEach(b => b.addEventListener('click', () => { ui.confirmRevoke = null; render(); }));
  root.querySelectorAll('[data-revoke]').forEach(b => b.addEventListener('click', () => revoke(b.dataset.revoke)));
  bindAdmin(root);
  bindAdmin2(root);
  root.querySelectorAll('#fb-typ button').forEach(b => b.addEventListener('click', () => root.querySelectorAll('#fb-typ button').forEach(x => x.setAttribute('aria-pressed', x === b))));
  root.querySelectorAll('[data-av]').forEach(b => b.addEventListener('click', () => setAvail(b.dataset.av, b.dataset.v)));
  const aq = root.querySelector('#aq');
  if (aq) aq.addEventListener('input', () => { ui.availQ = aq.value; const pos = aq.selectionStart; render(); const n = app.querySelector('#aq'); n.focus(); n.setSelectionRange(pos, pos); });
  root.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
    const x = b.dataset.x;
    if (x === 'clear') { S.cart = {}; ui.overlay = null; render(); }
    else if (x === 'topay') { if (S.nachtrag) saveBon(); else { ui.overlay = 'pay'; ui.payGiven = null; ui.payParts = []; ui.payInput = ''; render(); } }
    else if (x === 'save') saveBon();
    else if (x === 'passend') { ui.payGiven = cartTotal(); ui.payParts = []; ui.payInput = ''; render(); }
    else if (x === 'givenreset') { ui.payGiven = null; ui.payParts = []; ui.payInput = ''; render(); }
    else if (x === 'sendfb') sendFeedback(root);
    else if (x === 'newcode') newCode();
    else if (x === 'reloadpers') { ui.personal = null; render(); }
    else if (x === 'syncnow') { sync().then(() => { if (ui.overlay === 'queue') render(); }); render(); }
    else if (x === 'infoadd') { const pid = ui.info; ui.overlay = null; change(pid, +1); }
    else if (x === 'editinfo') openEditor(ui.info);
    else if (x === 'newprod') openEditor(null);
    else if (x === 'editback') { ui.overlay = 'produkte'; ui.edit = null; render(); }
    else if (x === 'saveprod') saveProdukt();
    else if (x === 'newmarkt') openMarkt(null);
    else if (x === 'marktback') { ui.mEdit = null; ui.overlay = S.markt_id ? 'maerkte' : null; render(); }
    else if (x === 'savemarkt') saveMarkt();
    else if (x === 'saveeinst') saveEinst(root);
    else if (x === 'newkat') { ui.katEdit = '__neu'; render(); }
    else if (x === 'savekat') saveKat(root);
    else if (x === 'cancelkat') { ui.katEdit = null; render(); }
    else if (x === 'startnt') {
      const mid = root.querySelector('#nt-m').value, z = root.querySelector('#nt-z').value;
      S.nachtrag = { markt_id: mid, zeit: new Date(z).toISOString() }; S.markt_id = mid; S.cart = {}; ui.overlay = null; ui.kat = 'Alle';
      render();
    }
    else if (x === 'logout') logout();
    else if (x === 'reset') { try { localStorage.removeItem(KEY_STATE); } catch (e) {} S = defaultState(); D = window.KASSE_DEMO.stammdaten; D.verfuegbarkeit = []; ui.overlay = null; render(); }
  }));
}

/* =====================================================================
   Standleitung: Freischaltung entziehen
   ===================================================================== */
async function revoke(code) {
  ui.confirmRevoke = null;
  if (DEMO) {
    const c = S.demo.codes.find(x => x.code === code);
    if (c) { c.entzogen_am = new Date().toISOString(); if (c.geraet_id === S.geraet_id) delete S.zugang[c.markt_id]; }
    toast('Entzogen');
    return;
  }
  try {
    const r = await api({ aktion: 'zugang_entziehen', benutzer_id: S.user.benutzer_id, code }, true);
    if (!r.ok) return toast(esc(r.fehler));
    ui.personal = null;
    toast('Entzogen');
  } catch (e) { toast('Kein Netz'); }
}

/* =====================================================================
   Admin: Kategorien, Stände, Einstellungen, Rückmeldungen
   ===================================================================== */
async function adminCall(params) {
  try { const r = await api(Object.assign({ benutzer_id: S.user.benutzer_id }, params), true); if (!r.ok) toast(esc(r.fehler)); return r; }
  catch (e) { toast('Kein Netz'); return { ok: false }; }
}

function kategorienBody() {
  const ks = KATS().slice().sort((a, b) => a.sortierung - b.sortierung);
  const form = k => `<div class="katform">
      <input id="k-name" value="${esc(k ? k.kategorie : '')}" placeholder="Name" aria-label="Name">
      <input id="k-sort" inputmode="numeric" value="${esc(k ? k.sortierung : (ks.length + 1) * 10)}" aria-label="Reihenfolge" class="small-in">
      <input id="k-farbe" type="color" value="${esc((k && k.farbe) || '#5E6A61')}" aria-label="Farbe">
      <button class="mini-btn" data-x="savekat">OK</button><button class="mini-btn" data-x="cancelkat">×</button></div>`;
  return ks.map(k => ui.katEdit === k.kategorie ? form(k)
    : `<button class="prow" data-kat="${esc(k.kategorie)}"><span class="swatch" style="background:${esc(k.farbe || '#5E6A61')}"></span><span class="pn"><b>${esc(k.kategorie)}</b></span><span class="muted num">${k.sortierung}</span></button>`).join('')
    + (ui.katEdit === '__neu' ? form(null) : '<button class="btn ghost wide" data-x="newkat">Neue Kategorie</button>');
}
async function saveKat(root) {
  const alt = ui.katEdit === '__neu' ? '' : ui.katEdit;
  const kategorie = root.querySelector('#k-name').value.trim(), sortierung = Number(root.querySelector('#k-sort').value) || 0, farbe = root.querySelector('#k-farbe').value;
  if (!kategorie) return toast('Name fehlt');
  if (DEMO) {
    if (KATS().some(k => k.kategorie.toLowerCase() === kategorie.toLowerCase() && k.kategorie !== alt)) return toast('Gibt es schon');
    if (alt) { const k = KATS().find(x => x.kategorie === alt); Object.assign(k, { kategorie, sortierung, farbe }); D.produkte.forEach(p => { if (p.kategorie === alt) p.kategorie = kategorie; }); D.maerkte.forEach(m => { if (Array.isArray(m.kategorien)) m.kategorien = m.kategorien.map(x => x === alt ? kategorie : x); }); }
    else D.kategorien.push({ kategorie, sortierung, farbe });
    ui.katEdit = null; return toast('Gespeichert');
  }
  const r = await adminCall({ aktion: 'kategorie_speichern', alt, kategorie, sortierung, farbe });
  if (r.ok) { ui.katEdit = null; toast('Gespeichert'); await sync(); render(); }
}

function adminMaerkte() {
  if (DEMO) return MAERKTE().map(m => Object.assign({ aktiv: true }, m)).concat(D.maerkteInaktiv || []);
  return ui.mList && ui.mList.list;
}
function maerkteBody() {
  if (!DEMO) {
    if (!ui.mList) { adminCall({ aktion: 'maerkte_admin' }).then(r => { ui.mList = r.ok ? { list: r.maerkte } : { fehler: r.fehler || 'Kein Netz.' }; if (ui.overlay === 'maerkte') render(); }); return '<p class="center"><span class="spin"></span></p>'; }
    if (ui.mList.fehler) return `<p class="err">${esc(ui.mList.fehler)}</p>`;
  }
  return adminMaerkte().slice().sort((a, b) => (b.datum_von || '').localeCompare(a.datum_von || '')).map(m => `<button class="prow" data-medit="${esc(m.markt_id)}">
    <span class="pn"><b>${esc(m.name)}</b><small>${esc(m.ort || '')}${m.datum_von ? ' · ' + fmtDate(m.datum_von) + (m.datum_bis && m.datum_bis !== m.datum_von ? '–' + fmtDate(m.datum_bis) : '') : ''}${m.aktiv ? '' : ' · <span class="pill st">inaktiv</span>'}</small></span></button>`).join('');
}
async function openMarkt(mid) {
  if (mid && !DEMO && !ui.mList) { const r = await adminCall({ aktion: 'maerkte_admin' }); if (!r.ok) return; ui.mList = { list: r.maerkte }; }
  const m = mid ? (adminMaerkte() || []).find(x => x.markt_id === mid) : null;
  const heute = today();
  ui.mEdit = m ? JSON.parse(JSON.stringify(m)) : { markt_id: null, name: '', ort: '', datum_von: heute, datum_bis: heute, kategorien: 'ALLE', aktiv: true };
  ui.overlay = 'markt-edit'; ui.fehler = null; render();
}
function marktEditBody() {
  const m = ui.mEdit; if (!m) return '';
  const alle = m.kategorien === 'ALLE';
  return `${ui.fehler ? `<p class="err">${esc(ui.fehler)}</p>` : ''}
    <div class="field"><label for="m-name">Name</label><input id="m-name" data-mf="name" value="${esc(m.name)}"></div>
    <div class="field"><label for="m-ort">Ort</label><input id="m-ort" data-mf="ort" value="${esc(m.ort)}"></div>
    <div class="formrow">
      <div class="field"><label for="m-von">Von</label><input id="m-von" type="date" data-mf="datum_von" value="${esc(m.datum_von)}"></div>
      <div class="field"><label for="m-bis">Bis</label><input id="m-bis" type="date" data-mf="datum_bis" value="${esc(m.datum_bis)}"></div>
    </div>
    <div class="field"><label>Kategorien</label><div class="chips wrap">
      <button class="chip" data-mkat="__alle" aria-pressed="${alle}">Alle</button>
      ${KATS().map(k => `<button class="chip" data-mkat="${esc(k.kategorie)}" aria-pressed="${!alle && m.kategorien.includes(k.kategorie)}">${esc(k.kategorie)}</button>`).join('')}</div></div>
    <div class="field"><label>Status</label><div class="seg"><button data-maktiv="1" aria-pressed="${m.aktiv}">aktiv</button><button data-maktiv="0" aria-pressed="${!m.aktiv}">inaktiv</button></div></div>
    ${m.markt_id ? `<p class="hint" style="margin:0">${esc(m.markt_id)}</p>` : ''}`;
}
async function saveMarkt() {
  const m = ui.mEdit; if (!m || ui.busy) return;
  if (!m.name.trim()) { ui.fehler = 'Name fehlt.'; return render(); }
  if (m.kategorien !== 'ALLE' && !m.kategorien.length) { ui.fehler = 'Mindestens eine Kategorie.'; return render(); }
  if (m.datum_bis && m.datum_von && m.datum_bis < m.datum_von) { ui.fehler = '„Bis“ liegt vor „Von“.'; return render(); }
  if (DEMO) {
    const id = m.markt_id || 'M' + String(Math.max(0, ...adminMaerkte().map(x => parseInt(x.markt_id.slice(1), 10) || 0)) + 1).padStart(3, '0');
    const neu = Object.assign({}, m, { markt_id: id, name: m.name.trim() });
    D.maerkte = D.maerkte.filter(x => x.markt_id !== id); D.maerkteInaktiv = (D.maerkteInaktiv || []).filter(x => x.markt_id !== id);
    (m.aktiv ? D.maerkte : D.maerkteInaktiv).push(neu);
    ui.mEdit = null; ui.overlay = S.markt_id ? 'maerkte' : null; return toast('Gespeichert');
  }
  ui.busy = true; render();
  const r = await adminCall({ aktion: 'markt_speichern', markt: Object.assign({}, m, { name: m.name.trim() }) });
  ui.busy = false;
  if (!r.ok) return render();
  ui.mEdit = null; ui.mList = null; ui.overlay = S.markt_id ? 'maerkte' : null;
  toast('Gespeichert'); await sync(); render();
}

const EINST_FELDER = [['app_titel', 'App-Name'], ['verein', 'Verein'], ['schnellbetraege', 'Schnelltasten (€, mit ;)'], ['storno_anzahl', 'Stornierbare Bons'], ['abgleich_sekunden', 'Abgleich (Sekunden)'], ['benachrichtigung_email', 'Mail bei Problem']];
function einstBody() {
  if (!ui.einst) {
    if (DEMO) { const e = E(); ui.einst = { app_titel: e.app_titel, verein: e.verein || '', schnellbetraege: (e.schnellbetraege || []).join(';'), storno_anzahl: e.storno_anzahl, abgleich_sekunden: e.abgleich_sekunden, benachrichtigung_email: '' }; }
    else { adminCall({ aktion: 'einstellungen_admin' }).then(r => { ui.einst = r.ok ? r.einstellungen : { fehler: r.fehler || 'Kein Netz.' }; if (ui.overlay === 'einstellungen') render(); }); return '<p class="center"><span class="spin"></span></p>'; }
  }
  if (ui.einst.fehler) return `<p class="err">${esc(ui.einst.fehler)}</p>`;
  return EINST_FELDER.map(([k, l]) => `<div class="field"><label for="es-${k}">${l}</label><input id="es-${k}" data-ek="${k}" value="${esc(ui.einst[k] == null ? '' : ui.einst[k])}" ${/anzahl|sekunden/.test(k) ? 'inputmode="numeric"' : k === 'benachrichtigung_email' ? 'type="email"' : ''}></div>`).join('');
}
async function saveEinst(root) {
  const d = {};
  root.querySelectorAll('[data-ek]').forEach(i => { d[i.dataset.ek] = i.value.trim(); });
  if (!/^\d+(\s*;\s*\d+)*$/.test(d.schnellbetraege)) return toast('Schnelltasten: z. B. 1;2;5;10;20;50');
  if (DEMO) {
    Object.assign(D.einstellungen, { app_titel: d.app_titel, verein: d.verein, schnellbetraege: d.schnellbetraege.split(';').map(Number), storno_anzahl: Number(d.storno_anzahl) || 2, abgleich_sekunden: Number(d.abgleich_sekunden) || 60 });
    ui.einst = null; ui.overlay = 'verwaltung'; return toast('Gespeichert');
  }
  ui.busy = true; render();
  const r = await adminCall({ aktion: 'einstellungen_speichern', einstellungen: d });
  ui.busy = false;
  if (r.ok) { ui.einst = null; ui.overlay = 'verwaltung'; toast('Gespeichert'); await sync(); }
  render();
}

function rmBody() {
  let list;
  if (DEMO) list = S.demo.rm || [];
  else {
    if (!ui.rmList) { adminCall({ aktion: 'rueckmeldungen_liste' }).then(r => { ui.rmList = r.ok ? { list: r.rueckmeldungen } : { fehler: r.fehler || 'Kein Netz.' }; if (ui.overlay === 'rueckmeldungen') render(); }); return '<p class="center"><span class="spin"></span></p>'; }
    if (ui.rmList.fehler) return `<p class="err">${esc(ui.rmList.fehler)}</p>`;
    list = ui.rmList.list;
  }
  if (!list.length) return '<p class="empty">Keine Rückmeldungen</p>';
  const order = { neu: 0, 'in Arbeit': 1, erledigt: 2 };
  return list.slice().sort((a, b) => order[a.status] - order[b.status] || b.zeit.localeCompare(a.zeit)).map(r => `<div class="card">
    <div class="hd"><span class="pill ${r.typ === 'Problem' ? 'st' : r.typ === 'Idee' ? 's' : 'ok'}">${esc(r.typ)}</span><span class="muted">${esc(r.name)} · ${esc(r.markt)} · ${fmtTime(r.zeit)}</span></div>
    <p class="desc">${esc(r.text)}</p>
    <div class="seg">${['neu', 'in Arbeit', 'erledigt'].map(st => `<button data-rm="${esc(r.rm_id)}" data-st="${st}" aria-pressed="${r.status === st}">${st}</button>`).join('')}</div></div>`).join('');
}

function bonsAdminBody() {
  const tag = ui.bTag || today();
  let list;
  if (DEMO) list = S.bons.filter(b => new Date(b.zeit).toLocaleDateString('sv-SE') === tag).map(b => ({ bon_id: b.bon_id, zeit: b.zeit, markt_id: b.markt_id, name: S.user.name, summe: b.summe, status: b.status, art: b.art, positionen: b.positionen.map(p => p.menge + '× ' + p.produktname).join(', ') })).reverse();
  else {
    if (!ui.bList) { adminCall({ aktion: 'bons_liste', datum: tag }).then(r => { ui.bList = r.ok ? { list: r.bons } : { fehler: r.fehler || 'Kein Netz.' }; if (ui.overlay === 'bonsadmin') render(); }); }
    else if (ui.bList.fehler) list = null;
    else list = ui.bList.list;
  }
  const head = `<div class="field"><input type="date" id="b-tag" value="${esc(tag)}" aria-label="Tag"></div>`;
  if (!DEMO && !ui.bList) return head + '<p class="center"><span class="spin"></span></p>';
  if (!list) return head + `<p class="err">${esc(ui.bList.fehler)}</p>`;
  const ok = list.filter(b => b.status === 'ok');
  return head + `<p class="muted" style="margin:0">${ok.length} Bons · ${eur(ok.reduce((a, b) => a + b.summe, 0))}</p>` + (list.length ? list.map(b => `<div class="card">
    <div class="hd"><b class="num${b.summe < 0 ? ' neg' : ''}">${eur(b.summe)}</b><span class="pill ${b.status === 'ok' ? 'ok' : 'st'}">${b.status === 'ok' ? (b.art === 'nachtrag' ? 'Nachtrag' : 'gültig') : 'storniert'}</span></div>
    <span class="muted">${fmtClock(b.zeit)} · ${esc(standName(b.markt_id))} · ${esc(b.name)}${b.hinweis ? ' · ' + esc(b.hinweis) : ''}</span>
    <span class="muted">${esc(b.positionen)}</span>
    ${b.status === 'ok' ? (ui.confirmStorno === b.bon_id
      ? `<div class="confirm">Stornieren? <button class="btn danger" style="padding:6px 12px;font-size:14px" data-astorno="${b.bon_id}">Ja</button><button class="btn ghost" style="padding:6px 12px;font-size:14px" data-nostorno>Nein</button></div>`
      : `<button class="mini-btn" style="align-self:flex-start;margin:0" data-askstorno="${b.bon_id}">Stornieren</button>`) : ''}</div>`).join('') : '<p class="empty">Keine Bons</p>');
}

function bindAdmin2(root) {
  const bt = root.querySelector('#b-tag');
  if (bt) bt.addEventListener('change', () => { ui.bTag = bt.value; ui.bList = null; render(); });
  root.querySelectorAll('[data-astorno]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.astorno;
    const lokal = S.bons.find(x => x.bon_id === id); if (lokal) lokal.status = 'storniert';
    const r = (ui.bList && ui.bList.list || []).find(x => x.bon_id === id); if (r) r.status = 'storniert';
    ui.confirmStorno = null; enqueue('Storno', { bon_id: id }); toast('Storniert');
  }));
  root.querySelectorAll('[data-kat]').forEach(b => b.addEventListener('click', () => { ui.katEdit = b.dataset.kat; render(); }));
  root.querySelectorAll('[data-medit]').forEach(b => b.addEventListener('click', () => openMarkt(b.dataset.medit)));
  root.querySelectorAll('[data-mf]').forEach(el => el.addEventListener('input', () => { if (ui.mEdit) ui.mEdit[el.dataset.mf] = el.value; }));
  root.querySelectorAll('[data-mkat]').forEach(b => b.addEventListener('click', () => {
    const m = ui.mEdit, k = b.dataset.mkat;
    if (k === '__alle') m.kategorien = m.kategorien === 'ALLE' ? [] : 'ALLE';
    else { const l = m.kategorien === 'ALLE' ? [] : m.kategorien; m.kategorien = l.includes(k) ? l.filter(x => x !== k) : l.concat(k); }
    render();
  }));
  root.querySelectorAll('[data-maktiv]').forEach(b => b.addEventListener('click', () => { ui.mEdit.aktiv = b.dataset.maktiv === '1'; render(); }));
  root.querySelectorAll('[data-ek]').forEach(i => i.addEventListener('input', () => { if (ui.einst) ui.einst[i.dataset.ek] = i.value; }));
  root.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.rm, st = b.dataset.st;
    const list = DEMO ? S.demo.rm : ui.rmList.list;
    const r0 = list.find(x => x.rm_id === id); if (r0) r0.status = st;
    render();
    if (!DEMO) adminCall({ aktion: 'rueckmeldung_status', rm_id: id, status: st });
  }));
}

/* =====================================================================
   Admin: Personen
   ===================================================================== */
function usersBody() {
  let list;
  if (DEMO) list = S.demo.users.map(u => Object.assign({ pin: true }, u));
  else {
    if (!ui.users) { loadUsers(); return '<p class="center"><span class="spin"></span></p>'; }
    if (ui.users.fehler) return `<p class="err">${esc(ui.users.fehler)}</p>`;
    list = ui.users.list;
  }
  list = list.slice().sort((a, b) => (a.aktiv === b.aktiv ? 0 : a.aktiv ? -1 : 1) || a.name.localeCompare(b.name, 'de'));
  return list.map(u => `<div class="card">
      <div class="hd"><b>${esc(u.name)}</b>${!u.aktiv ? '<span class="pill st">gesperrt</span>' : u.benutzer_id === S.user.benutzer_id ? '<span class="pill s">du</span>' : ''}</div>
      <div class="seg">${['Helfer', 'Standleitung', 'Admin'].map(r => `<button data-urole="${esc(u.benutzer_id)}" data-r="${r}" aria-pressed="${u.rolle === r}">${r}</button>`).join('')}</div>
      <div class="useractions">
        <button class="mini-btn" style="margin:0" data-uaktiv="${esc(u.benutzer_id)}" data-v="${u.aktiv ? '0' : '1'}">${u.aktiv ? 'Sperren' : 'Entsperren'}</button>
        ${ui.userEdit === u.benutzer_id
          ? `<input class="pinin" id="pin-${esc(u.benutzer_id)}" type="password" inputmode="numeric" maxlength="6" placeholder="PIN" aria-label="Neue PIN für ${esc(u.name)}"><button class="mini-btn" style="margin:0" data-upin="${esc(u.benutzer_id)}">OK</button>`
          : `<button class="mini-btn" style="margin:0" data-upinask="${esc(u.benutzer_id)}">Neue PIN</button>`}
        ${!u.pin ? '<span class="muted" style="font-size:13px">ohne PIN</span>' : ''}
      </div></div>`).join('');
}
async function loadUsers() {
  try {
    const r = await api({ aktion: 'benutzer_liste', benutzer_id: S.user.benutzer_id });
    ui.users = r.ok ? { list: r.benutzer } : { fehler: r.fehler };
  } catch (e) { ui.users = { fehler: 'Kein Netz.' }; }
  if (ui.overlay === 'users') render();
}
async function userChange(id, changes) {
  if (DEMO) {
    const u = S.demo.users.find(x => x.benutzer_id === id);
    const admins = S.demo.users.filter(x => x.rolle === 'Admin' && x.aktiv).length;
    if (u.rolle === 'Admin' && u.aktiv && admins <= 1 && ((changes.rolle && changes.rolle !== 'Admin') || changes.aktiv === false)) return toast('Es muss mindestens einen Admin geben.');
    if (changes.rolle) u.rolle = changes.rolle;
    if (changes.aktiv !== undefined) u.aktiv = changes.aktiv;
    if (changes.neue_pin) u.pin = changes.neue_pin;
    if (id === S.user.benutzer_id) { S.user.rolle = u.rolle; }
    ui.userEdit = null;
    return toast('Gespeichert');
  }
  try {
    const r = await api(Object.assign({ aktion: 'benutzer_aendern', benutzer_id: S.user.benutzer_id, ziel_id: id }, changes), true);
    if (!r.ok) return toast(esc(r.fehler));
    ui.users = null; ui.userEdit = null;
    if (id === S.user.benutzer_id) { S.user.rolle = r.benutzer.rolle; }
    toast('Gespeichert');
  } catch (e) { toast('Kein Netz'); }
}

/* =====================================================================
   Admin: Produkte und Bilder
   ===================================================================== */
function adminProdukte() {
  if (DEMO) return PRODS().concat((D.inaktiv || [])).map(p => ({ produkt_id: p.produkt_id, name: p.name, kategorie: p.kategorie, preis: p.preis, bild: p.bild, sortierung: p.sortierung, aktiv: p.aktiv !== false, beschreibung: p.beschreibung || '', info_dateien: (p.info || []).map(i => i.name) }));
  return ui.prodList && ui.prodList.list;
}
function produkteBody() {
  if (!DEMO) {
    if (!ui.prodList) { loadProdList(); return '<p class="center"><span class="spin"></span></p>'; }
    if (ui.prodList.fehler) return `<p class="err">${esc(ui.prodList.fehler)}</p>`;
  }
  const q = ui.prodQ.trim().toLowerCase();
  const list = adminProdukte().filter(p => !q || p.name.toLowerCase().includes(q) || p.produkt_id.toLowerCase() === q || p.kategorie.toLowerCase().includes(q))
    .sort((a, b) => kat(a.kategorie).sortierung - kat(b.kategorie).sortierung || a.sortierung - b.sortierung || a.name.localeCompare(b.name, 'de'));
  return `<label class="search">${I.search}<input id="pq" type="search" placeholder="Suchen" value="${esc(ui.prodQ)}" aria-label="Produkt suchen"></label>
    <div class="plist">${list.slice(0, 150).map(p => { const src = p.bild ? imgUrl('bilder', p.bild) : ''; return `<button class="prow" data-edit="${esc(p.produkt_id)}">
      <span class="thumb" style="background:${esc(kat(p.kategorie).farbe || '#5E6A61')}">${src ? `<img src="${src}" alt="">` : esc(initials(p.name))}</span>
      <span class="pn"><b>${esc(p.name)}</b><small>${esc(p.produkt_id)} · ${esc(p.kategorie)}${p.aktiv ? '' : ' · <span class="pill st">inaktiv</span>'}</small></span>
      <span class="num${p.preis < 0 ? ' neg' : ''}">${eur(p.preis)}</span></button>`; }).join('')}</div>
    ${list.length > 150 ? `<p class="hint">150 von ${list.length}</p>` : ''}`;
}
async function loadProdList() {
  try {
    const r = await api({ aktion: 'produkte_admin', benutzer_id: S.user.benutzer_id });
    ui.prodList = r.ok ? { list: r.produkte } : { fehler: r.fehler };
  } catch (e) { ui.prodList = { fehler: 'Kein Netz.' }; }
  if (ui.overlay === 'produkte') render();
}
async function openEditor(pid) {
  if (pid && !DEMO && !ui.prodList) { ui.overlay = 'produkte'; render(); await loadProdList(); }
  const list = adminProdukte() || [];
  const p = pid ? list.find(x => x.produkt_id === pid) : null;
  if (pid && !p) return toast('Nicht gefunden');
  const m = markt();
  ui.edit = p ? { produkt_id: p.produkt_id, name: p.name, kategorie: p.kategorie, preis: (p.preis / 100).toFixed(2).replace('.', ','), sortierung: p.sortierung, aktiv: p.aktiv, beschreibung: p.beschreibung, bild: p.bild, info_dateien: p.info_dateien.slice(), bildNeu: null, zusatzNeu: [] }
    : { produkt_id: null, name: '', kategorie: (m && m.kategorien !== 'ALLE' && m.kategorien[0]) || (KATS()[0] || {}).kategorie || '', preis: '', sortierung: 100, aktiv: true, beschreibung: '', bild: '', info_dateien: [], bildNeu: null, zusatzNeu: [] };
  ui.overlay = 'produkt'; ui.fehler = null; render();
}
function editBody() {
  const e = ui.edit;
  if (!e) return '';
  const haupt = e.bildNeu || (e.bild ? imgUrl('bilder', e.bild) : '');
  return `${ui.fehler ? `<p class="err">${esc(ui.fehler)}</p>` : ''}
    <div class="field"><label for="e-name">Name</label><input id="e-name" data-f="name" maxlength="40" value="${esc(e.name)}"></div>
    <div class="formrow">
      <div class="field"><label for="e-kat">Kategorie</label><select id="e-kat" data-f="kategorie">${KATS().map(k => `<option ${k.kategorie === e.kategorie ? 'selected' : ''}>${esc(k.kategorie)}</option>`).join('')}</select></div>
      <div class="field"><label for="e-preis">Preis in €</label><input id="e-preis" data-f="preis" inputmode="decimal" placeholder="3,50" value="${esc(e.preis)}"></div>
    </div>
    <div class="formrow">
      <div class="field"><label for="e-sort">Reihenfolge</label><input id="e-sort" data-f="sortierung" inputmode="numeric" value="${esc(e.sortierung)}"></div>
      <div class="field"><label>Status</label><div class="seg"><button data-eaktiv="1" aria-pressed="${e.aktiv}">aktiv</button><button data-eaktiv="0" aria-pressed="${!e.aktiv}">inaktiv</button></div></div>
    </div>
    <div class="field"><label>Bild</label>
      <div class="imgedit">${haupt ? `<img src="${haupt}" alt="Hauptbild">` : '<div class="ph">kein Bild</div>'}
        <label class="btn ghost filebtn">${haupt ? 'Ersetzen' : 'Hinzufügen'}<input type="file" accept="image/*" id="e-bild" hidden></label></div></div>
    <div class="field"><label for="e-desc">Info-Text</label><textarea id="e-desc" data-f="beschreibung" rows="5">${esc(e.beschreibung)}</textarea></div>
    <div class="field"><label>Info-Dateien</label>
      <div class="thumbs">
        ${e.info_dateien.map(n => { const src = /\.(jpe?g|png|gif|webp)$/i.test(n) ? imgUrl('info', n) : ''; return `<div class="tb">${src ? `<img src="${src}" alt="">` : `<span>${esc(n)}</span>`}<button data-rminfo="${esc(n)}" aria-label="${esc(n)} entfernen">×</button></div>`; }).join('')}
        ${e.zusatzNeu.map((d, i) => `<div class="tb new">${d.mime === 'application/pdf' ? `<span>${esc(d.name)}</span>` : `<img src="${d.data}" alt="">`}<button data-rmneu="${i}" aria-label="Entfernen">×</button></div>`).join('')}
        <label class="tb add">+<input type="file" accept="image/*,application/pdf" multiple id="e-zusatz" hidden></label>
      </div></div>
    ${e.produkt_id ? `<p class="hint" style="margin:0">${esc(e.produkt_id)}</p>` : ''}`;
}
function bindAdmin(root) {
  root.querySelectorAll('[data-urole]').forEach(b => b.addEventListener('click', () => userChange(b.dataset.urole, { rolle: b.dataset.r })));
  root.querySelectorAll('[data-uaktiv]').forEach(b => b.addEventListener('click', () => userChange(b.dataset.uaktiv, { aktiv: b.dataset.v === '1' })));
  root.querySelectorAll('[data-upinask]').forEach(b => b.addEventListener('click', () => { ui.userEdit = b.dataset.upinask; render(); const i = document.getElementById('pin-' + ui.userEdit); if (i) i.focus(); }));
  root.querySelectorAll('[data-upin]').forEach(b => b.addEventListener('click', () => {
    const v = (document.getElementById('pin-' + b.dataset.upin) || {}).value || '';
    if (!/^\d{4,6}$/.test(v.trim())) return toast('Die PIN muss aus 4 bis 6 Ziffern bestehen.');
    userChange(b.dataset.upin, { neue_pin: v.trim() });
  }));
  root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditor(b.dataset.edit)));
  const pq = root.querySelector('#pq');
  if (pq) pq.addEventListener('input', () => { ui.prodQ = pq.value; const pos = pq.selectionStart; render(); const n = app.querySelector('#pq'); n.focus(); n.setSelectionRange(pos, pos); });
  root.querySelectorAll('[data-f]').forEach(el => el.addEventListener('input', () => { if (ui.edit) ui.edit[el.dataset.f] = el.value; }));
  root.querySelectorAll('[data-eaktiv]').forEach(b => b.addEventListener('click', () => { ui.edit.aktiv = b.dataset.eaktiv === '1'; render(); }));
  root.querySelectorAll('[data-rminfo]').forEach(b => b.addEventListener('click', () => { ui.edit.info_dateien = ui.edit.info_dateien.filter(n => n !== b.dataset.rminfo); render(); }));
  root.querySelectorAll('[data-rmneu]').forEach(b => b.addEventListener('click', () => { ui.edit.zusatzNeu.splice(+b.dataset.rmneu, 1); render(); }));
  const fb = root.querySelector('#e-bild');
  if (fb) fb.addEventListener('change', async () => { if (fb.files[0]) { try { ui.edit.bildNeu = await bildVerkleinern(fb.files[0], 800, 600, true); } catch (e) { toast('Bild nicht lesbar'); } render(); } });
  const fz = root.querySelector('#e-zusatz');
  if (fz) fz.addEventListener('change', async () => {
    for (const f of fz.files) {
      try {
        if (f.type === 'application/pdf') {
          if (f.size > 8e6) { toast('PDF zu groß (max. 8 MB)'); continue; }
          ui.edit.zusatzNeu.push({ mime: 'application/pdf', name: f.name, data: await dateiAlsDataUrl(f) });
        } else ui.edit.zusatzNeu.push({ mime: 'image/jpeg', name: f.name, data: await bildVerkleinern(f, 1200, 1200, false) });
      } catch (e) { toast('Datei nicht lesbar'); }
    }
    render();
  });
}

function dateiAlsDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
}

/* Bild im Browser verkleinern: Hauptbild 4:3 zugeschnitten, Zusatzbilder nur verkleinert */
function bildVerkleinern(file, w, h, zuschneiden) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight, cw, ch;
      if (zuschneiden) {
        const ziel = w / h;
        if (sw / sh > ziel) { const nw = sh * ziel; sx = (sw - nw) / 2; sw = nw; } else { const nh = sw / ziel; sy = (sh - nh) / 2; sh = nh; }
        cw = Math.min(w, Math.round(sw)); ch = Math.round(cw / ziel);
      } else {
        const f = Math.min(1, w / sw, h / sh); cw = Math.round(sw * f); ch = Math.round(sh * f);
      }
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild nicht lesbar')); };
    img.src = url;
  });
}

async function saveProdukt() {
  const e = ui.edit; if (!e || ui.busy) return;
  const preis = Math.round(parseFloat(String(e.preis).replace(/\s|€/g, '').replace(',', '.')) * 100);
  if (!e.name.trim()) { ui.fehler = 'Name fehlt.'; return render(); }
  if (isNaN(preis)) { ui.fehler = 'Preis ungültig.'; return render(); }
  const produkt = { produkt_id: e.produkt_id, name: e.name.trim(), kategorie: e.kategorie, preis, sortierung: Number(e.sortierung) || 0, aktiv: e.aktiv, beschreibung: e.beschreibung.trim(), info_dateien: e.info_dateien };
  if (DEMO) {
    const id = e.produkt_id || 'P' + String(Math.max(0, ...PRODS().concat(D.inaktiv || []).map(p => parseInt(p.produkt_id.slice(1), 10) || 0)) + 1).padStart(3, '0');
    const info = e.info_dateien.map(n => ({ name: n, typ: /\.pdf$/i.test(n) ? 'dok' : 'bild', url: '', t: 1 }));
    let bild = e.bild;
    if (e.bildNeu) { bild = id.toLowerCase() + '_' + Date.now() + '.jpg'; window.KASSE_DEMO.bilder[bild] = e.bildNeu; }
    e.zusatzNeu.forEach((d, i) => { const pdf = d.mime === 'application/pdf'; const n = id.toLowerCase() + '_' + i + '_' + Date.now() + (pdf ? '.pdf' : '.jpg'); if (!pdf) window.KASSE_DEMO.bilder[n] = d.data; info.push({ name: n, typ: pdf ? 'dok' : 'bild', url: '', t: 1 }); });
    const neu = { produkt_id: id, name: produkt.name, kategorie: produkt.kategorie, preis, bild, bild_t: 1, sortierung: produkt.sortierung, beschreibung: produkt.beschreibung, info, aktiv: e.aktiv };
    D.produkte = D.produkte.filter(p => p.produkt_id !== id); D.inaktiv = (D.inaktiv || []).filter(p => p.produkt_id !== id);
    (e.aktiv ? D.produkte : D.inaktiv).push(neu);
    ui.edit = null; ui.overlay = 'produkte';
    return toast('Gespeichert');
  }
  ui.busy = true; ui.fehler = null; render();
  try {
    const r = await api({ aktion: 'produkt_speichern', benutzer_id: S.user.benutzer_id, produkt,
      bild: e.bildNeu ? { data: e.bildNeu.split(',')[1] } : null,
      zusatzdateien: e.zusatzNeu.map(d => ({ data: d.data.split(',')[1], mime: d.mime, name: d.name })) }, true);
    ui.busy = false;
    if (!r.ok) { ui.fehler = r.fehler; return render(); }
    if (e.bildNeu && r.bild) IMG['bilder:' + r.bild] = { t: -1, url: e.bildNeu };
    ui.edit = null; ui.prodList = null; ui.overlay = 'produkte';
    toast('Gespeichert');
    sync();
  } catch (err) {
    ui.busy = false; ui.fehler = 'Kein Netz. Eingaben bleiben erhalten.'; render();
  }
}

/* =====================================================================
   Aktionen
   ===================================================================== */
function saveBon() {
  const lines = cartLines(); if (!lines.length) return;
  const total = cartTotal();
  const nt = S.nachtrag;
  const bon = {
    bon_id: uid(), zeit: nt ? nt.zeit : new Date().toISOString(), markt_id: nt ? nt.markt_id : S.markt_id,
    benutzer_id: S.user.benutzer_id, geraet_id: S.geraet_id, anzahl_artikel: cartCount(), summe: total,
    gegeben: nt ? null : (total < 0 ? 0 : (ui.payGiven == null ? total : ui.payGiven)),
    rueckgeld: nt ? null : (total < 0 ? -total : (ui.payGiven == null ? 0 : ui.payGiven - total)),
    status: 'ok', art: nt ? 'nachtrag' : 'kasse',
    positionen: lines.map((l, i) => ({ pos_nr: i + 1, produkt_id: l.p.produkt_id, produktname: l.p.name, kategorie: l.p.kategorie, einzelpreis: l.p.preis, menge: l.menge, zeilensumme: l.summe }))
  };
  S.bons.push(bon);
  S.cart = {}; ui.overlay = null;
  enqueue('Bon', bon);
  if (nt) toast(`Nachtrag ${eur(total)}`);
  else if (total < 0) toast(`<b class="neg-t">↑ ${eur(-total)} auszahlen</b>`);
  else toast(bon.rueckgeld ? `Rückgeld <b>${eur(bon.rueckgeld)}</b>` : 'Gespeichert');
}

function storno(id) {
  const b = S.bons.find(x => x.bon_id === id);
  if (!b || !stornoable().includes(id)) return;
  b.status = 'storniert'; ui.confirmStorno = null;
  const pending = S.queue.find(q => q.typ === 'Bon' && q.data.bon_id === id);
  if (pending) pending.data.status = 'storniert';   // noch nicht übertragen: gleich als storniert senden
  enqueue('Storno', { bon_id: id });                // falls der Bon gerade unterwegs ist
  save();
  toast(`Storniert · ${eur(b.summe)}`);
}

function setAvail(pid, v) {
  delete S.cart[pid];
  enqueue('Verfuegbarkeit', { markt_id: S.markt_id, produkt_id: pid, status: v, geaendert_am: new Date().toISOString() });
  render();
}

function sendFeedback(root) {
  const text = root.querySelector('#fb-text').value.trim();
  if (!text) { root.querySelector('#fb-text').focus(); return; }
  const typ = root.querySelector('#fb-typ [aria-pressed="true"]').dataset.t;
  if (DEMO) S.demo.rm = [{ rm_id: uid(), zeit: new Date().toISOString(), name: S.user.name, markt: standName(S.markt_id), typ, text, status: 'neu' }].concat(S.demo.rm || []);
  enqueue('Rueckmeldung', { rm_id: uid(), zeit: new Date().toISOString(), benutzer_id: S.user.benutzer_id, markt_id: S.markt_id, typ, text, geraet_info: navigator.userAgent.slice(0, 120) });
  ui.overlay = null;
  toast('Gesendet');
}

let toastTimer = null;
function toast(msg) { ui.toast = msg; ui.toastNew = true; render(); clearTimeout(toastTimer); toastTimer = setTimeout(() => { ui.toast = null; const t = app.querySelector('.toast'); if (t) t.remove(); }, 2600); }

/* =====================================================================
   Start
   ===================================================================== */
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {}
}

(async function start() {
  if (!DEMO) {
    const all = await IDB.all();
    Object.assign(IMG, all);
  }
  render();
  if (!DEMO) { if (!D) firstLoad(); else sync(); }
  const every = () => Math.max(20, (E().abgleich_sekunden || 60)) * 1000;
  (function loop() { setTimeout(() => { if (!document.hidden) sync(); loop(); }, every()); })();
  window.addEventListener('online', () => { net.ok = null; sync(); });
  window.addEventListener('offline', () => { net.ok = false; paintChip(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { keepAwake(); sync(); } });
  keepAwake();
  if ('serviceWorker' in navigator && !DEMO) { try { navigator.serviceWorker.register('sw.js'); } catch (e) {} }
})();
