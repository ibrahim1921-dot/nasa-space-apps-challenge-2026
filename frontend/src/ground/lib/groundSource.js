// The ground console's one data interface. The UI only calls these methods, so pass 2 can swap this
// local source for one backed by Supabase without UI changes.
//
// Pass 1 (this file) reads this browser: the bundled data files, the demo clock (ahm.demo.v1), the
// mission profile (ahm.missionProfile.v1), check-ins and exams (ahm.dailyVitals.v1), stand tests
// (ahm.standTests.v1), emergencies (ahm.emergency.v1) and ground messages (ahm.groundMessages.v1).
// The check-in and stand-test stores read window.localStorage themselves, so `storage` must be that
// same storage (tests put an in-memory one on globalThis.window).
//
// Crew cards are built exactly as the Crew tab does on the device (views/CrewMedicalOfficer.jsx):
// seed readings + this device's records up to the demo's today + simulated sensor days, scored and
// summarised by buildCrewCards. Timelines are built as the emergency summary builds them
// (hooks/useEmergency.jsx): buildTimeline over crew.json days, sensor days and saved readings.
// No real downlink exists yet, so "reached Earth" = recorded time + the profile's one-way delay.

import { buildCrewCards, mergeReadings } from '../../lib/cmoSummary.js';
import { DEMO_KEY, onOrBefore } from '../../lib/demoState.js';
import { sensorDaysUntil } from '../../lib/sensorFeed.js';
import { isExamRecord, isSensorRecord, sensorRecords, timelineItems } from '../../lib/sensorRecords.js';
import { buildTimeline, VITALS_ROWS, READING_FIELDS } from '../../lib/vitalsCheckin.js';
import { provenanceOf, recordChips } from '../../lib/provenance.js';
import { readAllVitals, readVitalsCheckins } from '../../lib/vitalsCheckinStore.js';
import { readAllStandTests, newRecordId } from '../../lib/standTestStore.js';
import { crewDaysOf, deviceSeed, environmentFile } from './data.js';
import { demoClock } from './clock.js';
import { arrivedOnEarthAt, delayLabel, profileFrom } from './delay.js';
import { FRESHNESS_RULE, freshnessOf } from './freshness.js';
import { aboutCrew, bandFor, handoffText, listEmergencies, openList, recentList, viewOf } from './emergencyView.js';
import { addMessage, newMessage, readMessages, status as messageStatus, validateDraft } from './messages.js';
import { buildGroundSummary } from './groundSummary.js';

export const TREND_DAYS = 14;

/**
 * The crew app's check-in and stand-test storage keys (lib/vitalsCheckinStore.js, lib/standTestStore.js;
 * not exported there). Used only to notice changes for the cache; the stores still do the reading.
 */
export const RECORD_KEYS = ['ahm.dailyVitals.v1', 'ahm.standTests.v1'];

const isSeed = (r) => r?.payload?.origin === 'seed';
const newestFirst = (a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at);
const SEVERITY = { alert: 1, watch: 2, normal: 3 };

const fmt = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10) / 10) : null);

/** A saved reading (snake_case keys) as display rows: [{ id, label, value, unit }]. */
export function valuesOf(reading = {}) {
  return VITALS_ROWS.flatMap((row) => {
    const parts = row.parts.map((k) => fmt(reading[k]));
    return parts.some((p) => p === null) ? [] : [{ id: row.id, label: row.name, value: parts.join('/'), unit: row.unit }];
  });
}

/**
 * @param {{ storage: Storage|null, realNow?: () => Date, newId?: () => string }} p
 */
export function createLocalGroundSource({ storage, realNow = () => new Date(), newId = newRecordId } = {}) {
  let cache = { key: null, value: null };
  const raw = (k) => {
    try {
      return storage?.getItem(k) ?? '';
    } catch {
      return '';
    }
  };

  /** Everything one read needs. The scored readings are reused while their inputs are unchanged. */
  function context() {
    const real = realNow();
    const clock = demoClock(storage, real);
    const profile = profileFrom(storage);
    const emergencies = listEmergencies(storage);
    const key = [clock.today, raw(DEMO_KEY), ...RECORD_KEYS.map(raw)].join('\u0000');
    if (cache.key !== key) cache = { key, value: scored(clock) };
    return { real, clock, profile, emergencies, ...cache.value };
  }

  /** Readings, sensor days and cards for the demo's today (the slow part: sensor days are scored). */
  function scored(clock) {
    const seed = deviceSeed();
    const local = [...readAllVitals(), ...readAllStandTests()];
    // Saved readings dated after the demo's today stay hidden until the clock reaches them (as in the crew app).
    const stored = onOrBefore(mergeReadings(seed.readings, local), clock.today);
    const sensorDays = Object.fromEntries(
      seed.crew.map((c) => [c.id, sensorDaysUntil({ crewId: c.id, crewDays: crewDaysOf(c.id), untilDate: clock.today, demo: clock.state })]),
    );
    const sensors = seed.crew.flatMap((c) =>
      sensorRecords({
        crewId: c.id,
        crewDays: crewDaysOf(c.id),
        sensorDays: sensorDays[c.id],
        saved: stored.filter((r) => r.crew_id === c.id && r.kind === 'daily_vitals' && !isSeed(r) && r.payload?.reading),
      }),
    );
    const shownSensors = sensors.filter((r) => !r.payload?.exams?.some((x) => x.fields?.length));
    const readings = [...stored, ...shownSensors];
    const cards = buildCrewCards({ crew: seed.crew, readings, baselines: seed.baselines });
    return { readings, sensorDays, cards };
  }

  function memberFrom(ctx, card) {
    const mine = ctx.readings.filter((r) => r.crew_id === card.id).sort(newestFirst);
    const lastRecordedAt = mine[0]?.recorded_at ?? null;
    const lastArrivedAt = lastRecordedAt ? arrivedOnEarthAt(lastRecordedAt, ctx.profile) : null;
    const open = openList(aboutCrew(ctx.emergencies, card.id));
    const standReasons = card.stand && !card.standIsPreflight ? card.stand.reasons ?? [] : [];
    return {
      id: card.id,
      name: card.name,
      title: card.title,
      role: card.role,
      status: card.status,
      reasons: [...(card.vitals?.reasons ?? []), ...standReasons],
      lastRecordedAt,
      lastArrivedAt,
      freshness: freshnessOf(lastArrivedAt, ctx.clock.now),
      openEmergency: open[0] ? { id: open[0].id, drill: open[0].drill } : null,
      latestVitals: card.vitals,
    };
  }

  function crewListFrom(ctx) {
    const rank = (m) => (m.openEmergency ? (m.openEmergency.drill ? 0.5 : 0) : SEVERITY[m.status] ?? 4);
    // buildCrewCards order (worst first, then crew order) breaks ties.
    return ctx.cards.map((c, i) => ({ m: memberFrom(ctx, c), i })).sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i).map((x) => x.m);
  }

  function timelineFrom(ctx, crewId) {
    const saved = timelineItems(onOrBefore(readVitalsCheckins(crewId), ctx.clock.today));
    return buildTimeline({ crewDays: crewDaysOf(crewId), sensorDays: ctx.sensorDays[crewId] ?? [], saved });
  }

  function recordsFrom(ctx, crewId) {
    return onOrBefore(readVitalsCheckins(crewId), ctx.clock.today)
      .filter((r) => r.payload?.reading && !isSensorRecord(r))
      .map((r) => {
        const exam = isExamRecord(r);
        return {
          id: r.id,
          crew_id: r.crew_id,
          kind: exam ? 'exam' : 'checkin',
          recorded_at: r.recorded_at,
          arrived_at: arrivedOnEarthAt(r.recorded_at, ctx.profile),
          status: r.status ?? null,
          reasons: r.reasons ?? [],
          values: valuesOf(r.payload.reading),
          chips: recordChips(r),
          entered_by: provenanceOf(r)?.enteredBy ?? null,
          note: r.payload.note ?? null,
        };
      });
  }

  function trendsFrom(ctx, crewId, member) {
    const timeline = timelineFrom(ctx, crewId).filter((d) => typeof d.date === 'string' && d.date <= ctx.clock.today);
    const days = timeline.slice(-TREND_DAYS);
    const indicators = member?.latestVitals?.payload?.result?.indicators ?? {};
    return VITALS_ROWS.map((row) => {
      const keys = row.parts.map((k) => READING_FIELDS[k].baselineKey);
      const latest = [...days].reverse().find((d) => keys.every((k) => fmt(d[k]) !== null));
      return {
        id: row.id,
        label: row.name,
        unit: row.unit,
        values: days.map((d) => d[keys[0]] ?? null),
        dates: days.map((d) => d.date),
        latest: latest ? keys.map((k) => fmt(latest[k])).join('/') : null,
        latestDate: latest?.date ?? null,
        status: indicators[row.id]?.status ?? null,
      };
    });
  }

  return {
    /** Demo date, mission profile and labels for the header. */
    info() {
      const ctx = context();
      return { today: ctx.clock.today, profile: ctx.profile, delayLabel: delayLabel(ctx.profile), freshnessRule: FRESHNESS_RULE };
    },
    /** Every crew member: open emergency first, then alert, watch, normal. */
    crewList() {
      return crewListFrom(context());
    },
    /** One crew member's card, or null. */
    crewMember(crewId) {
      return crewListFrom(context()).find((m) => m.id === crewId) ?? null;
    },
    /** buildTimeline() output for the demo's today, oldest first. */
    timelineFor(crewId) {
      return timelineFrom(context(), crewId);
    },
    /** The last 14 timeline days per reading row. */
    trendsFor(crewId) {
      const ctx = context();
      const card = ctx.cards.find((c) => c.id === crewId);
      return trendsFrom(ctx, crewId, card ? memberFrom(ctx, card) : null);
    },
    /** Check-ins and CMO exams saved for this person, newest first, with provenance and entered_by. */
    recordsFor(crewId) {
      return recordsFrom(context(), crewId);
    },
    /** environment.json (station measurements). */
    environment() {
      return environmentFile;
    },
    /** Open emergencies, then those ended in the last 7 days, each with its view, timeline and handoff summary. */
    emergencies() {
      const ctx = context();
      const nowMs = ctx.real.getTime();
      const seededCount = (id) => crewDaysOf(id).length;
      return [...openList(ctx.emergencies), ...recentList(ctx.emergencies, nowMs)].map((em) => ({
        ...viewOf(em),
        summary: handoffText(em, {
          timeline: em.patient_crew_id ? timelineFrom(ctx, em.patient_crew_id) : [],
          today: ctx.clock.today,
          seededCount: em.patient_crew_id ? seededCount(em.patient_crew_id) : 0,
          profile: ctx.profile,
        }),
      }));
    },
    /** The console band, or null when no emergency is open. */
    band() {
      const ctx = context();
      return bandFor(ctx.emergencies, ctx.real.getTime());
    },
    /** Sent messages, newest first, each with its delivery status now. */
    messages() {
      const nowMs = realNow().getTime();
      return readMessages(storage).map((m) => ({ ...m, status: messageStatus(m, nowMs) }));
    },
    /** @returns {{ ok: true, message } | { ok: false, error: string }} */
    sendMessage(draft) {
      const error = validateDraft(draft);
      if (error) return { ok: false, error };
      const message = newMessage(draft, { profile: profileFrom(storage), at: realNow().toISOString(), id: newId() });
      return addMessage(storage, message) ? { ok: true, message } : { ok: false, error: 'This browser would not save the message.' };
    },
    /** The printable summary for one crew member: { blocks, text }, or null. */
    summaryFor(crewId) {
      const ctx = context();
      const card = ctx.cards.find((c) => c.id === crewId);
      if (!card) return null;
      return buildGroundSummary({
        member: memberFrom(ctx, card),
        timeline: timelineFrom(ctx, crewId),
        records: recordsFrom(ctx, crewId),
        emergencies: aboutCrew(ctx.emergencies, crewId),
        profile: ctx.profile,
        today: ctx.clock.today,
        seededCount: crewDaysOf(crewId).length,
        nowMs: ctx.real.getTime(),
      });
    },
  };
}
