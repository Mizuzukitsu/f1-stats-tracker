# F1 Field Notes

A local React/TypeScript research workspace for inspecting saved Formula 1 event identities, full GP source classifications, recorded timing evidence and source-qualification gaps. Unofficial, noncommercial, read-only; no accounts, trackers or upstream requests from visitors.

## Local app-base milestone

Implemented: source-inventory preparation with shared producer/browser validation, season/state/text filtering, inline event inspection, explicit withheld evidence states, light/dark themes, keyboard focus handling and responsive presentation. Controls precede the clearly separate whole-inventory snapshot.

This is **not the completed analytics dashboard or a public-launch candidate**. The saved product specification and tickets remain the authoritative full-product scope. Inclusive overtaking evidence, full historical layout/metric/calendar verification and applicable reuse/public-display rights remain unresolved. No ticket or publication gate is marked complete by this app base. No overtake, speed or driver-performance values are invented or derived from net positions.

## Run locally

Use Node 22.12+ and npm. Install the exact locked dependencies:

```sh
npm ci
npm run prepare:local -- /path/to/local/historical-inventory.json
npm run dev
```

The preparation input is the actual provisional Jolpica inventory schema from the saved research folder, not an arbitrary result API response. It must retain its source records, summary and limitations. The command validates source identities, duplicate events, GP-only sessions, cutoff-relative states and qualification markers before atomically writing a minimal projection to ignored `.local-data/inventory.json`. A failed preparation leaves the previous prepared file intact. No source files are changed or downloaded.

The browser decodes that projection with the same calendar-date, identity, uniqueness, session, cutoff/state and qualification rules as preparation. An externally replaced contradictory projection is rejected, not rendered. Source-evidence reconciliation remains preparation-only.

For this retained integration worktree, the existing export is available with:

```sh
npm run prepare:local -- ../f1-stats-tracker/local/historical-inventory.json
```

The default URL is `http://127.0.0.1:5173/`. If occupied, choose a port explicitly:

```sh
npm run dev -- --port 5187
```

Without a prepared file, the app shows a setup error with a retry action. After successful preparation, retry without restarting the server. Theme and filters are session-only; there is no URL-sharing or saved-dashboard claim at this milestone.

Inspection appears immediately after its event row/card. It remains open only while that event matches every filter; excluding it clears the selection, and reset always clears it. Closing restores focus to the inspect control; if active details disappear with their row, focus recovers to the inventory heading without stealing focus from a filter being edited. Whole-inventory counts do not change with filters.

## Inspect a full GP from F1DB

Implemented: **issue #15 section 1 and the recorded-evidence portion of section 2**. Section 2 remains incomplete: fastest-valid-lap qualification is blocked, and sections 3–7 are not delivered. The existing Jolpica metadata commands remain independent.

```sh
npm run import:f1db -- 2015 1
npm run dev -- --port 5190
```

Open `http://127.0.0.1:5190/#classification`. The importer downloads the explicitly pinned [F1DB v2026.20.0 release](https://github.com/f1db/f1db/releases/tag/v2026.20.0), not `latest`, and selects the supplied season/round. Node 22.12+ and the platform `tar` executable are required. No database, extra package or credentials are needed.

The command validates the package version and bundled schema identity, then reconciles the GP's entire `raceResults` against separate `startingGridPositions` and `qualifyingResults` by driver and constructor. For source-declared `SPRINT_RACE` weekends, embedded/grid qualification fields refer to sprint results: they are checked against `sprintRaceResults`, while displayed qualifying positions come only from the separate GP qualifying session. Cross-session differences are not treated as conflicting observations of the same session. Duplicate/unknown identities, inconsistent same-session positions, missing required fields or participants, incomplete result order, absent winner, bad HTTP responses, invalid archives and malformed UTF-8/JSON are rejected. Only a complete accepted projection atomically replaces `.local-data/classification.json`; failures leave the previous usable classification and metadata inventory unchanged.

Every attempt retains private evidence under `.local-data/f1db/<printed-id>/`: the exact original archive, licence and README response bytes, extracted package/schema/JSON, selected source event, reconciliation observations, prepared projection and a manifest with pinned URLs, acquisition times and SHA-256 hashes. Rejected attempts retain whatever was acquired and a rejection reason; interrupted attempts can leave partial evidence but cannot publish a partial revision. Candidates are never overwritten. Evidence files are owner-read-only (`0400`), candidate directories owner-read/execute (`0500`); ordinary reruns create new candidates rather than modifying sealed evidence.

After import, use **Reload GP classification** (or **Retry GP classification** after an error), without restarting the server. A missing metadata inventory does not prevent GP inspection, and a missing classification does not disable metadata inspection. To revisit another event or recheck the pinned source, rerun the command with its season/round. For a correction, retain and compare the prior candidate's manifest/reconciliation before accepting the new observations; source corrections are not independently verified or automatically approved for publication. A new source release requires an explicit code/schema review, not a moving download URL.

The current prepared classification uses **projection schema 2**. Reimport to replace a schema-1 projection; the browser deliberately rejects the obsolete schema rather than silently presenting it without timing evidence. Previously sealed candidates remain unchanged. The GP view adds separate qualifying and race-lap tables, raw time strings with milliseconds, phase/participant coverage and explicit unknowns. Timing comes from the same pinned archive and revision as classification, not another browser request or provider.

### Source-to-field qualification

Observed download: release `v2026.20.0`, published 2026-11-09; `f1db-json-single.tgz` contains `package/data/f1db.json` and schema `https://www.f1db.com/schema/v6.5.0/single/f1db.schema.json`. Acquisition is three serial HTTP downloads (archive, pinned licence, pinned README); the static release archive has no API pagination or per-visitor dependency. A network, HTTP or parsing failure stops the import without retries.

| Browser observation | Retained F1DB evidence | Qualification / meaning |
| --- | --- | --- |
| Season, event, named GP, venue, session | `seasons`, `races.id/year/round`, `grandsPrix`, `circuits`; namespaced source IDs and GP-race session identity | Source identity reconciliation, not independent historical verification |
| Driver and constructor participation | `raceResults.driverId/constructorId`, joined to source registries | Constructor at this GP; racing number is not driver identity |
| Classification and status | `positionNumber`, exact `positionText`, separate `reasonRetired` | DNF/DNS/DNP/DSQ and other source codes retained; numeric classification does not prove finished status |
| Actual grid and qualifying position | Embedded result positions checked against separate grid/qualifying rows and the declared sprint format where applicable | GP qualifying is never replaced by sprint classification; `PL` has no numbered grid position; source-null omissions remain unknown |
| Laps and GP points | `raceResults.laps/points` | Completed-lap counts and GP points, not season totals; explicit zero retained, source-null unknown |
| Layout label | `races.circuitLayoutId`, checked against the source circuit's layout IDs | Source claim only; historical geometry and same-layout eligibility remain unverified |
| GP qualifying phases and source result time | `qualifyingResults.q1/q2/q3/time` and matching `*Millis`; separate `qualifying1Results` / `qualifying2Results` | Recorded observations, validity unverified; numbered sessions are not knockout Q1/Q2; AGGREGATE and FOUR_LAPS result times are not single laps |
| GP per-driver fastest laps | `fastestLaps.positionNumber/positionText/lap/time/timeMillis`, joined to GP driver/constructor identities | Includes non-winners and retirees; source-ranked candidate only, not a verified fastest-valid baseline |
| Speeds and inclusive overtakes | Not calculated | Unavailable/withheld, never inferred from classification or substituted from sprints |

The acquisition cutoff is the UTC download date, not an archival-as-of claim. The browser receives one coherent revision with definitions, units, limitations and source hashes; it rejects malformed replacement projections through the same decoder as the importer. It never receives the raw archive or private candidate files.

**Attribution and rights:** F1DB and its contributors declare [CC BY 4.0](https://raw.githubusercontent.com/f1db/f1db/v2026.20.0/LICENSE). The prepared record credits F1DB, links the source and licence, identifies conversion to a single-event projection and disclaims endorsement. Retain attribution, licence/warranty notices and modification information. This source statement covers rights the licensor can grant; it is not independent clearance of all upstream, trademark or public-display conditions. No Jolpica observations are combined into this classification revision. Applicable combination/reuse conditions remain to be assessed before later sections or publication.

Actual-source proof: `npm run import:f1db -- 2015 1` imported 20 Australian GP result entries and reconciled 17 actual-grid and 18 qualifying rows. The original archive SHA-256 is `ca32fd3b1f2a82ab7f23d977b8ea34419c4734d61787f61cbeae82c07ffe24c8`; all nine retained evidence hashes were checked. `npm run import:f1db -- 2021 10` also imported a real sprint-format British GP with 20 entries; browser inspection confirmed its sprint-derived grid and separate GP qualifying positions remain distinct. Actual UI checks covered retirement reasons, recorded zero laps, source-null points, DNS/DNP omissions, desktop/mobile and both themes, keyboard reload/focus and narrow provenance. Raw-archive access was denied, metadata remained usable, and the production browser made no local-data requests or displayed source rows. These are real local-research checks, not a complete historical audit; candidates and screenshots remain local.

**Still blocked:** issue #15 sections 2–7, qualified publication under #3/#4, historical layout/length verification, inclusive overtaking history, source-combination/reuse clearance and the three-season analytical handoff. No chart, verified speed, complete-history or public-launch claim is made here.

### Recorded timing evidence and the remaining validity gate

```sh
npm run import:f1db -- 2021 10
# Reload GP classification: GP Q1/Q2/Q3 and per-driver race laps, separate from the sprint.
npm run import:f1db -- 2005 3
# Reload: historical AGGREGATE result plus its separate numbered qualifying sessions.
```

Source timing fields are present in the pinned F1DB archive. The real British GP contains Q1/Q2/Q3 times for 20/15/10 drivers and 19 per-driver fastest-lap rows among 20 GP classifications. The absent driver has a recorded zero completed laps; that is shown alongside the absent row, not converted into a zero-time lap or a verified absence reason. The non-winner source-ranked candidate and the winner's different lap remain inspectable. For the real 2005 Bahrain GP, the combined qualifying result is shown separately from `qualifying1Results` and `qualifying2Results`; it is never treated as a single lap or relabelled Q1/Q2. Other non-phase formats retain source result times; unknown/null phase times do not prove elimination or invalidity.

Import validation also rejects unknown/duplicate timing identities, contradictory same-session constructor links, mismatched time text/milliseconds, nonpositive recorded durations and inconsistent fastest-lap ranks/markers. Seconds-only, minute-prefixed and hour-prefixed durations retain their exact source strings. Equal fastest-lap ranks retain every tied driver; known times for the same rank must agree. Source race-lap indices are not assumed to be bounded by an individual driver's completed-lap count. The source marker is derived from the rank, not independent verification. Missing timing rows and source-null times/lap numbers remain inspectable gaps; positive or unknown completed-lap drivers without lap rows are counted explicitly. Conflicting observations stop the import, retaining rejection evidence and the previous revision. No provider is silently preferred or averaged.

**Why no new Jolpica timing path:** the sampled F1DB events already supply the required recorded fields, and redundant requests would not resolve validity. The pinned [F1DB reader](https://github.com/f1db/f1db/blob/v2026.20.0/build-logic/src/main/kotlin/com/f1db/plugin/reader/F1DBReader.kt), [qualifying converter](https://github.com/f1db/f1db/blob/v2026.20.0/build-logic/src/main/kotlin/com/f1db/plugin/reader/databind/QualifyingResultConverter.kt), [fastest-lap converter](https://github.com/f1db/f1db/blob/v2026.20.0/build-logic/src/main/kotlin/com/f1db/plugin/reader/databind/FastestLapConverter.kt) and retained schema establish recorded fields, not a complete deleted-lap/correction/eligibility policy. The [official British fastest-laps table](https://www.formula1.com/en/results/2021/races/1072/great-britain/fastest-laps) corroborates the source ranking; this inspection is not a retained independent validity audit.

Jolpica's [results](https://github.com/jolpica/jolpica-f1/blob/main/docs/endpoints/results.md), [qualifying](https://github.com/jolpica/jolpica-f1/blob/main/docs/endpoints/qualifying.md) and [laps](https://github.com/jolpica/jolpica-f1/blob/main/docs/endpoints/laps.md) responses do not expose complete race-lap deletion/validity evidence. At inspected source revision [`0fdc5a2`](https://github.com/jolpica/jolpica-f1/blob/0fdc5a2584d6aae670d7b7b0188542493de2e437/jolpica_api/ergastapi/views.py), qualifying excludes deleted laps, but the GP fastest-lap query does not apply that filter. This is not proof that a particular recorded lap is invalid; its validity is **unverified**.

If a later demonstrated field gap warrants Jolpica, its [access documentation](https://github.com/jolpica/jolpica-f1/blob/main/docs/README.md) requires a versioned identifying User-Agent; [published unauthenticated limits](https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md) are currently 4 requests/second and 500/hour, shared by IP. A new timing importer must retain original bytes, request identities, times, hashes and [terms](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md), complete nested-result pagination, and explicit cross-source/session reconciliation. No atomic multi-page snapshot is documented: stable totals alone cannot prove that data did not change. That importer and its pagination regressions are **not implemented here**; the static F1DB artifact has no pages, and the existing metadata-only acquisition is not a timing substitute.

**To unblock a fastest-valid baseline:** retain authoritative final timing and correction/deletion/eligibility evidence for the selected event, account for every eligible participant or omission, and resolve conflicting observations. Until then the browser always says **Fastest-valid baseline withheld**. No fastest-valid time, lap-average speed or analytical comparison is claimed. This explicitly approved recorded-evidence delivery does not complete section 2 or unblock section 3.

New runtime proof used actual acquisition → schema-2 preparation → browser inspection for British 2021 and Bahrain 2005. The British view was inspected at 1440px and 390px in both themes, with Q1–Q3, non-winner lap evidence, absent/zero-lap disposition, source references and keyboard reload/focus; no horizontal overflow or uncaught browser errors was observed. The Bahrain narrow view exposed combined and numbered sessions separately. An attempted 2005 Australian import rejected Kimi Räikkönen's conflicting embedded pit-lane versus separate numbered grid observations and preserved the prior British revision; that source conflict remains unresolved, not patched by preference. Deterministic real-CLI regressions cover timing contradictions, partial coverage, GP/sprint isolation, aggregate-session separation and prior-file preservation; browser regressions cover phase/lap interpretation and rejection of contradictory timing replacements. These checks are not historical or rights clearance.

The schema-2 2015 Australian import/browser path was also exercised: 18 qualifying rows, 13 per-driver lap rows, a timed retiree, and DNS/DNP source-null omissions remained distinct. All nine retained evidence hashes matched for each of the three successful candidates; each archive matched the pinned SHA-256 above.

Review corrections were exercised through the actual command and browser: 2020 Sakhir's seconds-only qualifying/race times, 2025 Japan's source lap index exceeding a driver's completed-lap count, 1959 Britain's tied fastest-lap candidates, and 2003 Hungary's first-qualifying participant replaced before the GP. Numbered qualifying sessions have independent prepared rosters and tables, with source driver/constructor IDs; they do not invent GP participation for a replaced driver. CLI regressions failed before these corrections and passed afterward. Unknown sporting validity remains unknown even when a duration parses or a source rank is consistent.

## Refresh source observations locally

To acquire the selected Jolpica calendar and position-1 result evidence instead of using the saved export:

```sh
npm run acquire:local -- 2026-11-14
npm run prepare:local -- .local-data/source-inventory-<printed-id>.json
```

Pass an explicit real cutoff date from 2015 onward, no later than today. The command requests each season from 2015 through the cutoff year, serially with at least one second between requests. It follows every calendar/winner page, checking offsets, stable totals, page limits, unique season/round keys and result/calendar identity agreement. HTTP errors, malformed/truncated pages, orphaned results, past events without results and results beyond the cutoff stop acquisition rather than inventing a held/cancelled classification or zero. A past cutoff is not an archival as-of query: current source results beyond it are rejected.

Successful acquisition atomically saves a new owner-readable `.local-data/source-inventory-<id>.json`, printing its absolute path. Each candidate retains raw response bodies with SHA-256 hashes, source URLs, HTTP status and retrieval times. Previous candidates and `.local-data/inventory.json` are untouched; run preparation explicitly when ready. Keep earlier candidates to investigate corrections, independently reconcile changed facts, then prepare the chosen candidate. Matching pagination totals do not detect every upstream edit during acquisition.
Malformed UTF-8 is rejected before JSON parsing or saving, so retained response text cannot silently differ from the bytes covered by its SHA-256 hash.

This command does **not** acquire full classifications, qualifying/lap evidence, sprint results or inclusive overtakes; infer cancellations; certify canonical identities/layouts; or grant publication rights. It produces the same provisional input schema consumed by preparation. Jolpica's [data terms](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md) declare CC BY-NC-SA 4.0; applicable attribution, modification/share-alike and upstream conditions still need assessment before public reuse. Raw candidates stay local and outside the browser root.


## Data and publication safety

- Prepared endpoints `/__local/inventory.json` (metadata) and `/__local/classification.json` (single-GP research classification) exist **only in the loopback-bound development server**. Neither serves raw archives, private evidence, lap telemetry or pass ledgers.
- The Vite browser root is `app/`; filesystem access is restricted to that root. Raw source folders stay outside it. Do not expose the development server to a network.
- Production code does not request the local endpoint. `npm run build` creates an application shell in `dist/` with an explicit local-inventory-unavailable state, not a publishable historical dataset. `npm run preview` can inspect that deliberate data-free behavior.
- `.local-data/`, `local/`, dependencies, output, environment files and logs are ignored. Keep candidate files, credentials, private provenance and permission agreements out of Git and public assets.
- “Result recorded” means the saved source contained a result record; it does not verify the result, held-event calendar or coverage. “Scheduled future” is relative to the **saved cutoff**, not the current date. GP races are isolated from qualifying and sprints.
- An unverified inclusive overtake total is withheld, never a measured zero. Venue identity does not establish the circuit layout. Public access is not reuse approval.
- Competitive overtakes include first-lap/restart passes and exclude pit swaps, lapping/unlapping, penalties and noncompetitive incident/impaired-car gains. Existing candidate sources have not established that complete series.

No deployment or paid service is configured. Committing or pushing this local app base does not establish verified analytics, public-launch readiness or completion of the full product.

## Structure

- `app/src/research.ts`: shared projected-inventory decoder, source-evidence preparation, filter selection and source-record counts. This does not implement the full product's Publication or Analysis contracts.
- `scripts/prepare-local.ts`: local input/atomic-output command.
- `scripts/acquire-local.ts`: serial, paginated local Jolpica acquisition with retained evidence and immutable candidate files.
- `scripts/import-f1db.ts`, `app/src/classification.ts`: pinned F1DB acquisition, source reconciliation, immutable evidence and shared prepared-classification validation.
- `app/src/classification-view.tsx`: independent GP inspection, explicit unknown/status distinctions and provenance.
- `app/src/main.tsx`, `app/src/styles.css`: browser experience and presentation.
- `vite.config.ts`: app-root isolation, development-only inventory serving and static build.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
npm run preview
```

The deterministic Node suite covers projected-data rejection, source reconciliation, atomic-output preservation and preparation recovery. The Chromium acceptance suite exercises filter/inspection/reset/focus transitions and contradictory-projection rejection/retry at desktop and 390px widths. Browser fixtures are isolated synthetic metadata, never sporting observations or production data.

Acquisition regressions run the real commands in isolated temporary projects, replacing only external HTTP and elapsed time. They cover paginated input through preparation, interrupted/contradictory source rejection, prior-file preservation and correction evidence retention. A separate actual-source run acquired 24 pages and prepared 256 source events (253 result-recorded, three future-scheduled) at cutoff 2026-11-14; these counts are source observations, not verified held-event or inclusive-overtake coverage.

Also exercised with the actual saved snapshot: prepare-and-retry after a missing local file; retained/excluded selection transitions; desktop/mobile in both themes; adjacent inspection and unchanged font/theme tokens; raw-source HTTP 403; built-asset exclusion scan; production preview without local-inventory requests. These checks establish local research behavior, not historical accuracy, source rights or completion of the full pipeline.
