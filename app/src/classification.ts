export interface ClassificationPosition {
  number: number | null;
  text: string | null;
}

export interface ClassificationDriver {
  driverId: string;
  driverName: string;
  constructorId: string;
  constructorName: string;
  driverNumber: string | null;
  classification: ClassificationPosition;
  grid: ClassificationPosition;
  qualifying: ClassificationPosition;
  laps: number | null;
  points: number | null;
  retirementReason: string | null;
}

export interface ClassificationRevision {
  schemaVersion: 1;
  revision: string;
  cutoff: string;
  qualification: 'local-research-unverified';
  source: {
    name: 'F1DB';
    version: 'v2026.20.0';
    url: string;
    sha256: string;
    acquiredAt: string;
    schemaId: string;
    licence: { identifier: 'CC-BY-4.0'; url: string; sha256: string };
    attribution: string;
  };
  event: {
    eventId: string;
    seasonId: string;
    season: number;
    round: number;
    date: string;
    name: string;
    grandPrixId: string;
    venueId: string;
    venueName: string;
    sessionId: string;
    sessionType: 'grand-prix-race';
    layoutSourceId: string | null;
    layoutQualification: 'unverified';
  };
  definitions: string[];
  limitations: string[];
  drivers: ClassificationDriver[];
}

type Row = Record<string, unknown>;

function invalid(path: string, expected: string): never {
  throw new Error(`Invalid classification at ${path}: ${expected}.`);
}

function record(value: unknown, path: string): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'expected an object');
  return value as Row;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(path, 'expected a nonempty string');
  return value;
}

function equal(value: unknown, expected: string | number, path: string): void {
  if (value !== expected) invalid(path, `expected ${JSON.stringify(expected)}`);
}

function integer(value: unknown, path: string, minimum = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid(path, `expected an integer >= ${minimum}`);
  return value;
}

function date(value: unknown, path: string): string {
  const result = text(value, path);
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) invalid(path, 'expected a real YYYY-MM-DD date');
  return result;
}

function identity(value: unknown, namespace: string, path: string): string {
  const result = text(value, path);
  if (!new RegExp(`^f1db:${namespace}:[A-Za-z0-9][A-Za-z0-9._-]*$`).test(result)) invalid(path, `expected a source-qualified ${namespace} identity`);
  return result;
}

function hash(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^[a-f0-9]{64}$/.test(result)) invalid(path, 'expected a lowercase SHA-256');
  return result;
}

function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.length) invalid(path, 'expected a nonempty string array');
  return value.map((entry: unknown, index: number) => text(entry, `${path}[${index}]`));
}

function position(value: unknown, path: string): ClassificationPosition {
  const row = record(value, path);
  const number = row.number === null ? null : integer(row.number, `${path}.number`);
  if (row.text === null && number === null) return { number: null, text: null };
  const label = text(row.text, `${path}.text`);
  if (/^[1-9]\d*$/.test(label)) {
    if (number !== Number(label)) invalid(path, 'numeric position and text disagree');
  } else {
    if (!/^(DNP|DNPQ|DNQ|DNS|DNF|NC|DSQ|EX|PL)$/.test(label)) invalid(path, 'unknown source position code');
    if (number !== null) invalid(path, 'a status code cannot also claim a numeric position');
  }
  return { number, text: label };
}

/** Validates prepared meaning and returns only the approved browser projection. */
export function decodeClassification(raw: unknown): ClassificationRevision {
  const input = record(raw, 'classification');
  equal(input.schemaVersion, 1, 'schemaVersion');
  equal(input.qualification, 'local-research-unverified', 'qualification');
  const cutoff = date(input.cutoff, 'cutoff');
  const source = record(input.source, 'source');
  equal(source.name, 'F1DB', 'source.name');
  equal(source.version, 'v2026.20.0', 'source.version');
  equal(source.url, 'https://github.com/f1db/f1db/releases/download/v2026.20.0/f1db-json-single.tgz', 'source.url');
  equal(source.schemaId, 'https://www.f1db.com/schema/v6.5.0/single/f1db.schema.json', 'source.schemaId');
  const acquiredAt = text(source.acquiredAt, 'source.acquiredAt');
  const acquired = new Date(acquiredAt);
  if (!Number.isFinite(acquired.getTime()) || acquired.toISOString() !== acquiredAt || acquiredAt.slice(0, 10) !== cutoff) invalid('source.acquiredAt', 'expected a UTC ISO acquisition time matching cutoff');
  const licence = record(source.licence, 'source.licence');
  equal(licence.identifier, 'CC-BY-4.0', 'source.licence.identifier');
  equal(licence.url, 'https://raw.githubusercontent.com/f1db/f1db/v2026.20.0/LICENSE', 'source.licence.url');
  const event = record(input.event, 'event');
  const season = integer(event.season, 'event.season', 1950);
  const eventId = identity(event.eventId, 'race', 'event.eventId');
  if (!/^f1db:race:[1-9]\d*$/.test(eventId)) invalid('event.eventId', 'expected a positive integer source race identity');
  equal(event.seasonId, `f1db:season:${season}`, 'event.seasonId');
  equal(event.sessionId, `${eventId}:grand-prix-race`, 'event.sessionId');
  equal(event.sessionType, 'grand-prix-race', 'event.sessionType');
  equal(event.layoutQualification, 'unverified', 'event.layoutQualification');
  const eventDate = date(event.date, 'event.date');
  if (Number(eventDate.slice(0, 4)) !== season || eventDate > cutoff) invalid('event.date', 'expected a race date in its season no later than acquisition cutoff');
  if (!Array.isArray(input.drivers) || !input.drivers.length) invalid('drivers', 'expected full nonempty race results');
  const drivers = new Set<string>();
  const names = new Map<string, string>();
  const positions = { classification: new Set<number>(), grid: new Set<number>(), qualifying: new Set<number>() };
  const projected = input.drivers.map((value: unknown, index: number): ClassificationDriver => {
    const path = `drivers[${index}]`;
    const row = record(value, path);
    const driverId = identity(row.driverId, 'driver', `${path}.driverId`);
    if (drivers.has(driverId)) invalid(path, 'duplicate source driver identity');
    drivers.add(driverId);
    const constructorId = identity(row.constructorId, 'constructor', `${path}.constructorId`);
    const constructorName = text(row.constructorName, `${path}.constructorName`);
    if (names.has(constructorId) && names.get(constructorId) !== constructorName) invalid(path, 'contradictory constructor name');
    names.set(constructorId, constructorName);
    const driverName = text(row.driverName, `${path}.driverName`);
    const classification = position(row.classification, `${path}.classification`);
    if (classification.text === null) invalid(path, 'race classification requires an exact source result label');
    const grid = position(row.grid, `${path}.grid`);
    const qualifying = position(row.qualifying, `${path}.qualifying`);
    if (classification.text === 'PL' || qualifying.text === 'PL') invalid(path, 'pit-lane code is applicable only to the grid');
    for (const [kind, result] of Object.entries({ classification, grid, qualifying })) {
      const seen = positions[kind as keyof typeof positions];
      if (result.number !== null) {
        if (seen.has(result.number)) invalid(path, `duplicate ${kind} position`);
        seen.add(result.number);
      }
    }
    const driverNumber = row.driverNumber === null ? null : text(row.driverNumber, `${path}.driverNumber`);
    if (driverNumber !== null && !/^\d{1,3}$/.test(driverNumber)) invalid(path, 'expected a source racing-number string');
    const laps = row.laps === null ? null : integer(row.laps, `${path}.laps`, 0);
    const points = row.points;
    if (points !== null && (typeof points !== 'number' || !Number.isFinite(points) || points < 0)) invalid(`${path}.points`, 'expected nonnegative source GP points or null');
    return {
      driverId, driverName, constructorId, constructorName, driverNumber,
      classification, grid, qualifying, laps, points: points as number | null,
      retirementReason: row.retirementReason === null ? null : text(row.retirementReason, `${path}.retirementReason`),
    };
  });
  if (!positions.classification.has(1)) invalid('drivers', 'full GP classification requires a source winner');
  return {
    schemaVersion: 1, revision: text(input.revision, 'revision'), cutoff, qualification: 'local-research-unverified',
    source: {
      name: 'F1DB', version: 'v2026.20.0', url: source.url as string,
      sha256: hash(source.sha256, 'source.sha256'), acquiredAt, schemaId: source.schemaId as string,
      licence: { identifier: 'CC-BY-4.0', url: licence.url as string, sha256: hash(licence.sha256, 'source.licence.sha256') },
      attribution: text(source.attribution, 'source.attribution'),
    },
    event: {
      eventId, seasonId: `f1db:season:${season}`, season, round: integer(event.round, 'event.round'), date: eventDate,
      name: text(event.name, 'event.name'), grandPrixId: identity(event.grandPrixId, 'grand-prix', 'event.grandPrixId'),
      venueId: identity(event.venueId, 'circuit', 'event.venueId'), venueName: text(event.venueName, 'event.venueName'),
      sessionId: `${eventId}:grand-prix-race`, sessionType: 'grand-prix-race',
      layoutSourceId: event.layoutSourceId === null ? null : text(event.layoutSourceId, 'event.layoutSourceId'), layoutQualification: 'unverified',
    },
    definitions: strings(input.definitions, 'definitions'), limitations: strings(input.limitations, 'limitations'), drivers: projected,
  };
}
