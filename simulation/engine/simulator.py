"""Stateful synthetic time series. Coefficients describe a demo, not physiology validated for care."""

from copy import deepcopy
from dataclasses import asdict
from datetime import timedelta, timezone
from decimal import Decimal
import hashlib
import math
import random
from uuid import NAMESPACE_URL, uuid5

from .catalog import CATALOG, METRICS, RADIATION, scope_for
from .config import SimulationConfig


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class Simulator:
    """Explicit clock; no threads, network, database, trained model, or wall-clock sleeps."""

    def __init__(self, config=None):
        self._config = deepcopy(config or SimulationConfig())
        self._config.validate()
        self._history = []
        self._run_number = 0
        self._initialize()

    def _initialize(self):
        self.state = "READY"
        self.now = self._config.start_at.astimezone(timezone.utc)
        self._ticks = 0
        self._scenario_started_tick = 0
        self._pending_seconds = Decimal(0)
        self.run_id = str(uuid5(NAMESPACE_URL, f"astrohealth-synthetic:{self._config.seed}:{self._run_number}:{iso(self.now)}"))
        self._subjects = {}
        for profile in self._config.profiles:
            seed = int.from_bytes(hashlib.sha256(f"{self._config.seed}:{profile.astronaut_id}".encode()).digest(), "big")
            self._subjects[profile.astronaut_id] = {
                "rng": random.Random(seed), "arousal": .9 if self._config.scenario == "recovery" else 0.,
                "fatigue": 0., "dose": 0.,
                "residuals": {key: 0. for key in METRICS},
            }

    @property
    def config(self):
        """Configuration snapshot; mutate controls only through set_scenario()."""
        return deepcopy(self._config)

    @property
    def history(self):
        """Read-only-by-copy run archive: reset never clears or mutates earlier observations."""
        return tuple(deepcopy(self._history))

    def start(self):
        if self.state != "READY":
            raise RuntimeError("start requires READY; use resume for PAUSED")
        self.state = "RUNNING"

    def pause(self):
        if self.state != "RUNNING":
            raise RuntimeError("pause requires RUNNING")
        self.state = "PAUSED"

    def resume(self):
        if self.state != "PAUSED":
            raise RuntimeError("resume requires PAUSED")
        self.state = "RUNNING"

    def reset(self, seed=None):
        if seed is not None:
            candidate = deepcopy(self._config)
            candidate.seed = seed
            candidate.validate()
            self._config = candidate
        self._config.start_at = self.now  # Retain timeline continuity and give radiation a distinct new origin.
        self._run_number += 1
        self._initialize()  # New run and dose origin; retained history is untouched.

    def set_scenario(self, scenario, **controls):
        allowed = {"stress", "activity", "sleep_hours", "radiation_mgy_per_day", "radiation_multiplier", "time_scale"}
        if set(controls) - allowed:
            raise ValueError("Only stress, activity, sleep, radiation and time-scale controls may change during a run")
        candidate = deepcopy(self._config)
        candidate.scenario = scenario
        for key, value in controls.items():
            setattr(candidate, key, value)
        candidate.validate()
        if scenario != self._config.scenario:
            self._scenario_started_tick = self._ticks
            if scenario == "recovery":
                for subject in self._subjects.values():
                    subject["arousal"] = max(subject["arousal"], .9)
        self._config = candidate

    def snapshot(self):
        """Small state view for adapters; does not copy retained observation history."""
        context, phase = self._context()
        return {"state": self.state, "virtual_at": iso(self.now), "run_id": self.run_id,
                "tick": self._ticks, "context": context, "phase": phase,
                "origin": iso(self._config.start_at), "observation_count": len(self._history)}

    def advance(self, wall_seconds):
        """Advance a supplied clock interval at time_scale. Paused intervals are discarded."""
        if not math.isfinite(wall_seconds) or wall_seconds < 0:
            raise ValueError("wall_seconds must be finite and nonnegative")
        if self.state == "PAUSED":
            return []
        if self.state != "RUNNING":
            raise RuntimeError("Start the simulator before advancing")
        total = self._pending_seconds + Decimal(str(wall_seconds)) * Decimal(str(self._config.time_scale))
        tick_seconds = self._config.tick_minutes * 60
        ticks = int(total // tick_seconds)
        if ticks > 100_000:
            raise ValueError("Advance at most 100000 ticks per call")
        self._pending_seconds = total % tick_seconds
        return self.step(ticks)

    def step(self, ticks=1):
        if not isinstance(ticks, int) or isinstance(ticks, bool) or not 0 <= ticks <= 100_000:
            raise ValueError("ticks must be an integer in [0,100000]")
        if self.state == "PAUSED":
            return []
        if self.state != "RUNNING":
            raise RuntimeError("Start the simulator before stepping")
        output = []
        for _ in range(ticks):
            self._ticks += 1
            self.now += timedelta(minutes=self._config.tick_minutes)
            context, phase = self._context()
            for profile in sorted(self._config.profiles, key=lambda item: item.astronaut_id):
                subject = self._subjects[profile.astronaut_id]
                self._evolve(subject, context)
                for code in CATALOG:
                    if self._ticks * self._config.tick_minutes % self._config.cadences[code] == 0:
                        for record in self._measure(profile, subject, code, context, phase):
                            self._history.append(record)
                            output.append(deepcopy(record))
        return output

    def _context(self):
        elapsed_hours = (self._ticks - self._scenario_started_tick) * self._config.tick_minutes / 60
        hour = self.now.hour + self.now.minute / 60
        if self._config.scenario == "exercise" and elapsed_hours < 1:
            return "EXERCISING", "EXERCISE"
        if self._config.scenario == "exercise" and elapsed_hours < 3:
            return "OTHER", "RECOVERY"
        if self._config.scenario == "recovery" and elapsed_hours < 3:
            return "OTHER", "RECOVERY"
        if hour < 8:
            return "SLEEPING", "SLEEP_WINDOW"
        if 17 <= hour < 18:
            return "EXERCISING", "EXERCISE"
        if 18 <= hour < 19:
            return "OTHER", "RECOVERY"
        if self._config.scenario == "stress_sleep_deprivation":
            return "RESTING", "STRESS_SLEEP_DEPRIVATION"
        return "RESTING", "REST"

    def _evolve(self, subject, context):
        dt_hours = self._config.tick_minutes / 60
        stress = min(1., self._config.stress + (.6 if self._config.scenario == "stress_sleep_deprivation" else 0))
        deprivation = max(0., 8 - self._config.sleep_hours) / 8
        if self._config.scenario == "stress_sleep_deprivation":
            deprivation += .35
        rng = subject["rng"]
        target = {"EXERCISING": self._config.activity, "OTHER": .2, "SLEEPING": -.1}.get(context, 0) + stress * .5
        rho = math.exp(-dt_hours / .8)
        subject["arousal"] = rho * subject["arousal"] + (1 - rho) * target + rng.gauss(0, .035 * math.sqrt(1 - rho * rho))
        rho = math.exp(-dt_hours / 12)
        subject["fatigue"] = rho * subject["fatigue"] + (1 - rho) * (deprivation + stress * .25)
        for key in METRICS:
            tau = 24 * 7 if key.startswith(("muscle.", "bone_mineral_density.")) else 2
            rho = math.exp(-dt_hours / tau)
            subject["residuals"][key] = rho * subject["residuals"][key] + rng.gauss(0, math.sqrt(1 - rho * rho))
        multiplier = self._config.radiation_multiplier * (5 if self._config.scenario == "elevated_radiation" else 1)
        # Integrate every tick, not only on emission. Dose never decreases in this origin.
        subject["dose"] += (self._config.radiation_mgy_per_day * multiplier * dt_hours / 24
                            * math.exp(.08 * subject["residuals"][f"{RADIATION}.value"]))

    def _value(self, profile, subject, key, context):
        parameter = profile.contexts[context][key]
        days = self._ticks * self._config.tick_minutes / 1440
        circadian = math.sin(2 * math.pi * (self.now.hour + self.now.minute / 60 - 8) / 24)
        arousal, fatigue = subject["arousal"], subject["fatigue"]
        gains = {"heart_rate.value": (10, 8), "blood_pressure.systolic": (5, 5),
                 "blood_pressure.diastolic": (2, 3), "blood_sugar.value": (.12, .3),
                 "body_temperature.value": (.12, .04), "mood.score": (-.2, -1.2)}
        a, f = gains.get(key, (0, 0))
        value = parameter.reference_value + a * arousal + f * fatigue + parameter.noise_sd * subject["residuals"][key]
        if context in ("EXERCISING", "OTHER"):
            shift = parameter.reference_value - profile.original[key].reference_value
            value += shift * (self._config.activity / .7 - 1)  # .7 defines the demo context reference intensity.
        if key == "heart_rate.value":
            value += 2 * circadian
        elif key == "body_temperature.value":
            value += .08 * circadian
        elif key == "blood_sugar.value":
            hour = self.now.hour + self.now.minute / 60
            value += sum(.5 * math.exp(-((hour - meal) / 1.2) ** 2) for meal in (9, 13, 19))
        elif key.startswith("muscle."):
            value -= parameter.reference_value * (1 - math.exp(-.001 * days * (1 - .6 * self._config.activity)))
        elif key.startswith("bone_mineral_density."):
            value -= parameter.reference_value * (1 - math.exp(-.00015 * days * (1 - .5 * self._config.activity)))
        elif key == "sleep_hours.duration":
            value += self._config.sleep_hours - 8 - fatigue * .5
            if self._config.scenario == "stress_sleep_deprivation":
                value -= 2
        elif key == f"{RADIATION}.value":
            value = subject["dose"]
        if key == "mood.score":
            return round(min(5., max(1., value)), 4)  # Bounds of the synthetic demo scope, not clinical limits.
        if key == "sleep_hours.duration":
            return max(0., value)
        return max(0. if key == f"{RADIATION}.value" else .000001, value)

    def _measure(self, profile, subject, code, context, phase):
        if code == "sleep_hours":
            context = "SLEEPING"  # Context of the completed session, regardless of current awake state.
        spec = CATALOG[code]
        metrics = {metric: self._value(profile, subject, f"{code}.{metric}", context) for metric, _ in spec.metrics}
        if code == "blood_pressure":
            metrics["systolic"] = max(metrics["systolic"], metrics["diastolic"] + 1)
        if code == "sleep_hours":
            window_hours = min(24., max(self._config.sleep_hours + 1, profile.original["sleep_hours.duration"].reference_value + 1))
            seconds = min(int(window_hours * 3600), max(0, round(metrics["duration"] * 3600)))
            values = {"started_at": iso(self.now - timedelta(hours=window_hours)), "ended_at": iso(self.now),
                      "asleep_seconds": seconds}
            metrics["duration"] = round(seconds / 3600, 6)
        elif spec.storage_kind == "SCALAR":
            values = {"metric_code": "value", "value": round(metrics["value"], 6), "unit": spec.metrics[0][1]}
        elif code == "blood_pressure":
            metrics = {key: round(value, 3) for key, value in metrics.items()}
            values = {**metrics, "unit": "mmHg", "method": "SYNTHETIC_DEMO"}
        elif code == "mood":
            values = {"score": metrics["score"], "unit": "score", "notes": "Synthetic demonstration only"}
        elif code == "bone_mineral_density":
            metrics["areal_density"] = max(.000001, round(metrics["areal_density"], 6))
            values = {"areal_density": metrics["areal_density"], "unit": "g/cm2"}
        else:
            # Separate scopes: grip hand/protocol is not a whole-body muscle-mass measurement.
            for metric, unit in spec.metrics:
                value = max(.0001, round(metrics[metric], 4))
                column = "grip_strength_kgf" if metric == "grip_strength" else "muscle_mass_kg"
                yield self._record(profile, code, context, phase, {column: value}, [(metric, value, unit)])
            return
        metric_rows = [(metric, values.get(metric, metrics[metric]), unit) for metric, unit in spec.metrics]
        yield self._record(profile, code, context, phase, values, metric_rows)

    def _record(self, profile, code, context, phase, values, metrics):
        scope = scope_for(code, metrics[0][0], profile.astronaut_id, self.run_id, iso(self._config.start_at))
        original_context = "SLEEPING" if code == "sleep_hours" else "RESTING"
        original, activity, deviations = [], [], []
        for metric, value, unit in metrics:
            # Respect SQL NUMERIC precision/scale; fail explicitly rather than emit invalid JSON/SQL values.
            limit = (100000 if code == "blood_pressure" else 1e6 if code == "bone_mineral_density"
                     else 1e12 if CATALOG[code].storage_kind == "SCALAR" else 1e8)
            if not math.isfinite(value) or abs(value) >= limit:
                raise ValueError("Synthetic value exceeds schema numeric capacity; adjust model parameters")
            key = f"{code}.{metric}"
            for destination, baseline_context, parameter in (
                (original, original_context, profile.original[key]),
                (activity, context, profile.contexts[context][key]),
            ):
                destination.append({"baseline_kind": "ORIGINAL", "version": 1, "metric_code": metric, "unit": unit,
                                    "activity_context": baseline_context, "scope_code": scope["scope_code"],
                                    "reference_value": parameter.reference_value, "simulation_noise_sd": parameter.noise_sd,
                                    "lower_bound": None, "upper_bound": None, "source_name": "Synthetic configured reference"})
            deviations.append({"metric_code": metric, "unit": unit,
                               "from_original": round(value - profile.original[key].reference_value, 6),
                               "from_activity": round(value - profile.contexts[context][key].reference_value, 6)})
        record_id = str(uuid5(NAMESPACE_URL, f"{self.run_id}:{profile.astronaut_id}:{code}:{metrics[0][0]}:{self._ticks}"))
        return {
            "schema_version": "astrohealth.simulation.observation.v1", "source": "synthetic", "is_simulated": True,
            "crew_code": profile.crew_code,
            "observation": {"astronaut_id": profile.astronaut_id, "astronaut_mission_id": None, "checkin_id": None,
                            "indicator_code": code, "storage_kind": CATALOG[code].storage_kind,
                            "comparison_scope_id": None, "activity_context": context, "measured_at": iso(self.now),
                            "source_kind": "SIMULATION", "source_name": "AstroHealth synthetic engine",
                            "source_record_id": record_id, "provenance": {"engine_version": "0.1.0", "synthetic": True},
                            "simulation_metadata": {"run_id": self.run_id, "seed": self._config.seed,
                                                    "scenario": self._config.scenario, "phase": phase,
                                                    "tick": self._ticks, "time_scale": self._config.time_scale,
                                                    "stress": self._config.stress, "activity": self._config.activity,
                                                    "sleep_hours": self._config.sleep_hours,
                                                    "radiation_mgy_per_day": self._config.radiation_mgy_per_day,
                                                    "radiation_multiplier": self._config.radiation_multiplier}},
            "comparison_scope": scope, "value_table": CATALOG[code].value_table, "values": values,
            "metrics": [{"metric_code": metric, "value": value, "unit": unit} for metric, value, unit in metrics],
            "baseline_parameters": {"original": original, "activity": activity}, "baseline_deviations": deviations,
        }

    def manifest(self):
        config = asdict(self._config)
        config["start_at"] = iso(self._config.start_at)
        return {"schema_version": "astrohealth.simulation.run.v1", "engine_version": "0.1.0", "synthetic": True,
                "run_id": self.run_id, "configuration": config,
                "warning": "Synthetic demo parameters, not clinical guidance, a trained model, or an ingestion API."}
