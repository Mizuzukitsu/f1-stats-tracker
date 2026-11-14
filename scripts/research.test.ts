import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { decodeResearchInventory, prepareResearchInventory } from '../app/src/research.ts';

// Synthetic identities are isolated test inputs, never published sporting observations.
function projectedEvent() {
  return {
    eventId: 'jolpica:2026:1',
    season: 2026,
    round: 1,
    grandPrixName: 'Example Grand Prix',
    venueSourceId: 'example',
    circuitName: 'Example Circuit',
    country: 'Example Country',
    date: '2026-11-14',
    sessionType: 'grand-prix-race',
    state: 'result-recorded',
    layoutAssignment: 'unverified',
    inclusiveOvertakes: 'unverified',
    publicReuseApproval: 'unqualified',
  };
}

function projectedInventory() {
  return {
    cutoff: '2026-11-14',
    qualification: 'provisional-source-inventory-not-release-approved',
    limitations: ['Synthetic test input; not verified history or reuse approval.'],
    events: [projectedEvent()],
  };
}

test('decoder rejects a recorded result beyond the saved cutoff with an actionable location', () => {
  const raw = projectedInventory();
  raw.events[0]!.date = '2099-01-01';
  assert.throws(() => decodeResearchInventory(raw), /events\[0\]\.date.*on or before.*2026-11-14/);
});

test('decoder returns only projected metadata, without retaining raw evidence or extra keys', () => {
  const expected = projectedInventory();
  const raw = {
    ...projectedInventory(),
    sourceObservations: { privateEvidence: 'not for browser' },
    events: [{ ...projectedEvent(), sourceRace: { rawEvidence: 'not for browser' }, winnerCompletedLaps: 99 }],
  };
  const decoded = decodeResearchInventory(raw);
  assert.deepEqual(decoded, expected);
  assert.notEqual(decoded, raw);
  assert.notEqual(decoded.events[0], raw.events[0]);
  assert.notEqual(decoded.limitations, raw.limitations);
});

interface ProjectionFixture {
  cutoff: string;
  qualification: string;
  limitations: string[];
  events: Array<Record<string, string | number>>;
}

const malformedProjections: Array<{ name: string; change: (raw: ProjectionFixture) => void; error: RegExp }> = [
  { name: 'invalid cutoff calendar date', change: (raw) => { raw.cutoff = '2026-02-30'; }, error: /cutoff.*real calendar date/ },
  { name: 'unformatted event date', change: (raw) => { raw.events[0]!.date = 'November 14, 2026'; }, error: /events\[0\]\.date.*YYYY-MM-DD/ },
  { name: 'impossible event date', change: (raw) => { raw.events[0]!.date = '2026-02-29'; }, error: /events\[0\]\.date.*real calendar date/ },
  { name: 'future schedule on cutoff', change: (raw) => { raw.events[0]!.state = 'scheduled-future'; }, error: /events\[0\]\.date.*after.*2026-11-14/ },
  { name: 'future schedule before cutoff', change: (raw) => { raw.events[0]!.state = 'scheduled-future'; raw.events[0]!.date = '2026-11-13'; }, error: /events\[0\]\.date.*after/ },
  { name: 'wrong source identity', change: (raw) => { raw.events[0]!.eventId = 'other:2026:1'; }, error: /events\[0\]\.eventId.*jolpica:2026:1/ },
  { name: 'duplicate identity', change: (raw) => { raw.events.push(projectedEvent()); }, error: /events\[1\].*duplicate/ },
  { name: 'invalid season', change: (raw) => { raw.events[0]!.season = 0; }, error: /events\[0\]\.season.*integer/ },
  { name: 'fractional round', change: (raw) => { raw.events[0]!.round = 1.5; }, error: /events\[0\]\.round.*integer/ },
  { name: 'unsafe round', change: (raw) => { raw.events[0]!.round = Number.MAX_SAFE_INTEGER + 1; }, error: /events\[0\]\.round.*integer/ },
  { name: 'unresolved state', change: (raw) => { raw.events[0]!.state = 'unresolved'; }, error: /events\[0\]\.state.*unresolved/ },
  { name: 'sprint session', change: (raw) => { raw.events[0]!.sessionType = 'sprint'; }, error: /events\[0\]\.sessionType.*grand-prix-race/ },
  { name: 'release qualification', change: (raw) => { raw.qualification = 'release-approved'; }, error: /qualification.*provisional/ },
  { name: 'verified layout marker', change: (raw) => { raw.events[0]!.layoutAssignment = 'verified'; }, error: /layoutAssignment.*unverified/ },
  { name: 'invented overtake value', change: (raw) => { Object.assign(raw.events[0]!, { inclusiveOvertakes: 0 }); }, error: /inclusiveOvertakes.*unverified/ },
  { name: 'reuse approval marker', change: (raw) => { raw.events[0]!.publicReuseApproval = 'approved'; }, error: /publicReuseApproval.*unqualified/ },
  { name: 'empty limitations', change: (raw) => { raw.limitations = []; }, error: /limitations.*nonempty array/ },
  { name: 'blank limitation', change: (raw) => { raw.limitations = ['  ']; }, error: /limitations\[0\].*nonempty string/ },
  { name: 'empty event list', change: (raw) => { raw.events = []; }, error: /events.*nonempty array/ },
];

for (const field of ['grandPrixName', 'venueSourceId', 'circuitName', 'country'] as const) {
  malformedProjections.push({
    name: `blank ${field}`,
    change: (raw) => { raw.events[0]![field] = ' \t'; },
    error: new RegExp(`events\\[0\\]\\.${field}.*nonempty string`),
  });
}

for (const { name, change, error } of malformedProjections) {
  test(`decoder rejects ${name}`, () => {
    const raw = projectedInventory();
    change(raw);
    assert.throws(() => decodeResearchInventory(raw), error);
  });
}

for (const raw of [null, [], 'inventory', { ...projectedInventory(), events: [null] }, { ...projectedInventory(), limitations: null }]) {
  test(`decoder rejects malformed structure ${JSON.stringify(raw)}`, () => {
    assert.throws(() => decodeResearchInventory(raw), /Invalid research inventory at/);
  });
}

test('saved-cutoff semantics accept recorded results on cutoff and future schedules strictly after it', () => {
  const raw = projectedInventory();
  raw.events.push({ ...projectedEvent(), eventId: 'jolpica:2026:2', round: 2, date: '2026-11-15', state: 'scheduled-future' });
  assert.deepEqual(decodeResearchInventory(raw), raw);
  const leapDate = projectedInventory();
  leapDate.events[0]!.date = '2024-02-29';
  assert.equal(decodeResearchInventory(leapDate).events[0]!.date, '2024-02-29');
});

function sourceInventory(projection = projectedInventory()) {
  return {
    ...projection,
    events: projection.events.map((event) => {
      const sourceRace = {
        season: String(event.season),
        round: String(event.round),
        raceName: event.grandPrixName,
        date: event.date,
        Circuit: {
          circuitId: event.venueSourceId,
          circuitName: event.circuitName,
          Location: { country: event.country },
        },
      };
      return {
        ...event,
        sourceRace,
        sourceWinnerResult: event.state === 'scheduled-future' ? null : {
          ...sourceRace,
          Circuit: { ...sourceRace.Circuit, Location: { ...sourceRace.Circuit.Location } },
          Results: [{ position: '1' }],
        },
        winnerCompletedLaps: event.state === 'scheduled-future' ? null : 50,
      };
    }),
    summary: [{
      season: 2026,
      calendarRows: projection.events.length,
      resultRecorded: projection.events.filter((event) => event.state === 'result-recorded').length,
      futureScheduled: projection.events.filter((event) => event.state === 'scheduled-future').length,
      pastWithoutResult: 0,
    }],
  };
}

test('preparation and browser decoding agree on the stripped source projection', () => {
  const raw = sourceInventory();
  raw.events[0]!.circuitName = 'Untrusted duplicate metadata';
  raw.events[0]!.country = 'Untrusted duplicate metadata';
  const prepared = prepareResearchInventory(raw);
  const decoded = decodeResearchInventory(JSON.parse(JSON.stringify(prepared)) as unknown);
  assert.deepEqual(prepared, projectedInventory());
  assert.deepEqual(decoded, projectedInventory());
  assert.equal(JSON.stringify(prepared).includes('sourceRace'), false);
  assert.equal(JSON.stringify(prepared).includes('Results'), false);
});

for (const { name, change, error } of malformedProjections) {
  test(`preparation rejects the same projected invariant: ${name}`, () => {
    const projection = projectedInventory();
    change(projection);
    assert.throws(() => prepareResearchInventory(sourceInventory(projection)), error);
  });
}

test('preparation retains source-race and winner identity reconciliation', () => {
  for (const field of ['season', 'round', 'raceName', 'date'] as const) {
    const raw = sourceInventory();
    raw.events[0]!.sourceRace[field] = field === 'date' ? '2026-11-13' : 'mismatch';
    assert.throws(() => prepareResearchInventory(raw), new RegExp(`sourceRace\\.${field}`));
    const winnerRaw = sourceInventory();
    winnerRaw.events[0]!.sourceWinnerResult![field] = field === 'date' ? '2026-11-13' : 'mismatch';
    assert.throws(() => prepareResearchInventory(winnerRaw), new RegExp(`sourceWinnerResult\\.${field}`));
  }
  const venue = sourceInventory();
  venue.events[0]!.sourceRace.Circuit.circuitId = 'mismatch';
  assert.throws(() => prepareResearchInventory(venue), /sourceRace\.Circuit\.circuitId/);
  const winnerVenue = sourceInventory();
  winnerVenue.events[0]!.sourceWinnerResult!.Circuit.circuitId = 'mismatch';
  assert.throws(() => prepareResearchInventory(winnerVenue), /sourceWinnerResult\.Circuit\.circuitId/);
});

test('recorded results still require actual first-place source evidence', () => {
  const missing = sourceInventory();
  missing.events[0]!.sourceWinnerResult = null;
  assert.throws(() => prepareResearchInventory(missing), /sourceWinnerResult.*object/);
  const empty = sourceInventory();
  empty.events[0]!.sourceWinnerResult!.Results = [];
  assert.throws(() => prepareResearchInventory(empty), /Results.*nonempty/);
  const notWinner = sourceInventory();
  notWinner.events[0]!.sourceWinnerResult!.Results[0]!.position = '2';
  assert.throws(() => prepareResearchInventory(notWinner), /Results\[0\]\.position.*"1"/);
});

test('future schedules retain null evidence, never imputed results or laps', () => {
  const projection = projectedInventory();
  projection.events[0]!.date = '2026-11-15';
  projection.events[0]!.state = 'scheduled-future';
  assert.deepEqual(prepareResearchInventory(sourceInventory(projection)), projection);
  const withResult = sourceInventory(projection);
  withResult.events[0]!.sourceWinnerResult = sourceInventory().events[0]!.sourceWinnerResult;
  assert.throws(() => prepareResearchInventory(withResult), /sourceWinnerResult.*null/);
  const withLaps = sourceInventory(projection);
  withLaps.events[0]!.winnerCompletedLaps = 0;
  assert.throws(() => prepareResearchInventory(withLaps), /winnerCompletedLaps.*null/);
});

test('preparation rejects missing, duplicated, unrepresented and contradictory season summaries', () => {
  const missing = sourceInventory();
  missing.summary = [];
  assert.throws(() => prepareResearchInventory(missing), /summary.*missing source counts/);
  const duplicate = sourceInventory();
  duplicate.summary.push({ ...duplicate.summary[0]! });
  assert.throws(() => prepareResearchInventory(duplicate), /duplicate summary season/);
  const unrepresented = sourceInventory();
  unrepresented.summary[0]!.season = 2025;
  assert.throws(() => prepareResearchInventory(unrepresented), /season 2025 has no source events/);
  for (const field of ['calendarRows', 'resultRecorded', 'futureScheduled', 'pastWithoutResult'] as const) {
    const raw = sourceInventory();
    raw.summary[0]![field] = 99;
    assert.throws(() => prepareResearchInventory(raw), new RegExp(`summary\\[0\\]\\.${field}`));
  }
});

test('preparation sorts events by season and round without mismatching source reconciliation', () => {
  const projection = projectedInventory();
  projection.events.unshift({ ...projectedEvent(), eventId: 'jolpica:2026:2', round: 2 });
  const prepared = prepareResearchInventory(sourceInventory(projection));
  assert.deepEqual(prepared.events.map((event) => event.eventId), ['jolpica:2026:1', 'jolpica:2026:2']);
});

test('CLI preserves previous output after failed preparation and recovers through the decoder seam', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'f1-research-regression-'));
  try {
    await mkdir(join(directory, 'scripts'), { recursive: true });
    await mkdir(join(directory, 'app', 'src'), { recursive: true });
    // Run the real command in an isolated project, never write to a developer's local inventory.
    await copyFile(new URL('./prepare-local.ts', import.meta.url), join(directory, 'scripts', 'prepare-local.ts'));
    await copyFile(new URL('../app/src/research.ts', import.meta.url), join(directory, 'app', 'src', 'research.ts'));
    await writeFile(join(directory, 'package.json'), '{"type":"module"}\n');
    const input = join(directory, 'source.json');
    const destination = join(directory, '.local-data', 'inventory.json');
    const run = () => spawnSync(process.execPath, [
      '--import', import.meta.resolve('tsx'), join(directory, 'scripts', 'prepare-local.ts'), input,
    ], { cwd: directory, encoding: 'utf8', timeout: 10_000 });

    await writeFile(input, JSON.stringify(sourceInventory()));
    const first = run();
    assert.equal(first.status, 0, first.stderr || String(first.error));
    assert.match(first.stdout, /1 source events across 1 seasons/);
    const previous = await readFile(destination, 'utf8');
    assert.deepEqual(decodeResearchInventory(JSON.parse(previous) as unknown), projectedInventory());

    const contradiction = sourceInventory();
    contradiction.events[0]!.date = '2099-01-01';
    const badSource = sourceInventory();
    badSource.events[0]!.sourceRace.raceName = 'Conflicting source';
    const badSummary = sourceInventory();
    badSummary.summary[0]!.resultRecorded = 0;
    for (const [content, error] of [
      ['{', /not valid JSON/],
      [JSON.stringify(contradiction), /events\[0\]\.date.*cutoff/],
      [JSON.stringify(badSource), /sourceRace\.raceName/],
      [JSON.stringify(badSummary), /summary\[0\]\.resultRecorded/],
    ] as const) {
      await writeFile(input, content);
      const failed = run();
      assert.equal(failed.status, 1, failed.stderr || String(failed.error));
      assert.match(failed.stderr, error);
      assert.equal(await readFile(destination, 'utf8'), previous);
      assert.deepEqual(await readdir(join(directory, '.local-data')), ['inventory.json']);
    }

    const recovered = sourceInventory();
    recovered.limitations = ['Recovered synthetic research input; still not release approved.'];
    await writeFile(input, JSON.stringify(recovered));
    const recovery = run();
    assert.equal(recovery.status, 0, recovery.stderr || String(recovery.error));
    const latest = await readFile(destination, 'utf8');
    assert.notEqual(latest, previous);
    assert.deepEqual(decodeResearchInventory(JSON.parse(latest) as unknown), {
      ...projectedInventory(), limitations: ['Recovered synthetic research input; still not release approved.'],
    });
    assert.deepEqual(await readdir(join(directory, '.local-data')), ['inventory.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
