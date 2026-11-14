import numpy as np
import pandas as pd
import pytest

from crewhealth_ml import fitness as f


def test_change_rule():
    assert f.change_from_preflight(50, 50)["status"] == "normal"
    assert f.change_from_preflight(50, 45.5)["status"] == "normal"   # -9%
    assert f.change_from_preflight(50, 45)["status"] == "watch"      # -10%
    assert f.change_from_preflight(50, 40)["status"] == "alert"      # -20%
    assert f.change_from_preflight(50, 55)["status"] == "normal"     # gains are fine


def test_percentile_monotonic():
    q = [10, 12, 15, 20, 25, 28, 30]
    ps = [f.percentile_of(v, q) for v in [5, 10, 15, 20, 26, 30, 40]]
    assert ps == sorted(ps)
    assert f.percentile_of(20, q) == 50


def _synthetic_df(n=4000, seed=0):
    rng = np.random.default_rng(seed)
    age = rng.integers(21, 65, n)
    sex = rng.choice(["male", "female"], n)
    base = np.where(sex == "male", 45, 28) - 0.2 * (age - 21)
    return pd.DataFrame({"age": age, "sex": sex,
                         "grip_force": base + rng.normal(0, 5, n),
                         "broad_jump": 200 - age + rng.normal(0, 20, n),
                         "sit_ups": 50 - 0.5 * age + rng.normal(0, 8, n)})


def test_curves_recover_known_distribution():
    df = _synthetic_df()
    m = f.fit_curves(df, 3.0)
    q = f.predict_quantiles(m, "grip_force", "male", [41])[0]
    assert abs(q[3] - 41) < 1.0             # true median 45 - 0.2*20 = 41
    assert np.all(np.diff(q) >= 0)          # percentiles in order


def test_ages_outside_range_are_clamped():
    m = f.fit_curves(_synthetic_df(), 3.0)
    assert np.allclose(f.predict_quantiles(m, "sit_ups", "female", [10]),
                       f.predict_quantiles(m, "sit_ups", "female", [21]))


@pytest.mark.skipif(not f.RAW.exists(), reason="raw data not downloaded")
def test_real_data_coverage():
    df, _ = f.load_clean()
    ev = f.evaluate(df)
    for r in ev.values():
        assert r["coverage_error_on_test"] < 0.03
