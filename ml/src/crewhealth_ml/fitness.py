"""Muscle and fitness baseline.

Fits age- and sex-specific percentile curves (kernel-smoothed weighted quantiles) for three
fitness tests from the Korean "Body performance" dataset (13,393 adults aged
21-64). The app uses them two ways:

1. Preflight: where does a crew member sit for their age and sex (percentile)?
2. In flight / after landing: how far has the person dropped from their OWN
   preflight value (% change)? This is the personal-baseline part.

Status rules (watch / alert) are not decided here. The backend applies them,
using the cited numbers listed in RULES below.

Run:  python -m crewhealth_ml.fitness            (from the ml/ folder)
Out:  outputs/fitness_norms.json, outputs/fitness_eval.json,
      models/fitness_quantiles.joblib
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import KFold, train_test_split

ML_DIR = Path(__file__).resolve().parents[2]
RAW = ML_DIR / "data" / "raw" / "bodyPerformance.csv"
OUT = ML_DIR / "outputs"
MODELS = ML_DIR / "models"

QUANTILES = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]
AGE_MIN, AGE_MAX = 21, 64
SEED = 42

# id -> (column in the CSV, display name, unit, can it be done in microgravity?)
TESTS = {
    "grip_force": ("gripForce", "Grip strength", "kg", True),
    "broad_jump": ("broad jump_cm", "Standing broad jump", "cm", False),
    "sit_ups": ("sit-ups counts", "Sit-ups", "count", False),
}

RULES = {
    "muscle_loss_reference": (
        "Astronauts can lose up to 20% of muscle mass on flights of 5 to 11 days "
        "(Canadian Space Agency)."
    ),
    "muscle_loss_source": "https://asc-csa.gc.ca/eng/sciences/osm/muscles.asp",
    "suggested_alert_drop_pct": 20,
    "suggested_watch_drop_pct": 10,
    "watch_note": "10% watch line is a team choice (half of the cited 20%), not a NASA limit.",
}


# ---------------------------------------------------------------- load + clean
def load_clean(path: Path = RAW) -> tuple[pd.DataFrame, dict]:
    df = pd.read_csv(path)
    report = {"rows_raw": int(len(df))}

    df = df.drop_duplicates()
    report["duplicates_removed"] = report["rows_raw"] - int(len(df))

    df = df.rename(columns={col: tid for tid, (col, *_ ) in TESTS.items()})
    df["sex"] = df["gender"].map({"M": "male", "F": "female"})
    df = df.dropna(subset=["sex", "age"])

    # 0 kg grip and 0 cm jump are missing tests, not real results.
    # 0 sit-ups is kept: almost all are people aged 50+, so they are plausible.
    removed = {}
    for tid in ("grip_force", "broad_jump"):
        bad = df[tid] <= 0
        removed[tid] = int(bad.sum())
        df.loc[bad, tid] = np.nan
    report["zero_values_set_missing"] = removed
    report["rows_clean"] = int(len(df))
    report["by_sex"] = df["sex"].value_counts().to_dict()
    return df, report


# ------------------------------------------------------------------- modelling
# Smoothed age-sex percentile curves. For each age a..b, take everyone of the
# same sex, weight them by how close their age is (Gaussian kernel, width =
# bandwidth in years), and compute weighted percentiles. The bandwidth is
# chosen by cross-validation in evaluate(). Fast, and every number can be
# explained: "the 25th percentile of grip for women around 35 is X kg".
BANDWIDTHS = [1.5, 3.0, 5.0, 8.0]
DEFAULT_BANDWIDTH = 3.0


def _weighted_quantiles(values, weights, qs):
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cw = np.cumsum(w) - 0.5 * w
    cw /= w.sum()
    return np.interp(qs, cw, v)


def fit_curves(df: pd.DataFrame, bandwidth=DEFAULT_BANDWIDTH) -> dict:
    """bandwidth: one number for all tests, or {test_id: years}."""
    bw_map = bandwidth if isinstance(bandwidth, dict) else {t: bandwidth for t in TESTS}
    ages = np.arange(AGE_MIN, AGE_MAX + 1, dtype=float)
    models = {"bandwidth": bw_map, "ages": ages}
    for tid in TESTS:
        bandwidth = bw_map[tid]
        for sex in ("male", "female"):
            d = df[(df.sex == sex) & df[tid].notna()]
            a, y = d["age"].to_numpy(float), d[tid].to_numpy(float)
            table = np.vstack([
                _weighted_quantiles(y, np.exp(-0.5 * ((a - age) / bandwidth) ** 2), QUANTILES)
                for age in ages
            ])
            models[(tid, sex)] = table
    return models


def predict_quantiles(models: dict, tid: str, sex: str, ages) -> np.ndarray:
    ages = np.clip(np.asarray(ages, float), AGE_MIN, AGE_MAX)
    table, grid = models[(tid, sex)], models["ages"]
    return np.column_stack([np.interp(ages, grid, table[:, i]) for i in range(len(QUANTILES))])


def percentile_of(value: float, qvals) -> float:
    """Approximate percentile (0-100) of a value given the 7 quantile values."""
    qs = np.array(QUANTILES) * 100
    if value <= qvals[0]:
        return float(max(1.0, qs[0] * value / qvals[0])) if qvals[0] > 0 else 1.0
    if value >= qvals[-1]:
        return 99.0
    return float(np.interp(value, qvals, qs))


# ------------------------------------------------------------------ evaluation
def _pinball(y, pred, q):
    diff = y - pred
    return float(np.mean(np.maximum(q * diff, (q - 1) * diff)))


def _coverage_error(train, test, tid, bandwidth):
    m = fit_curves(train, bandwidth)
    errs = []
    for sex in ("male", "female"):
        t = test[test.sex == sex]
        p = predict_quantiles(m, tid, sex, t.age)
        for q_i, q in enumerate(QUANTILES):
            errs.append(abs((t[tid].to_numpy() < p[:, q_i]).mean() - q))
    return float(np.mean(errs))


def evaluate(df: pd.DataFrame) -> dict:
    """Hold-out test + 5-fold CV.

    1. Split 80/20. On the 80%, pick the smoothing bandwidth by 5-fold CV
       (lowest coverage error).
    2. Refit on the 80% with that bandwidth and test on the unseen 20%.
       Coverage: share of unseen people below each percentile line.
       Good = ~5% below the 5th line, ~50% below the median, etc.
    3. Pinball (quantile) loss vs a baseline that ignores age (sex only),
       to show the age curve actually helps.
    """
    result = {}
    for tid in TESTS:
        d = df[df[tid].notna()]
        train, test = train_test_split(d, test_size=0.2, random_state=SEED, stratify=d["sex"])

        cv = {}
        for bw in BANDWIDTHS:
            folds = KFold(5, shuffle=True, random_state=SEED).split(train)
            cv[bw] = float(np.mean([_coverage_error(train.iloc[a], train.iloc[b], tid, bw) for a, b in folds]))
        best_bw = min(cv, key=cv.get)

        models = fit_curves(train, best_bw)
        cov, loss_model, loss_base = {}, [], []
        for q_i, q in enumerate(QUANTILES):
            below, n = 0, 0
            for sex in ("male", "female"):
                t, tr = test[test.sex == sex], train[train.sex == sex]
                y = t[tid].to_numpy()
                pred = predict_quantiles(models, tid, sex, t.age)[:, q_i]
                below += int((y < pred).sum()); n += len(t)
                loss_model.append(_pinball(y, pred, q))
                loss_base.append(_pinball(y, np.quantile(tr[tid], q), q))
            cov[f"p{int(q*100)}"] = round(below / n, 3)
        result[tid] = {
            "train_rows": int(len(train)),
            "test_rows": int(len(test)),
            "cv5_coverage_error_by_bandwidth": {str(k): round(v, 4) for k, v in cv.items()},
            "chosen_bandwidth_years": best_bw,
            "coverage_on_test": cov,
            "coverage_error_on_test": round(_coverage_error(train, test, tid, best_bw), 4),
            "pinball_loss_model": round(float(np.mean(loss_model)), 3),
            "pinball_loss_sex_only_baseline": round(float(np.mean(loss_base)), 3),
            "improvement_pct": round(100 * (1 - np.mean(loss_model) / np.mean(loss_base)), 1),
        }
    return result


# --------------------------------------------------------------------- export
def export_norms(models: dict) -> dict:
    ages = list(range(AGE_MIN, AGE_MAX + 1))
    tests = {}
    for tid, (_, name, unit, in_flight) in TESTS.items():
        tests[tid] = {
            "name": name,
            "unit": unit,
            "smoothing_bandwidth_years": models["bandwidth"][tid],
            "possible_in_microgravity": in_flight,
            "higher_is_better": True,
            "by_sex": {
                sex: {
                    str(a): [round(float(v), 1) for v in row]
                    for a, row in zip(ages, predict_quantiles(models, tid, sex, ages))
                }
                for sex in ("male", "female")
            },
        }
    return {
        "version": "0.1",
        "source": "general human data (Body performance dataset, Korea Sports Promotion Foundation via Kaggle)",
        "label": "General adult fitness norms, not astronaut fitness standards",
        "ages_covered": [AGE_MIN, AGE_MAX],
        "quantiles": [int(q * 100) for q in QUANTILES],
        "how_to_use": (
            "Look up tests[id].by_sex[sex][age] -> values at the listed percentiles. "
            "Interpolate to get a person's percentile. Ages outside the range use the nearest age. "
            "For change: pct_change = 100 * (current - preflight) / preflight."
        ),
        "rules": RULES,
        "tests": tests,
    }


def change_from_preflight(preflight: float, current: float) -> dict:
    """Personal-baseline check used for demo data and tests.
    The backend should implement the same rule in Java."""
    pct = 100.0 * (current - preflight) / preflight
    drop = -pct
    if drop >= RULES["suggested_alert_drop_pct"]:
        status = "alert"
    elif drop >= RULES["suggested_watch_drop_pct"]:
        status = "watch"
    else:
        status = "normal"
    return {"pct_change": round(pct, 1), "status": status}


DEMO_CREW = [  # synthetic crew, matches the three fictional crew in the mock API
    {"crewId": "crew-1", "sex": "female", "age": 38,
     "preflight": {"grip_force": 31.0, "broad_jump": 170.0, "sit_ups": 38},
     "inflight_grip": [31.0, 30.6, 30.1, 29.8, 29.0, 28.7]},
    {"crewId": "crew-2", "sex": "male", "age": 44,
     "preflight": {"grip_force": 46.0, "broad_jump": 205.0, "sit_ups": 45},
     "inflight_grip": [46.0, 45.1, 43.0, 41.2, 40.3, 39.5]},
    {"crewId": "crew-3", "sex": "male", "age": 29,
     "preflight": {"grip_force": 50.5, "broad_jump": 240.0, "sit_ups": 55},
     "inflight_grip": [50.5, 47.0, 44.1, 42.0, 40.2, 39.8]},
]


def demo_scores(models: dict) -> dict:
    """Synthetic example output so frontend/backend can see the shape."""
    out = []
    for c in DEMO_CREW:
        pre = {}
        for tid, v in c["preflight"].items():
            q = predict_quantiles(models, tid, c["sex"], [c["age"]])[0]
            pre[tid] = {"value": v, "unit": TESTS[tid][2],
                        "percentile_for_age_sex": round(percentile_of(v, q)),
                        "median_for_age_sex": round(float(q[3]), 1)}
        weeks = [{"week": i, "grip_force": g, **change_from_preflight(c["preflight"]["grip_force"], g)}
                 for i, g in enumerate(c["inflight_grip"])]
        out.append({"crewId": c["crewId"], "sex": c["sex"], "age": c["age"],
                    "preflight": pre, "inflight_grip_weekly": weeks})
    return {"source": "synthetic", "note": "Demo crew, not real people.", "crew": out}


def main():
    OUT.mkdir(exist_ok=True); MODELS.mkdir(exist_ok=True)
    df, clean_report = load_clean()
    print("Cleaning:", json.dumps(clean_report))

    eval_report = evaluate(df)
    for tid, r in eval_report.items():
        print(f"{tid}: coverage {r['coverage_on_test']}  "
              f"better than sex-only baseline by {r['improvement_pct']}%  "
              f"bandwidth {r['chosen_bandwidth_years']} y")

    # final model on all clean data, each test with its CV-chosen bandwidth
    models = fit_curves(df, {t: r["chosen_bandwidth_years"] for t, r in eval_report.items()})
    joblib.dump({"models": models, "quantiles": QUANTILES}, MODELS / "fitness_quantiles.joblib")
    norms = export_norms(models)
    (OUT / "fitness_norms.json").write_text(json.dumps(norms, indent=1))
    (OUT / "fitness_eval.json").write_text(json.dumps(
        {"cleaning": clean_report, "evaluation": eval_report}, indent=1))
    (OUT / "fitness_demo_scores.json").write_text(json.dumps(demo_scores(models), indent=1))
    print("Wrote outputs/fitness_demo_scores.json")
    print("Wrote outputs/fitness_norms.json, outputs/fitness_eval.json, models/fitness_quantiles.joblib")
    return norms, eval_report


if __name__ == "__main__":
    main()
