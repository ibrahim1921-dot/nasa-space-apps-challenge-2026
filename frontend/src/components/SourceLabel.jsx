/** Small "Data source" line shown on every panel. */
export default function SourceLabel({ source }) {
  if (!source) return null;
  return (
    <details className="source-label">
      <summary className="source-label__key">Data source</summary>
      <p>{source}</p>
    </details>
  );
}
