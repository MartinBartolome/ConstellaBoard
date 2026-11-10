# ConstellaBoard

Digitales Systembrett für Familien- und Systemaufstellungen, systemisches Coaching und psychologische Beratung – im Browser, auf Desktop, Tablet und Smartphone, in Echtzeit mit mehreren Personen.

- **Ohne Konto:** Coaches starten eine Sitzung mit einem Klick, Klientinnen und Klienten treten über einen geheimen Link bei.
- **Echtzeit:** Figuren, Blickrichtungen, Beziehungen und Notizen werden sofort geteilt.
- **Spurlos:** Beim Beenden (oder nach 90 Minuten Inaktivität) werden Brett, Teilnehmende und Zugänge auf dem Server gelöscht.
- **Gratis betreibbar:** GitHub Pages + Supabase Free Tier.

## Funktionen

| Bereich | Umfang |
|---|---|
| Brett | Grosse SVG-Arbeitsfläche, Zoom (Rad, Trackpad, Zwei-Finger), Verschieben, Auswahlrechteck, Mehrfachauswahl, Ziehen, Drehen, Skalieren, Beschriften, Duplizieren, Löschen, Sperren, Ausblenden, Gruppieren, Ebenen, Textnotizen, Kontextmenü (Rechtsklick / langes Drücken), Tastaturkürzel |
| Figuren | 34 Figuren in 9 Kategorien (Mann, Frau, Kind, Baby, Neutrale Person, Tier, Familie, Symbol, Abstrakt), Blickrichtung, 12 Naturfarben + freie Farbe, Drag-and-drop auch per Touch |
| 3D-Ansicht | Umschaltbar: gedrechselte Holzfiguren mit Maserung (PBR), echtes Systembrett (Ahorn, Eiche, Kirschbaum, Nussbaum, Filz, Leinen), zehn ruhige Umgebungen (Atelier, Wohnzimmer, Salon, Alpenwiese, Sommerwiese, Waldbach, See, Strand, Abendlicht, Raum), das Brett steht auf einem passenden Tisch mit Stühlen – frei wählbar pro Person |
| Sätze | Pro Figur ein einprägsamer Satz: Sprechblase in 3D, Zeile in 2D, auf Wunsch vorgelesen (Sprachausgabe des Geräts) |
| Beziehungen | Normal, Eng, Konflikt, Distanz, Emotional, Einseitig, Frei – Farbe, Stärke, Linienart, Richtung, Beschriftung; bleiben an Figuren verankert |
| Verlauf | Rückgängig/Wiederherstellen (eigene Schritte, auch in Live-Sitzungen) |
| Sitzungen | Coach- und Teilnehmer-Links, optionaler Zugangscode, Anzeigenamen optional, bis 20 Personen |
| Zusammenarbeit | Echtzeit, Anwesenheit, farbige Cursor, Wiederverbindung ohne Datenverlust, konfliktfreie Zusammenführung |
| Rollen | Coach (volle Kontrolle, Rechte vergeben, Personen entfernen, Sitzung beenden) und Teilnehmende (Rechte frei einstellbar) |
| Datenschutz | Siehe [docs/SICHERHEIT.md](docs/SICHERHEIT.md) und die Seite «Datenschutz» in der App |

## Schnellstart (lokal)

```bash
npm install
npm run dev          # http://localhost:5173 – ohne .env.local läuft das lokale Übungsbrett
npm test             # Unit-Tests (Vitest)
npm run test:e2e     # Browsertests (Playwright, Desktop/Tablet/Smartphone)
```

Für Live-Sitzungen lokal: `.env.example` nach `.env.local` kopieren und Werte eintragen.

## Dokumentation

- [Installation und Deployment](docs/INSTALLATION.md)
- [Architektur](docs/ARCHITEKTUR.md)
- [Sicherheit und Datenschutz](docs/SICHERHEIT.md)
- [Betriebskosten und Limits](docs/KOSTEN.md)

## Technologie

React 19, TypeScript, Vite, Tailwind CSS 4, SVG · Supabase (PostgreSQL, Realtime, Edge Functions, RLS) · GitHub Pages · GitHub Actions · Vitest, Playwright.
Bewusst keine weiteren Laufzeit-Abhängigkeiten ausser `react`, `react-dom` und `@supabase/supabase-js`.

## Projektstruktur

```
src/
  domain/      Datenmodell, Zusammenführung, Befehle, Berechtigungen, Validierung (auch vom Server genutzt)
  state/       BoardStore: Zustand, Revisionen, Undo/Redo
  board/       Editor, Arbeitsfläche, Figuren, Linien, Bibliothek, Eigenschaften
  sync/        Supabase-Anbindung, LiveSession (Echtzeit + Outbox), Test-Server
  session/     Teilnehmerverwaltung
  pages/       Startseite, Datenschutz, Übungsbrett, Sitzung
supabase/
  migrations/  Datenbankschema, RLS, Löschfunktionen, pg_cron
  functions/   Edge Functions (create/join/validate/get/update/close/manage/cleanup)
tests/e2e      Browsertests ohne Server · tests/live  Tests gegen das echte Backend
```
