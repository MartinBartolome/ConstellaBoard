import { expect, test, type Page } from '@playwright/test'
import { dragMouse } from './helpers'

type P = { x: number; y: number }

/** Brettpunkt → Bildschirmpunkt über die Test-Schnittstelle der 3D-Ansicht. */
async function screenOf(page: Page, p: P, h = 0): Promise<P> {
  return page.getByTestId('board-3d').evaluate((el, [p, h]) => {
    const handle = (el as unknown as { board3d?: { screenOf(p: P, h?: number): P } }).board3d
    if (!handle) throw new Error('3D-Ansicht nicht bereit')
    return handle.screenOf(p as P, h as number)
  }, [p, h] as const)
}

/** Positionen aller Figuren, gelesen aus der 2D-Ansicht. */
async function figurePositions(page: Page): Promise<P[]> {
  await page.getByTestId('view-2d').click()
  const ts = await page.getByTestId('figure').evaluateAll((es) => es.map((e) => e.getAttribute('transform') ?? ''))
  await page.getByTestId('view-3d').click()
  await expect(page.getByTestId('board-3d')).toBeVisible()
  await waitFor3d(page)
  return ts.map((t) => {
    const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(t)!
    return { x: Number(m[1]), y: Number(m[2]) }
  })
}

async function open3d(page: Page) {
  await page.goto('/brett')
  await page.getByTestId('view-3d').click()
  await expect(page.getByTestId('board-3d')).toBeVisible()
  await waitFor3d(page)
}

test.describe('3D-Ansicht (Desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop-Bedienung')

  test('Figuren hinzufügen, ziehen, drehen und verbinden', async ({ page }) => {
    await open3d(page)
    await page.getByTestId('lib-mann').click()
    await page.getByTestId('lib-frau').click()
    await expect(page.getByTestId('board-3d')).toHaveAttribute('data-figures', '2')
    await page.keyboard.press('Escape')

    // Ziehen: zweite Figur am Sockel greifen und verschieben
    const before = await figurePositions(page)
    const from = await screenOf(page, before[1]!, 1)
    // nach links unten, damit die Figur nicht unter dem Eigenschaften-Panel landet
    await dragMouse(page, from, { x: from.x - 160, y: from.y + 60 })
    const after = await figurePositions(page)
    const moved = after.findIndex((p, i) => Math.hypot(p.x - before[i]!.x, p.y - before[i]!.y) > 40)
    expect(moved).toBeGreaterThanOrEqual(0)
    const b = after[moved]
    const a = after[1 - moved]

    // Drehen über den Ring: vom vorderen Ringrand nach rechts
    const ringR = (30 * 1.25) + 0.7 * 20 // Brett-Einheiten bei Skalierung 1
    const frontOfRing = await screenOf(page, { x: b!.x, y: b!.y + ringR })
    const rightOfRing = await screenOf(page, { x: b!.x + ringR, y: b!.y })
    await dragMouse(page, frontOfRing, rightOfRing)
    await expect(page.getByTestId('rotation-input')).toHaveValue('270')

    // Verbinden
    await page.getByTestId('tool-connect').click()
    await page.mouse.click(...xy(await screenOf(page, a!, 1)))
    await page.mouse.click(...xy(await screenOf(page, b!, 1)))
    await page.getByTestId('view-2d').click()
    await expect(page.getByTestId('connection')).toHaveCount(1)
    await expect(page.getByTestId('figure')).toHaveCount(2)
  })

  test('Ansicht bleibt nach dem Neuladen erhalten', async ({ page }) => {
    await open3d(page)
    await page.reload()
    await expect(page.getByTestId('board-3d')).toBeVisible()
    await page.getByTestId('view-2d').click()
    await expect(page.getByTestId('board')).toBeVisible()
  })
})

test.describe('3D-Ansicht (Touch)', () => {
  test.skip(({ isMobile }) => !isMobile, 'nur Touch-Geräte')

  test('Figur hinzufügen und antippen', async ({ page }) => {
    await page.goto('/brett')
    await page.getByTestId('view-3d').tap()
    await expect(page.getByTestId('board-3d')).toBeVisible()
    await waitFor3d(page)
    await page.getByTestId('open-library').tap()
    await page.getByTestId('lib-frau').tap()
    await expect(page.getByTestId('board-3d')).toHaveAttribute('data-figures', '1')
    // Auswahl aufheben (freie Fläche antippen) und Figur erneut antippen → Schnellleiste erscheint
    const [f] = await figurePositions(page)
    const close = page.getByLabel('Eigenschaften schliessen')
    if (await close.isVisible()) await close.tap()
    const box = (await page.getByTestId('board-3d').boundingBox())!
    await page.touchscreen.tap(box.x + box.width / 2, box.y + 110)
    await expect(page.getByTestId('quickbar')).toHaveCount(0)
    await page.touchscreen.tap(...xy(await screenOf(page, f!, 1)))
    await expect(page.getByTestId('quickbar')).toBeVisible()
  })
})

/** Wartet, bis die 3D-Szene bereit ist (Test-Schnittstelle gesetzt). */
async function waitFor3d(page: Page) {
  await expect
    .poll(() => page.getByTestId('board-3d').evaluate((el) => !!(el as unknown as { board3d?: unknown }).board3d))
    .toBe(true)
}

function xy(p: P): [number, number] {
  return [p.x, p.y]
}
