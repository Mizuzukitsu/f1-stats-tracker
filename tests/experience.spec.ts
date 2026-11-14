import { expect, test } from '@playwright/test';

// Isolated metadata exercises browser behavior, never sporting observations.
const event = (season: number, round: number, name: string) => ({
  eventId: `jolpica:${season}:${round}`, season, round, grandPrixName: `${name} Grand Prix`,
  venueSourceId: name.toLowerCase(), circuitName: `${name} circuit`, country: name,
  date: `${season}-03-15`, sessionType: 'grand-prix-race', state: 'result-recorded',
  layoutAssignment: 'unverified', inclusiveOvertakes: 'unverified', publicReuseApproval: 'unqualified',
});
const inventory = {
  cutoff: '2026-11-14', qualification: 'provisional-source-inventory-not-release-approved',
  limitations: ['Synthetic metadata for isolated browser transitions only.'],
  events: [event(2026, 1, 'Australia'), event(2026, 2, 'Monaco'), event(2015, 1, 'Monaco')],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/__local/inventory.json', route => route.fulfill({ json: inventory }));
  await page.goto('/');
});

test('inspection follows the filtered population and reset clears context', async ({ page }) => {
  const inspect = page.getByRole('button', { name: 'Inspect 2026 Australia Grand Prix, round 1' });
  await inspect.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Australia Grand Prix', exact: true })).toBeFocused();
  await page.getByRole('searchbox').fill('Australia');
  await expect(page.getByRole('region', { name: 'Australia Grand Prix' })).toBeVisible();
  await page.getByLabel('Season', { exact: true }).selectOption('2015');
  await expect(page.getByRole('region', { name: 'Australia Grand Prix' })).toHaveCount(0);
  await page.getByRole('searchbox').fill('Monaco');
  await page.getByRole('button', { name: 'Inspect 2015 Monaco Grand Prix, round 1' }).click();
  await expect(page.getByRole('heading', { name: 'Monaco Grand Prix', exact: true })).toBeFocused();
  await page.getByRole('button', { name: /Reset filters/ }).click();
  await expect(page.getByRole('region', { name: 'Monaco Grand Prix' })).toHaveCount(0);
  await expect(page.getByLabel('Season', { exact: true })).toHaveValue('2026');
  await inspect.click();
  await page.getByRole('button', { name: /Close details/ }).click();
  await expect(inspect).toBeFocused();
  await inspect.click();
  await page.getByRole('searchbox').fill('no-match');
  await expect(page.getByRole('region', { name: 'Australia Grand Prix' })).toHaveCount(0);
  await page.getByRole('button', { name: /Reset filters/ }).last().click();
  await expect(page.getByRole('heading', { name: 'Which source records are saved?' })).toBeFocused();
});

test('removing the active inspect control recovers keyboard focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Inspect 2026 Australia Grand Prix, round 1' }).click();
  // Programmatic filter change while focus stays in the soon-to-disappear detail.
  await page.getByLabel('Season', { exact: true }).evaluate((select: HTMLSelectElement) => {
    select.value = '2015';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByRole('region', { name: 'Australia Grand Prix' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Which source records are saved?' })).toBeFocused();
});

test('a contradictory replacement projection is rejected and retry recovers', async ({ page }) => {
  await page.route('**/__local/inventory.json', route => route.fulfill({ json: {
    ...inventory, events: [{ ...inventory.events[0], date: '2099-01-01' }],
  } }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Local inventory unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Inspect / })).toHaveCount(0);
  await page.unroute('**/__local/inventory.json');
  await page.route('**/__local/inventory.json', route => route.fulfill({ json: inventory }));
  await page.getByRole('button', { name: /Retry local inventory/ }).click();
  await expect(page.getByRole('button', { name: 'Inspect 2026 Australia Grand Prix, round 1' })).toBeVisible();
});
