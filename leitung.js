/* Weihnachtsmarkt-Kasse · App 2.0 · Stand-Menü, Hinweise, Personalplan */
'use strict';

/* gemeinsame Hilfen für Listen, die vom Server geladen werden */
const L = {};   // geladene Daten je Overlay
async function laden(key, params, post) {
  L[key] = { laden: true };
  const r = await call(params, post);
  L[key] = r.ok ? r : { fehler: r.fehler || 'Kein Netz' };
  if (ui.overlay && OV[ui.overlay] && (OV[ui.overlay].key === key)) render();
  return r;
}
function geladen(key, fn) {
  const x = L[key];
  if (!x || x.laden) return ladeHtml;
  if (x.fehler) return `<p class="err">${esc(x.fehler)}</p>`;
  return fn(x);
}
const optionen = (liste, wert) => liste.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(wert) ? ' selected' : ''}>${esc(t)}</option>`; }).join('');
const val = (root, sel) => { const el = root.querySelector(sel); return el ? el.value.trim() : ''; };
const zurueckStand = () => 'stand';

/* ---------- Stand-Menü ---------- */
OV.stand = {
  titel: () => standName(),
  body: () => {
    const l = leitet();
    return menuItems([
      l ? ['uebersicht', I.chart, 'Übersicht'] : null,
      ['plan', I.cal, 'Personalplan'],
      ['verfuegbarkeit', I.box, 'Verfügbarkeit'],
      l ? ['personal', I.users, 'Codes & Personal'] : null,
      l ? ['hinweise', I.bell, 'Zu bestätigen', D.hinweise || ''] : null,
      l ? ['standbons', I.receipt, 'Bons des Stands'] : null,
      l ? ['nachtrag', I.plus, 'Nachtrag'] : null,
      rang() >= 2 ? ['einladen', I.send, 'Einladen'] : null,
      l ? ['stedit', I.edit, 'Stand bearbeiten'] : null,
      ['wechseln', I.pin, 'Stand wechseln']
    ]);
  }
};
OV.wechseln = {
  titel: () => 'Stand wechseln',
  body: () => standKarten(false),
  bind: root => bindStandKarten(root)
};

/* ---------- Hinweise ---------- */
const HINWEIS_KNOEPFE = {
  registrierung: ['Freigeben', 'Ablehnen'], bon: ['Bestätigen', 'Stornieren'], ausverkauft: ['Bleibt aus', 'Zurücksetzen'],
  schicht: ['Bestätigen', 'Ablehnen'], verknuepfung: ['Verknüpfen', 'Trennen'], produkt: ['Freigeben', 'Ablehnen'], rueckmeldung: ['Erledigt', 'In Arbeit']
};
const HINWEIS_TITEL = { registrierung: 'Registrierungen', bon: 'Umsätze', ausverkauft: 'Ausverkauft', schicht: 'Schichtvorschläge', verknuepfung: 'Platzhalter', produkt: 'Produktvorschläge', rueckmeldung: 'Rückmeldungen' };
OV.hinweise = {
  key: 'hinweise',
  open: () => laden('hinweise', { aktion: 'hinweise' }),
  zurueck: () => S.stand_id && stand() && !needsCode(S.stand_id) ? null : null,
  titel: () => 'Hinweise',
  body: () => geladen('hinweise', x => {
    if (!x.hinweise.length) return listeLeer('Nichts zu tun');
    const gruppen = {};
    x.hinweise.forEach(h => (gruppen[h.typ] = gruppen[h.typ] || []).push(h));
    return Object.keys(HINWEIS_TITEL).filter(t => gruppen[t]).map(t => `<h3 class="sub">${HINWEIS_TITEL[t]}</h3>` + gruppen[t].map(h => `<div class="card">
      <div class="hd"><b>${esc(h.titel)}</b>${h.zeit ? `<span class="muted">${fmtTime(h.zeit)}</span>` : ''}</div>
      <span class="muted">${esc(h.text)}${h.stand ? ' · ' + esc(h.stand) : ''}</span>
      <div class="acts"><button class="btn sm" data-h="${x.hinweise.indexOf(h)}" data-a="ja">${HINWEIS_KNOEPFE[t][0]}</button><button class="btn ghost sm" data-h="${x.hinweise.indexOf(h)}" data-a="nein">${HINWEIS_KNOEPFE[t][1]}</button></div></div>`).join('')).join('');
  }),
  bind: root => root.querySelectorAll('[data-h]').forEach(b => b.addEventListener('click', async () => {
    const h = L.hinweise.hinweise[+b.dataset.h]; if (!h) return;
    const typ = h.typ, id = h.id, a = b.dataset.a;
    b.disabled = true;
    const r = await call({ aktion: 'hinweis_aktion', typ, id, aktion2: a }, true);
    if (r.ok) { L.hinweise.hinweise = L.hinweise.hinweise.filter(h => !(h.typ === typ && h.id === id)); D.hinweise = L.hinweise.hinweise.length; render(); sync(); }
    else b.disabled = false;
  }))
};

/* ---------- Übersicht ---------- */
OV.uebersicht = {
  key: 'uebersicht', zurueck: zurueckStand,
  open: () => laden('uebersicht', { aktion: 'uebersicht', stand_id: S.stand_id }),
  titel: () => 'Übersicht heute',
  body: () => geladen('uebersicht', x => {
    const s = x.staende[S.stand_id] || { bons: 0, summe: 0 };
    const andere = Object.keys(x.staende).filter(id => id !== S.stand_id);
    return `<div class="stats"><div class="stat"><small>Umsatz</small><b class="num">${eur(s.summe)}</b></div><div class="stat"><small>Bons</small><b class="num">${s.bons}</b></div></div>
      ${x.top.length ? `<h3 class="sub">Meistverkauft</h3>${x.top.map(t => `<div class="kv"><span>${esc(t.name)}</span><b class="num">${t.menge}</b></div>`).join('')}` : ''}
      ${andere.length ? `<h3 class="sub">Weitere Stände</h3>${andere.map(id => `<div class="kv"><span>${esc(standName(id) || id)}</span><b class="num">${eur(x.staende[id].summe)} · ${x.staende[id].bons}</b></div>`).join('')}` : ''}`;
  })
};

/* ---------- Verfügbarkeit ---------- */
OV.verfuegbarkeit = {
  zurueck: zurueckStand,
  titel: () => 'Verfügbarkeit',
  body: () => {
    const l = leitet();
    return sortimentFor(stand()).map(p => {
      const v = availOf(S.stand_id, p.produkt_id);
      return `<div class="availrow"><div class="hd"><b>${esc(p.name)}</b></div>${l
        ? `<div class="seg avail">${[['verfuegbar', 'da'], ['ausverkauft', 'ausverkauft'], ['nicht_da', 'ausblenden']].map(([k, t]) => `<button data-v="${k}" data-p="${esc(p.produkt_id)}" aria-pressed="${v === k}">${t}</button>`).join('')}</div>`
        : v === 'verfuegbar' ? `<button class="mini-btn" data-v="ausverkauft" data-p="${esc(p.produkt_id)}">Ausverkauft melden</button>` : `<span class="pill st">${v === 'ausverkauft' ? 'ausverkauft' : 'ausgeblendet'}</span>`}</div>`;
    }).join('') || listeLeer('Keine Produkte');
  },
  bind: root => root.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => {
    enqueue('Verfuegbarkeit', { stand_id: S.stand_id, produkt_id: b.dataset.p, status: b.dataset.v, geaendert_am: new Date().toISOString() });
    render();
  }))
};

/* ---------- Codes & Personal ---------- */
OV.personal = {
  key: 'personal', zurueck: zurueckStand,
  open: () => laden('personal', { aktion: 'personal', stand_id: S.stand_id }),
  titel: () => 'Codes & Personal',
  body: () => `${ui.neuerCode ? `<div class="codebox"><small>Einmalcode · heute</small><b class="num">${fmtCode(ui.neuerCode)}</b></div>` : ''}
    <button class="btn wide" data-x="code">Neuer Code</button>
    ${geladen('personal', x => x.codes.length ? x.codes.slice().reverse().map(c => `<div class="card">
      <div class="hd"><b class="num">${fmtCode(c.code)}</b><span class="pill ${c.entzogen ? 'st' : c.offen ? 'q' : 'ok'}">${c.entzogen ? 'entzogen' : c.offen ? 'offen' : esc(c.eingeloest_name)}</span></div>
      ${!c.entzogen ? `<div class="acts">${ui.confirm === c.code ? `Entziehen? <button class="btn danger sm" data-entz="${c.code}">Ja</button><button class="btn ghost sm" data-nein>Nein</button>` : `<button class="mini-btn" data-ask="${c.code}">Entziehen</button>`}
        ${!c.offen ? `<button class="mini-btn" data-plan="${esc(c.benutzer_id)}">Zum Plan</button>` : ''}</div>` : ''}</div>`).join('') : '')}`,
  close: () => { ui.neuerCode = null; },
  bind: root => {
    root.querySelector('[data-x="code"]').addEventListener('click', async () => {
      const r = await call({ aktion: 'code_erzeugen', stand_id: S.stand_id }, true);
      if (r.ok) { ui.neuerCode = r.code; laden('personal', { aktion: 'personal', stand_id: S.stand_id }); render(); }
    });
    bindConfirm(root, async code => { await call({ aktion: 'zugang_entziehen', code }, true); laden('personal', { aktion: 'personal', stand_id: S.stand_id }); }, 'entz');
    root.querySelectorAll('[data-plan]').forEach(b => b.addEventListener('click', () => { ui.planNeu = { benutzer_id: b.dataset.plan }; go('plan'); }));
  }
};

/* ---------- Bons des Stands, Nachtrag ---------- */
OV.standbons = {
  key: 'standbons', zurueck: zurueckStand,
  open: () => { ui.bonsTag = ui.bonsTag || today(); laden('standbons', { aktion: 'bons_liste', stand_id: S.stand_id, datum: ui.bonsTag }); },
  titel: () => 'Bons des Stands',
  body: () => `<div class="field"><input type="date" id="bt" value="${esc(ui.bonsTag)}" aria-label="Tag"></div>` + geladen('standbons', x => {
    const ok = x.bons.filter(b => b.status === 'ok');
    return `<div class="stats"><div class="stat"><small>Umsatz</small><b class="num">${eur(ok.reduce((a, b) => a + b.summe, 0))}</b></div><div class="stat"><small>Bons</small><b class="num">${ok.length}</b></div></div>` +
      (x.bons.length ? x.bons.map(b => bonKarte(b, b.status === 'ok', b.name + (b.hinweis ? ' · ' + b.hinweis + (b.bestaetigt ? ' ✓' : '') : ''))).join('') : listeLeer('Keine Bons'));
  }),
  bind: root => {
    root.querySelector('#bt').addEventListener('change', e => { ui.bonsTag = e.target.value; OV.standbons.open(); render(); });
    bindConfirm(root, id => {
      stornoEnqueue(id);
      const b = (L.standbons.bons || []).find(x => x.bon_id === id); if (b) b.status = 'storniert';
      render();
    });
  }
};
OV.nachtrag = {
  form: true, zurueck: zurueckStand,
  titel: () => 'Nachtrag',
  body: () => { const n = new Date(); n.setMinutes(n.getMinutes() - n.getTimezoneOffset()); return `<div class="formrow"><div class="field"><label for="nt-d">Datum</label><input type="date" id="nt-d" value="${n.toISOString().slice(0, 10)}"></div><div class="field"><label for="nt-t">Uhrzeit</label><input type="time" id="nt-t" value="${n.toISOString().slice(11, 16)}"></div></div>`; },
  footer: () => '<button class="btn wide" data-x="go">Erfassen</button>',
  bind: root => root.querySelector('[data-x="go"]').addEventListener('click', () => {
    const d = val(root, '#nt-d'), t = val(root, '#nt-t'); if (!d || !t) return;
    S.nachtrag = { zeit: new Date(d + 'T' + t).toISOString(), stand_id: S.stand_id }; S.cart = {}; ui.overlay = null; render();
  })
};

/* ---------- Einladen ---------- */
OV.einladen = {
  form: true, zurueck: () => S.stand_id ? 'stand' : null,
  titel: () => 'Einladen',
  open: () => { ui.einladung = null; },
  body: () => ui.einladung ? `<p class="muted" style="margin:0">${esc(ui.einladung.name)} · 24 Stunden gültig</p>
      <div class="linkbox">${esc(ui.einladung.url)}</div>`
    : '<div class="field"><label for="ei-n">Name</label><input id="ei-n" autocapitalize="words"></div>',
  footer: () => ui.einladung ? `<button class="btn ghost" data-x="neu">Weitere</button><button class="btn" style="flex:1" data-x="teilen">${navigator.share ? 'Teilen' : 'Kopieren'}</button>` : '<button class="btn wide" data-x="ok">Link erstellen</button>',
  bind: root => {
    const x = (k, f) => { const b = root.querySelector(`[data-x="${k}"]`); if (b) b.addEventListener('click', f); };
    x('ok', async () => {
      const name = val(root, '#ei-n').replace(/\s+/g, ' '); if (name.length < 2) return;
      const r = await call({ aktion: 'einladung_erstellen', name }, true);
      if (r.ok) { ui.einladung = { name: r.name, url: location.origin + location.pathname + '?e=' + r.token }; render(); }
    });
    x('neu', () => { ui.einladung = null; render(); });
    x('teilen', async () => {
      const u = ui.einladung.url;
      if (navigator.share) { try { await navigator.share({ title: E().app_titel, text: 'Einladung für ' + ui.einladung.name, url: u }); } catch (e) {} }
      else { try { await navigator.clipboard.writeText(u); toast('Kopiert'); } catch (e) { toast('Link markieren und kopieren'); } }
    });
  }
};

/* ---------- Personalplan ---------- */
const AUFGABE_FARBE = ['#1F6E24', '#2158A1', '#A8352A', '#B07A2A', '#6B4FA0', '#2E8A8A', '#8B5A2B'];
const aufgabeFarbe = a => AUFGABE_FARBE[Math.max(0, (D.aufgaben || []).indexOf(a)) % AUFGABE_FARBE.length];
OV.plan = {
  key: 'plan', zurueck: () => needsCode(S.stand_id) ? null : 'stand',
  open: () => laden('plan', { aktion: 'plan', stand_id: S.stand_id }).then(r => {
    if (r.ok && (!ui.planTag || !r.standzeiten.some(z => z.datum === ui.planTag))) {
      const t = today(); const z = r.standzeiten.find(x => x.datum >= t) || r.standzeiten[0]; ui.planTag = z ? z.datum : t; render();
    }
  }),
  titel: () => 'Personalplan',
  body: () => geladen('plan', x => {
    const tage = x.standzeiten.map(z => z.datum);
    const tag = ui.planTag;
    const sz = x.standzeiten.find(z => z.datum === tag);
    const liste = x.schichten.filter(s => s.datum === tag).sort((a, b) => a.von.localeCompare(b.von) || a.aufgabe.localeCompare(b.aufgabe));
    let a = sz ? toMin(sz.von) : 8 * 60, e = sz ? toMin(sz.bis) : 20 * 60;
    liste.forEach(s => { a = Math.min(a, toMin(s.von)); e = Math.max(e, toMin(s.bis)); });
    const span = Math.max(60, e - a), pct = m => ((m - a) / span * 100).toFixed(2) + '%';
    const stunden = []; for (let h = Math.ceil(a / 60); h * 60 <= e; h++) stunden.push(h);
    const jetzt = tag === today() && nowMin() >= a && nowMin() <= e ? `<span class="now" style="left:${pct(nowMin())}"></span>` : '';
    const zeile = s => {
      const mein = s.benutzer_id === S.user.benutzer_id;
      const kann = x.leitung || (mein && s.status === 'vorgeschlagen');
      return `<div class="srow${s.status !== 'geplant' ? ' offen' : ''}">
        <div class="sl"><b>${esc(s.name)}${s.platzhalter ? ' <span class="pill q">Platzhalter</span>' : ''}</b><small>${esc(s.aufgabe)} · ${s.von}–${s.bis}${s.status === 'vorgeschlagen' ? ' · Vorschlag' : s.status === 'verknuepfung' ? ' · Verknüpfung offen' : s.status === 'abgelehnt' ? ' · abgelehnt' : ''}</small></div>
        <div class="track"><span class="blk" style="left:${pct(toMin(s.von))};width:calc(${pct(toMin(s.bis))} - ${pct(toMin(s.von))});background:${aufgabeFarbe(s.aufgabe)}"></span>${jetzt}</div>
        ${kann ? (ui.confirm === s.schicht_id ? `<div class="acts">Löschen? <button class="btn danger sm" data-sdel="${esc(s.schicht_id)}">Ja</button><button class="btn ghost sm" data-nein>Nein</button></div>`
          : `<div class="acts">${x.leitung ? `<button class="mini-btn" data-sed="${esc(s.schicht_id)}">Ändern</button>` : ''}<button class="mini-btn" data-ask="${esc(s.schicht_id)}">Löschen</button></div>`) : ''}</div>`;
    };
    return `${tage.length > 1 ? `<div class="chips plan">${tage.map(t => `<button class="chip" data-tag="${t}" aria-pressed="${t === tag}">${fmtDate(t)}</button>`).join('')}</div>` : ''}
      <p class="muted" style="margin:0">${fmtDate(tag)}${sz ? ' · ' + sz.von + '–' + sz.bis : ''}</p>
      <div class="scale">${stunden.map(h => `<span style="left:${pct(h * 60)}">${h}</span>`).join('')}</div>
      ${liste.length ? liste.map(zeile).join('') : listeLeer('Noch niemand eingeteilt')}
      ${ui.planNeu ? schichtForm(x) : ''}`;
  }),
  footer: () => { const x = L.plan; if (!x || !x.ok || ui.planNeu) return ''; return `<button class="btn wide" data-x="neu">${x.leitung ? 'Schicht hinzufügen' : 'Mich eintragen'}</button>`; },
  close: () => { ui.planNeu = null; },
  bind: root => {
    root.querySelectorAll('[data-tag]').forEach(b => b.addEventListener('click', () => { ui.planTag = b.dataset.tag; render(); }));
    const neu = root.querySelector('[data-x="neu"]'); if (neu) neu.addEventListener('click', () => { ui.planNeu = {}; render(); const f = app.querySelector('.sform'); if (f) f.scrollIntoView({ block: 'nearest' }); });
    root.querySelectorAll('[data-sed]').forEach(b => b.addEventListener('click', () => { ui.planNeu = Object.assign({}, L.plan.schichten.find(s => s.schicht_id === b.dataset.sed)); render(); }));
    bindConfirm(root, async id => { const r = await call({ aktion: 'schicht_loeschen', schicht_id: id }, true); if (r.ok) OV.plan.open(); }, 'sdel');
    const f = root.querySelector('.sform');
    if (f) {
      const modus = f.querySelector('#sf-m');
      if (modus) modus.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { ui.planNeu.modus = b.dataset.m; ui.planNeu.von = val(f, '#sf-von'); ui.planNeu.bis = val(f, '#sf-bis'); ui.planNeu.aufgabe = val(f, '#sf-a'); render(); }));
      f.querySelector('[data-x="abbr"]').addEventListener('click', () => { ui.planNeu = null; render(); });
      f.querySelector('[data-x="spe"]').addEventListener('click', async () => {
        const d = ui.planNeu;
        const schicht = { schicht_id: d.schicht_id || '', stand_id: S.stand_id, datum: ui.planTag, von: val(f, '#sf-von'), bis: val(f, '#sf-bis'), aufgabe: val(f, '#sf-a') };
        if (L.plan.leitung) { if ((d.modus || (d.platzhalter ? 'p' : 'b')) === 'p') schicht.platzhalter = val(f, '#sf-p'); else schicht.benutzer_id = val(f, '#sf-b'); }
        const r = await call({ aktion: 'schicht_speichern', schicht }, true);
        if (r.ok) { ui.planNeu = null; toast(L.plan.leitung ? 'Gespeichert' : 'Vorgeschlagen'); OV.plan.open(); }
      });
    }
  }
};
function schichtForm(x) {
  const d = ui.planNeu, sz = x.standzeiten.find(z => z.datum === ui.planTag) || { von: '10:00', bis: '14:00' };
  const modus = d.modus || (d.platzhalter ? 'p' : 'b');
  const personen = x.personen || [];
  const aufg = (x.aufgaben || []).filter(a => a !== 'Standleitung' || !x.leitung || modus === 'b');
  return `<div class="sform card">
    <b>${d.schicht_id ? 'Schicht ändern' : x.leitung ? 'Neue Schicht' : 'Mich eintragen'} · ${fmtDate(ui.planTag)}</b>
    ${x.leitung ? `<div class="seg" id="sf-m"><button data-m="b" aria-pressed="${modus === 'b'}">Person</button><button data-m="p" aria-pressed="${modus === 'p'}">Platzhalter</button></div>
      ${modus === 'b' ? `<div class="field"><select id="sf-b" aria-label="Person">${optionen(personen.map(p => [p.benutzer_id, p.name + (ROLLEN[p.rolle] >= 2 ? ' · ' + p.rolle : '')]), d.benutzer_id)}</select></div>`
        : `<div class="field"><input id="sf-p" placeholder="Name" value="${esc(d.platzhalter ? d.name : '')}" aria-label="Platzhalter"></div>`}` : ''}
    <div class="formrow"><div class="field"><label for="sf-von">Von</label><input type="time" id="sf-von" value="${esc(d.von || sz.von)}"></div><div class="field"><label for="sf-bis">Bis</label><input type="time" id="sf-bis" value="${esc(d.bis || sz.bis)}"></div></div>
    <div class="field"><label for="sf-a">Aufgabe</label><select id="sf-a">${optionen(aufg, d.aufgabe || aufg.find(a => a !== 'Standleitung'))}</select></div>
    <div class="acts"><button class="btn ghost sm" data-x="abbr">Abbrechen</button><button class="btn sm" data-x="spe">${x.leitung ? 'Speichern' : 'Vorschlagen'}</button></div></div>`;
}
