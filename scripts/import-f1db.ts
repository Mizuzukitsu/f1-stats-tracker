import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { decodeClassification, type ClassificationPosition, type ClassificationRevision } from '../app/src/classification.ts';

const VERSION = 'v2026.20.0';
const ARCHIVE_URL = `https://github.com/f1db/f1db/releases/download/${VERSION}/f1db-json-single.tgz`;
const SOURCE_URL = `https://raw.githubusercontent.com/f1db/f1db/${VERSION}`;
const SCHEMA_ID = 'https://www.f1db.com/schema/v6.5.0/single/f1db.schema.json';
const MEMBERS = ['package/package.json', 'package/data/f1db.schema.json', 'package/data/f1db.json'] as const;
const run = promisify(execFile);
type Row = Record<string, unknown>;
interface Evidence { file: string; url: string; retrievedAt: string; sha256: string; bytes: number; status?: number }

function record(value: unknown, context: string): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${context}: expected an object.`);
  return value as Row;
}

function rows(value: unknown, context: string): Row[] {
  if (!Array.isArray(value) || !value.length) throw new Error(`${context}: expected a nonempty array.`);
  return value.map((entry: unknown, index: number) => record(entry, `${context}[${index}]`));
}

function text(value: unknown, context: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${context}: expected a nonempty string.`);
  return value;
}

function integer(value: unknown, context: string, minimum = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error(`${context}: expected an integer >= ${minimum}.`);
  return value;
}

function sourceId(value: unknown, context: string): string {
  const result = text(value, context);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(result)) throw new Error(`${context}: malformed source identity.`);
  return result;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}

function json(bytes: Uint8Array, context: string): Row {
  try { return record(JSON.parse(decode(bytes)) as unknown, context); }
  catch (error) { throw new Error(`${context}: invalid UTF-8/JSON: ${error instanceof Error ? error.message : String(error)}`); }
}

async function writePrivate(path: string, bytes: string | Uint8Array): Promise<void> {
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
    await file.chmod(0o400);
  } finally { await file.close(); }
}

function indexById(value: unknown, context: string): Map<string, Row> {
  const result = new Map<string, Row>();
  for (const row of rows(value, context)) {
    const id = sourceId(row.id, `${context}.id`);
    if (result.has(id)) throw new Error(`${context}: duplicate source identity ${id}.`);
    result.set(id, row);
  }
  return result;
}

function lookup(index: Map<string, Row>, value: unknown, context: string): Row {
  const id = sourceId(value, context);
  const row = index.get(id);
  if (!row) throw new Error(`${context}: unknown source identity ${id}.`);
  return row;
}

function sourcePosition(row: Row, numberKey: string, textKey: string, context: string, nullable = false): ClassificationPosition | null {
  const number = row[numberKey] === null ? null : integer(row[numberKey], `${context}.${numberKey}`);
  const label = row[textKey];
  if (nullable && number === null && label === null) return null;
  const result = text(label, `${context}.${textKey}`);
  if (/^[1-9]\d*$/.test(result)) {
    if (number !== Number(result)) throw new Error(`${context}: contradictory position number/text.`);
  } else if (!/^(DNP|DNPQ|DNQ|DNS|DNF|NC|DSQ|EX|PL)$/.test(result) || number !== null) {
    throw new Error(`${context}: malformed position code/number.`);
  }
  return { number, text: result };
}

function participantRows(value: unknown, context: string, drivers: Map<string, Row>, constructors: Map<string, Row>, allowTiedPositions = false): Map<string, Row> {
  const result = new Map<string, Row>();
  const orders = new Set<number>();
  const positions = new Set<number>();
  for (const row of rows(value, context)) {
    const driverId = sourceId(row.driverId, `${context}.driverId`);
    lookup(drivers, driverId, `${context}.driverId`);
    lookup(constructors, row.constructorId, `${context}.constructorId`);
    if (result.has(driverId)) throw new Error(`${context}: duplicate driver identity ${driverId}.`);
    const order = integer(row.positionDisplayOrder, `${context}.positionDisplayOrder`);
    if (orders.has(order)) throw new Error(`${context}: duplicate display order ${order}.`);
    orders.add(order);
    const position = sourcePosition(row, 'positionNumber', 'positionText', context)!;
    if (position.number !== null) {
      if (!allowTiedPositions && positions.has(position.number)) throw new Error(`${context}: duplicate numeric position ${position.number}.`);
      positions.add(position.number);
    }
    result.set(driverId, row);
  }
  for (let order = 1; order <= orders.size; order += 1) {
    if (!orders.has(order)) throw new Error(`${context}: incomplete positionDisplayOrder sequence.`);
  }
  return result;
}

function agree(left: ClassificationPosition | null, right: ClassificationPosition | null, context: string): void {
  if (left !== null && right !== null && (left.number !== right.number || left.text !== right.text)) throw new Error(`${context}: contradictory separate and embedded positions.`);
}

function timingRows(value: unknown, context: string, drivers: Map<string, Row>, constructors: Map<string, Row>, allowTiedPositions = false): Map<string, Row> {
  if (value === null || (Array.isArray(value) && value.length === 0)) return new Map();
  return participantRows(value, context, drivers, constructors, allowTiedPositions);
}

function sourceTime(row: Row, key: string) {
  if (row[key] === null && row[`${key}Millis`] === null) return null;
  return { text: row[key], milliseconds: row[`${key}Millis`] };
}

function qualifyingTimes(row: Row | undefined) {
  return row ? { time: sourceTime(row, 'time'), q1: sourceTime(row, 'q1'), q2: sourceTime(row, 'q2'), q3: sourceTime(row, 'q3') } : null;
}

function prepare(raw: Row, season: number, round: number, source: ClassificationRevision['source'], revision: string) {
  const drivers = indexById(raw.drivers, 'drivers');
  const constructors = indexById(raw.constructors, 'constructors');
  const circuits = indexById(raw.circuits, 'circuits');
  const grandsPrix = indexById(raw.grandsPrix, 'grandsPrix');
  const seasons = new Set<number>();
  for (const row of rows(raw.seasons, 'seasons')) {
    const year = integer(row.year, 'seasons.year', 1950);
    if (seasons.has(year)) throw new Error(`seasons: duplicate year ${year}.`);
    seasons.add(year);
  }
  if (!seasons.has(season)) throw new Error(`Unknown source season ${season}.`);
  const ids = new Set<number>();
  const events = new Set<string>();
  let selected: Row | undefined;
  for (const row of rows(raw.races, 'races')) {
    const id = integer(row.id, 'race.id');
    const year = integer(row.year, 'race.year', 1950);
    const raceRound = integer(row.round, 'race.round');
    const identity = `${year}:${raceRound}`;
    if (ids.has(id) || events.has(identity)) throw new Error(`races: duplicate race identity ${id}/${identity}.`);
    ids.add(id);
    events.add(identity);
    if (!seasons.has(year)) throw new Error(`races: unknown season ${year}.`);
    if (year === season && raceRound === round) selected = row;
  }
  if (!selected) throw new Error(`No source Grand Prix for ${season} round ${round}.`);
  const race = selected;
  const circuit = lookup(circuits, race.circuitId, 'race.circuitId');
  const grandPrix = lookup(grandsPrix, race.grandPrixId, 'race.grandPrixId');
  const layout = race.circuitLayoutId === null ? null : sourceId(race.circuitLayoutId, 'race.circuitLayoutId');
  if (layout !== null && !indexById(circuit.layouts, 'circuit.layouts').has(layout)) throw new Error(`race.circuitLayoutId: unknown circuit layout ${layout}.`);
  const results = participantRows(race.raceResults, 'raceResults', drivers, constructors);
  const grid = participantRows(race.startingGridPositions, 'startingGridPositions', drivers, constructors);
  const qualifying = participantRows(race.qualifyingResults, 'qualifyingResults', drivers, constructors);
  const qualifying1 = timingRows(race.qualifying1Results, 'qualifying1Results', drivers, constructors);
  const qualifying2 = timingRows(race.qualifying2Results, 'qualifying2Results', drivers, constructors);
  const fastestLaps = timingRows(race.fastestLaps, 'fastestLaps', drivers, constructors, true);
  const sprintQualifying = timingRows(race.sprintQualifyingResults, 'sprintQualifyingResults', drivers, constructors);
  const sprintResults = timingRows(race.sprintRaceResults, 'sprintRaceResults', drivers, constructors);
  const sprint = race.qualifyingFormat === 'SPRINT_RACE' ? sprintResults : null;
  // An unmatched participant is not quietly discarded or supplied from a sprint session.
  for (const [name, entries] of [
    ['startingGridPositions', grid], ['qualifyingResults', qualifying], ['sprintRaceResults', sprintResults],
    ['fastestLaps', fastestLaps], ['sprintQualifyingResults', sprintQualifying],
  ] as const) {
    for (const [driver, row] of entries) {
      const result = results.get(driver);
      if (!result || row.constructorId !== result.constructorId) throw new Error(`${name}: unmatched driver/constructor ${driver}.`);
    }
  }
  const reconciliation: Row[] = [];
  const projected = [...results.values()].sort((a, b) => Number(a.positionDisplayOrder) - Number(b.positionDisplayOrder)).map((result) => {
    const driverId = sourceId(result.driverId, 'raceResults.driverId');
    const constructorId = sourceId(result.constructorId, 'raceResults.constructorId');
    const gridRow = grid.get(driverId);
    const qualifyingRow = qualifying.get(driverId);
    const sprintRow = sprint?.get(driverId);
    const fastestLap = fastestLaps.get(driverId);
    if (result.fastestLap !== null && typeof result.fastestLap !== 'boolean') throw new Error(`${driverId}: malformed fastestLap source marker.`);
    if (result.fastestLap !== null && result.fastestLap !== (fastestLap?.positionNumber === 1)) throw new Error(`${driverId}: conflicting fastestLap source marker and GP fastest-lap ranking.`);
    const embeddedGrid = sourcePosition(result, 'gridPositionNumber', 'gridPositionText', `${driverId} embedded grid`, true);
    const embeddedQualifying = sourcePosition(result, 'qualificationPositionNumber', 'qualificationPositionText', `${driverId} embedded qualifying`, true);
    const separateGrid = gridRow ? sourcePosition(gridRow, 'positionNumber', 'positionText', `${driverId} separate grid`)! : null;
    const separateQualifying = qualifyingRow ? sourcePosition(qualifyingRow, 'positionNumber', 'positionText', `${driverId} separate qualifying`)! : null;
    const sprintPosition = sprintRow ? sourcePosition(sprintRow, 'positionNumber', 'positionText', `${driverId} sprint`)! : null;
    const gridQualification = sprint ? sprintPosition : separateQualifying;
    agree(embeddedGrid, separateGrid, `${driverId} grid`);
    agree(embeddedQualifying, gridQualification, `${driverId} grid-deciding session`);
    if (gridRow) {
      const gridQualifying = sourcePosition(gridRow, 'qualificationPositionNumber', 'qualificationPositionText', `${driverId} grid qualifying`, true);
      agree(gridQualifying, embeddedQualifying, `${driverId} grid/embedded qualifying`);
      agree(gridQualifying, gridQualification, `${driverId} grid/session qualifying`);
    }
    const resolvedGrid = separateGrid ?? embeddedGrid ?? { number: null, text: null };
    const resolvedQualifying = separateQualifying ?? (sprint ? null : embeddedQualifying) ?? { number: null, text: null };
    if (!gridRow && embeddedGrid !== null) throw new Error(`${driverId}: incomplete separate starting grid.`);
    if (!sprint && !qualifyingRow && embeddedQualifying !== null) throw new Error(`${driverId}: incomplete separate qualifying results.`);
    if (sprint && !sprintRow && embeddedQualifying !== null) throw new Error(`${driverId}: incomplete sprint results for grid reconciliation.`);
    if (sprintRow) {
      const sprintQualifying = sourcePosition(sprintRow, 'qualificationPositionNumber', 'qualificationPositionText', `${driverId} sprint qualifying`, true);
      agree(sprintQualifying, separateQualifying, `${driverId} GP qualifying`);
      if (!qualifyingRow && sprintQualifying !== null) throw new Error(`${driverId}: incomplete separate GP qualifying results.`);
    }
    reconciliation.push({ driverId, constructorId, positionDisplayOrder: result.positionDisplayOrder,
      embeddedGrid, separateGrid, gridRowPresent: Boolean(gridRow), embeddedQualifying, separateQualifying, qualifyingRowPresent: Boolean(qualifyingRow),
      qualifyingFormat: race.qualifyingFormat ?? null, sprintPosition, resolvedGrid, resolvedQualifying });
    return {
      driverId: `f1db:driver:${driverId}`, driverName: text(lookup(drivers, driverId, 'driver').name, 'driver.name'),
      constructorId: `f1db:constructor:${constructorId}`, constructorName: text(lookup(constructors, constructorId, 'constructor').name, 'constructor.name'),
      driverNumber: result.driverNumber, classification: sourcePosition(result, 'positionNumber', 'positionText', `${driverId} classification`),
      grid: resolvedGrid, qualifying: resolvedQualifying, laps: result.laps, points: result.points, retirementReason: result.reasonRetired,
      timing: {
        qualifying: qualifyingTimes(qualifyingRow),
        raceFastestLap: fastestLap ? {
          position: sourcePosition(fastestLap, 'positionNumber', 'positionText', `${driverId} fastest lap`),
          lap: fastestLap.lap, time: sourceTime(fastestLap, 'time'),
        } : null,
      },
    };
  });
  const eventId = `f1db:race:${String(race.id)}`;
  function numberedSession(entries: Map<string, Row>) {
    return [...entries.values()].sort((a, b) => Number(a.positionDisplayOrder) - Number(b.positionDisplayOrder)).map((row) => ({
      driverId: `f1db:driver:${String(row.driverId)}`, driverName: text(lookup(drivers, row.driverId, 'numbered qualifying driver').name, 'driver.name'),
      constructorId: `f1db:constructor:${String(row.constructorId)}`, constructorName: text(lookup(constructors, row.constructorId, 'numbered qualifying constructor').name, 'constructor.name'),
      time: sourceTime(row, 'time'),
    }));
  }
  const prepared = decodeClassification({
    schemaVersion: 2, revision, cutoff: source.acquiredAt.slice(0, 10), qualification: 'local-research-unverified', source,
    event: {
      eventId, seasonId: `f1db:season:${season}`, season, round, date: race.date,
      name: text(race.officialName, 'race.officialName'), grandPrixId: `f1db:grand-prix:${sourceId(grandPrix.id, 'grandPrix.id')}`,
      venueId: `f1db:circuit:${sourceId(circuit.id, 'circuit.id')}`, venueName: text(circuit.name, 'circuit.name'),
      sessionId: `${eventId}:grand-prix-race`, sessionType: 'grand-prix-race', layoutSourceId: layout, layoutQualification: 'unverified',
    },
    timing: {
      qualifyingFormat: race.qualifyingFormat, qualifyingSessionId: `${eventId}:grand-prix-qualifying`, validity: 'unverified',
      sprintRaceRecorded: sprintResults.size > 0, sprintQualifyingRecorded: sprintQualifying.size > 0,
      qualifying1: numberedSession(qualifying1), qualifying2: numberedSession(qualifying2),
    },
    definitions: [
      'All source Grand Prix raceResults are included in positionDisplayOrder; sprint results are not substituted.',
      'Classification number/text is the source result, not proof that a driver finished; retirement reason is a separate source field.',
      'Grid and qualifying are distinct source positions, reconciled by driver and constructor identities. PL denotes a pit-lane start, not position zero.',
      race.qualifyingFormat === 'SPRINT_RACE'
        ? 'This weekend used sprint race results to decide the GP grid. Embedded/grid qualification fields are reconciled against that sprint; displayed qualifying positions come only from the separate GP qualifying session.'
        : 'Displayed qualifying positions refer to the separate GP qualifying session, not sprint classification.',
      'Laps are completed-lap counts; points are source Grand Prix points. Source-null laps, points, position labels and retirement reason remain unknown, not inferred zero, non-applicable or finished.',
      'The cutoff is the acquisition UTC date, not a historical archival-as-of claim.',
      'Timing strings and milliseconds are retained together and must agree. Qualifying time is a source session/combined result; AGGREGATE and FOUR_LAPS values are not single-lap observations. Numbered qualifying sessions retain their own rosters, including replaced drivers, separately from knockout Q1/Q2/Q3.',
      'GP fastest laps are joined by driver and constructor, checked against source rank order and the derived fastestLap marker; that marker is not independent validity evidence. Non-winners and retirees are included.',
      'Null timing means no recorded time, not zero or proof of no valid lap. Absent timing rows and recorded zero completed laps remain distinct. Sprint timing is never substituted.',
      'Race fastest-lap numbers retain the source index convention; that index is not assumed to be bounded by an individual driver completed-lap count. Equal fastest-lap ranks retain all tied drivers; known times for a tied rank must agree.',
    ],
    limitations: [
      'Local research only: source observations are not independently verified sporting history or release-approved analytics.',
      'Circuit layout IDs are source claims; historical geometry and layout comparability remain unverified.',
      'Lap validity, deletion/correction policy and eligible-driver completeness remain unverified. A source-ranked candidate is not a verified fastest-valid baseline; no speed or comparison is calculated.',
      'F1DB CC-BY-4.0 licence and attribution evidence is retained, but applicable upstream rights and public reuse remain unqualified.',
    ],
    drivers: projected,
  });
  return { prepared, race, reconciliation, counts: { raceResults: results.size, startingGridPositions: grid.size, qualifyingResults: qualifying.size } };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || !/^\d{4}$/.test(args[0] ?? '') || !/^[1-9]\d*$/.test(args[1] ?? '')) throw new Error('Usage: npm run import:f1db -- <season> <round>.');
  const season = integer(Number(args[0]), 'season', 1950);
  const round = integer(Number(args[1]), 'round');
  const root = fileURLToPath(new URL('../.local-data/', import.meta.url));
  const id = randomUUID();
  const candidate = resolve(root, 'f1db', id);
  await mkdir(candidate, { recursive: true, mode: 0o700 });
  const evidence: Evidence[] = [];
  const manifest: Row = {
    schemaVersion: 1, candidateId: id, source: 'F1DB', version: VERSION, url: ARCHIVE_URL,
    attemptedAt: new Date().toISOString(), requestedEvent: { season, round }, evidence,
  };
  let prepared: ClassificationRevision | undefined;
  let failure: unknown;
  async function retain(file: string, bytes: Uint8Array, url: string, retrievedAt: string, status?: number) {
    await writePrivate(resolve(candidate, file), bytes);
    const entry: Evidence = { file, url, retrievedAt, sha256: digest(bytes), bytes: bytes.byteLength, ...(status === undefined ? {} : { status }) };
    evidence.push(entry);
    return entry;
  }
  async function download(file: string, url: string) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'F1FieldNotes-LocalResearch/0.1' }, redirect: 'follow', signal: AbortSignal.timeout(120_000),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const entry = await retain(file, bytes, url, new Date().toISOString(), response.status);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}.`);
    return { bytes, entry };
  }
  try {
    const archive = await download('f1db-json-single.tgz', ARCHIVE_URL);
    const licence = await download('LICENSE', `${SOURCE_URL}/LICENSE`);
    const readme = await download('README.md', `${SOURCE_URL}/README.md`);
    const licenceText = decode(licence.bytes);
    if (!licenceText.trim() || !/Attribution 4\.0|CC[ -]BY[ -]4\.0|creativecommons\.org\/licenses\/by\/4\.0/i.test(licenceText)) throw new Error('Licence evidence does not identify CC-BY-4.0.');
    if (!decode(readme.bytes).trim()) throw new Error('README evidence is empty.');
    const archivePath = resolve(candidate, 'f1db-json-single.tgz');
    const listing = await run('tar', ['-tzf', archivePath], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
    const memberNames = decode(listing.stdout).split('\n');
    for (const member of MEMBERS) {
      if (memberNames.filter((name) => name === member).length !== 1) throw new Error(`Archive must contain exactly one ${member}.`);
    }
    const extracted: Buffer[] = [];
    for (const [index, member] of MEMBERS.entries()) {
      // Only fixed members go to stdout. No archive path is ever extracted to disk.
      const result = await run('tar', ['-xOzf', archivePath, member], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
      const file = ['package.json', 'f1db.schema.json', 'f1db.json'][index]!;
      await retain(file, result.stdout, `${ARCHIVE_URL}#${member}`, archive.entry.retrievedAt);
      extracted.push(result.stdout);
    }
    const metadata = json(extracted[0]!, 'package/package.json');
    if (metadata.version !== VERSION.slice(1)) throw new Error(`Unexpected package version ${String(metadata.version)}.`);
    const schema = json(extracted[1]!, 'f1db.schema.json');
    if (schema.$id !== SCHEMA_ID) throw new Error(`Unexpected bundled schema ID ${String(schema.$id)}.`);
    const source: ClassificationRevision['source'] = {
      name: 'F1DB', version: VERSION, url: ARCHIVE_URL, sha256: archive.entry.sha256,
      acquiredAt: archive.entry.retrievedAt, schemaId: SCHEMA_ID,
      licence: { identifier: 'CC-BY-4.0', url: `${SOURCE_URL}/LICENSE`, sha256: licence.entry.sha256 },
      attribution: `Formula 1 data: F1DB (${VERSION}), https://www.f1db.com/, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Modified into a local single-event projection; no endorsement implied.`,
    };
    const result = prepare(json(extracted[2]!, 'f1db.json'), season, round, source, `f1db-${VERSION}-${id}`);
    await retain('selected-event.json', Buffer.from(`${JSON.stringify(result.race, null, 2)}\n`), `${ARCHIVE_URL}#race:${String(result.race.id)}`, archive.entry.retrievedAt);
    await retain('reconciliation.json', Buffer.from(`${JSON.stringify({ counts: result.counts, drivers: result.reconciliation }, null, 2)}\n`), `${ARCHIVE_URL}#race:${String(result.race.id)}`, archive.entry.retrievedAt);
    await retain('prepared.json', Buffer.from(`${JSON.stringify(result.prepared, null, 2)}\n`), `${ARCHIVE_URL}#race:${String(result.race.id)}`, archive.entry.retrievedAt);
    prepared = result.prepared;
    manifest.selectedEvent = result.prepared.event;
    manifest.counts = result.counts;
    manifest.validation = 'accepted-local-research-unverified';
  } catch (error) {
    failure = error;
    manifest.validation = 'rejected';
    manifest.error = error instanceof Error ? error.message : String(error);
  }
  // Seal the evidence before publication, including rejected observations. Existing candidates are never opened for writing.
  await writePrivate(resolve(candidate, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await chmod(candidate, 0o500);
  if (failure) throw failure;
  if (!prepared) throw new Error('No validated classification was prepared.');
  const temporary = resolve(root, `.classification-${id}.tmp`);
  let created = false;
  try {
    const file = await open(temporary, 'wx', 0o600);
    created = true;
    try {
      await file.writeFile(`${JSON.stringify(prepared, null, 2)}\n`, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, resolve(root, 'classification.json'));
    created = false;
  } finally {
    if (created) await unlink(temporary);
  }
  console.log(`Prepared ${prepared.event.eventId}: ${prepared.drivers.length} full Grand Prix race-result records.`);
  console.log(`Saved .local-data/classification.json; immutable private candidate evidence: .local-data/f1db/${id}/.`);
  console.log('Local research only; historical verification, layout geometry, inclusive overtakes and public reuse remain unqualified. Metadata inventory unchanged.');
}

main().catch((error: unknown) => {
  console.error(`F1DB import failed; previous prepared classification was not replaced: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
