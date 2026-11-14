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

Run from the `ml/` folder with the virtual environment active. Each script writes its JSON to `outputs/`.

| # | Piece | Raw data needed in `data/raw/` | Command | Notebook |
| --- | --- | --- | --- | --- |
| 3 | Muscle and fitness baseline | `bodyPerformance.csv` | `python -m crewhealth_ml.fitness` (with `PYTHONPATH=src`) | `notebooks/03_fitness_baseline.ipynb` |

Run the tests with `pytest -q`. Tests that need raw data are skipped when it is missing.

## Rules

- Keep data sources separate (see `docs/data-sources.md`); every output row carries its `source` label.
- Output is an anomaly score with a plain-language reason, never a diagnosis.
- Test on people the model was not tuned on, and report false alarms as well as catches.
