import { expect, type Page } from '@playwright/test'

export async function boardBox(page: Page) {
  const b = await page.getByTestId('board').boundingBox()
  if (!b) throw new Error('Brett nicht sichtbar')
  return b
}

/** Fügt eine Figur per Antippen/Klick in der Bibliothek hinzu. */
export async function addFigure(page: Page, type: string) {
  await expect(page.getByTestId('board')).toBeVisible()
  const open = page.getByTestId('open-library')
  if (await open.isVisible().catch(() => false)) await open.click()
  const before = await page.getByTestId('figure').count()
  await page.getByTestId(`lib-${type}`).click()
  await expect(page.getByTestId('figure')).toHaveCount(before + 1)
  return page.getByTestId('figure').last()
}

/** Zieht eine Figur aus der Bibliothek an eine Position (relativ zum Brett). */
export async function dragFigureFromLibrary(page: Page, type: string, x: number, y: number) {
  const item = page.getByTestId(`lib-${type}`)
  await item.scrollIntoViewIfNeeded()
  const it = (await item.boundingBox())!
  const b = await boardBox(page)
  await page.mouse.move(it.x + it.width / 2, it.y + it.height / 2)
  await page.mouse.down()
  await page.mouse.move(it.x + it.width / 2 + 60, it.y + it.height / 2, { steps: 4 })
  await page.mouse.move(b.x + x, b.y + y, { steps: 8 })
  await page.mouse.up()
}

export async function figureCenter(page: Page, index: number) {
  const box = (await page.getByTestId('figure').nth(index).locator('circle').first().boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export async function dragMouse(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 })
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
}

export function transformOf(page: Page, index: number) {
  return page.getByTestId('figure').nth(index).getAttribute('transform')
}
