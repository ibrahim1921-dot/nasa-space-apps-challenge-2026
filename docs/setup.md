# Setup

Clone once, then each lead sets up their own folder on a branch.

```
git clone <repo-url>
cd nasa-space-apps-challenge
```

## Frontend (Next.js)

Next.js's generator needs `frontend/` not to exist yet, so run it from the repo root:

```
git checkout -b frontend/setup
npx create-next-app@latest frontend --js --app --eslint --src-dir --import-alias "@/*" --use-npm
```

- Answer the remaining prompts as the team agreed (Tailwind yes or no).
- Delete `frontend/.gitignore` only if it duplicates the root one; keeping it is harmless.
- Add `frontend/.env.example`:

  ```
  NEXT_PUBLIC_API_URL=http://localhost:8080
  ```

  Each person copies it to `frontend/.env.local` (never committed).
- Run: `cd frontend && npm run dev`, open http://localhost:3000.
- Commit, push, open a PR.

## Backend (Java, Spring Boot)

Generate the project at https://start.spring.io with:

| Setting | Value |
| --- | --- |
| Project | Maven |
| Language | Java |
| Spring Boot | the default stable version offered |
| Group | `com.crewhealth` |
| Artifact | `api` |
| Package name | `com.crewhealth.api` |
| Packaging | Jar |
| Java | 21 |
| Dependencies | Spring Web, Validation, Spring Boot Actuator, Spring Data JPA, PostgreSQL Driver, H2 Database |

Download the zip and unzip it so the files sit directly in `backend/` (you should see `backend/pom.xml`, `backend/mvnw`, `backend/src/`).

```
git checkout -b backend/setup
cd backend
./mvnw spring-boot:run        # Windows: mvnw.cmd spring-boot:run
```

- Use H2 (in-memory) while developing; switch to PostgreSQL with environment variables, never hard-coded:

  ```
  DB_URL=jdbc:postgresql://<host>:5432/postgres
  DB_USER=...
  DB_PASSWORD=...
  ```

  Put the variable names (empty values) in `backend/.env.example`.
- Allow CORS from `http://localhost:3000` and the deployed frontend URL only.
- Health check: `GET /actuator/health` should return `UP`.

## ML (Python)

```
git checkout -b ml/setup
cd ml
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

- Raw downloads go in `ml/data/raw/`, processed tables in `ml/data/interim/`. Both are ignored by Git; commit the scripts that build them instead.
- Code that should be reused goes in `ml/src/crewhealth_ml/`; exploration and results in `ml/notebooks/`.
- Files the backend serves go in `ml/outputs/` and **are** committed. Their shapes are in [api-contract.md](api-contract.md).
- Tests: `pytest` from `ml/`.

## Deployment (decide by Saturday evening)

| Part | Suggested host | Note |
| --- | --- | --- |
| frontend | Vercel, root directory `frontend` | Set `NEXT_PUBLIC_API_URL` to the backend URL |
| backend | Render or Railway (Docker or Java build) | Free tiers sleep; call `/actuator/health` before demos |
| database | Supabase Postgres (free) | Connection details only in host env vars |
