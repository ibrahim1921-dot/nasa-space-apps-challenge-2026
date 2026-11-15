"""Local-only, unauthenticated development server. Never expose to a LAN/public host."""

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import time
from urllib.parse import parse_qs, urlsplit

from .lab import LabError, SimulationLab


class LabServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, lab=None):
        if address[0] != "127.0.0.1":
            raise ValueError("The Simulation Lab API binds only to 127.0.0.1")
        self.lab = lab or SimulationLab()
        super().__init__(address, Handler)
        port = self.server_address[1]
        self.allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        self.allowed_origins = {f"http://{host}:{p}" for host in ("127.0.0.1", "localhost") for p in (5173, 4173, port)}


class Handler(BaseHTTPRequestHandler):
    server_version = "AstroHealthLocalLab/0.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, *_):
        pass  # No request bodies/measurements printed by the local server.

    def _guard(self):
        if self.headers.get("Host") not in self.server.allowed_hosts:
            raise LabError("Local Host header required.", 403)
        origin = self.headers.get("Origin")
        if origin and origin not in self.server.allowed_origins:
            raise LabError("Origin is not allowed.", 403)

    def _reply(self, status, document):
        data = json.dumps(document, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        origin = self.headers.get("Origin")
        if origin in self.server.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(data)

    def _dispatch(self, mutation=False):
        try:
            self._guard()
            url = urlsplit(self.path)
            query = parse_qs(url.query, keep_blank_values=True)
            if any(len(values) != 1 for values in query.values()):
                raise LabError("Repeated query fields are not accepted.")
            if not mutation and url.path == "/api/v1/observations":
                self._reply(200, self.server.lab.export({key: values[0] for key, values in query.items()}))
                return
            if not mutation and url.path == "/api/manifest":
                if set(query) - {"run_id"}:
                    raise LabError("Unknown query field.")
                self._reply(200, self.server.lab.manifest(query.get("run_id", [None])[0]))
                return
            if set(query) - {"astronaut_id", "run_id"}:
                raise LabError("Unknown query field.")
            if mutation:
                if self.headers.get("X-Simulation-Lab") != "1":
                    raise LabError("Simulation Lab request header required.", 403)
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                    raise LabError("Use application/json.", 415)
                if self.headers.get("Transfer-Encoding"):
                    raise LabError("Chunked requests are not accepted.", 400)
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 4096:
                    raise LabError("JSON body must be between 1 and 4096 bytes.", 413)
                body = json.loads(self.rfile.read(length), parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Nonfinite JSON")))
                if not isinstance(body, dict):
                    raise LabError("JSON body must be an object.")
                if not url.path.startswith("/api/") or "/" in url.path[len("/api/"):]:
                    raise LabError("Unknown endpoint.", 404)
                self.server.lab.command(url.path[len("/api/"):], body)
            elif url.path == "/api/catalog":
                self._reply(200, self.server.lab.catalog())
                return
            elif url.path != "/api/state":
                raise LabError("Unknown endpoint.", 404)
            state = self.server.lab.state(query.get("astronaut_id", [None])[0], query.get("run_id", [None])[0])
            self._reply(200, state)
        except LabError as error:
            self._reply(error.status, {"error": str(error)})
        except (ValueError, TypeError, UnicodeError):
            self._reply(400, {"error": "Invalid JSON or command fields."})

    def do_GET(self):
        self._dispatch()

    def do_POST(self):
        self._dispatch(True)

    def do_OPTIONS(self):
        try:
            self._guard()
            requested = {part.strip().lower() for part in self.headers.get("Access-Control-Request-Headers", "").split(",") if part.strip()}
            if self.headers.get("Origin") not in self.server.allowed_origins or self.headers.get("Access-Control-Request-Method") not in ("GET", "POST"):
                raise LabError("Preflight not allowed.", 403)
            if requested - {"content-type", "x-simulation-lab"}:
                raise LabError("Headers not allowed.", 403)
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Simulation-Lab")
            self.send_header("Vary", "Origin")
            self.send_header("Content-Length", "0")
            self.end_headers()
        except LabError as error:
            self._reply(error.status, {"error": str(error)})


def drive(lab, stopped):
    previous = time.monotonic()
    while not stopped.wait(.25):
        now = time.monotonic()
        # Do not catch up laptop sleep or a long UI/manual-advance lock as clinical time.
        elapsed = min(.5, max(0, now - previous))
        previous = now
        try:
            lab.advance(elapsed)
        except LabError:
            pass  # Budget message is retained in state; the engine is paused.


def main(argv=None):
    parser = argparse.ArgumentParser(description="Loopback-only synthetic Simulation Lab API; no production authentication")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args(argv)
    with LabServer(("127.0.0.1", args.port)) as server:
        stopped = threading.Event()
        worker = threading.Thread(target=drive, args=(server.lab, stopped), daemon=True)
        worker.start()
        print(f"Synthetic Simulation Lab API: http://127.0.0.1:{server.server_address[1]} (local development only)", flush=True)
        try:
            server.serve_forever(poll_interval=.25)
        except KeyboardInterrupt:
            pass
        finally:
            stopped.set()
            worker.join(timeout=3)


if __name__ == "__main__":
    main()
