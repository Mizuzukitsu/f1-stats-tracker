import { Fragment, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  decodeResearchInventory,
  selectEvents,
  summarizeInventory,
  type ResearchEvent,
  type ResearchFilters,
  type ResearchInventory,
} from './research';
import { ClassificationWorkspace } from './classification-view';
import './styles.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; inventory: ResearchInventory }
  | { status: 'error'; message: string };


const numberFormat = new Intl.NumberFormat('en');
const dateFormat = new Intl.DateTimeFormat('en', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});

function displayDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? date : dateFormat.format(parsed);
}


function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      setLoad({ status: 'error', message: 'The research inventory is available only in the local development app. No source inventory is included in this build.' });
      return;
    }
    const controller = new AbortController();
    async function loadInventory() {
      try {
        const response = await fetch('/__local/inventory.json', {
          signal: controller.signal,
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error(`The local inventory could not be loaded (HTTP ${response.status}).`);
        }
        const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
        if (contentType !== 'application/json') {
          throw new Error('The local endpoint did not return a JSON inventory.');
        }
        const inventory = decodeResearchInventory(await response.json());
        if (!controller.signal.aborted) setLoad({ status: 'ready', inventory });
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setLoad({
            status: 'error',
            message: error instanceof Error ? error.message : 'The local inventory could not be loaded.',
          });
        }
      }
    }
    void loadInventory();
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setLoad({ status: 'loading' });
    setAttempt((value) => value + 1);
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to research inventory</a>
      <header className="site-header page-width">
        <a className="wordmark" href="#main-content" aria-label="F1 Field Notes home">
          <span className="wordmark-f1">F1<span aria-hidden="true"> /</span></span>
          <span className="wordmark-name">FIELD<br />NOTES</span>
        </a>
        <span className="local-badge"><span aria-hidden="true" />Local research</span>
        <nav aria-label="Main navigation">
          <a href="#inventory">Inventory</a>
          <a href="#classification">Classification</a>
          <a href="#methodology">Methodology</a>
        </nav>
        <div className="theme-control" role="group" aria-label="Color theme">
          <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </header>

      <main id="main-content" className="page-width" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="section-number">00</span> The evidence comes first</p>
            <h1 id="hero-title">Explore the record.<br /><span>Find the evidence gaps.</span></h1>
            <p className="hero-description">Filter saved GP metadata and inspect an imported source classification, with identities and evidence gaps kept explicit. Local research, not verified racing analytics.</p>
          </div>
          <div className="hero-note">
            <span className="note-rule" aria-hidden="true" />
            <p className="eyebrow">Research, not release</p>
            <p>Good questions.<br />Honest boundaries.</p>
            <span>GP race sessions only</span>
          </div>
        </section>

        <aside className="qualification" aria-labelledby="qualification-title">
          <span className="qualification-marker" aria-hidden="true">!</span>
          <div>
            <h2 id="qualification-title">Provisional research. Not verified analytics.</h2>
            <p>Layouts and inclusive overtakes are unverified; reuse rights are unqualified. Source classifications are not sporting verification or publication approval.</p>
          </div>
          <a href="#methodology">Read the boundaries <span aria-hidden="true">↗</span></a>
        </aside>

        {load.status === 'loading' && (
          <section id="inventory" className="load-state" aria-labelledby="loading-title" aria-busy="true">
            <p className="eyebrow">01 / Source inventory</p>
            <h2 id="loading-title">Opening the local notebook…</h2>
            <p role="status">Loading the prepared inventory from this development server. No upstream data request is made.</p>
          </section>
        )}
        {load.status === 'error' && (
          <section id="inventory" className="load-state load-error" aria-labelledby="error-title">
            <p className="eyebrow">01 / Source inventory</p>
            <h2 id="error-title">Local inventory unavailable</h2>
            <p role="alert">{load.message}</p>
            <p>From the project directory, prepare a saved source inventory, then start the local app:</p>
            <pre><code>{'npm run prepare:local -- <inventory-file>\nnpm run dev'}</code></pre>
            <p className="muted">Replace <code>&lt;inventory-file&gt;</code> with your local source inventory path. The prepared projection stays local; a production build does not serve it.</p>
            <button type="button" className="button-primary" onClick={retry}>Retry local inventory <span aria-hidden="true">↻</span></button>
          </section>
        )}
        {load.status === 'ready' && <InventoryWorkspace inventory={load.inventory} />}

        <ClassificationWorkspace />

        <section id="methodology" className="methodology section-space" aria-labelledby="methodology-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow"><span className="section-number">03</span> Methodology</p>
              <h2 id="methodology-title">A record is a starting point.<br />Not a verdict.</h2>
            </div>
            <p className="section-description">The full research product remains blocked by historical coverage, evidence and reuse requirements. This workspace does not relax those gates.</p>
          </div>
          <div className="method-grid">
            <article>
              <span className="method-index">01 / DEFINITION</span>
              <h3>A pass, not a position gain</h3>
              <p>A competitive overtake is a completed on-track pass for race position, including first-lap and restart passes. Exclude pit-stop swaps, lapping and unlapping, penalties, and gains from spins, off-track incidents or clearly impaired cars.</p>
              <p>Grid-to-finish changes and lap-end positions cannot establish an inclusive overtake total.</p>
            </article>
            <article>
              <span className="method-index">02 / COVERAGE</span>
              <h3>Saved does not mean current</h3>
              <p>The inventory describes a saved source snapshot at its stated cutoff, not live timing or today's calendar. “Result recorded” means the source contained a result record; “scheduled future” is the source state at that cutoff.</p>
              <p>Neither status verifies that a race was held, its result, or complete historical coverage. Sprints and qualifying are outside this GP race inventory.</p>
            </article>
            <article>
              <span className="method-index">03 / EVIDENCE</span>
              <h3>Unknown is never zero</h3>
              <p>Imported classifications are source observations, not verified driver-performance analytics. No inclusive-overtake or speed metrics are supplied. Unverified layouts cannot support same-layout comparisons, and a source venue ID is not a layout assignment.</p>
              <p>Inclusive historical evidence and data-specific public-display permissions must be established before verified analytics or publication. Missing evidence is not a measured zero.</p>
            </article>
          </div>
        </section>
      </main>
      <footer className="site-footer page-width">
        <span className="footer-brand">F1 / FIELD NOTES</span>
        <p>Independent local research. Not affiliated with Formula 1.</p>
        <a href="#main-content">Back to top <span aria-hidden="true">↑</span></a>
      </footer>
    </>
  );
}

function InventoryWorkspace({ inventory }: { inventory: ResearchInventory }) {
  const seasons = [...new Set(inventory.events.map((event) => event.season))].sort((a, b) => b - a);
  const defaultSeason = seasons[0] ?? null;
  const [filters, setFilters] = useState<ResearchFilters>({ season: defaultSeason, query: '', state: 'all' });
  const [selected, setSelected] = useState<ResearchEvent | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const inventoryHeading = useRef<HTMLHeadingElement>(null);
  const inspectButton = useRef<HTMLButtonElement | null>(null);
  const events = selectEvents(inventory, filters);
  const summary = summarizeInventory(inventory.events);

  useEffect(() => {
    if (selected) detailHeading.current?.focus();
  }, [selected]);

  function updateFilters(next: ResearchFilters) {
    if (selected && !selectEvents(inventory, next).some((event) => event.eventId === selected.eventId)) {
      if (detailHeading.current?.closest('section')?.contains(document.activeElement)) {
        inventoryHeading.current?.focus();
      }
      setSelected(null);
    }
    setFilters(next);
  }

  function resetFilters() {
    if (document.activeElement?.closest('.empty-state')) inventoryHeading.current?.focus();
    setSelected(null);
    updateFilters({ season: defaultSeason, query: '', state: 'all' });
  }

  function closeDetails() {
    setSelected(null);
    if (inspectButton.current?.isConnected) inspectButton.current.focus();
    else inventoryHeading.current?.focus();
  }

  return (
    <section id="inventory" className="inventory section-space" aria-labelledby="inventory-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow"><span className="section-number">01</span> Source inventory</p>
          <h2 id="inventory-title" ref={inventoryHeading} tabIndex={-1}>Which source records are saved?</h2>
        </div>
        <div className="cutoff-note">
          <span className="eyebrow">Saved-source cutoff</span>
          <strong>{inventory.cutoff}</strong>
          <span>Snapshot only · not live data</span>
        </div>
      </div>


      <form className="filter-bar" onSubmit={(event) => event.preventDefault()} aria-label="Filter source inventory">
        <div className="filter-field season-filter">
          <label htmlFor="season">Season</label>
          <select id="season" value={filters.season ?? 'all'} onChange={(event) => updateFilters({ ...filters, season: event.target.value === 'all' ? null : Number(event.target.value) })}>
            <option value="all">All saved seasons</option>
            {seasons.map((season) => <option key={season} value={season}>{season}</option>)}
          </select>
        </div>
        <div className="filter-field state-filter">
          <label htmlFor="event-state">Source state</label>
          <select id="event-state" value={filters.state} onChange={(event) => updateFilters({ ...filters, state: event.target.value as ResearchFilters['state'] })}>
            <option value="all">All source states</option>
            <option value="result-recorded">Result recorded</option>
            <option value="scheduled-future">Scheduled future at cutoff</option>
          </select>
        </div>
        <div className="filter-field search-filter">
          <label htmlFor="event-search">Find an event</label>
          <input id="event-search" type="search" value={filters.query} placeholder="Grand Prix, circuit or country" onChange={(event) => updateFilters({ ...filters, query: event.target.value })} />
        </div>
        <button type="button" className="reset-button" onClick={resetFilters}>Reset filters <span aria-hidden="true">↺</span></button>
      </form>

      <div className="results-heading">
        <p role="status" aria-live="polite" aria-atomic="true"><strong>{numberFormat.format(events.length)}</strong> {events.length === 1 ? 'event' : 'events'} shown <span className="muted">/ {numberFormat.format(inventory.events.length)} saved</span></p>
        <span>GP race inventory · dates as recorded</span>
      </div>

      {events.length > 0 ? (
        <div className="table-container">
          <table role="table">
            <caption className="sr-only">Filtered source events. States describe the saved source at the cutoff, not verified event outcomes.</caption>
            <thead role="rowgroup"><tr role="row">
              <th scope="col" role="columnheader">Season / Round</th>
              <th scope="col" role="columnheader">Grand Prix / Circuit</th>
              <th scope="col" role="columnheader">Source date</th>
              <th scope="col" role="columnheader">Source state</th>
              <th scope="col" role="columnheader"><span className="sr-only">Event details</span></th>
            </tr></thead>
            <tbody role="rowgroup">
              {events.map((event) => (
                <Fragment key={event.eventId}>
                <tr role="row" className={selected?.eventId === event.eventId ? 'selected-row' : undefined}>
                  <td role="cell" data-label="Season / Round" className="round-cell"><span>{event.season}</span><span className="round-number">R{String(event.round).padStart(2, '0')}</span></td>
                  <td role="cell" data-label="Grand Prix / Circuit" className="event-cell"><strong>{event.grandPrixName}</strong><span>{event.circuitName} <span aria-hidden="true">·</span> {event.country}</span></td>
                  <td role="cell" data-label="Source date" className="date-cell"><time dateTime={event.date}>{displayDate(event.date)}</time></td>
                  <td role="cell" data-label="Source state"><span className={`state-tag ${event.state}`}><span aria-hidden="true" />{event.state === 'result-recorded' ? 'Result recorded' : 'Scheduled future'}</span></td>
                  <td role="cell" className="inspect-cell">
                    <button
                      type="button"
                      className="inspect-button"
                      aria-label={`Inspect ${event.season} ${event.grandPrixName}, round ${event.round}`}
                      aria-controls={selected?.eventId === event.eventId ? 'event-details' : undefined}
                      aria-expanded={selected?.eventId === event.eventId}
                      onClick={(click) => {
                        inspectButton.current = click.currentTarget;
                        setSelected(event);
                        if (selected?.eventId === event.eventId) detailHeading.current?.focus();
                      }}
                    >Inspect <span aria-hidden="true">↗</span></button>
                  </td>
                </tr>
                {selected?.eventId === event.eventId && (
                  <tr className="detail-row" role="row"><td colSpan={5} role="cell">
                        <section id="event-details" className="event-details" aria-labelledby="detail-title">
                          <div className="detail-header">
                            <div><p className="eyebrow">Source record / {selected.season} / Round {selected.round}</p><h3 id="detail-title" ref={detailHeading} tabIndex={-1}>{selected.grandPrixName}</h3><p>{selected.circuitName} · {selected.country}</p></div>
                            <button type="button" className="button-secondary" onClick={closeDetails}>Close details <span aria-hidden="true">×</span></button>
                          </div>
                          <dl className="detail-identities">
                            <div><dt>Source event ID</dt><dd><code>{selected.eventId}</code></dd></div>
                            <div><dt>Source venue ID</dt><dd><code>{selected.venueSourceId}</code></dd></div>
                            <div><dt>Session / source date</dt><dd>Grand Prix race · {displayDate(selected.date)}</dd></div>
                            <div><dt>State at saved cutoff</dt><dd>{selected.state === 'result-recorded' ? 'Result recorded' : 'Scheduled future'}</dd></div>
                          </dl>
                          <div className="evidence-grid">
                            <div><span className="evidence-label">Circuit layout</span><strong>Unverified</strong><p>A venue identity does not establish the layout used at this event.</p></div>
                            <div><span className="evidence-label">Inclusive overtakes</span><strong>Withheld · unverified</strong><p>No verified total under the inclusive definition. This is not a measured zero.</p></div>
                            <div><span className="evidence-label">Public reuse</span><strong>Unqualified</strong><p>Reuse and public-display permissions have not been established.</p></div>
                          </div>
                        </section>
                  </td></tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <span className="eyebrow">No matching source records</span>
          <h3>{inventory.events.length === 0 ? 'This saved inventory is empty.' : 'A different question, perhaps?'}</h3>
          <p>{inventory.events.length === 0 ? 'Prepare a nonempty source inventory to explore event identities. No observations have been invented.' : 'Try another Grand Prix, circuit or country, choose all seasons, or reset to the latest saved season.'}</p>
          <button type="button" className="button-secondary" onClick={resetFilters}>Reset filters</button>
        </div>
      )}
      <div className="snapshot" aria-label="Coverage snapshot from the entire saved inventory">
        <div className="snapshot-intro"><h3>Whole saved inventory</h3><p>Independent of the filters above.<br />Not verified sporting metrics.</p></div>
        <div className="snapshot-value"><strong>{numberFormat.format(summary.resultRecorded)}</strong><span>Source result records</span></div>
        <div className="snapshot-value"><strong>{numberFormat.format(summary.scheduledFuture)}</strong><span>Future scheduled at cutoff</span></div>
        <div className="snapshot-value"><strong>{numberFormat.format(summary.seasons)}</strong><span>Seasons represented</span></div>
      </div>


      <details className="limitations" open>
        <summary>Source limitations <span className="muted">/ Read before interpreting</span></summary>
        <p>Qualification: provisional source inventory, not release approved. Cutoff: <strong>{inventory.cutoff}</strong>. Counts reflect source records, not audited coverage of held events.</p>
        {inventory.limitations.length > 0 ? <ul>{inventory.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul> : <p>No additional source-specific limitations were supplied. This does not establish completeness or approval.</p>}
      </details>
    </section>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');
createRoot(root).render(<App />);
