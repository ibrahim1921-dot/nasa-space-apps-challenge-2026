'use client';

import { useEffect, useRef, useState } from 'react';
import WellnessAttention from './WellnessAttention.jsx';
import { INITIAL_WELLNESS, OPTIONS, SYMPTOMS, URGENT_SIGNS, hasSymptoms, needsUrgentHelp, toggleAnswer, validateWellness, makeWellnessRecord, writeWellnessCheckin } from '../lib/wellnessCheckin.js';

function Choices({ name, title, choices, value, onChange, error, multiple = false }) {
  return <fieldset className="field wellness__question">
    <legend className="field__label">{title}</legend>
    <div className="wellness__choices">{choices.map(([id, label]) => <label key={id} className="wellness__choice">
      <input type={multiple ? 'checkbox' : 'radio'} name={name} value={id}
        checked={multiple ? value.includes(id) : value === id}
        onChange={() => onChange(multiple ? toggleAnswer(value, id) : id)}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${name}-error` : undefined} />
      <span>{label}</span>
    </label>)}</div>
    {error && <p id={`${name}-error`} className="field__error">{error}</p>}
  </fieldset>;
}

export default function CheckinForm({ missionDay, crewId, onSaved, onCancel }) {
  const [answers, setAnswers] = useState(INITIAL_WELLNESS);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(null);
  const [saveError, setSaveError] = useState('');
  const saving = useRef(false);
  const heading = useRef(null);
  const form = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [step, saved]);
  const symptomatic = hasSymptoms(answers);
  const steps = symptomatic ? [0, 1, 2, 3] : [0, 2, 3];
  const title = ['How are you feeling?', 'Tell us about your symptoms', 'Your day-to-day wellbeing', 'Review your answers'][step];
  const update = (key) => (value) => {
    setAnswers((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    setSaveError('');
  };
  const question = (name, title) => <Choices key={name} name={name} title={title} choices={OPTIONS[name]} value={answers[name]} onChange={update(name)} error={errors[name]} />;
  const text = (name, title) => <div className="field" key={name}><label htmlFor={name} className="field__label">{title} <span className="muted">(optional)</span></label>
    <textarea id={name} name={name} className="input" rows={2} maxLength={500} value={answers[name]} onChange={(event) => update(name)(event.target.value)} />
    {errors[name] && <p className="field__error">{errors[name]}</p>}</div>;
  function advance(event) {
    event.preventDefault();
    const found = step === 3 ? Object.assign({}, ...[0, 1, 2].map((index) => validateWellness(answers, index))) : validateWellness(answers, step);
    setErrors(found);
    if (Object.keys(found).length) {
      form.current?.querySelector(`[name="${Object.keys(found)[0]}"]`)?.focus();
      return;
    }
    if (step !== 3) { setStep(steps[steps.indexOf(step) + 1]); return; }
    if (saving.current) return;
    saving.current = true;
    try {
      const record = makeWellnessRecord(crewId, answers);
      if (!writeWellnessCheckin(record)) throw new Error('This browser could not save your answers. Please try again.');
      setSaved(record);
    } catch (error) { setSaveError(error.message); saving.current = false; }
  }
  return <section className="card card--lg checkin wellness" aria-labelledby="checkin-title">
    <h2 id="checkin-title" className="checkin__title" ref={heading} tabIndex={-1}>{saved ? 'Wellness check-in saved' : 'Wellness check-in'}</h2>
    <p className="muted checkin__intro">Tell us what your measurements may not show.{missionDay ? ` Mission day ${missionDay}.` : ''}</p>
    {needsUrgentHelp(answers) && <div className="wellness__urgent" role="alert"><strong>Contact the medical officer now.</strong><p>Ask a crewmate for help and follow your mission emergency procedure. Do not wait to finish this form.</p></div>}
    {saved ? <>
      <p role="status">Your answers are saved on this device. They have not been sent to the medical officer.</p>
      <WellnessAttention answers={saved.answers} />
      <WellnessAnswers answers={saved.answers} />
      <button type="button" className="btn btn--primary" onClick={() => onSaved({ wellness: saved.answers, savedAt: saved.recorded_at })}>Back to dashboard</button>
    </> : <form ref={form} onSubmit={advance} noValidate>
      <p className="vprogress__text">Step {steps.indexOf(step) + 1} of {steps.length}</p>
      <h3 className="vstep__title">{title}</h3>
      {step === 0 && <>
        <Choices name="urgentSigns" title="Are you experiencing any of these now?" choices={URGENT_SIGNS} value={answers.urgentSigns} onChange={update('urgentSigns')} error={errors.urgentSigns} multiple />
        <Choices name="symptoms" title="What has been bothering you since your last check-in?" choices={SYMPTOMS} value={answers.symptoms} onChange={update('symptoms')} error={errors.symptoms} multiple />
        {answers.symptoms.includes('other') && text('symptomNotes', 'What else have you noticed?')}
      </>}
      {step === 1 && <>
        {question('onset', 'When did the symptoms start?')}
        {question('severity', 'How uncomfortable do you feel?')}
        {question('course', 'How have the symptoms changed?')}
        {question('impact', 'How are they affecting your usual tasks?')}
        {answers.symptoms.some((id) => ['pain', 'headache', 'digestive'].includes(id)) && text('location', 'Where do you feel the discomfort?')}
        {text('triggers', 'What brings it on, makes it worse, or helps?')}
      </>}
      {step === 2 && <>
        {question('sleepQuality', 'How rested did you feel after sleeping?')}
        {question('appetite', 'How is your appetite?')}
        {question('hydration', 'Have you been able to drink normally?')}
        {question('mood', 'How have you been feeling emotionally?')}
        {question('stress', 'How manageable does today feel?')}
        {question('workload', 'How does your workload feel today?')}
        {text('changes', 'Any recent changes in medication, meals, exercise, or your surroundings?')}
        {text('notes', 'Anything else you want the medical officer to know?')}
      </>}
      {step === 3 && <><WellnessAnswers answers={answers} /><p className="muted">Answers stay on this device. This questionnaire supports a medical conversation; it does not give a diagnosis.</p></>}
      {saveError && <p className="field__error" role="alert">{saveError}</p>}
      <div className="checkin__actions">
        <button type="submit" className="btn btn--primary btn--lg">{step === 3 ? 'Save check-in' : 'Continue'}</button>
        <button type="button" className="btn btn--secondary btn--lg" onClick={() => { setErrors({}); setSaveError(''); if (step === 0) onCancel(); else setStep(steps[steps.indexOf(step) - 1]); }}>{step === 0 ? 'Cancel' : 'Back'}</button>
      </div>
    </form>}
  </section>;
}

export function WellnessAnswers({ answers }) {
  const selected = (choices, values) => choices.filter(([id]) => values?.includes(id)).map(([, label]) => label).join(', ');
  const label = (key) => OPTIONS[key].find(([id]) => id === answers[key])?.[1] ?? '';
  const details = hasSymptoms(answers) ? [['Symptoms', selected(SYMPTOMS, answers.symptoms)], ['Started', label('onset')], ['Severity', label('severity')], ['Change', label('course')], ['Effect on tasks', label('impact')], ['Location', answers.location], ['Helps or worsens', answers.triggers], ['Other symptoms', answers.symptomNotes]] : [['Symptoms', 'No symptoms reported']];
  const rows = [['Urgent symptoms', selected(URGENT_SIGNS, answers.urgentSigns)], ...details, ...[['sleepQuality', 'Rest after sleep'], ['appetite', 'Appetite'], ['hydration', 'Drinking'], ['mood', 'Mood'], ['stress', 'Stress'], ['workload', 'Workload']].map(([key, title]) => [title, label(key)]), ['Recent changes', answers.changes], ['Notes', answers.notes]];
  return <dl className="wellness__summary">{rows.filter(([, value]) => value).map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl>;
}
