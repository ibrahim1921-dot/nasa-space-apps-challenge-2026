'use client';

// Screen 1 of the morning check-in: "Overnight from your sensors". One row per reading the worn
// devices recorded (all SIMULATED in this demo), each with "Looks right" and "Re-measure by hand".
// A sensor gap asks for the value by hand, or lets the person skip it for today.

import { DEVICES, DEVICE_OF_READING } from '../lib/sensorFeed.js';
import StatusChip from './StatusChip.jsx';
import DeviceIcon from './DeviceIcon.jsx';
import { HowTo, NumberField } from './CheckinFields.jsx';

/** crew.json key for each reading key on these screens. */
const DAY_KEY = { systolic: 'systolic', diastolic: 'diastolic', heart_rate: 'heartRate', glucose: 'glucose', temperature: 'temperature', sleep_hours: 'sleepHours' };

export const deviceOfScreen = (screen) => DEVICE_OF_READING[screen.fields[0].key];

/** The sensor's value for a screen as input text, or null in a gap. */
export function sensorText(sensorDay, key) {
  const v = sensorDay?.[DAY_KEY[key]];
  return typeof v === 'number' ? String(v) : null;
}

function valueText(screen, sensorDay) {
  const parts = screen.fields.map((f) => sensorText(sensorDay, f.key));
  if (parts.some((p) => p === null)) return null;
  return parts.join('/');
}

function SensorRow({ screen, sensorDay, state, values, errors, status, onConfirm, onManual, onUseSensor, onSkip, onField }) {
  const device = deviceOfScreen(screen);
  const deviceLabel = DEVICES[device].label;
  const gap = sensorDay.gaps?.find((g) => g.device === device);
  const text = valueText(screen, sensorDay);
  const unit = screen.fields[0].unit;
  const headId = `sensor-${screen.id}-title`;
  const showInput = state === 'manual';

  return (
    <li className={`vrow sensor-row${status && !showInput && state !== 'skipped' ? ` vrow--${status}` : ''}`} aria-labelledby={headId}>
      <div className="vrow__head">
        <h4 id={headId} className="vrow__name sensor-row__name">
          <span className="sensor-row__icon">
            <DeviceIcon device={device} size={20} />
          </span>
          {screen.title}
        </h4>
        {text !== null && !showInput && status && <StatusChip status={status} icon />}
      </div>

      {gap && (
        <p className="sensor-row__gap" role="note">
          No {deviceLabel} data since {gap.since}. {state === 'skipped' ? 'Skipped for today.' : `Enter ${screen.title.toLowerCase()} by hand?`}
        </p>
      )}

      {text !== null && !showInput && (
        <>
          <p className="vrow__value">
            <span className="num">{text}</span>
            <span className="vrow__unit">{unit}</span>
          </p>
          <p className="vrow__prov">
            <span className="prov">
              <span className="chip chip--muted prov__chip">
                <DeviceIcon device={device} size={14} />
                Sensor · {deviceLabel}
              </span>
              <span className="prov__sim">Simulated</span>
            </span>
          </p>
          <div className="sensor-row__actions">
            <button
              type="button"
              className={`btn ${state === 'confirmed' ? 'btn--primary' : 'btn--secondary'} sensor-row__btn`}
              aria-pressed={state === 'confirmed'}
              onClick={onConfirm}
            >
              {state === 'confirmed' ? (
                <>
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                    <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Confirmed
                </>
              ) : (
                'Looks right'
              )}
            </button>
            <button type="button" className="btn btn--secondary sensor-row__btn" onClick={onManual}>
              Re-measure by hand
            </button>
          </div>
        </>
      )}

      {showInput && (
        <div className="sensor-row__manual">
          <HowTo howTo={screen.howTo} whyId={screen.id} />
          {screen.fields.map((f) => (
            <NumberField
              key={f.key}
              idPrefix="sensor"
              field={f}
              value={values[f.key]}
              onChange={onField(f.key)}
              error={errors[f.key]}
              hint={text !== null ? `Sensor recorded ${sensorText(sensorDay, f.key)} ${f.unit} (simulated).` : undefined}
            />
          ))}
          <div className="sensor-row__actions">
            {text !== null ? (
              <button type="button" className="btn btn--secondary sensor-row__btn" onClick={onUseSensor}>
                Use the sensor value
              </button>
            ) : (
              <button type="button" className="btn btn--secondary sensor-row__btn" onClick={onSkip}>
                Skip for today
              </button>
            )}
          </div>
        </div>
      )}

      {state === 'skipped' && (
        <div className="sensor-row__actions">
          <button type="button" className="btn btn--secondary sensor-row__btn" onClick={onManual}>
            Enter by hand
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.screens    VITALS_SCREENS without mood
 * @param {object} props.sensorDay    today's simulated sensor day (lib/sensorFeed.js)
 * @param {object} props.rowState     { [screenId]: 'sensor'|'confirmed'|'manual'|'skipped' }
 * @param {object} props.statuses     preview status per result row id, from the sensor values
 */
export default function SensorConfirm({ screens, sensorDay, rowState, values, errors, statuses, actions }) {
  return (
    <ul className="sensor-rows" aria-label="Overnight readings from your sensors">
      {screens.map((screen) => (
        <SensorRow
          key={screen.id}
          screen={screen}
          sensorDay={sensorDay}
          state={rowState[screen.id]}
          values={values}
          errors={errors}
          status={statuses?.[screen.id] ?? null}
          onConfirm={() => actions.confirm(screen.id)}
          onManual={() => actions.manual(screen.id)}
          onUseSensor={() => actions.useSensor(screen.id)}
          onSkip={() => actions.skip(screen.id)}
          onField={actions.setField}
        />
      ))}
    </ul>
  );
}
