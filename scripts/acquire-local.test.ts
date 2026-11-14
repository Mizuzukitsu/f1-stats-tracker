import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Synthetic source evidence stays in isolated temporary projects, never production assets.
const race = {
  season: '2015', round: '1', raceName: 'Example GP', date: '2015-03-15',
  Circuit: { circuitId: 'example', circuitName: 'Example Circuit', Location: { country: 'Example' } },
};
const future = { ...race, round: '2', raceName: 'Second GP', date: '2015-03-29' };
const winner = { ...race, Results: [{ position: '1', laps: '58' }] };

async function project() {
  const directory = await mkdtemp(join(tmpdir(), 'f1-acquisition-'));
  await mkdir(join(directory, 'scripts'));
  await mkdir(join(directory, 'app', 'src'), { recursive: true });
  for (const name of ['acquire-local.ts', 'prepare-local.ts']) {
    await copyFile(new URL(`./${name}`, import.meta.url), join(directory, 'scripts', name));
  }
  await copyFile(new URL('../app/src/research.ts', import.meta.url), join(directory, 'app', 'src', 'research.ts'));
  await writeFile(join(directory, 'package.json'), '{"type":"module"}\n');
  return directory;
}

function acquire(directory: string, scenario = 'valid') {
  // Replace only the external HTTP and elapsed-time seams, in the real CLI process.
  const hook = `
    import timers from 'node:timers/promises';
    const race = ${JSON.stringify(race)}, future = ${JSON.stringify(future)}, winner = ${JSON.stringify(winner)};
    const scenario = ${JSON.stringify(scenario)};
    timers.setTimeout = async () => {};
    globalThis.fetch = async (input) => {
      const url = new URL(input), offset = Number(url.searchParams.get('offset'));
      const results = url.pathname.includes('/results/1');
      let rows = results ? [winner] : [offset === 0 ? race : future];
      let total = results ? 1 : 2;
      let responseOffset = offset;
      if (scenario === 'http' && offset === 1) return new Response('unavailable', { status: 429 });
      if (scenario === 'empty' && offset === 1) rows = [];
      if (scenario === 'duplicate' && !results && offset === 1) rows = [race];
      if (scenario === 'changed-total' && offset === 1) total = 3;
      if (scenario === 'wrong-offset' && offset === 1) responseOffset = 0;
      if (scenario === 'missing-result' && results) { rows = []; total = 0; }
      if (scenario === 'orphan-result' && results) rows = [{ ...winner, round: '3' }];
      if (scenario === 'conflict' && results) rows = [{ ...winner, raceName: 'Contradictory GP' }];
      if (scenario === 'future-result' && results) {
        total = 2; rows = [offset === 0 ? winner : { ...future, Results: winner.Results }];
      }
      if (scenario === 'correction') rows = rows.map(row => row.round === '1' ? { ...row, raceName: 'Corrected GP' } : row);
      return new Response(JSON.stringify({ MRData: { limit: '1', offset: String(responseOffset), total: String(total),
        RaceTable: { season: '2015', Races: rows } } }), { status: 200 });
    };
  `;
  return spawnSync(process.execPath, [
    '--import', import.meta.resolve('tsx'), '--import', `data:text/javascript,${encodeURIComponent(hook)}`,
    join(directory, 'scripts', 'acquire-local.ts'), '2015-03-15',
  ], { cwd: directory, encoding: 'utf8', timeout: 10_000 });
}

function prepare(directory: string, source: string) {
  return spawnSync(process.execPath, [
    '--import', import.meta.resolve('tsx'), join(directory, 'scripts', 'prepare-local.ts'), source,
  ], { cwd: directory, encoding: 'utf8', timeout: 10_000 });
}

test('paginated acquisition feeds real preparation without promoting source observations to verified facts', async () => {
  const directory = await project();
  try {
    const run = acquire(directory);
    assert.equal(run.status, 0, run.stderr || String(run.error));
    const files = await readdir(join(directory, '.local-data'));
    assert.equal(files.length, 1);
    const sourcePath = join(directory, '.local-data', files[0]!);
    const source = JSON.parse(await readFile(sourcePath, 'utf8'));
    assert.deepEqual(source.summary, [{ season: 2015, calendarRows: 2, resultRecorded: 1, pastWithoutResult: 0, futureScheduled: 1 }]);
    assert.deepEqual(source.events.map((event: { state: string; winnerCompletedLaps: number | null }) => [event.state, event.winnerCompletedLaps]), [
      ['result-recorded', 58], ['scheduled-future', null],
    ]);
    assert.equal(source.acquisition.pages.length, 3);
    for (const page of source.acquisition.pages) {
      assert.equal(createHash('sha256').update(page.body).digest('hex'), page.sha256);
    }
    const prepared = prepare(directory, sourcePath);
    assert.equal(prepared.status, 0, prepared.stderr);
    const projection = JSON.parse(await readFile(join(directory, '.local-data', 'inventory.json'), 'utf8'));
    assert.equal(projection.qualification, 'provisional-source-inventory-not-release-approved');
    assert.deepEqual(projection.events.map((event: { eventId: string; inclusiveOvertakes: string; publicReuseApproval: string }) =>
      [event.eventId, event.inclusiveOvertakes, event.publicReuseApproval]), [
      ['jolpica:2015:1', 'unverified', 'unqualified'], ['jolpica:2015:2', 'unverified', 'unqualified'],
    ]);
    assert.equal(projection.acquisition, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const [scenario, message] of [
  ['http', /HTTP 429/],
  ['empty', /empty page/],
  ['duplicate', /duplicate season\/round/],
  ['changed-total', /total changed/],
  ['wrong-offset', /wrong page offset/],
  ['missing-result', /past calendar event without result/],
  ['orphan-result', /result absent from calendar/],
  ['conflict', /sourceWinnerResult\.raceName/],
  ['future-result', /result beyond cutoff/],
] as const) {
  test(`failed ${scenario} acquisition preserves prior source and prepared inventories`, async () => {
    const directory = await project();
    try {
      const first = acquire(directory);
      assert.equal(first.status, 0, first.stderr);
      const [filename] = await readdir(join(directory, '.local-data'));
      const sourcePath = join(directory, '.local-data', filename!);
      const original = await readFile(sourcePath, 'utf8');
      assert.equal(prepare(directory, sourcePath).status, 0);
      const preparedPath = join(directory, '.local-data', 'inventory.json');
      const prepared = await readFile(preparedPath, 'utf8');
      const failed = acquire(directory, scenario);
      assert.equal(failed.status, 1, failed.stderr || String(failed.error));
      assert.match(failed.stderr, message);
      assert.equal(await readFile(sourcePath, 'utf8'), original);
      assert.equal(await readFile(preparedPath, 'utf8'), prepared);
      assert.deepEqual((await readdir(join(directory, '.local-data'))).sort(), [filename!, 'inventory.json'].sort());
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('a fresh acquisition retains the previous candidate as correction evidence', async () => {
  const directory = await project();
  try {
    assert.equal(acquire(directory).status, 0);
    const [first] = await readdir(join(directory, '.local-data'));
    const original = await readFile(join(directory, '.local-data', first!), 'utf8');
    const correction = acquire(directory, 'correction');
    assert.equal(correction.status, 0, correction.stderr);
    assert.equal(await readFile(join(directory, '.local-data', first!), 'utf8'), original);
    const latest = (await readdir(join(directory, '.local-data'))).find(name => name !== first)!;
    const prepared = prepare(directory, join(directory, '.local-data', latest));
    assert.equal(prepared.status, 0, prepared.stderr);
    const projection = JSON.parse(await readFile(join(directory, '.local-data', 'inventory.json'), 'utf8'));
    assert.equal(projection.events[0].grandPrixName, 'Corrected GP');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
