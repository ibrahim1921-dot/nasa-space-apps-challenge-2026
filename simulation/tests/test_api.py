"""Real local HTTP adapter tests. No browser, backend, PostgreSQL, or trained model needed."""

import http.client
import json
import threading
import unittest

from simulation.api.lab import LabError, SimulationLab
from simulation.api.server import LabServer


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.server = LabServer(("127.0.0.1", 0))
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": .01}, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)

    def call(self, path="/api/state", body=None, headers=None, method=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=10)
        default = {"Origin": "http://127.0.0.1:5173"}
        if body is not None:
            default.update({"Content-Type": "application/json", "X-Simulation-Lab": "1"})
        default.update(headers or {})
        try:
            connection.request(method or ("GET" if body is None else "POST"), path,
                               None if body is None else json.dumps(body), default)
            response = connection.getresponse()
            raw = response.read()
            return response.status, json.loads(raw) if raw else None, dict(response.getheaders())
        finally:
            connection.close()

    def test_actual_engine_lifecycle_pause_resume_and_reset_keep_history(self):
        _, initial, _ = self.call()
        self.assertEqual(initial["state"], "READY")
        self.assertEqual(initial["retained_observations"], 0)
        self.assertEqual(self.call("/api/start", {})[0], 200)
        self.server.lab.advance(1)
        _, running, _ = self.call()
        self.assertGreater(running["retained_observations"], 0)
        self.assertEqual(self.server.lab.engine.snapshot()["observation_count"], running["retained_observations"])
        self.call("/api/pause", {})
        self.server.lab.advance(2)
        _, paused, _ = self.call()
        self.assertEqual(paused["virtual_at"], running["virtual_at"])
        self.assertEqual(paused["retained_observations"], running["retained_observations"])
        self.call("/api/resume", {})
        self.server.lab.advance(1)
        _, before_reset, _ = self.call()
        self.assertGreater(before_reset["retained_observations"], paused["retained_observations"])
        _, reset, _ = self.call("/api/reset", {"seed": 77, "expected_run_id": before_reset["run_id"]})
        self.assertEqual(reset["state"], "READY")
        self.assertNotEqual(reset["run_id"], before_reset["run_id"])
        self.assertEqual(reset["origin"], before_reset["virtual_at"])
        self.assertEqual(reset["retained_observations"], before_reset["retained_observations"])
        _, previous, _ = self.call("/api/state?run_id=" + before_reset["run_id"])
        self.assertTrue(previous["historical"])
        self.assertGreater(previous["families"][0]["metrics"][0]["sample_count"], 0)
        self.assertIsNone(reset["families"][0]["metrics"][0]["latest"])

    def test_all_nine_families_units_and_real_scope_baselines(self):
        self.call("/api/start", {})
        status, state, _ = self.call("/api/step", {"days": 28})
        self.assertEqual(status, 200)
        self.assertEqual(len(state["families"]), 9)
        units = {family["code"]: [m["unit"] for m in family["metrics"]] for family in state["families"]}
        self.assertEqual(units["blood_sugar"], ["mmol/L"])
        self.assertEqual(units["muscle"], ["kgf", "kg"])
        self.assertEqual(units["bone_mineral_density"], ["g/cm2"])
        for family in state["families"]:
            for metric in family["metrics"]:
                self.assertIsNotNone(metric["latest"])
                self.assertLessEqual(len(metric["points"]), 120)
                self.assertIn("original", metric["latest"])
                self.assertIn("activity", metric["latest"])
        radiation = state["families"][-1]["metrics"][0]
        self.assertEqual(radiation["latest"]["origin"], state["origin"])

    def test_late_scenario_switch_and_controls_reach_python_without_reset(self):
        self.call("/api/start", {})
        self.call("/api/step", {"days": 1})
        _, before, _ = self.call()
        status, changed, _ = self.call("/api/controls", {"scenario": "exercise", "stress": .8,
            "activity": 1, "sleep_restriction_hours": 3, "radiation_multiplier": 4, "time_scale": 3600})
        self.assertEqual(status, 200)
        self.assertEqual(changed["run_id"], before["run_id"])
        self.assertEqual(changed["retained_observations"], before["retained_observations"])
        config = self.server.lab.engine.config
        self.assertEqual((config.stress, config.activity, config.sleep_hours, config.radiation_multiplier, config.time_scale), (.8, 1, 5, 4, 3600))
        self.server.lab.advance(.25)  # 15 virtual minutes: exercise must start now, not at original run tick 0.
        _, after, _ = self.call()
        heart = after["families"][0]["metrics"][0]["latest"]
        self.assertEqual(heart["context"], "EXERCISING")
        self.assertGreater(heart["activity"], heart["original"])
        self.assertGreater(heart["value"], 100)

    def test_profiles_are_individual_and_selection_does_not_mutate_engine(self):
        _, catalog, _ = self.call("/api/catalog")
        self.assertEqual(len(catalog["profiles"]), 3)
        self.call("/api/start", {})
        self.server.lab.advance(.25)
        _, first, _ = self.call()
        profile = catalog["profiles"][1]["astronaut_id"]
        _, second, _ = self.call("/api/state?astronaut_id=" + profile)
        self.assertEqual(first["run_id"], second["run_id"])
        self.assertNotEqual(first["families"][0]["metrics"][0]["latest"]["original"],
                            second["families"][0]["metrics"][0]["latest"]["original"])

    def test_local_guards_preflight_and_invalid_commands(self):
        self.assertEqual(self.call(headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.call(headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.call("/api/start", {}, {"X-Simulation-Lab": ""})[0], 403)
        self.assertEqual(self.call("/api/start", {}, {"Content-Type": "text/plain"})[0], 415)
        status, _, headers = self.call("/api/start", method="OPTIONS", headers={
            "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-simulation-lab"})
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "http://127.0.0.1:5173")
        self.assertEqual(self.call("/api/controls", {"stress": float("nan")})[0], 400)
        self.assertEqual(self.call("/api/resume", {})[0], 409)
        self.assertEqual(self.call("/api/start", {"unrecognized": True})[0], 400)
        self.assertEqual(self.call("/api/start", {"expected_run_id": "old-run"})[0], 409)
        self.assertEqual(self.server.lab.engine.state, "READY")
        with self.assertRaises(ValueError):
            LabServer(("0.0.0.0", 0))

    def test_budget_pauses_without_deleting_history(self):
        lab = SimulationLab(max_records=10)
        lab.command("start", {})
        lab.advance(.01)
        before = lab.engine.history
        with self.assertRaises(LabError):
            lab.command("step", {"days": 28})
        self.assertEqual(lab.engine.state, "PAUSED")
        self.assertEqual(lab.engine.history, before)

    def test_stress_sleep_and_radiation_controls_change_engine_measurements(self):
        baseline = SimulationLab()
        baseline.command("start", {})
        baseline.command("step", {"days": 1})
        self.call("/api/controls", {"stress": 1, "sleep_restriction_hours": 3, "radiation_multiplier": 3})
        self.call("/api/start", {})
        _, changed, _ = self.call("/api/step", {"days": 1})
        plain = baseline.state()
        def value(state, family):
            return next(item for item in state["families"] if item["code"] == family)["metrics"][0]["latest"]["value"]
        self.assertGreater(value(changed, "heart_rate"), value(plain, "heart_rate"))
        self.assertLess(value(changed, "sleep_hours"), value(plain, "sleep_hours"))
        self.assertLess(value(changed, "mood"), value(plain, "mood"))
        self.assertAlmostEqual(value(changed, "cumulative_absorbed_radiation_dose") /
                               value(plain, "cumulative_absorbed_radiation_dose"), 3, places=4)

    def test_complete_export_all_families_matches_original_engine_history(self):
        self.call("/api/start", {})
        self.call("/api/step", {"days": 28})
        expected = self.server.lab.engine.history
        exported = []
        sequences = []
        url = "/api/v1/observations?limit=500"
        while url:
            status, page, _ = self.call(url)
            self.assertEqual(status, 200)
            self.assertEqual(page["schema_version"], "astrohealth.simulation.export.v1")
            self.assertFalse(page["durable"])
            self.assertLessEqual(len(page["items"]), 500)
            exported.extend(item["envelope"] for item in page["items"])
            sequences.extend(item["sequence"] for item in page["items"])
            url = page["next_url"]
        self.assertEqual(tuple(exported), expected)
        self.assertEqual(sequences, list(range(1, len(expected) + 1)))
        ids = [row["observation"]["source_record_id"] for row in exported]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len({row["observation"]["indicator_code"] for row in exported}), 9)
        profiles = {p["astronaut_id"]: p["crew_code"] for p in self.server.lab.catalog()["profiles"]}
        for row in exported:
            header = row["observation"]
            self.assertEqual(profiles[header["astronaut_id"]], row["crew_code"])
            self.assertTrue(row["is_simulated"])
            self.assertTrue(header["provenance"]["synthetic"])
            if header["indicator_code"] == "muscle":
                self.assertEqual(len(row["values"]), 1)
            if header["indicator_code"] == "mood":
                self.assertIsInstance(row["values"]["score"], (int, float))
            if header["indicator_code"] == "cumulative_absorbed_radiation_dose":
                self.assertEqual(row["comparison_scope"]["accumulation_started_at"],
                                 self.server.lab.runs[0]["origin"])

    def test_export_snapshot_stable_during_background_generation_and_checkpoint(self):
        self.call("/api/start", {})
        self.server.lab.advance(1)
        _, first, _ = self.call("/api/v1/observations?limit=2")
        expected = self.server.lab.engine.history
        self.server.lab.advance(1)
        # Replay a frozen page, even after new observations arrive.
        workspace = first["workspace_id"]
        replay = f"/api/v1/observations?workspace_id={workspace}&after=0&through={first['through']}&limit=2"
        self.assertEqual(self.call(replay)[1]["items"], first["items"])
        items = first["items"][:]
        page = first
        while page["next_url"]:
            _, page, _ = self.call(page["next_url"])
            self.assertEqual(page["through"], first["through"])
            items.extend(page["items"])
        self.assertEqual(tuple(item["envelope"] for item in items), expected)
        newer = []
        url = page["checkpoint_url"]
        while url:
            _, page, _ = self.call(url)
            newer.extend(item["envelope"] for item in page["items"])
            url = page["next_url"]
        self.assertEqual(tuple(newer), self.server.lab.engine.history[len(expected):])

    def test_export_pause_resume_reset_and_budget_retain_original_records(self):
        self.call("/api/start", {})
        self.server.lab.advance(.1)
        self.call("/api/pause", {})
        _, before, _ = self.call("/api/v1/observations?limit=500")
        self.server.lab.advance(1)
        self.assertEqual(self.call("/api/v1/observations?limit=500")[1], before)
        self.call("/api/resume", {})
        self.server.lab.advance(.1)
        old_run = self.server.lab.engine.run_id
        self.call("/api/reset", {})
        self.call("/api/start", {})
        self.server.lab.advance(.1)
        _, after, _ = self.call("/api/v1/observations?limit=500")
        self.assertEqual(after["workspace_id"], before["workspace_id"])
        self.assertEqual(after["items"][:len(before["items"])], before["items"])
        self.assertEqual({item["envelope"]["observation"]["simulation_metadata"]["run_id"]
                          for item in after["items"]}, {old_run, self.server.lab.engine.run_id})
        lab = self.server.lab
        lab.max_records = len(lab.engine.history)
        with self.assertRaises(LabError):
            lab.command("step", {"days": 1})
        self.assertEqual(lab.export({"limit": "500"})["items"], after["items"])

    def test_export_validation_restart_and_local_guards(self):
        _, empty, _ = self.call("/api/v1/observations")
        self.assertEqual(empty["items"], [])
        self.assertIsNone(empty["next_url"])
        self.assertIsNotNone(empty["checkpoint_url"])
        for query in ("limit=0", "limit=501", "limit=-1", "limit=1.5", "limit=", "limit=1&limit=2",
                      "after=1", "through=0", "unknown=1"):
            self.assertEqual(self.call("/api/v1/observations?" + query)[0], 400, query)
        workspace = empty["workspace_id"]
        self.assertEqual(self.call(f"/api/v1/observations?workspace_id={workspace}&through=1")[0], 400)
        self.server.lab = SimulationLab()
        self.assertEqual(self.call(empty["checkpoint_url"])[0], 409)
        self.assertEqual(self.call("/api/v1/observations", headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.call("/api/v1/observations", headers={"Host": "evil.example"})[0], 403)

    def test_export_copies_do_not_mutate_retained_envelopes(self):
        lab = self.server.lab
        lab.command("start", {})
        lab.advance(.1)
        page = lab.export({})
        page["items"][0]["envelope"]["values"].clear()
        self.assertEqual(lab.export({})["items"][0]["envelope"], lab.engine.history[0])

    def test_export_pagination_with_concurrent_driver(self):
        lab = self.server.lab
        lab.command("start", {})
        lab.advance(.1)
        _, page, _ = self.call("/api/v1/observations?limit=1")
        expected = lab.engine.history
        stopped = threading.Event()
        failures = []
        def driver():
            try:
                while not stopped.wait(.002):
                    lab.advance(.01)
            except Exception as error:
                failures.append(error)
        worker = threading.Thread(target=driver)
        worker.start()
        rows = list(page["items"])
        try:
            while page["next_url"]:
                status, page, _ = self.call(page["next_url"])
                self.assertEqual(status, 200)
                rows.extend(page["items"])
        finally:
            stopped.set()
            worker.join(timeout=3)
        self.assertFalse(worker.is_alive())
        self.assertEqual(failures, [])
        self.assertEqual(tuple(item["envelope"] for item in rows), expected)
        self.assertEqual([item["sequence"] for item in rows], list(range(1, len(expected) + 1)))

    def test_manifest_direct_identity_completeness_and_reset(self):
        lab = SimulationLab()
        initial = lab.manifest()
        self.assertEqual(initial["schema_version"], "astrohealth.simulation.manifest.v1")
        self.assertTrue(initial["synthetic"])
        self.assertEqual(initial["workspace_id"], lab.workspace_id)
        self.assertEqual(initial["run_id"], lab.engine.run_id)
        manifest = initial["manifest"]
        self.assertEqual(manifest["schema_version"], "astrohealth.simulation.run.v1")
        self.assertEqual(manifest["engine_version"], "0.1.0")
        self.assertTrue(manifest["synthetic"])
        self.assertEqual(manifest["run_id"], lab.engine.run_id)
        self.assertIn("Synthetic demo parameters", manifest["warning"])
        config = manifest["configuration"]
        self.assertEqual(config["seed"], 42)
        self.assertEqual(config["scenario"], "normal")
        self.assertEqual(len(config["profiles"]), 3)
        codes = [p["crew_code"] for p in config["profiles"]]
        self.assertEqual(codes, ["sim-crew-01", "sim-crew-02", "sim-crew-03"])

        # Deepcopy mutation safety
        manifest["configuration"]["seed"] = 99999
        self.assertEqual(lab.manifest()["manifest"]["configuration"]["seed"], 42)

        # Reset creates new run identity while preserving earlier run manifest
        initial_run_id = lab.engine.run_id
        lab.command("reset", {"seed": 101})
        current = lab.manifest()
        self.assertNotEqual(current["run_id"], initial_run_id)
        self.assertEqual(current["run_id"], lab.engine.run_id)
        self.assertEqual(current["manifest"]["configuration"]["seed"], 101)
        self.assertEqual(current["workspace_id"], lab.workspace_id)

        # Query past retained run
        past = lab.manifest(initial_run_id)
        self.assertEqual(past["run_id"], initial_run_id)
        self.assertEqual(past["manifest"]["run_id"], initial_run_id)
        self.assertEqual(past["manifest"]["configuration"]["seed"], 42)

        # Unknown run raises 404
        with self.assertRaises(LabError) as ctx:
            lab.manifest("00000000-0000-0000-0000-000000000000")
        self.assertEqual(ctx.exception.status, 404)

    def test_manifest_matches_exported_observation_envelopes(self):
        lab = SimulationLab()
        lab.command("start", {})
        lab.advance(1)
        manifest_response = lab.manifest()
        manifest = manifest_response["manifest"]
        page = lab.export({"limit": "100"})
        self.assertGreater(len(page["items"]), 0)
        for item in page["items"]:
            env = item["envelope"]
            obs = env["observation"]
            self.assertEqual(obs["simulation_metadata"]["run_id"], manifest_response["run_id"])
            self.assertEqual(obs["simulation_metadata"]["seed"], manifest["configuration"]["seed"])
            self.assertEqual(obs["provenance"]["engine_version"], manifest["engine_version"])
            self.assertGreaterEqual(obs["measured_at"], manifest["configuration"]["start_at"])
            if obs["indicator_code"] == "cumulative_radiation":
                self.assertEqual(env["comparison_scope"]["accumulation_started_at"], manifest["configuration"]["start_at"])

    def test_manifest_http_endpoint_dispatch_and_guards(self):
        status, data, headers = self.call("/api/manifest")
        self.assertEqual(status, 200)
        self.assertEqual(data["schema_version"], "astrohealth.simulation.manifest.v1")
        self.assertTrue(data["synthetic"])
        self.assertEqual(data["workspace_id"], self.server.lab.workspace_id)
        self.assertEqual(data["run_id"], self.server.lab.engine.run_id)
        self.assertEqual(data["manifest"]["run_id"], self.server.lab.engine.run_id)
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")

        # Query parameter by active run_id
        status, by_run, _ = self.call(f"/api/manifest?run_id={self.server.lab.engine.run_id}")
        self.assertEqual(status, 200)
        self.assertEqual(by_run["run_id"], self.server.lab.engine.run_id)

        # Repeated manifest reads do not mutate response or engine state
        status2, data2, _ = self.call("/api/manifest")
        self.assertEqual(status2, 200)
        self.assertEqual(data, data2)

        # Query unknown or malformed run_id returns 404
        for bad_run in ("00000000-0000-0000-0000-000000000000", "not-a-valid-uuid", "123"):
            status, error_doc, _ = self.call(f"/api/manifest?run_id={bad_run}")
            self.assertEqual(status, 404, bad_run)
            self.assertEqual(error_doc, {"error": "Unknown retained run."})

        # Reset over HTTP creates new active manifest while retaining historical run manifest
        initial_run_id = data["run_id"]
        self.assertEqual(self.call("/api/reset", {"seed": 88})[0], 200)
        status, after_reset, _ = self.call("/api/manifest")
        self.assertEqual(status, 200)
        self.assertNotEqual(after_reset["run_id"], initial_run_id)
        self.assertEqual(after_reset["manifest"]["configuration"]["seed"], 88)
        self.assertEqual(after_reset["workspace_id"], data["workspace_id"])

        # Historical run remains retrievable over HTTP
        status, historical, _ = self.call(f"/api/manifest?run_id={initial_run_id}")
        self.assertEqual(status, 200)
        self.assertEqual(historical["run_id"], initial_run_id)
        self.assertEqual(historical["manifest"]["run_id"], initial_run_id)
        self.assertEqual(historical["manifest"]["configuration"]["seed"], 42)

        # Query validation guards
        self.assertEqual(self.call("/api/manifest?unknown=1")[0], 400)
        self.assertEqual(self.call(f"/api/manifest?run_id=a&run_id=b")[0], 400)

        # Mutation on GET endpoint returns 404
        self.assertEqual(self.call("/api/manifest", {})[0], 404)

        # Host and Origin guards
        self.assertEqual(self.call("/api/manifest", headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.call("/api/manifest", headers={"Host": "evil.example"})[0], 403)


if __name__ == "__main__":
    unittest.main()
