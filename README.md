# Weihnachtsmarkt-Kasse

Kassen-App für die Weihnachtsmärkte des Pfadfinderbunds Süd. Läuft im Browser auf Smartphone und Tablet, arbeitet auch ohne Netz und gleicht sich mit einem Google Sheet ab.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Oberfläche und Gestaltung |
| `app.js` | Programmlogik: Kasse, Offline-Speicher, Abgleich |
| `config.js` | **Einzige Datei zum Anpassen:** `API_URL` = Web-App-URL der Google-Schnittstelle |
| `demo-daten.js` | Beispieldaten, wenn `API_URL` leer ist (Demo-Modus) |
| `sw.js` | Service Worker: hält die App offline bereit |
| `manifest.webmanifest`, `icon-*.png`, `logo.png` | App-Symbol und Name auf dem Startbildschirm |

Die Google-Schnittstelle (`Code.gs`) liegt nicht hier, sondern im Apps-Script-Projekt am Google Sheet.

## Veröffentlichen

Repository › Settings › Pages › Source: *Deploy from a branch*, Branch `main`, Ordner `/ (root)`.

Version 1.2 · November 2026
