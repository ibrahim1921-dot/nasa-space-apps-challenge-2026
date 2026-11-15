'use client';

// One countermeasure: an image slot, a description, an optional video link and its source.
// Images under public/health-education/ are placeholders, labelled as such; never NASA imagery.

import { TODO } from '../content/knowledge.js';

const isTodo = (v) => !v || v === TODO;

export default function CountermeasureCard({ title, description, image, imageAlt = 'Placeholder image', video = null, source = null }) {
  const placeholder = !image || image.includes('/placeholder');
  return (
    <article className="cm-card">
      <figure className="cm-card__media">
        {image ? <img src={image} alt={imageAlt} loading="lazy" width="320" height="180" /> : <div className="cm-card__empty">No image</div>}
        {placeholder && <figcaption className="cm-card__caption">Placeholder image</figcaption>}
      </figure>
      <div className="cm-card__body">
        <h4 className={`cm-card__title${isTodo(title) ? ' is-todo' : ''}`}>{isTodo(title) ? TODO : title}</h4>
        <p className={isTodo(description) ? 'is-todo' : undefined}>{isTodo(description) ? TODO : description}</p>
        {video && (
          <p>
            <a href={video.url} target="_blank" rel="noopener noreferrer" className="cm-card__link">
              Watch: {video.label ?? 'video'} <span className="sr-only">(opens in a new tab)</span>
            </a>
          </p>
        )}
        <p className="muted cm-card__source">
          Source: {source ? source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a> : source.name : <span className="is-todo">{TODO}</span>}
        </p>
      </div>
    </article>
  );
}
