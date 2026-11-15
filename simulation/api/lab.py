"""Thread-safe lab orchestration and chart projections. No probability model lives here."""

from copy import deepcopy
from datetime import timedelta
import threading
from uuid import uuid4
from urllib.parse import urlencode

from simulation.engine import SimulationConfig, Simulator
from simulation.engine.catalog import CATALOG, RADIATION
from simulation.engine.simulator import iso

PRESETS = [
    {"id": "normal", "label": "Normal", "description": "A daily rhythm of rest, movement and sleep.",
     "controls": {"activity": .7, "stress": .1, "sleep_restriction_hours": 0, "radiation_multiplier": 1}},
    {"id": "exercise", "label": "Exercise", "description": "An exercise bout, followed by recovery.",
     "controls": {"activity": .85, "stress": .15, "sleep_restriction_hours": 0, "radiation_multiplier": 1}},
    {"id": "recovery", "label": "Recovery", "description": "Arousal settles after an exercise bout.",
     "controls": {"activity": .35, "stress": .1, "sleep_restriction_hours": 0, "radiation_multiplier": 1}},
    {"id": "stress_sleep_deprivation", "label": "Stress / Sleep Deprivation", "description": "Coupled stress, fatigue and less sleep.",
     "controls": {"activity": .3, "stress": .8, "sleep_restriction_hours": 3, "radiation_multiplier": 1}},
    {"id": "elevated_radiation", "label": "Elevated Radiation", "description": "Higher synthetic dose rate, without a clinical alert.",
     "controls": {"activity": .7, "stress": .1, "sleep_restriction_hours": 0, "radiation_multiplier": 1}},
]
PROFILE_NAMES = {"sim-crew-01": "Maya Okafor", "sim-crew-02": "Tomas Reyes", "sim-crew-03": "Lena Kowalski"}


class LabError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class SimulationLab:
    def __init__(self, max_records=50_000):
        self.engine = Simulator(SimulationConfig.from_dict({"profiles": [
            {"crew_code": "sim-crew-01"},
            {"crew_code": "sim-crew-02", "original": {"heart_rate.value": {"reference_value": 69, "noise_sd": 2.2}}},
            {"crew_code": "sim-crew-03", "original": {"heart_rate.value": {"reference_value": 60, "noise_sd": 1.8},
                "muscle.grip_strength": {"reference_value": 32, "noise_sd": .4},
                "muscle.muscle_mass": {"reference_value": 25, "noise_sd": .05}}},
        ]}))
        self.lock = threading.RLock()
        self.max_records = max_records
        self.notice = None
        self.runs = []
        self.series = {}
        self.workspace_id = str(uuid4())
        self._export_rows = []
        self._manifests = {}
        self._remember_run()

    def export(self, query):
        """Copy one bounded page of original envelopes in append order, under the driver lock."""
        with self.lock:
            if set(query) - {"workspace_id", "after", "through", "limit"}:
                raise LabError("Unknown export query field.")
            workspace = query.get("workspace_id")
            if workspace is not None and workspace != self.workspace_id:
                raise LabError("Workspace changed; previous in-memory history is unavailable.", 409)
            if ("after" in query or "through" in query) and workspace is None:
                raise LabError("workspace_id is required when continuing an export.")
            def integer(name, default):
                value = query.get(name)
                if value is None:
                    return default
                if not isinstance(value, str) or not value.isascii() or not value.isdecimal() or len(value) > 10:
                    raise LabError(f"{name} must be a nonnegative decimal integer.")
                return int(value)
            total = len(self._export_rows)
            after = integer("after", 0)
            through = integer("through", total)
            limit = integer("limit", 100)
            if not 1 <= limit <= 500:
                raise LabError("limit must be between 1 and 500.")
            if not 0 <= after <= through <= total:
                raise LabError("Export range is outside retained history.")
            end = min(after + limit, through)
            def url(position, frozen):
                parameters = {"workspace_id": self.workspace_id, "after": position, "limit": limit}
                if frozen:
                    parameters["through"] = through
                return "/api/v1/observations?" + urlencode(parameters)
            return {"schema_version": "astrohealth.simulation.export.v1", "synthetic": True,
                    "workspace_id": self.workspace_id, "durable": False,
                    "after": after, "through": through, "last_sequence": end,
                    "retained_observations": total, "record_limit": self.max_records,
                    "items": [{"sequence": index + 1, "envelope": deepcopy(self._export_rows[index])}
                              for index in range(after, end)],
                    "next_url": url(end, True) if end < through else None,
                    "checkpoint_url": url(end, False) if end == through else None}

    def _remember_run(self):
        snapshot = self.engine.snapshot()
        self.runs.append({"run_id": snapshot["run_id"], "origin": snapshot["origin"], "seed": self.engine.config.seed})
        self.series[snapshot["run_id"]] = {}
        self._manifests[snapshot["run_id"]] = deepcopy(self.engine.manifest())

    def manifest(self, run_id=None):
        """Complete original engine manifest and run identity under the driver lock."""
        with self.lock:
            current_run_id = self.engine.run_id
            target_run_id = run_id or current_run_id
            if target_run_id == current_run_id:
                manifest_doc = deepcopy(self.engine.manifest())
            elif target_run_id in self._manifests:
                manifest_doc = deepcopy(self._manifests[target_run_id])
            else:
                raise LabError("Unknown retained run.", 404)
            return {"schema_version": "astrohealth.simulation.manifest.v1", "synthetic": True,
                    "workspace_id": self.workspace_id, "run_id": target_run_id,
                    "manifest": manifest_doc}

    def catalog(self):
        config = self.engine.config
        return {"synthetic": True, "engine_version": "0.1.0", "profiles": [
            {"astronaut_id": p.astronaut_id, "crew_code": p.crew_code, "name": PROFILE_NAMES[p.crew_code]}
            for p in config.profiles], "presets": deepcopy(PRESETS), "families": [
                {"code": code, "name": spec.name, "cadence_minutes": config.cadences[code],
                 "metrics": [{"code": metric, "unit": unit} for metric, unit in spec.metrics]}
                for code, spec in CATALOG.items()]}

    def _settings(self):
        config = self.engine.config
        return {"scenario": config.scenario, "activity": config.activity, "stress": config.stress,
                "sleep_restriction_hours": 8 - config.sleep_hours, "sleep_hours": config.sleep_hours,
                "radiation_multiplier": config.radiation_multiplier, "time_scale": config.time_scale, "seed": config.seed}

    def state(self, astronaut_id=None, run_id=None):
        with self.lock:
            config = self.engine.config
            astronaut_id = astronaut_id or config.profiles[0].astronaut_id
            if astronaut_id not in {p.astronaut_id for p in config.profiles}:
                raise LabError("Unknown fictional astronaut.", 404)
            current = self.engine.snapshot()
            run_id = run_id or current["run_id"]
            if run_id not in self.series:
                raise LabError("Unknown retained run.", 404)
            origin = next(run["origin"] for run in self.runs if run["run_id"] == run_id)
            profile_series = self.series[run_id].get(astronaut_id, {})
            profile = next(p for p in config.profiles if p.astronaut_id == astronaut_id)
            families = []
            for code, spec in CATALOG.items():
                metrics = []
                for metric, unit in spec.metrics:
                    points = profile_series.get(f"{code}.{metric}", [])
                    reference_context = points[-1]["context"] if points else ("SLEEPING" if code == "sleep_hours" else current["context"])
                    metrics.append({"code": metric, "unit": unit, "sample_count": len(points),
                                    "original_reference": profile.original[f"{code}.{metric}"].reference_value,
                                    "context_reference": profile.contexts[reference_context][f"{code}.{metric}"].reference_value,
                                    "reference_context": reference_context,
                                    "latest": deepcopy(points[-1]) if points else None, "points": deepcopy(points[-120:])})
                elapsed = current["tick"] * config.tick_minutes
                due = (elapsed // config.cadences[code] + 1) * config.cadences[code]
                families.append({"code": code, "metrics": metrics,
                                 "next_due_at": iso(config.start_at + timedelta(minutes=due)) if run_id == current["run_id"] else None})
            return {**current, "synthetic": True, "workspace_id": self.workspace_id, "selected_run_id": run_id, "astronaut_id": astronaut_id,
                    "selected_origin": origin, "historical": run_id != current["run_id"], "runs": deepcopy(self.runs),
                    "settings": self._settings(), "families": families, "notice": self.notice,
                    "record_limit": self.max_records, "retained_observations": current["observation_count"]}

    def _budget(self, ticks):
        snapshot = self.engine.snapshot()
        config = self.engine.config
        before = snapshot["tick"] * config.tick_minutes
        after = before + ticks * config.tick_minutes
        estimated = sum((after // minutes - before // minutes) * (2 if code == "muscle" else 1)
                        for code, minutes in config.cadences.items()) * len(config.profiles)
        if snapshot["observation_count"] + estimated > self.max_records:
            if self.engine.state == "RUNNING":
                self.engine.pause()
            self.notice = "Local memory budget reached. History is retained; restart the API for a fresh workspace."
            raise LabError(self.notice, 409)

    def _index(self, rows):
        for row in rows:
            self._export_rows.append(deepcopy(row))
            header = row["observation"]
            series = self.series[header["simulation_metadata"]["run_id"]].setdefault(header["astronaut_id"], {})
            for metric in row["metrics"]:
                key = f"{header['indicator_code']}.{metric['metric_code']}"
                original = next(b for b in row["baseline_parameters"]["original"] if b["metric_code"] == metric["metric_code"])
                activity = next(b for b in row["baseline_parameters"]["activity"] if b["metric_code"] == metric["metric_code"])
                series.setdefault(key, []).append({"at": header["measured_at"], "value": metric["value"],
                    "original": original["reference_value"], "activity": activity["reference_value"],
                    "context": header["activity_context"], "phase": header["simulation_metadata"]["phase"],
                    "scope_code": row["comparison_scope"]["scope_code"],
                    "origin": row["comparison_scope"].get("accumulation_started_at")})

    def advance(self, wall_seconds):
        with self.lock:
            if self.engine.state != "RUNNING":
                return
            config = self.engine.config
            # One extra tick conservatively includes the engine's retained fractional interval.
            ticks = int(wall_seconds * config.time_scale / (config.tick_minutes * 60)) + 1
            self._budget(ticks)
            self._index(self.engine.advance(wall_seconds))

    def command(self, action, body):
        with self.lock:
            expected = body.get("expected_run_id")
            if expected is not None and expected != self.engine.run_id:
                raise LabError("Run changed. Refresh before applying controls.", 409)
            allowed = {"start": set(), "pause": set(), "resume": set(), "reset": {"seed"}, "step": {"days"},
                       "controls": {"scenario", "activity", "stress", "sleep_restriction_hours", "radiation_multiplier", "time_scale"}}
            if action not in allowed:
                raise LabError("Unknown command.", 404)
            if set(body) - allowed[action] - {"expected_run_id"}:
                raise LabError("Unknown command field.")
            try:
                if action in ("start", "resume"):
                    self._budget(1)
                    getattr(self.engine, action)()
                elif action == "pause":
                    self.engine.pause()
                elif action == "reset":
                    if len(self.runs) >= 50:
                        raise LabError("This local workspace retains at most 50 runs. Restart the API for a new workspace.", 409)
                    self._manifests[self.engine.run_id] = deepcopy(self.engine.manifest())
                    self.engine.reset(body.get("seed"))
                    self._remember_run()
                    self.notice = None
                elif action == "step":
                    if self.engine.state != "RUNNING":
                        raise LabError("Start or resume before advancing virtual time.", 409)
                    days = body.get("days")
                    if isinstance(days, bool) or days not in (1, 28):
                        raise LabError("Manual advance must be 1 or 28 virtual days.")
                    ticks = days * 1440 // self.engine.config.tick_minutes
                    self._budget(ticks)
                    self._index(self.engine.step(ticks))
                elif action == "controls":
                    changes = {key: value for key, value in body.items() if key not in ("scenario", "expected_run_id")}
                    if "sleep_restriction_hours" in changes:
                        restriction = changes.pop("sleep_restriction_hours")
                        if isinstance(restriction, bool) or not isinstance(restriction, (int, float)) or not 0 <= restriction <= 8:
                            raise LabError("Sleep restriction must be in [0,8] hours.")
                        changes["sleep_hours"] = 8 - restriction
                    if "time_scale" in changes and not 1 <= changes["time_scale"] <= 604800:
                        raise LabError("Time scale must be in [1,604800].")
                    if "radiation_multiplier" in changes and not 0 <= changes["radiation_multiplier"] <= 10:
                        raise LabError("Radiation intensity must be in [0,10].")
                    self.engine.set_scenario(body.get("scenario", self.engine.config.scenario), **changes)
            except RuntimeError as error:
                raise LabError(str(error), 409) from None
            except (ValueError, TypeError) as error:
                raise LabError(str(error)) from None
