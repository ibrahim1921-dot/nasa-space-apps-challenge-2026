"""Standard-library tests; no ML dependencies, network, or database required."""

from copy import deepcopy
from dataclasses import replace
from datetime import datetime
import json
from pathlib import Path
import statistics
import subprocess
import sys
import unittest

from simulation.engine import Parameter, SimulationConfig, Simulator, demo_profile
from simulation.engine.catalog import CATALOG, CONTEXTS, METRICS, RADIATION


def run(config=None, ticks=96):
    simulator = Simulator(config)
    simulator.start()
    return simulator, simulator.step(ticks)


class EngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.long_engine, cls.month = run(ticks=28 * 96)

    def test_all_nine_families_and_exact_units(self):
        self.assertEqual(set(CATALOG), {row["observation"]["indicator_code"] for row in self.month})
        for row in self.month:
            code = row["observation"]["indicator_code"]
            for metric in row["metrics"]:
                self.assertEqual(METRICS[f"{code}.{metric['metric_code']}"], metric["unit"])
            self.assertEqual(row["observation"]["storage_kind"], CATALOG[code].storage_kind)
            self.assertEqual(row["value_table"], CATALOG[code].value_table)
            self.assertTrue(row["is_simulated"])
            self.assertEqual(row["source"], "synthetic")
            self.assertEqual(row["observation"]["source_kind"], "SIMULATION")
            self.assertIsInstance(row["observation"]["simulation_metadata"], dict)
            self.assertIsNone(row["observation"]["comparison_scope_id"])
            self.assertIn(row["observation"]["activity_context"], CONTEXTS)
        json.dumps(self.month, allow_nan=False)

    def test_subtype_shapes_scopes_and_sleep_consistency(self):
        for row in self.month:
            code, values, scope = row["observation"]["indicator_code"], row["values"], row["comparison_scope"]
            if code == "blood_pressure":
                self.assertGreater(values["systolic"], values["diastolic"])
                self.assertGreater(values["diastolic"], 0)
            elif code == "sleep_hours":
                start, end = (datetime.fromisoformat(values[key]) for key in ("started_at", "ended_at"))
                self.assertEqual(values["ended_at"], row["observation"]["measured_at"])
                self.assertGreater(end, start)
                self.assertLessEqual(values["asleep_seconds"], (end - start).total_seconds())
                self.assertEqual(row["metrics"][0]["value"], round(values["asleep_seconds"] / 3600, 6))
                self.assertNotIn("duration", values)
            elif code == "mood":
                self.assertLessEqual(scope["scale_min"], values["score"])
                self.assertLessEqual(values["score"], scope["scale_max"])
                self.assertEqual(scope["scale_name"], "SYNTHETIC_DEMO_MOOD")
            elif code == "muscle":
                self.assertEqual(len(values), 1)
                self.assertIn(scope["body_site"], ("DOMINANT_HAND", "WHOLE_BODY"))
                self.assertEqual(scope["protocol_version"], "1")
                self.assertNotIn("body_site", values)
            elif code == RADIATION:
                self.assertEqual(scope["radiation_astronaut_id"], row["observation"]["astronaut_id"])
                self.assertLessEqual(datetime.fromisoformat(scope["accumulation_started_at"]),
                                     datetime.fromisoformat(row["observation"]["measured_at"]))

    def test_default_cadences_and_slow_indicator_acceleration(self):
        counts = {code: sum(row["observation"]["indicator_code"] == code for row in self.month) for code in CATALOG}
        minutes = 28 * 1440
        for code, spec in CATALOG.items():
            expected = minutes // spec.cadence_minutes * (2 if code == "muscle" else 1)
            self.assertEqual(counts[code], expected)
        self.assertEqual(counts["bone_mineral_density"], 1)
        accelerated, rows = run(replace(SimulationConfig(), time_scale=28 * 86400), ticks=0)
        rows = accelerated.advance(1)
        # time_scale is intentionally different provenance; physiology and virtual times agree.
        self.assertTrue([r["metrics"] for r in rows] == [r["metrics"] for r in self.month])
        self.assertTrue([r["observation"]["measured_at"] for r in rows]
                        == [r["observation"]["measured_at"] for r in self.month])

    def test_same_seed_same_complete_json_and_other_seed_differs(self):
        first, a = run()
        second, b = run()
        self.assertEqual(first.manifest(), second.manifest())
        self.assertEqual(a, b)
        _, c = run(replace(SimulationConfig(), seed=43))
        self.assertNotEqual([row["metrics"] for row in a], [row["metrics"] for row in c])

    def test_checked_in_sample_matches_actual_seeded_output(self):
        first = {}
        for row in self.month:
            code = row["observation"]["indicator_code"]
            key = (code, row["metrics"][0]["metric_code"] if code == "muscle" else "")
            first.setdefault(key, row)
        expected = sorted(first.values(), key=lambda row: (
            list(CATALOG).index(row["observation"]["indicator_code"]), row["metrics"][0]["metric_code"]))
        sample = json.loads((Path(__file__).resolve().parents[1] / "examples" / "sample.json").read_text(encoding="utf-8"))
        self.assertTrue(sample["synthetic"])
        self.assertTrue(sample["measurements"] == expected)

    def test_chunking_does_not_change_time_series(self):
        one, a = run(ticks=0)
        a = one.advance(.25) + one.advance(.75)
        two, b = run(ticks=0)
        b = two.advance(1)
        self.assertEqual(a, b)

    def test_pause_resume_discards_paused_time_and_preserves_rng(self):
        simulator, first = run(ticks=4)
        before, clock = simulator.history, simulator.now
        simulator.pause()
        self.assertEqual(simulator.advance(100), [])
        self.assertEqual(simulator.step(100), [])
        self.assertEqual(simulator.history, before)
        self.assertEqual(simulator.now, clock)
        simulator.resume()
        rest = simulator.step(4)
        _, uninterrupted = run(ticks=8)
        self.assertEqual(first + rest, uninterrupted)

    def test_reset_retains_history_and_starts_new_origin_without_reusing_ids(self):
        simulator, old = run(ticks=8)
        old_now, old_run = simulator.now, simulator.run_id
        simulator.reset()
        self.assertEqual(simulator.state, "READY")
        self.assertEqual(simulator.now, old_now)
        self.assertNotEqual(simulator.run_id, old_run)
        self.assertEqual(list(simulator.history), old)
        simulator.start()
        new = simulator.step(4)
        self.assertEqual(list(simulator.history), old + new)
        self.assertTrue({r["observation"]["source_record_id"] for r in old}.isdisjoint(
            {r["observation"]["source_record_id"] for r in new}))
        doses = [r for r in old + new if r["observation"]["indicator_code"] == RADIATION]
        self.assertNotEqual(doses[0]["comparison_scope"]["accumulation_started_at"],
                            doses[-1]["comparison_scope"]["accumulation_started_at"])

    def test_radiation_never_decreases_and_elevated_scenario_raises_dose(self):
        doses = [r["values"]["value"] for r in self.month if r["observation"]["indicator_code"] == RADIATION]
        self.assertEqual(doses, sorted(doses))
        simulator, normal = run()
        _, elevated = run(replace(SimulationConfig(), scenario="elevated_radiation"))
        normal_dose = [r["values"]["value"] for r in normal if r["observation"]["indicator_code"] == RADIATION][-1]
        elevated_dose = [r["values"]["value"] for r in elevated if r["observation"]["indicator_code"] == RADIATION][-1]
        self.assertAlmostEqual(elevated_dose / normal_dose, 5, places=4)
        simulator.set_scenario("normal", radiation_multiplier=0)
        later = [r["values"]["value"] for r in simulator.step(96) if r["observation"]["indicator_code"] == RADIATION]
        self.assertTrue(all(value == normal_dose for value in later))

    def test_original_and_activity_baselines_use_exact_context_and_scope(self):
        _, rows = run(replace(SimulationConfig(), scenario="exercise"), ticks=16)
        exercise = next(r for r in rows if r["observation"]["activity_context"] == "EXERCISING")
        self.assertEqual(exercise["baseline_parameters"]["original"][0]["activity_context"], "RESTING")
        self.assertEqual(exercise["baseline_parameters"]["activity"][0]["activity_context"], "EXERCISING")
        self.assertGreater(exercise["baseline_parameters"]["activity"][0]["reference_value"],
                           exercise["baseline_parameters"]["original"][0]["reference_value"])
        recovery = next(r for r in rows if r["observation"]["simulation_metadata"]["phase"] == "RECOVERY")
        self.assertEqual(recovery["observation"]["activity_context"], "OTHER")
        for row in rows:
            for baseline in row["baseline_parameters"]["activity"]:
                self.assertEqual(baseline["scope_code"], row["comparison_scope"]["scope_code"])
                self.assertEqual(baseline["baseline_kind"], "ORIGINAL")
                self.assertIsNone(baseline["lower_bound"])
                self.assertIsNone(baseline["upper_bound"])
            self.assertNotIn("status", row)
            self.assertNotIn("alert", row)

    def test_individual_parameters_and_independent_profile_streams(self):
        second = demo_profile("sim-crew-02")
        second.original["heart_rate.value"] = Parameter(90, 1)
        for context in CONTEXTS:
            old = second.contexts[context]["heart_rate.value"]
            second.contexts[context]["heart_rate.value"] = Parameter(old.reference_value + 26, 1)
        config = SimulationConfig(profiles=[demo_profile(), second])
        _, both = run(config, ticks=8)
        _, alone = run(ticks=8)
        self.assertEqual([r for r in both if r["crew_code"] == "sim-crew-01"], alone)
        heart = {code: [r["metrics"][0]["value"] for r in both if r["crew_code"] == code
                        and r["observation"]["indicator_code"] == "heart_rate"] for code in ("sim-crew-01", "sim-crew-02")}
        self.assertGreater(statistics.mean(heart["sim-crew-02"]), statistics.mean(heart["sim-crew-01"]) + 20)

    def test_scenarios_and_controls_have_correlated_effects(self):
        _, normal = run()
        _, stressed = run(replace(SimulationConfig(), scenario="stress_sleep_deprivation", stress=.8, sleep_hours=5))
        def average(rows, code):
            return statistics.mean(r["metrics"][0]["value"] for r in rows if r["observation"]["indicator_code"] == code)
        self.assertGreater(average(stressed, "heart_rate"), average(normal, "heart_rate"))
        self.assertGreater(average(stressed, "blood_pressure"), average(normal, "blood_pressure"))
        self.assertLess(average(stressed, "mood"), average(normal, "mood"))
        self.assertLess(average(stressed, "sleep_hours"), average(normal, "sleep_hours"))
        _, exercise = run(replace(SimulationConfig(), scenario="exercise"), ticks=4)
        self.assertGreater(average(exercise, "heart_rate"), average(normal[:4], "heart_rate"))
        _, quiet = run(replace(SimulationConfig(), scenario="exercise", activity=0), ticks=3)
        _, intense = run(replace(SimulationConfig(), scenario="exercise", activity=1), ticks=3)
        self.assertGreater(average(intense, "heart_rate"), average(quiet, "heart_rate") + 40)
        engine, _ = run(replace(SimulationConfig(), scenario="recovery"), ticks=1)
        self.assertEqual(engine._context(), ("OTHER", "RECOVERY"))

    def test_custom_cadence_does_not_perturb_other_families(self):
        _, normal = run(ticks=8)
        config = SimulationConfig()
        config.cadences["blood_pressure"] = 120
        _, changed = run(config, ticks=8)
        self.assertEqual([r for r in normal if r["observation"]["indicator_code"] == "heart_rate"],
                         [r for r in changed if r["observation"]["indicator_code"] == "heart_rate"])
        self.assertEqual(sum(r["observation"]["indicator_code"] == "blood_pressure" for r in changed), 1)

    def test_history_is_protected_from_caller_mutation(self):
        engine, rows = run(ticks=1)
        rows[0]["values"]["value"] = -999
        view = engine.history
        view[0]["values"]["value"] = -888
        self.assertGreater(engine.history[0]["values"]["value"], 0)
        snapshot = engine.config
        snapshot.radiation_multiplier = -1
        self.assertEqual(engine.config.radiation_multiplier, 1)

    def test_stateful_residuals_have_temporal_correlation(self):
        engine, _ = run(ticks=0)
        residuals = []
        for _ in range(96 * 3):
            engine.step()
            residuals.append(engine._subjects[engine.config.profiles[0].astronaut_id]["residuals"]["heart_rate.value"])
        self.assertGreater(statistics.correlation(residuals[:-1], residuals[1:]), .7)

    def test_invalid_or_conflicting_baseline_parameters_are_rejected(self):
        with self.assertRaises(ValueError):
            Parameter(float("nan"), 1)
        with self.assertRaises(ValueError):
            Parameter(10, -1)
        with self.assertRaises(ValueError):
            SimulationConfig.from_dict({"profiles": [{"crew_code": "test", "contexts": {
                "RESTING": {"heart_rate.value": {"reference_value": 90, "noise_sd": 1}}}}]})
        with self.assertRaises(ValueError):
            SimulationConfig.from_dict({"profiles": [{"crew_code": "test", "contexts": {"RECOVERY": {}}}]})
        with self.assertRaises(ValueError):
            SimulationConfig.from_dict({"profiles": [{"crew_code": "test", "original": {
                "mood.score": {"reference_value": 6, "noise_sd": 1}}}]})

    def test_invalid_configuration_and_lifecycle_fail_explicitly(self):
        for changes in ({"stress": float("nan")}, {"activity": 2}, {"radiation_multiplier": -1},
                        {"time_scale": 0}, {"tick_minutes": 7}, {"scenario": "clinical"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                Simulator(replace(SimulationConfig(), **changes))
        profile = demo_profile()
        del profile.contexts["EXERCISING"]
        with self.assertRaises(ValueError):
            Simulator(SimulationConfig(profiles=[profile]))
        engine = Simulator()
        with self.assertRaises(RuntimeError):
            engine.step()
        with self.assertRaises(RuntimeError):
            engine.resume()
        engine.start()
        with self.assertRaises(ValueError):
            engine.set_scenario("normal", stress=-1)
        self.assertEqual(engine.config.stress, .1)

    def test_json_personal_configuration(self):
        config = SimulationConfig.from_dict({"profiles": [{"crew_code": "configured-01",
            "original": {"heart_rate.value": {"reference_value": 72, "noise_sd": 1.5}}}]})
        self.assertEqual(config.profiles[0].original["heart_rate.value"].reference_value, 72)
        self.assertEqual(config.profiles[0].contexts["EXERCISING"]["heart_rate.value"].reference_value, 132)

    def test_cli_is_reproducible_json_lines_and_rejects_invalid_arguments(self):
        root = Path(__file__).resolve().parents[2]
        command = [sys.executable, "-m", "simulation.engine", "--days", "0.125", "--seed", "77"]
        first = subprocess.run(command, cwd=root, capture_output=True, text=True, check=True)
        second = subprocess.run(command, cwd=root, capture_output=True, text=True, check=True)
        self.assertEqual(first.stdout, second.stdout)
        rows = [json.loads(line) for line in first.stdout.splitlines()]
        self.assertTrue(rows[0]["synthetic"])
        self.assertEqual(rows[1]["observation"]["source_kind"], "SIMULATION")
        bad = subprocess.run(command + ["--stress", "nan"], cwd=root, capture_output=True, text=True)
        self.assertNotEqual(bad.returncode, 0)
        self.assertEqual(bad.stdout, "")


if __name__ == "__main__":
    unittest.main()
