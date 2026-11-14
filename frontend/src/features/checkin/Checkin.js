'use client';

import { copy } from "@/content/ui";
import { useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/components/AppProvider';
import { indicatorIds, indicators } from '@/content/indicators';
import { request, ApiError } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import { enqueue } from '@/lib/cache/queue';
import { markRoutine } from '@/features/routine/storage';
import { valueText } from '@/lib/format';
import InfoPanel from '@/components/InfoPanel';
import StatusChip from '@/components/StatusChip';
import ActionCard from '@/components/ActionCard';
import SourceLabel from '@/components/SourceLabel';
export function validReading(id, value) {
  const rule = indicators[id];
  const check = v => v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= rule.min && Number(v) <= rule.max;
  return id === 'blood_pressure' ? check(value?.systolic) && check(value?.diastolic) : check(value) && (id !== 'mood' || Number.isInteger(Number(value)));
}
export default function Checkin() {
  const {
    crew
  } = useApp();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);
  const id = indicatorIds[step];
  const meta = indicators[id];
  const value = values[id] ?? '';
  const setValue = next => setValues({
    ...values,
    [id]: next
  });
  async function advance(event) {
    event.preventDefault();
    setError('');
    if (!validReading(id, value)) {
      setError(`${copy.shared.range_start}${meta.min}${copy.shared.range_and}${meta.max}${id === 'blood_pressure' ? copy.features_checkin_Checkin.in_both_fields : ''}${copy.shared.range_end}`);
      return;
    }
    if (step < indicatorIds.length - 1) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    const payload = {
      recordedAt: new Date().toISOString(),
      readings: Object.fromEntries(indicatorIds.map(key => [key, key === 'blood_pressure' ? {
        systolic: Number(values[key].systolic),
        diastolic: Number(values[key].diastolic)
      } : Number(values[key])]))
    };
    const token = crypto.randomUUID();
    try {
      const response = await request(endpoints.checkins(crew.id), {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Idempotency-Key': token
        }
      });
      setResult(response.data);
      markRoutine(crew.id, 'checkin');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);else {
        try {
          enqueue(crew.id, payload, token);
          setPending(true);
        } catch (storageError) {
          setError(storageError.message);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  if (pending) return <div className="form-shell"><InfoPanel title={copy.features_checkin_Checkin.waiting_to_send}><p>{copy.features_checkin_Checkin.your_checkin_is_saved_on_this}</p><p>{copy.features_checkin_Checkin.no_evaluated_results_are_available_yet}</p><Link href="/dashboard">{copy.features_checkin_Checkin.back_to_overview_}</Link></InfoPanel></div>;
  if (result) return <><div className="page-heading"><div><p className="eyebrow">{copy.features_checkin_Checkin.checkin_complete}</p><h1>{copy.features_checkin_Checkin.a_moment_well_spent}</h1></div><StatusChip status={result.overall} /></div><InfoPanel title={copy.features_checkin_Checkin.your_results}>{Object.entries(result.indicators || {}).map(([key, item]) => <div className="result-row" key={key}><div className="between"><h3>{indicators[key]?.name || key}</h3><StatusChip status={item.status} /></div><p className="number">{valueText(item.value)} <small>{item.unit}</small></p>{item.reasons?.map(reason => <p key={reason}>{reason}</p>)}{key === 'mood' && <p className="small muted">{copy.features_checkin_Checkin.your_mood_answer_is_private_to}</p>}{['watch', 'alert'].includes(item.status) && item.guidance && <ActionCard guidance={item.guidance} />}<SourceLabel source={item.source} /></div>)}<p className="small muted">{copy.features_checkin_Checkin.only_indicators_evaluated_by_the_server}</p></InfoPanel>{Object.values(result.indicators || {}).some(i => ['watch', 'alert'].includes(i.status)) && <div className="section-gap"><ActionCard guidance={result.guidance} /></div>}<div className="section-gap"><Link className="button" href="/dashboard">{copy.features_checkin_Checkin.return_to_overview_}</Link></div></>;
  return <div className="form-shell"><p className="eyebrow">{copy.features_checkin_Checkin.daily_checkin}</p><h1>{copy.features_checkin_Checkin.make_time_for_you}</h1><p className="muted">{copy.features_checkin_Checkin.six_simple_readings_your_backend_evaluates}</p><p id="checkin-progress" className="small">{copy.features_checkin_Checkin.step}{step + 1}{copy.features_checkin_Checkin.of}{indicatorIds.length}{copy.features_checkin_Checkin.label}{meta.name}</p><progress aria-labelledby="checkin-progress" value={step + 1} max={indicatorIds.length} /><InfoPanel title={meta.name}><aside className="notice"><h3>{copy.features_checkin_Checkin.how_to_measure}</h3><p>{meta.measure}</p></aside><form onSubmit={advance} noValidate>{id === 'blood_pressure' ? <div className="fields">{['systolic', 'diastolic'].map(field => <label key={field}>{field === 'systolic' ? copy.features_checkin_Checkin.systolic_top_number : copy.features_checkin_Checkin.diastolic_bottom_number}<input type="number" inputMode="decimal" value={value[field] ?? ''} onChange={e => setValue({
              ...value,
              [field]: e.target.value
            })} aria-describedby={error ? 'input-error' : undefined} /></label>)}</div> : id === 'mood' ? <><div className="mood-buttons" role="group" aria-label={copy.features_checkin_Checkin.choose_your_mood}>{[copy.features_checkin_Checkin.very_low, copy.features_checkin_Checkin.low, copy.features_checkin_Checkin.okay, copy.features_checkin_Checkin.good, copy.features_checkin_Checkin.very_good].map((label, i) => <button type="button" key={label} aria-pressed={Number(value) === i + 1} onClick={() => setValue(i + 1)}>{i + 1}{copy.features_checkin_Checkin.label}{label}</button>)}</div><p className="small muted">{copy.features_checkin_Checkin.your_mood_answer_is_private_to}</p><p className="small muted">{copy.features_checkin_Checkin.shareddevice_note_this_prototype_stores_results}</p></> : <label>{meta.name}{copy.features_checkin_Checkin.label_2}{meta.unit}{copy.features_checkin_Checkin.label_3}<input type="number" inputMode="decimal" step="any" value={value} onChange={e => setValue(e.target.value)} aria-describedby={error ? 'input-error' : undefined} /></label>}{error && <p id="input-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" disabled={step === 0 || busy} onClick={() => {
            setStep(step - 1);
            setError('');
          }}>{copy.features_checkin_Checkin.back}</button><button className="button" disabled={busy} type="submit">{busy ? copy.features_checkin_Checkin.sending : step === 5 ? copy.features_checkin_Checkin.submit_checkin_ : copy.features_checkin_Checkin.next_reading_}</button></div></form></InfoPanel></div>;
}
