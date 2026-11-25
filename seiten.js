/* Weihnachtsmarkt-Kasse · App 2.1 · Seiten für Verkauf, Schichten und Standleitung */
'use strict';

/* Vom Server geladene Listen: zuletzt Geladenes sofort zeigen, im Hintergrund aktualisieren */
const L = {};
async function laden(key, params) {
  const erst = !(L[key] && L[key].ok);
  L[key] = Object.assign({}, L[key], { laden: true });
  let r;
  try { r = await api(params); } catch (e) { r = { ok: false, fehler: net.ok === false ? 'Kein Netz' : e.message }; }
  if (r.ok) L[key] = r;
  else { L[key].laden = false; if (!L[key].ok) L[key].fehler = r.fehler; }
  if (ui.page && P[ui.page] && P[ui.page].key === key) { if (erst && !ui.drawer && !ui.overlay) render(); else softRender(true); }
  return r;
}
function geladen(key, fn) {
  const x = L[key];
  if (x && x.ok) return fn(x);
  if (x && x.fehler && !x.laden) return `<p class="err">${esc(x.fehler)}</p>`;
  return ladeHtml;
}
const optionen = (liste, wert) => liste.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(wert) ? ' selected' : ''}>${esc(t)}</option>`; }).join('');
const val = (root, sel) => { const el = root.querySelector(sel); return el ? el.value.trim() : ''; };
const tagText = d => d === today() ? 'Heute' : fmtDate(d);

/* ---------- Bons & Storno ---------- */
function myBons() { return S.bons.filter(b => b.benutzer_id === S.user.benutzer_id && b.art === 'kasse').sort((a, b) => b.zeit.localeCompare(a.zeit)); }
function stornoable() { return myBons().slice(0, E().storno_anzahl).filter(b => b.status === 'ok').map(b => b.bon_id); }
function bonKarte(b, kannStorno, extra) {
  return `<div class="card">
    <div class="hd"><b class="num${b.summe < 0 ? ' neg' : ''}">${eur(b.summe)}</b><span class="pill ${b.status === 'ok' ? 'ok' : 'st'}">${b.status === 'ok' ? (b.art === 'nachtrag' ? 'Nachtrag' : 'gültig') : 'storniert'}</span></div>
    <span class="muted">${fmtClock(b.zeit)} · ${esc(extra || standName(b.stand_id))}</span>
    <span class="muted">${esc(typeof b.positionen === 'string' ? b.positionen : b.positionen.map(p => p.menge + '× ' + p.produktname).join(', '))}</span>
    ${kannStorno ? (ui.confirm === b.bon_id
      ? `<div class="acts">Stornieren? <button class="btn danger sm" data-storno="${b.bon_id}">Ja</button><button class="btn ghost sm" data-nein>Nein</button></div>`
      : `<div class="acts"><button class="mini-btn" data-ask="${b.bon_id}">Stornieren</button></div>`) : ''}</div>`;
}
function bindConfirm(root, onYes, attr = 'storno') {
  root.querySelectorAll('[data-ask]').forEach(b => b.addEventListener('click', () => { ui.confirm = b.dataset.ask; render(); }));
  root.querySelectorAll('[data-nein]').forEach(b => b.addEventListener('click', () => { ui.confirm = null; render(); }));
  root.querySelectorAll(`[data-${attr}]`).forEach(b => b.addEventListener('click', () => { const id = b.dataset[attr]; ui.confirm = null; onYes(id, b); }));
}
function stornoEnqueue(id) {
  const b = S.bons.find(x => x.bon_id === id); if (b) b.status = 'storniert';
  const pending = S.queue.find(q => q.typ === 'Bon' && q.data.bon_id === id); if (pending) pending.data.status = 'storniert';
  enqueue('Storno', { bon_id: id });
  render(); toast('Storniert');
}
P.bons = {
  titel: 'Meine Bons',
  body: () => { const can = stornoable(); const l = myBons().slice(0, 20); return l.length ? l.map(b => bonKarte(b, can.includes(b.bon_id))).join('') : listeLeer('Noch keine Bons'); },
  bind: root => bindConfirm(root, stornoEnqueue)
};

/* ---------- Meine Schichten: eigene Schichten und Eintragen an einem Ort ---------- */
const STATUS_TEXT = { vorgeschlagen: 'wartet auf Bestätigung', verknuepfung: 'Zuordnung offen', abgelehnt: 'abgelehnt' };
const statusText = s => s.status === 'vorgeschlagen' && s.ersetzt ? 'Wechsel angefragt' : s.status === 'vorgeschlagen' && s.anfrage ? 'Zugang angefragt' : STATUS_TEXT[s.status];
const kommendeTage = st => (st && st.standzeiten || []).filter(z => z.datum >= today());
P.schichten = {
  get form() { return !!ui.sf; },
  open: data => {
    ui.sfFehler = null; ui.sf = null;
    if (data && data.anfrage && S.stand_id) ui.sf = { stand_id: S.stand_id, datum: today(), anfrage: true };
  },
  titel: () => ui.sf && ui.sf.anfrage ? 'Zugang anfragen' : 'Meine Schichten',
  body: () => {
    const meine = (D.schichten || []).filter(s => s.benutzer_id === S.user.benutzer_id && s.datum >= today()).sort((a, b) => (a.datum + a.von).localeCompare(b.datum + b.von));
    const liste = meine.length ? meine.map(s => {
      const jetzt = s.datum === today() && nowMin() >= toMin(s.von) && nowMin() <= toMin(s.bis);
      return `<div class="schicht${jetzt ? ' jetzt' : ''}${s.status !== 'geplant' ? ' offen' : ''}">
        <div class="sd"><b>${tagText(s.datum)}</b><span class="num">${s.von}–${s.bis}</span></div>
        <div class="si"><b>${esc(s.aufgabe)}</b><span>${esc(standName(s.stand_id))}${statusText(s) ? ' · ' + statusText(s) : jetzt ? ' · jetzt' : ''}${wartet(s.schicht_id) ? ' <span class="spin sm"></span>' : ''}</span></div>
        ${s.status === 'vorgeschlagen' ? `<button class="del" data-sdel="${esc(s.schicht_id)}" aria-label="Vorschlag zurückziehen">${I.trash}</button>` : ''}</div>`;
    }).join('') : listeLeer('Noch keine Schicht');
    return (ui.sf ? eintragForm() : '') + liste;
  },
  leiste: () => ui.sf ? '' : '<button class="btn wide" data-neu>Schicht eintragen</button>',
  bind: root => {
    const n = root.querySelector('[data-neu]');
    if (n) n.addEventListener('click', () => {
      const offen = STAENDE().filter(st => kommendeTage(st).length);
      const st = offen.find(x => x.stand_id === S.stand_id) || offen[0];
      if (!st) return toast('Keine Standzeiten geplant');
      const z = kommendeTage(st)[0];
      ui.sf = { stand_id: st.stand_id, datum: z.datum }; ui.sfFehler = null; render();
      const pb = app.querySelector('#pb'); if (pb) pb.scrollTop = 0;
    });
    root.querySelectorAll('[data-sdel]').forEach(b => b.addEventListener('click', () => { aktion('schicht_loeschen', { schicht_id: b.dataset.sdel }); render(); toast('Zurückgezogen'); }));
    const f = root.querySelector('.sform'); if (f) bindEintragForm(f);
  }
};
function eintragForm() {
  const d = ui.sf, st = stand(d.stand_id);
  const tage = d.anfrage ? [kommendeTage(st).find(z => z.datum === today()) || { datum: today(), von: '10:00', bis: '20:00' }] : kommendeTage(st);
  if (!tage.some(z => z.datum === d.datum)) d.datum = tage[0] ? tage[0].datum : today();
  const sz = tage.find(z => z.datum === d.datum) || { von: '10:00', bis: '14:00' };
  const staende = STAENDE().filter(x => kommendeTage(x).length);
  const aufg = (D.aufgaben || []).filter(a => a !== 'Standleitung');
  const belegt = (D.schichten || []).filter(s => s.stand_id === d.stand_id && s.datum === d.datum && s.status !== 'abgelehnt').sort((a, b) => a.von.localeCompare(b.von));
  return `<div class="sform card">
    ${d.anfrage ? `<b>${esc(st.name)} · heute</b><span class="muted">Trag deine Schicht ein. Nach der Bestätigung kannst du für diese Zeit kassieren.</span>` : staende.length > 1 ? `<div class="field"><label>Stand</label><div class="chips wrap" id="sf-s">${staende.map(x => `<button class="chip" data-s="${esc(x.stand_id)}" aria-pressed="${x.stand_id === d.stand_id}">${esc(x.name)}</button>`).join('')}</div></div>` : `<b>${esc(st.name)}</b>`}
    ${d.anfrage ? '' : `<div class="field"><label>Tag</label><div class="chips wrap" id="sf-t">${tage.map(z => `<button class="chip" data-t="${z.datum}" aria-pressed="${z.datum === d.datum}">${tagText(z.datum)}</button>`).join('')}</div></div>`}
    ${zeitFeld(d, sz)}
    <div class="field"><label>Aufgabe</label><div class="chips wrap" id="sf-a">${aufg.map(a => `<button class="chip" data-a="${esc(a)}" aria-pressed="${(d.aufgabe || aufg[0]) === a}">${esc(a)}</button>`).join('')}</div></div>
    <div class="belegt"><small>Schon eingeteilt · Stand offen ${sz.von}–${sz.bis}</small>${belegt.length ? belegt.map(s => `<span>${s.von}–${s.bis} · ${esc(s.aufgabe)} · ${esc(s.name)}</span>`).join('') : '<span>noch niemand</span>'}</div>
    ${ui.sfFehler ? `<p class="err">${esc(ui.sfFehler)}</p>` : ''}
    <div class="acts"><button class="btn ghost sm" data-x="abbr">Abbrechen</button><button class="btn sm" style="margin-left:auto" data-x="spe">${d.anfrage ? 'Anfragen' : 'Eintragen'}</button></div></div>`;
}
function bindEintragForm(f) {
  const d = ui.sf;
  const sz = () => kommendeTage(stand(d.stand_id)).find(z => z.datum === d.datum) || { von: '10:00', bis: '14:00' };
  const erfassen = () => { zeitLesen(f, d, sz()); const a = f.querySelector('#sf-a [aria-pressed="true"]'); if (a) d.aufgabe = a.dataset.a; };
  fehlerWeg(f, 'sfFehler');
  f.querySelectorAll('#sf-z [data-z]').forEach(b => b.addEventListener('click', () => { erfassen(); d.ganz = b.dataset.z === '1'; render(); }));
  f.querySelectorAll('#sf-s [data-s]').forEach(b => b.addEventListener('click', () => { erfassen(); d.stand_id = b.dataset.s; d.von = d.bis = null; if (d.ganz === false) d.ganz = undefined; render(); }));
  f.querySelectorAll('#sf-t [data-t]').forEach(b => b.addEventListener('click', () => { erfassen(); d.datum = b.dataset.t; d.von = d.bis = null; if (d.ganz === false) d.ganz = undefined; render(); }));
  f.querySelectorAll('#sf-a [data-a]').forEach(b => b.addEventListener('click', () => f.querySelectorAll('#sf-a [data-a]').forEach(x => x.setAttribute('aria-pressed', x === b))));
  f.querySelector('[data-x="abbr"]').addEventListener('click', () => { ui.sf = null; render(); });
  f.querySelector('[data-x="spe"]').addEventListener('click', () => {
    erfassen();
    const schicht = { schicht_id: uid().replace(/-/g, '').slice(0, 10), stand_id: d.stand_id, datum: d.datum, von: d.von, bis: d.bis, aufgabe: d.aufgabe, benutzer_id: S.user.benutzer_id, anfrage: !!d.anfrage };
    ui.sfFehler = !d.von || !d.bis || toMin(d.bis) <= toMin(d.von) ? 'Zeiten prüfen.' : null;
    if (ui.sfFehler) return render();
    const alte = ueberschneidungen(S.user.benutzer_id, d.datum, d.von, d.bis, '');
    if (alte.length) { ui.konflikt = { schicht, alte, name: S.user.name, form: 'sf' }; return go('konflikt'); }
    aktion('schicht_speichern', { schicht });
    const anfrage = d.anfrage;
    ui.sf = null;
    if (anfrage) { home(); toast('Anfrage gesendet · die Standleitung bestätigt'); } else { render(); toast(leitet(d.stand_id) ? 'Eingetragen' : 'Eingetragen · wartet auf Bestätigung'); }
  });
}

/* ---------- Schichtplan / Personalplanung ---------- */
const AUFGABE_FARBE = ['#1F6E24', '#2158A1', '#A8352A', '#B07A2A', '#6B4FA0', '#2E8A8A', '#8B5A2B'];
const aufgabeFarbe = a => AUFGABE_FARBE[Math.max(0, (D.aufgaben || []).indexOf(a)) % AUFGABE_FARBE.length];
const planSid = () => ui.planStand || S.stand_id;
function planTage() {
  const st = stand(planSid()); const t = today();
  const tage = (st.standzeiten || []).map(z => z.datum);
  (D.schichten || []).forEach(s => { if (s.stand_id === planSid() && !tage.includes(s.datum)) tage.push(s.datum); });
  return tage.filter(d => d >= t).sort().concat(tage.filter(d => d < t).sort().reverse()).filter((d, i, a) => a.indexOf(d) === i);
}
function ueberschneidungen(benutzerId, datum, von, bis, ausser) {
  const aus = [].concat(ausser || []);
  return (D.schichten || []).filter(s => benutzerId && s.benutzer_id === benutzerId && !aus.includes(s.schicht_id) && s.datum === datum && s.status !== 'abgelehnt' && toMin(s.von) < toMin(bis) && toMin(s.bis) > toMin(von));
}
const ueberschneidung = (...a) => ueberschneidungen(...a)[0];
const schichtKurz = s => `${tagText(s.datum)} ${s.von}–${s.bis} · ${s.aufgabe} · ${standName(s.stand_id)}`;

/* Zeit: ganztägig (Standzeit des Tages) oder eigenes Zeitfenster */
function zeitFeld(d, sz) {
  if (d.ganz === undefined) d.ganz = !d.von || (d.von === sz.von && d.bis === sz.bis);
  return `<div class="field"><label>Zeit</label><div class="seg" id="sf-z"><button data-z="1" aria-pressed="${d.ganz}">Ganztägig ${sz.von}–${sz.bis}</button><button data-z="0" aria-pressed="${!d.ganz}">Zeitfenster</button></div></div>
    ${d.ganz ? '' : `<div class="formrow"><div class="field"><label for="sf-von">Von</label><input type="time" id="sf-von" step="900" value="${esc(d.von || sz.von)}"></div><div class="field"><label for="sf-bis">Bis</label><input type="time" id="sf-bis" step="900" value="${esc(d.bis || sz.bis)}"></div></div>`}`;
}
function zeitLesen(f, d, sz) {
  if (d.ganz) { d.von = sz.von; d.bis = sz.bis; }
  else { d.von = val(f, '#sf-von') || d.von; d.bis = val(f, '#sf-bis') || d.bis; }
}
/* Fehlermeldung im Formular verschwindet bei der nächsten Eingabe */
function fehlerWeg(f, key) {
  const weg = e => { if (e.target.closest('[data-x="spe"]')) return; ui[key] = null; const x = f.querySelector('.err'); if (x) x.remove(); };
  f.addEventListener('click', weg, true); f.addEventListener('input', weg, true); f.addEventListener('change', weg, true);
}

/* Konflikt: Person ist zur gleichen Zeit schon eingeteilt */
function konfliktPlan(k) {
  const ich = S.user.benutzer_id;
  const direkt = k.alte.filter(a => leitet(a.stand_id) || (a.benutzer_id === ich && a.status === 'vorgeschlagen'));
  const rest = k.alte.filter(a => !direkt.includes(a));
  const anfrage = rest.length === 1 && rest[0].benutzer_id === ich;
  return { direkt, rest, moeglich: !rest.length || anfrage, anfrage };
}
function konfliktLoesen() {
  const k = ui.konflikt, p = konfliktPlan(k);
  p.direkt.forEach(a => aktion('schicht_loeschen', { schicht_id: a.schicht_id }));
  if (p.anfrage) k.schicht.ersetzt = p.rest[0].schicht_id;
  aktion('schicht_speichern', { schicht: k.schicht });
  ui[k.form] = null; ui.konflikt = null; ui.overlay = null; render();
  toast(p.anfrage ? 'Wechsel angefragt' : leitet(k.schicht.stand_id) ? 'Gespeichert' : 'Eingetragen · wartet auf Bestätigung');
}
OV.konflikt = {
  titel: () => 'Schon eingeteilt',
  body: () => {
    const k = ui.konflikt, p = konfliktPlan(k);
    return `<p style="margin:0"><b>${esc(k.name)}</b> ist zu dieser Zeit schon eingeteilt:</p>
      ${k.alte.map(a => `<div class="belegt"><span><b>${esc(schichtKurz(a))}</b>${a.status !== 'geplant' ? ' · ' + (a.status === 'vorgeschlagen' ? 'Vorschlag' : 'offen') : ''}</span></div>`).join('')}
      <p style="margin:0">Neu: ${esc(schichtKurz(k.schicht))}</p>
      ${p.moeglich ? (p.anfrage ? '<p class="muted" style="margin:0">Die Standleitung muss den Wechsel bestätigen. Bis dahin gilt die alte Schicht.</p>' : '')
        : `<p class="err" style="margin:0">Nur die Leitung von ${esc([...new Set(p.rest.map(a => standName(a.stand_id)))].join(', '))} kann diese Schicht ändern.</p>`}`;
  },
  footer: () => { const p = konfliktPlan(ui.konflikt); return `<button class="btn ghost" data-close>Abbrechen</button>${p.moeglich ? `<button class="btn" style="flex:1" data-x="ok">${p.anfrage ? 'Wechsel anfragen' : 'Alte verwerfen, neue übernehmen'}</button>` : ''}`; },
  bind: root => { const b = root.querySelector('[data-x="ok"]'); if (b) b.addEventListener('click', konfliktLoesen); }
};
P.plan = {
  stand: false,
  eltern: () => ui.planStand ? 'struktur' : null,
  titel: () => (leitet(planSid()) ? 'Personalplanung' : 'Schichtplan') + (ui.planStand ? ' · ' + standName(ui.planStand) : ''),
  open: data => {
    if (!(data && data.zurueck)) ui.planStand = data && data.stand_id || null;
    if (!planSid() || !stand(planSid())) { ui.planStand = null; }
    const tage = planTage();
    if (!ui.planTag || !tage.includes(ui.planTag)) ui.planTag = tage[0] || today();
    ui.planForm = data && data.benutzer_id ? { benutzer_id: data.benutzer_id, modus: 'b' } : null;
    ui.planFehler = null;
  },
  get form() { return !!ui.planForm; },
  body: () => {
    if (!planSid()) return listeLeer('Erst einen Stand wählen');
    const st = stand(planSid()), l = leitet(planSid()), tage = planTage(), tag = ui.planTag;
    const sz = (st.standzeiten || []).find(z => z.datum === tag);
    const liste = (D.schichten || []).filter(s => s.stand_id === planSid() && s.datum === tag && (l || s.status !== 'abgelehnt'))
      .sort((a, b) => a.von.localeCompare(b.von) || a.aufgabe.localeCompare(b.aufgabe));
    let a = sz ? toMin(sz.von) : 10 * 60, e = sz ? toMin(sz.bis) : 20 * 60;
    liste.forEach(s => { a = Math.min(a, toMin(s.von)); e = Math.max(e, toMin(s.bis)); });
    a = Math.floor(a / 60) * 60; e = Math.ceil(e / 60) * 60;
    const span = Math.max(60, e - a), pct = m => ((m - a) / span * 100).toFixed(2) + '%';
    const stunden = []; for (let h = a / 60; h * 60 <= e; h += (span > 600 ? 2 : 1)) stunden.push(h);
    const nowLine = tag === today() && nowMin() >= a && nowMin() <= e ? `<span class="now" style="left:${pct(nowMin())}"></span>` : '';
    const zeile = s => {
      const mein = s.benutzer_id === S.user.benutzer_id;
      const offen = ui.planForm && ui.planForm.schicht_id === s.schicht_id;
      return `<div class="srow${s.status !== 'geplant' ? ' offen' : ''}${mein ? ' mein' : ''}${offen ? ' sel' : ''}"${l || (mein && s.status === 'vorgeschlagen') ? ` data-sed="${esc(s.schicht_id)}" role="button" tabindex="0"` : ''}>
        <div class="sl"><b>${esc(s.name)}${s.platzhalter ? ' <span class="pill q">Platzhalter</span>' : ''}${wartet(s.schicht_id) ? ' <span class="spin sm"></span>' : ''}</b>
          <small>${esc(s.aufgabe)} · ${s.von}–${s.bis}${statusText(s) ? ' · ' + statusText(s) : ''}</small></div>
        <div class="track"><span class="blk" style="left:${pct(toMin(s.von))};width:calc(${pct(toMin(s.bis))} - ${pct(toMin(s.von))});background:${aufgabeFarbe(s.aufgabe)}"></span>${nowLine}</div>
        ${l && (s.status === 'vorgeschlagen' || s.status === 'verknuepfung') ? `<div class="acts"><button class="btn sm" data-ok="${esc(s.schicht_id)}|${s.status}">${s.status === 'vorgeschlagen' ? 'Bestätigen' : 'Zuordnen'}</button><button class="btn ghost sm" data-no="${esc(s.schicht_id)}|${s.status}">${s.status === 'vorgeschlagen' ? 'Ablehnen' : 'Trennen'}</button></div>` : ''}
      </div>${offen ? schichtForm() : ''}`;
    };
    const neuOffen = ui.planForm && !ui.planForm.schicht_id;
    return `${tage.length > 1 ? `<div class="chips daytabs">${tage.map(t => `<button class="chip" data-tag="${t}" aria-pressed="${t === tag}">${tagText(t)}</button>`).join('')}</div>` : ''}
      <p class="muted" style="margin:0">${fmtDate(tag)}${sz ? ' · Stand ' + sz.von + '–' + sz.bis : ''}</p>
      ${neuOffen ? schichtForm() : ''}
      ${liste.length ? `<div class="scale">${stunden.map(h => `<span style="left:${pct(h * 60)}">${h}</span>`).join('')}</div>${liste.map(zeile).join('')}` : listeLeer('Noch niemand eingeteilt')}`;
  },
  leiste: () => ui.planForm || !planSid() ? '' : `<button class="btn wide" data-neu>${leitet(planSid()) ? 'Schicht hinzufügen' : 'Mich eintragen'}</button>`,
  bind: root => {
    root.querySelectorAll('[data-tag]').forEach(b => b.addEventListener('click', () => { ui.planTag = b.dataset.tag; ui.planForm = null; render(); }));
    const neu = root.querySelector('[data-neu]'); if (neu) neu.addEventListener('click', () => { ui.planForm = { modus: 'b' }; ui.planFehler = null; render(); root = app.querySelector('.page'); const pb = app.querySelector('#pb'); if (pb) pb.scrollTop = 0; });
    root.querySelectorAll('[data-sed]').forEach(b => b.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const s = D.schichten.find(x => x.schicht_id === b.dataset.sed);
      ui.planForm = ui.planForm && ui.planForm.schicht_id === s.schicht_id ? null : Object.assign({ modus: s.platzhalter ? 'p' : 'b' }, s);
      ui.planFehler = null; render();
    }));
    root.querySelectorAll('[data-ok],[data-no]').forEach(b => b.addEventListener('click', () => {
      const ja = !!b.dataset.ok, [id, st] = (b.dataset.ok || b.dataset.no).split('|');
      const s = D.schichten.find(x => x.schicht_id === id);
      if (ja && s && ueberschneidung(s.benutzer_id, s.datum, s.von, s.bis, [s.schicht_id, s.ersetzt])) return toast(esc(s.name) + ' ist zu dieser Zeit schon eingeteilt');
      aktion('hinweis_aktion', { typ: st === 'vorgeschlagen' ? 'schicht' : 'verknuepfung', id, aktion2: ja ? 'ja' : 'nein' });
      render();
    }));
    const f = root.querySelector('.sform');
    if (f) bindSchichtForm(f);
  }
};
function schichtForm() {
  const d = ui.planForm, l = leitet(planSid()), st = stand(planSid());
  const sz = (st.standzeiten || []).find(z => z.datum === ui.planTag) || { von: '10:00', bis: '14:00' };
  const tagSchichten = (D.schichten || []).filter(s => s.datum === ui.planTag && s.status !== 'abgelehnt' && s.schicht_id !== d.schicht_id);
  const personen = (D.personen || []).map(p => { const x = tagSchichten.filter(s => s.benutzer_id === p.benutzer_id); return [p.benutzer_id, p.name + (x.length ? ' · eingeteilt ' + x.map(s => s.von + '–' + s.bis + (s.stand_id !== planSid() ? ' ' + standName(s.stand_id) : '')).join(', ') : '')]; });
  const aufg = (D.aufgaben || []).filter(a => a !== 'Standleitung' || (l && d.modus !== 'p'));
  return `<div class="sform card">
    <b>${d.schicht_id ? 'Schicht ändern' : l ? 'Neue Schicht' : 'Mich eintragen'} · ${tagText(ui.planTag)}</b>
    ${l ? `<div class="seg" id="sf-m"><button data-m="b" aria-pressed="${d.modus !== 'p'}">Person</button><button data-m="p" aria-pressed="${d.modus === 'p'}">Platzhalter</button></div>
      ${d.modus !== 'p' ? `<div class="field"><select id="sf-b" aria-label="Person">${optionen(personen, d.benutzer_id || S.user.benutzer_id)}</select></div>`
        : `<div class="field"><input id="sf-p" placeholder="Name" value="${esc(d.platzhalter && d.name ? d.name : '')}" aria-label="Platzhalter"></div>`}` : ''}
    ${zeitFeld(d, sz)}
    <div class="field"><label>Aufgabe</label><div class="chips wrap" id="sf-a">${aufg.map(a => `<button class="chip" data-a="${esc(a)}" aria-pressed="${(d.aufgabe || aufg.find(x => x !== 'Standleitung')) === a}">${esc(a)}</button>`).join('')}</div></div>
    ${ui.planFehler ? `<p class="err">${esc(ui.planFehler)}</p>` : ''}
    <div class="acts"><button class="btn ghost sm" data-x="abbr">Abbrechen</button>${d.schicht_id ? `<button class="btn ghost sm danger-t" data-x="del">Löschen</button>` : ''}<button class="btn sm" style="margin-left:auto" data-x="spe">${l ? 'Speichern' : d.schicht_id ? 'Ändern' : 'Vorschlagen'}</button></div></div>`;
}
function bindSchichtForm(f) {
  const d = ui.planForm;
  const st = stand(planSid()), sz = (st.standzeiten || []).find(z => z.datum === ui.planTag) || { von: '10:00', bis: '14:00' };
  fehlerWeg(f, 'planFehler');
  f.querySelectorAll('#sf-z [data-z]').forEach(b => b.addEventListener('click', () => { erfassen(); d.ganz = b.dataset.z === '1'; render(); }));
  const erfassen = () => {
    zeitLesen(f, d, sz);
    const a = f.querySelector('#sf-a [aria-pressed="true"]'); if (a) d.aufgabe = a.dataset.a;
    if (f.querySelector('#sf-b')) d.benutzer_id = val(f, '#sf-b');
    if (f.querySelector('#sf-p')) d.name = val(f, '#sf-p');
  };
  f.querySelectorAll('#sf-m button').forEach(b => b.addEventListener('click', () => { erfassen(); d.modus = b.dataset.m; render(); }));
  f.querySelectorAll('#sf-a button').forEach(b => b.addEventListener('click', () => { f.querySelectorAll('#sf-a button').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
  f.querySelector('[data-x="abbr"]').addEventListener('click', () => { ui.planForm = null; ui.planFehler = null; render(); });
  const del = f.querySelector('[data-x="del"]');
  if (del) del.addEventListener('click', () => { aktion('schicht_loeschen', { schicht_id: d.schicht_id }); ui.planForm = null; render(); toast('Gelöscht'); });
  f.querySelector('[data-x="spe"]').addEventListener('click', () => {
    erfassen();
    const l = leitet(planSid());
    const schicht = { schicht_id: d.schicht_id || uid().replace(/-/g, '').slice(0, 10), stand_id: planSid(), datum: ui.planTag, von: d.von, bis: d.bis, aufgabe: d.aufgabe };
    if (!l) schicht.benutzer_id = S.user.benutzer_id;
    else if (d.modus === 'p') { schicht.platzhalter = (d.name || '').replace(/\s+/g, ' '); schicht.benutzer_id = ''; }
    else schicht.benutzer_id = d.benutzer_id;
    const fehler = !schicht.von || !schicht.bis || toMin(schicht.bis) <= toMin(schicht.von) ? 'Zeiten prüfen.'
      : !schicht.aufgabe ? 'Aufgabe wählen.'
      : l && d.modus === 'p' && schicht.platzhalter.length < 2 ? 'Name fehlt.' : '';
    if (fehler) { ui.planFehler = fehler; return render(); }
    const person = (D.personen || []).find(p => p.benutzer_id === schicht.benutzer_id);
    if (schicht.aufgabe === 'Standleitung' && (d.modus === 'p' || !person || ROLLEN[person.rolle] < 2)) { ui.rollePerson = d.modus === 'p' ? null : person; return go('rolle'); }
    const alte = ueberschneidungen(schicht.benutzer_id, schicht.datum, schicht.von, schicht.bis, schicht.schicht_id);
    if (alte.length) { ui.konflikt = { schicht, alte, name: person ? person.name : S.user.name, form: 'planForm' }; return go('konflikt'); }
    aktion('schicht_speichern', { schicht });
    ui.planForm = null; ui.planFehler = null; render();
    toast(l ? 'Gespeichert' : 'Vorgeschlagen');
  });
}

/* ---------- Zu bestätigen ---------- */
const HINWEIS_KNOEPFE = {
  registrierung: ['Freigeben', 'Ablehnen'], bon: ['Bestätigen', 'Stornieren'], ausverkauft: ['Bleibt aus', 'Wieder da'],
  schicht: ['Bestätigen', 'Ablehnen'], verknuepfung: ['Zuordnen', 'Trennen'], produkt: ['Freigeben', 'Ablehnen'], rueckmeldung: ['Erledigt', 'In Arbeit'],
  verantwortung: ['Annehmen', 'Ablehnen'], aenderung: ['Übernehmen', 'Ablehnen'], produktaenderung: ['Übernehmen', 'Ablehnen']
};
const HINWEIS_TITEL = { verantwortung: 'Verantwortung', registrierung: 'Registrierungen', schicht: 'Schichten und Zugang', verknuepfung: 'Platzhalter zuordnen', aenderung: 'Änderungsvorschläge',
  produktaenderung: 'Produktänderungen', bon: 'Umsätze außerhalb der Regeln', ausverkauft: 'Ausverkauft gemeldet', produkt: 'Produktvorschläge', rueckmeldung: 'Rückmeldungen' };
P.hinweise = {
  titel: 'Nachrichten',
  open: () => { ui.fremd = false; },
  kopf: () => fremdeHinweise().length ? `<div class="seg mini"><button data-fr="0" aria-pressed="${!ui.fremd}">Meine</button><button data-fr="1" aria-pressed="${!!ui.fremd}">Andere <span class="grauzahl">${fremdeHinweise().length}</span></button></div>` : '',
  body: () => {
    const l = (D.hinweise || []).filter(h => !!h.fremd === !!ui.fremd);
    const msgs = ui.fremd ? [] : (D.nachrichten || []);
    if (!l.length && !msgs.length) return `<div class="leer-ok">${I.check}<p>Alles erledigt</p></div>`;
    const karte = h => `<div class="card">
      <div class="hd"><b>${esc(h.titel)}</b>${h.zeit ? `<span class="muted">${fmtTime(h.zeit)}</span>` : ''}</div>
      <span class="muted">${esc(h.text)}${h.stand ? ' · ' + esc(h.stand) : ''}</span>
      <div class="acts"><button class="btn sm" data-h="${D.hinweise.indexOf(h)}" data-a="ja">${HINWEIS_KNOEPFE[h.typ][0]}</button><button class="btn ghost sm" data-h="${D.hinweise.indexOf(h)}" data-a="nein">${HINWEIS_KNOEPFE[h.typ][1]}</button></div></div>`;
    const todo = Object.keys(HINWEIS_TITEL).filter(t => l.some(h => h.typ === t)).map(t => `<h3 class="sub">${HINWEIS_TITEL[t]}</h3>` + l.filter(h => h.typ === t).map(karte).join('')).join('');
    const neu = msgs.filter(n => !n.gelesen), alt = msgs.filter(n => n.gelesen);
    const mk = n => `<div class="card msg${n.gelesen ? ' gelesen' : ''}"><div class="hd"><b>${esc(n.titel)}</b><span class="muted">${fmtTime(n.am)}</span></div>${n.text ? `<span>${esc(n.text)}</span>` : ''}${n.von ? `<span class="muted">${esc(n.von)}</span>` : ''}${n.gelesen ? '' : `<div class="acts"><button class="btn ghost sm" data-ok="${esc(n.id)}">OK</button></div>`}</div>`;
    return todo + (msgs.length ? `<h3 class="sub">Mitteilungen${neu.length > 1 ? ` <button class="mini-btn" data-alle>Alle gelesen</button>` : ''}</h3>${neu.map(mk).join('')}${alt.map(mk).join('')}` : '');
  },
  leiste: () => rang() >= 4 ? '<button class="btn ghost wide" data-go="rundschreiben">Nachricht schreiben</button>' : '',
  bind: root => {
    root.querySelectorAll('[data-fr]').forEach(b => b.addEventListener('click', () => { ui.fremd = b.dataset.fr === '1'; render(); }));
    root.querySelectorAll('[data-h]').forEach(b => b.addEventListener('click', () => {
      const h = D.hinweise[+b.dataset.h]; if (!h) return;
      aktion('hinweis_aktion', { typ: h.typ, id: h.id, aktion2: b.dataset.a });
      render();
    }));
    root.querySelectorAll('[data-ok]').forEach(b => b.addEventListener('click', () => { aktion('nachricht_gelesen', { id: b.dataset.ok }); render(); }));
    const a = root.querySelector('[data-alle]'); if (a) a.addEventListener('click', () => { aktion('nachricht_gelesen', { id: 'alle' }); render(); });
  }
};

/* ---------- Nachricht schreiben (Admin) ---------- */
P.rundschreiben = {
  form: true, eltern: 'hinweise',
  titel: 'Nachricht schreiben',
  open: () => { ui.rs = ui.rs || { art: 'alle', wert: '' }; },
  body: () => {
    const r = ui.rs;
    const wahl = r.art === 'rolle' ? Object.keys(ROLLEN).map(x => [x, x]) : r.art === 'markt' ? MAERKTE().map(m => [m.markt_id, m.name]) : r.art === 'stand' ? STAENDE().map(st => [st.stand_id, st.name + ' · ' + ((marktVon(st) || {}).name || '')]) : [];
    if (wahl.length && !wahl.some(w => w[0] === r.wert)) r.wert = wahl[0][0];
    return `<div class="field"><label>An</label><div class="seg" id="rs-a">${[['alle', 'Alle'], ['rolle', 'Rolle'], ['markt', 'Markt'], ['stand', 'Stand']].map(([k, t]) => `<button data-art="${k}" aria-pressed="${r.art === k}">${t}</button>`).join('')}</div></div>
      ${wahl.length ? `<div class="field"><select id="rs-w" aria-label="Auswahl">${optionen(wahl, r.wert)}</select></div>` : ''}
      <div class="field"><label for="rs-t">Betreff</label><input id="rs-t" value="${esc(r.titel || '')}"></div>
      <div class="field"><label for="rs-x">Text</label><textarea id="rs-x" rows="6">${esc(r.text || '')}</textarea></div>
      <p class="muted" style="margin:0">Markt und Stand: alle Zuständigen, Eingeplanten und Personen mit Aufgaben dort.</p>`;
  },
  leiste: () => '<button class="btn wide" data-send>Senden</button>',
  bind: root => {
    const r = ui.rs;
    const erfassen = () => { r.titel = val(root, '#rs-t'); r.text = root.querySelector('#rs-x').value.trim(); if (root.querySelector('#rs-w')) r.wert = val(root, '#rs-w'); };
    root.querySelectorAll('[data-art]').forEach(b => b.addEventListener('click', () => { erfassen(); r.art = b.dataset.art; render(); }));
    const b = root.querySelector('[data-send]');
    b.addEventListener('click', () => tue(b, async () => {
      erfassen();
      if (!r.titel) return toast('Betreff fehlt');
      const x = await call({ aktion: 'nachricht_senden', titel: r.titel, text: r.text, ziel: { art: r.art, wert: r.wert } }, true);
      if (x.ok) { ui.rs = null; toast('An ' + x.anzahl + ' Personen gesendet'); go('hinweise', { zurueck: true }); sync(); }
    }));
  }
};

/* ---------- Meine Aufgaben (aus Checklisten) ---------- */
const ortName = c => c.art === 'markt' ? ((MAERKTE().find(m => m.markt_id === c.ref_id) || {}).name || '') : standName(c.ref_id);
P.aufgaben = {
  titel: 'Meine Aufgaben',
  body: () => {
    const l = ((D && D.checklisten) || []).filter(c => c.zustaendig_id === S.user.benutzer_id).sort((a, b) => (a.erledigt - b.erledigt) || (a.faellig || '9').localeCompare(b.faellig || '9'));
    return l.length ? l.map(c => `<div class="card${c.erledigt ? ' gelesen' : ''}"><div class="hd"><b>${esc(c.text)}</b>${c.erledigt ? '<span class="pill ok">erledigt</span>' : c.faellig ? `<span class="pill ${c.faellig < today() ? 'st' : 'q'}">bis ${fmtDate(c.faellig)}</span>` : ''}</div><span class="muted">${esc(ortName(c))}</span></div>`).join('') : listeLeer('Keine Aufgaben');
  }
};

/* ---------- Checkliste je Stand oder Markt ---------- */
function checkZiel() { return ui.ck || { art: 'stand', ref: S.stand_id }; }
const darfCheck = z => z.art === 'markt' ? darfMarkt(z.ref) : darfStand(z.ref);
const zielName = z => z.art === 'markt' ? ((MAERKTE().find(m => m.markt_id === z.ref) || {}).name || '') : standName(z.ref);
P.checkliste = {
  get form() { return !!ui.ckForm; },
  eltern: () => ui.ck && ui.ck.eltern,
  titel: () => 'Checkliste · ' + zielName(checkZiel()),
  open: data => { if (data && data.art) ui.ck = data; else if (!(data && data.zurueck)) ui.ck = { art: 'stand', ref: S.stand_id }; ui.ckForm = null; },
  body: () => {
    const z = checkZiel(), darf = darfCheck(z);
    const l = ((D && D.checklisten) || []).filter(c => c.art === z.art && c.ref_id === z.ref).sort((a, b) => (a.erledigt - b.erledigt) || a.sortierung - b.sortierung);
    const offen = l.filter(c => !c.erledigt).length;
    const zeile = c => ui.ckForm && ui.ckForm.punkt_id === c.punkt_id ? punktForm() : `<div class="ckrow${c.erledigt ? ' done' : ''}">
      <button class="ckbox" ${darf ? `data-haken="${esc(c.punkt_id)}"` : 'disabled'} aria-label="${c.erledigt ? 'Erledigt' : 'Offen'}: ${esc(c.text)}" aria-pressed="${c.erledigt}">${c.erledigt ? I.check : ''}</button>
      <div class="ckt"${darf ? ` data-ced="${esc(c.punkt_id)}" role="button" tabindex="0"` : ''}><b>${esc(c.text)}</b><small>${[c.zustaendig && (c.zustaendig + (c.platzhalter ? ' (Platzhalter)' : '')), c.faellig && 'bis ' + fmtDate(c.faellig), c.erledigt && c.erledigt_von && '✓ ' + c.erledigt_von].filter(Boolean).map(esc).join(' · ')}</small></div></div>`;
    return `${l.length ? `<div class="prog"><span style="width:${((l.length - offen) / l.length * 100).toFixed(0)}%"></span></div><p class="muted" style="margin:0">${l.length - offen} von ${l.length} erledigt</p>` : ''}
      ${ui.ckForm && !ui.ckForm.punkt_id ? punktForm() : ''}
      ${l.map(zeile).join('') || listeLeer('Noch keine Punkte')}
      ${darf ? `<div class="acts" style="margin-top:6px"><select id="ck-v" aria-label="Vorlage">${optionen([['', 'Vorlage anwenden …']].concat((D.vorlagen || []).map(v => [v.vorlage_id, v.name + (v.typ === 'global' ? ' · global' : '')])), '')}</select><button class="mini-btn" data-go="vorlagen">Vorlagen</button></div>` : '<p class="muted">Ändern dürfen nur die Verantwortlichen.</p>'}`;
  },
  leiste: () => darfCheck(checkZiel()) && !ui.ckForm ? '<button class="btn wide" data-neu>Punkt hinzufügen</button>' : '',
  bind: root => {
    const z = checkZiel();
    const n = root.querySelector('[data-neu]'); if (n) n.addEventListener('click', () => { ui.ckForm = {}; render(); });
    root.querySelectorAll('[data-haken]').forEach(b => b.addEventListener('click', () => { const c = D.checklisten.find(x => x.punkt_id === b.dataset.haken); aktion('checkpunkt_haken', { punkt_id: c.punkt_id, erledigt: !c.erledigt }); render(); }));
    root.querySelectorAll('[data-ced]').forEach(b => b.addEventListener('click', () => { const c = D.checklisten.find(x => x.punkt_id === b.dataset.ced); ui.ckForm = Object.assign({}, c, { platzhalter: c.platzhalter ? c.zustaendig : '' }); render(); }));
    const v = root.querySelector('#ck-v');
    if (v) v.addEventListener('change', () => { if (!v.value) return; const id = v.value; tue(v, async () => { const r = await call({ aktion: 'vorlage_anwenden', art: z.art, ref_id: z.ref, vorlage_id: id }, true); if (r.ok) { toast(r.anzahl + ' Punkte übernommen'); await sync(); render(); } }); });
    const f = root.querySelector('.pform'); if (f) bindPunktForm(f, z);
  }
};
function punktForm() {
  const d = ui.ckForm, pers = (D.personen || []);
  const modus = d.modus || (d.platzhalter ? 'p' : 'b');
  return `<div class="card pform sform">
    <div class="field"><input id="pk-t" value="${esc(d.text || '')}" placeholder="Was ist zu tun?" aria-label="Text"></div>
    <div class="seg" id="pk-m"><button data-m="b" aria-pressed="${modus === 'b'}">Person</button><button data-m="p" aria-pressed="${modus === 'p'}">Platzhalter</button></div>
    ${modus === 'b' ? `<div class="field"><select id="pk-b" aria-label="Zuständig">${optionen([['', 'niemand']].concat(pers.map(p => [p.benutzer_id, p.name])), d.zustaendig_id || '')}</select></div>`
      : `<div class="field"><input id="pk-p" value="${esc(d.platzhalter || '')}" placeholder="Name" aria-label="Platzhalter"></div>`}
    <div class="field"><label for="pk-f">Erledigen bis</label><input type="date" id="pk-f" value="${esc(d.faellig || '')}"></div>
    <div class="acts"><button class="btn ghost sm" data-x="abbr">Abbrechen</button>${d.punkt_id ? '<button class="btn ghost sm danger-t" data-x="del">Löschen</button>' : ''}<button class="btn sm" style="margin-left:auto" data-x="spe">Speichern</button></div></div>`;
}
function bindPunktForm(f, z) {
  const d = ui.ckForm;
  const erfassen = () => { d.text = val(f, '#pk-t'); d.faellig = val(f, '#pk-f'); if (f.querySelector('#pk-b')) { d.zustaendig_id = val(f, '#pk-b'); d.platzhalter = ''; } if (f.querySelector('#pk-p')) { d.platzhalter = val(f, '#pk-p'); d.zustaendig_id = ''; } };
  f.querySelectorAll('#pk-m button').forEach(b => b.addEventListener('click', () => { erfassen(); d.modus = b.dataset.m; render(); }));
  f.querySelector('[data-x="abbr"]').addEventListener('click', () => { ui.ckForm = null; render(); });
  const del = f.querySelector('[data-x="del"]'); if (del) del.addEventListener('click', () => { aktion('checkpunkt_loeschen', { punkt_id: d.punkt_id }); ui.ckForm = null; render(); });
  f.querySelector('[data-x="spe"]').addEventListener('click', () => {
    erfassen();
    if (!d.text) return toast('Text fehlt');
    aktion('checkpunkt_speichern', { punkt: { punkt_id: d.punkt_id || uid().replace(/-/g, '').slice(0, 10), art: z.art, ref_id: z.ref, text: d.text, zustaendig_id: d.zustaendig_id || '', platzhalter: d.platzhalter || '', faellig: d.faellig || '', sortierung: d.sortierung } });
    ui.ckForm = null; render();
  });
}

/* ---------- Checklisten-Vorlagen ---------- */
P.vorlagen = {
  get form() { return !!ui.vl; },
  eltern: 'checkliste',
  titel: 'Checklisten-Vorlagen',
  open: () => { ui.vl = null; },
  body: () => {
    if (ui.vl) return vorlageForm();
    const l = D.vorlagen || [];
    const darf = v => v.eigen || (v.typ === 'global' && rang() >= 3);
    const zeile = v => `<button class="prow" ${darf(v) ? `data-ved="${esc(v.vorlage_id)}"` : 'disabled'}><span class="pn"><b>${esc(v.name)}</b><small>${v.punkte.length} Punkte${v.basis_id ? ' · erweitert ' + esc(((l.find(x => x.vorlage_id === v.basis_id) || {}).name) || '') : ''}</small></span></button>`;
    return `<h3 class="sub">Global</h3>${l.filter(v => v.typ === 'global').map(zeile).join('') || listeLeer('Keine')}
      <h3 class="sub">Meine</h3>${l.filter(v => v.typ !== 'global').map(zeile).join('') || listeLeer('Keine')}`;
  },
  leiste: () => ui.vl ? '' : `${rang() >= 3 ? '<button class="btn ghost" data-neu="global">Neue globale</button>' : ''}<button class="btn" data-neu="individuell">Neue eigene</button>`,
  bind: root => {
    root.querySelectorAll('[data-neu]').forEach(b => b.addEventListener('click', () => {
      const z = checkZiel();
      const aktuell = ((D && D.checklisten) || []).filter(c => c.art === z.art && c.ref_id === z.ref);
      ui.vl = { typ: b.dataset.neu, name: '', basis_id: '', punkte: aktuell.map(c => ({ text: c.text, tage: '' })) };
      render();
    }));
    root.querySelectorAll('[data-ved]').forEach(b => b.addEventListener('click', () => { const v = D.vorlagen.find(x => x.vorlage_id === b.dataset.ved); ui.vl = JSON.parse(JSON.stringify(v)); render(); }));
    const f = root.querySelector('.vform'); if (f) bindVorlageForm(f);
  }
};
function vorlageForm() {
  const v = ui.vl;
  return `<div class="vform"><div class="field"><label for="vl-n">Name</label><input id="vl-n" value="${esc(v.name)}"></div>
    ${v.typ !== 'global' ? `<div class="field"><label for="vl-b">Erweitert</label><select id="vl-b">${optionen([['', 'keine globale Vorlage']].concat((D.vorlagen || []).filter(x => x.typ === 'global').map(x => [x.vorlage_id, x.name])), v.basis_id)}</select></div>` : ''}
    <h3 class="sub">Punkte · Tage vor Beginn</h3>
    ${v.punkte.map((p, i) => `<div class="vrow"><input data-vt="${i}" value="${esc(p.text)}" aria-label="Punkt"><input data-vd="${i}" inputmode="numeric" value="${esc(p.tage)}" placeholder="–" aria-label="Tage vorher"><button class="del" data-vx="${i}" aria-label="entfernen">${I.trash}</button></div>`).join('')}
    <button class="mini-btn" style="margin:0;align-self:flex-start" data-vadd>+ Punkt</button>
    <div class="acts" style="margin-top:12px"><button class="btn ghost sm" data-x="abbr">Abbrechen</button>${v.vorlage_id ? '<button class="btn ghost sm danger-t" data-x="del">Löschen</button>' : ''}<button class="btn sm" style="margin-left:auto" data-x="spe">Speichern</button></div></div>`;
}
function bindVorlageForm(f) {
  const v = ui.vl;
  const erfassen = () => { v.name = val(f, '#vl-n'); if (f.querySelector('#vl-b')) v.basis_id = val(f, '#vl-b'); v.punkte = [...f.querySelectorAll('[data-vt]')].map((x, i) => ({ text: x.value.trim(), tage: f.querySelector(`[data-vd="${i}"]`).value.trim() })); };
  f.querySelector('[data-vadd]').addEventListener('click', () => { erfassen(); v.punkte.push({ text: '', tage: '' }); render(); const l = app.querySelectorAll('[data-vt]'); if (l.length) l[l.length - 1].focus(); });
  f.querySelectorAll('[data-vx]').forEach(b => b.addEventListener('click', () => { erfassen(); v.punkte.splice(+b.dataset.vx, 1); render(); }));
  f.querySelector('[data-x="abbr"]').addEventListener('click', () => { ui.vl = null; render(); });
  const del = f.querySelector('[data-x="del"]');
  if (del) del.addEventListener('click', () => tue(del, async () => { const r = await call({ aktion: 'vorlage_loeschen', vorlage_id: v.vorlage_id }, true); if (r.ok) { ui.vl = null; await sync(); render(); } }));
  const s = f.querySelector('[data-x="spe"]');
  s.addEventListener('click', () => tue(s, async () => {
    erfassen();
    if (!v.name) return toast('Name fehlt');
    const r = await call({ aktion: 'vorlage_speichern', vorlage: Object.assign({}, v, { punkte: v.punkte.filter(p => p.text) }) }, true);
    if (r.ok) { ui.vl = null; toast('Gespeichert'); await sync(); render(); }
  }));
}

/* ---------- Umsatz heute ---------- */
P.uebersicht = {
  stand: true, key: 'uebersicht',
  titel: 'Umsatz heute',
  open: () => laden('uebersicht', { aktion: 'uebersicht', stand_id: S.stand_id }),
  body: () => geladen('uebersicht', x => {
    const s = x.staende[S.stand_id] || { bons: 0, summe: 0 };
    const andere = Object.keys(x.staende).filter(id => id !== S.stand_id);
    const max = Math.max(1, ...x.top.map(t => t.menge));
    return `<div class="stats"><div class="stat"><small>${esc(standName())}</small><b class="num">${eur(s.summe)}</b></div><div class="stat"><small>Bons</small><b class="num">${s.bons}</b></div></div>
      ${x.top.length ? `<h3 class="sub">Meistverkauft</h3>${x.top.map(t => `<div class="barrow"><span>${esc(t.name)}</span><span class="bv"><span style="width:${(t.menge / max * 100).toFixed(1)}%"></span></span><b class="num">${t.menge}</b></div>`).join('')}` : ''}
      ${andere.length ? `<h3 class="sub">Weitere Stände</h3>${andere.map(id => `<div class="kv"><span>${esc(standName(id) || id)}</span><b class="num">${eur(x.staende[id].summe)} · ${x.staende[id].bons} Bons</b></div>`).join('')}` : ''}`;
  })
};

/* ---------- Personalverwaltung: freischalten und einladen ---------- */
const codesLaden = () => leitet() ? laden('personal', { aktion: 'personal', stand_id: S.stand_id }) : null;
P.personal = {
  key: 'personal',
  get form() { return !!(document.activeElement && document.activeElement.id === 'ei-n'); },
  titel: 'Personalverwaltung',
  open: () => { ui.neuerCode = null; ui.einladung = null; codesLaden(); },
  body: () => `${leitet() ? `<h3 class="sub">Heute freischalten · ${esc(standName())}</h3>
    ${ui.neuerCode ? `<div class="codebox"><small>Einmalcode · gilt heute</small><b class="num">${fmtCode(ui.neuerCode)}</b></div>` : ''}
    <button class="btn wide" data-code>Neuen Code erzeugen</button>
    ${geladen('personal', x => x.codes.slice().reverse().map(c => `<div class="card">
      <div class="hd"><b class="num">${fmtCode(c.code)}</b><span class="pill ${c.entzogen ? 'st' : c.offen ? 'q' : 'ok'}">${c.entzogen ? 'entzogen' : c.offen ? 'offen' : esc(c.eingeloest_name)}</span></div>
      ${!c.entzogen ? `<div class="acts">${ui.confirm === c.code ? `Freischaltung entziehen? <button class="btn danger sm" data-entz="${c.code}">Ja</button><button class="btn ghost sm" data-nein>Nein</button>` : `<button class="mini-btn" data-ask="${c.code}">Entziehen</button>`}
        ${!c.offen ? `<button class="mini-btn" data-plan="${esc(c.benutzer_id)}">In Plan eintragen</button>` : ''}</div>` : ''}</div>`).join(''))}` : ''}
    <h3 class="sub">Neue Person einladen</h3>
    ${ui.einladung ? `<div class="card"><b>${esc(ui.einladung.name)}</b><span class="muted">Link gilt 24 Stunden · Freigabe danach über die Glocke</span><div class="linkbox">${esc(ui.einladung.url)}</div>
        <div class="acts"><button class="btn sm" data-teilen>${navigator.share ? 'Link teilen' : 'Link kopieren'}</button><button class="btn ghost sm" data-weitere>Weitere Person</button></div></div>`
      : `<div class="einlad"><input id="ei-n" placeholder="Name" autocapitalize="words" autocomplete="off" aria-label="Name der Person"><button class="btn sm" data-einladen>Link erstellen</button></div>`}`,
  bind: root => {
    const b = root.querySelector('[data-code]');
    if (b) b.addEventListener('click', () => tue(b, async () => {
      const r = await call({ aktion: 'code_erzeugen', stand_id: S.stand_id }, true);
      if (r.ok) { ui.neuerCode = r.code; render(); codesLaden(); }
    }));
    bindConfirm(root, code => {
      const c = ((L.personal || {}).codes || []).find(x => x.code === code); if (c) c.entzogen = true; render();
      call({ aktion: 'zugang_entziehen', code }, true).then(codesLaden);
    }, 'entz');
    root.querySelectorAll('[data-plan]').forEach(x => x.addEventListener('click', () => go('plan', { benutzer_id: x.dataset.plan })));
    const e = root.querySelector('[data-einladen]');
    if (e) e.addEventListener('click', () => {
      const name = val(root, '#ei-n').replace(/\s+/g, ' '); if (name.length < 2) return toast('Name fehlt');
      tue(e, async () => { const r = await call({ aktion: 'einladung_erstellen', name }, true); if (r.ok) { ui.einladung = { name: r.name, url: location.origin + location.pathname + '?e=' + r.token }; render(); } });
    });
    const w = root.querySelector('[data-weitere]'); if (w) w.addEventListener('click', () => { ui.einladung = null; render(); });
    const t = root.querySelector('[data-teilen]');
    if (t) t.addEventListener('click', async () => {
      const u = ui.einladung.url;
      if (navigator.share) { try { await navigator.share({ title: E().app_titel, text: 'Einladung für ' + ui.einladung.name, url: u }); } catch (x) {} }
      else { try { await navigator.clipboard.writeText(u); toast('Kopiert'); } catch (x) { toast('Link markieren und kopieren'); } }
    });
  }
};

/* ---------- Bons & Storno des Stands ---------- */
const standBonsLaden = () => laden('standbons', { aktion: 'bons_liste', stand_id: S.stand_id, datum: ui.bonsTag });
P.standbons = {
  stand: true, key: 'standbons',
  titel: 'Bons des Stands',
  open: () => { ui.bonsTag = ui.bonsTag || today(); if (L.standbons && L.standbons.datum !== ui.bonsTag) L.standbons = null; standBonsLaden(); },
  body: () => `<div class="field"><input type="date" id="bt" value="${esc(ui.bonsTag)}" aria-label="Tag"></div>` + geladen('standbons', x => {
    const ok = x.bons.filter(b => b.status === 'ok');
    return `<div class="stats"><div class="stat"><small>Umsatz</small><b class="num">${eur(ok.reduce((a, b) => a + b.summe, 0))}</b></div><div class="stat"><small>Bons</small><b class="num">${ok.length}</b></div></div>` +
      (x.bons.length ? x.bons.map(b => bonKarte(b, b.status === 'ok', b.name + (b.hinweis ? ' · ' + b.hinweis + (b.bestaetigt ? ' ✓' : '') : ''))).join('') : listeLeer('Keine Bons'));
  }),
  bind: root => {
    root.querySelector('#bt').addEventListener('change', e => { ui.bonsTag = e.target.value; L.standbons = null; render(); standBonsLaden(); });
    bindConfirm(root, id => {
      const b = ((L.standbons || {}).bons || []).find(x => x.bon_id === id); if (b) b.status = 'storniert';
      stornoEnqueue(id);
    });
  }
};

/* ---------- Nachtrag ---------- */
P.nachtrag = {
  stand: true, form: true,
  titel: 'Nachtrag erfassen',
  body: () => { const n = new Date(); n.setMinutes(n.getMinutes() - n.getTimezoneOffset()); return `<p class="muted" style="margin:0">${esc(standName())}</p><div class="formrow"><div class="field"><label for="nt-d">Datum</label><input type="date" id="nt-d" value="${n.toISOString().slice(0, 10)}"></div><div class="field"><label for="nt-t">Uhrzeit</label><input type="time" id="nt-t" value="${n.toISOString().slice(11, 16)}"></div></div>`; },
  leiste: () => '<button class="btn wide" data-nt>Weiter zur Kasse</button>',
  bind: root => root.querySelector('[data-nt]').addEventListener('click', () => {
    const d = val(root, '#nt-d'), t = val(root, '#nt-t'); if (!d || !t) return;
    S.nachtrag = { zeit: new Date(d + 'T' + t).toISOString(), stand_id: S.stand_id }; S.cart = {}; home();
  })
};

/* ---------- Rückmeldung, Anzeige, Abgleich ---------- */
P.feedback = {
  form: true,
  titel: 'Rückmeldung',
  body: () => `<div class="field"><label>Art</label><div class="seg" id="fb-typ">${['Problem', 'Idee', 'Kommentar'].map((t, i) => `<button data-t="${t}" aria-pressed="${i === 0}">${t}</button>`).join('')}</div></div>
    <div class="field"><label for="fb-text">Text</label><textarea id="fb-text" rows="6"></textarea></div>`,
  leiste: () => '<button class="btn wide" data-send>Senden</button>',
  bind: root => {
    root.querySelectorAll('#fb-typ button').forEach(b => b.addEventListener('click', () => root.querySelectorAll('#fb-typ button').forEach(x => x.setAttribute('aria-pressed', x === b))));
    root.querySelector('[data-send]').addEventListener('click', () => {
      const text = root.querySelector('#fb-text').value.trim(); if (!text) return toast('Text fehlt');
      enqueue('Rueckmeldung', { rm_id: uid(), zeit: new Date().toISOString(), benutzer_id: S.user.benutzer_id, stand_id: S.stand_id || '', typ: root.querySelector('#fb-typ [aria-pressed="true"]').dataset.t, text, geraet_info: navigator.userAgent.slice(0, 120) });
      home(); toast('Gesendet');
    });
  }
};
P.anzeige = {
  titel: 'Anzeige',
  body: () => `<div class="field"><label>Größe der Kacheln und Schrift</label><div class="seg big">${[[1, 'Normal'], [2, 'Groß'], [3, 'Sehr groß']].map(([v, l]) => `<button data-gr="${v}" aria-pressed="${(S.anzeige || 1) === v}">${l}</button>`).join('')}</div></div>
    <p class="muted">Gilt nur auf diesem Gerät.</p>`,
  bind: root => root.querySelectorAll('[data-gr]').forEach(b => b.addEventListener('click', () => { S.anzeige = +b.dataset.gr; render(); }))
};
P.abgleich = {
  titel: 'Abgleich',
  body: () => `<div class="stats"><div class="stat"><small>Wartend</small><b class="num">${S.queue.length}</b></div><div class="stat"><small>Letzter Abgleich</small><b class="num" style="font-size:20px">${S.letzterAbgleich ? fmtClock(S.letzterAbgleich) : '–'}</b></div></div>
    ${S.letzterFehler ? `<p class="errlist">${esc(S.letzterFehler)}</p>` : ''}
    ${(S.fehlerlog || []).length ? `<div class="errlist"><b>Nicht übernommen</b><br>${S.fehlerlog.slice(-6).reverse().map(f => `${fmtClock(f.zeit)} · ${esc(f.fehler)}`).join('<br>')}</div>` : ''}
    <p class="hint" style="margin:0">${DEMO ? 'Demo' : 'Gerät ' + esc(S.geraet_id.slice(0, 8))} · ${APP_VERSION}</p>`,
  leiste: () => '<button class="btn wide" data-sync>Jetzt abgleichen</button>',
  bind: root => { const b = root.querySelector('[data-sync]'); b.addEventListener('click', () => tue(b, async () => { await sync(); render(); })); }
};
