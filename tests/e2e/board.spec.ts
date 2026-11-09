import { expect, test } from '@playwright/test'
import { addFigure, boardBox, dragFigureFromLibrary, dragMouse, figureCenter, transformOf } from './helpers'

test.describe('Lokales Systembrett (Desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop-Bedienung')

  test.beforeEach(async ({ page }) => {
    await page.goto('/brett')
    await expect(page.getByTestId('board')).toBeVisible()
  })

  test('Figuren per Drag-and-drop hinzufügen', async ({ page }) => {
    await dragFigureFromLibrary(page, 'frau', 500, 250)
    await dragFigureFromLibrary(page, 'mann', 700, 250)
    await expect(page.getByTestId('figure')).toHaveCount(2)
    await expect(page.getByTestId('figure').first()).toHaveAttribute('data-type', 'frau')
  })

  test('Figur verschieben, drehen, beschriften und löschen', async ({ page }) => {
    await addFigure(page, 'mann')
    const before = await transformOf(page, 0)
    const c = await figureCenter(page, 0)
    await dragMouse(page, c, { x: c.x + 120, y: c.y + 60 })
    expect(await transformOf(page, 0)).not.toBe(before)

    // Drehen über den Griff
    const handle = (await page.getByTestId('rotate-handle').locator('circle').nth(1).boundingBox())!
    const c2 = await figureCenter(page, 0)
    await dragMouse(page, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, { x: c2.x + 150, y: c2.y })
    await expect(page.getByTestId('rotation-input')).toHaveValue('90')

    await page.getByTestId('label-input').fill('Vater')
    await page.getByTestId('label-input').press('Enter')
    await expect(page.getByTestId('figure').first()).toHaveAttribute('data-label', 'Vater')

    await page.getByTestId('delete-selection').click()
    await expect(page.getByTestId('figure')).toHaveCount(0)
  })

  test('Verbindungen erstellen und bearbeiten', async ({ page }) => {
    const b = await boardBox(page)
    await dragFigureFromLibrary(page, 'frau', 450, 300)
    await dragFigureFromLibrary(page, 'mann', 750, 300)
    await page.getByTestId('tool-connect').click()
    await page.getByTestId('connect-type').selectOption('konflikt')
    await page.mouse.click(b.x + 450, b.y + 300)
    await page.mouse.click(b.x + 750, b.y + 300)
    const conn = page.getByTestId('connection')
    await expect(conn).toHaveCount(1)
    await expect(conn).toHaveAttribute('data-type', 'konflikt')

    // Bearbeiten: Typ ändern
    await page.keyboard.press('Escape')
    await page.mouse.click(b.x + 600, b.y + 300)
    await page.getByTestId('connection-type').selectOption('eng')
    await expect(conn).toHaveAttribute('data-type', 'eng')

    // Linie bleibt verankert, wenn die Figur bewegt wird
    const lineBefore = await conn.locator('line').first().getAttribute('x2')
    await dragMouse(page, { x: b.x + 750, y: b.y + 300 }, { x: b.x + 750, y: b.y + 450 })
    expect(await conn.locator('line').first().getAttribute('y2')).not.toBe(lineBefore)
  })

  test('Rückgängig und Wiederherstellen', async ({ page }) => {
    await addFigure(page, 'frau')
    await addFigure(page, 'kind-junge')
    await expect(page.getByTestId('figure')).toHaveCount(2)
    await page.getByTestId('undo').click()
    await expect(page.getByTestId('figure')).toHaveCount(1)
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('figure')).toHaveCount(0)
    await page.getByTestId('redo').click()
    await expect(page.getByTestId('figure')).toHaveCount(1)
    await page.keyboard.press('Control+Shift+z')
    await expect(page.getByTestId('figure')).toHaveCount(2)
  })

  test('Zoom und Mehrfachauswahl', async ({ page }) => {
    await expect(page.getByTestId('zoom-level')).toHaveText('100%')
    await page.getByTestId('zoom-in').click()
    await expect(page.getByTestId('zoom-level')).toHaveText('125%')
    await page.getByTestId('zoom-out').click()
    await expect(page.getByTestId('zoom-level')).toHaveText('100%')

    await addFigure(page, 'frau')
    await addFigure(page, 'mann')
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+d')
    await expect(page.getByTestId('figure')).toHaveCount(4)
    await page.keyboard.press('Delete')
    await expect(page.getByTestId('figure')).toHaveCount(2)
  })

  test('Gesperrte Figur lässt sich nicht verschieben', async ({ page }) => {
    await addFigure(page, 'mann')
    await page.getByRole('button', { name: 'Sperren' }).click()
    const before = await transformOf(page, 0)
    const c = await figureCenter(page, 0)
    await dragMouse(page, c, { x: c.x + 100, y: c.y + 100 })
    expect(await transformOf(page, 0)).toBe(before)
  })
})

test.describe('Touch-Bedienung', () => {
  test.skip(({ isMobile }) => !isMobile, 'nur Touch-Geräte')

  test('Figur antippen, Aktionen nutzen und Zwei-Finger-Zoom', async ({ page }) => {
    await page.goto('/brett')
    await addFigure(page, 'frau')
    await expect(page.getByTestId('figure')).toHaveCount(1)

    const zoomBefore = await page.getByTestId('zoom-level').textContent()
    // Zwei-Finger-Zoom über CDP-Touch-Events simulieren
    const b = await boardBox(page)
    const cx = b.x + b.width / 2
    const cy = b.y + b.height * 0.7
    const client = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', d: number) =>
      client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [
          { x: cx - d, y: cy, id: 1 },
          { x: cx + d, y: cy, id: 2 },
        ],
      })
    await touch('touchStart', 40)
    for (let d = 50; d <= 120; d += 10) await touch('touchMove', d)
    await touch('touchEnd', 0)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('figure')).toHaveCount(1)
    await expect(page.getByTestId('zoom-level')).not.toHaveText(zoomBefore!)
  })
})
