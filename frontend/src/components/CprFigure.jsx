// Simple stick-figure drawings of the compression positions (drawn for this app; nothing copied from
// a paper). The patient is the outlined figure lying down; the rescuer is the filled-line figure.
// Each figure has a text alternative; the step text above it is the instruction.

const P = { stroke: 'currentColor', strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
const R = { ...P, stroke: '#ff5a5a' };

function Patient({ y = 120 }) {
  // Lying on the back, head on the left.
  return (
    <g {...P} opacity="0.75">
      <circle cx="40" cy={y} r="11" />
      <path d={`M52 ${y}h96 M148 ${y}l36 -4 M148 ${y}l36 6 M70 ${y}l18 10 M70 ${y}l18 -8`} />
    </g>
  );
}

function Straddle() {
  // Evetts-Russomano: rescuer astride the patient's back, legs wrapped round, arms straight onto the chest.
  return (
    <>
      <Patient y={120} />
      <g {...R}>
        <circle cx="96" cy="44" r="10" />
        <path d="M96 54v34" />
        <path d="M96 62l-14 54 M96 62l-4 54" />
        <path d="M96 88l40 20 22 22 M96 88l36 32 -8 20" />
      </g>
    </>
  );
}

function Handstand() {
  // Handstand: patient strapped to the restraint (floor line); rescuer upside down, feet braced on the opposite wall.
  return (
    <>
      <path d="M10 136h220" stroke="currentColor" strokeWidth="2" strokeDasharray="6 6" opacity="0.6" />
      <path d="M10 14h220" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <Patient y={124} />
      <g {...R}>
        <circle cx="86" cy="70" r="10" />
        <path d="M86 60V28" />
        <path d="M86 78v34 M86 78l-6 34" />
        <path d="M86 28l-12 -14 M86 28l12 -14" />
      </g>
    </>
  );
}

function Kneel() {
  // Moon: patient on the floor, rescuer kneeling beside, arms locked, shoulders over the hands.
  return (
    <>
      <path d="M10 134h220" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <Patient y={124} />
      <g {...R}>
        <circle cx="96" cy="44" r="10" />
        <path d="M96 54l4 40" />
        <path d="M96 62l-6 54 M96 62l2 54" />
        <path d="M100 94l40 6 M140 100l0 32 M100 94l28 40" />
      </g>
    </>
  );
}

const FIGURES = {
  straddle: { Draw: Straddle, alt: 'Rescuer astride the patient, legs wrapped round the body, arms straight onto the chest.' },
  handstand: { Draw: Handstand, alt: 'Patient strapped to the restraint; rescuer upside down, feet braced on the opposite wall, arms straight.' },
  kneel: { Draw: Kneel, alt: 'Patient on their back on the floor; rescuer kneeling beside them with locked arms.' },
};

export default function CprFigure({ figure }) {
  const f = FIGURES[figure];
  if (!f) return null;
  return (
    <svg className="emg-figure" viewBox="0 0 240 150" role="img" aria-label={f.alt}>
      <f.Draw />
    </svg>
  );
}
