/* Weihnachtsmarkt-Kasse · App · Version 1.0
   Läuft im Browser, speichert alles auf dem Gerät und gleicht sich mit der
   Google-Schnittstelle ab, sobald Netz da ist. Ohne API_URL: Demo-Modus. */
'use strict';

const CFG = window.KASSE_CONFIG || {};
const API = (CFG.API_URL || '').trim();
const DEMO = !API;
const KEY_STATE = 'wmk-v1', KEY_DATA = 'wmk-stamm-v1';

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
  zugang: {}, demo: { online: true, codes: [] },
  letzterAbgleich: null, letzterFehler: null
});
let S = Object.assign(defaultState(), lsGet(KEY_STATE) || {});
let D = lsGet(KEY_DATA) || (DEMO ? window.KASSE_DEMO.stammdaten : null);   // Stammdaten
let ui = { kat: 'Alle', q: '', overlay: null, payGiven: null, payInput: '', confirmStorno: null, availQ: '', toast: null, info: null, personal: null, uebersicht: null, busy: false };
let net = { syncing: false, ok: DEMO ? true : null };

function save() { S.bons = S.bons.slice(-300); S.fehlerlog = (S.fehlerlog || []).slice(-30); lsSet(KEY_STATE, S); }

const E = () => (D && D.einstellungen) || { schnellbetraege: [5, 10, 20, 50], storno_anzahl: 2, abgleich_sekunden: 60, app_titel: 'Weihnachtsmarkt-Kasse' };
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
  S.queue.push({ id: uid(), typ, data, t: Date.now() });
  save();
  clearTimeout(enqueue.t);
  enqueue.t = setTimeout(sync, 1200);
}

async function sync() {
  if (DEMO) return demoSync();
  if (net.syncing || !S.user) return;
  net.syncing = true; paintChip();
  try {
    while (S.queue.length) {
      const batch = S.queue.slice(0, 40);
      const r = await api({ aktion: 'sync', geraet_id: S.geraet_id, benutzer_id: S.user.benutzer_id, eintraege: batch }, true);
      if (!r.ok) throw new Error(r.fehler || 'Abgleich abgelehnt');
      const done = new Set(r.erledigt || []);
      (r.fehler || []).forEach(f => { done.add(f.id); S.fehlerlog.push({ zeit: new Date().toISOString(), typ: f.typ, fehler: f.fehler }); });
      S.queue = S.queue.filter(q => !done.has(q.id));
      save();
      if (!done.size) break;
    }
    const st = await api({ aktion: 'stammdaten', benutzer_id: S.user.benutzer_id, geraet_id: S.geraet_id });
    if (!st.ok) throw new Error(st.fehler || 'Stammdaten nicht lesbar');
    applyStamm(st);
    S.letzterAbgleich = new Date().toISOString(); S.letzterFehler = null;
    save();
    loadImages();
  } catch (e) {
    S.letzterFehler = String(e.message || e); save();
  } finally {
    net.syncing = false;
    softRender();
  }
}

function setD(st) {
  D = { einstellungen: st.einstellungen, kategorien: st.kategorien, produkte: st.produkte, maerkte: st.maerkte, verfuegbarkeit: st.verfuegbarkeit, stand: st.stand };
  lsSet(KEY_DATA, D);
}
function applyStamm(st) {
  setD(st);
  if (st.benutzer) {
    S.user.rolle = st.benutzer.rolle; S.user.gesperrt = !st.benutzer.aktiv;
  } else if (S.user && !S.queue.some(q => q.typ === 'Benutzer')) {
    enqueue('Benutzer', userRow());   // im Sheet nicht (mehr) vorhanden: neu anmelden
  }
  S.zugang = Object.assign({}, S.zugang, st.zugang || {});
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
        for (const [n, f] of Object.entries(r.dateien || {})) {
          if (!f.data) continue;
          const v = { t: f.t, url: 'data:' + f.mime + ';base64,' + f.data };
          IMG[ordner + ':' + n] = v; IDB.put(ordner + ':' + n, v);
        }
        softRender();
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
    softRender();
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
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>'
};

function chipHtml() {
  const n = S.queue.length;
  if (!online()) return `<span class="sync wait" id="chip">Offline${n ? ' · ' + n + ' warten' : ''}</span>`;
  if (net.syncing || n) return `<span class="sync wait" id="chip">Übertrage${n ? ' ' + n : ''} …</span>`;
  return `<span class="sync" id="chip">Alles übertragen</span>`;
}
function paintChip() { const c = document.getElementById('chip'); if (c) c.outerHTML = chipHtml(); }

/* nach einem Abgleich neu zeichnen, aber niemanden beim Tippen stören */
function softRender() {
  const ae = document.activeElement;
  if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return paintChip();
  render();
}

function render() {
  save();
  if (!D) return renderFirstLoad();
  if (!S.user) return renderStart();
  if (S.user.gesperrt) return renderBlocked();
  if (!S.markt_id) return renderMarktwahl(false);
  if (needsCode(S.markt_id)) { ui.overlay = null; return renderCode(); }
  const keep = sel => { const el = app.querySelector(sel); return el ? [el.scrollTop, el.scrollLeft] : null; };
  const pos = { gw: keep('#gw'), chips: keep('.chips'), body: keep('.sheet .body'), ov: ui.overlay };
  renderKasse();
  if (ui.overlay) renderOverlay();
  const restore = (sel, v) => { const el = app.querySelector(sel); if (el && v) { el.scrollTop = v[0]; el.scrollLeft = v[1]; } };
  restore('#gw', pos.gw); restore('.chips', pos.chips);
  if (pos.ov === ui.overlay) restore('.sheet .body', pos.body);
  if (ui.toast) app.insertAdjacentHTML('beforeend', `<div class="toast" role="status">${ui.toast}</div>`);
}

function renderFirstLoad() {
  app.innerHTML = `<div class="screen"><div class="start">
    <img src="logo.png" alt="Pfadfinderbund Süd">
    <h1>Erste Verbindung nötig</h1>
    <p>Beim allerersten Start lädt die App Produkte und Märkte aus dem Google Sheet. Danach funktioniert sie auch ohne Netz.</p>
    ${S.letzterFehler ? `<p class="err">Verbindung fehlgeschlagen: ${esc(S.letzterFehler)}</p>` : ''}
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
  app.innerHTML = `<div class="screen"><div class="start"><h1>Zugang gesperrt</h1><p>Dein Zugang wurde von der Marktleitung gesperrt. Bitte sprich sie an.</p></div></div>`;
}

/* ---------- Registrierung ---------- */
function userRow() { return { benutzer_id: S.user.benutzer_id, name: S.user.name, kuerzel: S.user.kuerzel, registriert_am: S.user.registriert_am, geraet_id: S.geraet_id }; }
function renderStart(err) {
  app.innerHTML = `
  <div class="screen"><form class="start" id="reg" novalidate>
    <img src="logo.png" alt="Pfadfinderbund Süd">
    <h1>${esc(E().app_titel)}</h1>
    <p>Einmal anmelden – danach merkt sich dieses Gerät deinen Namen. Am Stand schaltest du die Kasse mit einem Code der Marktleitung frei.</p>
    <div class="field"><label for="r-name">Vorname</label><input id="r-name" autocomplete="given-name" required></div>
    <div class="field"><label for="r-kz">Kürzel (2–3 Buchstaben)</label><input id="r-kz" maxlength="3" autocapitalize="characters" required></div>
    ${err ? `<p class="err">${esc(err)}</p>` : ''}
    <button class="btn wide" type="submit">Anmelden</button>
    ${DEMO ? '<p class="hint">Demo-Modus: Beispieldaten, es wird nichts übertragen.</p>' : ''}
  </form></div>`;
  document.getElementById('reg').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('r-name').value.trim();
    const kz = document.getElementById('r-kz').value.trim().toUpperCase();
    if (!name || kz.length < 2) return renderStart('Bitte Vorname und ein Kürzel mit 2–3 Buchstaben eintragen.');
    S.user = { benutzer_id: uid(), name, kuerzel: kz, rolle: 'Helfer', registriert_am: new Date().toISOString() };
    enqueue('Benutzer', userRow());
    render();
  });
}

/* ---------- Marktwahl ---------- */
function renderMarktwahl(asOverlay) {
  const list = MAERKTE();
  const html = `
  <div class="start">
    <h1>Wo verkaufst du heute?</h1>
    <p>Jeder Stand ist ein eigener Markt. ${role() === 'Helfer' ? 'Zum Freischalten brauchst du danach den Einmalcode der Marktleitung.' : 'Du kannst ihn später über die Kopfzeile wechseln.'}</p>
    <div class="mlist">
      ${list.length ? list.map(m => `<button class="mbtn" data-m="${esc(m.markt_id)}" aria-current="${m.markt_id === S.markt_id}">
        <b>${esc(m.name)}</b>${role() === 'Helfer' && !needsCode(m.markt_id) ? '<span class="pill ok" style="align-self:flex-start">heute freigeschaltet</span>' : ''}
        <span class="muted">${esc(m.ort)}${m.datum_von ? ' · ' + fmtDate(m.datum_von) + (m.datum_bis && m.datum_bis !== m.datum_von ? '–' + fmtDate(m.datum_bis) : '') : ''}</span>
        <span class="cats">${(m.kategorien === 'ALLE' ? ['Alle Kategorien'] : m.kategorien).map(k => `<span>${esc(k)}</span>`).join('')}</span>
      </button>`).join('') : '<p class="empty">Im Sheet ist noch kein aktiver Markt angelegt.</p>'}
    </div>
    ${asOverlay ? '<button class="btn ghost wide" data-close>Abbrechen</button>' : ''}
    <p class="hint">Angemeldet als ${esc(S.user.name)} (${esc(S.user.kuerzel)})</p>
  </div>`;
  if (asOverlay) return html;
  app.innerHTML = `<div class="screen">${html}</div>`;
  bindMarkets(app);
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
    <h1>Kasse freischalten</h1>
    <p>Für <b>${esc(markt().name)}</b> brauchst du heute einen Einmalcode. Du bekommst ihn von der Marktleitung (Menü › Personal). Er gilt bis heute Abend – nur auf diesem Gerät.</p>
    <div class="field"><label for="c-in">Einmalcode (6 Ziffern)</label>
      <input id="c-in" class="codein num" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000 000"></div>
    ${err ? `<p class="err">${esc(err)}</p>` : ''}
    <button class="btn wide" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Wird geprüft …' : 'Freischalten'}</button>
    <button class="btn ghost wide" type="button" id="c-back">Anderen Markt wählen</button>
    ${DEMO ? `<div class="demo">
      <h3>Nur im Demo-Modus</h3>
      <p class="hint" style="margin:0">Hier gibt es nur ein Gerät. So probierst du es aus: als Standleitung umschalten, im Menü unter Personal einen Code erzeugen, dann im Menü die Rolle zurück auf Helfer stellen und den Code hier eingeben.</p>
      <button class="btn blue" type="button" id="c-demo">Als Standleitung umschalten</button>
    </div>` : ''}
  </form></div>`;
  const inp = document.getElementById('c-in');
  inp.focus();
  document.getElementById('codeform').addEventListener('submit', e => { e.preventDefault(); redeem(inp.value.replace(/\D/g, '')); });
  document.getElementById('c-back').addEventListener('click', () => { S.markt_id = null; S.cart = {}; render(); });
  const demoBtn = document.getElementById('c-demo');
  if (demoBtn) demoBtn.addEventListener('click', () => { S.user.rolle = 'Standleitung'; render(); toast('Menü › Personal › Code erzeugen'); });
}

async function redeem(code) {
  if (code.length !== 6) return renderCode('Bitte alle 6 Ziffern eingeben.');
  if (DEMO) {
    if (!S.demo.online) return renderCode('Zum Freischalten braucht das Gerät kurz Internet. Bitte Empfang suchen und nochmal versuchen.');
    const c = S.demo.codes.find(x => x.code === code);
    if (!c) return renderCode('Diesen Code gibt es nicht. Bitte nochmal nachfragen.');
    if (c.markt_id !== S.markt_id) return renderCode('Dieser Code gilt für einen anderen Stand.');
    if (c.datum !== today()) return renderCode('Dieser Code ist abgelaufen. Codes gelten nur am Tag, an dem sie erzeugt wurden.');
    if (c.eingeloest_am && c.geraet_id !== S.geraet_id) return renderCode('Dieser Code wurde schon auf einem anderen Gerät benutzt. Bitte einen neuen geben lassen.');
    Object.assign(c, { eingeloest_name: S.user.name, geraet_id: S.geraet_id, eingeloest_am: new Date().toISOString() });
    S.zugang[S.markt_id] = today();
    return toast('Freigeschaltet – gilt heute auf diesem Gerät.');
  }
  ui.busy = true; renderCode();
  try {
    if (S.queue.some(q => q.typ === 'Benutzer')) await sync();   // Anmeldung muss zuerst ankommen
    const r = await api({ aktion: 'code_einloesen', code, markt_id: S.markt_id, benutzer_id: S.user.benutzer_id, geraet_id: S.geraet_id }, true);
    ui.busy = false;
    if (!r.ok) return renderCode(r.fehler);
    S.zugang[S.markt_id] = r.datum || today();
    toast('Freigeschaltet – gilt heute auf diesem Gerät.');
    sync();
  } catch (e) {
    ui.busy = false;
    renderCode('Keine Verbindung zur Schnittstelle. Zum Freischalten braucht das Gerät kurz Internet.');
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
  if (!items.length) gridHtml = `<p class="empty">${q ? 'Kein Produkt gefunden.' : 'Für diesen Stand sind keine Produkte freigegeben.'}</p>`;

  const total = cartTotal(), count = cartCount();
  const parts = m.name.split(' – ');
  app.innerHTML = `
  <header class="top">
    <button class="where" data-act="markt" aria-label="Markt wechseln">
      <small>${esc(S.user.kuerzel)}${role() !== 'Helfer' ? ' · ' + esc(role()) : ''}${parts.length > 1 ? ' · ' + esc(parts[0]) : ''}</small>
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
    <button class="sum" data-act="cart" ${count ? '' : 'disabled'} aria-label="Warenkorb öffnen">
      <small>${count ? count + ' Artikel · antippen zum Ändern' : 'Produkte antippen · lange drücken = −1'}</small>
      <b class="num">${eur(total)}</b>
    </button>
    <button class="btn" data-act="pay" ${count ? '' : 'disabled'}>${S.nachtrag ? 'Speichern' : 'Kassieren'}</button>
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
  if (d > 0 && availOf(S.markt_id, pid) === 'ausverkauft') { toast('Dieses Produkt ist als ausverkauft markiert.'); return; }
  const n = Math.max(0, (S.cart[pid] || 0) + d);
  if (n) S.cart[pid] = n; else delete S.cart[pid];
  render();
}

function act(a) {
  if (a === 'menu') ui.overlay = 'menu';
  else if (a === 'markt') ui.overlay = 'markt';
  else if (a === 'cart') ui.overlay = 'cart';
  else if (a === 'pay') { if (S.nachtrag) return saveBon(); ui.overlay = 'pay'; ui.payGiven = null; ui.payInput = ''; }
  else if (a === 'endNachtrag') { S.nachtrag = null; S.cart = {}; toast('Nachtrag-Modus beendet.'); return; }
  render();
}

/* ---------- Overlays ---------- */
function sheet(title, body, footer) {
  return `<div class="scrim" data-scrim><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><button class="close" data-close aria-label="Schließen">×</button></header>
    <div class="body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</section></div>`;
}

function renderOverlay() {
  const o = ui.overlay;
  let html = '';
  if (o === 'markt') html = `<div class="screen" data-ov>${renderMarktwahl(true)}</div>`;
  else if (o === 'cart') html = sheet('Warenkorb', cartBody(), `<button class="btn ghost" data-x="clear">Leeren</button><button class="btn" style="flex:1" data-x="topay">${S.nachtrag ? 'Nachtrag speichern' : 'Kassieren · ' + eur(cartTotal())}</button>`);
  else if (o === 'pay') html = payHtml();
  else if (o === 'menu') html = sheet('Menü', menuBody());
  else if (o === 'bons') html = sheet('Meine letzten Bons', bonsBody());
  else if (o === 'feedback') html = sheet('Rückmeldung senden', feedbackBody(), '<button class="btn wide" data-x="sendfb">Senden</button>');
  else if (o === 'avail') html = sheet('Verfügbarkeit', availBody());
  else if (o === 'nachtrag') html = sheet('Nachtrag erfassen', nachtragBody(), '<button class="btn wide blue" data-x="startnt">Produkte auswählen</button>');
  else if (o === 'stats') html = sheet('Tagesübersicht', statsBody());
  else if (o === 'personal') html = sheet('Personal · ' + standName(S.markt_id), personalBody());
  else if (o === 'queue') html = sheet('Abgleich', queueBody(), DEMO ? '' : `<button class="btn wide" data-x="syncnow" ${net.syncing ? 'disabled' : ''}>${net.syncing ? 'Gleicht ab …' : 'Jetzt abgleichen'}</button>`);
  else if (o === 'info') html = infoHtml();
  else if (o === 'logout') html = sheet('Abmelden', logoutBody());
  app.insertAdjacentHTML('beforeend', html);
  bindOverlay();
}

function linesHtml() {
  return `<div class="lines">${cartLines().map(l => `<div class="line">
    <div class="n"><b>${esc(l.p.name)}</b><small class="num">${l.menge} × ${eur(l.p.preis)}</small></div>
    <div class="step"><button data-dec="${esc(l.p.produkt_id)}" aria-label="${esc(l.p.name)}: eins weniger">−</button><span class="num">${l.menge}</span><button data-inc="${esc(l.p.produkt_id)}" aria-label="${esc(l.p.name)}: eins mehr">+</button></div>
    <div class="ls num">${eur(l.summe)}</div>
    <button class="del" data-del="${esc(l.p.produkt_id)}" aria-label="${esc(l.p.name)} entfernen">${I.trash}</button></div>`).join('')}</div>`;
}
function cartBody() {
  if (!cartLines().length) return '<p class="empty">Der Warenkorb ist leer.</p>';
  return linesHtml() + `<div class="line" style="border:0"><div class="n"><b>Summe</b></div><div class="ls num" style="font-size:20px">${eur(cartTotal())}</div></div>`;
}

function payHtml() {
  const total = cartTotal();
  const payout = total < 0;
  const given = ui.payGiven;
  let changeBox = '';
  if (!payout) {
    if (given == null) changeBox = `<div class="change"><small>Betrag passend?</small><b class="num">Kein Rückgeld</b></div>`;
    else if (given < total) changeBox = `<div class="change short"><small>Es fehlen noch</small><b class="num">${eur(total - given)}</b></div>`;
    else changeBox = `<div class="change"><small>Rückgeld</small><b class="num">${eur(given - total)}</b></div>`;
  }
  const short = !payout && given != null && given < total;
  const body = `
    ${linesHtml()}
    <div class="due"><small>${payout ? 'Auszuzahlen (Pfandrückgabe)' : 'Zu zahlen'}</small><b class="num">${eur(Math.abs(total))}</b></div>
    ${payout ? '<p class="muted center" style="margin:0">Den Betrag aus der Kasse an den Kunden auszahlen.</p>' : `
    <div class="field"><label>Gegeben</label>
      <div class="cash">${E().schnellbetraege.map(v => `<button data-g="${v * 100}" aria-pressed="${given === v * 100}" ${v * 100 < total ? 'disabled style="opacity:.4"' : ''}>${v} €</button>`).join('')}</div></div>
    <div class="field"><label for="g-in">Anderer Betrag</label><input id="g-in" inputmode="decimal" placeholder="z. B. 13,50" value="${esc(ui.payInput)}"></div>
    ${changeBox}`}`;
  return sheet(payout ? 'Auszahlen' : 'Kassieren', body,
    `<button class="btn ghost" data-close>Zurück</button><button class="btn" style="flex:1" data-x="save" ${short ? 'disabled' : ''}>${payout ? 'Ausgezahlt – speichern' : 'Bezahlt – Bon speichern'}</button>`);
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
    ${pics.length ? `<div class="gallery">${pics.map(x => `<figure>${x.src ? `<img src="${x.src}" alt="${esc(x.name || p.name)}">` : `<div class="ph">${online() ? 'Bild wird geladen …' : 'Bild noch nicht auf dem Gerät – lädt beim nächsten Abgleich'}</div>`}</figure>`).join('')}</div>` : ''}
    ${p.beschreibung ? `<p class="desc">${esc(p.beschreibung)}</p>` : ''}
    ${docs.map(d => d.url
      ? `<a class="doc" href="${esc(d.url)}" target="_blank" rel="noopener"><span class="ic">PDF</span><span>${esc(d.name)}<small>Öffnen – braucht Internet</small></span></a>`
      : `<div class="doc"><span class="ic">PDF</span><span>${esc(d.name)}<small>${DEMO ? 'Im Demo-Modus nicht verfügbar' : 'Link fehlt'}</small></span></div>`).join('')}
    ${missing.length && isLead() ? `<p class="hint" style="margin:0">Im Ordner „Produktinfos“ nicht gefunden: ${missing.map(m => esc(m.name)).join(', ')}</p>` : ''}`;
  return sheet(p.name, body, `<button class="btn ghost" data-close>Schließen</button><button class="btn" style="flex:1" data-x="infoadd" ${out ? 'disabled' : ''}>In den Warenkorb</button>`);
}

function menuBody() {
  const items = [
    ['bons', I.receipt, 'Meine letzten Bons', `Die letzten ${E().storno_anzahl} lassen sich stornieren`],
    ['feedback', I.chat, 'Rückmeldung senden', 'Problem, Idee oder Kommentar'],
    ['stats', I.chart, 'Tagesübersicht', isLead() ? 'Zahlen des Stands heute' : 'Deine Verkäufe heute'],
    isLead() ? ['personal', I.users, 'Personal', 'Einmalcodes für Helfende an diesem Stand'] : null,
    isLead() ? ['avail', I.box, 'Verfügbarkeit', 'Ausverkauft oder nicht da – für alle Geräte am Markt'] : null,
    isAdmin() ? ['nachtrag', I.plus, 'Nachtrag erfassen', 'Verkäufe ohne App nachtragen'] : null,
    ['markt', I.pin, 'Markt wechseln', markt().name],
    ['queue', I.list, 'Abgleich', S.letzterAbgleich ? 'Zuletzt ' + fmtTime(S.letzterAbgleich) : 'Noch nicht abgeglichen'],
    ['logout', I.out, 'Abmelden', 'Gerät für eine andere Person freimachen']
  ].filter(Boolean);
  return `<div class="menu">${items.map(([k, ic, t, s]) => `<button class="item" data-go="${k}"><span class="ic">${ic}</span><span>${esc(t)}<small>${esc(s)}</small></span></button>`).join('')}</div>
  ${DEMO ? `<div class="demo">
    <h3>Nur im Demo-Modus</h3>
    <div class="row">Rolle<div class="seg">${['Helfer', 'Standleitung', 'Admin'].map(r => `<button data-role="${r}" aria-pressed="${role() === r}">${r}</button>`).join('')}</div></div>
    <div class="row">Netz<div class="seg"><button data-net="1" aria-pressed="${S.demo.online}">Online</button><button data-net="0" aria-pressed="${!S.demo.online}">Offline</button></div></div>
    <p class="hint" style="margin:0">In der echten App vergebt ihr die Rolle im Sheet (Tab Benutzer). Standleitung und Admin brauchen keinen Einmalcode.</p>
    <button class="btn ghost" data-x="reset">Demo zurücksetzen</button>
  </div>` : ''}
  <p class="hint">Angemeldet als ${esc(S.user.name)} (${esc(S.user.kuerzel)})<span class="role">${esc(role())}</span></p>`;
}

function myBons() { return S.bons.filter(b => b.benutzer_id === S.user.benutzer_id && b.art === 'kasse').sort((a, b) => b.zeit.localeCompare(a.zeit)); }
function stornoable() { return myBons().slice(0, E().storno_anzahl).filter(b => b.status === 'ok').map(b => b.bon_id); }

function bonsBody() {
  const list = myBons().slice(0, 15);
  if (!list.length) return '<p class="empty">Noch keine Bons.</p>';
  const can = stornoable();
  return `<p class="muted" style="margin:0">Du kannst deine letzten ${E().storno_anzahl} Bons stornieren. Ältere korrigiert ein Admin im Sheet.</p>` +
    list.map(b => `<div class="card">
      <div class="hd"><b class="num">${eur(b.summe)}</b><span class="pill ${b.status === 'ok' ? 'ok' : 'st'}">${b.status === 'ok' ? 'gültig' : 'storniert'}</span></div>
      <span class="muted">${fmtTime(b.zeit)} · ${esc(standName(b.markt_id))}${S.queue.some(q => q.typ === 'Bon' && q.data.bon_id === b.bon_id) ? ' · noch nicht übertragen' : ''}</span>
      <span class="muted">${b.positionen.map(p => p.menge + '× ' + esc(p.produktname)).join(', ')}</span>
      ${can.includes(b.bon_id) ? (ui.confirmStorno === b.bon_id
        ? `<div class="confirm">Wirklich stornieren? <button class="btn danger" style="padding:6px 12px;font-size:14px" data-storno="${b.bon_id}">Ja, stornieren</button><button class="btn ghost" style="padding:6px 12px;font-size:14px" data-nostorno>Nein</button></div>`
        : `<button class="btn ghost" style="align-self:flex-start;padding:7px 14px;font-size:14px" data-askstorno="${b.bon_id}">Stornieren</button>`) : ''}
    </div>`).join('');
}

function feedbackBody() {
  return `<div class="field"><label>Art</label><div class="seg" id="fb-typ">${['Problem', 'Idee', 'Kommentar'].map((t, i) => `<button data-t="${t}" aria-pressed="${i === 0}">${t}</button>`).join('')}</div></div>
    <div class="field"><label for="fb-text">Was ist passiert oder was schlägst du vor?</label><textarea id="fb-text" rows="5" placeholder="z. B. Kachel für Glühwein fehlt am Café-Stand"></textarea></div>
    <p class="hint" style="margin:0">Markt, Name und Uhrzeit werden automatisch mitgeschickt.</p>`;
}

function availBody() {
  const m = markt();
  const q = ui.availQ.trim().toLowerCase();
  const list = sortimentFor(m).filter(p => !q || p.name.toLowerCase().includes(q));
  const changed = sortimentFor(m).filter(p => availOf(m.markt_id, p.produkt_id) !== 'verfuegbar').length;
  return `<p class="muted" style="margin:0">Gilt für alle Geräte am Stand <b>${esc(standName(m.markt_id))}</b>, sobald sie sich abgleichen (mit Netz etwa jede Minute). ${changed ? changed + ' Produkt(e) eingeschränkt.' : ''}</p>
    <label class="search">${I.search}<input id="aq" type="search" placeholder="Produkt suchen" value="${esc(ui.availQ)}" aria-label="Produkt suchen"></label>
    <div>${list.map(p => { const v = availOf(m.markt_id, p.produkt_id); return `<div class="availrow">
      <div class="hd"><span>${esc(p.name)}</span><span class="muted">${esc(p.kategorie)}</span></div>
      <div class="seg avail">${[['verfuegbar', 'verfügbar'], ['ausverkauft', 'ausverkauft'], ['nicht_da', 'nicht da']].map(([k, l]) => `<button data-av="${esc(p.produkt_id)}" data-v="${k}" aria-pressed="${v === k}">${l}</button>`).join('')}</div></div>`; }).join('')}</div>`;
}

function nachtragBody() {
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return `<p class="muted" style="margin:0">Für Verkäufe ohne App, z. B. von einer Strichliste. Der Bon wird als <b>Nachtrag</b> gespeichert und zählt in der Auswertung mit.</p>
    <div class="field"><label for="nt-m">Markt</label><select id="nt-m">${MAERKTE().map(m => `<option value="${esc(m.markt_id)}" ${m.markt_id === S.markt_id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="nt-z">Datum und Uhrzeit</label><input id="nt-z" type="datetime-local" value="${now.toISOString().slice(0, 16)}"></div>`;
}

function statsBody() {
  if (isLead() && !DEMO) {
    if (!ui.uebersicht) { loadUebersicht(); return '<p class="center"><span class="spin"></span> Zahlen werden geladen …</p>'; }
    if (ui.uebersicht.fehler) return `<p class="err">${esc(ui.uebersicht.fehler)}</p>` + localStats();
    const u = ui.uebersicht;
    const rows = Object.entries(u.maerkte || {});
    const sum = rows.reduce((a, [, v]) => a + v.summe, 0), bons = rows.reduce((a, [, v]) => a + v.bons, 0);
    return `<div class="stats"><div class="stat"><small>Bons ${isAdmin() ? 'alle Stände' : 'am Stand'}</small><b class="num">${bons}</b></div><div class="stat"><small>Umsatz</small><b class="num">${eur(sum)}</b></div></div>
      ${isAdmin() && rows.length ? `<div class="card"><b>Je Stand</b>${rows.map(([mid, v]) => `<div class="hd"><span>${esc(standName(mid))}</span><span class="num">${v.bons} · ${eur(v.summe)}</span></div>`).join('')}</div>` : ''}
      <div class="card"><b>Meistverkauft an diesem Stand</b>${(u.top || []).length ? u.top.map(t => `<div class="hd"><span>${esc(t.name)}</span><span class="num">${t.menge}×</span></div>`).join('') : '<span class="muted">Noch nichts verkauft.</span>'}</div>
      <p class="hint" style="margin:0">Alle Geräte, Stand ${fmtClock(u.geladen)}. Bons, die noch auf Geräten warten, fehlen hier.</p>`;
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
    <div class="card"><b>Meistverkauft</b>${top.length ? top.map(([n, c]) => `<div class="hd"><span>${esc(n)}</span><span class="num">${c}×</span></div>`).join('') : '<span class="muted">Noch nichts verkauft.</span>'}</div>
    <p class="hint" style="margin:0">Nur dieses Gerät. Stornierte Bons sind nicht enthalten.</p>`;
}
async function loadUebersicht() {
  try {
    const r = await api({ aktion: 'uebersicht', benutzer_id: S.user.benutzer_id, markt_id: S.markt_id });
    ui.uebersicht = r.ok ? Object.assign(r, { geladen: new Date().toISOString() }) : { fehler: r.fehler };
  } catch (e) { ui.uebersicht = { fehler: 'Keine Verbindung – hier nur die Zahlen dieses Geräts.' }; }
  if (ui.overlay === 'stats') render();
}

function personalBody() {
  let list;
  if (DEMO) list = S.demo.codes.filter(c => c.markt_id === S.markt_id && c.datum === today()).slice().reverse().map(c => ({ code: c.code, offen: !c.eingeloest_am, eingeloest_name: c.eingeloest_name, eingeloest_am: c.eingeloest_am }));
  else {
    if (!ui.personal) { loadPersonal(); return '<p class="center"><span class="spin"></span> Codes werden geladen …</p>'; }
    if (ui.personal.fehler) return `<p class="err">${esc(ui.personal.fehler)}</p><button class="btn ghost wide" data-x="reloadpers">Nochmal versuchen</button>`;
    list = ui.personal.codes.slice().reverse();
  }
  const open = list.filter(c => c.offen);
  const used = list.filter(c => !c.offen);
  return `<p class="muted" style="margin:0">Jeder Code schaltet <b>ein</b> Gerät für <b>${esc(standName(S.markt_id))}</b> frei – bis heute Abend. Morgen braucht es einen neuen. Zum Erzeugen braucht dein Gerät Netz.</p>
    ${open[0] ? `<div class="codebox"><small>Einmalcode zum Weitergeben</small><b class="num">${fmtCode(open[0].code)}</b><span class="muted">gilt heute · noch nicht benutzt</span></div>` : ''}
    <button class="btn wide${open[0] ? ' ghost' : ''}" data-x="newcode" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Wird erzeugt …' : open[0] ? 'Weiteren Code erzeugen' : 'Einmalcode erzeugen'}</button>
    <div class="card"><b>Heute freigeschaltet (${used.length})</b>
      ${used.length ? used.map(c => `<div class="hd"><span>${esc(c.eingeloest_name || 'unbekannt')}</span><span class="muted num">${c.eingeloest_am ? fmtClock(c.eingeloest_am) : ''} · Code ${fmtCode(c.code)}</span></div>`).join('') : '<span class="muted">Noch niemand.</span>'}</div>
    ${open.length > 1 ? `<div class="card"><b>Offene Codes</b>${open.map(c => `<div class="hd"><span class="num">${fmtCode(c.code)}</span><span class="pill q">offen</span></div>`).join('')}</div>` : ''}
    <p class="hint" style="margin:0">Offene Codes verfallen um Mitternacht von selbst.</p>`;
}
async function loadPersonal() {
  try {
    const r = await api({ aktion: 'personal', benutzer_id: S.user.benutzer_id, markt_id: S.markt_id });
    ui.personal = r.ok ? r : { fehler: r.fehler };
  } catch (e) { ui.personal = { fehler: 'Keine Verbindung. Für Codes braucht das Gerät Netz.' }; }
  if (ui.overlay === 'personal') render();
}
async function newCode() {
  if (DEMO) {
    if (!S.demo.online) return toast('Zum Erzeugen braucht das Gerät Netz.');
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
  } catch (e) { ui.busy = false; toast('Keine Verbindung. Für Codes braucht das Gerät Netz.'); }
}

function queueBody() {
  const n = S.queue.length;
  const byType = {};
  S.queue.forEach(q => { byType[q.typ] = (byType[q.typ] || 0) + 1; });
  const names = { Bon: 'Bons', Storno: 'Stornos', Benutzer: 'Anmeldung', Verfuegbarkeit: 'Verfügbarkeit', Rueckmeldung: 'Rückmeldungen' };
  const recent = S.bons.slice(-3).reverse();
  const row = o => Object.values(o).map(v => String(v).length > 14 && String(v).includes('-') ? String(v).slice(0, 8) + '…' : v).join(' | ');
  return `<div class="stats"><div class="stat"><small>Warten auf Übertragung</small><b class="num">${n}</b></div><div class="stat"><small>Letzter Abgleich</small><b class="num" style="font-size:20px">${S.letzterAbgleich ? fmtTime(S.letzterAbgleich) : '–'}</b></div></div>
    ${n ? `<p class="muted" style="margin:0">${Object.entries(byType).map(([k, v]) => v + ' ' + (names[k] || k)).join(' · ')}</p>` : ''}
    ${!DEMO && S.letzterFehler ? `<p class="errlist">Letzter Versuch: ${esc(S.letzterFehler)}</p>` : ''}
    ${(S.fehlerlog || []).length ? `<div class="errlist"><b>Von der Schnittstelle abgelehnt</b><br>${S.fehlerlog.slice(-5).reverse().map(f => `${fmtClock(f.zeit)} · ${esc(f.typ)}: ${esc(f.fehler)}`).join('<br>')}</div>` : ''}
    ${recent.length ? `<b>So kommen die letzten Bons im Tab Verkäufe an</b>
    <pre class="rows">bon_id | zeit | markt_id | summe | gegeben | rueckgeld | status | art\n${recent.map(b => row({ a: b.bon_id, b: fmtTime(b.zeit), c: b.markt_id, g: (b.summe / 100).toFixed(2), h: b.gegeben == null ? '' : (b.gegeben / 100).toFixed(2), i: b.rueckgeld == null ? '' : (b.rueckgeld / 100).toFixed(2), j: b.status, k: b.art })).join('\n')}</pre>` : ''}
    <p class="hint" style="margin:0">${DEMO ? 'Demo-Modus: Die Übertragung wird nur simuliert.' : 'Geräte-ID ' + esc(S.geraet_id.slice(0, 8)) + ' · App-Version 1.0'}</p>`;
}

function logoutBody() {
  const n = S.queue.length;
  return n
    ? `<p class="errlist" style="margin:0">Auf diesem Gerät warten noch ${n} Einträge auf Übertragung. Bitte erst mit Netz abgleichen (Menü › Abgleich), dann abmelden.</p>`
    : `<p class="muted" style="margin:0">Name, Freischaltung und die Bon-Liste werden von diesem Gerät gelöscht. Alle Verkäufe sind bereits im Sheet.</p>
       <button class="btn danger wide" data-x="logout">Abmelden</button>`;
}

function bindOverlay() {
  const root = app.querySelector('[data-scrim], [data-ov]');
  if (!root) return;
  const close = () => { ui.overlay = null; ui.confirmStorno = null; ui.personal = null; ui.uebersicht = null; render(); };
  root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  if (root.matches('[data-scrim]')) root.addEventListener('click', e => { if (e.target === root) close(); });
  if (ui.overlay === 'markt') bindMarkets(root);
  root.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => { S.cart[b.dataset.inc] = (S.cart[b.dataset.inc] || 0) + 1; render(); }));
  root.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.dec; S.cart[id] = (S.cart[id] || 0) - 1; if (S.cart[id] <= 0) delete S.cart[id]; if (!cartCount()) ui.overlay = null; render(); }));
  root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { delete S.cart[b.dataset.del]; if (!cartCount()) ui.overlay = null; render(); }));
  root.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { ui.payGiven = +b.dataset.g; ui.payInput = ''; render(); }));
  const gi = root.querySelector('#g-in');
  if (gi) gi.addEventListener('input', () => {
    ui.payInput = gi.value; const v = parseFloat(gi.value.replace(',', '.'));
    ui.payGiven = isNaN(v) ? null : Math.round(v * 100);
    const pos = gi.selectionStart; render(); const n = app.querySelector('#g-in'); n.focus(); n.setSelectionRange(pos, pos);
  });
  root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { ui.overlay = b.dataset.go; render(); }));
  root.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => { S.user.rolle = b.dataset.role; render(); }));
  root.querySelectorAll('[data-net]').forEach(b => b.addEventListener('click', () => { S.demo.online = b.dataset.net === '1'; render(); demoSync(); }));
  root.querySelectorAll('[data-askstorno]').forEach(b => b.addEventListener('click', () => { ui.confirmStorno = b.dataset.askstorno; render(); }));
  root.querySelectorAll('[data-nostorno]').forEach(b => b.addEventListener('click', () => { ui.confirmStorno = null; render(); }));
  root.querySelectorAll('[data-storno]').forEach(b => b.addEventListener('click', () => storno(b.dataset.storno)));
  root.querySelectorAll('#fb-typ button').forEach(b => b.addEventListener('click', () => root.querySelectorAll('#fb-typ button').forEach(x => x.setAttribute('aria-pressed', x === b))));
  root.querySelectorAll('[data-av]').forEach(b => b.addEventListener('click', () => setAvail(b.dataset.av, b.dataset.v)));
  const aq = root.querySelector('#aq');
  if (aq) aq.addEventListener('input', () => { ui.availQ = aq.value; const pos = aq.selectionStart; render(); const n = app.querySelector('#aq'); n.focus(); n.setSelectionRange(pos, pos); });
  root.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
    const x = b.dataset.x;
    if (x === 'clear') { S.cart = {}; ui.overlay = null; render(); }
    else if (x === 'topay') { if (S.nachtrag) saveBon(); else { ui.overlay = 'pay'; ui.payGiven = null; ui.payInput = ''; render(); } }
    else if (x === 'save') saveBon();
    else if (x === 'sendfb') sendFeedback(root);
    else if (x === 'newcode') newCode();
    else if (x === 'reloadpers') { ui.personal = null; render(); }
    else if (x === 'syncnow') { sync().then(() => { if (ui.overlay === 'queue') render(); }); render(); }
    else if (x === 'infoadd') { const pid = ui.info; ui.overlay = null; change(pid, +1); }
    else if (x === 'startnt') {
      const mid = root.querySelector('#nt-m').value, z = root.querySelector('#nt-z').value;
      S.nachtrag = { markt_id: mid, zeit: new Date(z).toISOString() }; S.markt_id = mid; S.cart = {}; ui.overlay = null; ui.kat = 'Alle';
      toast('Nachtrag-Modus: Produkte antippen und speichern.');
    }
    else if (x === 'logout') { const keepId = S.geraet_id; S = defaultState(); S.geraet_id = keepId; ui.overlay = null; render(); }
    else if (x === 'reset') { try { localStorage.removeItem(KEY_STATE); } catch (e) {} S = defaultState(); D = window.KASSE_DEMO.stammdaten; D.verfuegbarkeit = []; ui.overlay = null; render(); }
  }));
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
  if (nt) toast(`Nachtrag gespeichert · ${eur(total)}`);
  else if (total < 0) toast(`Gespeichert · <b>${eur(-total)}</b> auszahlen`);
  else toast(bon.rueckgeld ? `Gespeichert · Rückgeld <b>${eur(bon.rueckgeld)}</b>` : 'Bon gespeichert');
}

function storno(id) {
  const b = S.bons.find(x => x.bon_id === id);
  if (!b || !stornoable().includes(id)) return;
  b.status = 'storniert'; ui.confirmStorno = null;
  const pending = S.queue.find(q => q.typ === 'Bon' && q.data.bon_id === id);
  if (pending) pending.data.status = 'storniert';   // noch nicht übertragen: gleich als storniert senden
  enqueue('Storno', { bon_id: id });                // falls der Bon gerade unterwegs ist
  save();
  toast(`Bon über ${eur(b.summe)} storniert.`);
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
  enqueue('Rueckmeldung', { rm_id: uid(), zeit: new Date().toISOString(), benutzer_id: S.user.benutzer_id, markt_id: S.markt_id, typ, text, geraet_info: navigator.userAgent.slice(0, 120) });
  ui.overlay = null;
  toast('Danke! Deine Rückmeldung ist unterwegs.');
}

let toastTimer = null;
function toast(msg) { ui.toast = msg; render(); clearTimeout(toastTimer); toastTimer = setTimeout(() => { ui.toast = null; softRender(); }, 2600); }

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
