import { TOUGH_DAYS_TEXT } from '../../content/activities.js';

const stamp = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Simple original motifs, one per patch (no real agency marks). Drawn in a 64×64 box. */
const MOTIFS = {
  first_reaction: (
    <>
      <circle cx="32" cy="32" r="11" />
      <circle cx="32" cy="32" r="4" className="fill" />
    </>
  ),
  reaction_streak: (
    <>
      {[16, 24, 32, 40, 48].map((x) => (
        <circle key={x} cx={x} cy="32" r="3" className="fill" />
      ))}
      <path d="M14 40 H50" />
    </>
  ),
  first_calm: (
    <>
      <circle cx="32" cy="32" r="9" className="fill" />
      <ellipse cx="32" cy="32" rx="17" ry="5" transform="rotate(-18 32 32)" />
    </>
  ),
  calm_seven: (
    <>
      <circle cx="32" cy="32" r="6" className="fill" />
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
        return <circle key={i} cx={32 + Math.cos(a) * 15} cy={32 + Math.sin(a) * 15} r="2" className="fill" />;
      })}
    </>
  ),
  first_exercise: (
    <>
      <path d="M20 32 H44" />
      <rect x="15" y="25" width="5" height="14" rx="1.5" className="fill" />
      <rect x="44" y="25" width="5" height="14" rx="1.5" className="fill" />
    </>
  ),
  crew_halfway: (
    <>
      <circle cx="32" cy="32" r="12" />
      <path d="M32 20 A12 12 0 0 0 32 44 Z" className="fill" />
    </>
  ),
  crew_arrived: (
    <>
      <path d="M24 46 V18" />
      <path d="M24 19 L42 24 L24 30 Z" className="fill" />
      <path d="M16 46 H44" />
    </>
  ),
  first_dock: (
    <>
      <circle cx="40" cy="32" r="10" />
      <path d="M14 26 H24 Q29 27 29 32 Q29 37 24 38 H14 Z" className="fill" />
    </>
  ),
  dock_level3: (
    <>
      <circle cx="32" cy="32" r="13" />
      {[24, 32, 40].map((x) => (
        <path key={x} d={`M${x - 3} 30 L${x} 25 L${x + 3} 30`} />
      ))}
      <circle cx="32" cy="38" r="3" className="fill" />
    </>
  ),
  dock_streak: (
    <>
      <circle cx="46" cy="32" r="6" />
      {[14, 22, 30, 38].map((x) => (
        <circle key={x} cx={x - 2} cy="32" r="2.5" className="fill" />
      ))}
      <circle cx="46" cy="32" r="2.5" className="fill" />
    </>
  ),
  full_week: (
    <>
      {Array.from({ length: 7 }, (_, i) => {
        const a0 = (i / 7) * Math.PI * 2 - Math.PI / 2 + 0.08;
        const a1 = ((i + 1) / 7) * Math.PI * 2 - Math.PI / 2 - 0.08;
        const p = (a) => `${32 + Math.cos(a) * 13} ${32 + Math.sin(a) * 13}`;
        return <path key={i} d={`M${p(a0)} A13 13 0 0 1 ${p(a1)}`} className="seg" />;
      })}
      <circle cx="32" cy="32" r="4" className="fill" />
    </>
  ),
};

export function PatchRoundel({ id, earned }) {
  return (
    <svg className={`patch__svg${earned ? ' is-earned' : ''}`} viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="29" className="ring" />
      <circle cx="32" cy="32" r="25" className="ring ring--inner" />
      <g className="motif">{MOTIFS[id]}</g>
    </svg>
  );
}

/** "Your patches": earned in colour with the date, the rest greyed out. Only the person's own. */
export default function PatchShelf({ patches }) {
  const count = patches.filter((p) => p.earned).length;
  return (
    <section className="card patches" aria-labelledby="patches-title">
      <div className="card__head">
        <h3 id="patches-title" className="card__title">
          Your patches
        </h3>
        <span className="muted">
          {count} of {patches.length}
        </span>
      </div>
      <p className="muted patches__note">Earned by taking part, never by scores. {TOUGH_DAYS_TEXT}.</p>
      <ul className="patches__grid">
        {patches.map((p) => (
          <li key={p.id} className={`patch${p.earned ? ' is-earned' : ''}`}>
            <PatchRoundel id={p.id} earned={p.earned} />
            <span className="patch__name">{p.name}</span>
            <span className="patch__when muted">{p.earned ? `Earned ${stamp(p.earnedOn)}` : 'Not yet'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
