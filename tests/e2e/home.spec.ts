import { expect, test } from '@playwright/test'

test('Startseite zeigt Hauptaktionen und Datenschutz', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Systembrett')
  await expect(page.getByTestId('new-session')).toBeVisible()
  await expect(page.getByTestId('join-session')).toBeVisible()
  await page.getByTestId('join-session').click()
  await page.locator('#invite').fill('kein link')
  await page.getByTestId('join-form').getByRole('button', { name: 'Beitreten' }).click()
  await expect(page.getByText('vollständigen Einladungslink')).toBeVisible()
  await page.getByRole('link', { name: /Datenschutz/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Datenschutz', level: 1 })).toBeVisible()
  // Schweizer Schreibweise: kein ß in der Oberfläche
  expect(await page.content()).not.toContain('ß')
})
