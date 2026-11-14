# ML

Personal-baseline anomaly detection and the data pipeline behind the app.

## Layout

| Path | Contents | Committed? |
| --- | --- | --- |
| `data/raw/` | Downloaded datasets | No (rebuilt by scripts) |
| `data/interim/` | Cleaned tables | No (rebuilt by scripts) |
| `src/crewhealth_ml/` | Reusable code: loading, cleaning, baselines, scoring | Yes |
| `notebooks/` | Exploration, model comparison, results charts | Yes |
| `outputs/` | JSON files the backend serves (see `docs/api-contract.md`) | Yes |
| `models/` | Trained model files, if any | Yes, if small |
| `tests/` | `pytest` tests | Yes |

## Rebuild the data

List the scripts here in the order they run, e.g.:

1. `python -m crewhealth_ml.fetch_physionet` downloads into `data/raw/`
2. `python -m crewhealth_ml.build_nights` writes `data/interim/bidsleep_nights.csv`
3. `python -m crewhealth_ml.export_outputs` writes `outputs/*.json`

## Rules

- Keep data sources separate (see `docs/data-sources.md`); every output row carries its `source` label.
- Output is an anomaly score with a plain-language reason, never a diagnosis.
- Test on people the model was not tuned on, and report false alarms as well as catches.
