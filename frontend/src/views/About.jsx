import { EMERGENCY_SOURCES, INDICATOR_NAMES, LIMITS, SOURCES } from '../content/limits.js';
import EmergencyList from '../components/EmergencyList.jsx';
import { describeLimit } from '../lib/rangeCheck.js';
import StatusIcon from '../components/StatusIcon.jsx';
import { accessText } from '../lib/accessLog.js';
import { crewNameFor } from '../lib/provenance.js';
import { environmentFile, fitnessFile } from '../data/bundled.js';
import { APP_REMINDER_SCHEDULE, REMINDER_SETTINGS, TEAM_SET, quietHoursText, settingsLine } from '../content/reminderSchedule.js';

const nameOf = (id) => INDICATOR_NAMES[id] ?? id;

/** Every data source in the app, with the label shown on its panels. */
const DATA = [
  {
    label: 'Synthetic',
    what: 'Daily vitals, preflight days, stand tests and fitness tests for a fictional 4-person crew',
    use: 'Dashboard, body map, stand test, Crew Medical Officer view',
    link: null,
  },
  {
    label: 'General human data (PhysioNet)',
    what: 'Multi-night heart rate and EEG sleep stages: 47 healthy adults on Earth, 253 nights',
    use: 'Sleep & recovery: the nightly heart-rate and sleep model',
    link: 'https://physionet.org/content/bidsleep-dataset/1.0.1/',
  },
  {
    label: 'NASA (Inspiration4)',
    what: 'Blood panels (OSD-569, OSD-575) for the 4 Inspiration4 crew, 92 days before launch to 194 days after',
    use: 'Lab baseline: change from each person’s own preflight average',
    link: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575',
  },
  {
    label: 'Environment (NASA RR-1)',
    what: 'ISS radiation dose and cabin CO₂, temperature and humidity, 2014',
    use: 'Environment: station dose timeline and cabin air checks',
    link: 'https://visualization.osdr.nasa.gov/eda/',
  },
  {
    label: 'General human data (Body performance)',
    what: '13,393 adults aged 21–64: grip strength, broad jump, sit-ups',
    use: 'Bones and muscles: percentile for age and sex',
    link: 'https://www.kaggle.com/datasets/kukuroo3/body-performance-data',
  },
];

const pct = (x) => `${Math.round(x * 100)}%`;

/** About this app: how statuses are set, every cited source, and every team-set line. */
/** "Your data": who opened the signed-in person's dashboard (the Crew Medical Officer). */
function YourData({ views, emergencies = [] }) {
  const nameFor = (id) => crewNameFor(id) ?? id;
  return (
    <section className="card card--lg" aria-labelledby="yourdata-title">
      <h2 id="yourdata-title" className="card__title">
        Your data
      </h2>
      <p className="muted">
        The Crew Medical Officer can open your dashboard (read only) and record an exam for you. Each time they open it,
        it is logged here.
      </p>
      {views.length === 0 ? (
        <p className="muted">No one else has viewed your data.</p>
      ) : (
        <ol className="access-list" aria-label="Who viewed your data">
          {views.map((e) => (
            <li key={e.id} className="access-list__item">
              <time dateTime={e.at}>
                {accessText(e, nameFor)}, {new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </time>
            </li>
          ))}
        </ol>
      )}
      <h3 id="yourdata-emergencies" className="card__title about__sub">
        Emergencies about you
      </h3>
      <EmergencyList list={emergencies} titleId="yourdata-emergencies" empty="No emergencies recorded with you as the patient." />
    </section>
  );
}

/** "Allow reminders on this device": browser notifications while the app is open, never in quiet hours. */
function ReminderSettings({ notify }) {
  if (!notify) return null;
  const unavailable = notify.permission === 'unsupported' || notify.permission === 'denied';
  const on = notify.enabled && notify.permission === 'granted';
  return (
    <section className="card card--lg" aria-labelledby="reminder-settings-title">
      <h2 id="reminder-settings-title" className="card__title">
        Reminders
      </h2>
      <label className="switch">
        <input
          type="checkbox"
          role="switch"
          className="switch__input"
          checked={on}
          disabled={unavailable}
          aria-describedby="reminder-settings-help"
          onChange={(e) => notify.set(e.target.checked)}
        />
        <span className="switch__track" aria-hidden="true" />
        <span className="switch__label">Allow reminders on this device</span>
      </label>
      <p id="reminder-settings-help" className="muted">
        {unavailable
          ? 'Notifications are off on this device; the bell still shows what’s due.'
          : `A browser notification only while the app is open, at most once per reminder a day, none during quiet hours (${quietHoursText()} · ${TEAM_SET}). No sounds.`}
      </p>
    </section>
  );
}

export default function About({ viewsOfMe = [], emergenciesOfMe = [], notify = null }) {
  const teamSet = LIMITS.filter((l) => l.team_set);

  return (
    <div className="about">
      <section className="card card--lg" aria-labelledby="about-title">
        <h2 id="about-title" className="view-title">
          About this app
        </h2>
        <p className="muted about__lead">
          Each reading gets one of three statuses. Fixed limits come from the published sources below. Where no
          published line fits, the team set one, and the app labels it as team-set. Sleep nights and the stand test
          are also compared with the same person&apos;s own history.
        </p>
        <ul className="about__statuses" aria-label="Statuses">
          {['normal', 'watch', 'alert'].map((s) => (
            <li key={s} className={`chip chip--${s}`}>
              <StatusIcon status={s} />
              {s === 'normal' ? 'Normal: inside the limits' : s === 'watch' ? 'Watch: keep an eye on it' : 'Alert: act now'}
            </li>
          ))}
        </ul>
      </section>

      <YourData views={viewsOfMe} emergencies={emergenciesOfMe} />

      <ReminderSettings notify={notify} />

      <section className="card card--lg" aria-labelledby="how-title">
        <h2 id="how-title" className="card__title">
          How it works
        </h2>
        <ol className="about__steps">
          <li>
            <strong>Measure.</strong> Each morning the crew member logs blood pressure, resting heart rate, fasting blood
            sugar, temperature, sleep and mood, with a short how-to for every reading.
          </li>
          <li>
            <strong>Compare with their own normal.</strong> Every reading is checked against published limits, against the
            same person&apos;s last 14 days, and for slow drift since the start of the mission. Readings that were already
            alerts are left out of the baseline, so a fever never becomes &ldquo;normal&rdquo;.
          </li>
          <li>
            <strong>Explain.</strong> Every flag says what changed and by how much, in plain words, with the line it
            crossed and its source.
          </li>
          <li>
            <strong>Act.</strong> Watch and alert results come with steps to re-check and what to do now. A crisis goes to
            the Crew Medical Officer straight away, with the signal delay to Earth for the chosen mission.
          </li>
          <li>
            <strong>Works without Earth.</strong> Everything is scored on the device first and synced to the onboard
            server when it is reachable, so the app keeps working with no link to the ground.
          </li>
        </ol>
      </section>

      <section className="card card--lg" aria-labelledby="models-title">
        <h2 id="models-title" className="card__title">
          The models, and how we tested them
        </h2>
        <ul className="about__models">
          <li>
            <strong>Nightly heart rate and sleep</strong> (real PhysioNet nights). Anomalies were planted on copies of real
            nights and whole people were held out, so thresholds never come from the person being scored. With false
            alarms held near 6%, a rise of 12 bpm in sleeping heart rate is caught 83% of the time and 8 bpm 45% of the
            time. Isolation Forest was tested the same way and not used: it caught fewer rises and cannot say why.
          </li>
          <li>
            <strong>Grip strength percentiles</strong> (13,393 adults). Checked on people the model never saw: about{' '}
            {pct(fitnessFile.evaluation.by_test.grip_force.coverage_on_test.p5)} fall below the 5th-percentile line and{' '}
            {pct(fitnessFile.evaluation.by_test.grip_force.coverage_on_test.p50)} below the median, as they should.
          </li>
          <li>
            <strong>Unusual cabin days</strong> (NASA RR-1). Spikes planted on random days: {environmentFile.evaluation.caught_pct.temp}% of
            1.5 °C temperature jumps and {environmentFile.evaluation.caught_pct.co2}% of 0.6 mmHg CO₂ jumps were caught,
            while {environmentFile.evaluation.flagged_pct_of_real_days}% of real days were flagged.
          </li>
        </ul>
      </section>

      <section className="card card--lg" aria-labelledby="data-title">
        <h2 id="data-title" className="card__title">
          Data in this app
        </h2>
        <p className="muted">Every panel names its source. Sources are never mixed into one table.</p>
        <div className="table-scroll">
          <table className="about__data">
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">What it is</th>
                <th scope="col">Used for</th>
              </tr>
            </thead>
            <tbody>
              {DATA.map((d) => (
                <tr key={d.label}>
                  <th scope="row">
                    {d.link ? (
                      <a href={d.link} target="_blank" rel="noopener noreferrer">
                        {d.label}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : (
                      d.label
                    )}
                  </th>
                  <td>{d.what}</td>
                  <td>{d.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card--lg" aria-labelledby="sources-title">
        <h2 id="sources-title" className="card__title">
          Sources
        </h2>
        <ol className="sources">
          {SOURCES.map((s) => (
            <li key={s.url} className="sources__item">
              <p className="sources__name">{s.name}</p>
              <a className="limits__source sources__link" href={s.url} target="_blank" rel="noopener noreferrer">
                {s.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <p className="sources__used muted">Used for: {s.indicators.map(nameOf).join(', ')}</p>
            </li>
          ))}
        </ol>
        <h3 className="card__title about__sub">Emergency guide</h3>
        <ol className="sources">
          {Object.values(EMERGENCY_SOURCES)
            .filter((s) => !s.team_set)
            .map((s) => (
              <li key={s.key} className="sources__item">
                <p className="sources__name">{s.source_name}</p>
                {(s.source_urls ?? [{ label: s.source_title, url: s.source_url }]).map((u) => (
                  <a key={u.url} className="limits__source sources__link" href={u.url} target="_blank" rel="noopener noreferrer">
                    {u.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ))}
                {s.source_urls && <p className="sources__used muted">{s.source_title}</p>}
                <p className="sources__used muted">Used for: emergency guide steps marked “{s.source_short}”</p>
              </li>
            ))}
        </ol>
        <p className="muted">Emergency guide steps marked “Team-set” are the team’s own wording, not a published guideline.</p>
      </section>

      <section className="card card--lg about__limits" aria-labelledby="not-title">
        <h2 id="not-title" className="card__title">
          What this app is not
        </h2>
        <p>
          A prototype for decision support. It is not a medical device and does not diagnose. The Crew Medical Officer
          and flight surgeons decide what happens next. Crew data is synthetic, for a fictional crew.
        </p>
        <p className="muted">
          Background:{' '}
          <a href="https://www.nasa.gov/hrp/hazards/" target="_blank" rel="noopener noreferrer">
            NASA: 5 hazards of human spaceflight
          </a>
          {' · '}
          <a href="https://www.nasa.gov/hrp/risks/" target="_blank" rel="noopener noreferrer">
            NASA: risks of human spaceflight
          </a>
        </p>
      </section>

      <section className="card card--lg" aria-labelledby="teamset-title">
        <h2 id="teamset-title" className="card__title">
          Team-set lines
        </h2>
        <p className="muted">These are the team&apos;s choices, not clinical standards.</p>
        <ul className="limits__list about__teamset">
          {teamSet.map((l) => (
            <li key={`${l.indicator}-${l.level}-${l.rule}-${l.value}`} className="limits__item">
              <span className="limits__group-title">{nameOf(l.indicator)}</span>
              <span className={`limits__rule status-text--${l.level}`}>
                <StatusIcon status={l.level} size={13} />
                {describeLimit(l)}
              </span>
            </li>
          ))}
        </ul>
        <h3 className="card__title about__sub">Reminders</h3>
        <ul className="limits__list about__teamset" aria-label="Reminder schedule">
          {APP_REMINDER_SCHEDULE.kinds.map((k) => (
            <li key={k.id} className="limits__item">
              <span className="limits__group-title">
                {k.title}
                {k.cmoOnly && <span className="muted"> (CMO)</span>}
              </span>
              <span className="limits__rule">
                {k.when}. Done when: {k.done.charAt(0).toLowerCase() + k.done.slice(1)}. · {TEAM_SET}
              </span>
            </li>
          ))}
          <li className="limits__item">
            <span className="limits__group-title">Timing</span>
            <span className="limits__rule">
              {settingsLine()}; the last {REMINDER_SETTINGS.lookbackDays} days are counted · {TEAM_SET}
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
