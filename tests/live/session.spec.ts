import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * Ende-zu-Ende gegen das echte Backend:
 * Sitzung erstellen, beitreten, Echtzeit, Rechte, Wiederverbindung,
 * Beenden und Löschung sowie Zugriffsschutz.
 */

const SUPABASE_URL = 'https://jkoricufhaqemnqgpneo.supabase.co'
const KEY = 'sb_publishable_LlDYhPawo6aEbDCwLbiUvw_NxdQDjiM'

async function createSessionAsCoach(browser: Browser) {
  const ctx = await browser.newContext()
  const coach = await ctx.newPage()
  await coach.goto('/')
  await coach.getByTestId('new-session').click()
  await expect(coach.getByTestId('connection-status')).toHaveAttribute('data-status', 'online', { timeout: 20_000 })
  await coach.getByTestId('share').click()
  const invite = await coach.getByTestId('invite-link').inputValue()
  await coach.keyboard.press('Escape')
  expect(invite).toMatch(/\/s\/[A-Za-z0-9_-]+#t=[A-Za-z0-9_-]{40,}/)
  return { coach, invite }
}

async function joinAsParticipant(browser: Browser, invite: string, name = 'Testgast') {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(invite.replace(/^https?:\/\/[^/]+/, ''))
  await page.locator('#display-name').fill(name)
  await page.getByTestId('welcome-join').click()
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'online', { timeout: 20_000 })
  return page
}

async function addFigure(page: Page, type: string) {
  await page.getByTestId(`lib-${type}`).click()
}

async function endSession(coach: Page) {
  await coach.getByTestId('end-session').click()
  await coach.getByTestId('confirm-end').click()
  await expect(coach.getByTestId('info-screen')).toBeVisible({ timeout: 20_000 })
}

test('Sitzung erstellen, beitreten und in Echtzeit zusammenarbeiten', async ({ browser }) => {
  const { coach, invite } = await createSessionAsCoach(browser)
  const client = await joinAsParticipant(browser, invite)

  // Token wird aus der Adresszeile entfernt
  expect(client.url()).not.toContain('#t=')

  // Teilnehmeranzeige
  await expect(coach.getByTestId('connection-status')).toContainText('1 weitere Person', { timeout: 15_000 })

  // Coach fügt hinzu → Klient sieht es
  await addFigure(coach, 'frau')
  await expect(client.getByTestId('figure')).toHaveCount(1, { timeout: 10_000 })
  // Klient fügt hinzu → Coach sieht es
  await addFigure(client, 'mann')
  await expect(coach.getByTestId('figure')).toHaveCount(2, { timeout: 10_000 })

  // Verbindung erstellen
  const b = (await client.getByTestId('board').boundingBox())!
  const f0 = (await client.getByTestId('figure').nth(0).boundingBox())!
  const f1 = (await client.getByTestId('figure').nth(1).boundingBox())!
  await client.getByTestId('tool-connect').click()
  await client.mouse.click(f0.x + f0.width / 2, f0.y + f0.height / 2)
  await client.mouse.click(f1.x + f1.width / 2, f1.y + f1.height / 2)
  await expect(coach.getByTestId('connection')).toHaveCount(1, { timeout: 10_000 })
  void b

  // Neu laden: Zustand kommt vom Server zurück (dauerhaft bis Sitzungsende)
  await client.reload()
  await expect(client.getByTestId('figure')).toHaveCount(2, { timeout: 15_000 })

  // Rechte entziehen → Klient sieht «Nur Ansicht»
  await coach.getByTestId('participants-button').click()
  await coach.getByRole('button', { name: 'Nur ansehen' }).click()
  await expect(client.getByText('Nur Ansicht')).toBeVisible({ timeout: 15_000 })

  await endSession(coach)
  // Klient wird getrennt und sieht das Ende
  await expect(client.getByTestId('info-screen')).toContainText('beendet', { timeout: 20_000 })
  // Alter Link funktioniert nicht mehr
  const again = await (await browser.newContext()).newPage()
  await again.goto(invite.replace(/^https?:\/\/[^/]+/, ''))
  await again.getByTestId('welcome-join').click()
  await expect(again.getByTestId('info-screen')).toBeVisible({ timeout: 15_000 })
})

test('Wiederverbindung nach Netzwerkunterbruch ohne Datenverlust', async ({ browser }) => {
  const { coach, invite } = await createSessionAsCoach(browser)
  const client = await joinAsParticipant(browser, invite)
  await client.context().setOffline(true)
  await addFigure(client, 'kind-junge')
  await addFigure(coach, 'frau')
  await client.context().setOffline(false)
  await expect(coach.getByTestId('figure')).toHaveCount(2, { timeout: 45_000 })
  await expect(client.getByTestId('figure')).toHaveCount(2, { timeout: 45_000 })
  await endSession(coach)
})

test.describe('Sicherheit', () => {
  test('Fremde haben ohne gültiges Token keinen Zugang', async ({ browser }) => {
    const { coach, invite } = await createSessionAsCoach(browser)
    const sessionPath = invite.replace(/^https?:\/\/[^/]+/, '').split('#')[0]!
    const intruder = await (await browser.newContext()).newPage()
    // Ohne Token
    await intruder.goto(sessionPath)
    await expect(intruder.getByTestId('info-screen')).toContainText('unvollständig')
    // Mit erfundenem Token
    await intruder.goto(`${sessionPath}#t=${'A'.repeat(43)}`)
    await intruder.getByTestId('welcome-join').click()
    await expect(intruder.getByTestId('info-screen')).toBeVisible({ timeout: 15_000 })
    // Teilnehmer-Token gibt keine Coach-Rechte
    const p = await joinAsParticipant(browser, invite)
    await expect(p.getByTestId('end-session')).toHaveCount(0)
    await endSession(coach)
  })

  test('Tabellen sind mit dem öffentlichen Schlüssel nicht lesbar', async ({ request }) => {
    for (const table of ['sessions', 'participants', 'board_states', 'session_tokens']) {
      const res = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
      // Entweder verweigert oder leer – niemals Daten
      if (res.ok()) expect(await res.json()).toEqual([])
      else expect([401, 403, 404]).toContain(res.status())
    }
  })

  test('Edge Functions verweigern Zugriffe ohne Anmeldung und ohne Mitgliedschaft', async ({ request }) => {
    const anon = await request.post(`${SUPABASE_URL}/functions/v1/get-board-state`, {
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      data: { sessionId: 'x'.repeat(22) },
    })
    expect(anon.status()).toBe(401)

    // Anonym angemeldet, aber nicht Mitglied
    const signup = await request.post(`${SUPABASE_URL}/auth/v1/signup`, { headers: { apikey: KEY, 'Content-Type': 'application/json' }, data: {} })
    expect(signup.ok()).toBeTruthy()
    const jwt = (await signup.json()).access_token as string
    for (const fn of ['get-board-state', 'update-board-state', 'close-session', 'manage-participant']) {
      const res = await request.post(`${SUPABASE_URL}/functions/v1/${fn}`, {
        headers: { apikey: KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        data: { sessionId: 'AAAAAAAAAAAAAAAAAAAAAA', ops: [], action: 'list' },
      })
      expect([403, 404, 410]).toContain(res.status())
    }
  })
})
