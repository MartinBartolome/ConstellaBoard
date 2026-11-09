# Architektur

```
Browser (GitHub Pages, statisch)                     Supabase
┌──────────────────────────────┐   HTTPS (JWT)   ┌──────────────────────────────┐
│ React-App                    │ ─────────────▶ │ Edge Functions (Deno)         │
│  BoardEditor (SVG)           │                 │  create/join/validate/get/    │
│  BoardStore (Zustand, Undo)  │                 │  update/close/manage/cleanup  │
│  LiveSession (Outbox, Sync)  │                 │      │ Service-Role            │
│                              │  WebSocket      │      ▼                         │
│                              │ ◀────────────▶ │ Realtime (private Kanäle)      │
└──────────────────────────────┘   (JWT, RLS)    │ PostgreSQL + RLS + pg_cron     │
                                                 └──────────────────────────────┘
```

## Datenmodell des Bretts

- Elemente: `figure`, `connection`, `note` mit stabiler ID.
- **Pro Feld eine Revision** (Lamport-Zähler + Client-ID). Zusammenführung = «höhere Revision gewinnt» je Feld → kommutativ, idempotent, keine verlorenen Änderungen an unterschiedlichen Feldern.
- Löschen erzeugt Grabsteine; «Rückgängig» erzeugt neue Operationen mit höheren Revisionen und wird dadurch ebenfalls synchronisiert.
- Undo/Redo betrifft nur eigene Schritte (wie in kollaborativen Whiteboards üblich).

## Synchronisierung

1. Lokale Änderung → `BoardStore.execute` → Operation mit Revision.
2. Sofort per Realtime-Broadcast an alle (`session:<id>:ops`).
3. Gesammelt (600 ms) an `update-board-state` → Server validiert, prüft Rechte, führt zusammen, speichert mit optimistischer Versionsprüfung (bis 6 Wiederholungen).
4. Nicht bestätigte Operationen bleiben in der **Outbox** und werden nach Fehlern mit wachsendem Abstand erneut gesendet.
5. Nach jeder (Wieder-)Verbindung und alle 2 Minuten: Serverzustand laden und zusammenführen.

Anwesenheit (Presence), Cursor (max. 10/s) und Steuernachrichten (`ended`, `permissions`, `removed`) laufen über `session:<id>`.

## Gemeinsame Fachlogik

`src/domain/{types,rev,merge,permissions,validate}.ts` werden unverändert in `supabase/functions/_shared/domain/` kopiert (`npm run sync:shared`). Ein Test schlägt fehl, wenn die Kopien veraltet sind.

## Erweiterbarkeit (vorbereitet)

| Zukünftige Funktion | Ansatzpunkt |
|---|---|
| Coach-Konten | `participants.auth_uid` kann auf echte Konten zeigen; Rolle Coach an Konto binden |
| Eigene/persönliche Figurenbibliotheken | `FigureTemplate` ist datengetrieben; unbekannte Typen fallen auf eine neutrale Figur zurück |
| Eigene Figuren (auch 3D/Blender-Renderings) | neue `FigureShape` oder Bild-basierte Vorlage in `FigureShape.tsx` |
| Erweiterte Beziehungsarten | `CONNECTION_PRESETS` + Validierungsliste |
| Weitere Brettlayouts | Hintergrund in `Canvas.tsx` (Raster) austauschbar |
| Farbthemen | Design-Tokens in `src/styles/index.css` (`@theme`) |
| Mehrsprachigkeit | Texte sind in Komponenten gebündelt; Umstieg auf Übersetzungstabellen ohne Strukturänderung |
| PDF-/Bildexport | Brett ist reines SVG → direkt serialisierbar |
| Abrechnung/Abos | Sitzungserstellung läuft zentral über `create-session` |
| Datenmodell-Migrationen | `BoardState.schema` |
