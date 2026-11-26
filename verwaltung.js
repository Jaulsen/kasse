/* Weihnachtsmarkt-Kasse · App 2.6 · Stand einrichten, Marktleitung, Admin */
'use strict';

/* ---------- Verantwortliche (Stand und Markt) ---------- */
function verantwHtml(art, ref) {
  const ids = verantwortliche(art, ref), ich = S.user.benutzer_id, binIch = ids.includes(ich);
  const hoeher = art === 'stand' ? rang() >= 3 : rang() >= 4;
  const minRang = art === 'markt' ? 3 : 2;
  const kandidaten = (D.personen || []).filter(p => ROLLEN[p.rolle] >= minRang && !ids.includes(p.benutzer_id));
  const v = ui.vw && ui.vw.art === art && ui.vw.ref === ref ? ui.vw : null;
  return `<div data-sofort class="vblock"><h3 class="sub">Verantwortlich</h3><div class="vlist">${ids.map(id => `<span class="pill s">${esc(personName(id) || '?')}${id === ich ? ' (du)' : ''}${hoeher && ids.length > 1 && id !== ich ? ` <button class="xbtn" data-ventf="${esc(id)}" aria-label="entfernen">×</button>` : ''}</span>`).join('')}</div>
    ${binIch || hoeher ? (v ? `<div class="card sform"><b>${v.modus === 'abgeben' ? 'Verantwortung abgeben an' : 'Zweite Person'}</b>
        <div class="field"><select id="vw-z" aria-label="Person">${optionen(kandidaten.map(p => [p.benutzer_id, p.name]), '')}</select></div>
        <p class="muted" style="margin:0">Die Person muss zustimmen.</p>
        <div class="acts"><button class="btn ghost sm" data-vw="abbr">Abbrechen</button><button class="btn sm" style="margin-left:auto" data-vw="ok" ${kandidaten.length ? '' : 'disabled'}>Anfragen</button></div></div>`
      : `<div class="acts">${ids.length < 2 ? '<button class="mini-btn" data-vw="teilen">+ Zweite Person</button>' : ''}${binIch ? '<button class="mini-btn" data-vw="abgeben">Abgeben</button>' : ''}${binIch && ids.length > 1 ? '<button class="mini-btn" data-vw="zurueck">Zurücktreten</button>' : ''}</div>`) : ''}</div>`;
}
function bindVerantw(root, art, ref, erfassen) {
  root.querySelectorAll('[data-vw]').forEach(b => b.addEventListener('click', () => {
    if (erfassen) erfassen();
    const k = b.dataset.vw;
    if (k === 'teilen' || k === 'abgeben') { ui.vw = { art, ref, modus: k }; return render(); }
    if (k === 'abbr') { ui.vw = null; return render(); }
    if (k === 'zurueck') { aktion('verantwortung', { art, ref_id: ref, modus: 'zuruecktreten' }); D.verantwortung[art + ':' + ref] = verantwortliche(art, ref).filter(x => x !== S.user.benutzer_id); return render(); }
    if (k === 'ok') { const z = val(root, '#vw-z'); if (!z) return; aktion('verantwortung', { art, ref_id: ref, ziel_id: z, modus: ui.vw.modus }); ui.vw = null; render(); toast('Anfrage gesendet'); }
  }));
  root.querySelectorAll('[data-ventf]').forEach(b => b.addEventListener('click', () => { if (erfassen) erfassen(); aktion('verantwortung', { art, ref_id: ref, ziel_id: b.dataset.ventf, modus: 'entfernen' }); D.verantwortung[art + ':' + ref] = verantwortliche(art, ref).filter(x => x !== b.dataset.ventf); render(); }));
}

/* ---------- Stand einrichten ---------- */
function standDaten(st, eltern, personen) {
  ui.se = { stand_id: st ? st.stand_id : '', markt_id: st ? st.markt_id : ui.neuMarkt, name: st ? st.name : '', kategorien: st ? (st.kategorien === 'ALLE' ? 'ALLE' : st.kategorien.slice()) : 'ALLE',
    standzeiten: st ? st.standzeiten.map(z => Object.assign({}, z)) : [], leitung: st && st.leitung ? st.leitung.map(l => l.benutzer_id) : [], personen: personen || null, eltern };
  ui.se.leitungAlt = ui.se.leitung.slice();
}
function seErfassen(root) {
  const se = ui.se;
  const n = root.querySelector('#se-n'); if (n) se.name = n.value.trim();
  se.standzeiten = [...root.querySelectorAll('.zrow')].map(r => ({ datum: r.querySelector('[data-zd]').value, von: r.querySelector('[data-zv]').value, bis: r.querySelector('[data-zb]').value }));
}
function preisKategorien(se) {
  return KATS().filter(k => k.preis_je_markt && (se.kategorien === 'ALLE' || se.kategorien.includes(k.kategorie))).map(k => k.kategorie);
}
P.standedit = {
  form: true,
  open: data => { if (!data) standDaten(stand(), null, null); },
  eltern: () => ui.se && ui.se.eltern,
  titel: () => ui.se.stand_id ? (ui.se.eltern ? ui.se.name || 'Stand' : 'Stand einrichten') : 'Neuer Stand',
  body: () => {
    const se = ui.se, alle = se.kategorien === 'ALLE';
    const m = MAERKTE().find(x => x.markt_id === se.markt_id);
    return `<div class="field"><label for="se-n">Name</label><input id="se-n" value="${esc(se.name)}"></div>
      <h3 class="sub">Standzeiten${m ? ' · ' + esc(m.name) : ''}</h3>
      ${se.standzeiten.map((z, i) => `<div class="zrow"><input type="date" data-zd value="${esc(z.datum)}" aria-label="Datum"><input type="time" data-zv value="${esc(z.von)}" aria-label="von"><input type="time" data-zb value="${esc(z.bis)}" aria-label="bis"><button class="del" data-zx="${i}" aria-label="Tag entfernen">${I.trash}</button></div>`).join('')}
      <button class="mini-btn" style="margin:0;align-self:flex-start" data-x="ztag">+ Tag</button>
      <h3 class="sub">Sortiment</h3>
      <div class="chips wrap">
        <button class="chip" data-kat="ALLE" aria-pressed="${alle}">Alle</button>
        ${KATS().map(k => `<button class="chip" data-kat="${esc(k.kategorie)}" aria-pressed="${!alle && se.kategorien.includes(k.kategorie)}">${esc(k.kategorie)}</button>`).join('')}</div>
      ${se.personen && (!se.stand_id || darfStand(se.stand_id)) ? `<h3 class="sub">Standleitung</h3><div class="chips wrap">${se.personen.filter(p => ROLLEN[p.rolle] >= 2).map(p => `<button class="chip" data-sl="${esc(p.benutzer_id)}" aria-pressed="${se.leitung.includes(p.benutzer_id)}">${esc(p.name)}</button>`).join('') || '<span class="muted">Niemand mit Rolle Standleitung</span>'}</div>` : ''}
      ${se.stand_id ? verantwHtml('stand', se.stand_id) : ''}
      ${se.stand_id ? `<div class="menu"><button class="item" data-nav data-x="check"><span class="ic">${I.list}</span><span>Checkliste</span><small style="margin-left:auto">${((D.checklisten || []).filter(c => c.art === 'stand' && c.ref_id === se.stand_id && !c.erledigt).length) || ''}</small></button>${preisKategorien(se).length ? `<button class="item" data-nav data-x="preise"><span class="ic">${I.euro}</span><span>Preise für diesen Markt</span></button>` : ''}</div>
        ${darfMarkt(se.markt_id) ? (ui.confirm === 'arch' ? `<div class="confirm">Stand archivieren? <button class="btn danger sm" data-x="archja">Ja</button><button class="btn ghost sm" data-nein>Nein</button></div>` : '<button class="btn ghost wide danger-t" data-nav data-x="arch">Stand archivieren</button>') : ''}` : ''}`;
  },
  leiste: () => `<button class="btn wide" data-x="spe">${!ui.se.stand_id || darfStand(ui.se.stand_id) ? 'Speichern' : 'Änderung vorschlagen'}</button>`,
  bind: root => {
    const se = ui.se;
    if (se.stand_id) bindVerantw(root, 'stand', se.stand_id, () => seErfassen(root));
    const x = (k, f) => { const b = root.querySelector(`[data-x="${k}"]`); if (b) b.addEventListener('click', () => f(b)); };
    x('ztag', () => {
      seErfassen(root);
      const letzte = se.standzeiten[se.standzeiten.length - 1];
      const d = letzte && letzte.datum ? new Date(new Date(letzte.datum + 'T12:00:00').getTime() + 864e5).toLocaleDateString('sv-SE') : today();
      se.standzeiten.push({ datum: d, von: letzte ? letzte.von : '10:00', bis: letzte ? letzte.bis : '20:00' }); render();
    });
    root.querySelectorAll('[data-zx]').forEach(b => b.addEventListener('click', () => { seErfassen(root); se.standzeiten.splice(+b.dataset.zx, 1); render(); }));
    root.querySelectorAll('[data-kat]').forEach(b => b.addEventListener('click', () => {
      seErfassen(root);
      const k = b.dataset.kat;
      if (k === 'ALLE') se.kategorien = 'ALLE';
      else { const l = se.kategorien === 'ALLE' ? [] : se.kategorien; se.kategorien = l.includes(k) ? l.filter(y => y !== k) : l.concat(k); if (!se.kategorien.length) se.kategorien = 'ALLE'; }
      render();
    }));
    root.querySelectorAll('[data-sl]').forEach(b => b.addEventListener('click', () => { seErfassen(root); const id = b.dataset.sl; se.leitung = se.leitung.includes(id) ? se.leitung.filter(y => y !== id) : se.leitung.concat(id); render(); }));
    x('preise', () => { seErfassen(root); go('preise'); });
    x('check', () => { seErfassen(root); go('checkliste', { art: 'stand', ref: se.stand_id, eltern: 'standedit' }); });
    x('arch', () => { seErfassen(root); ui.confirm = 'arch'; render(); });
    root.querySelectorAll('[data-nein]').forEach(b => b.addEventListener('click', () => { seErfassen(root); ui.confirm = null; render(); }));
    const speichern = async archiviert => {
      seErfassen(root);
      if (!se.name) return toast('Name fehlt');
      if (se.standzeiten.some(z => !z.datum || !z.von || !z.bis || toMin(z.bis) <= toMin(z.von))) return toast('Standzeiten prüfen');
      const r = await call({ aktion: 'stand_speichern', stand: { stand_id: se.stand_id, markt_id: se.markt_id, name: se.name, kategorien: se.kategorien, standzeiten: se.standzeiten, archiviert: !!archiviert } }, true);
      if (!r.ok) return;
      if (r.vorschlag) { ui.confirm = null; toast('Vorschlag an die Verantwortlichen gesendet'); if (se.eltern) go(se.eltern, { zurueck: true }); else home(); return; }
      if (se.personen) {
        se.leitung.filter(i => !se.leitungAlt.includes(i)).forEach(id => aktion('zustaendigkeit', { art: 'stand', ref_id: r.stand_id, ziel_id: id, an: true }));
        se.leitungAlt.filter(i => !se.leitung.includes(i)).forEach(id => aktion('zustaendigkeit', { art: 'stand', ref_id: r.stand_id, ziel_id: id, an: false }));
      }
      ui.confirm = null;
      if (archiviert && S.stand_id === se.stand_id) { S.stand_id = null; S.cart = {}; }
      toast(archiviert ? 'Archiviert' : 'Gespeichert');
      if (se.eltern) { strukturLaden(); go(se.eltern); } else home();
      sync();
    };
    x('spe', b => tue(b, () => speichern(false)));
    x('archja', b => tue(b, () => speichern(true)));
  }
};

P.preise = {
  form: true, eltern: 'standedit',
  titel: 'Preise für diesen Markt',
  body: () => {
    const se = ui.se, m = MAERKTE().find(x => x.markt_id === se.markt_id);
    return `<p class="muted" style="margin:0">${esc(m ? m.name : '')} · leer = Standardpreis</p>` + preisKategorien(se).map(k => `<h3 class="sub">${esc(k)}</h3>` +
      PRODS().filter(p => p.kategorie === k).map(p => { const eigen = (D.preise || []).find(r => r.markt_id === se.markt_id && r.produkt_id === p.produkt_id);
        return `<div class="kv"><span>${esc(p.name)}</span><input class="pin-in num" inputmode="decimal" data-pp="${esc(p.produkt_id)}" data-alt="${eigen ? eigen.preis : ''}" value="${eigen ? (eigen.preis / 100).toFixed(2).replace('.', ',') : ''}" placeholder="${(p.preis / 100).toFixed(2).replace('.', ',')}" aria-label="Preis ${esc(p.name)}"></div>`; }).join('')).join('');
  },
  leiste: () => '<button class="btn wide" data-spe>Speichern</button>',
  bind: root => root.querySelector('[data-spe]').addEventListener('click', () => {
    const neu = [];
    for (const i of root.querySelectorAll('[data-pp]')) {
      const t = i.value.trim().replace(',', '.'), c = t === '' ? '' : Math.round(parseFloat(t) * 100);
      if (t !== '' && isNaN(c)) return toast('Preis prüfen');
      if (String(c) !== i.dataset.alt) neu.push([i.dataset.pp, c]);
    }
    neu.forEach(([pid, c]) => {
      aktion('preis_speichern', { markt_id: ui.se.markt_id, produkt_id: pid, preis: c, stand_id: ui.se.stand_id });
      if (!darfStand(ui.se.stand_id)) return;
      D.preise = (D.preise || []).filter(r => !(r.markt_id === ui.se.markt_id && r.produkt_id === pid));
      if (c !== '') D.preise.push({ markt_id: ui.se.markt_id, produkt_id: pid, preis: c });
    });
    toast(darfStand(ui.se.stand_id) ? 'Gespeichert' : 'Vorschlag gesendet'); go('standedit', true);
  })
};

/* ---------- Märkte & Stände ---------- */
const strukturLaden = () => laden('struktur', { aktion: 'struktur' });
P.struktur = {
  key: 'struktur',
  titel: 'Märkte & Stände',
  open: strukturLaden,
  body: () => geladen('struktur', x => {
    const aktiv = x.maerkte.filter(m => !m.archiviert || ui.zeigeArchiv);
    return `${aktiv.map(m => `<div class="card">
      <div class="hd"><b>${rang() >= 4 && GRUPPEN_L().length ? `<span class="gtag${m.gruppe_id ? '' : ' ohne'}">${esc(m.gruppe_id ? gruppeName(m.gruppe_id) : 'ohne ' + GRUPPE)}</span> ` : ''}${esc(m.name)}</b><span class="acts">${m.recht ? `<button class="mini-btn" data-mcp="${esc(m.markt_id)}">Kopieren</button><button class="mini-btn" data-med="${esc(m.markt_id)}">Bearbeiten</button>` : ''}</span></div>
      <span class="muted">${esc([m.ort, m.datum_von && fmtDate(m.datum_von) + (m.datum_bis && m.datum_bis !== m.datum_von ? ' – ' + fmtDate(m.datum_bis) : '')].filter(Boolean).join(' · '))}${m.leitung.filter(l => l.verantwortlich).length ? ' · Verantwortlich: ' + esc(m.leitung.filter(l => l.verantwortlich).map(l => l.name).join(', ')) : ''}${m.archiviert ? ' · archiviert' : ''}</span>
      ${m.check && m.check[1] ? `<div class="ampel">${ampelPill(m.check[0] === m.check[1] ? 'gr' : 'ge', '✓ ' + m.check[0] + '/' + m.check[1])}</div>` : ''}
      ${x.staende.filter(s => s.markt_id === m.markt_id && (!s.archiviert || ui.zeigeArchiv)).map(s => `<div class="srow-btn"><div><b><span class="adot ${standAmpel(s)}"></span>${esc(s.name)}</b><small>${esc(s.leitung.map(l => l.name + (l.verantwortlich ? ' ★' : '')).join(', ') || 'ohne Standleitung')}${s.archiviert ? ' · archiviert' : ''}</small></div>
        ${!s.archiviert ? `<div class="ampel">${standAmpelPills(s)}</div>` : ''}
        ${s.recht ? `<div class="acts">${!s.archiviert && stand(s.stand_id) ? `<button class="mini-btn" data-spl="${esc(s.stand_id)}">${I.cal} Personalplanung</button>` : ''}<button class="mini-btn" data-sted="${esc(s.stand_id)}">${I.edit} Einrichten</button></div>` : ''}</div>`).join('')}
      ${m.aendern ? `<button class="mini-btn" style="margin:0;align-self:flex-start" data-mned="${esc(m.markt_id)}">+ Stand</button>` : ''}</div>`).join('') || listeLeer('Kein Markt')}
      <p class="muted" style="margin:0">★ verantwortlich</p>
      <button class="mini-btn" style="margin:0" data-archiv>${ui.zeigeArchiv ? 'Archiv ausblenden' : 'Archiv zeigen'}</button>`;
  }),
  leiste: () => '<button class="btn wide" data-neu>Neuer Markt</button>',
  bind: root => {
    const x = L.struktur || {};
    root.querySelector('[data-neu]').addEventListener('click', () => { ui.me = { markt_id: '', name: '', ort: '', datum_von: today(), datum_bis: today(), archiviert: false, leitung: [], leitungAlt: [] }; go('marktedit'); });
    const ar = root.querySelector('[data-archiv]'); if (ar) ar.addEventListener('click', () => { ui.zeigeArchiv = !ui.zeigeArchiv; render(); });
    root.querySelectorAll('[data-sted]').forEach(b => b.addEventListener('click', () => { const s = x.staende.find(y => y.stand_id === b.dataset.sted); if (s.recht) { standDaten(s, 'struktur', x.personen); go('standedit', true); } }));
    root.querySelectorAll('[data-spl]').forEach(b => b.addEventListener('click', () => go('plan', { stand_id: b.dataset.spl })));
    root.querySelectorAll('[data-mned]').forEach(b => b.addEventListener('click', () => { ui.neuMarkt = b.dataset.mned; standDaten(null, 'struktur', x.personen); go('standedit', true); }));
    root.querySelectorAll('[data-mcp]').forEach(b => b.addEventListener('click', () => { const m = x.maerkte.find(y => y.markt_id === b.dataset.mcp); ui.kp = { markt_id: m.markt_id, alt: m.name, name: m.name.replace(/\d{4}/, y => String(+y + 1)), datum_von: '' }; go('kopieren'); }));
    root.querySelectorAll('[data-med]').forEach(b => b.addEventListener('click', () => { const m = x.maerkte.find(y => y.markt_id === b.dataset.med); ui.me = Object.assign({}, m, { leitung: m.leitung.map(l => l.benutzer_id) }); ui.me.leitungAlt = ui.me.leitung.slice(); go('marktedit'); }));
  }
};
/* Ampel je Stand: rot = keine Verantwortlichen oder heute niemand eingeteilt, gelb = Lücken oder offene Checkliste */
const ampelPill = (f, t) => `<span class="apill ${f}">${esc(t)}</span>`;
function standAmpel(s) {
  if (s.archiviert) return '';
  const ohneV = !s.leitung.some(l => l.verantwortlich), p = s.plan;
  if (ohneV || (p && p.datum === today() && p.luecke > 0 && !p.schichten)) return 'ro';
  if ((p && p.luecke > 0) || (s.check && s.check[0] < s.check[1])) return 'ge';
  return 'gr';
}
function standAmpelPills(s) {
  const out = [], p = s.plan;
  if (!s.leitung.some(l => l.verantwortlich)) out.push(ampelPill('ro', 'keine Verantwortlichen'));
  if (p) out.push(p.luecke > 0 ? ampelPill(p.datum === today() && !p.schichten ? 'ro' : 'ge', (p.datum === today() ? 'Heute' : fmtDate(p.datum)) + ': ' + (p.schichten ? Math.round(p.luecke / 6) / 10 + ' Std. offen' : 'niemand eingeteilt')) : ampelPill('gr', (p.datum === today() ? 'Heute' : fmtDate(p.datum)) + ' besetzt'));
  if (s.check && s.check[1]) out.push(ampelPill(s.check[0] === s.check[1] ? 'gr' : 'ge', '✓ ' + s.check[0] + '/' + s.check[1]));
  return out.join('');
}
P.marktedit = {
  form: true, eltern: 'struktur',
  titel: () => ui.me.markt_id ? ui.me.name || 'Markt' : 'Neuer Markt',
  body: () => {
    const m = ui.me, pers = (L.struktur && L.struktur.personen) || [];
    return `<div class="field"><label for="me-n">Name</label><input id="me-n" value="${esc(m.name)}"></div>
      <div class="field"><label for="me-o">Ort</label><input id="me-o" value="${esc(m.ort)}"></div>
      <div class="formrow"><div class="field"><label for="me-v">Von</label><input type="date" id="me-v" value="${esc(m.datum_von)}"></div><div class="field"><label for="me-b">Bis</label><input type="date" id="me-b" value="${esc(m.datum_bis)}"></div></div>
      ${rang() >= 4 && GRUPPEN_L().length ? `<div class="field"><label for="me-g">${GRUPPE}</label><select id="me-g">${optionen([['', 'alle ' + GRUPPEN]].concat(GRUPPEN_L().map(g => [g.gruppe_id, g.name])), m.gruppe_id === undefined ? S.user.gruppe_id : m.gruppe_id)}</select></div>` : ''}
      ${rang() >= 4 && !m.markt_id ? `<h3 class="sub">Marktleitung</h3><div class="chips wrap">${pers.filter(p => ROLLEN[p.rolle] >= 3).map(p => `<button class="chip" data-ml="${esc(p.benutzer_id)}" aria-pressed="${m.leitung.includes(p.benutzer_id)}">${esc(p.name)}</button>`).join('') || '<span class="muted">Niemand mit Rolle Marktleitung</span>'}</div>` : ''}
      ${m.markt_id ? verantwHtml('markt', m.markt_id) : ''}
      ${m.markt_id ? `<div class="menu"><button class="item" data-nav data-mck><span class="ic">${I.list}</span><span>Checkliste</span></button></div>` : ''}
      ${m.markt_id ? `<label class="check"><input type="checkbox" id="me-a" ${m.archiviert ? 'checked' : ''}> Archiviert</label>` : ''}`;
  },
  leiste: () => `<button class="btn wide" data-spe>${!ui.me.markt_id || darfMarkt(ui.me.markt_id) ? 'Speichern' : 'Änderung vorschlagen'}</button>`,
  bind: root => {
    const m = ui.me;
    if (m.markt_id) bindVerantw(root, 'markt', m.markt_id, () => erfassen());
    const ck = root.querySelector('[data-mck]'); if (ck) ck.addEventListener('click', () => { erfassen(); go('checkliste', { art: 'markt', ref: m.markt_id, eltern: 'marktedit' }); });
    const erfassen = () => { m.name = val(root, '#me-n'); m.ort = val(root, '#me-o'); m.datum_von = val(root, '#me-v'); m.datum_bis = val(root, '#me-b'); const a = root.querySelector('#me-a'); if (a) m.archiviert = a.checked; if (root.querySelector('#me-g')) m.gruppe_id = val(root, '#me-g'); };
    root.querySelectorAll('[data-ml]').forEach(b => b.addEventListener('click', () => { erfassen(); const id = b.dataset.ml; m.leitung = m.leitung.includes(id) ? m.leitung.filter(y => y !== id) : m.leitung.concat(id); render(); }));
    const b = root.querySelector('[data-spe]');
    b.addEventListener('click', () => tue(b, async () => {
      erfassen();
      if (!m.name) return toast('Name fehlt');
      const r = await call({ aktion: 'markt_speichern', markt: m }, true);
      if (!r.ok) return;
      if (r.vorschlag) { toast('Vorschlag an die Verantwortlichen gesendet'); go('struktur'); return; }
      if (rang() >= 4) {
        m.leitung.filter(i => !m.leitungAlt.includes(i)).forEach(id => aktion('zustaendigkeit', { art: 'markt', ref_id: r.markt_id, ziel_id: id, an: true }));
        m.leitungAlt.filter(i => !m.leitung.includes(i)).forEach(id => aktion('zustaendigkeit', { art: 'markt', ref_id: r.markt_id, ziel_id: id, an: false }));
      }
      toast('Gespeichert'); strukturLaden(); go('struktur'); sync();
    }));
  }
};

/* ---------- Markt kopieren ---------- */
P.kopieren = {
  form: true, eltern: 'struktur',
  titel: 'Markt kopieren',
  body: () => `<p class="muted" style="margin:0">Von „${esc(ui.kp.alt)}“: Stände, Standzeiten (auf die neuen Tage verschoben), Sortiment, Preise, Checklisten und Verantwortliche. Der Personalplan wird nicht kopiert.</p>
    <div class="field"><label for="kp-n">Name</label><input id="kp-n" value="${esc(ui.kp.name)}"></div>
    <div class="field"><label for="kp-d">Erster Markttag</label><input type="date" id="kp-d" value="${esc(ui.kp.datum_von)}"></div>`,
  leiste: () => '<button class="btn wide" data-kp>Kopieren</button>',
  bind: root => {
    const b = root.querySelector('[data-kp]');
    b.addEventListener('click', () => tue(b, async () => {
      const name = val(root, '#kp-n'), d = val(root, '#kp-d');
      if (!name || !d) return toast('Name und Datum angeben');
      const r = await call({ aktion: 'markt_kopieren', markt_id: ui.kp.markt_id, name, datum_von: d }, true);
      if (r.ok) { toast('Kopiert · ' + r.staende + ' Stände'); strukturLaden(); go('struktur', { zurueck: true }); sync(); }
    }));
  }
};

/* ---------- Produkte ---------- */
const produkteLaden = () => laden('produkte', { aktion: 'produkte_admin' });
P.produkte = {
  key: 'produkte', eltern: 'einstellungen',
  titel: 'Alle Produkte',
  open: () => { ui.pq = ui.pq || ''; produkteLaden(); },
  body: () => `<label class="search">${I.search}<input id="pq" type="search" placeholder="Suchen" value="${esc(ui.pq)}" aria-label="Produkt suchen"></label>` + geladen('produkte', x => {
    const q = ui.pq.toLowerCase();
    const l = x.produkte.filter(p => !q || trifft(p, q))
      .sort((a, b) => (b.vorschlag - a.vorschlag) || kat(a.kategorie).sortierung - kat(b.kategorie).sortierung || a.sortierung - b.sortierung || a.name.localeCompare(b.name));
    let last = null;
    return `<div class="plist">${l.map(p => { const h = !q && !p.vorschlag && p.kategorie !== last ? `<h3 class="sub">${esc(p.kategorie)}</h3>` : ''; if (!p.vorschlag) last = p.kategorie;
      return h + `<button class="prow" data-ped="${esc(p.produkt_id)}"><span class="dot" style="background:${esc(kat(p.kategorie).farbe)}"></span><span class="pn"><b>${esc(p.name)}</b><small>${esc(p.kategorie)}</small></span>
      ${p.vorschlag ? '<span class="pill q">Vorschlag</span>' : !p.aktiv ? '<span class="pill st">aus</span>' : ''}<b class="num">${eur(p.preis)}</b></button>`; }).join('') || listeLeer('Nichts gefunden')}</div>`;
  }),
  leiste: () => '<button class="btn wide" data-neu>Neues Produkt</button>',
  bind: root => {
    const q = root.querySelector('#pq');
    q.addEventListener('input', () => { ui.pq = q.value; const p = q.selectionStart; render(); const n = app.querySelector('#pq'); n.focus(); n.setSelectionRange(p, p); });
    root.querySelector('[data-neu]').addEventListener('click', () => openProdukt(null, 'produkte'));
    root.querySelectorAll('[data-ped]').forEach(b => b.addEventListener('click', () => openProdukt(b.dataset.ped, 'produkte')));
  }
};
function openProdukt(pid, eltern) {
  let p = null;
  if (pid) {
    const liste = (L.produkte && L.produkte.produkte) || [];
    p = liste.find(x => x.produkt_id === pid);
    if (!p) { const d = prod(pid); if (!d) return; p = { produkt_id: d.produkt_id, name: d.name, kategorie: d.kategorie, preis: d.preis, bild: d.bild, sortierung: d.sortierung, aktiv: true, beschreibung: d.beschreibung, info_dateien: (d.info || []).map(i => i.name), verantwortlich_id: d.verantwortlich_id, verantwortlich_platzhalter: d.verantwortlich_id ? '' : d.verantwortlich, pfand_id: d.pfand_id || '', suchbegriffe: d.suchbegriffe || '', verantwortlich: d.verantwortlich || '' }; }
  }
  ui.pe = p ? Object.assign({}, p, { info_dateien: p.info_dateien.slice() }) : { produkt_id: '', name: '', kategorie: (KATS()[0] || {}).kategorie || '', preis: 0, sortierung: 0, aktiv: true, beschreibung: '', info_dateien: [] };
  ui.pe.neuBild = null; ui.pe.neuDateien = []; ui.pe.eltern = eltern;
  go('produkt');
}
/* Pfand-Produkte: Kategorie mit „Pfand“ im Namen, sonst alle mit „Pfand“ im Produktnamen */
function pfandListe(p) {
  const alle = ((L.produkte && L.produkte.produkte) || PRODS()).filter(x => x.produkt_id !== p.produkt_id && x.preis > 0);
  const k = alle.filter(x => /pfand/i.test(x.kategorie));
  return (k.length ? k : alle.filter(x => /pfand/i.test(x.name)));
}
function dateiLesen(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
async function bildVerkleinern(f, w, h, zuschneiden) {
  const url = await dateiLesen(f);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  let sw = img.width, sh = img.height, sx = 0, sy = 0, tw, th;
  if (zuschneiden) { const r = w / h; if (sw / sh > r) { sx = (sw - sh * r) / 2; sw = sh * r; } else { sy = (sh - sw / r) / 2; sh = sw / r; } tw = w; th = h; }
  else { const s = Math.min(1, w / sw, w / sh); tw = Math.round(sw * s); th = Math.round(sh * s); }
  const c = document.createElement('canvas'); c.width = tw; c.height = th;
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
  return c.toDataURL('image/jpeg', 0.82);
}
P.produkt = {
  form: true,
  eltern: () => ui.pe && ui.pe.eltern,
  titel: () => ui.pe.produkt_id ? 'Produkt bearbeiten' : rang() >= 3 ? 'Neues Produkt' : 'Produkt vorschlagen',
  body: () => {
    const p = ui.pe, src = p.neuBild || (p.bild ? imgUrl('bilder', p.bild) : '');
    const ml = rang() >= 3;
    const vm = p.vmodus || (p.verantwortlich_platzhalter && !p.verantwortlich_id ? 'p' : 'b');
    return `${ml ? `<div class="field"><label for="pe-n">Name</label><input id="pe-n" value="${esc(p.name)}"></div>
      <div class="formrow"><div class="field"><label for="pe-k">Kategorie</label><select id="pe-k">${optionen(KATS().map(k => k.kategorie), p.kategorie)}</select></div>
        <div class="field"><label for="pe-p">Preis €</label><input id="pe-p" inputmode="decimal" value="${(p.preis / 100).toFixed(2).replace('.', ',')}"></div></div>
      <div class="field"><label>Produktverantwortlich</label><div class="seg" id="pe-vm"><button data-vm="b" aria-pressed="${vm === 'b'}">Person</button><button data-vm="p" aria-pressed="${vm === 'p'}">Platzhalter</button></div>
        ${vm === 'b' ? `<select id="pe-v" aria-label="Verantwortlich">${optionen([['', 'niemand']].concat((D.personen || []).map(x => [x.benutzer_id, x.name]), p.verantwortlich_id && !(D.personen || []).some(x => x.benutzer_id === p.verantwortlich_id) ? [[p.verantwortlich_id, p.verantwortlich || 'bisherige Person']] : []), p.verantwortlich_id || '')}</select>`
          : `<input id="pe-vp" value="${esc(p.verantwortlich_platzhalter || '')}" placeholder="Name" aria-label="Platzhalter">`}</div>`
      : `<div class="card"><b>${esc(p.name)}</b><span class="muted">${esc(p.kategorie)} · ${eur(p.preis)}</span><span class="muted">${(prod(p.produkt_id) || {}).verantwortlich_id === S.user.benutzer_id || rang() >= 4 ? 'Du bist verantwortlich: Änderungen gelten sofort.' : 'Bild und Beschreibung werden nach Bestätigung durch die Produktverantwortlichen übernommen.'}</span></div>`}
      ${ml ? `<div class="formrow">${rang() >= 4 ? `<div class="field"><label for="pe-s">Sortierung</label><input id="pe-s" inputmode="numeric" value="${p.sortierung}"></div>` : ''}<label class="check" style="align-self:end"><input type="checkbox" id="pe-a" ${p.aktiv ? 'checked' : ''}> Aktiv</label></div>
      <div class="field"><label for="pe-sb">Suchbegriffe</label><input id="pe-sb" value="${esc(p.suchbegriffe || '')}" autocomplete="off"></div>
      <div class="field"><label for="pe-pf">Pfand dazu</label><select id="pe-pf">${optionen([['', 'kein Pfand']].concat(pfandListe(p).map(x => [x.produkt_id, x.name + ' · ' + eur(x.preis)])), p.pfand_id || '')}</select></div>` : ''}
      <div class="field"><label for="pe-b">Beschreibung</label><textarea id="pe-b" rows="3">${esc(p.beschreibung)}</textarea></div>
      <div class="field"><label>Bild</label><div class="imgedit">${src ? `<img src="${src}" alt="">` : '<span class="ph">kein Bild</span>'}<label class="mini-btn">Wählen<input type="file" accept="image/*" id="pe-i" hidden></label></div></div>
      <div class="field"><label>Infos (Bilder, PDF)</label><div class="thumbs">${p.info_dateien.map((n, i) => `<span class="tb">${esc(n)}<button data-ix="${i}" aria-label="entfernen">×</button></span>`).join('')}${p.neuDateien.map((f, i) => `<span class="tb neu">${esc(f.name)}<button data-nx="${i}" aria-label="entfernen">×</button></span>`).join('')}</div>
        <label class="mini-btn" style="align-self:flex-start;margin:0">+ Datei<input type="file" accept="image/*,application/pdf" id="pe-z" multiple hidden></label></div>`;
  },
  leiste: () => `<button class="btn wide" data-spe>${rang() >= 3 || (prod(ui.pe.produkt_id) || {}).verantwortlich_id === S.user.benutzer_id ? 'Speichern' : 'Zur Bestätigung senden'}</button>`,
  bind: root => {
    const p = ui.pe;
    const erfassen = () => {
      p.beschreibung = root.querySelector('#pe-b').value.trim();
      if (root.querySelector('#pe-n')) {
        p.name = val(root, '#pe-n'); p.kategorie = val(root, '#pe-k');
        const pr = parseFloat(val(root, '#pe-p').replace(',', '.')); p.preis = isNaN(pr) ? NaN : Math.round(pr * 100);
        if (root.querySelector('#pe-v')) { p.verantwortlich_id = val(root, '#pe-v'); p.verantwortlich_platzhalter = ''; }
        if (root.querySelector('#pe-vp')) { p.verantwortlich_platzhalter = val(root, '#pe-vp'); p.verantwortlich_id = ''; }
      }
      if (root.querySelector('#pe-a')) { p.aktiv = root.querySelector('#pe-a').checked; p.pfand_id = val(root, '#pe-pf'); p.suchbegriffe = val(root, '#pe-sb'); }
      if (root.querySelector('#pe-s')) p.sortierung = Number(val(root, '#pe-s')) || 0;
    };
    root.querySelectorAll('#pe-vm button').forEach(b => b.addEventListener('click', () => { erfassen(); p.vmodus = b.dataset.vm; render(); }));
    root.querySelector('#pe-i').addEventListener('change', async e => { erfassen(); const f = e.target.files[0]; if (!f) return; try { p.neuBild = await bildVerkleinern(f, 800, 600, true); } catch (x) { toast('Bild nicht lesbar'); } render(); });
    root.querySelector('#pe-z').addEventListener('change', async e => {
      erfassen();
      for (const f of e.target.files) {
        try {
          if (f.type === 'application/pdf') { if (f.size > 8e6) { toast('PDF zu groß'); continue; } p.neuDateien.push({ name: f.name, mime: f.type, url: await dateiLesen(f) }); }
          else p.neuDateien.push({ name: f.name, mime: 'image/jpeg', url: await bildVerkleinern(f, 1200, 1200, false) });
        } catch (x) { toast('Datei nicht lesbar'); }
      }
      render();
    });
    root.querySelectorAll('[data-ix]').forEach(b => b.addEventListener('click', () => { erfassen(); p.info_dateien.splice(+b.dataset.ix, 1); render(); }));
    root.querySelectorAll('[data-nx]').forEach(b => b.addEventListener('click', () => { erfassen(); p.neuDateien.splice(+b.dataset.nx, 1); render(); }));
    const b = root.querySelector('[data-spe]');
    b.addEventListener('click', () => tue(b, async () => {
      erfassen();
      if (!p.name) return toast('Name fehlt');
      if (isNaN(p.preis)) return toast('Preis prüfen');
      const r = await call({ aktion: 'produkt_speichern',
        produkt: Object.assign({ produkt_id: p.produkt_id, name: p.name, kategorie: p.kategorie, preis: p.preis, sortierung: p.sortierung, aktiv: p.aktiv, beschreibung: p.beschreibung, info_dateien: p.info_dateien },
          rang() >= 3 ? { verantwortlich_id: p.verantwortlich_id || '', verantwortlich_platzhalter: p.verantwortlich_platzhalter || '', pfand_id: p.pfand_id || '', suchbegriffe: p.suchbegriffe || '' } : {}),
        bild: p.neuBild ? { data: p.neuBild.split(',')[1] } : null,
        zusatzdateien: p.neuDateien.map(f => ({ name: f.name, mime: f.mime, data: f.url.split(',')[1] })) }, true);
      if (!r.ok) return;
      toast(r.vorschlag ? 'Zur Bestätigung gesendet' : 'Gespeichert');
      if (rang() >= 2) { L.produkte = null; produkteLaden(); }
      if (p.eltern) go(p.eltern, p.eltern === 'standedit' ? true : undefined); else home();
      sync();
    }));
  }
};

/* ---------- Kategorien ---------- */
P.kategorien = {
  get form() { return !!ui.ke; }, eltern: 'einstellungen',
  titel: 'Kategorien',
  open: () => { ui.ke = null; },
  body: () => `<p class="muted" style="margin:0">Preis je Markt: Die Standleitung legt die Preise dieser Kategorie für ihren Markt fest.</p>` +
    KATS().slice().sort((a, b) => a.sortierung - b.sortierung).map(k => ui.ke && ui.ke.alt === k.kategorie ? katForm() :
    `<button class="prow" data-ked="${esc(k.kategorie)}"><span class="dot" style="background:${esc(k.farbe)}"></span><span class="pn"><b>${esc(k.kategorie)}</b><small>Sortierung ${k.sortierung}</small></span>${k.preis_je_markt ? '<span class="pill s">Preis je Markt</span>' : ''}</button>`).join('')
    + (ui.ke && !ui.ke.alt ? katForm() : ''),
  leiste: () => ui.ke ? '' : '<button class="btn wide" data-neu>Neue Kategorie</button>',
  bind: root => {
    const n = root.querySelector('[data-neu]'); if (n) n.addEventListener('click', () => { ui.ke = { alt: '', kategorie: '', sortierung: 50, farbe: '#5E6A61', preis_je_markt: false }; render(); });
    root.querySelectorAll('[data-ked]').forEach(b => b.addEventListener('click', () => { const k = KATS().find(x => x.kategorie === b.dataset.ked); ui.ke = Object.assign({ alt: k.kategorie }, k); render(); }));
    const f = root.querySelector('.katform');
    if (f) {
      f.querySelector('[data-x="abbr"]').addEventListener('click', () => { ui.ke = null; render(); });
      const b = f.querySelector('[data-x="spe"]');
      b.addEventListener('click', () => tue(b, async () => {
        const r = await call({ aktion: 'kategorie_speichern', alt: ui.ke.alt, kategorie: val(f, '#ke-n'), sortierung: Number(val(f, '#ke-s')) || 0, farbe: val(f, '#ke-f'), preis_je_markt: f.querySelector('#ke-p').checked }, true);
        if (r.ok) { ui.ke = null; toast('Gespeichert'); await sync(); render(); }
      }));
    }
  }
};
function katForm() {
  const k = ui.ke;
  return `<div class="katform card"><div class="formrow"><div class="field"><input id="ke-n" value="${esc(k.kategorie)}" placeholder="Name" aria-label="Name"></div><input id="ke-f" type="color" value="${esc(k.farbe || '#5E6A61')}" aria-label="Farbe"></div>
    <div class="formrow"><div class="field"><label for="ke-s">Sortierung</label><input id="ke-s" inputmode="numeric" value="${k.sortierung}"></div><label class="check" style="align-self:end"><input type="checkbox" id="ke-p" ${k.preis_je_markt ? 'checked' : ''}> Preis je Markt</label></div>
    <div class="acts"><button class="btn ghost sm" data-x="abbr">Abbrechen</button><button class="btn sm" style="margin-left:auto" data-x="spe">Speichern</button></div></div>`;
}

/* ---------- Personen & Rollen ---------- */
function personTrifft(b, f) {
  if (!f) return true;
  const [art, id] = f.split(':');
  if (art === 'stand') return b.zust.some(z => z.art === 'stand' && z.ref_id === id) || b.plan.includes(id);
  const staende = STAENDE().filter(x => x.markt_id === id).map(x => x.stand_id);
  return b.zust.some(z => (z.art === 'markt' && z.ref_id === id) || (z.art === 'stand' && staende.includes(z.ref_id))) || b.plan.some(sid => staende.includes(sid));
}
P.personen = {
  key: 'personen',
  titel: 'Personen & Rollen',
  kopf: () => `<button class="icon-btn rbtn" data-rechte aria-label="Rechte">${I.info}</button>`,
  open: data => { ui.offen = data && data.offen || null; ui.uq = ''; ui.pf = ui.pf || { sort: 'name', rolle: '', ort: '', gruppe: '' }; ui.prodOffen = null; ui.confirm = null; laden('personen', { aktion: 'benutzer_liste' }); },
  body: () => {
    const f = ui.pf;
    const orte = [['', 'Alle Märkte und Stände']].concat(...MAERKTE().map(m => [['markt:' + m.markt_id, m.name]].concat(STAENDE().filter(x => x.markt_id === m.markt_id).map(x => ['stand:' + x.stand_id, '  ' + x.name]))));
    const filter = `<label class="search">${I.search}<input id="uq" type="search" placeholder="Suchen" value="${esc(ui.uq || '')}" aria-label="Person suchen"></label>
      <div class="filterrow"><select id="pf-r" aria-label="Rolle oder Status">${optionen([['', 'Alle Rollen'], ['Helfer', 'Helfer'], ['Standleitung', 'Standleitung'], ['Marktleitung', 'Marktleitung'], ['Admin', 'Admin'], ['wartet', 'Wartet auf Freigabe'], ['gesperrt', 'Gesperrt']], f.rolle)}</select>
      <select id="pf-o" aria-label="Markt oder Stand">${optionen(orte, f.ort)}</select>
      ${rang() >= 4 && GRUPPEN_L().length ? `<select id="pf-g" aria-label="${GRUPPE}">${optionen([['', 'Alle ' + GRUPPEN]].concat(GRUPPEN_L().map(g => [g.gruppe_id, g.name]), [['-', 'ohne ' + GRUPPE]]), f.gruppe)}</select>` : ''}
      <div class="seg mini" id="pf-s"><button data-so="name" aria-pressed="${f.sort === 'name'}">A–Z</button><button data-so="rolle" aria-pressed="${f.sort === 'rolle'}">Rolle</button></div></div>`;
    return filter + geladen('personen', x => {
      const q = (ui.uq || '').toLowerCase();
      const admin = rang() >= 4;
      const rf = { wartet: 0, aktiv: 1, gesperrt: 2 };
      const l = x.benutzer.filter(b => (!q || b.name.toLowerCase().includes(q)) && (!f.rolle || (f.rolle === 'wartet' || f.rolle === 'gesperrt' ? b.status === f.rolle : b.rolle === f.rolle && b.status === 'aktiv')) && personTrifft(b, f.ort) && (!f.gruppe || (f.gruppe === '-' ? !b.gruppe_id : b.gruppe_id === f.gruppe)))
        .sort((a, b) => f.sort === 'rolle' ? (rf[a.status] - rf[b.status] || ROLLEN[b.rolle] - ROLLEN[a.rolle] || a.name.localeCompare(b.name)) : a.name.localeCompare(b.name));
      return `<p class="muted" style="margin:0">${l.length} ${l.length === 1 ? 'Person' : 'Personen'}</p>` + l.map(b => {
        const darf = (admin || ROLLEN[b.rolle] < 3) && b.benutzer_id !== S.user.benutzer_id;
        const rollen = admin ? Object.keys(ROLLEN) : ['Helfer', 'Standleitung'];
        const offen = ui.offen === b.benutzer_id;
        const zust = b.zust.map(z => (z.art === 'markt' ? ((MAERKTE().find(m => m.markt_id === z.ref_id) || {}).name || 'Markt') : standName(z.ref_id) || 'Stand') + (z.verantwortlich ? ' ★' : '')).filter(Boolean);
        return `<div class="card${offen ? ' sel' : ''}"><button class="hd plain" data-uo="${esc(b.benutzer_id)}"><b>${esc(b.name)}</b><span>${admin && GRUPPEN_L().length > 1 && b.gruppe_id ? `<span class="gtag">${esc(gruppeName(b.gruppe_id))}</span> ` : ''}<span class="pill ${b.status === 'aktiv' ? 's' : b.status === 'wartet' ? 'q' : 'st'}">${b.status === 'aktiv' ? esc(b.rolle) : b.status}</span></span></button>
          ${offen ? `${zust.length ? `<span class="muted">${esc(zust.join(', '))}</span>` : ''}
            ${admin && GRUPPEN_L().length ? `<div class="field"><select data-ug aria-label="${GRUPPE}">${optionen((b.gruppe_id ? [] : [['', 'ohne ' + GRUPPE]]).concat(GRUPPEN_L().map(g => [g.gruppe_id, g.name])), b.gruppe_id || '')}</select></div>` : ''}
            ${darf && b.status === 'aktiv' ? `<div class="seg">${rollen.map(r => `<button data-ur="${r}" aria-pressed="${b.rolle === r}">${r.replace('leitung', '-L.')}</button>`).join('')}</div>` : ''}
            ${darf ? `<div class="acts">${b.status === 'gesperrt' || b.status === 'wartet' ? '<button class="mini-btn" data-us="aktiv">Freigeben</button>' : '<button class="mini-btn" data-us="gesperrt">Sperren</button>'}
              ${admin ? '<input class="pin-in num" id="np" inputmode="numeric" maxlength="6" placeholder="neue PIN" aria-label="neue PIN"><button class="mini-btn" data-pin>PIN setzen</button>' : ''}</div>
              <div class="acts">${b.produkte.length ? `<button class="mini-btn" data-prod>${ui.prodOffen === b.benutzer_id ? 'Produkte ausblenden' : 'Produktverantwortung (' + b.produkte.length + ')'}</button>` : ''}
              ${ui.confirm === 'del' ? `<span>${b.loeschbar ? 'Endgültig löschen?' : 'Entfernen? Umsätze bleiben erhalten.'}</span><button class="btn danger sm" data-del>Ja</button><button class="btn ghost sm" data-nein>Nein</button>`
                : `<button class="mini-btn danger-t" data-delfrage>${b.loeschbar ? 'Löschen' : 'Entfernen'}</button>`}</div>
              ${ui.prodOffen === b.benutzer_id ? `<span class="muted">${esc(b.produkte.join(', '))}</span>` : ''}` : ''}` : ''}</div>`;
      }).join('') || listeLeer('Niemand gefunden');
    });
  },
  bind: root => {
    const f = ui.pf;
    root.querySelector('[data-rechte]').addEventListener('click', () => go('rechte'));
    const q = root.querySelector('#uq');
    q.addEventListener('input', () => { ui.uq = q.value; const p = q.selectionStart; render(); const n = app.querySelector('#uq'); n.focus(); n.setSelectionRange(p, p); });
    root.querySelector('#pf-r').addEventListener('change', e => { f.rolle = e.target.value; render(); });
    root.querySelector('#pf-o').addEventListener('change', e => { f.ort = e.target.value; render(); });
    const pg = root.querySelector('#pf-g'); if (pg) pg.addEventListener('change', e => { f.gruppe = e.target.value; render(); });
    root.querySelectorAll('[data-so]').forEach(b => b.addEventListener('click', () => { f.sort = b.dataset.so; render(); }));
    root.querySelectorAll('[data-uo]').forEach(b => b.addEventListener('click', () => { ui.offen = ui.offen === b.dataset.uo ? null : b.dataset.uo; ui.confirm = null; render(); }));
    const person = () => L.personen.benutzer.find(x => x.benutzer_id === ui.offen);
    const aendern = p => {
      const b = person();
      aktion('benutzer_aendern', Object.assign({ ziel_id: ui.offen }, p));
      if (p.rolle) b.rolle = p.rolle;
      if (p.status) b.status = p.status;
      render(); toast('Gespeichert');
    };
    root.querySelectorAll('[data-ur]').forEach(b => b.addEventListener('click', () => aendern({ rolle: b.dataset.ur })));
    const ug = root.querySelector('[data-ug]'); if (ug) ug.addEventListener('change', () => { if (!ug.value) return; person().gruppe_id = ug.value; aendern({ gruppe_id: ug.value }); });
    root.querySelectorAll('[data-us]').forEach(b => b.addEventListener('click', () => aendern({ status: b.dataset.us })));
    const pin = root.querySelector('[data-pin]'); if (pin) pin.addEventListener('click', () => { const v = val(root, '#np'); if (!/^\d{4,6}$/.test(v)) return toast('PIN: 4–6 Ziffern'); aendern({ neue_pin: v }); });
    const pr = root.querySelector('[data-prod]'); if (pr) pr.addEventListener('click', () => { ui.prodOffen = ui.prodOffen === ui.offen ? null : ui.offen; render(); });
    const df = root.querySelector('[data-delfrage]'); if (df) df.addEventListener('click', () => { ui.confirm = 'del'; render(); });
    const nn = root.querySelector('[data-nein]'); if (nn) nn.addEventListener('click', () => { ui.confirm = null; render(); });
    const del = root.querySelector('[data-del]');
    if (del) del.addEventListener('click', () => tue(del, async () => {
      const r = await call({ aktion: 'benutzer_loeschen', ziel_id: ui.offen }, true);
      if (r.ok) { L.personen.benutzer = L.personen.benutzer.filter(x => x.benutzer_id !== ui.offen); ui.offen = null; ui.confirm = null; render(); toast(r.geloescht ? 'Gelöscht' : 'Entfernt'); }
    }));
  }
};

/* ---------- Rückmeldungen ---------- */
P.rueckmeldungen = {
  key: 'rueckmeldungen',
  titel: 'Rückmeldungen',
  open: () => { ui.rmBild = ui.rmBild || {}; ui.rmFilter = ui.rmFilter || 'neu'; laden('rueckmeldungen', { aktion: 'rueckmeldungen_liste' }); },
  kopf: () => { const l = (L.rueckmeldungen && L.rueckmeldungen.rueckmeldungen) || []; return `<div class="seg mini">${[['neu', 'Neu'], ['in Arbeit', 'In Arbeit'], ['erledigt', 'Erledigt']].map(([k, t]) => `<button data-rf="${k}" aria-pressed="${ui.rmFilter === k}">${t} <span class="grauzahl">${l.filter(r => r.status === k).length}</span></button>`).join('')}</div>`; },
  body: () => geladen('rueckmeldungen', x => { const l = x.rueckmeldungen.filter(r => r.status === ui.rmFilter); return l.length ? l.map(r => `<div class="card">
    <div class="hd"><b>${esc(r.typ)} · ${esc(r.name)}</b><span class="muted">${fmtTime(r.zeit)}</span></div>
    <span class="vorz">${esc(r.text)}</span>${r.stand ? `<span class="muted">${esc(r.stand)}</span>` : ''}
    ${r.bild ? (ui.rmBild[r.rm_id] ? `<button class="zoom" data-zoom="${esc(ui.rmBild[r.rm_id])}"><img class="rmfoto" src="${ui.rmBild[r.rm_id]}" alt="Foto"></button>` : `<button class="mini-btn" style="align-self:flex-start;margin:0" data-rmb="${esc(r.rm_id)}">Foto zeigen</button>`) : ''}
    ${r.eigen && rang() < 4 ? '' : `<div class="seg">${['neu', 'in Arbeit', 'erledigt'].map(s => `<button data-rs="${esc(r.rm_id)}|${s}" aria-pressed="${r.status === s}">${s}</button>`).join('')}</div>`}</div>`).join('') : listeLeer('Keine'); }),
  bind: root => {
    root.querySelectorAll('[data-rf]').forEach(b => b.addEventListener('click', () => { ui.rmFilter = b.dataset.rf; render(); }));
    root.querySelectorAll('[data-rs]').forEach(b => b.addEventListener('click', () => {
      const i = b.dataset.rs.lastIndexOf('|'), id = b.dataset.rs.slice(0, i), status = b.dataset.rs.slice(i + 1);
      aktion('rueckmeldung_status', { rm_id: id, status });
      L.rueckmeldungen.rueckmeldungen.find(x => x.rm_id === id).status = status; render();
    }));
    root.querySelectorAll('[data-rmb]').forEach(b => b.addEventListener('click', () => tue(b, async () => {
      const r = await call({ aktion: 'rm_bild', rm_id: b.dataset.rmb });
      if (r.ok) { ui.rmBild[b.dataset.rmb] = 'data:' + r.mime + ';base64,' + r.data; render(); }
    })));
    root.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => { ui.zoom = b.dataset.zoom; go('bild'); }));
  }
};

/* ---------- Einstellungen ---------- */
P.einstellungen = {
  key: 'einstellungen', form: true,
  titel: 'Einstellungen',
  open: () => { ui.es = null; ui.gEdit = null; laden('einstellungen', { aktion: 'einstellungen_admin' }).then(r => { if (r.ok && !ui.es) { esLaden(r.einstellungen); render(); } }); if (L.einstellungen && L.einstellungen.ok) esLaden(L.einstellungen.einstellungen); },
  body: () => {
    const e = ui.es;
    if (!e) return geladen('einstellungen', () => ladeHtml);
    const gl = (L.einstellungen && L.einstellungen.gruppen) || [];
    return `<h3 class="sub">Allgemein</h3>
      <div class="field"><label for="es-t">App-Titel</label><input id="es-t" value="${esc(e.app_titel)}"></div>
      <div class="field"><label for="es-v">Verein</label><input id="es-v" value="${esc(e.verein)}"></div>
      <div class="field"><label for="es-m">E-Mail für Probleme</label><input id="es-m" type="email" value="${esc(e.benachrichtigung_email)}" placeholder="optional"></div>
      <div data-sofort class="vblock"><h3 class="sub">${GRUPPEN}</h3>
      ${gl.map(g => ui.gEdit === g.gruppe_id ? `<div class="einlad"><input id="g-n" value="${esc(g.name)}" aria-label="Name"><button class="mini-btn" data-nav data-gok="${esc(g.gruppe_id)}">OK</button></div>`
        : `<div class="kv"><span><b>${esc(g.name)}</b> <small class="muted">${g.personen} ${g.personen === 1 ? 'Person' : 'Personen'} · ${g.maerkte} ${g.maerkte === 1 ? 'Markt' : 'Märkte'}</small></span><span class="acts"><button class="mini-btn" data-nav data-ged="${esc(g.gruppe_id)}">Umbenennen</button>${!g.personen && !g.maerkte ? `<button class="del" data-nav data-gdel="${esc(g.gruppe_id)}" aria-label="löschen">${I.trash}</button>` : ''}</span></div>`).join('')}
      ${L.einstellungen && L.einstellungen.ohne_gruppe ? `<p class="muted" style="margin:0">${L.einstellungen.ohne_gruppe} Personen ohne ${GRUPPE}</p>` : ''}
      ${ui.gEdit === 'neu' ? `<div class="einlad"><input id="g-n" placeholder="Name" aria-label="Name"><button class="mini-btn" data-nav data-gok="">OK</button></div>` : `<button class="mini-btn" style="margin:0;align-self:flex-start" data-nav data-gneu>+ ${GRUPPE}</button>`}</div>
      <h3 class="sub">Kasse</h3>
      <div class="field"><label>Schnelltasten beim Kassieren</label><div class="chips wrap">${e.scheine.map((v, i) => `<span class="chip on">${scheinText(v)} <button class="xbtn" data-sx="${i}" aria-label="${scheinText(v)} entfernen">×</button></span>`).join('')}
        <span class="addchip"><input id="es-sn" inputmode="decimal" placeholder="€" aria-label="Betrag"><button class="mini-btn" data-sadd>+</button></span></div></div>
      <div class="formrow"><div class="field"><label for="es-s">Storno: letzte Bons</label><input id="es-s" type="number" min="0" max="20" value="${esc(e.storno_anzahl)}"></div>
        <div class="field"><label for="es-a">Abgleich alle … Sekunden</label><input id="es-a" type="number" min="20" max="600" value="${esc(e.abgleich_sekunden)}"></div></div>
      <h3 class="sub">Werkzeuge</h3>
      <div class="menu"><button class="item" data-go="produkte"><span class="ic">${I.tag}</span><span>Alle Produkte</span></button><button class="item" data-go="kategorien"><span class="ic">${I.list}</span><span>Kategorien</span></button>
        <button class="item" data-go="esaufgaben"><span class="ic">${I.cal}</span><span>Aufgaben im Personalplan</span></button><button class="item" data-go="log"><span class="ic">${I.clock}</span><span>Änderungslog</span></button>
        <button class="item" data-go="lasttest"><span class="ic">${I.chart}</span><span>Lasttest</span></button><button class="item" data-go="saison"><span class="ic">${I.box}</span><span>Saison abschließen</span></button></div>`;
  },
  leiste: () => ui.es ? '<button class="btn wide" data-spe>Speichern</button>' : '',
  bind: root => {
    const e = ui.es; if (!e) return;
    const erfassen = () => {
      e.app_titel = val(root, '#es-t'); e.verein = val(root, '#es-v'); e.benachrichtigung_email = val(root, '#es-m');
      e.storno_anzahl = val(root, '#es-s'); e.abgleich_sekunden = val(root, '#es-a');
    };
    root.querySelectorAll('[data-sx]').forEach(b => b.addEventListener('click', () => { erfassen(); e.scheine.splice(+b.dataset.sx, 1); render(); }));
    root.querySelector('[data-sadd]').addEventListener('click', () => { erfassen(); const v = Math.round(parseFloat(val(root, '#es-sn').replace(',', '.')) * 100) / 100; if (!(v > 0)) return toast('Betrag in Euro, z. B. 0,50'); if (!e.scheine.includes(v)) e.scheine.push(v); e.scheine.sort((a, b) => a - b); render(); });
    // Stämme: sofort speichern
    const gn = root.querySelector('[data-gneu]'); if (gn) gn.addEventListener('click', () => { erfassen(); ui.gEdit = 'neu'; render(); const i = app.querySelector('#g-n'); if (i) i.focus(); });
    root.querySelectorAll('[data-ged]').forEach(b => b.addEventListener('click', () => { erfassen(); ui.gEdit = b.dataset.ged; render(); }));
    const gok = root.querySelector('[data-gok]');
    if (gok) gok.addEventListener('click', () => tue(gok, async () => {
      erfassen();
      const name = val(root, '#g-n'); if (name.length < 2) return toast('Name fehlt');
      const r = await call({ aktion: 'gruppe_speichern', gruppe_id: gok.dataset.gok, name }, true);
      if (r.ok) { ui.gEdit = null; await laden('einstellungen', { aktion: 'einstellungen_admin' }); sync(); render(); }
    }));
    root.querySelectorAll('[data-gdel]').forEach(b => b.addEventListener('click', () => tue(b, async () => {
      erfassen();
      const r = await call({ aktion: 'gruppe_loeschen', gruppe_id: b.dataset.gdel }, true);
      if (r.ok) { await laden('einstellungen', { aktion: 'einstellungen_admin' }); sync(); render(); }
    })));
    const b = root.querySelector('[data-spe]');
    b.addEventListener('click', () => tue(b, async () => {
      erfassen();
      const daten = { app_titel: e.app_titel, verein: e.verein, benachrichtigung_email: e.benachrichtigung_email, storno_anzahl: e.storno_anzahl, abgleich_sekunden: e.abgleich_sekunden,
        schnellbetraege: e.scheine.map(v => String(v).replace('.', ',')).join(';') };
      const r = await call({ aktion: 'einstellungen_speichern', einstellungen: daten }, true);
      if (r.ok) { Object.assign(L.einstellungen.einstellungen, daten); toast('Gespeichert'); gespeichert(); sync(); }
    }));
  }
};
function esLaden(x) {
  ui.es = { app_titel: x.app_titel || '', verein: x.verein || '', benachrichtigung_email: x.benachrichtigung_email || '', storno_anzahl: x.storno_anzahl || '2', abgleich_sekunden: x.abgleich_sekunden || '60',
    scheine: String(x.schnellbetraege || '0,5;1;2;5;10;20;50').split(';').map(v => Math.round(parseFloat(v.replace(',', '.')) * 100) / 100).filter(n => n > 0),
    aufgaben: String(x.aufgaben || '').split(/[;,]/).map(a => a.trim()).filter(a => a && a !== 'Standleitung') };
}

/* ---------- Aufgaben im Personalplan (Admin) ---------- */
P.esaufgaben = {
  form: true, eltern: 'einstellungen', key: 'einstellungen',
  titel: 'Aufgaben im Personalplan',
  open: () => { ui.auf = null; const f = x => { ui.auf = String(x.aufgaben || '').split(/[;,]/).map(a => a.trim()).filter(a => a && a !== 'Standleitung'); };
    if (L.einstellungen && L.einstellungen.ok) f(L.einstellungen.einstellungen);
    laden('einstellungen', { aktion: 'einstellungen_admin' }).then(r => { if (r.ok && !ui.auf) { f(r.einstellungen); render(); } }); },
  body: () => !ui.auf ? ladeHtml : `<div class="vrow fest"><input value="Standleitung" disabled aria-label="Standleitung"><span></span><span></span></div>
    ${ui.auf.map((a, i) => `<div class="vrow aufg"><input data-ax="${i}" value="${esc(a)}" aria-label="Aufgabe ${i + 1}"><button class="mini-btn" data-auf="${i}" aria-label="nach oben" ${i ? '' : 'disabled'}>↑</button><button class="del" data-adel="${i}" aria-label="entfernen">${I.trash}</button></div>`).join('')}
    <button class="mini-btn" style="margin:0;align-self:flex-start" data-aadd>+ Aufgabe</button>`,
  leiste: () => ui.auf ? '<button class="btn wide" data-spe>Speichern</button>' : '',
  bind: root => {
    const e = ui.auf; if (!e) return;
    const erfassen = () => { const l = [...root.querySelectorAll('[data-ax]')].map(x => x.value.trim()); e.length = 0; e.push(...l); };
    root.querySelectorAll('[data-adel]').forEach(b => b.addEventListener('click', () => { erfassen(); e.splice(+b.dataset.adel, 1); render(); }));
    root.querySelectorAll('[data-auf]').forEach(b => b.addEventListener('click', () => { erfassen(); const i = +b.dataset.auf; [e[i - 1], e[i]] = [e[i], e[i - 1]]; render(); }));
    root.querySelector('[data-aadd]').addEventListener('click', () => { erfassen(); e.push(''); render(); const l = app.querySelectorAll('[data-ax]'); l[l.length - 1].focus(); });
    const b = root.querySelector('[data-spe]');
    b.addEventListener('click', () => tue(b, async () => {
      erfassen();
      const auf = ['Standleitung'].concat(e.map(a => a.replace(/[;,]/g, ' ').trim()).filter(a => a && a !== 'Standleitung' && a !== EGAL)).join(';');
      const r = await call({ aktion: 'einstellungen_speichern', einstellungen: { aufgaben: auf } }, true);
      if (r.ok) { if (L.einstellungen && L.einstellungen.einstellungen) L.einstellungen.einstellungen.aufgaben = auf; toast('Gespeichert'); gespeichert(); sync(); }
    }));
  }
};

/* ---------- Änderungslog (Admin) ---------- */
const LOG_KAT = ['Personen', 'Preise', 'Produkte', 'Stände', 'Märkte', 'Storno', 'Verantwortung'];
P.log = {
  key: 'log', eltern: 'einstellungen',
  titel: 'Änderungslog',
  open: () => { ui.logKat = ui.logKat || ''; laden('log', { aktion: 'protokoll' }); },
  kopf: () => `<div class="chips wrap">${[['', 'Alle']].concat(LOG_KAT.map(k => [k, k])).map(([k, t]) => `<button class="chip${ui.logKat === k ? ' on' : ''}" data-lk="${esc(k)}">${t}</button>`).join('')}</div>`,
  body: () => geladen('log', x => {
    const l = x.eintraege.filter(e => !ui.logKat || e.kategorie === ui.logKat).slice(0, 300);
    return l.length ? `<div class="loglist">${l.map(e => `<div class="logz"><small class="muted">${fmtTime(e.zeit)} · ${esc(e.kategorie)} · ${esc(e.name || '–')}</small><span>${esc(e.text)}</span></div>`).join('')}</div>` : listeLeer('Keine Einträge');
  }),
  bind: root => root.querySelectorAll('[data-lk]').forEach(b => b.addEventListener('click', () => { ui.logKat = b.dataset.lk; render(); }))
};

/* ---------- Rechteübersicht ---------- */
OV.rechte = {
  titel: () => 'Rechte',
  body: () => {
    const z = [['Kassieren, eigene Bons', 1], ['Ausverkauft melden', 1], ['Schichten eintragen', 1], ['Rückmeldung senden', 1],
      ['Personal planen, Codes, Einladen', 2], ['Bons des Stands verwalten', 2], ['Stand einrichten, Preise', 2, '★'], ['Nachricht an eigene Leute', 2, '★'],
      ['Umsatz sehen', 3], ['Märkte & Stände anlegen', 3], ['Servicemodus, Produkte', 3], ['Rollen bis Standleitung', 3],
      ['Alle Rollen, Stämme', 4], ['Einstellungen, Kategorien', 4], ['Änderungslog', 4], ['Nachricht an alle', 4]];
    return `<table class="rechte"><thead><tr><th></th>${['Helfer', 'Stand-L.', 'Markt-L.', 'Admin'].map(r => `<th>${r}</th>`).join('')}</tr></thead>
      <tbody>${z.map(([t, ab, st]) => `<tr><td>${esc(t)}</td>${[1, 2, 3, 4].map(r => `<td>${r >= ab ? (st && r === ab ? st : '✓') : ''}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <p class="muted" style="margin:8px 0 0">★ nur als Verantwortliche</p>`;
  },
  footer: () => '<button class="btn wide" data-close>Schließen</button>'
};

/* ---------- Lasttest (Admin): mehrere Geräte nachstellen, gegen die echte Schnittstelle ---------- */
P.lasttest = {
  eltern: 'einstellungen',
  titel: 'Lasttest',
  open: () => { ui.lt = ui.lt || { geraete: 20, minuten: 2, laeuft: false, erg: null }; },
  body: () => {
    const t = ui.lt, e = t.erg;
    const zeile = (n, x) => x && x.n ? `<div class="kv"><span>${n}</span><b class="num">${x.n} · Ø ${(x.summe / x.n / 1000).toFixed(1)} s · max ${(x.max / 1000).toFixed(1)} s${x.fehler ? ' · ' + x.fehler + ' Fehler' : ''}</b></div>` : '';
    return `<div class="formrow"><div class="field"><label for="lt-g">Geräte</label><input id="lt-g" type="number" min="1" max="40" value="${t.geraete}" ${t.laeuft ? 'disabled' : ''}></div>
      <div class="field"><label for="lt-m">Minuten</label><input id="lt-m" type="number" min="1" max="10" value="${t.minuten}" ${t.laeuft ? 'disabled' : ''}></div></div>
      <p class="muted" style="margin:0">Je Gerät alle 6 s ein Bon, alle 20 s ein Abgleich · etwa zehnmal so viel wie am Markttag</p>
      ${e ? `<div class="stats"><div class="stat"><small>${t.laeuft ? 'läuft · ' + Math.round((Date.now() - e.start) / 1000) + ' s' : 'Ergebnis'}</small><b class="num">${e.ok + e.fehl}</b></div><div class="stat"><small>Fehler</small><b class="num${e.fehl ? ' neg' : ''}">${e.fehl}</b></div></div>
        ${zeile('Bons', e.schreiben)}${zeile('Abgleich', e.lesen)}
        ${!t.laeuft ? `<p class="${e.fehl || (e.schreiben.max > 20000) ? 'err' : 'ok-t'}" style="margin:0">${e.fehl ? 'Es gab Fehler.' : e.schreiben.max > 20000 ? 'Zu langsam.' : 'Hält stand.'}</p>` : ''}
        ${e.letzte ? `<p class="errlist">${esc(e.letzte)}</p>` : ''}` : ''}`;
  },
  leiste: () => ui.lt.laeuft ? '<button class="btn danger wide" data-stop>Abbrechen</button>' : '<button class="btn wide" data-start>Starten</button>',
  bind: root => {
    const s = root.querySelector('[data-start]');
    if (s) s.addEventListener('click', () => { ui.lt.geraete = Math.max(1, Math.min(40, +val(root, '#lt-g') || 20)); ui.lt.minuten = Math.max(1, Math.min(10, +val(root, '#lt-m') || 2)); lasttestStart(); });
    const st = root.querySelector('[data-stop]'); if (st) st.addEventListener('click', () => { ui.lt.laeuft = false; });
  }
};
async function lasttestStart() {
  const t = ui.lt;
  if (DEMO) return toast('Nur mit echter Schnittstelle');
  t.laeuft = true;
  const e = t.erg = { start: Date.now(), ok: 0, fehl: 0, schreiben: { n: 0, summe: 0, max: 0, fehler: 0 }, lesen: { n: 0, summe: 0, max: 0, fehler: 0 }, letzte: '' };
  const ende = Date.now() + t.minuten * 60000;
  const anzeigen = () => { if (ui.page === 'lasttest') render(); };
  const timer = setInterval(anzeigen, 1000);
  const messen = async (art, params, post) => {
    const t0 = Date.now();
    try {
      const r = await api(params, post);
      const d = Date.now() - t0, x = e[art];
      x.n++; x.summe += d; x.max = Math.max(x.max, d);
      if (r.ok) e.ok++; else { e.fehl++; x.fehler++; e.letzte = r.fehler || ''; }
    } catch (err) { e.fehl++; e[art].fehler++; e.letzte = String(err.message || err); }
  };
  const geraet = async nr => {
    await new Promise(r => setTimeout(r, Math.random() * 6000));
    let n = 0;
    while (t.laeuft && Date.now() < ende) {
      await messen('schreiben', { aktion: 'lasttest', nr: nr + '-' + (n++) }, true);
      if (n % 3 === 0) await messen('lesen', { aktion: 'lasttest', modus: 'lesen' });
      await new Promise(r => setTimeout(r, 4000 + Math.random() * 4000));
    }
  };
  await Promise.all(Array.from({ length: t.geraete }, (_, i) => geraet(i)));
  clearInterval(timer);
  t.laeuft = false;
  try { await api({ aktion: 'lasttest', modus: 'leeren' }, true); } catch (x) {}
  anzeigen();
}

/* ---------- Saison abschließen (Admin) ---------- */
P.saison = {
  eltern: 'einstellungen', form: true,
  titel: 'Saison abschließen',
  open: () => { ui.sa = { bis: '', erg: null }; },
  body: () => {
    const x = ui.sa;
    if (x.erg) return `<div class="card"><b>Kopie angelegt</b><a class="doc" href="${esc(x.erg.kopie)}" target="_blank" rel="noopener"><span class="ic">${I.box}</span><span>Archiv öffnen</span></a>
      ${Object.keys(x.erg.entfernt).map(k => `<div class="kv"><span>${esc(k)}</span><b class="num">${x.erg.entfernt[k]} entfernt</b></div>`).join('')}</div>`;
    return `<p class="muted" style="margin:0">Kopie des ganzen Sheets, danach bis zum Datum entfernt: Verkäufe, Codes, Einladungen, gelesene Nachrichten</p>
      <div class="field"><label for="sa-d">Bis einschließlich</label><input type="date" id="sa-d" value="${esc(x.bis)}" max="${new Date(Date.now() - 864e5).toLocaleDateString('sv-SE')}"></div>
      ${ui.confirm === 'saison' ? `<div class="confirm">Wirklich abschließen? <button class="btn danger sm" data-x="ja">Ja</button><button class="btn ghost sm" data-nein>Nein</button></div>` : ''}`;
  },
  leiste: () => ui.sa.erg || ui.confirm === 'saison' ? '' : '<button class="btn wide" data-x="los">Abschließen</button>',
  bind: root => {
    const x = ui.sa;
    const los = root.querySelector('[data-x="los"]'); if (los) los.addEventListener('click', () => { x.bis = val(root, '#sa-d'); if (!x.bis) return toast('Datum wählen'); ui.confirm = 'saison'; render(); });
    const nn = root.querySelector('[data-nein]'); if (nn) nn.addEventListener('click', () => { ui.confirm = null; render(); });
    const ja = root.querySelector('[data-x="ja"]');
    if (ja) ja.addEventListener('click', () => tue(ja, async () => {
      const r = await call({ aktion: 'saison_abschliessen', bis: x.bis }, true);
      ui.confirm = null;
      if (r.ok) { x.erg = r; ui.dirty = false; toast('Abgeschlossen'); }
      render();
    }));
  }
};

/* Marktleitung: häufig gebrauchte Listen im Hintergrund vorladen */
setTimeout(function vorladen() {
  if (S.user && D && rang() >= 3) { if (!L.struktur) strukturLaden(); if (!L.produkte) produkteLaden(); }
  else setTimeout(vorladen, 4000);
}, 2500);
