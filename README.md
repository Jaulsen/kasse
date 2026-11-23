# Weihnachtsmarkt-Kasse

Kassen-App für die Weihnachtsmärkte des Pfadfinderbunds Süd. Läuft im Browser auf Smartphone und Tablet, arbeitet auch ohne Netz und gleicht sich mit einem Google Sheet ab.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Oberfläche und Gestaltung |
| `app.js` | Kern: Anmeldung, Kasse, Offline-Speicher, Abgleich |
| `leitung.js` | Stand-Menü, Hinweise, Personalplan, Codes, Einladungen |
| `verwaltung.js` | Stand bearbeiten, Preise je Markt, Märkte & Stände, Produkte, Kategorien, Personen, Einstellungen |
| `config.js` | **Einzige Datei zum Anpassen:** `API_URL` = Web-App-URL der Google-Schnittstelle |
| `demo-daten.js`, `demo-server.js`, `demo-gs.js` | Demo-Modus, wenn `API_URL` leer ist: die Schnittstelle läuft dann im Browser |
| `sw.js` | Service Worker: hält die App offline bereit |
| `manifest.webmanifest`, `icon-*.png`, `logo.png` | App-Symbol und Name auf dem Startbildschirm |

Die Google-Schnittstelle (`Code.gs`) liegt nicht hier, sondern im Apps-Script-Projekt am Google Sheet.

## Veröffentlichen

Repository › Settings › Pages › Source: *Deploy from a branch*, Branch `main`, Ordner `/ (root)`.

Version 2.0 · November 2026
