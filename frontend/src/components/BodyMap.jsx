'use client';

import { useState } from 'react';
import { IMAGE, REGIONS, STAGE } from '../constants/regions.js';
import { STATUS_LABELS } from '../constants/status.js';
import StatusIcon from './StatusIcon.jsx';
import SourceLabel from './SourceLabel.jsx';

const SKELETON_SRC = '/skeleton-light.png';

// --- Coordinate helpers -------------------------------------------------------------
// Region constants are percentages of the image. The figure overlays use the image's own
// pixel grid (viewBox 0 0 610 1280), so circles stay round and everything scales together.
const px = (pctX) => (pctX / 100) * IMAGE.width;
const py = (pctY) => (pctY / 100) * IMAGE.height;
const toPixels = ({ cx, cy, rx, ry, rotate = 0 }) => ({ cx: px(cx), cy: py(cy), rx: px(rx), ry: py(ry), rotate });

// The leader-line layer covers the whole desktop stage: 1000 units wide, and as tall as the
// figure (whose width is STAGE.figureWidth % of the stage).
const STAGE_W = 1000;
const STAGE_H = (STAGE_W * (STAGE.figureWidth / 100) * IMAGE.height) / IMAGE.width;
const stageX = (pctX) => (STAGE.figureLeft + (pctX / 100) * STAGE.figureWidth) * (STAGE_W / 100);
const stageY = (pctY) => (pctY / 100) * STAGE_H;
const LABEL_EDGE = { left: STAGE.labelWidth * 10, right: STAGE_W - STAGE.labelWidth * 10 };

const ALERT_RING_GAP = 14; // px in image space between the two alert rings

function Ellipse({ cx, cy, rx, ry, rotate, grow = 0, ...rest }) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx + grow}
      ry={ry + grow}
      transform={rotate ? `rotate(${rotate} ${cx} ${cy})` : undefined}
      {...rest}
    />
  );
}

export default function BodyMap({
  statuses,
  statusError,
  openRegion,
  onOpen,
  labelRefs,
  source,
  wholeBody = null, // status from the person's temperature
  sampleRegions = [], // regions still showing the shared demo status
}) {
  const [hot, setHot] = useState(null);

  const stateClass = (id) => {
    const status = statuses?.[id] ?? 'unknown';
    return `region region--${status}${hot === id ? ' is-hot' : ''}${openRegion === id ? ' is-open' : ''}`;
  };

  return (
    <section className="bodymap-section" aria-labelledby="bodymap-title">
      <h2 id="bodymap-title" className="section-title">
        Body status
      </h2>
      {wholeBody && (
        <p className="bodymap__whole">
          <span className="callout__name">Whole body</span>
          <span className="muted"> · temperature</span>
          <span className={`callout__status status-text--${wholeBody}`}>
            <StatusIcon status={wholeBody} />
            {STATUS_LABELS[wholeBody]}
          </span>
        </p>
      )}

      <div
        className="bodymap"
        style={{
          '--fig-left': `${STAGE.figureLeft}%`,
          '--fig-width': `${STAGE.figureWidth}%`,
          '--label-width': `${STAGE.labelWidth}%`,
          '--stage-ratio': `${STAGE_W} / ${STAGE_H}`,
        }}
      >
        <div className="bodymap__stage">
          {/* Leader lines from each marker out to its label (desktop only). */}
          <svg
            className="bodymap__leaders"
            viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            {REGIONS.map(({ id, marker, side, calloutY }) => (
              <line
                key={id}
                className={stateClass(id)}
                x1={stageX(marker.x)}
                y1={stageY(marker.y)}
                x2={LABEL_EDGE[side]}
                y2={stageY(calloutY)}
              />
            ))}
          </svg>

          <div className="bodymap__figure">
            <div className="bodymap__pool" aria-hidden="true" />

            {/* Glow layer, behind the bones. */}
            <svg
              className="bodymap__overlay bodymap__overlay--glow"
              viewBox={`0 0 ${IMAGE.width} ${IMAGE.height}`}
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                {['normal', 'watch', 'alert'].map((s) => (
                  <radialGradient key={s} id={`glow-${s}`}>
                    <stop offset="0%" className={`glow-stop glow-stop--${s}`} stopOpacity="0.9" />
                    <stop offset="100%" className={`glow-stop glow-stop--${s}`} stopOpacity="0" />
                  </radialGradient>
                ))}
                <filter id="glow-blur" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="14" />
                </filter>
              </defs>
              {REGIONS.map(({ id, shapes }) => {
                const status = statuses?.[id];
                if (!status) return null;
                return (
                  <g key={id} className={stateClass(id)}>
                    {shapes.map((shape, i) => (
                      <Ellipse
                        key={i}
                        {...toPixels(shape)}
                        grow={18}
                        className="glow"
                        fill={`url(#glow-${status})`}
                        filter="url(#glow-blur)"
                      />
                    ))}
                  </g>
                );
              })}
            </svg>

            <img className="bodymap__img" src={SKELETON_SRC} alt="" width={IMAGE.width} height={IMAGE.height} />

            {/* Ring + marker layer, above the bones. */}
            <svg
              className="bodymap__overlay"
              viewBox={`0 0 ${IMAGE.width} ${IMAGE.height}`}
              aria-hidden="true"
              focusable="false"
            >
              {REGIONS.map(({ id, shapes, marker }) => (
                <g key={id} className={stateClass(id)}>
                  {shapes.map((shape, i) => (
                    <g key={i}>
                      <Ellipse {...toPixels(shape)} className="ring" />
                      {statuses?.[id] === 'alert' && (
                        <Ellipse {...toPixels(shape)} grow={ALERT_RING_GAP} className="ring ring--outer" />
                      )}
                    </g>
                  ))}
                  <circle className="marker__halo" cx={px(marker.x)} cy={py(marker.y)} r="16" />
                  <circle className="marker" cx={px(marker.x)} cy={py(marker.y)} r="8" />
                </g>
              ))}
            </svg>

            {/* Mouse/touch hit areas. Hidden from assistive tech: each region's label is its one accessible control. */}
            {REGIONS.map(({ id, label, shapes }) =>
              shapes.map((s, i) => (
                <button
                  key={`${id}-${i}`}
                  type="button"
                  className="hit"
                  tabIndex={-1}
                  aria-hidden="true"
                  aria-label={`${label}, ${STATUS_LABELS[statuses?.[id]] ?? 'status loading'}. Open indicators`}
                  style={{
                    left: `${s.cx - s.rx}%`,
                    top: `${s.cy - s.ry}%`,
                    width: `${s.rx * 2}%`,
                    height: `${s.ry * 2}%`,
                    transform: s.rotate ? `rotate(${s.rotate}deg)` : undefined,
                  }}
                  onClick={() => onOpen(id)}
                  onMouseEnter={() => setHot(id)}
                  onMouseLeave={() => setHot(null)}
                />
              )),
            )}
          </div>
        </div>

        {/* Callout labels: beside the figure on desktop, a 2 x 2 grid below it on narrow screens. */}
        <div className="bodymap__labels">
          {REGIONS.map(({ id, label, side, calloutY }) => {
            const status = statuses?.[id];
            return (
              <button
                key={id}
                ref={(el) => {
                  labelRefs.current[id] = el;
                }}
                type="button"
                className={`callout callout--${side}${hot === id ? ' is-hot' : ''}${openRegion === id ? ' is-open' : ''}`}
                style={{ '--callout-y': `${calloutY}%` }}
                aria-haspopup="dialog"
                aria-expanded={openRegion === id}
                onClick={() => onOpen(id)}
                onMouseEnter={() => setHot(id)}
                onMouseLeave={() => setHot(null)}
                onFocus={() => setHot(id)}
                onBlur={() => setHot(null)}
              >
                <span className="callout__name">
                  {label}
                  {sampleRegions.includes(id) && <span className="callout__sample">Sample</span>}
                </span>
                {status ? (
                  <span className={`callout__status status-text--${status}`}>
                    <StatusIcon status={status} />
                    {STATUS_LABELS[status]}
                  </span>
                ) : (
                  <span className="callout__status muted">{statusError ? 'Status unavailable' : 'Checking…'}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <SourceLabel source={source} />
    </section>
  );
}
