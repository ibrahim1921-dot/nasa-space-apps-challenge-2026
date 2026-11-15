"""Synthetic personal reference parameters and controls, never clinical thresholds."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
import math
from uuid import UUID, uuid5, NAMESPACE_URL

from .catalog import CATALOG, CONTEXTS, METRICS, RADIATION, SCENARIOS


@dataclass(frozen=True)
class Parameter:
    reference_value: float
    noise_sd: float

    def __post_init__(self):
        if not all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
                   for value in (self.reference_value, self.noise_sd)) or self.noise_sd < 0:
            raise ValueError("Personal parameters require finite references and nonnegative noise_sd")


@dataclass
class AstronautParameters:
    astronaut_id: str
    crew_code: str
    original: dict[str, Parameter]
    contexts: dict[str, dict[str, Parameter]]

    def validate(self):
        UUID(self.astronaut_id)
        if not self.crew_code.strip() or set(self.original) != set(METRICS) or set(self.contexts) != set(CONTEXTS):
            raise ValueError("Supply identity, all eleven metrics, and all five explicit contexts")
        for series in [self.original, *self.contexts.values()]:
            if set(series) != set(METRICS) or not all(isinstance(value, Parameter) for value in series.values()):
                raise ValueError("Every context must explicitly define all metric parameters; UNKNOWN is not a wildcard")
            for key, value in series.items():
                mean = value.reference_value
                if key == f"{RADIATION}.value":
                    if mean != 0:
                        raise ValueError("A new synthetic radiation origin must start at zero")
                elif key == "mood.score":
                    if not 1 <= mean <= 5:
                        raise ValueError("Demo mood reference must fit its explicitly synthetic 1-5 scope")
                elif key == "sleep_hours.duration":
                    if not 0 <= mean <= 24:
                        raise ValueError("Demo sleep reference must fit a completed daily session")
                elif mean <= 0:
                    raise ValueError("Demo physiological references must be positive")
        for key, original in self.original.items():
            original_context = "SLEEPING" if key == "sleep_hours.duration" else "RESTING"
            if self.contexts[original_context][key] != original:
                raise ValueError("Original context parameters must match original; edit original instead of creating a conflicting series")


def demo_profile(crew_code="sim-crew-01", astronaut_id=None) -> AstronautParameters:
    """Illustrative reference values, not fitted data, normal ranges, or NASA guidance."""
    values = [(64, 2), (116, 3), (74, 2), (4.9, .12), (36.7, .05), (7.6, .25),
              (4, .2), (36, .4), (28, .05), (1.08, .001), (0, 0)]
    original = {key: Parameter(*value) for key, value in zip(METRICS, values)}
    shifts = {
        "RESTING": {},
        "EXERCISING": {"heart_rate.value": 60, "blood_pressure.systolic": 25,
                       "blood_pressure.diastolic": 5, "blood_sugar.value": .4, "body_temperature.value": .35},
        "SLEEPING": {"heart_rate.value": -9, "blood_pressure.systolic": -10,
                     "blood_pressure.diastolic": -5, "blood_sugar.value": -.15, "body_temperature.value": -.2},
        "OTHER": {"heart_rate.value": 12, "blood_pressure.systolic": 6,
                  "blood_pressure.diastolic": 2, "body_temperature.value": .15},
        "UNKNOWN": {},  # Explicit parameters, not fallback matching.
    }
    contexts = {context: {key: Parameter(value.reference_value + offsets.get(key, 0), value.noise_sd)
                          for key, value in original.items()} for context, offsets in shifts.items()}
    return AstronautParameters(astronaut_id or str(uuid5(NAMESPACE_URL, f"astrohealth-fictional:{crew_code}")),
                               crew_code, original, contexts)


@dataclass
class SimulationConfig:
    seed: int = 42
    start_at: datetime = field(default_factory=lambda: datetime(2026, 1, 1, 8, tzinfo=timezone.utc))
    scenario: str = "normal"
    tick_minutes: int = 15
    time_scale: float = 86400  # simulated seconds per virtual wall-clock second passed to advance()
    stress: float = .1
    activity: float = .7
    sleep_hours: float = 8
    radiation_mgy_per_day: float = .25
    radiation_multiplier: float = 1
    cadences: dict[str, int] = field(default_factory=lambda: {key: value.cadence_minutes for key, value in CATALOG.items()})
    profiles: list[AstronautParameters] = field(default_factory=lambda: [demo_profile()])

    def validate(self):
        if not isinstance(self.seed, int) or isinstance(self.seed, bool) or self.scenario not in SCENARIOS:
            raise ValueError("Seed must be an integer; scenario must be supported")
        if self.start_at.tzinfo is None or self.start_at.utcoffset() is None:
            raise ValueError("start_at requires a timezone")
        if not isinstance(self.tick_minutes, int) or isinstance(self.tick_minutes, bool) or self.tick_minutes <= 0:
            raise ValueError("tick_minutes must be a positive integer")
        if not all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
                   for value in (self.time_scale, self.stress, self.activity,
                                                     self.sleep_hours, self.radiation_mgy_per_day, self.radiation_multiplier)):
            raise ValueError("Controls must be finite")
        if self.time_scale <= 0 or not 0 <= self.stress <= 1 or not 0 <= self.activity <= 1:
            raise ValueError("time_scale must be positive; stress/activity must be in [0,1]")
        if not 0 <= self.sleep_hours <= 24 or min(self.radiation_mgy_per_day, self.radiation_multiplier) < 0:
            raise ValueError("sleep_hours must be in [0,24]; radiation controls must be nonnegative")
        if set(self.cadences) != set(CATALOG):
            raise ValueError("A cadence is required for each indicator")
        for code, minutes in self.cadences.items():
            if not isinstance(minutes, int) or isinstance(minutes, bool) or minutes <= 0 or minutes % self.tick_minutes:
                raise ValueError("Cadences must be positive integer multiples of tick_minutes")
            if code == "sleep_hours" and minutes != 1440:
                raise ValueError("Completed daily sleep sessions have a fixed 1440-minute cadence")
        if not self.profiles or len({p.astronaut_id for p in self.profiles}) != len(self.profiles):
            raise ValueError("Supply unique astronaut UUIDs")
        if len({p.crew_code for p in self.profiles}) != len(self.profiles):
            raise ValueError("Supply unique crew codes")
        for profile in self.profiles:
            profile.validate()

    @classmethod
    def from_dict(cls, document: dict):
        if not isinstance(document, dict):
            raise ValueError("Configuration must be a JSON object")
        data = dict(document)
        if "start_at" in data:
            if not isinstance(data["start_at"], str):
                raise ValueError("start_at must be an ISO timestamp string")
            data["start_at"] = datetime.fromisoformat(data["start_at"].replace("Z", "+00:00"))
        if "cadences" in data:
            data["cadences"] = {**{key: value.cadence_minutes for key, value in CATALOG.items()}, **data["cadences"]}
        if "profiles" in data:
            if not isinstance(data["profiles"], list):
                raise ValueError("profiles must be a list")
            profiles = []
            for item in data["profiles"]:
                if not isinstance(item, dict) or not isinstance(item.get("crew_code"), str):
                    raise ValueError("Each profile needs a string crew_code")
                if set(item) - {"astronaut_id", "crew_code", "original", "contexts"}:
                    raise ValueError("Unknown personal profile field")
                profile = demo_profile(item["crew_code"], item.get("astronaut_id"))
                for key, value in item.get("original", {}).items():
                    if key not in METRICS:
                        raise ValueError(f"Unknown metric: {key}")
                    profile.original[key] = Parameter(**value)
                    # Personal changes propagate while retaining the explicit demo context offsets.
                    for context in CONTEXTS:
                        default = demo_profile().original[key]
                        offset = profile.contexts[context][key].reference_value - default.reference_value
                        profile.contexts[context][key] = Parameter(value["reference_value"] + offset, value["noise_sd"])
                for context, values in item.get("contexts", {}).items():
                    if context not in CONTEXTS or set(values) - set(METRICS):
                        raise ValueError("Unknown context or metric")
                    profile.contexts[context].update({key: Parameter(**value) for key, value in values.items()})
                profiles.append(profile)
            data["profiles"] = profiles
        config = cls(**data)
        config.validate()
        return config
