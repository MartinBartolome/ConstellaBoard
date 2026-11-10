import { useEffect } from 'react'
import { Logo } from '../components/Logo'
import { Link } from '../lib/router'

export function PrivacyPage() {
  useEffect(() => {
    document.title = 'Datenschutz – ConstellaBoard'
  }, [])
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <article className="panel space-y-6 p-6 leading-relaxed text-ink-2 sm:p-10">
          <h1 className="font-serif text-3xl font-semibold text-ink">Datenschutz</h1>
          <p>
            ConstellaBoard ist so gebaut, dass möglichst wenige Daten entstehen und diese so kurz wie möglich bestehen. Diese Seite beschreibt
            transparent, was technisch passiert.
          </p>

          <Section title="Welche Daten entstehen während einer Sitzung?">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Eine zufällige Sitzungs-ID sowie Erstellungs-, Aktivitäts- und Ablaufzeitpunkt.</li>
              <li>Der Brettzustand: Figuren, Positionen, Farben, Beschriftungen, Sätze der Figuren, Verbindungen und Notizen.</li>
              <li>Pro teilnehmender Person: eine zufällige technische Kennung, Rolle, Berechtigungen und ein frei wählbarer Anzeigename (optional, z. B. «Gast»).</li>
              <li>Zugangstoken werden ausschliesslich als kryptografischer Hash (SHA-256) gespeichert, ein optionaler Zugangscode als gesalzener PBKDF2-Hash.</li>
              <li>Zur Abwehr von Missbrauch (Rate-Limiting) wird ein gesalzener Hash der IP-Adresse für höchstens eine Stunde gespeichert.</li>
            </ul>
          </Section>

          <Section title="Was wird nicht gespeichert?">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Keine Konten, E-Mail-Adressen oder Klientennamen.</li>
              <li>Keine Gesprächsprotokolle, Audio- oder Videoaufnahmen.</li>
              <li>Keine Tracking-, Analyse- oder Werbedienste, keine Cookies zu Werbezwecken, keine externen Schriften.</li>
              <li>
                Die gewählte 3D-Umgebung und das Brett bleiben nur in deinem Browser. Das Vorlesen von Sätzen nutzt ausschliesslich Stimmen, die
                auf deinem Gerät installiert sind – der Text verlässt das Gerät dafür nicht.
              </li>
            </ul>
          </Section>

          <Section title="Was passiert beim Beenden?">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Schreibzugriffe werden gesperrt.</li>
              <li>Alle Verbindungen der Teilnehmenden werden getrennt.</li>
              <li>Alle Zugangstoken werden widerrufen.</li>
              <li>Der Brettzustand wird gelöscht.</li>
              <li>Teilnehmerdaten und technische Kennungen werden gelöscht.</li>
              <li>Die Sitzung wird als beendet markiert; es verbleiben nur ID und Zeitstempel, damit ein alter Link «beendet» anzeigt. Auch diese werden nach 7 Tagen gelöscht.</li>
            </ol>
            <p className="mt-3">Sitzungen ohne Aktivität werden nach 90 Minuten automatisch auf dieselbe Weise beendet.</p>
          </Section>

          <Section title="Was kann bei den Infrastruktur-Anbietern verbleiben?">
            <p>
              ConstellaBoard nutzt Supabase (Datenbank, Echtzeit, Server-Funktionen) und Cloudflare Pages (Auslieferung der Webseite). Auch nach
              dem Löschen können technisch bedingt Daten für begrenzte Zeit bestehen:
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                <strong>Datenbank-Backups von Supabase:</strong> tägliche Sicherungen können gelöschte Brettinhalte bis zum Ablauf der
                Aufbewahrungsfrist (im kostenlosen Tarif in der Regel bis 7 Tage) enthalten. Sie sind nicht öffentlich zugänglich.
              </li>
              <li>
                <strong>Technische Protokolle:</strong> Supabase und Cloudflare protokollieren Anfragen (u. a. IP-Adresse, Zeitpunkt, aufgerufene
                Adresse) für Betrieb und Sicherheit für einige Tage. Einladungstoken stehen im Teil der Adresse nach dem «#» und werden deshalb
                nicht an Server übertragen oder protokolliert.
              </li>
              <li>
                <strong>Browser:</strong> Ihr Browser speichert für die Dauer des Tabs eine technische Sitzungskennung. Beim Beenden wird sie
                entfernt.
              </li>
            </ul>
          </Section>

          <Section title="Hinweis für Fachpersonen">
            <p>
              Als Coach oder Beraterin bzw. Berater sind Sie für die Einhaltung Ihrer Berufs- und Schweigepflichten verantwortlich. Verwenden Sie
              auf dem Brett möglichst keine identifizierenden Angaben, sondern Rollenbezeichnungen wie «Vater» oder «Ich».
            </p>
          </Section>
        </article>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-serif text-xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  )
}
