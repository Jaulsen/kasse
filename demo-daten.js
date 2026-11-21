/* Beispieldaten für den Demo-Modus (ohne API_URL). Aufbau wie die Antwort der Google-Schnittstelle. */
(function () {
  const svg = (bg, body) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${bg}"/>${body}</svg>`);
  const star = (fill, stroke) => `<path d="M200 48l34 74 81 9-60 55 17 80-72-41-72 41 17-80-60-55 81-9z" fill="${fill}" stroke="${stroke}" stroke-width="6" stroke-linejoin="round"/>`;
  const tree = `<path d="M200 40l70 90h-35l60 80h-40l45 60H100l45-60h-40l60-80h-35z" fill="#6E4A24"/><rect x="186" y="270" width="28" height="30" fill="#4A3217"/>`;

  window.KASSE_DEMO = {
    bilder: {
      'holzstern_gross.jpg': svg('#E9DCC4', star('#B9874E', '#7A5428')),
      'holzstern_klein.jpg': svg('#EFE5D2', `<g transform="translate(100 75) scale(.5)">${star('#C79A63', '#7A5428')}</g>`),
      'holztanne.jpg': svg('#E3EBDD', tree),
      'strohstern.jpg': svg('#2158A1', star('#F2D27A', '#C9A33F')),
      'holzstern_detail.jpg': svg('#D9C6A3', `<g transform="translate(-60 -40) scale(1.4)">${star('#B9874E', '#7A5428')}</g><text x="20" y="285" font-family="Arial" font-size="22" fill="#4A3217">Detail: Aufhängung aus Jute</text>`)
    },
    stammdaten: {
      einstellungen: { app_titel: 'Weihnachtsmarkt-Kasse', verein: 'Pfadfinderbund Süd', schnellbetraege: [5, 10, 20, 50], storno_anzahl: 2, abgleich_sekunden: 60 },
      kategorien: [
        { kategorie: 'Holzwerk', sortierung: 10, farbe: '#8B5A2B' },
        { kategorie: 'Deko', sortierung: 20, farbe: '#2158A1' },
        { kategorie: 'Gebäck', sortierung: 30, farbe: '#B07A2A' },
        { kategorie: 'Getränke', sortierung: 40, farbe: '#A8352A' },
        { kategorie: 'Pfand', sortierung: 90, farbe: '#5E6A61' }
      ],
      produkte: [
        ['P001', 'Holzstern groß', 'Holzwerk', 800, 'holzstern_gross.jpg', 'Handgesägter Stern aus heimischer Fichte, etwa 30 cm.\nFür innen und außen geeignet.\n\nPflege: ein- bis zweimal im Jahr dünn mit Leinöl einreiben.', [{ name: 'holzstern_detail.jpg', typ: 'bild' }, { name: 'Pflegeanleitung.pdf', typ: 'dok', url: '' }]],
        ['P002', 'Holzstern klein', 'Holzwerk', 400, 'holzstern_klein.jpg', '', []],
        ['P003', 'Schneidebrett Buche', 'Holzwerk', 1800, '', 'Massives Buchenholz, geölt, 35 × 22 cm.\nNicht in die Spülmaschine.', []],
        ['P004', 'Vogelhaus', 'Holzwerk', 2500, '', '', []], ['P005', 'Kochlöffel', 'Holzwerk', 500, '', '', []],
        ['P006', 'Teelichthalter', 'Holzwerk', 600, '', '', []], ['P007', 'Holzrentier', 'Holzwerk', 1200, '', '', []],
        ['P008', 'Schlüsselbrett', 'Holzwerk', 1500, '', '', []], ['P009', 'Untersetzer 4er', 'Holzwerk', 900, '', '', []],
        ['P010', 'Holztanne', 'Holzwerk', 1000, 'holztanne.jpg', '', []], ['P011', 'Futterhäuschen', 'Holzwerk', 1400, '', '', []],
        ['P020', 'Strohstern', 'Deko', 250, 'strohstern.jpg', '', []], ['P021', 'Adventskranz', 'Deko', 2200, '', '', []],
        ['P022', 'Türkranz', 'Deko', 1800, '', '', []], ['P023', 'Weihnachtskarte', 'Deko', 200, '', '', []],
        ['P024', 'Bienenwachskerze', 'Deko', 600, '', 'Aus reinem Bienenwachs, Brenndauer etwa 20 Stunden.', []],
        ['P025', 'Mistelzweig', 'Deko', 300, '', '', []], ['P026', 'Baumanhänger', 'Deko', 350, '', '', []],
        ['P040', 'Plätzchen (Tüte)', 'Gebäck', 300, '', 'Enthält Weizen, Ei, Milch, Butter und Nüsse.', []],
        ['P041', 'Lebkuchen', 'Gebäck', 250, '', '', []], ['P042', 'Stollen klein', 'Gebäck', 600, '', '', []],
        ['P043', 'Waffel', 'Gebäck', 250, '', '', []], ['P044', 'Crêpe', 'Gebäck', 350, '', '', []], ['P045', 'Stockbrot', 'Gebäck', 200, '', '', []],
        ['P060', 'Glühwein', 'Getränke', 350, '', '', []], ['P061', 'Kinderpunsch', 'Getränke', 250, '', '', []],
        ['P062', 'Kaffee', 'Getränke', 200, '', '', []], ['P063', 'Tee', 'Getränke', 150, '', '', []], ['P064', 'Heiße Schokolade', 'Getränke', 250, '', '', []],
        ['P090', 'Tasse Pfand', 'Pfand', 200, '', '', []], ['P091', 'Tasse zurück', 'Pfand', -200, '', '', []]
      ].map((p, i) => ({ produkt_id: p[0], name: p[1], kategorie: p[2], preis: p[3], bild: p[4], bild_t: p[4] ? 1 : 0, sortierung: i, beschreibung: p[5], info: p[6].map(x => Object.assign({ t: 1 }, x)) })),
      maerkte: [
        { markt_id: 'M001', name: 'Weihnachtsmarkt Musterstadt – Holzstand', ort: 'Marktplatz', datum_von: '2026-11-28', datum_bis: '2026-11-29', kategorien: ['Holzwerk', 'Deko'] },
        { markt_id: 'M002', name: 'Weihnachtsmarkt Musterstadt – Café', ort: 'Marktplatz', datum_von: '2026-11-28', datum_bis: '2026-11-29', kategorien: ['Gebäck', 'Getränke', 'Pfand'] },
        { markt_id: 'M003', name: 'Adventsbasar Gemeindehaus', ort: 'Gemeindehaus', datum_von: '2026-12-06', datum_bis: '2026-12-06', kategorien: 'ALLE' }
      ],
      verfuegbarkeit: []
    }
  };
})();
