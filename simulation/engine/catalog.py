"""Explicit V4-V17/V22 vocabulary. Units are not frontend or ML display aliases."""

from dataclasses import dataclass

CONTEXTS = ("RESTING", "SLEEPING", "EXERCISING", "OTHER", "UNKNOWN")
SCENARIOS = ("normal", "exercise", "recovery", "stress_sleep_deprivation", "elevated_radiation")


@dataclass(frozen=True)
class Indicator:
    name: str
    storage_kind: str
    value_table: str
    metrics: tuple[tuple[str, str], ...]
    cadence_minutes: int


CATALOG = {
    "heart_rate": Indicator("Heart rate", "SCALAR", "health_measurements", (("value", "beats/min"),), 15),
    "blood_pressure": Indicator("Blood pressure", "BLOOD_PRESSURE", "blood_pressure_observations",
                                (("systolic", "mmHg"), ("diastolic", "mmHg")), 60),
    "blood_sugar": Indicator("Blood glucose", "SCALAR", "health_measurements", (("value", "mmol/L"),), 360),
    "body_temperature": Indicator("Body temperature", "SCALAR", "health_measurements", (("value", "Cel"),), 60),
    "sleep_hours": Indicator("Sleep duration", "SLEEP", "sleep_sessions", (("duration", "h"),), 1440),
    "mood": Indicator("Mood", "MOOD", "mood_assessments", (("score", "score"),), 720),
    "muscle": Indicator("Muscle strength and mass", "MUSCLE", "muscle_assessments",
                        (("grip_strength", "kgf"), ("muscle_mass", "kg")), 10080),
    "bone_mineral_density": Indicator("Bone mineral density", "BONE", "bone_density_examinations",
                                      (("areal_density", "g/cm2"),), 40320),
    "cumulative_absorbed_radiation_dose": Indicator("Personal cumulative absorbed radiation dose", "SCALAR",
                                                  "health_measurements", (("value", "mGy"),), 60),
}
METRICS = {f"{code}.{metric}": unit for code, spec in CATALOG.items() for metric, unit in spec.metrics}
RADIATION = "cumulative_absorbed_radiation_dose"


def scope_for(code: str, metric: str, astronaut_id: str, run_id: str, origin: str) -> dict:
    scope = {"indicator_code": code, "storage_kind": CATALOG[code].storage_kind, "scope_code": "default"}
    if code == "mood":
        scope.update(scope_code="simulation-mood-v1", scale_name="SYNTHETIC_DEMO_MOOD", scale_version="1",
                     scale_min=1, scale_max=5)
    elif code == "muscle":
        grip = metric == "grip_strength"
        scope.update(scope_code=f"simulation-{metric}-v1", body_site="DOMINANT_HAND" if grip else "WHOLE_BODY",
                     protocol_code="SYNTHETIC_DEMO_GRIP" if grip else "SYNTHETIC_DEMO_MUSCLE_MASS", protocol_version="1")
    elif code == "bone_mineral_density":
        scope.update(scope_code="simulation-bone-v1", body_site="LUMBAR_SPINE",
                     protocol_code="SYNTHETIC_DEMO_AREAL_DENSITY", protocol_version="1")
    elif code == RADIATION:
        scope.update(scope_code=f"simulation-dose-{run_id}-{astronaut_id}", body_site="WHOLE_BODY",
                     radiation_astronaut_id=astronaut_id, accumulation_started_at=origin,
                     dosimetry_method="SYNTHETIC_DEMO_ABSORBED_DOSE")
    return scope
