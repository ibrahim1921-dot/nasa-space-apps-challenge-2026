# How we work

## Branches

- `main` is always working and deployable. Nobody pushes to it directly.
- Work on a short-lived branch named after your area:
  - `frontend/body-map`, `backend/checkin-endpoint`, `ml/nightly-baseline`
- Pull `main` often: `git pull origin main` into your branch at least every few hours.

## Commits

Small and frequent, written as `type(area): what changed`:

```
feat(frontend): add clickable body map
fix(backend): reject heart rate above 220 bpm
data(ml): rebuild nightly table with quality flags
docs: describe check-in endpoint
```

Types: `feat`, `fix`, `data`, `docs`, `test`, `refactor`, `chore`.

## Pull requests

1. Open a PR into `main` as soon as something works, even if small.
2. Fill in the template. Link the issue (`Closes #12`).
3. One teammate reviews. API contract changes need all three leads.
4. CI must pass. Merge with **Squash and merge**, then delete the branch.

## Issues and the board

- Every task is an issue with a label: `frontend`, `backend`, `ml`, `docs`, `bug`.
- Track them on the GitHub Project board: To do, In progress, In review, Done.

## Never commit

- `.env` files, API keys, database passwords. Use `.env.example` with empty values instead.
- Raw datasets (`ml/data/raw/`, `ml/data/interim/`). Commit the script that downloads them.
- `node_modules/`, `.next/`, `target/`, `.venv/`.
