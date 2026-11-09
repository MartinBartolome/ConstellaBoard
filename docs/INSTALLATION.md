# Installation und Deployment

Die App besteht aus einer statischen Webseite (GitHub Pages) und einem Supabase-Projekt (Datenbank, Realtime, Edge Functions).

## 1. Supabase-Projekt

1. Projekt anlegen auf [supabase.com](https://supabase.com) (Region z. B. Frankfurt `eu-central-1`).
2. **Datenbank:** Im *SQL Editor* die Dateien aus `supabase/migrations/` in Reihenfolge ausführen
   (oder mit der CLI: `supabase link --project-ref <ref>` und `supabase db push`).
3. **Anonyme Anmeldung aktivieren:** *Authentication → Sign In / Providers → Allow anonymous sign-ins* einschalten.
   Klienten brauchen kein Konto; die anonyme Kennung dient nur der Zugriffskontrolle auf die Echtzeit-Kanäle.
   Empfohlen: unter *Authentication → Attack Protection* CAPTCHA aktivieren, falls Missbrauch auftritt.
4. **Realtime absichern:** *Realtime → Settings → Allow public access* ausschalten (nur private Kanäle).
5. **Edge Functions** veröffentlichen – automatisch per GitHub Actions (Schritt 3) oder manuell:
   ```bash
   supabase functions deploy --project-ref <ref>
   supabase secrets set --project-ref <ref> ALLOWED_ORIGINS="https://<user>.github.io,http://localhost:5173"
   ```

### Zugangsdaten – was wohin gehört

| Wert | Wo | Geheim? |
|---|---|---|
| Projekt-URL (`https://<ref>.supabase.co`) | `.env.production` → `VITE_SUPABASE_URL` | nein |
| Publishable Key (`sb_publishable_…`) | `.env.production` → `VITE_SUPABASE_ANON_KEY` | nein (öffentlich by design) |
| Service-Role-/Secret-Key | **nirgends eintragen** – steht den Edge Functions automatisch zur Verfügung | **ja** |
| Personal Access Token | GitHub → *Settings → Secrets and variables → Actions* → `SUPABASE_ACCESS_TOKEN` | **ja** |
| `CRON_SECRET` (optional) | `supabase secrets set CRON_SECRET=…` – nur nötig, wenn die Bereinigung extern ausgelöst werden soll | **ja** |

Der Build bricht absichtlich ab, falls versehentlich ein geheimer Schlüssel als `VITE_SUPABASE_ANON_KEY` eingetragen wird.

## 2. GitHub Pages

1. Repository öffentlich (GitHub Free) oder GitHub Pro.
2. *Settings → Pages → Build and deployment → Source: GitHub Actions*.
3. Jeder Push auf `main` baut und veröffentlicht die Seite (`.github/workflows/deploy-pages.yml`).
   Adresse: `https://<user>.github.io/<repo>/`. Der Basis-Pfad wird automatisch aus dem Repo-Namen gesetzt.
4. Eigene Domain (optional): unter *Settings → Pages → Custom domain* eintragen und im Workflow `BASE_PATH: /` setzen; `ALLOWED_ORIGINS` ergänzen.

GitHub Pages unterstützt keine eigenen HTTP-Header. Die Sicherheitsrichtlinie (CSP) wird deshalb per `<meta>` gesetzt, Direktlinks auf Sitzungen funktionieren über `404.html` (Kopie von `index.html`).

## 3. GitHub Actions

| Workflow | Auslöser | Zweck |
|---|---|---|
| `ci.yml` | jeder Push / PR | Typprüfung, Unit-Tests, Edge-Function-Typprüfung, Browsertests |
| `deploy-pages.yml` | Push auf `main` | Webseite veröffentlichen |
| `deploy-supabase.yml` | Änderungen an `supabase/functions` | Edge Functions + CORS-Secret veröffentlichen (braucht `SUPABASE_ACCESS_TOKEN`) |
| `e2e-live.yml` | nach Function-Deployment, manuell | Mehrbenutzer-, Echtzeit- und Sicherheitstests gegen das echte Backend |

Datenbank-Migrationen werden bewusst **nicht** automatisch ausgeführt (Schutz vor ungewollten Schemaänderungen).

## 4. Lokale Entwicklung

```bash
npm install
cp .env.example .env.local     # optional, für Live-Sitzungen
npm run dev
npm run sync:shared            # nach Änderungen an src/domain/* (Kopie für Edge Functions)
```
