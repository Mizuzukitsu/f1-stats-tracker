import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Synthetic observations are confined to temporary projects and never public assets.
const race = {
  id: 917, year: 2015, round: 1, date: '2015-03-15', officialName: 'Example GP',
  grandPrixId: 'example', circuitId: 'example', circuitLayoutId: 'example-1', laps: 58,
  raceResults: [
    { positionDisplayOrder: 1, positionNumber: 1, positionText: '1', driverId: 'first', constructorId: 'team', driverNumber: '44',
      gridPositionNumber: 2, gridPositionText: '2', qualificationPositionNumber: 1, qualificationPositionText: '1', laps: 58, points: 25, reasonRetired: null },
    { positionDisplayOrder: 2, positionNumber: null, positionText: 'DNF', driverId: 'second', constructorId: 'team', driverNumber: '6',
      gridPositionNumber: 1, gridPositionText: '1', qualificationPositionNumber: 2, qualificationPositionText: '2', laps: 0, points: null, reasonRetired: 'Engine' },
  ],
  startingGridPositions: [
    { positionDisplayOrder: 1, positionNumber: 1, positionText: '1', driverId: 'second', constructorId: 'team', qualificationPositionNumber: 2, qualificationPositionText: '2' },
    { positionDisplayOrder: 2, positionNumber: 2, positionText: '2', driverId: 'first', constructorId: 'team', qualificationPositionNumber: 1, qualificationPositionText: '1' },
  ],
  qualifyingResults: [
    { positionDisplayOrder: 1, positionNumber: 1, positionText: '1', driverId: 'first', constructorId: 'team' },
    { positionDisplayOrder: 2, positionNumber: 2, positionText: '2', driverId: 'second', constructorId: 'team' },
  ],
};

async function project() {
  const directory = await mkdtemp(join(tmpdir(), 'f1db-import-'));
  await mkdir(join(directory, 'scripts'));
  await mkdir(join(directory, 'app', 'src'), { recursive: true });
  await writeFile(join(directory, 'package.json'), '{"type":"module"}\n');
  // Exercise the real executable and shared decoder, not internal importer helpers.
  for (const [source, target] of [
    ['scripts/import-f1db.ts', 'scripts/import-f1db.ts'],
    ['app/src/classification.ts', 'app/src/classification.ts'],
  ]) {
    await copyFile(new URL(`../${source}`, import.meta.url), join(directory, target!));
  }
  return directory;
}

interface ImportOptions {
  mutate?: (data: Record<string, unknown>) => void;
  packageVersion?: string;
  schemaId?: string;
  dataBytes?: Uint8Array;
  archiveBytes?: Uint8Array;
  duplicateMember?: boolean;
  status?: number;
  licenceBytes?: Uint8Array;
}

async function importEvent(directory: string, selectedRace: typeof race = race, options: ImportOptions = {}) {
  const source = join(directory, 'source');
  await mkdir(join(source, 'package', 'data'), { recursive: true });
  await writeFile(join(source, 'package', 'package.json'), JSON.stringify({ version: options.packageVersion ?? '2026.20.0' }));
  await writeFile(join(source, 'package', 'data', 'f1db.schema.json'), JSON.stringify({ $id: options.schemaId ?? 'https://www.f1db.com/schema/v6.5.0/single/f1db.schema.json' }));
  const data: Record<string, unknown> = {
    drivers: [{ id: 'first', name: 'First Driver' }, { id: 'second', name: 'Second Driver' }],
    constructors: [{ id: 'team', name: 'Example Team' }],
    circuits: [{ id: 'example', name: 'Example Circuit', layouts: [{ id: 'example-1' }] }],
    grandsPrix: [{ id: 'example', name: 'Example' }], seasons: [{ year: 2015 }], races: [selectedRace],
  };
  options.mutate?.(data);
  await writeFile(join(source, 'package', 'data', 'f1db.json'), options.dataBytes ?? JSON.stringify(data));
  const archive = spawnSync('tar', ['-czf', '-', '-C', source, 'package', ...(options.duplicateMember ? ['package/data/f1db.json'] : [])]);
  assert.equal(archive.status, 0, archive.stderr.toString());
  const archiveBytes = Buffer.from(options.archiveBytes ?? archive.stdout);
  const licenceBytes = Buffer.from(options.licenceBytes ?? Buffer.from('F1DB is licensed under Creative Commons Attribution 4.0 International (CC BY 4.0). https://creativecommons.org/licenses/by/4.0/'));
  const hook = `globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('.tgz')) return new Response(Buffer.from('${archiveBytes.toString('base64')}', 'base64'), { status: ${options.status ?? 200} });
    return new Response(Buffer.from('${licenceBytes.toString('base64')}', 'base64'));
  };`;
  const result = spawnSync(process.execPath, [
    '--import', import.meta.resolve('tsx'), '--import', `data:text/javascript,${encodeURIComponent(hook)}`,
    join(directory, 'scripts', 'import-f1db.ts'), '2015', '1',
  ], { cwd: directory, encoding: 'utf8', timeout: 20_000 });
  return { ...result, archiveBytes, licenceBytes };
}

async function removeProject(directory: string): Promise<void> {
  // Retained candidates are deliberately sealed read-only; only test teardown unseals them.
  await chmod(directory, 0o700);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) await removeProject(join(directory, entry.name));
  }
  await rm(directory, { recursive: true, force: true });
}

test('pinned import prepares full classification while preserving grid, retirement and unknown distinctions', async () => {
  const directory = await project();
  try {
    const run = await importEvent(directory);
    assert.equal(run.status, 0, run.stderr || String(run.error));
    const revision = JSON.parse(await readFile(join(directory, '.local-data', 'classification.json'), 'utf8'));
    assert.equal(revision.qualification, 'local-research-unverified');
    assert.equal(revision.event.sessionType, 'grand-prix-race');
    assert.deepEqual(revision.drivers.map((driver: Record<string, unknown>) => [
      driver.driverId, driver.classification, driver.grid, driver.qualifying, driver.laps, driver.points, driver.retirementReason,
    ]), [
      ['f1db:driver:first', { number: 1, text: '1' }, { number: 2, text: '2' }, { number: 1, text: '1' }, 58, 25, null],
      ['f1db:driver:second', { number: null, text: 'DNF' }, { number: 1, text: '1' }, { number: 2, text: '2' }, 0, null, 'Engine'],
    ]);
  } finally {
    await removeProject(directory);
  }
});

test('sprint-derived grid qualification does not replace the separate GP qualifying position', async () => {
  const directory = await project();
  try {
    const sprintRace = {
        ...race,
        qualifyingFormat: 'SPRINT_RACE',
        raceResults: race.raceResults.map((result) => ({
          ...result, qualificationPositionNumber: result.gridPositionNumber, qualificationPositionText: result.gridPositionText,
        })),
        startingGridPositions: race.startingGridPositions.map((result) => ({
          ...result, qualificationPositionNumber: result.positionNumber, qualificationPositionText: result.positionText,
        })),
        sprintRaceResults: [
          { ...race.startingGridPositions[0]!, qualificationPositionNumber: 2, qualificationPositionText: '2' },
          { ...race.startingGridPositions[1]!, qualificationPositionNumber: 1, qualificationPositionText: '1' },
        ],
    };
    const run = await importEvent(directory, race, { mutate(data) { data.races = [sprintRace]; } });
    assert.equal(run.status, 0, run.stderr || String(run.error));
    const revision = JSON.parse(await readFile(join(directory, '.local-data', 'classification.json'), 'utf8'));
    assert.deepEqual(revision.drivers.map((driver: { grid: { number: number }; qualifying: { number: number } }) =>
      [driver.grid.number, driver.qualifying.number]), [[2, 1], [1, 2]]);
    const previous = await readFile(join(directory, '.local-data', 'classification.json'));
    sprintRace.sprintRaceResults[0]!.qualificationPositionNumber = 1;
    sprintRace.sprintRaceResults[0]!.qualificationPositionText = '1';
    const conflict = await importEvent(directory, race, { mutate(data) { data.races = [sprintRace]; } });
    assert.equal(conflict.status, 1, conflict.stdout);
    assert.match(conflict.stderr, /GP qualifying: contradictory/);
    assert.deepEqual(await readFile(join(directory, '.local-data', 'classification.json')), previous);
  } finally { await removeProject(directory); }
});

test('pinned import retains exact private immutable evidence and leaves metadata and older candidates untouched', async () => {
  const directory = await project();
  try {
    await mkdir(join(directory, '.local-data'));
    const inventory = '{"unrelated":"metadata must remain byte-for-byte unchanged"}\n';
    await writeFile(join(directory, '.local-data', 'inventory.json'), inventory);
    const first = await importEvent(directory, race, { mutate(data) { data.rawPrivateSentinel = 'not a browser field'; } });
    assert.equal(first.status, 0, first.stderr || String(first.error));
    const candidates = join(directory, '.local-data', 'f1db');
    const ids = await readdir(candidates);
    assert.equal(ids.length, 1);
    const candidate = join(candidates, ids[0]!);
    const manifest = JSON.parse(await readFile(join(candidate, 'manifest.json'), 'utf8'));
    assert.equal(manifest.version, 'v2026.20.0');
    assert.equal(manifest.validation, 'accepted-local-research-unverified');
    assert.equal(manifest.selectedEvent.eventId, 'f1db:race:917');
    assert.deepEqual(manifest.counts, { raceResults: 2, startingGridPositions: 2, qualifyingResults: 2 });
    const saved = new Map<string, Buffer>();
    for (const item of manifest.evidence as { file: string; sha256: string; bytes: number; retrievedAt: string; url: string }[]) {
      const bytes = await readFile(join(candidate, item.file));
      saved.set(item.file, bytes);
      assert.equal(item.sha256, createHash('sha256').update(bytes).digest('hex'));
      assert.equal(item.bytes, bytes.byteLength);
      assert.ok(Number.isFinite(Date.parse(item.retrievedAt)));
      assert.ok(item.url.startsWith('https://'));
      assert.equal((await stat(join(candidate, item.file))).mode & 0o777, 0o400);
    }
    assert.deepEqual(saved.get('f1db-json-single.tgz'), first.archiveBytes);
    assert.deepEqual(saved.get('LICENSE'), first.licenceBytes);
    for (const required of ['README.md', 'package.json', 'f1db.schema.json', 'f1db.json', 'selected-event.json', 'reconciliation.json', 'prepared.json']) {
      assert.ok(saved.has(required), `missing evidence ${required}`);
    }
    assert.equal((await stat(candidate)).mode & 0o777, 0o500);
    assert.equal((await stat(join(candidate, 'manifest.json'))).mode & 0o777, 0o400);
    assert.equal((await stat(join(directory, '.local-data', 'classification.json'))).mode & 0o777, 0o600);
    const projection = JSON.parse(await readFile(join(directory, '.local-data', 'classification.json'), 'utf8'));
    assert.deepEqual(Object.keys(projection).sort(), ['cutoff', 'definitions', 'drivers', 'event', 'limitations', 'qualification', 'revision', 'schemaVersion', 'source']);
    assert.equal(projection.rawPrivateSentinel, undefined);
    assert.equal(projection.raceResults, undefined);
    const second = await importEvent(directory);
    assert.equal(second.status, 0, second.stderr || String(second.error));
    assert.equal((await readdir(candidates)).length, 2);
    for (const [file, bytes] of saved) assert.deepEqual(await readFile(join(candidate, file)), bytes);
    assert.equal(await readFile(join(directory, '.local-data', 'inventory.json'), 'utf8'), inventory);
  } finally { await removeProject(directory); }
});

test('full results preserve DNS and DNP omitted-session unknowns, pit-lane starts, actual zero and numeric retirement', async () => {
  const directory = await project();
  try {
    const result = await importEvent(directory, race, {
      mutate(data) {
        data.drivers = [
          { id: 'first', name: 'First Driver' }, { id: 'second', name: 'Second Driver' },
          { id: 'dns', name: 'DNS Driver' }, { id: 'dnp', name: 'DNP Driver' },
        ];
        data.races = [{
          ...race,
          raceResults: [
            { ...race.raceResults[0]!, reasonRetired: 'Source retirement reason despite numeric classification' },
            { ...race.raceResults[1]!, points: 0, gridPositionNumber: null, gridPositionText: 'PL' },
            { ...race.raceResults[1]!, driverId: 'dns', driverNumber: '77', positionDisplayOrder: 3, positionText: 'DNS',
              gridPositionNumber: null, gridPositionText: null, qualificationPositionNumber: 3, qualificationPositionText: '3', laps: null, reasonRetired: null },
            { ...race.raceResults[1]!, driverId: 'dnp', driverNumber: '98', positionDisplayOrder: 4, positionText: 'DNP',
              gridPositionNumber: null, gridPositionText: null, qualificationPositionNumber: null, qualificationPositionText: null, laps: null, reasonRetired: null },
          ].reverse(),
          startingGridPositions: [
            { ...race.startingGridPositions[0]!, positionNumber: null, positionText: 'PL' },
            race.startingGridPositions[1]!,
          ],
          qualifyingResults: [...race.qualifyingResults, { positionDisplayOrder: 3, positionNumber: 3, positionText: '3', driverId: 'dns', constructorId: 'team' }],
        }];
      },
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    const revision = JSON.parse(await readFile(join(directory, '.local-data', 'classification.json'), 'utf8'));
    assert.equal(revision.drivers.length, 4);
    assert.deepEqual(revision.drivers.map((driver: { driverId: string }) => driver.driverId),
      ['f1db:driver:first', 'f1db:driver:second', 'f1db:driver:dns', 'f1db:driver:dnp']);
    assert.equal(revision.drivers[0].classification.number, 1);
    assert.equal(revision.drivers[0].retirementReason, 'Source retirement reason despite numeric classification');
    assert.deepEqual(revision.drivers[1].grid, { number: null, text: 'PL' });
    assert.equal(revision.drivers[1].points, 0);
    assert.equal(revision.drivers[1].laps, 0);
    assert.deepEqual(revision.drivers[2].grid, { number: null, text: null });
    assert.deepEqual(revision.drivers[2].qualifying, { number: 3, text: '3' });
    assert.equal(revision.drivers[2].laps, null);
    assert.equal(revision.drivers[2].points, null);
    assert.deepEqual(revision.drivers[3].grid, { number: null, text: null });
    assert.deepEqual(revision.drivers[3].qualifying, { number: null, text: null });
    const [id] = await readdir(join(directory, '.local-data', 'f1db'));
    const reconciliation = JSON.parse(await readFile(join(directory, '.local-data', 'f1db', id!, 'reconciliation.json'), 'utf8'));
    assert.deepEqual(reconciliation.counts, { raceResults: 4, startingGridPositions: 2, qualifyingResults: 3 });
    assert.equal(reconciliation.drivers[3].gridRowPresent, false);
    assert.equal(reconciliation.drivers[3].qualifyingRowPresent, false);
  } finally { await removeProject(directory); }
});

const rejections: { name: string; options: ImportOptions; message: RegExp }[] = [
  { name: 'HTTP failure', options: { status: 503 }, message: /HTTP 503/ },
  { name: 'truncated archive', options: { archiveBytes: Buffer.from([0x1f, 0x8b, 0x08, 0]) }, message: /tar|gzip|archive|Command failed/i },
  { name: 'duplicate archive member', options: { duplicateMember: true }, message: /exactly one package\/data\/f1db.json/ },
  { name: 'malformed UTF-8 data', options: { dataBytes: Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]) }, message: /UTF-8\/JSON/ },
  { name: 'malformed JSON data', options: { dataBytes: Buffer.from('{"races":') }, message: /UTF-8\/JSON/ },
  { name: 'malformed licence encoding', options: { licenceBytes: Buffer.from([0xff]) }, message: /encoded data|encoding|UTF/i },
  { name: 'wrong package version', options: { packageVersion: '2026.19.0' }, message: /package version/ },
  { name: 'wrong bundled schema', options: { schemaId: 'https://example.invalid/schema.json' }, message: /bundled schema ID/ },
  { name: 'duplicate driver registry identity', options: { mutate(data) {
    data.drivers = [{ id: 'first', name: 'One' }, { id: 'first', name: 'Other' }];
  } }, message: /duplicate source identity/ },
  { name: 'duplicate race identity', options: { mutate(data) { data.races = [race, race]; } }, message: /duplicate race identity/ },
  { name: 'unknown driver identity', options: { mutate(data) {
    data.races = [{ ...race, raceResults: [{ ...race.raceResults[0]!, driverId: 'unknown' }, race.raceResults[1]!] }];
  } }, message: /unknown source identity unknown/ },
  { name: 'duplicate result driver', options: { mutate(data) {
    data.races = [{ ...race, raceResults: [race.raceResults[0]!, { ...race.raceResults[1]!, driverId: 'first' }] }];
  } }, message: /duplicate driver identity/ },
  { name: 'contradictory grid constructor', options: { mutate(data) {
    data.constructors = [{ id: 'team', name: 'Example Team' }, { id: 'other', name: 'Other Team' }];
    data.races = [{ ...race, startingGridPositions: [{ ...race.startingGridPositions[0]!, constructorId: 'other' }, race.startingGridPositions[1]!] }];
  } }, message: /unmatched driver\/constructor/ },
  { name: 'contradictory separate grid', options: { mutate(data) {
    data.races = [{ ...race, startingGridPositions: [{ ...race.startingGridPositions[0]!, positionNumber: null, positionText: 'PL' }, race.startingGridPositions[1]!] }];
  } }, message: /contradictory separate and embedded positions/ },
  { name: 'contradictory grid qualification', options: { mutate(data) {
    data.races = [{ ...race, startingGridPositions: [{ ...race.startingGridPositions[0]!, qualificationPositionNumber: 1, qualificationPositionText: '1' }, race.startingGridPositions[1]!] }];
  } }, message: /contradictory separate and embedded positions/ },
  { name: 'missing qualifying participant', options: { mutate(data) {
    data.races = [{ ...race, qualifyingResults: [race.qualifyingResults[0]!] }];
  } }, message: /incomplete separate qualifying/ },
  { name: 'dropped full race result', options: { mutate(data) {
    data.races = [{ ...race, raceResults: [race.raceResults[0]!] }];
  } }, message: /unmatched driver\/constructor/ },
  { name: 'missing source points', options: { mutate(data) {
    const { points: omitted, ...withoutPoints } = race.raceResults[1]!;
    void omitted;
    data.races = [{ ...race, raceResults: [race.raceResults[0]!, withoutPoints] }];
  } }, message: /points/ },
  { name: 'numeric result label conflict', options: { mutate(data) {
    data.races = [{ ...race, raceResults: [{ ...race.raceResults[0]!, positionText: '2' }, race.raceResults[1]!] }];
  } }, message: /contradictory position number\/text/ },
  { name: 'unknown circuit layout', options: { mutate(data) {
    data.races = [{ ...race, circuitLayoutId: 'unknown-layout' }];
  } }, message: /unknown circuit layout/ },
  { name: 'missing race winner', options: { mutate(data) {
    data.races = [{ ...race, raceResults: [{ ...race.raceResults[0]!, positionNumber: 3, positionText: '3' }, race.raceResults[1]!] }];
  } }, message: /winner/ },
];

for (const boundary of rejections) {
  test(`rejects ${boundary.name} without replacing prior classification, metadata or retained candidates`, async () => {
    const directory = await project();
    try {
      const initial = await importEvent(directory);
      assert.equal(initial.status, 0, initial.stderr || String(initial.error));
      const preparedPath = join(directory, '.local-data', 'classification.json');
      const prior = await readFile(preparedPath);
      const metadata = Buffer.from('unrelated metadata evidence\n');
      await writeFile(join(directory, '.local-data', 'inventory.json'), metadata);
      const candidates = join(directory, '.local-data', 'f1db');
      const [firstId] = await readdir(candidates);
      const firstManifest = await readFile(join(candidates, firstId!, 'manifest.json'));
      const rejected = await importEvent(directory, race, boundary.options);
      assert.notEqual(rejected.status, 0, rejected.stdout);
      assert.match(rejected.stderr, boundary.message);
      assert.deepEqual(await readFile(preparedPath), prior);
      assert.deepEqual(await readFile(join(directory, '.local-data', 'inventory.json')), metadata);
      assert.deepEqual(await readFile(join(candidates, firstId!, 'manifest.json')), firstManifest);
      const ids = await readdir(candidates);
      assert.equal(ids.length, 2);
      const rejectedId = ids.find((id) => id !== firstId)!;
      const manifest = JSON.parse(await readFile(join(candidates, rejectedId, 'manifest.json'), 'utf8'));
      assert.equal(manifest.validation, 'rejected');
      assert.ok(manifest.error);
      assert.deepEqual(await readFile(join(candidates, rejectedId, 'f1db-json-single.tgz')), rejected.archiveBytes);
      assert.equal((await readdir(join(directory, '.local-data'))).some((name) => name.endsWith('.tmp')), false);
    } finally { await removeProject(directory); }
  });
}
