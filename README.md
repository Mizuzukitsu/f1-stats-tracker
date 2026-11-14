# F1 Field Notes

A local React/TypeScript research workspace for inspecting saved Formula 1 event identities and source-qualification gaps. Unofficial, noncommercial, read-only; no accounts, trackers or upstream requests from visitors.

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

- The prepared metadata endpoint `/__local/inventory.json` exists **only in the loopback-bound development server**. It serves the local projection, not raw results, winner data, lap evidence or pass ledgers.
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
