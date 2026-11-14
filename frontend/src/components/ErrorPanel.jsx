'use client';

export default function ErrorPanel({ message = 'Could not load this data.', onRetry }) {
  return (
    <div className="error-panel" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
