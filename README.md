# F1 Field Notes

A local React/TypeScript research workspace for inspecting saved Formula 1 event identities and source-qualification gaps. Unofficial, noncommercial, read-only; no accounts, trackers or upstream requests from visitors.

## Local app-base milestone

Implemented: source-inventory preparation, season/state/text filtering, event inspection, explicit withheld evidence states, light/dark themes, keyboard focus handling and responsive presentation.

This is **not the completed analytics dashboard or a public-launch candidate**. The saved product specification and tickets remain the authoritative full-product scope. Inclusive overtaking evidence, full historical layout/metric/calendar verification and applicable reuse/public-display rights remain unresolved. No ticket or publication gate is marked complete by this app base. No overtake, speed or driver-performance values are invented or derived from net positions.

## Run locally

Use Node 22.12+ and npm. Install the exact locked dependencies:

```sh
npm ci
npm run prepare:local -- /path/to/local/historical-inventory.json
npm run dev
```

The preparation input is the actual provisional Jolpica inventory schema from the saved research folder, not an arbitrary result API response. It must retain its source records, summary and limitations. The command validates source identities, duplicate events, GP-only sessions, cutoff-relative states and qualification markers before atomically writing a minimal projection to ignored `.local-data/inventory.json`. A failed preparation leaves the previous prepared file intact. No source files are changed or downloaded.

For this retained integration worktree, the existing export is available with:

```sh
npm run prepare:local -- ../f1-stats-tracker/local/historical-inventory.json
```

The default URL is `http://127.0.0.1:5173/`. If occupied, choose a port explicitly:

```sh
npm run dev -- --port 5187
```

Without a prepared file, the app shows a setup error with a retry action. After successful preparation, retry without restarting the server. Theme and filters are session-only; there is no URL-sharing or saved-dashboard claim at this milestone.

## Data and publication safety

- The prepared metadata endpoint `/__local/inventory.json` exists **only in the loopback-bound development server**. It serves the local projection, not raw results, winner data, lap evidence or pass ledgers.
- The Vite browser root is `app/`; filesystem access is restricted to that root. Raw source folders stay outside it. Do not expose the development server to a network.
- Production code does not request the local endpoint. `npm run build` creates an application shell in `dist/` with an explicit local-inventory-unavailable state, not a publishable historical dataset. `npm run preview` can inspect that deliberate data-free behavior.
- `.local-data/`, `local/`, dependencies, output, environment files and logs are ignored. Keep candidate files, credentials, private provenance and permission agreements out of Git and public assets.
- “Result recorded” means the saved source contained a result record; it does not verify the result, held-event calendar or coverage. “Scheduled future” is relative to the **saved cutoff**, not the current date. GP races are isolated from qualifying and sprints.
- An unverified inclusive overtake total is withheld, never a measured zero. Venue identity does not establish the circuit layout. Public access is not reuse approval.
- Competitive overtakes include first-lap/restart passes and exclude pit swaps, lapping/unlapping, penalties and noncompetitive incident/impaired-car gains. Existing candidate sources have not established that complete series.

No deployment or paid service is configured. The GitHub repository is private; committing or pushing this local app base does not establish verified analytics, public-launch readiness or completion of the full product.

## Structure

- `app/src/research.ts`: research projection, filter selection and source-record counts. This does not implement the full product's Publication or Analysis contracts.
- `scripts/prepare-local.ts`: local input/atomic-output command.
- `app/src/main.tsx`, `app/src/styles.css`: browser experience and presentation.
- `vite.config.ts`: app-root isolation, development-only inventory serving and static build.

## Verification

```sh
npm run typecheck
npm run build
npm run preview
```

Exercised for this milestone: preparation of the actual saved snapshot; malformed/duplicate/session/date rejection and preservation of previous output; filter isolation; event inspection and focus restoration; empty-search/reset; missing-inventory/retry; desktop and 390px mobile in both themes; raw-source filesystem denial; production data exclusion. Smoke scenarios used temporary files, not synthetic production assets. These checks establish local app-base behavior, not historical accuracy, source rights or completion of the full pipeline.
