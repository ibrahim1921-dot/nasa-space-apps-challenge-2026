/** Small "Data source" line shown on every panel. */
export default function SourceLabel({ source }) {
  if (!source) return null;
  return (
    <p className="source-label">
      <span className="source-label__key">Data source:</span> {source}
    </p>
  );
}
