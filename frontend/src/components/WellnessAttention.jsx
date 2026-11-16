import { wellnessAttention } from '../lib/wellnessAttention.js';

export default function WellnessAttention({ answers }) {
  const attention = wellnessAttention(answers);
  return <section className={`wellness-attention${attention.urgent ? ' wellness__urgent' : ''}`} aria-label="Wellness attention">
    <h3 className="card__title">{attention.title}</h3>
    <ul>{attention.checks.map((check) => <li key={check}>{check}</li>)}</ul>
    <p className="muted">Based on your check-in answers. These checks do not replace a medical assessment.</p>
  </section>;
}
