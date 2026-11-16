export interface ClassificationPosition {
  number: number | null;
  text: string | null;
}

export interface RecordedTime {
  text: string;
  milliseconds: number;
}

export interface QualifyingTimes {
  time: RecordedTime | null;
  q1: RecordedTime | null;
  q2: RecordedTime | null;
  q3: RecordedTime | null;
}

export interface NumberedQualifyingParticipant {
  driverId: string;
  driverName: string;
  constructorId: string;
  constructorName: string;
  time: RecordedTime | null;
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
  timing: {
    qualifying: QualifyingTimes | null;
    raceFastestLap: { position: ClassificationPosition; lap: number | null; time: RecordedTime | null } | null;
  };
}

export interface ClassificationRevision {
  schemaVersion: 2;
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
  timing: {
    qualifyingFormat: 'FOUR_LAPS' | 'TWO_SESSION' | 'ONE_SESSION' | 'ONE_LAP' | 'AGGREGATE' | 'KNOCKOUT' | 'ELIMINATION' | 'SPRINT_RACE';
    qualifyingSessionId: string;
    validity: 'unverified';
    sprintRaceRecorded: boolean;
    sprintQualifyingRecorded: boolean;
    qualifying1: NumberedQualifyingParticipant[];
    qualifying2: NumberedQualifyingParticipant[];
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

function consistentName(value: unknown, id: string, names: Map<string, string>, path: string): string {
  const name = text(value, path);
  if (names.has(id) && names.get(id) !== name) invalid(path, 'contradictory name for source identity');
  names.set(id, name);
  return name;
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

function recordedTime(value: unknown, path: string): RecordedTime | null {
  if (value === null) return null;
  const row = record(value, path);
  const label = text(row.text, `${path}.text`);
  const match = /^(?:(?:(\d+):)?(\d+):)?([0-5]?\d)\.(\d{1,3})$/.exec(label);
  const milliseconds = integer(row.milliseconds, `${path}.milliseconds`);
  if (!match || (Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3])) * 1000 + Number(match[4]!.padEnd(3, '0')) !== milliseconds) {
    invalid(path, 'time text and positive milliseconds must agree');
  }
  return { text: label, milliseconds };
}

function qualifyingTimes(value: unknown, path: string): QualifyingTimes | null {
  if (value === null) return null;
  const row = record(value, path);
  return {
    time: recordedTime(row.time, `${path}.time`), q1: recordedTime(row.q1, `${path}.q1`),
    q2: recordedTime(row.q2, `${path}.q2`), q3: recordedTime(row.q3, `${path}.q3`),
  };
}

function numberedQualifying(value: unknown, path: string, names: Map<string, string>): NumberedQualifyingParticipant[] {
  if (!Array.isArray(value)) invalid(path, 'expected a session participant array');
  const seen = new Set<string>();
  return value.map((entry: unknown, index: number) => {
    const row = record(entry, `${path}[${index}]`);
    const driverId = identity(row.driverId, 'driver', `${path}[${index}].driverId`);
    if (seen.has(driverId)) invalid(path, 'duplicate driver within numbered qualifying session');
    seen.add(driverId);
    const constructorId = identity(row.constructorId, 'constructor', `${path}[${index}].constructorId`);
    return {
      driverId, driverName: consistentName(row.driverName, driverId, names, `${path}[${index}].driverName`),
      constructorId, constructorName: consistentName(row.constructorName, constructorId, names, `${path}[${index}].constructorName`),
      time: recordedTime(row.time, `${path}[${index}].time`),
    };
  });
}

/** Validates prepared meaning and returns only the approved browser projection. */
export function decodeClassification(raw: unknown): ClassificationRevision {
  const input = record(raw, 'classification');
  equal(input.schemaVersion, 2, 'schemaVersion');
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
  const timing = record(input.timing, 'timing');
  const qualifyingFormat = text(timing.qualifyingFormat, 'timing.qualifyingFormat');
  if (!['FOUR_LAPS', 'TWO_SESSION', 'ONE_SESSION', 'ONE_LAP', 'AGGREGATE', 'KNOCKOUT', 'ELIMINATION', 'SPRINT_RACE'].includes(qualifyingFormat)) invalid('timing.qualifyingFormat', 'unknown source qualifying format');
  equal(timing.qualifyingSessionId, `${eventId}:grand-prix-qualifying`, 'timing.qualifyingSessionId');
  equal(timing.validity, 'unverified', 'timing.validity');
  if (typeof timing.sprintRaceRecorded !== 'boolean' || typeof timing.sprintQualifyingRecorded !== 'boolean') invalid('timing', 'expected explicit sprint source-presence booleans');
  const phasedQualifying = ['KNOCKOUT', 'ELIMINATION', 'SPRINT_RACE'].includes(qualifyingFormat);
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
    const constructorName = consistentName(row.constructorName, constructorId, names, `${path}.constructorName`);
    const driverName = consistentName(row.driverName, driverId, names, `${path}.driverName`);
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
    const driverTiming = record(row.timing, `${path}.timing`);
    const lap = driverTiming.raceFastestLap === null ? null : record(driverTiming.raceFastestLap, `${path}.timing.raceFastestLap`);
    const lapNumber = lap === null || lap.lap === null ? null : integer(lap.lap, `${path}.timing.raceFastestLap.lap`, 0);
    const recordedQualifying = qualifyingTimes(driverTiming.qualifying, `${path}.timing.qualifying`);
    if (!phasedQualifying && recordedQualifying !== null && (recordedQualifying.q1 !== null || recordedQualifying.q2 !== null || recordedQualifying.q3 !== null)) {
      invalid(path, 'Q1–Q3 contradict the source format');
    }
    return {
      driverId, driverName, constructorId, constructorName, driverNumber,
      classification, grid, qualifying, laps, points: points as number | null,
      retirementReason: row.retirementReason === null ? null : text(row.retirementReason, `${path}.retirementReason`),
      timing: {
        qualifying: recordedQualifying,
        raceFastestLap: lap === null ? null : {
          position: position(lap.position, `${path}.timing.raceFastestLap.position`), lap: lapNumber,
          time: recordedTime(lap.time, `${path}.timing.raceFastestLap.time`),
        },
      },
    };
  });
  if (!positions.classification.has(1)) invalid('drivers', 'full GP classification requires a source winner');
  const ranked = projected.flatMap((driver) => driver.timing.raceFastestLap === null ? [] : [driver.timing.raceFastestLap]);
  const rankTimes = new Map<number, number>();
  ranked.sort((a, b) => (a.position.number ?? Infinity) - (b.position.number ?? Infinity));
  let previousTime = 0;
  for (const lap of ranked) {
    if (lap.position.number !== null) {
      if (lap.time !== null) {
        const tiedTime = rankTimes.get(lap.position.number);
        if (tiedTime !== undefined && tiedTime !== lap.time.milliseconds) invalid('timing', 'tied fastest-lap rank contradicts recorded times');
        rankTimes.set(lap.position.number, lap.time.milliseconds);
        if (lap.time.milliseconds < previousTime) invalid('timing', 'fastest-lap rank contradicts recorded times');
        previousTime = lap.time.milliseconds;
      }
    }
  }
  return {
    schemaVersion: 2, revision: text(input.revision, 'revision'), cutoff, qualification: 'local-research-unverified',
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
    timing: {
      qualifyingFormat: qualifyingFormat as ClassificationRevision['timing']['qualifyingFormat'],
      qualifyingSessionId: `${eventId}:grand-prix-qualifying`, validity: 'unverified',
      sprintRaceRecorded: timing.sprintRaceRecorded, sprintQualifyingRecorded: timing.sprintQualifyingRecorded,
      qualifying1: numberedQualifying(timing.qualifying1, 'timing.qualifying1', names),
      qualifying2: numberedQualifying(timing.qualifying2, 'timing.qualifying2', names),
    },
    definitions: strings(input.definitions, 'definitions'), limitations: strings(input.limitations, 'limitations'), drivers: projected,
  };
}
