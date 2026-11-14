'use client';

import { copy } from "@/content/ui";
import { useApp } from './AppProvider';
import { missions } from '@/content/missions';
import InfoPanel from './InfoPanel';
export default function ActionCard({
  guidance
}) {
  const {
    mission
  } = useApp();
  if (!guidance) return null;
  const escalation = guidance.escalateTo === 'crew_medical_officer' ? copy.components_ActionCard.contact_the_crew_medical_officer : guidance.escalateTo === 'flight_surgeon' ? copy.components_ActionCard.contact_the_flight_surgeon : guidance.escalateTo;
  return <InfoPanel title={copy.components_ActionCard.recommended_next_steps}><ol>{guidance.steps?.map(step => <li key={step}>{step}</li>)}</ol>{escalation && <p className="escalation">{escalation}{guidance.escalateTo === 'flight_surgeon' && <small>{copy.components_ActionCard.oneway_signal_delay}{missions[mission]?.delay}</small>}</p>}</InfoPanel>;
}
