export interface ResearchEvent {
  eventId: string;
  season: number;
  round: number;
  grandPrixName: string;
  venueSourceId: string;
  circuitName: string;
  country: string;
  date: string;
  sessionType: 'grand-prix-race';
  state: 'result-recorded' | 'scheduled-future';
  layoutAssignment: 'unverified';
  inclusiveOvertakes: 'unverified';
  publicReuseApproval: 'unqualified';
}

export interface ResearchInventory {
  cutoff: string;
  qualification: 'provisional-source-inventory-not-release-approved';
  limitations: string[];
  events: ResearchEvent[];
}

export interface ResearchFilters {
  season: number | null;
  query: string;
  state: 'all' | 'result-recorded' | 'scheduled-future';
}

type RecordValue = Record<string, unknown>;

function invalid(path: string, expectation: string): never {
  throw new Error(`Invalid research inventory at ${path}: ${expectation}.`);
}

function record(value: unknown, path: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(path, 'expected an object');
  }
  return value as RecordValue;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(path, 'expected a nonempty string');
  }
  return value;
}

function integer(value: unknown, path: string, minimum = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    invalid(path, `expected an integer greater than or equal to ${minimum}`);
  }
  return value;
}

function date(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    invalid(path, 'expected a calendar date in YYYY-MM-DD format');
  }
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    invalid(path, 'expected a real calendar date in YYYY-MM-DD format');
  }
  return result;
}

function equal(value: unknown, expected: string | number, path: string): void {
  if (value !== expected) {
    invalid(path, `expected ${JSON.stringify(expected)}`);
  }
}

function compareEvents(left: ResearchEvent, right: ResearchEvent): number {
  return left.season - right.season || left.round - right.round;
}

function validateSourceIdentity(
  source: RecordValue,
  event: Pick<ResearchEvent, 'season' | 'round' | 'grandPrixName' | 'venueSourceId' | 'date'>,
  path: string,
): RecordValue {
  equal(source.season, String(event.season), `${path}.season`);
  equal(source.round, String(event.round), `${path}.round`);
  equal(source.raceName, event.grandPrixName, `${path}.raceName`);
  equal(date(source.date, `${path}.date`), event.date, `${path}.date`);
  const circuit = record(source.Circuit, `${path}.Circuit`);
  equal(circuit.circuitId, event.venueSourceId, `${path}.Circuit.circuitId`);
  return circuit;
}

/** Projects source evidence into local inventory metadata, never analytical observations. */
export function prepareResearchInventory(raw: unknown): ResearchInventory {
  const input = record(raw, 'inventory');
  const cutoff = date(input.cutoff, 'cutoff');
  const qualification = 'provisional-source-inventory-not-release-approved';
  equal(input.qualification, qualification, 'qualification');
  if (!Array.isArray(input.limitations) || input.limitations.length === 0) {
    invalid('limitations', 'expected a nonempty array preserving source limitations');
  }
  const limitations = input.limitations.map((value: unknown, index: number) =>
    text(value, `limitations[${index}]`),
  );
  if (!Array.isArray(input.events) || input.events.length === 0) {
    invalid('events', 'expected a nonempty array of source events');
  }

  const eventIds = new Set<string>();
  const identities = new Set<string>();
  const seasonCounts = new Map<number, { calendarRows: number; resultRecorded: number; futureScheduled: number }>();
  const events = input.events.map((value: unknown, index: number): ResearchEvent => {
    const path = `events[${index}]`;
    const source = record(value, path);
    const eventId = text(source.eventId, `${path}.eventId`);
    const season = integer(source.season, `${path}.season`);
    const round = integer(source.round, `${path}.round`);
    const identity = `${season}:${round}`;
    equal(eventId, `jolpica:${identity}`, `${path}.eventId`);
    if (eventIds.has(eventId)) invalid(`${path}.eventId`, `duplicate eventId ${JSON.stringify(eventId)}`);
    if (identities.has(identity)) invalid(path, `duplicate season/round ${identity}`);
    eventIds.add(eventId);
    identities.add(identity);

    const grandPrixName = text(source.grandPrixName, `${path}.grandPrixName`);
    const venueSourceId = text(source.venueSourceId, `${path}.venueSourceId`);
    const eventDate = date(source.date, `${path}.date`);
    equal(source.sessionType, 'grand-prix-race', `${path}.sessionType`);
    equal(source.layoutAssignment, 'unverified', `${path}.layoutAssignment`);
    equal(source.inclusiveOvertakes, 'unverified', `${path}.inclusiveOvertakes`);
    equal(source.publicReuseApproval, 'unqualified', `${path}.publicReuseApproval`);
    const state = source.state;
    if (state !== 'result-recorded' && state !== 'scheduled-future') {
      invalid(`${path}.state`, 'expected result-recorded or scheduled-future; unresolved classifications cannot be projected');
    }
    if (state === 'result-recorded' && eventDate > cutoff) {
      invalid(`${path}.date`, `result-recorded date must be on or before inventory cutoff ${cutoff}`);
    }
    if (state === 'scheduled-future' && eventDate <= cutoff) {
      invalid(`${path}.date`, `scheduled-future date must be after inventory cutoff ${cutoff}`);
    }

    const identityFields = { season, round, grandPrixName, venueSourceId, date: eventDate };
    const race = record(source.sourceRace, `${path}.sourceRace`);
    const circuit = validateSourceIdentity(race, identityFields, `${path}.sourceRace`);
    const circuitName = text(circuit.circuitName, `${path}.sourceRace.Circuit.circuitName`);
    const location = record(circuit.Location, `${path}.sourceRace.Circuit.Location`);
    const country = text(location.country, `${path}.sourceRace.Circuit.Location.country`);

    if (state === 'result-recorded') {
      const winner = record(source.sourceWinnerResult, `${path}.sourceWinnerResult`);
      validateSourceIdentity(winner, identityFields, `${path}.sourceWinnerResult`);
      if (!Array.isArray(winner.Results) || winner.Results.length === 0) {
        invalid(`${path}.sourceWinnerResult.Results`, 'result-recorded requires a nonempty winner result array');
      }
      const result = record(winner.Results[0], `${path}.sourceWinnerResult.Results[0]`);
      equal(result.position, '1', `${path}.sourceWinnerResult.Results[0].position`);
    } else {
      if (source.sourceWinnerResult !== null) {
        invalid(`${path}.sourceWinnerResult`, 'scheduled-future requires null, not recorded result evidence');
      }
      if (source.winnerCompletedLaps !== null) {
        invalid(`${path}.winnerCompletedLaps`, 'scheduled-future requires null, never an imputed lap count');
      }
    }

    const counts = seasonCounts.get(season) ?? { calendarRows: 0, resultRecorded: 0, futureScheduled: 0 };
    counts.calendarRows += 1;
    if (state === 'result-recorded') counts.resultRecorded += 1;
    else counts.futureScheduled += 1;
    seasonCounts.set(season, counts);

    return {
      eventId,
      season,
      round,
      grandPrixName,
      venueSourceId,
      circuitName,
      country,
      date: eventDate,
      sessionType: 'grand-prix-race',
      state,
      layoutAssignment: 'unverified',
      inclusiveOvertakes: 'unverified',
      publicReuseApproval: 'unqualified',
    };
  });

  if (!Array.isArray(input.summary)) invalid('summary', 'expected source per-season counts');
  const summarySeasons = new Set<number>();
  input.summary.forEach((value: unknown, index: number) => {
    const path = `summary[${index}]`;
    const summary = record(value, path);
    const season = integer(summary.season, `${path}.season`);
    if (summarySeasons.has(season)) invalid(`${path}.season`, `duplicate summary season ${season}`);
    summarySeasons.add(season);
    const counts = seasonCounts.get(season);
    if (!counts) invalid(`${path}.season`, `season ${season} has no source events`);
    for (const field of ['calendarRows', 'resultRecorded', 'futureScheduled'] as const) {
      equal(integer(summary[field], `${path}.${field}`, 0), counts[field], `${path}.${field}`);
    }
    equal(summary.pastWithoutResult, 0, `${path}.pastWithoutResult`);
  });
  for (const season of seasonCounts.keys()) {
    if (!summarySeasons.has(season)) invalid('summary', `missing source counts for season ${season}`);
  }

  return { cutoff, qualification, limitations, events: events.sort(compareEvents) };
}

export function selectEvents(inventory: ResearchInventory, filters: ResearchFilters): ResearchEvent[] {
  const query = filters.query.trim().toLowerCase();
  return inventory.events.filter((event) =>
    (filters.season === null || event.season === filters.season)
    && (filters.state === 'all' || event.state === filters.state)
    && (query.length === 0 || [event.grandPrixName, event.circuitName, event.country]
      .some((value) => value.toLowerCase().includes(query))),
  ).sort(compareEvents);
}

export function summarizeInventory(events: readonly ResearchEvent[]): {
  resultRecorded: number;
  scheduledFuture: number;
  seasons: number;
} {
  let resultRecorded = 0;
  let scheduledFuture = 0;
  const seasons = new Set<number>();
  for (const event of events) {
    if (event.state === 'result-recorded') resultRecorded += 1;
    else if (event.state === 'scheduled-future') scheduledFuture += 1;
    seasons.add(event.season);
  }
  return { resultRecorded, scheduledFuture, seasons: seasons.size };
}
