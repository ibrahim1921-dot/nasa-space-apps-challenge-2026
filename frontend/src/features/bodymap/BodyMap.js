'use client';

import { copy } from "@/content/ui";
import { useRef, useState } from 'react';
import { regions, indicators, hazardText } from '@/content/indicators';
import { valueText } from '@/lib/format';
import StatusChip, { statusInfo } from '@/components/StatusChip';
import SourceLabel from '@/components/SourceLabel';
import { useApp } from '@/components/AppProvider';
import { missions } from '@/content/missions';
import styles from './BodyMap.module.css';
const shapes = {
  head: 'M130 36 C130 8 190 8 190 36 L188 69 Q160 102 132 69 Z',
  chest: 'M117 109 Q160 92 203 109 L201 188 Q160 201 119 188 Z',
  abdomen: 'M120 199 Q160 210 200 199 L193 259 Q160 276 127 259 Z',
  whole_body: 'M87 115 L110 121 L91 203 L77 260 L61 254 L72 191 Z M210 121 L233 115 L248 191 L259 254 L243 260 L229 203 Z',
  bones_muscles: 'M129 280 L154 284 L149 376 L144 465 L122 465 L119 380 Z M166 284 L191 280 L201 380 L198 465 L176 465 L171 376 Z'
};
export default function BodyMap({
  summary
}) {
  const dialog = useRef(null);
  const [selected, setSelected] = useState(null);
  const {
    mission
  } = useApp();
  const open = region => {
    setSelected(region);
    dialog.current.showModal();
  };
  const regionStatus = id => summary.bodyRegions?.find(r => r.id === id)?.status || 'no_data';
  return <section className={styles.map}><h2>{copy.features_bodymap_BodyMap.body_systems}</h2><p className="eyebrow">{copy.features_bodymap_BodyMap.select_a_region_to_explore}</p><svg viewBox="0 0 320 500" aria-label={copy.features_bodymap_BodyMap.interactive_front_view_of_the_body}>
    <path className={styles.silhouette} d="M132 73 L134 95 L112 104 Q87 105 79 134 L58 253 Q57 271 72 270 L91 220 L110 159 L118 259 L116 284 L113 380 L117 471 L105 485 L147 485 L160 340 L173 485 L215 485 L203 471 L207 380 L204 284 L202 259 L210 159 L229 220 L248 270 Q263 271 262 253 L241 134 Q233 105 208 104 L186 95 L188 73 M132 73 Q115 15 160 12 Q205 15 188 73" />
    <path d="M160 111V270 M127 143H193 M130 160H190 M133 177H187" stroke="#6a7a923f" fill="none" />
    {regions.map(region => {
        const status = regionStatus(region.id);
        const label = region.id === 'bones_muscles' ? copy.features_bodymap_BodyMap.context : (statusInfo[status] || statusInfo.no_data)[1];
        return <path key={region.id} d={shapes[region.id]} tabIndex={0} role="button" aria-label={`${region.name}: ${label}. ${copy.shared.open_details}`} className={`${styles.region} ${styles[status]}`} onClick={() => open(region)} onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open(region);
          }
        }}><title>{region.name}{copy.features_bodymap_BodyMap.label}{label}</title></path>;
      })}
  </svg><div className={styles.legend}>{regions.map(region => <button className="region-button" key={region.id} onClick={() => open(region)}><span>{region.name}</span>{region.id === 'bones_muscles' ? <span className="muted">{copy.features_bodymap_BodyMap._context}</span> : <StatusChip status={regionStatus(region.id)} />}</button>)}</div><SourceLabel source="synthetic" />
  <dialog ref={dialog} className={styles.drawer} aria-labelledby="body-region-title"><button className={styles.close} onClick={() => dialog.current.close()} aria-label={copy.features_bodymap_BodyMap.close_body_region_details}>{copy.features_bodymap_BodyMap.label_2}</button>{selected && <><p className="eyebrow">{copy.features_bodymap_BodyMap.body_system_detail}</p><h2 id="body-region-title">{selected.name}</h2><p>{selected.description}</p>{selected.indicators.map(id => {
          const item = summary.indicators?.find(i => i.id === id);
          return <section className={styles.detail} key={id}><div className="between"><h3>{indicators[id].name}</h3><StatusChip status={item?.status} /></div><p className="number">{valueText(item?.value)} <small>{item?.unit}</small></p><h4>{copy.features_bodymap_BodyMap.why_it_matters_in_space}</h4><p>{indicators[id].space}</p><p className="muted">{copy.features_bodymap_BodyMap.linked_hazard_}{indicators[id].hazard}</p><a href={indicators[id].source} target="_blank" rel="noreferrer">{copy.features_bodymap_BodyMap.nasa_source_}</a><SourceLabel source={item?.source} /></section>;
        })}{selected.id === 'bones_muscles' && <><p>{copy.features_bodymap_BodyMap.context_gravity_fields}</p><p>{missions[mission]?.gravity}</p></>}<p className="small muted">{hazardText}</p><a href="https://www.nasa.gov/hrp/hazards/">{copy.features_bodymap_BodyMap.nasa_spaceflight_hazards_}</a></>}</dialog></section>;
}
