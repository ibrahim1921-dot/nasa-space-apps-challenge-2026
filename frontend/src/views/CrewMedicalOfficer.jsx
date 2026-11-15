
'use client';

// Medical Officer Dashboard
// Displays all crew members, their health statuses,
// search functionality, individual medical profiles,
// and the latest watch and alert readings.

import { useMemo, useRef, useState } from 'react';

import { useOnboard } from '../hooks/useOnboard.jsx';
import { crewRoster } from '../lib/crewRoster.js';
import { isRecordedHealth } from '../lib/recordedHealth.js';

import {
  buildCrewCards,
  flaggedFeed,
  mergeReadings,
  statusCounts,
  vitalsOf,
} from '../lib/cmoSummary.js';

import { readAllVitals } from '../lib/vitalsCheckinStore.js';
import { readWellnessCheckins, needsUrgentHelp } from '../lib/wellnessCheckin.js';
import { WellnessAnswers } from '../components/CheckinForm.jsx';
import { STATUS_LABELS } from '../constants/status.js';

import StatusChip from '../components/StatusChip.jsx';
import StatusIcon from '../components/StatusIcon.jsx';
import SourceLabel from '../components/SourceLabel.jsx';
import SyncBadge from '../components/SyncBadge.jsx';
import RecordObservationContexts from '../components/RecordObservationContexts.jsx';
import PersistedObservationHistory from '../components/PersistedObservationHistory.jsx';
import CrewBodyDashboard from '../components/CrewBodyDashboard.jsx';

// DATA SOURCE INFORMATION

const SOURCE_SERVER =
  'Recorded health readings';

const SOURCE_DEVICE =
  'Locally recorded health readings';

const BASELINE_SERVER =
  'No preflight baseline connected';

const BASELINE_DEVICE =
  'No preflight baseline connected';

const KIND = {
  daily_vitals: 'Daily vitals',
  stand_test: 'Stand test',
};

// Format the date and time of health readings.
const stamp = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Unknown date';

const isSeed = (record) =>
  record?.payload?.origin === 'seed';

// --------------------------------------------------
// SECTION 1: LOAD EXISTING CREW DATA
// --------------------------------------------------

function useCmoData() {
  const { version } = useOnboard();
  const readings = useMemo(() => readAllVitals().filter(isRecordedHealth), [version]);
  return { fromServer: false, live: false, error: null, crew: crewRoster, baselines: [], readings };
}

// --------------------------------------------------
// SECTION 2: PREFLIGHT COMPARISONS
// --------------------------------------------------

function Comparison({ rows }) {
  if (!rows?.length) {
    return (
      <p className="muted cmo-card__none">
        No preflight baseline or reading yet.
      </p>
    );
  }

  return (
    <dl className="cmo-compare">
      {rows.map((row) => {
        const worse =
          row.worseWhen === 'higher'
            ? row.change > 0
            : row.change < 0;

        const sign =
          row.change > 0
            ? '+'
            : row.change < 0
              ? '−'
              : '±';

        return (
          <div
            key={row.id}
            className="cmo-compare__row"
          >
            <dt>{row.label}</dt>

            <dd>
              <span className="num">
                {row.before}
              </span>

              <span
                className="cmo-compare__arrow"
                aria-label="then now"
              >
                →
              </span>

              <span className="num">
                {row.now}
              </span>

              <span className="muted">
                {' '}{row.unit}
              </span>

              <span
                className={`cmo-compare__delta${
                  worse && row.change !== 0
                    ? ' is-worse'
                    : ''
                }`}
              >
                {' '}({sign}
                {Math.abs(row.change)}
                {row.id === 'blood_pressure'
                  ? ' systolic'
                  : ''}
                )
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// --------------------------------------------------
// SECTION 3: INDIVIDUAL READING STATUS
// --------------------------------------------------

function ReadingLine({ label, row, note }) {
  if (!row) {
    return (
      <div className="cmo-card__reading">
        <span className="cmo-card__reading-label">
          {label}
        </span>

        <span className="muted">
          No reading yet
        </span>
      </div>
    );
  }

  return (
    <div className="cmo-card__reading">
      <span className="cmo-card__reading-label">
        {label}
      </span>

      <StatusChip status={row.status} icon />

      <time
        className="muted cmo-card__time"
        dateTime={row.recorded_at}
      >
        {stamp(row.recorded_at)}
      </time>

      {note && (
        <span className="chip chip--muted">
          {note}
        </span>
      )}

      {!isSeed(row) && (
        <SyncBadge record={row} />
      )}
      <RecordObservationContexts record={row} />

      {row.status !== 'normal' &&
        row.reasons?.[0] && (
          <p className="cmo-card__reason">
            {row.reasons[0]}
          </p>
        )}
    </div>
  );
}

// --------------------------------------------------
// SECTION 4: CREW MEMBER CARD
// --------------------------------------------------

function CrewCard({ card, onOpenProfile, expanded, readings, fromServer, profileId, onClose }) {
  const buttonRef = useRef(null);
  const close = () => { onClose(); buttonRef.current?.focus(); };
  return (
    <li
      className={`cmo-card cmo-card--${card.status}${expanded ? ' cmo-card--expanded' : ''}`}
    >
      <div className="cmo-card__head">
        <div>
          <h3 className="cmo-card__name">
            {card.name}
          </h3>

          <p className="muted cmo-card__title">
            {card.title}

            {card.role === 'cmo'
              ? ' · CMO'
              : ''}
          </p>
        </div>

        <span
          className={`cmo-card__status status-text--${card.status}`}
        >
          <StatusIcon
            status={card.status}
            size={22}
          />

          {STATUS_LABELS[card.status]}
        </span>
      </div>

      {/* NEW: OPEN CREW MEDICAL PROFILE */}
      <button
        type="button"
        className="cmo-profile-button"
        ref={buttonRef}
        aria-expanded={expanded}
        aria-controls={`medical-profile-${card.id}`}
        onClick={() => expanded ? close() : onOpenProfile(card.id)}
      >
        {expanded ? 'Hide Medical Profile' : 'View Medical Profile'}
      </button>
      {expanded && <MedicalProfile crewMember={card} readings={readings} fromServer={fromServer} profileId={profileId} onClose={close} />}
    </li>
  );
}

// --------------------------------------------------
// SECTION 5: DETAILED CREW MEDICAL PROFILE
// --------------------------------------------------

function MedicalProfile({
  profileId,
  crewMember,
  readings,
  fromServer,
  onClose,
}) {
  const { version } = useOnboard();
  const wellness = useMemo(() => readWellnessCheckins(crewMember.id), [crewMember.id, version]);
  // Get the most recent readings belonging to
  // the selected astronaut.
  const history = useMemo(
    () =>
      readings
        .filter(
          (record) =>
            record.crew_id === crewMember.id
        )
        .sort(
          (a, b) =>
            Date.parse(b.recorded_at) -
            Date.parse(a.recorded_at)
        ),
    [readings, crewMember.id]
  );

  // Extract vitals using the EXISTING project helper.
  const vitals = vitalsOf(crewMember.vitals);

  return (
    <section
      className="card card--lg cmo-profile"
      id={`medical-profile-${crewMember.id}`}
      aria-labelledby={`medical-profile-title-${crewMember.id}`}
    >
      {/* PROFILE HEADER */}

      <div className="cmo-profile__heading">
        <div>
          <p className="cmo__eyebrow">
            Crew Medical Profile
          </p>

          <h2 id={`medical-profile-title-${crewMember.id}`}>
            {crewMember.name}
          </h2>

          <p className="muted">
            {crewMember.title}
          </p>

          <p className="muted">
            Crew ID: {crewMember.id}
          </p>
        </div>


      </div>

      <CrewBodyDashboard key={crewMember.id} crewId={crewMember.id} readings={readings} profileId={profileId} />

      {/* OVERALL HEALTH STATUS */}

      <div className="cmo-profile__section">
        <h3>Overall Health Status</h3>

        <StatusChip
          status={crewMember.status}
          icon
        />

        <p className="muted">
          Based on the latest available vitals
          only; missing data is not marked normal.
        </p>
      </div>

      <div className="cmo-profile__section">
        <h3>Wellness answers</h3>
        <p className="muted">Self-reported check-ins saved on this browser. Separate from measured vitals.</p>
        {wellness.length ? wellness.slice(0, 5).map((record) => <details key={record.id}>
          <summary>{new Date(record.recorded_at).toLocaleString()}{needsUrgentHelp(record.answers) ? ' — Urgent symptoms reported' : ''}</summary>
          <WellnessAnswers answers={record.answers} />
        </details>) : <p className="muted">No wellness check-ins saved here.</p>}
      </div>

      {/* LATEST VITAL SIGNS */}

      <div className="cmo-profile__section">
        <h3>Latest Vital Measurements</h3>

        {vitals ? (
          <dl className="cmo-profile__metrics">

            <div>
              <dt>Sleep Duration</dt>

              <dd>
                {vitals.sleepHours ?? '—'}
                {vitals.sleepHours != null
                  ? ' hours'
                  : ''}
              </dd>
            </div>

            <div>
              <dt>Heart Rate</dt>

              <dd>
                {vitals.heartRate ?? '—'}
                {vitals.heartRate != null
                  ? ' bpm'
                  : ''}
              </dd>
            </div>

            <div>
              <dt>Systolic Blood Pressure</dt>

              <dd>
                {vitals.systolic ?? '—'}
                {vitals.systolic != null
                  ? ' mmHg'
                  : ''}
              </dd>
            </div>

            <div>
              <dt>Diastolic Blood Pressure</dt>

              <dd>
                {vitals.diastolic ?? '—'}
                {vitals.diastolic != null
                  ? ' mmHg'
                  : ''}
              </dd>
            </div>

          </dl>
        ) : (
          <p className="muted">
            No vital measurements are available.
          </p>
        )}
      </div>

      {/* RECENT HEALTH HISTORY */}

      <div className="cmo-profile__section">
        <h3>Recent Medical Readings</h3>

        {history.length === 0 ? (
          <p className="muted">
            No medical readings recorded yet.
          </p>
        ) : (
          <ol className="cmo-profile__history">
            {history
              .slice(0, 10)
              .map((record) => (
                <li key={record.id}>
                  <div>
                    <strong>
                      {KIND[record.kind] ??
                        record.kind}
                    </strong>

                    {' · '}

                    <time
                      dateTime={record.recorded_at}
                    >
                      {stamp(record.recorded_at)}
                    </time>
                  </div>

                  <StatusChip
                    status={record.status}
                    icon
                  />

                  {record.reasons?.length > 0 && (
                    <ul className="cmo-feed__reasons">
                      {record.reasons
                        .slice(0, 3)
                        .map((reason, i) => (
                          <li key={i}>
                            {reason}
                          </li>
                        ))}
                    </ul>
                  )}

                  {!isSeed(record) && (
                    <SyncBadge record={record} />
                  )}
                  <RecordObservationContexts record={record} />
                </li>
              ))}
          </ol>
        )}
      </div>

      <PersistedObservationHistory crewCode={crewMember.id} />
      <SourceLabel
        source={
          fromServer
            ? SOURCE_SERVER
            : SOURCE_DEVICE
        }
      />
    </section>
  );
}

// --------------------------------------------------
// SECTION 6: MAIN MEDICAL OFFICER DASHBOARD
// --------------------------------------------------

export default function CrewMedicalOfficer({ profileId }) {
  const {
    fromServer,
    live,
    error,
    crew,
    baselines,
    readings,
  } = useCmoData();

  // NEW: Search bar state.
  const [searchQuery, setSearchQuery] = useState('');

  // NEW: Currently selected crew member.
  const [selectedCrewId, setSelectedCrewId] =
    useState(null);

  // Existing crew health calculations.
  const cards = useMemo(
    () =>
      buildCrewCards({
        crew,
        readings,
        baselines,
      }),
    [crew, readings, baselines]
  );

  // Existing watch and alert feed.
  const feed = useMemo(
    () => flaggedFeed(readings, 12),
    [readings]
  );

  const counts = statusCounts(cards);

  const names = Object.fromEntries(
    crew.map((member) => [
      member.id,
      member.name,
    ])
  );

  /**
   * NEW: Search functionality.
   *
   * Filters by:
   * - Name
   * - Role/title
   * - Crew ID
   *
   * Search is case-insensitive.
   */
  const filteredCards = useMemo(() => {
    const query = searchQuery
      .trim()
      .toLowerCase();

    if (!query) return cards;

    return cards.filter((card) =>
      [
        card.name,
        card.title,
        card.role,
        card.id,
      ].some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(query)
      )
    );
  }, [cards, searchQuery]);

  // Open a crew member's medical profile.
  function openMedicalProfile(crewId) {
    setSelectedCrewId(crewId);
  }

  // Close the selected medical profile.
  function closeMedicalProfile() {
    setSelectedCrewId(null);
  }

  return (
    <div className="cmo">

      {/* MAIN DASHBOARD HEADER */}

      <section
        className="card card--lg cmo__bar"
        aria-labelledby="cmo-title"
      >
        <div className="cmo__bar-main">
          <p className="cmo__eyebrow">Crew Medical Officer</p>

          <h2
            id="cmo-title"
            className="view-title"
          >
            Mission Health Dashboard
          </h2>

          <p className="muted">
            Monitor the entire crew's health,
            review medical readings,
            and identify potential health concerns.
          </p>
        </div>

        {/* CREW HEALTH SUMMARY */}

        <ul
          className="cmo__counts"
          aria-label="Crew by status"
        >
          {['alert', 'watch', 'normal', 'unknown'].map(
            (status) => (
              <li
                key={status}
                className={`cmo__count status-text--${status}`}
              >
                <StatusIcon
                  status={status}
                  size={18}
                />

                <span className="num cmo__count-n">
                  {counts[status]}
                </span>

                <span>
                  {STATUS_LABELS[status]}
                </span>
              </li>
            )
          )}
        </ul>

        {/* CONNECTION STATUS */}

        <p
          className={`cmo__live${
            live ? ' is-live' : ''
          }`}
          role="status"
        >
          <span
            className="cmo__live-dot"
            aria-hidden="true"
          />

          {live
            ? 'Live: updates as crew log readings'
            : fromServer
              ? 'Connecting to live updates…'
              : 'Showing saved readings'}
        </p>

        {error && (
          <p
            className="field__error"
            role="alert"
          >
            Live updates unavailable. Showing saved readings.
          </p>
        )}
      </section>

      {/* MAIN DASHBOARD LAYOUT */}

      <div className="cmo__layout">

        {/* CREW MEMBERS */}

        <section
          className="card card--lg"
          aria-labelledby="cmo-crew-title"
        >
          <h3
            id="cmo-crew-title"
            className="card__title"
          >
            Crew Health Overview
          </h3>

          {/* NEW: SEARCH BAR */}

          <div className="cmo-search-wrapper">
            <label
              htmlFor="cmo-crew-search"
              className="cmo-search-label"
            >
              Search Crew Members
            </label>

            <input
              id="cmo-crew-search"
              type="search"
              className="cmo-search"
              placeholder="Search by name, role or crew ID..."
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(event.target.value)
              }
            />

            <p className="muted">
              Showing {filteredCards.length} of{' '}
              {cards.length} crew members
            </p>
          </div>

          {/* CREW SEARCH RESULTS */}

          {filteredCards.length === 0 ? (
            <p className="muted">
              No crew members match your search.
            </p>
          ) : (
            <ol className="cmo__cards">
              {filteredCards.map((card) => (
                <CrewCard
                  key={card.id}
                  card={card}
                  onOpenProfile={openMedicalProfile}
                  expanded={selectedCrewId === card.id}
                  readings={readings}
                  fromServer={fromServer}
                  profileId={profileId}
                  onClose={closeMedicalProfile}
                />
              ))}
            </ol>
          )}

          <SourceLabel
            source={`${
              fromServer
                ? SOURCE_SERVER
                : SOURCE_DEVICE
            } · Preflight: ${
              fromServer
                ? BASELINE_SERVER
                : BASELINE_DEVICE
            }`}
          />
        </section>

        {/* EXISTING ALERT FEED */}

        <section
          className="card card--lg cmo__feed"
          aria-labelledby="cmo-feed-title"
        >
          <h3
            id="cmo-feed-title"
            className="card__title"
          >
            Newest Watch and Alert Readings
          </h3>

          {feed.length === 0 ? (
            <p className="muted">
              No watch or alert readings.
            </p>
          ) : (
            <ol className="cmo-feed">
              {feed.map((record) => (
                <li
                  key={record.id}
                  className={`cmo-feed__item cmo-feed__item--${record.status}`}
                >
                  <div className="cmo-feed__head">
                    <StatusChip
                      status={record.status}
                      icon
                    />

                    <strong>
                      {names[record.crew_id] ??
                        record.crew_id}
                    </strong>

                    <span className="muted">
                      {KIND[record.kind] ??
                        record.kind}
                    </span>

                    <time
                      className="muted cmo-feed__time"
                      dateTime={record.recorded_at}
                    >
                      {stamp(record.recorded_at)}
                    </time>

                    {!isSeed(record) && (
                      <SyncBadge record={record} />
                    )}
                  </div>

                  <ul className="cmo-feed__reasons">
                    {(record.reasons ?? [])
                      .slice(0, 3)
                      .map((reason, i) => (
                        <li key={i}>
                          {reason}
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}

          <SourceLabel
            source={
              fromServer
                ? SOURCE_SERVER
                : SOURCE_DEVICE
            }
          />
        </section>

      </div>
    </div>
  );
}
