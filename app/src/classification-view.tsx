import { useEffect, useState } from 'react';
import {
  decodeClassification,
  type ClassificationPosition,
  type ClassificationRevision,
} from './classification';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; classification: ClassificationRevision }
  | { status: 'error'; message: string };

function Position({ position }: { position: ClassificationPosition }) {
  return <strong>{position.text ?? 'Unknown (source null)'}</strong>;
}

export function ClassificationWorkspace() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      setLoad({ status: 'error', message: 'GP classifications are available only in the local development app. No classification data is included in this build.' });
      return;
    }
    const controller = new AbortController();
    async function loadClassification() {
      try {
        const response = await fetch('/__local/classification.json', {
          signal: controller.signal,
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`The local classification could not be loaded (HTTP ${response.status}).`);
        const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
        if (contentType !== 'application/json') throw new Error('The local endpoint did not return a JSON classification.');
        const classification = decodeClassification(await response.json());
        if (!controller.signal.aborted) setLoad({ status: 'ready', classification });
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setLoad({ status: 'error', message: error instanceof Error ? error.message : 'The local classification could not be loaded.' });
        }
      }
    }
    void loadClassification();
    return () => controller.abort();
  }, [attempt]);

  function reload() {
    if (load.status === 'loading') return;
    setLoad({ status: 'loading' });
    setAttempt((value) => value + 1);
  }

  return (
    <section id="classification" className="classification section-space" aria-labelledby="classification-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow"><span className="section-number">02</span> GP classification / local research</p>
          <h2 id="classification-title">Inspect the imported Grand Prix.</h2>
        </div>
        <button type="button" className="button-secondary" onClick={reload} aria-disabled={load.status === 'loading'}>
          {load.status === 'error' ? 'Retry GP classification' : 'Reload GP classification'}
        </button>
      </div>
      {load.status === 'loading' && <p role="status">Loading the prepared GP classification. No upstream data request is made.</p>}
      {load.status === 'error' && (
        <div className="load-state classification-unavailable">
          <h3>Local classification unavailable</h3>
          <p role="alert">{load.message}</p>
          <p>Import a pinned F1DB Grand Prix from the project directory, then retry. The metadata inventory above is independent.</p>
          <pre><code>npm run import:f1db -- &lt;season&gt; &lt;round&gt;</code></pre>
          <p className="muted">Only the prepared projection is read here, never the source archive. Local research is not publication approval.</p>
        </div>
      )}
      {load.status === 'ready' && <ClassificationRecord classification={load.classification} />}
    </section>
  );
}

function ClassificationRecord({ classification }: { classification: ClassificationRevision }) {
  const { event, source, drivers } = classification;
  return (
    <>
      <div className="classification-event">
        <p className="eyebrow">{event.season} / Round {event.round} / Grand Prix race</p>
        <h3>{event.name}</h3>
        <p>{event.venueName} · <time dateTime={event.date}>{event.date}</time></p>
      </div>
      <aside className="qualification" aria-label="Classification qualification">
        <span className="qualification-marker" aria-hidden="true">!</span>
        <div>
          <h3>Source classification. Local research, unverified.</h3>
          <p>Qualification: <code>{classification.qualification}</code>. Sporting verification and public-reuse clearance are not established. Source result codes and retirement reasons are separate observations; a numeric classification does not prove a finish.</p>
        </div>
      </aside>
      <dl className="detail-identities classification-identities">
        <div><dt>Source event ID</dt><dd><code>{event.eventId}</code></dd></div>
        <div><dt>Source season ID</dt><dd><code>{event.seasonId}</code></dd></div>
        <div><dt>Source Grand Prix ID</dt><dd><code>{event.grandPrixId}</code></dd></div>
        <div><dt>Source venue ID</dt><dd><code>{event.venueId}</code></dd></div>
        <div><dt>Source session ID / type</dt><dd><code>{event.sessionId}</code><br />{event.sessionType}</dd></div>
        <div><dt>Source-only layout claim</dt><dd><code>{event.layoutSourceId ?? 'Unknown / not supplied'}</code><br />{event.layoutQualification} · not verified geometry or a same-layout assignment</dd></div>
        <div><dt>Acquisition cutoff</dt><dd>{classification.cutoff}<br />Acquisition date, not an archival-as-of claim</dd></div>
        <div><dt>Prepared revision / schema</dt><dd><code>{classification.revision}</code><br />Projection schema {classification.schemaVersion}</dd></div>
      </dl>
      <div className="results-heading">
        <p role="status"><strong>{drivers.length}</strong> source driver classifications</p>
        <span>Full GP result · source display order</span>
      </div>
      <p id="classification-table-notes" className="classification-notes">Actual grid and qualifying are distinct source positions. PL means pit-lane start, not a numbered grid position. Unknown is not zero; a recorded 0 remains 0. A missing retirement reason does not establish finished status.</p>
      <div className="table-container classification-table">
        <table role="table" aria-describedby="classification-table-notes">
          <caption className="sr-only">{event.season} {event.name} source GP classification, actual grid, qualifying and retirement reasons. Unverified local research.</caption>
          <thead role="rowgroup"><tr role="row">
            <th scope="col" role="columnheader">Driver / Constructor</th>
            <th scope="col" role="columnheader">Classification</th>
            <th scope="col" role="columnheader">Actual grid</th>
            <th scope="col" role="columnheader">Qualifying</th>
            <th scope="col" role="columnheader">Laps</th>
            <th scope="col" role="columnheader">GP points</th>
            <th scope="col" role="columnheader">Source retirement reason</th>
          </tr></thead>
          <tbody role="rowgroup">{drivers.map((driver) => (
            <tr key={driver.driverId} role="row">
              <td role="cell" data-label="Driver / Constructor" className="classification-driver">
                <strong>{driver.driverName}</strong>
                <code>{driver.driverId}</code>
                <span>Car number: {driver.driverNumber ?? 'Unknown / not supplied'}</span>
                <span>{driver.constructorName}</span>
                <code>{driver.constructorId}</code>
              </td>
              <td role="cell" data-label="Classification"><Position position={driver.classification} /></td>
              <td role="cell" data-label="Actual grid"><Position position={driver.grid} /></td>
              <td role="cell" data-label="Qualifying"><Position position={driver.qualifying} /></td>
              <td role="cell" data-label="Laps">{driver.laps ?? 'Unknown'}</td>
              <td role="cell" data-label="GP points">{driver.points ?? 'Unknown'}</td>
              <td role="cell" data-label="Source retirement reason">{driver.retirementReason ?? 'Unknown / not recorded'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="evidence-grid classification-evidence">
        <div><span className="evidence-label">Inclusive overtakes</span><strong>Withheld · unverified</strong><p>Grid and classification differences are not on-track pass counts.</p></div>
        <div><span className="evidence-label">Lap times / speeds</span><strong>Unavailable in this projection</strong><p>Source lap counts are not lap times or speed observations.</p></div>
        <div><span className="evidence-label">Historical layout / public reuse</span><strong>Unqualified</strong><p>A source layout label and source licence do not establish historical geometry or publication clearance.</p></div>
      </div>
      <details className="limitations" open>
        <summary>Classification definitions and limitations</summary>
        <h3 className="classification-subheading">Definitions</h3>
        <ul>{classification.definitions.map((definition, index) => <li key={index}>{definition}</li>)}</ul>
        <h3 className="classification-subheading">Limitations</h3>
        <ul>{classification.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
      </details>
      <details className="limitations classification-provenance" open>
        <summary>Classification provenance and revision</summary>
        <dl className="detail-identities">
          <div><dt>Source / pinned version</dt><dd>{source.name} {source.version}</dd></div>
          <div><dt>Acquired at (UTC)</dt><dd><time dateTime={source.acquiredAt}>{source.acquiredAt}</time></dd></div>
          <div><dt>Archive SHA-256</dt><dd><code>{source.sha256}</code></dd></div>
          <div><dt>Source licence</dt><dd>{source.licence.identifier}<br /><code>{source.licence.url}</code></dd></div>
          <div><dt>Source release URL</dt><dd><code>{source.url}</code></dd></div>
          <div><dt>Source schema ID</dt><dd><code>{source.schemaId}</code></dd></div>
          <div><dt>Licence SHA-256</dt><dd><code>{source.licence.sha256}</code></dd></div>
          <div><dt>Attribution</dt><dd>{source.attribution}</dd></div>
        </dl>
        <p>Prepared revision: <strong>{classification.revision}</strong>. Hashes identify retained evidence; they are not independent verification. Raw archives and rights evidence remain outside the browser.</p>
      </details>
    </>
  );
}
