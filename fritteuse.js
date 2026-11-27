/* Weihnachtsmarkt-Kasse · Fritteuse: zwei Körbe mit Timer, nur auf diesem Gerät.
   Aufruf: drei Finger nach links wischen. */

/* ---------- Daten je Person auf diesem Gerät ---------- */
const FR_KEY = () => 'wmk-fritte-' + (S.user ? S.user.benutzer_id : 'x');
const FR_STANDARD = () => ({ koerbe: [{ name: 'Pommes', sek: 210 }, { name: 'Kartoffelpuffer', sek: 240 }], ton: true, vib: true, lauf: [null, null], zuletzt: [null, null] });
let FR = null;
function fr() {
  if (!FR || FR._key !== FR_KEY()) {
    try { FR = Object.assign(FR_STANDARD(), JSON.parse(localStorage.getItem(FR_KEY())) || {}); } catch (e) { FR = FR_STANDARD(); }
    FR._key = FR_KEY();
  }
  return FR;
}
function frSpeichern() { try { const x = Object.assign({}, FR); delete x._key; localStorage.setItem(FR_KEY(), JSON.stringify(x)); } catch (e) {} }
const frZeit = s => { const a = Math.abs(Math.round(s)); return (s < 0 ? '−' : '') + Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0'); };
const frRest = i => { const l = fr().lauf[i]; return l ? l.sek - (Date.now() - l.start) / 1000 : null; };
const frLaeuft = () => fr().lauf.some(Boolean);
function frParse(t) { const m = /^\s*(\d{1,3})(?::(\d{1,2}))?\s*$/.exec(t || ''); if (!m) return null; const s = m[2] !== undefined ? +m[1] * 60 + +m[2] : +m[1] * 60; return s > 0 && s < 6000 ? s : null; }

/* ---------- Starten, zurücksetzen, abbrechen ---------- */
function frTippen(i) {
  const f = fr(), r = frRest(i);
  if (r === null) { tonBereit(); f.lauf[i] = { start: Date.now(), sek: f.koerbe[i].sek }; }
  else if (r <= 0) { f.zuletzt[i] = Math.round((Date.now() - f.lauf[i].start) / 1000); f.lauf[i] = null; }
  else return;                                   // läuft noch: kurzes Antippen tut nichts
  frSpeichern(); frZeichnen(); frTakt();
}
function frAbbrechen(i) { const f = fr(); if (!f.lauf[i]) return; f.lauf[i] = null; frSpeichern(); frZeichnen(); if (navigator.vibrate) try { navigator.vibrate(40); } catch (e) {} }

/* ---------- Ton: Doppelpiep, links tiefer, rechts höher ---------- */
let tonCtx = null;
function tonBereit() { try { tonCtx = tonCtx || new (window.AudioContext || window.webkitAudioContext)(); if (tonCtx.state === 'suspended') tonCtx.resume(); } catch (e) {} }
function piep(i) {
  const f = fr();
  if (f.vib && navigator.vibrate) try { navigator.vibrate([200, 100, 200]); } catch (e) {}
  if (!f.ton || !tonCtx) return;
  try {
    const hz = i ? 1046 : 784, t0 = tonCtx.currentTime;
    [0, 0.3].forEach(d => {
      const o = tonCtx.createOscillator(), g = tonCtx.createGain();
      o.type = 'sine'; o.frequency.value = hz; o.connect(g); g.connect(tonCtx.destination);
      g.gain.setValueAtTime(0, t0 + d); g.gain.linearRampToValueAtTime(0.35, t0 + d + 0.02); g.gain.linearRampToValueAtTime(0, t0 + d + 0.2);
      o.start(t0 + d); o.stop(t0 + d + 0.22);
    });
  } catch (e) {}
}

/* ---------- Takt: Anzeige jede Sekunde, Alarm nach Plan ---------- */
let frTimer = null;
const frLetzterPiep = [0, 0];
function frTakt() {
  clearInterval(frTimer);
  if (!S.user || !frLaeuft()) { frTimer = null; return; }
  frTimer = setInterval(() => {
    if (!frLaeuft()) { clearInterval(frTimer); frTimer = null; frZeichnen(); return; }
    [0, 1].forEach(i => {
      const r = frRest(i); if (r === null || r > 0) return;
      const abstand = -r > 60 ? 2000 : 5000;
      if (Date.now() - frLetzterPiep[i] >= abstand) { frLetzterPiep[i] = Date.now(); piep(i); }
    });
    frZeichnen();
  }, 1000);
}
/* nur die Zahlen und Zustände auffrischen, nicht die ganze App */
function frZeichnen() {
  const leiste = app.querySelector('[data-frleiste]');
  const soll = frLaeuft() && ui.page !== 'fritteuse';
  if (!!leiste !== soll && !app.querySelector('input:focus, textarea:focus') && S.user && D) return render();
  app.querySelectorAll('[data-frzeit]').forEach(el => { const i = +el.dataset.frzeit, r = frRest(i); el.textContent = r === null ? frZeit(fr().koerbe[i].sek) : frZeit(Math.ceil(r)); });
  app.querySelectorAll('[data-frk]').forEach(el => { const i = +el.dataset.frk, r = frRest(i); el.classList.toggle('lauf', r !== null && r > 0); el.classList.toggle('fertig', r !== null && r <= 0); });
  app.querySelectorAll('[data-frzul]').forEach(el => { const z = fr().zuletzt[+el.dataset.frzul]; el.textContent = z ? 'zuletzt ' + frZeit(z) + ' Minuten' : ''; });
}

/* ---------- Leiste über der Kasse, nur bei laufendem Timer ---------- */
function frLeiste() {
  if (!S.user || !frLaeuft() || ui.page === 'fritteuse') return '';
  const f = fr();
  return `<div class="frleiste" data-frleiste>${[0, 1].filter(i => f.lauf[i]).map(i => { const r = frRest(i);
    return `<button class="frl${r <= 0 ? ' fertig' : ''}" data-frk="${i}" data-frl="${i}"><span>${esc(f.koerbe[i].name)}</span><b class="num" data-frzeit="${i}">${frZeit(Math.ceil(r))}</b></button>`; }).join('')}</div>`;
}
function bindFrLeiste(root) {
  root.querySelectorAll('[data-frl]').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.frl, r = frRest(i); if (r !== null && r <= 0) frTippen(i); else go('fritteuse'); }));
}

/* ---------- Seite Fritteuse ---------- */
P.fritteuse = {
  titel: 'Fritteuse',
  kopf: () => `<button class="icon-btn rbtn" data-go="fritteuse_einst" aria-label="Einstellungen">${I.gear}</button>`,
  open: () => { fr(); frTakt(); },
  body: () => { const f = fr(); return `<div class="fritteuse">${[0, 1].map(i => `<div class="frkorb-wrap">
      <button class="frkorb" data-frk="${i}" data-frt="${i}"><span class="frname">${esc(f.koerbe[i].name)}</span><b class="num" data-frzeit="${i}"></b></button>
      <small class="frzul" data-frzul="${i}"></small></div>`).join('')}</div>`; },
  bind: root => {
    root.querySelectorAll('[data-frt]').forEach(b => {
      const i = +b.dataset.frt; let t = null, lang = false;
      b.addEventListener('pointerdown', () => { lang = false; t = setTimeout(() => { lang = true; frAbbrechen(i); }, 700); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(t)));
      b.addEventListener('contextmenu', e => e.preventDefault());
      b.addEventListener('click', () => { if (lang) { lang = false; return; } frTippen(i); });
    });
    setTimeout(frZeichnen, 0);
  }
};
P.fritteuse_einst = {
  form: true, eltern: 'fritteuse',
  titel: 'Fritteuse · Einstellungen',
  open: () => { const f = fr(); ui.fre = { koerbe: f.koerbe.map(k => ({ name: k.name, zeit: frZeit(k.sek) })), ton: f.ton, vib: f.vib }; },
  body: () => { const e = ui.fre; return `${e.koerbe.map((k, i) => `<h3 class="sub">Korb ${i ? 'rechts' : 'links'}</h3>
      <div class="formrow"><div class="field"><label for="fr-n${i}">Produkt</label><input id="fr-n${i}" value="${esc(k.name)}" autocomplete="off"></div>
      <div class="field" style="max-width:110px"><label for="fr-z${i}">Zeit</label><input id="fr-z${i}" value="${esc(k.zeit)}" inputmode="numeric" placeholder="3:30"></div></div>`).join('')}
    <h3 class="sub">Wenn fertig</h3>
    <div class="seg" id="fr-alarm"><button data-fa="ton" aria-pressed="${e.ton}">Ton</button><button data-fa="vib" aria-pressed="${e.vib}">Vibration</button><button data-fa="blink" aria-pressed="${!e.ton && !e.vib}">nur Blinken</button></div>`; },
  leiste: () => '<button class="btn wide" data-spe>Speichern</button>',
  bind: root => {
    const e = ui.fre;
    const erfassen = () => e.koerbe.forEach((k, i) => { k.name = val(root, '#fr-n' + i); k.zeit = val(root, '#fr-z' + i); });
    root.querySelectorAll('[data-fa]').forEach(b => b.addEventListener('click', () => {
      erfassen(); const a = b.dataset.fa;
      if (a === 'blink') { e.ton = false; e.vib = false; } else e[a] = !e[a];
      if (a === 'ton' && e.ton) { tonBereit(); piep(0); }
      render();
    }));
    root.querySelector('[data-spe]').addEventListener('click', () => {
      erfassen();
      const sek = e.koerbe.map(k => frParse(k.zeit));
      if (sek.some(s => !s)) return toast('Zeit als Minuten:Sekunden, z. B. 3:30');
      if (e.koerbe.some(k => !k.name)) return toast('Produkt fehlt');
      const f = fr(); f.koerbe = e.koerbe.map((k, i) => ({ name: k.name, sek: sek[i] })); f.ton = e.ton; f.vib = e.vib;
      frSpeichern(); gespeichert(); go('fritteuse');
    });
  }
};

/* ---------- Geste: drei Finger nach links ---------- */
let mehrfinger = 0;   // Zeitpunkt der letzten Mehrfinger-Berührung: so lange keine Kachel-Tipps
(function geste() {
  let start = null;
  document.addEventListener('touchstart', e => {
    if (e.touches.length >= 2) mehrfinger = Date.now();
    if (e.touches.length === 3) start = { x: [...e.touches].reduce((a, t) => a + t.clientX, 0) / 3, y: [...e.touches].reduce((a, t) => a + t.clientY, 0) / 3 };
    else if (e.touches.length > 3) start = null;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (e.touches.length >= 2) mehrfinger = Date.now();
    if (!start || e.touches.length !== 3) return;
    const x = [...e.touches].reduce((a, t) => a + t.clientX, 0) / 3, y = [...e.touches].reduce((a, t) => a + t.clientY, 0) / 3;
    if (start.x - x > 70 && Math.abs(y - start.y) < 60) { start = null; if (S.user && D && ui.page !== 'fritteuse' && !ui.overlay) verlassen(() => go('fritteuse')); }
  }, { passive: true });
  document.addEventListener('touchend', e => { if (e.touches.length < 3) start = null; if (e.touches.length) mehrfinger = Date.now(); }, { passive: true });
})();
const mehrfingerAktiv = () => Date.now() - mehrfinger < 400;
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) { frTakt(); frZeichnen(); } });

setTimeout(() => { if (S.user) frTakt(); }, 500);
