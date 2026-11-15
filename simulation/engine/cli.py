"""Terminal-only JSON Lines demonstration. Never contacts the backend/database."""

import argparse
import json
from pathlib import Path

from .catalog import SCENARIOS
from .config import SimulationConfig
from .simulator import Simulator


def main(argv=None):
    parser = argparse.ArgumentParser(description="AstroHealth SYNTHETIC simulator; no clinical evaluation or database access")
    parser.add_argument("--config", type=Path, help="JSON personal parameters and simulation controls")
    parser.add_argument("--seed", type=int)
    parser.add_argument("--scenario", choices=SCENARIOS)
    duration = parser.add_mutually_exclusive_group()
    duration.add_argument("--days", type=float, help="Virtual days, default 1; no real-time waiting")
    duration.add_argument("--wall-seconds", type=float, help="Supplied clock interval multiplied by time-scale")
    parser.add_argument("--time-scale", type=float)
    parser.add_argument("--stress", type=float)
    parser.add_argument("--activity", type=float)
    parser.add_argument("--sleep-hours", type=float)
    parser.add_argument("--radiation-mgy-per-day", type=float)
    parser.add_argument("--radiation-multiplier", type=float)
    args = parser.parse_args(argv)
    try:
        document = json.loads(args.config.read_text(encoding="utf-8")) if args.config else {}
        for name in ("seed", "scenario", "time_scale", "stress", "activity", "sleep_hours",
                     "radiation_mgy_per_day", "radiation_multiplier"):
            value = getattr(args, name)
            if value is not None:
                document[name] = value
        config = SimulationConfig.from_dict(document)
        simulator = Simulator(config)
        simulator.start()
        if args.wall_seconds is not None:
            records = simulator.advance(args.wall_seconds)
        else:
            days = 1 if args.days is None else args.days
            if not 0 <= days <= 365:
                raise ValueError("--days must be in [0,365]")
            ticks = days * 1440 / config.tick_minutes
            if abs(ticks - round(ticks)) > 1e-8:
                raise ValueError("Duration must end on the configured tick grid")
            records = simulator.step(round(ticks))
    except (ValueError, TypeError, KeyError, OSError) as error:
        parser.error(str(error))
    print(json.dumps(simulator.manifest(), allow_nan=False, sort_keys=True))
    for record in records:
        print(json.dumps(record, allow_nan=False, sort_keys=True))


if __name__ == "__main__":
    main()
