/** "Data source" disclosure on every panel (collapsible: teammate change 26f3be5). `simulated` adds a "Simulated" tag. */
export default function SourceLabel({ source, simulated = false }) {
  if (!source) return null;
  return (
    <details className="source-label">
      <summary className="source-label__key">
        Data source{simulated && <span className="prov__sim source-label__sim">Simulated</span>}
      </summary>
      <p>{source}</p>
    </details>
  );
}
