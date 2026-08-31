# Nahdran

Nahdran ist ein privater, mobiloptimierter Jobfinder für familienfreundliche Stellen rund um St. Stefan im Rosental. Die App bündelt öffentliche Inserate, bewertet ihre Passung und verlinkt immer zur Originalquelle.

## Was bereits funktioniert

- responsive Jobliste für Handy und Desktop
- Text-, Orts-, Fahrzeit-, Vormittags- und Teilzeitfilter
- Sortierung nach Passung, Fahrt oder Aktualität
- Favoriten, die lokal im Browser gespeichert bleiben
- Detailansicht mit Aufgaben, Anforderungen, Kontakt, Quelle und offenen Fragen
- transparente Passungsgründe statt einer undurchsichtigen KI-Zahl
- automatischer Import von `JobPosting`-JSON-LD sowie eigenen HTML-Adaptern für `karriere.at` und `jobs.at`
- Dublettenerkennung über normalisierte Position, Firma und Ort
- vorsichtiges Entfernen: HTTP 410 sofort, sonst erst nach drei erfolgreichen Prüfungen ohne Treffer
- täglicher GitHub-Actions-Lauf um 06:15 Uhr während der österreichischen Sommerzeit bzw. 05:15 Uhr im Winter (04:15 UTC)
- automatischer Build, Tests und Veröffentlichung über GitHub Pages

## Lokal starten

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev
```

Tests und Produktionsbuild:

```bash
npm test
npm run build
```

Jobquellen manuell aktualisieren:

```bash
npm run jobs:update
```

## Datenfluss

1. Quellen stehen in [`config/sources.json`](config/sources.json).
2. [`scripts/update-jobs.mjs`](scripts/update-jobs.mjs) ruft nur öffentliche Stellen-Seiten ab.
3. Strukturierte `JobPosting`-Daten und die serverseitigen Portal-Jobkarten werden vereinheitlicht, bewertet und dedupliziert.
4. Bei nicht erreichbaren Quellen bleiben bestehende Daten unverändert.
5. Das Ergebnis wird als [`public/jobs.json`](public/jobs.json) gespeichert.
6. GitHub Pages veröffentlicht den statischen Build ohne persönliche Daten oder Serverkonto.

## Ranking

Die Passung berücksichtigt derzeit:

- Teilzeit oder geringfügige Beschäftigung
- ausdrücklich genannte Vormittagszeiten
- Fahrtzeit ab St. Stefan im Rosental
- Wochenendpflicht
- Nähe zu Büro, Empfang, Verkauf, Service oder Reinigung
- harte fachliche Hürden, soweit aus dem Inserat erkennbar

Die Zahl ist eine Orientierung. Unklare Arbeitszeiten oder Anforderungen werden in der Detailansicht ausdrücklich als Frage dargestellt.

## Neue Quelle ergänzen

Eine öffentliche Such- oder Firmenseite in `config/sources.json` ergänzen. Seiten mit Schema.org-`JobPosting` funktionieren automatisch; `karriere.at` und `jobs.at` besitzen eigene, getestete Adapter. Für weitere Seiten ohne strukturierte Daten ist ein eigener Adapter nötig. Zugangsbeschränkungen, Captchas und Nutzungsbedingungen werden nicht umgangen.

## Veröffentlichung

Die Automatisierung liegt in zwei überprüfbaren Workflows:

- [Jobs täglich aktualisieren](.github/workflows/daily-jobs.yml) prüft jeden Tag um 04:15 UTC alle Quellen, testet und baut die App, versioniert geänderte Jobdaten und veröffentlicht den geprüften Stand.
- [Webseite veröffentlichen](.github/workflows/deploy.yml) testet jeden neuen `main`-Stand erneut und veröffentlicht ausschließlich den erfolgreichen Build auf GitHub Pages.

Der Veröffentlichungsworkflow läuft nach jedem Push auf `main` sowie nach jedem erfolgreichen Tageslauf. Die erzeugte GitHub-Pages-URL kann direkt geteilt und am Home-Bildschirm des Handys gespeichert werden.

## Datenschutz

Favoriten bleiben ausschließlich im jeweiligen Browser (`localStorage`). Nahdran sammelt keine Bewerbungsdaten. Eine Bewerbung erfolgt immer auf der Originalseite des Arbeitgebers oder Portals.
