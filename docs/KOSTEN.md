# Betriebskosten und Limits

Die App startet vollständig in kostenlosen Tarifen. Angaben zu den Tarifen: Stand November 2026 nach bestem Wissen – bitte bei den Anbietern prüfen, die Konditionen ändern sich.

## GitHub Pages (kostenlos für öffentliche Repositories)

- Seitengrösse max. 1 GB (App: < 1 MB), weiche Grenze ca. 100 GB Datenverkehr/Monat.
- Private Repositories brauchen GitHub Pro.

## Supabase Free

| Ressource | Freikontingent | Verbrauch von ConstellaBoard |
|---|---|---|
| Datenbank | 500 MB | winzig – Daten werden nach Sitzungen gelöscht |
| Edge Functions | 500 000 Aufrufe/Monat | ca. 300–600 pro Stunde aktiver Sitzung (Speichern gebündelt, Lebenszeichen alle 4 Min.) |
| Realtime-Nachrichten | 2 Mio./Monat | **Engpass:** Cursor (max. 10/s pro bewegter Maus) + Änderungen; grob 5 000–20 000 pro Stunde und Person |
| Realtime-Verbindungen | 200 gleichzeitig | 2 pro Person (Kanäle teilen sich eine Verbindung) |
| Auth (anonyme Nutzer) | 50 000 MAU | 1 pro Person und Tab; werden nach Sitzungsende gelöscht |

**Grobe Schätzung:** etwa 100–200 einstündige Sitzungen mit 2 Personen pro Monat im Gratis-Tarif; begrenzend sind die Realtime-Nachrichten.

**Wichtig:** Kostenlose Supabase-Projekte werden nach etwa 7 Tagen ohne Nutzung pausiert und müssen im Dashboard reaktiviert werden.

## Bei Überschreitung

- Free-Projekte werden bei Überschreitung gedrosselt bzw. Dienste eingeschränkt, nicht automatisch berechnet.
- Supabase Pro (ca. 25 USD/Monat) enthält deutlich höhere Kontingente (z. B. 2 Mio. Function-Aufrufe, 5 Mio. Realtime-Nachrichten); darüber nutzungsbasiert (Grössenordnung: 2 USD pro weitere Mio. Aufrufe, 2.50 USD pro weitere Mio. Realtime-Nachrichten).
- Sparhebel: Cursor-Frequenz senken (`cursorIntervalMs` in `src/sync/LiveSession.ts`), Speicherintervall erhöhen (`flushDelayMs`).
