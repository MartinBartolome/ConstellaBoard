# Sicherheit und Datenschutz

## Grundsätze

1. **Datensparsamkeit:** keine Konten, keine Namenspflicht, keine Protokolle, keine Analyse- oder Trackingdienste, keine externen Schriften oder CDNs.
2. **Kurzlebigkeit:** Brettinhalte existieren nur während der Sitzung. Beenden oder 90 Minuten Inaktivität löschen alles; maximale Laufzeit 12 Stunden.
3. **Serverseitige Kontrolle:** Der Browser hat keinen direkten Zugriff auf Tabellen. Alles läuft über Edge Functions, die Mitgliedschaft, Rolle, Rechte und Eingaben prüfen.

## Zugangskontrolle

| Mechanismus | Umsetzung |
|---|---|
| Sitzungs-ID | 128 Bit Zufall (`crypto.getRandomValues`), URL-sicher |
| Coach-Token | 256 Bit Zufall; gespeichert nur als SHA-256-Hash |
| Teilnehmer-Token | HMAC-SHA-256(Coach-Token, Sitzungs-ID) – Coach kann den Link jederzeit neu anzeigen, der Server kennt nur den Hash |
| Zugangscode (optional) | PBKDF2-SHA-256, 210 000 Iterationen, eigener Salt; max. 10 Versuche / 10 Min. pro Sitzung |
| Token in der Adresse | stehen im Fragment (`#…`) und werden **nie an Server gesendet** oder protokolliert; nach dem Öffnen aus der Adresszeile entfernt und nur im `sessionStorage` des Tabs gehalten |
| Identität | anonyme Supabase-Anmeldung pro Tab (JWT), gebunden an genau einen Teilnehmer-Eintrag |
| Realtime | ausschliesslich **private** Kanäle; RLS-Policies auf `realtime.messages` erlauben Empfang nur Mitgliedern aktiver Sitzungen, Senden von Brettänderungen nur mit Bearbeitungsrecht |
| Revisionen | jede Änderung trägt die Client-ID der Person; der Server lehnt fremde IDs ab |
| Validierung | strenge Prüfung jeder Operation (Typen, Wertebereiche, Längen, keine unbekannten Felder), gleicher Code im Browser und Server |
| Rate-Limiting | Erstellen 10/h pro IP-Hash, Beitreten 30/10 Min. pro IP-Hash und 60/10 Min. pro Sitzung, Speichern 240/Min. pro Person. IP-Adressen nur gesalzen gehasht, Fenster nach 1 h gelöscht |
| Service-Role | existiert nur in Edge Functions; der Build bricht ab, wenn ein geheimer Schlüssel im Browser-Bundle landen würde |
| Tabellen | RLS aktiv, keine Policies, alle Rechte für `anon`/`authenticated` entzogen |
| Browser | Content-Security-Policy (nur eigene Skripte, Verbindungen nur zu Supabase), `no-referrer` |

## Rollen

- **Coach:** alle Rechte, Teilnehmende verwalten (Rechte ändern, entfernen), Sitzung beenden.
- **Teilnehmende:** Standard = hinzufügen, bewegen, bearbeiten, verbinden. Löschen nur eigener Elemente. Sperren/Ausblenden und Ausgeblendetes sehen nur nach Freigabe.
- Rechteänderungen wirken sofort: Server prüft bei jeder Speicherung, der Browser baut die Realtime-Kanäle mit neuen Rechten neu auf.

## Ablauf beim Beenden (`end_session`, eine Transaktion)

1. Status `ended` → alle Edge Functions und Realtime-Policies verweigern ab sofort Zugriffe.
2. Steuernachricht an alle Geräte → Verbindungen werden getrennt, lokale Kopien verworfen.
3. Zugangstoken gelöscht.
4. Brettzustand gelöscht.
5. Teilnehmerdaten gelöscht, anonyme Auth-Konten gelöscht.
6. Gespeicherte Realtime-Nachrichten der Kanäle gelöscht.
7. Es bleibt nur eine Hülle (ID, Zeitstempel, Grund), damit alte Links «beendet» anzeigen; nach 7 Tagen entfernt.

Die automatische Bereinigung (`cleanup_expired_sessions`) läuft alle 5 Minuten per `pg_cron` und beendet Sitzungen nach Inaktivität (Standard 90 Min.) oder nach 12 Stunden.

## Was technisch bestehen bleiben kann (Transparenz)

| Ort | Inhalt | Dauer |
|---|---|---|
| Supabase-Backups | tägliche Datenbanksicherungen können Brettinhalte laufender Sitzungen enthalten | Free: bis ca. 7 Tage (siehe Supabase-Tarif) |
| Supabase-Logs | API-, Auth-, Function- und Realtime-Logs: Zeitpunkt, IP-Adresse, aufgerufene Funktion, Statuscode. **Keine** Brettinhalte und keine Token (Request-Bodies werden nicht protokolliert) | Free: ca. 1 Tag, Pro: 7 Tage |
| GitHub Pages | Zugriffsprotokolle des Webservers (IP, Zeitpunkt, Pfad ohne `#…`) | gemäss GitHub |
| Browser | anonyme Anmeldung und Token im `sessionStorage` des Tabs | bis Tab geschlossen bzw. Sitzung beendet |

## Bekannte Grenzen

- Die feinen Rechte (z. B. «bewegen, aber nicht löschen») werden beim **Speichern** serverseitig erzwungen. Live-Nachrichten im Realtime-Kanal prüft die Datenbank nur grob (darf überhaupt bearbeiten). Ein manipulierter Client mit Bearbeitungsrecht könnte anderen kurzzeitig eine unerlaubte Änderung anzeigen; sie wird nicht gespeichert, bleibt aber bis zum Neuladen in den anderen Browsern sichtbar. Für den Coaching-Kontext mit bekannten Teilnehmenden wird dies als akzeptabel eingestuft.
- Ausgeblendete Elemente werden beim Laden nicht an Personen ohne Recht ausgeliefert; Live-Änderungen daran sind im Kanal aber technisch sichtbar.
- Wer den Einladungslink besitzt, kann beitreten. Für zusätzlichen Schutz den optionalen Zugangscode verwenden und Links vertraulich übermitteln.
- Ende-zu-Ende-Verschlüsselung ist nicht umgesetzt (Supabase sieht Brettinhalte während der Sitzung).

## Sicherheitstests

- Unit-Tests: Validierung manipulierter Operationen, Berechtigungsmatrix, Ablehnung fremder Revisionen, Ende der Sitzung.
- Live-Tests (`tests/live`): Zugriff ohne Token, mit erfundenem Token, Teilnehmer ohne Coach-Rechte, direkter Tabellenzugriff mit öffentlichem Schlüssel, Edge Functions ohne Anmeldung und ohne Mitgliedschaft, alte Links nach Sitzungsende.
