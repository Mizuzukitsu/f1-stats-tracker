import { expect, test } from '@playwright/test';
import type { ClassificationRevision } from '../app/src/classification';

// Isolated, invented observations exercise interpretation, not historical results.
const classification: ClassificationRevision = {
  schemaVersion: 2,
  revision: 'synthetic-browser-revision-1',
  cutoff: '2026-11-15',
  qualification: 'local-research-unverified',
  source: {
    name: 'F1DB',
    version: 'v2026.20.0',
    url: 'https://github.com/f1db/f1db/releases/download/v2026.20.0/f1db-json-single.tgz',
    sha256: 'a'.repeat(64),
    acquiredAt: '2026-11-15T12:00:00.000Z',
    schemaId: 'https://www.f1db.com/schema/v6.5.0/single/f1db.schema.json',
    licence: {
      identifier: 'CC-BY-4.0',
      url: 'https://raw.githubusercontent.com/f1db/f1db/v2026.20.0/LICENSE',
      sha256: 'b'.repeat(64),
    },
    attribution: 'Synthetic browser fixture; not a historical sporting observation.',
  },
  event: {
    eventId: 'f1db:race:123', seasonId: 'f1db:season:2015', season: 2015,
    round: 1, date: '2015-03-15', name: 'Synthetic Grand Prix',
    grandPrixId: 'f1db:grand-prix:synthetic', venueId: 'f1db:circuit:synthetic',
    venueName: 'Synthetic circuit', sessionId: 'f1db:race:123:grand-prix-race',
    sessionType: 'grand-prix-race', layoutSourceId: 'synthetic-1', layoutQualification: 'unverified',
  },
  timing: {
    qualifyingFormat: 'SPRINT_RACE', qualifyingSessionId: 'f1db:race:123:grand-prix-qualifying',
    validity: 'unverified', sprintRaceRecorded: true, sprintQualifyingRecorded: false,
    qualifying1: [], qualifying2: [],
  },
  definitions: [
    'Laps are source completed-lap counts; GP points are source race points, not season totals.',
    'Classification position text is a source result code, separate from a retirement reason; numeric classification does not prove finished status.',
    'Source-null means unknown, never zero. PL denotes a pit-lane grid start with no numeric position; non-applicable positions are not zero.',
  ],
  limitations: ['Synthetic fixture only. Historical geometry, inclusive overtakes and reuse rights remain unqualified.'],
  drivers: [
    {
      driverId: 'f1db:driver:amber', driverName: 'Amber Example',
      constructorId: 'f1db:constructor:example', constructorName: 'Example Racing', driverNumber: '12',
      classification: { number: 1, text: '1' }, grid: { number: 2, text: '2' }, qualifying: { number: 3, text: '3' },
      laps: 12, points: 0, retirementReason: 'Engine',
      timing: {
        qualifying: { time: null, q1: { text: '1:31.000', milliseconds: 91000 }, q2: null, q3: null },
        raceFastestLap: { position: { number: 2, text: '2' }, lap: 10, time: { text: '1:29.699', milliseconds: 89699 } },
      },
    },
    {
      driverId: 'f1db:driver:birch', driverName: 'Birch Example',
      constructorId: 'f1db:constructor:example', constructorName: 'Example Racing', driverNumber: null,
      classification: { number: 2, text: '2' }, grid: { number: 1, text: '1' }, qualifying: { number: 1, text: '1' },
      laps: 12, points: null, retirementReason: null,
      timing: {
        qualifying: { time: null, q1: { text: '1:30.000', milliseconds: 90000 }, q2: { text: '1:29.000', milliseconds: 89000 }, q3: { text: '1:28.000', milliseconds: 88000 } },
        raceFastestLap: { position: { number: 1, text: '1' }, lap: 11, time: { text: '1:28.617', milliseconds: 88617 } },
      },
    },
    {
      driverId: 'f1db:driver:cedar', driverName: 'Cedar Example',
      constructorId: 'f1db:constructor:other', constructorName: 'Other Racing', driverNumber: '44',
      classification: { number: null, text: 'DNF' }, grid: { number: null, text: 'PL' }, qualifying: { number: 2, text: '2' },
      laps: null, points: null, retirementReason: 'Wheel',
      timing: { qualifying: { time: null, q1: null, q2: null, q3: null }, raceFastestLap: null },
    },
    {
      driverId: 'f1db:driver:dogwood', driverName: 'Dogwood Example',
      constructorId: 'f1db:constructor:other', constructorName: 'Other Racing', driverNumber: '45',
      classification: { number: null, text: 'DNP' }, grid: { number: null, text: null }, qualifying: { number: null, text: null },
      laps: null, points: null, retirementReason: null,
      timing: { qualifying: null, raceFastestLap: null },
    },
  ],
};

const inventory = {
  cutoff: '2026-11-15', qualification: 'provisional-source-inventory-not-release-approved',
  limitations: ['Synthetic metadata for isolated browser transitions only.'],
  events: [{
    eventId: 'jolpica:2015:1', season: 2015, round: 1, grandPrixName: 'Metadata Grand Prix',
    venueSourceId: 'metadata', circuitName: 'Metadata circuit', country: 'Example', date: '2015-03-15',
    sessionType: 'grand-prix-race', state: 'result-recorded', layoutAssignment: 'unverified',
    inclusiveOvertakes: 'unverified', publicReuseApproval: 'unqualified',
  }],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/__local/inventory.json', route => route.fulfill({ json: inventory }));
  await page.route('**/__local/classification.json', route => route.fulfill({ json: classification }));
});

test('classification remains usable without metadata and distinguishes source positions, unknowns and status in both themes', async ({ page }) => {
  await page.route('**/__local/inventory.json', route => route.fulfill({ status: 404, json: { error: 'No isolated inventory.' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Local inventory unavailable' })).toBeVisible();
  const workspace = page.getByRole('region', { name: 'Inspect the imported Grand Prix.' });
  const table = workspace.getByRole('table', { name: /source GP classification/ });
  const amber = table.getByRole('row').filter({ hasText: 'Amber Example' });
  const birch = table.getByRole('row').filter({ hasText: 'Birch Example' });
  const cedar = table.getByRole('row').filter({ hasText: 'Cedar Example' });
  for (const theme of ['Light', 'Dark']) {
    await page.getByRole('button', { name: theme, exact: true }).click();
    await expect(page.getByRole('button', { name: theme, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace.getByRole('heading', { name: 'Synthetic Grand Prix', exact: true })).toBeVisible();
    await expect(amber.locator('[data-label="Actual grid"] strong')).toHaveText('2');
    await expect(amber.locator('[data-label="Qualifying"] strong')).toHaveText('3');
    await expect(amber.locator('[data-label="Classification"] strong')).toHaveText('1');
    await expect(amber.locator('[data-label="Source retirement reason"]')).toHaveText('Engine');
    await expect(amber.locator('[data-label="GP points"]')).toHaveText('0');
    await expect(birch.locator('[data-label="GP points"]')).toHaveText('Unknown');
    await expect(birch.locator('[data-label="Source retirement reason"]')).toHaveText('Unknown / not recorded');
    await expect(cedar.locator('[data-label="Laps"]')).toHaveText('Unknown');
    await expect(cedar.locator('[data-label="Classification"] strong')).toHaveText('DNF');
    await expect(cedar.locator('[data-label="Actual grid"] strong')).toHaveText('PL');
    await expect(cedar.locator('[data-label="Source retirement reason"]')).toHaveText('Wheel');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('a missing classification leaves metadata inspection available and keyboard retry recovers', async ({ page }) => {
  await page.route('**/__local/classification.json', route => route.fulfill({ status: 404, json: { error: 'No prepared GP.' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Local classification unavailable' })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect 2015 Metadata Grand Prix, round 1' }).click();
  await expect(page.getByRole('heading', { name: 'Metadata Grand Prix', exact: true })).toBeFocused();
  await page.getByRole('button', { name: /Close details/ }).click();
  await page.unroute('**/__local/classification.json');
  await page.route('**/__local/classification.json', route => route.fulfill({ json: classification }));
  const retry = page.getByRole('button', { name: 'Retry GP classification', exact: true });
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Synthetic Grand Prix', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload GP classification', exact: true })).toBeFocused();
});

test('a contradictory replacement is withheld rather than partially displayed, and a corrected revision recovers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Synthetic Grand Prix', exact: true })).toBeVisible();
  await page.route('**/__local/classification.json', route => route.fulfill({ json: {
    ...classification,
    drivers: classification.drivers.map((driver, index) => index === 0
      ? { ...driver, grid: { number: 2, text: '3' } }
      : driver),
  } }));
  await page.getByRole('button', { name: 'Reload GP classification', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Local classification unavailable' })).toBeVisible();
  const workspace = page.getByRole('region', { name: 'Inspect the imported Grand Prix.' });
  await expect(workspace.getByRole('table')).toHaveCount(0);
  await expect(workspace.getByText('Amber Example', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Inspect 2015 Metadata Grand Prix, round 1' })).toBeVisible();
  await page.unroute('**/__local/classification.json');
  await page.route('**/__local/classification.json', route => route.fulfill({ json: {
    ...classification, revision: 'synthetic-browser-corrected-revision',
  } }));
  await page.getByRole('button', { name: 'Retry GP classification', exact: true }).click();
  await expect(workspace.getByRole('table', { name: /source GP classification/ }).getByRole('row').filter({ hasText: 'Amber Example' })).toBeVisible();
  await expect(workspace.locator('.classification-identities').getByText('synthetic-browser-corrected-revision', { exact: true })).toBeVisible();
});

test('unknown source grid and qualifying remain unknown alongside a separate DNP result code', async ({ page }) => {
  await page.goto('/');
  const table = page.getByRole('region', { name: 'Inspect the imported Grand Prix.' }).getByRole('table', { name: /source GP classification/ });
  const dogwood = table.getByRole('row').filter({ hasText: 'Dogwood Example' });
  await expect(dogwood.locator('[data-label="Classification"] strong')).toHaveText('DNP');
  await expect(dogwood.locator('[data-label="Actual grid"]')).toHaveText('Unknown (source null)');
  await expect(dogwood.locator('[data-label="Qualifying"]')).toHaveText('Unknown (source null)');
  await expect(dogwood.locator('[data-label="Source retirement reason"]')).toHaveText('Unknown / not recorded');
  const pitLaneGrid = table.getByRole('row').filter({ hasText: 'Cedar Example' }).locator('[data-label="Actual grid"]');
  await expect(pitLaneGrid.locator('strong')).toHaveText('PL');
  await expect(pitLaneGrid).not.toContainText('Unknown');
});

test('GP timing shows all drivers, a non-winner candidate, missing observations and withheld validity independently of the sprint', async ({ page }) => {
  await page.goto('/#classification');
  const qualifying = page.getByRole('table', { name: 'GP qualifying timing evidence' });
  const laps = page.getByRole('table', { name: 'GP race fastest-lap evidence' });
  const amber = qualifying.getByRole('row').filter({ hasText: 'Amber Example' });
  await expect(amber.locator('[data-label="Q1"]')).toContainText('1:31.000');
  await expect(amber.locator('[data-label="Q1"]')).toContainText('91000 ms');
  await expect(amber.locator('[data-label="Q3"]')).toContainText('No recorded time');
  await expect(qualifying.getByRole('row').filter({ hasText: 'Dogwood Example' })).toContainText('No GP qualifying row');
  await expect(laps.getByRole('row').filter({ hasText: 'Birch Example' })).toContainText('1:28.617');
  await expect(laps.getByRole('row').filter({ hasText: 'Cedar Example' })).toContainText('No source fastest-lap row');
  await expect(page.getByText('Source-ranked candidate: Birch Example', { exact: true })).toBeVisible();
  await expect(page.getByText('Fastest-valid baseline withheld', { exact: true })).toBeVisible();
  await expect(page.getByText('Sprint race: recorded separately; not substituted.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a replaced timing with contradictory milliseconds is withheld, not mixed into the current event', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('table', { name: 'GP qualifying timing evidence' })).toBeVisible();
  await page.route('**/__local/classification.json', route => route.fulfill({ json: {
    ...classification,
    drivers: classification.drivers.map((driver, index) => index === 0
      ? { ...driver, timing: { ...driver.timing, qualifying: { ...driver.timing.qualifying, q1: { text: '1:31.000', milliseconds: 90000 } } } }
      : driver),
  } }));
  await page.getByRole('button', { name: 'Reload GP classification', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Local classification unavailable' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /time text and positive milliseconds must agree/ })).toBeVisible();
  await expect(page.getByRole('table', { name: 'GP qualifying timing evidence' })).toHaveCount(0);
});

test('historical combined qualifying time is separate from numbered sessions and inapplicable knockout phases', async ({ page }) => {
  await page.route('**/__local/classification.json', route => route.fulfill({ json: {
    ...classification,
    timing: {
      ...classification.timing, qualifyingFormat: 'AGGREGATE', sprintRaceRecorded: false,
      qualifying1: [{
        driverId: 'f1db:driver:replaced', driverName: 'Replaced Example', constructorId: 'f1db:constructor:example', constructorName: 'Example Racing',
        time: { text: '1:33.171', milliseconds: 93171 },
      }],
      qualifying2: [{
        driverId: 'f1db:driver:amber', driverName: 'Amber Example', constructorId: 'f1db:constructor:example', constructorName: 'Example Racing',
        time: { text: '1:28.289', milliseconds: 88289 },
      }],
    },
    drivers: classification.drivers.map((driver, index) => ({
      ...driver,
      timing: {
        ...driver.timing,
        qualifying: driver.timing.qualifying === null ? null : {
          time: index === 0 ? { text: '3:01.460', milliseconds: 181460 } : null, q1: null, q2: null, q3: null,
        },
      },
    })),
  } }));
  await page.goto('/#classification');
  const table = page.getByRole('table', { name: 'GP qualifying timing evidence' });
  const amber = table.getByRole('row').filter({ hasText: 'Amber Example' });
  await expect(amber.locator('[data-label="Q1"]')).toContainText('Not applicable');
  await expect(amber.locator('[data-label="Source result time"]')).toContainText('3:01.460');
  await expect(page.getByRole('table', { name: 'GP qualifying session 1 timing evidence' }).getByRole('row').filter({ hasText: 'Replaced Example' })).toContainText('1:33.171');
  await expect(page.getByRole('table', { name: 'GP qualifying session 2 timing evidence' }).getByRole('row').filter({ hasText: 'Amber Example' })).toContainText('1:28.289');
  await expect(page.getByRole('table', { name: /source GP classification/ }).getByRole('row').filter({ hasText: 'Replaced Example' })).toHaveCount(0);
});

test('seconds-only source durations reach GP phase and lap inspection without normalization', async ({ page }) => {
  await page.route('**/__local/classification.json', route => route.fulfill({ json: {
    ...classification,
    drivers: classification.drivers.map((driver, index) => index === 1 ? {
      ...driver,
      timing: {
        ...driver.timing,
        qualifying: { ...driver.timing.qualifying, q3: { text: '53.377', milliseconds: 53377 } },
        raceFastestLap: { ...driver.timing.raceFastestLap, time: { text: '55.404', milliseconds: 55404 } },
      },
    } : driver),
  } }));
  await page.goto('/#classification');
  const qualifying = page.getByRole('table', { name: 'GP qualifying timing evidence' }).getByRole('row').filter({ hasText: 'Birch Example' });
  const race = page.getByRole('table', { name: 'GP race fastest-lap evidence' }).getByRole('row').filter({ hasText: 'Birch Example' });
  await expect(qualifying.locator('[data-label="Q3"] strong')).toHaveText('53.377');
  await expect(qualifying.locator('[data-label="Q3"] .classification-subtext')).toContainText('53377 ms');
  await expect(race.locator('[data-label="Recorded lap time"] strong')).toHaveText('55.404');
  await expect(race.locator('[data-label="Recorded lap time"] .classification-subtext')).toContainText('55404 ms');
});

test('tied source candidates retain both drivers and their recorded session lap indices', async ({ page }) => {
  await page.route('**/__local/classification.json', route => route.fulfill({ json: {
    ...classification,
    drivers: classification.drivers.map((driver, index) => index === 0 ? {
      ...driver,
      timing: { ...driver.timing, raceFastestLap: { position: { number: 1, text: '1' }, lap: 13, time: { text: '1:28.617', milliseconds: 88617 } } },
    } : driver),
  } }));
  await page.goto('/#classification');
  await expect(page.getByRole('heading', { name: 'Source-ranked candidates: Amber Example, Birch Example', exact: true })).toBeVisible();
  const amber = page.getByRole('table', { name: 'GP race fastest-lap evidence' }).getByRole('row').filter({ hasText: 'Amber Example' });
  await expect(amber.locator('[data-label="GP lap number"]')).toHaveText('13');
  await expect(amber.locator('[data-label="Coverage / disposition"]')).toContainText('Completed laps: 12');
});

test('a numbered-session replacement cannot rename an existing source constructor identity', async ({ page }) => {
  await page.route('**/__local/classification.json', route => route.fulfill({ json: {
    ...classification,
    timing: {
      ...classification.timing,
      qualifying1: [{
        driverId: 'f1db:driver:replaced', driverName: 'Replaced Example',
        constructorId: 'f1db:constructor:example', constructorName: 'Contradictory Racing',
        time: { text: '1:25.223', milliseconds: 85223 },
      }],
    },
  } }));
  await page.goto('/#classification');
  await expect(page.getByRole('heading', { name: 'Local classification unavailable' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /contradictory name for source identity/ })).toBeVisible();
  await expect(page.getByRole('table', { name: 'GP qualifying session 1 timing evidence' })).toHaveCount(0);
});
