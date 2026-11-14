import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import timers from 'node:timers/promises';
import { prepareResearchInventory } from '../app/src/research.ts';

type Row = Record<string, unknown>;

function record(value: unknown, context: string): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${context}: expected an object.`);
  return value as Row;
}

function count(value: unknown, context: string): number {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${context}: expected a nonnegative integer string.`);
  }
  return Number(value);
}

interface Page {
  url: string;
  retrievedAt: string;
  status: number;
  sha256: string;
  body: string;
}

const pages: Page[] = [];
let requested = false;

async function fetchRaces(season: number, endpoint: 'races' | 'results/1'): Promise<Row[]> {
  const rows: Row[] = [];
  let expectedTotal: number | undefined;
  const rounds = new Set<number>();
  do {
    const offset = rows.length;
    const url = `https://api.jolpi.ca/ergast/f1/${season}/${endpoint}.json?limit=100&offset=${offset}`;
    // Serial requests, at most one per second; stop on rate limits rather than retrying blindly.
    if (requested) await timers.setTimeout(1000);
    requested = true;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'F1FieldNotes-LocalResearch/0.1', Accept: 'application/json' },
      signal: AbortSignal.timeout(45_000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}; acquisition stopped, no candidate saved.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const data = record(record(JSON.parse(body) as unknown, url).MRData, `${url} MRData`);
    const total = count(data.total, `${url} total`);
    const limit = count(data.limit, `${url} limit`);
    if (count(data.offset, `${url} offset`) !== offset) throw new Error(`${url}: wrong page offset.`);
    if (limit === 0 || limit > 100) throw new Error(`${url}: invalid page limit.`);
    if (expectedTotal !== undefined && expectedTotal !== total) throw new Error(`${url}: total changed during pagination; rerun for a coherent observation.`);
    expectedTotal = total;
    const table = record(data.RaceTable, `${url} RaceTable`);
    if (table.season !== String(season)) throw new Error(`${url}: wrong season.`);
    if (!Array.isArray(table.Races)) throw new Error(`${url}: missing race rows.`);
    if (table.Races.length > limit || offset + table.Races.length > total) throw new Error(`${url}: page exceeds declared limits.`);
    if (table.Races.length === 0 && offset < total) throw new Error(`${url}: empty page before declared total; incomplete acquisition.`);
    for (const value of table.Races) {
      const race = record(value, `${url} race`);
      const round = count(race.round, `${url} round`);
      if (round === 0 || race.season !== String(season)) throw new Error(`${url}: invalid race identity.`);
      if (rounds.has(round)) throw new Error(`${url}: duplicate season/round ${season}:${round}.`);
      rounds.add(round);
      rows.push(race);
    }
    pages.push({ url, retrievedAt: new Date().toISOString(), status: response.status,
      sha256: createHash('sha256').update(bytes).digest('hex'), body });
  } while (rows.length < expectedTotal!);
  return rows;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cutoff = args[0];
  const parsed = new Date(`${cutoff}T00:00:00.000Z`);
  if (args.length !== 1 || !cutoff || !/^\d{4}-\d{2}-\d{2}$/.test(cutoff)
    || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== cutoff
    || cutoff < '2015-01-01' || cutoff > new Date().toISOString().slice(0, 10)) {
    throw new Error('Usage: npm run acquire:local -- <YYYY-MM-DD cutoff> (2015 onward, not a future date).');
  }
  const events: Row[] = [];
  const summary: Row[] = [];
  for (let season = 2015; season <= Number(cutoff.slice(0, 4)); season += 1) {
    const calendar = await fetchRaces(season, 'races');
    const results = await fetchRaces(season, 'results/1');
    if (calendar.length === 0) throw new Error(`${season}: empty calendar cannot establish source coverage.`);
    const winners = new Map(results.map((race) => [race.round, race]));
    const calendarRounds = new Set(calendar.map((race) => race.round));
    for (const winner of results) {
      if (!calendarRounds.has(winner.round)) throw new Error(`${season}:${String(winner.round)}: result absent from calendar.`);
    }
    let resultRecorded = 0;
    let futureScheduled = 0;
    for (const race of calendar) {
      const winner = winners.get(race.round) ?? null;
      if (typeof race.date !== 'string') throw new Error(`${season}:${String(race.round)}: missing calendar date.`);
      if (winner && race.date > cutoff) throw new Error(`${season}:${String(race.round)}: result beyond cutoff; use a current cutoff, not an inferred historical snapshot.`);
      if (!winner && race.date <= cutoff) throw new Error(`${season}:${String(race.round)}: past calendar event without result; investigate postponement, cancellation or source delay. No zero or held-state inferred.`);
      let winnerCompletedLaps: number | null = null;
      if (winner) {
        if (!Array.isArray(winner.Results) || winner.Results.length !== 1) throw new Error(`${season}:${String(race.round)}: expected exactly one position-1 result.`);
        const result = record(winner.Results[0], 'winner result');
        if (result.position !== '1') throw new Error(`${season}:${String(race.round)}: result is not position 1.`);
        winnerCompletedLaps = count(result.laps, 'winner laps');
        resultRecorded += 1;
      } else {
        futureScheduled += 1;
      }
      events.push({
        eventId: `jolpica:${season}:${String(race.round)}`, season, round: Number(race.round),
        grandPrixName: race.raceName, venueSourceId: record(race.Circuit, 'Circuit').circuitId,
        date: race.date, sessionType: 'grand-prix-race', state: winner ? 'result-recorded' : 'scheduled-future',
        layoutAssignment: 'unverified', inclusiveOvertakes: 'unverified', publicReuseApproval: 'unqualified',
        qualifyingScheduled: race.Qualifying ?? null, sprintScheduled: race.Sprint ?? null,
        winnerCompletedLaps, sourceRace: race, sourceWinnerResult: winner,
      });
    }
    summary.push({ season, calendarRows: calendar.length, resultRecorded, pastWithoutResult: 0, futureScheduled });
  }
  const inventory = {
    cutoff, qualification: 'provisional-source-inventory-not-release-approved', summary, events,
    limitations: [
      'Jolpica source observations, not independently verified held-event history or a complete cancellation register.',
      'Layout assignments, inclusive overtakes, canonical identities and applicable reuse/public-display rights remain unqualified.',
      'Scheduled qualifying/sprint timestamps do not establish held-session coverage; no sprint results were acquired.',
      'Pagination totals and identities reconcile, but upstream changes without total changes may require independent reconciliation.',
      'The cutoff classifies source dates; this is a current retrieval, not a historical as-of snapshot.',
    ],
    acquisition: {
      source: 'Jolpica', retrievedAt: new Date().toISOString(), pages,
      dataTerms: 'https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md',
      rights: 'Candidate data only. Review applicable CC BY-NC-SA 4.0 attribution, modification, share-alike and upstream conditions before any public reuse.',
    },
  };
  // Reuse the exact preparation contract; contradictory source identities cannot be saved as usable input.
  prepareResearchInventory(inventory);
  const outputDirectory = fileURLToPath(new URL('../.local-data/', import.meta.url));
  const id = randomUUID();
  const destination = resolve(outputDirectory, `source-inventory-${id}.json`);
  const temporary = resolve(outputDirectory, `.source-inventory-${id}.tmp`);
  await mkdir(outputDirectory, { recursive: true });
  let created = false;
  try {
    const file = await open(temporary, 'wx', 0o600);
    created = true;
    try {
      await file.writeFile(`${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, destination);
    created = false;
  } finally {
    if (created) await unlink(temporary);
  }
  console.log(`Saved local source inventory: ${destination}`);
  console.log(`${events.length} source calendar rows across ${summary.length} seasons; ${pages.length} HTTP pages retained with SHA-256 and retrieval times.`);
  console.log('Candidate only: no verified inclusive overtakes, cancellation completeness or publication rights. Previous candidates and prepared inventory unchanged.');
}

main().catch((error: unknown) => {
  console.error(`Acquisition failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
