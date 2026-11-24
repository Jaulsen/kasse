/* Weihnachtsmarkt-Kasse · App 2.1 · Stand einrichten, Marktleitung, Admin */
'use strict';

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
      ${se.personen ? `<h3 class="sub">Standleitung</h3><div class="chips wrap">${se.personen.filter(p => ROLLEN[p.rolle] >= 2).map(p => `<button class="chip" data-sl="${esc(p.benutzer_id)}" aria-pressed="${se.leitung.includes(p.benutzer_id)}">${esc(p.name)}</button>`).join('') || '<span class="muted">Niemand mit Rolle Standleitung</span>'}</div>` : ''}
      ${se.stand_id ? `${preisKategorien(se).length ? `<div class="menu"><button class="item" data-x="preise"><span class="ic">${I.euro}</span><span>Preise für diesen Markt</span></button></div>` : ''}
        ${ui.confirm === 'arch' ? `<div class="confirm">Stand archivieren? <button class="btn danger sm" data-x="archja">Ja</button><button class="btn ghost sm" data-nein>Nein</button></div>` : '<button class="btn ghost wide danger-t" data-x="arch">Stand archivieren</button>'}` : ''}`;
  },
  leiste: () => '<button class="btn wide" data-x="spe">Speichern</button>',
  bind: root => {
    const se = ui.se;
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
    x('arch', () => { seErfassen(root); ui.confirm = 'arch'; render(); });
    root.querySelectorAll('[data-nein]').forEach(b => b.addEventListener('click', () => { seErfassen(root); ui.confirm = null; render(); }));
    const speichern = async archiviert => {
      seErfassen(root);
      if (!se.name) return toast('Name fehlt');
      if (se.standzeiten.some(z => !z.datum || !z.von || !z.bis || toMin(z.bis) <= toMin(z.von))) return toast('Standzeiten prüfen');
      const r = await call({ aktion: 'stand_speichern', stand: { stand_id: se.stand_id, markt_id: se.markt_id, name: se.name, kategorien: se.kategorien, standzeiten: se.standzeiten, archiviert: !!archiviert } }, true);
      if (!r.ok) return;
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
      aktion('preis_speichern', { markt_id: ui.se.markt_id, produkt_id: pid, preis: c });
      D.preise = (D.preise || []).filter(r => !(r.markt_id === ui.se.markt_id && r.produkt_id === pid));
      if (c !== '') D.preise.push({ markt_id: ui.se.markt_id, produkt_id: pid, preis: c });
    });
    toast('Gespeichert'); go('standedit', true);
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
      <div class="hd"><b>${esc(m.name)}</b>${m.recht ? `<button class="mini-btn" data-med="${esc(m.markt_id)}">Bearbeiten</button>` : ''}</div>
      <span class="muted">${esc([m.ort, m.datum_von && fmtDate(m.datum_von) + (m.datum_bis && m.datum_bis !== m.datum_von ? ' – ' + fmtDate(m.datum_bis) : '')].filter(Boolean).join(' · '))}${m.leitung.length ? ' · Leitung: ' + esc(m.leitung.map(l => l.name).join(', ')) : ''}${m.archiviert ? ' · archiviert' : ''}</span>
      ${x.staende.filter(s => s.markt_id === m.markt_id && (!s.archiviert || ui.zeigeArchiv)).map(s => `<div class="srow-btn"><div><b>${esc(s.name)}</b><small>${esc(s.leitung.map(l => l.name).join(', ') || 'ohne Standleitung')}${s.archiviert ? ' · archiviert' : ''}</small></div>
        ${s.recht ? `<div class="acts">${!s.archiviert && stand(s.stand_id) ? `<button class="mini-btn" data-spl="${esc(s.stand_id)}">${I.cal} Personalplanung</button>` : ''}<button class="mini-btn" data-sted="${esc(s.stand_id)}">${I.edit} Einrichten</button></div>` : ''}</div>`).join('')}
      ${m.recht ? `<button class="mini-btn" style="margin:0;align-self:flex-start" data-mned="${esc(m.markt_id)}">+ Stand</button>` : ''}</div>`).join('') || listeLeer('Kein Markt')}
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
    root.querySelectorAll('[data-med]').forEach(b => b.addEventListener('click', () => { const m = x.maerkte.find(y => y.markt_id === b.dataset.med); ui.me = Object.assign({}, m, { leitung: m.leitung.map(l => l.benutzer_id) }); ui.me.leitungAlt = ui.me.leitung.slice(); go('marktedit'); }));
  }
};
P.marktedit = {
  form: true, eltern: 'struktur',
  titel: () => ui.me.markt_id ? ui.me.name || 'Markt' : 'Neuer Markt',
  body: () => {
    const m = ui.me, pers = (L.struktur && L.struktur.personen) || [];
    return `<div class="field"><label for="me-n">Name</label><input id="me-n" value="${esc(m.name)}"></div>
      <div class="field"><label for="me-o">Ort</label><input id="me-o" value="${esc(m.ort)}"></div>
      <div class="formrow"><div class="field"><label for="me-v">Von</label><input type="date" id="me-v" value="${esc(m.datum_von)}"></div><div class="field"><label for="me-b">Bis</label><input type="date" id="me-b" value="${esc(m.datum_bis)}"></div></div>
      ${rang() >= 4 ? `<h3 class="sub">Marktleitung</h3><div class="chips wrap">${pers.filter(p => ROLLEN[p.rolle] >= 3).map(p => `<button class="chip" data-ml="${esc(p.benutzer_id)}" aria-pressed="${m.leitung.includes(p.benutzer_id)}">${esc(p.name)}</button>`).join('') || '<span class="muted">Niemand mit Rolle Marktleitung</span>'}</div>` : ''}
      ${m.markt_id ? `<label class="check"><input type="checkbox" id="me-a" ${m.archiviert ? 'checked' : ''}> Archiviert</label>` : ''}`;
  },
  leiste: () => '<button class="btn wide" data-spe>Speichern</button>',
  bind: root => {
    const m = ui.me;
    const erfassen = () => { m.name = val(root, '#me-n'); m.ort = val(root, '#me-o'); m.datum_von = val(root, '#me-v'); m.datum_bis = val(root, '#me-b'); const a = root.querySelector('#me-a'); if (a) m.archiviert = a.checked; };
    root.querySelectorAll('[data-ml]').forEach(b => b.addEventListener('click', () => { erfassen(); const id = b.dataset.ml; m.leitung = m.leitung.includes(id) ? m.leitung.filter(y => y !== id) : m.leitung.concat(id); render(); }));
    const b = root.querySelector('[data-spe]');
    b.addEventListener('click', () => tue(b, async () => {
      erfassen();
      if (!m.name) return toast('Name fehlt');
      const r = await call({ aktion: 'markt_speichern', markt: m }, true);
      if (!r.ok) return;
      if (rang() >= 4) {
        m.leitung.filter(i => !m.leitungAlt.includes(i)).forEach(id => aktion('zustaendigkeit', { art: 'markt', ref_id: r.markt_id, ziel_id: id, an: true }));
        m.leitungAlt.filter(i => !m.leitung.includes(i)).forEach(id => aktion('zustaendigkeit', { art: 'markt', ref_id: r.markt_id, ziel_id: id, an: false }));
      }
      toast('Gespeichert'); strukturLaden(); go('struktur'); sync();
    }));
  }
};

/* ---------- Produkte ---------- */
const produkteLaden = () => laden('produkte', { aktion: 'produkte_admin' });
P.produkte = {
  key: 'produkte',
  titel: 'Produkte',
  open: () => { ui.pq = ui.pq || ''; produkteLaden(); },
  body: () => `<label class="search">${I.search}<input id="pq" type="search" placeholder="Suchen" value="${esc(ui.pq)}" aria-label="Produkt suchen"></label>` + geladen('produkte', x => {
    const q = ui.pq.toLowerCase();
    const l = x.produkte.filter(p => !q || p.name.toLowerCase().includes(q) || p.kategorie.toLowerCase().includes(q))
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
    if (!p) { const d = prod(pid); if (!d) return; p = { produkt_id: d.produkt_id, name: d.name, kategorie: d.kategorie, preis: d.preis, bild: d.bild, sortierung: d.sortierung, aktiv: true, beschreibung: d.beschreibung, info_dateien: (d.info || []).map(i => i.name) }; }
  }
  ui.pe = p ? Object.assign({}, p, { info_dateien: p.info_dateien.slice() }) : { produkt_id: '', name: '', kategorie: (KATS()[0] || {}).kategorie || '', preis: 0, sortierung: 0, aktiv: true, beschreibung: '', info_dateien: [] };
  ui.pe.neuBild = null; ui.pe.neuDateien = []; ui.pe.eltern = eltern;
  go('produkt');
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
    return `<div class="field"><label for="pe-n">Name</label><input id="pe-n" value="${esc(p.name)}"></div>
      <div class="formrow"><div class="field"><label for="pe-k">Kategorie</label><select id="pe-k">${optionen(KATS().map(k => k.kategorie), p.kategorie)}</select></div>
        <div class="field"><label for="pe-p">Preis €</label><input id="pe-p" inputmode="decimal" value="${(p.preis / 100).toFixed(2).replace('.', ',')}"></div></div>
      ${rang() >= 3 ? `<div class="formrow"><div class="field"><label for="pe-s">Sortierung</label><input id="pe-s" inputmode="numeric" value="${p.sortierung}"></div><label class="check" style="align-self:end"><input type="checkbox" id="pe-a" ${p.aktiv ? 'checked' : ''}> Aktiv</label></div>` : ''}
      <div class="field"><label for="pe-b">Beschreibung</label><textarea id="pe-b" rows="3">${esc(p.beschreibung)}</textarea></div>
      <div class="field"><label>Bild</label><div class="imgedit">${src ? `<img src="${src}" alt="">` : '<span class="ph">kein Bild</span>'}<label class="mini-btn">Wählen<input type="file" accept="image/*" id="pe-i" hidden></label></div></div>
      <div class="field"><label>Infos (Bilder, PDF)</label><div class="thumbs">${p.info_dateien.map((n, i) => `<span class="tb">${esc(n)}<button data-ix="${i}" aria-label="entfernen">×</button></span>`).join('')}${p.neuDateien.map((f, i) => `<span class="tb neu">${esc(f.name)}<button data-nx="${i}" aria-label="entfernen">×</button></span>`).join('')}</div>
        <label class="mini-btn" style="align-self:flex-start;margin:0">+ Datei<input type="file" accept="image/*,application/pdf" id="pe-z" multiple hidden></label></div>`;
  },
  leiste: () => `<button class="btn wide" data-spe>${rang() >= 3 || ui.pe.produkt_id ? 'Speichern' : 'Vorschlagen'}</button>`,
  bind: root => {
    const p = ui.pe;
    const erfassen = () => {
      p.name = val(root, '#pe-n'); p.kategorie = val(root, '#pe-k'); p.beschreibung = root.querySelector('#pe-b').value.trim();
      const pr = parseFloat(val(root, '#pe-p').replace(',', '.')); p.preis = isNaN(pr) ? NaN : Math.round(pr * 100);
      if (root.querySelector('#pe-s')) { p.sortierung = Number(val(root, '#pe-s')) || 0; p.aktiv = root.querySelector('#pe-a').checked; }
    };
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
        produkt: { produkt_id: p.produkt_id, name: p.name, kategorie: p.kategorie, preis: p.preis, sortierung: p.sortierung, aktiv: p.aktiv, beschreibung: p.beschreibung, info_dateien: p.info_dateien },
        bild: p.neuBild ? { data: p.neuBild.split(',')[1] } : null,
        zusatzdateien: p.neuDateien.map(f => ({ name: f.name, mime: f.mime, data: f.url.split(',')[1] })) }, true);
      if (!r.ok) return;
      toast(r.vorschlag ? 'Vorgeschlagen' : 'Gespeichert');
      if (p.eltern === 'produkte') produkteLaden();
      if (p.eltern) go(p.eltern, p.eltern === 'standedit' ? true : undefined); else home();
      sync();
    }));
  }
};

/* ---------- Kategorien ---------- */
P.kategorien = {
  get form() { return !!ui.ke; },
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
P.personen = {
  key: 'personen',
  titel: 'Personen & Rollen',
  open: data => { ui.offen = data && data.offen || null; ui.uq = ''; laden('personen', { aktion: 'benutzer_liste' }); },
  body: () => `<label class="search">${I.search}<input id="uq" type="search" placeholder="Suchen" value="${esc(ui.uq || '')}" aria-label="Person suchen"></label>` + geladen('personen', x => {
    const q = (ui.uq || '').toLowerCase();
    const admin = rang() >= 4;
    const rf = { wartet: 0, aktiv: 1, gesperrt: 2 };
    return x.benutzer.filter(b => !q || b.name.toLowerCase().includes(q)).sort((a, b) => rf[a.status] - rf[b.status] || ROLLEN[b.rolle] - ROLLEN[a.rolle] || a.name.localeCompare(b.name)).map(b => {
      const darf = (admin || ROLLEN[b.rolle] < 3) && b.benutzer_id !== S.user.benutzer_id;
      const rollen = admin ? Object.keys(ROLLEN) : ['Helfer', 'Standleitung'];
      const offen = ui.offen === b.benutzer_id && darf;
      return `<div class="card${offen ? ' sel' : ''}"><button class="hd plain" data-uo="${esc(b.benutzer_id)}"><b>${esc(b.name)}</b><span class="pill ${b.status === 'aktiv' ? 's' : b.status === 'wartet' ? 'q' : 'st'}">${b.status === 'aktiv' ? esc(b.rolle) : b.status}</span></button>
        ${offen ? `
          ${b.status === 'aktiv' ? `<div class="seg">${rollen.map(r => `<button data-ur="${r}" aria-pressed="${b.rolle === r}">${r.replace('leitung', '-L.')}</button>`).join('')}</div>` : ''}
          <div class="acts">${b.status === 'gesperrt' || b.status === 'wartet' ? '<button class="mini-btn" data-us="aktiv">Freigeben</button>' : '<button class="mini-btn danger-t" data-us="gesperrt">Sperren</button>'}
          ${admin ? '<input class="pin-in num" id="np" inputmode="numeric" maxlength="6" placeholder="neue PIN" aria-label="neue PIN"><button class="mini-btn" data-pin>PIN setzen</button>' : ''}</div>` : ''}</div>`;
    }).join('');
  }),
  bind: root => {
    const q = root.querySelector('#uq');
    q.addEventListener('input', () => { ui.uq = q.value; const p = q.selectionStart; render(); const n = app.querySelector('#uq'); n.focus(); n.setSelectionRange(p, p); });
    root.querySelectorAll('[data-uo]').forEach(b => b.addEventListener('click', () => { ui.offen = ui.offen === b.dataset.uo ? null : b.dataset.uo; render(); }));
    const aendern = p => {
      const b = L.personen.benutzer.find(x => x.benutzer_id === ui.offen);
      aktion('benutzer_aendern', Object.assign({ ziel_id: ui.offen }, p));
      if (p.rolle) b.rolle = p.rolle;
      if (p.status) b.status = p.status;
      render(); toast('Gespeichert');
    };
    root.querySelectorAll('[data-ur]').forEach(b => b.addEventListener('click', () => aendern({ rolle: b.dataset.ur })));
    root.querySelectorAll('[data-us]').forEach(b => b.addEventListener('click', () => aendern({ status: b.dataset.us })));
    const pin = root.querySelector('[data-pin]'); if (pin) pin.addEventListener('click', () => { const v = val(root, '#np'); if (!/^\d{4,6}$/.test(v)) return toast('PIN: 4–6 Ziffern'); aendern({ neue_pin: v }); });
  }
};

/* ---------- Rückmeldungen ---------- */
P.rueckmeldungen = {
  key: 'rueckmeldungen',
  titel: 'Rückmeldungen',
  open: () => laden('rueckmeldungen', { aktion: 'rueckmeldungen_liste' }),
  body: () => geladen('rueckmeldungen', x => x.rueckmeldungen.length ? x.rueckmeldungen.map(r => `<div class="card">
    <div class="hd"><b>${esc(r.typ)} · ${esc(r.name)}</b><span class="muted">${fmtTime(r.zeit)}</span></div>
    <span>${esc(r.text)}</span>${r.stand ? `<span class="muted">${esc(r.stand)}</span>` : ''}
    <div class="seg">${['neu', 'in Arbeit', 'erledigt'].map(s => `<button data-rs="${esc(r.rm_id)}|${s}" aria-pressed="${r.status === s}">${s}</button>`).join('')}</div></div>`).join('') : listeLeer('Keine Rückmeldungen')),
  bind: root => root.querySelectorAll('[data-rs]').forEach(b => b.addEventListener('click', () => {
    const i = b.dataset.rs.lastIndexOf('|'), id = b.dataset.rs.slice(0, i), status = b.dataset.rs.slice(i + 1);
    aktion('rueckmeldung_status', { rm_id: id, status });
    L.rueckmeldungen.rueckmeldungen.find(x => x.rm_id === id).status = status; render();
  }))
};

/* ---------- Einstellungen ---------- */
const EINST_FELDER = [['app_titel', 'App-Titel'], ['verein', 'Verein'], ['schnellbetraege', 'Schnelltasten (€)'], ['storno_anzahl', 'Storno: letzte Bons'], ['abgleich_sekunden', 'Abgleich (Sekunden)'], ['aufgaben', 'Aufgaben im Plan'], ['benachrichtigung_email', 'E-Mail für Probleme']];
P.einstellungen = {
  key: 'einstellungen', form: true,
  titel: 'Einstellungen',
  open: () => laden('einstellungen', { aktion: 'einstellungen_admin' }),
  body: () => geladen('einstellungen', x => EINST_FELDER.map(([k, t]) => `<div class="field"><label for="es-${k}">${t}</label><input id="es-${k}" value="${esc(x.einstellungen[k])}"></div>`).join('')),
  leiste: () => L.einstellungen && L.einstellungen.ok ? '<button class="btn wide" data-spe>Speichern</button>' : '',
  bind: root => { const b = root.querySelector('[data-spe]'); if (b) b.addEventListener('click', () => tue(b, async () => {
    const e = {}; EINST_FELDER.forEach(([k]) => { e[k] = val(root, '#es-' + k); });
    const r = await call({ aktion: 'einstellungen_speichern', einstellungen: e }, true);
    if (r.ok) { L.einstellungen.einstellungen = e; toast('Gespeichert'); sync(); }
  })); }
};

/* Marktleitung: häufig gebrauchte Listen im Hintergrund vorladen */
setTimeout(function vorladen() {
  if (S.user && D && rang() >= 3) { if (!L.struktur) strukturLaden(); if (!L.produkte) produkteLaden(); }
  else setTimeout(vorladen, 4000);
}, 2500);
