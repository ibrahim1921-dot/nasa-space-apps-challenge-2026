# Health Knowledge Hub and shared educational library — Phase 4F

V36 adds educational content only, using the existing nine `health_indicators` and
11 `indicator_metrics`. It does not create patients, observations, thresholds,
baselines, alerts or ML assessments. V1–V35 remain unchanged. Applying V36 to an
existing development/production database is an independent deployment operation;
this phase runs migrations only in PostgreSQL 17 Testcontainers.

## Published seed content

The seed set contains nine topics, 54 sections, six reusable countermeasures,
11 reference records, 60 citations, 21 countermeasure/indicator associations,
11 finding codes, 26 explicit finding/countermeasure associations, and 18 pending
media metadata records. Every topic has the six sections MEASURES, MONITORING,
MEASUREMENT, SPACEFLIGHT, COUNTERMEASURES and REFERENCES, in that order.

| Topic code | Existing indicator code | Metrics |
|---|---|---|
| heart-rate | heart_rate | value / beats/min |
| blood-pressure | blood_pressure | systolic, diastolic / mmHg |
| blood-glucose | blood_sugar | value / mmol/L |
| temperature | body_temperature | value / Cel |
| sleep | sleep_hours | duration / h |
| mood | mood | score / score |
| muscle-health | muscle | grip_strength / kgf; muscle_mass / kg |
| bone-density | bone_mineral_density | areal_density / g/cm2 |
| radiation | cumulative_absorbed_radiation_dose | value / mGy |

Cards have a short introduction. Details explain measurement, monitoring,
measurement context, limited spaceflight effects and general countermeasure context.
Glucose and temperature pages explicitly withhold unverified indicator-specific
spaceflight-effect claims for specialist review. No diagnostic cutoffs, treatment
dosages, exercise loads or personalized prescriptions are seeded.

Source verification on 2026-11-15 used official resources:

- [NASA: Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/)
- [NASA: The Human Body in Space](https://www.nasa.gov/humans-in-space/the-human-body-in-space/)
- [NASA: Five Hazards](https://www.nasa.gov/hrp/hazards/)
- [NASA: Fundamentals of Human Health](https://www.nasa.gov/reference/fundamentals-of-human-health/)
- [MedlinePlus: Vital signs](https://medlineplus.gov/ency/article/002341.htm)
- [MedlinePlus: Measuring Blood Pressure](https://medlineplus.gov/lab-tests/measuring-blood-pressure/)
- [MedlinePlus: Temperature measurement](https://medlineplus.gov/ency/article/003400.htm)
- [MedlinePlus: Bone Density Scan](https://medlineplus.gov/lab-tests/bone-density-scan/)
- [NIST: Glucose monitor measurement](https://www.nist.gov/how-do-you-measure-it/how-do-glucose-monitors-measure-sugar-levels-blood)
- [NHLBI: Healthy Sleep Habits](https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits)
- [NRC: Measuring Radiation](https://www.nrc.gov/facilities-safety/radiation-protection/radiation-and-its-health-effects/measuring-radiation)

References are attached to individual sections and countermeasures. Catalog-unit,
cadence and record-separation explanations also describe this application's existing
data contract. `SOURCE_VERIFICATION_NOT_CLINICAL_CERTIFICATION` means source checking
of limited educational copy. It does not represent physician sign-off, NASA approval
or endorsement. The migration's `phase4f-source-verification` label identifies this
seed workflow; it is not an invented clinician identity.

## Read-only API contract

All routes require an active authenticated ASTRONAUT or NASA_OFFICER using the
existing session-cookie flow. Disabled/archived account policy remains in force.
There is no HTTP editorial interface and no anonymous knowledge endpoint. The
existing CSRF, HttpOnly, CORS and session controls are unchanged. Unknown and draft
detail codes return the same 404; malformed catalog codes return a safe 400.
An unknown indicator/finding filter returns 404; known filters with no intersection
return `[]`. Authentication failures return 401 and unauthorized writes return 403.

| GET endpoint | Response |
|---|---|
| `/api/knowledge/topics` | Array of published topic cards, ordered by code |
| `/api/knowledge/topics/{code}` | Topic card, six sections, shared countermeasures, deduplicated references |
| `/api/knowledge/topics/{code}/sections` | Ordered section array; published topics only |
| `/api/knowledge/topics/{code}/sections/{kind}` | One section; kind uses uppercase catalog values |
| `/api/knowledge/countermeasures` | Published shared-library entries, ordered by code |
| `/api/knowledge/countermeasures?indicator=muscle` | Explicit indicator associations only |
| `/api/knowledge/countermeasures?finding=muscle-grip-strength-context` | Explicit finding associations only |
| `/api/knowledge/countermeasures?indicator=muscle&finding=muscle-grip-strength-context` | Intersection of the two filters |
| `/api/knowledge/countermeasures/{code}` | One published library entry |
| `/api/knowledge/findings` | Stable finding definitions with at least one published mapped entry |

These are small editorial catalogs, not patient feeds. Arrays are not paginated.
Detail reads use a repeatable-read transaction, preventing mixed published/draft
versions during an editorial transaction. Response DTOs explicitly allowlist fields;
no raw provenance, database rows, accounts or patient data are serialized.

Topic detail shape (abbreviated values, not literal seed text):

```json
{
  "topic": {
    "code": "sleep",
    "indicatorCode": "sleep_hours",
    "title": "Sleep",
    "introduction": "...",
    "version": 1,
    "disclaimer": "General nonclinical education, not diagnosis...",
    "review": {
      "method": "SOURCE_VERIFICATION_NOT_CLINICAL_CERTIFICATION",
      "reviewedAt": "2026-11-15T00:00:00Z",
      "note": "..."
    },
    "media": [
      {
        "id": "<UUID>",
        "filename": "sleep-overview-placeholder.webp",
        "mediaType": "IMAGE",
        "assetPath": "/media/knowledge/sleep/sleep-overview-placeholder.webp",
        "altText": "Pending sleep measurement overview illustration; no asset supplied",
        "sourceCredit": "PENDING: no asset selected; source, license and credit require review",
        "reviewStatus": "PENDING",
        "available": false
      }
    ]
  },
  "contentFormat": "PLAIN_TEXT",
  "sections": [
    {
      "kind": "MEASURES",
      "title": "What it measures",
      "body": "...",
      "position": 1,
      "references": [
        {"code": "sleep-habits", "title": "...", "publisher": "...", "url": "https://...", "verifiedAt": "2026-11-15"}
      ]
    }
  ],
  "countermeasures": [],
  "references": []
}
```

`/topics` returns the `topic` card objects directly. All content is plain text:
render escaped text, not injected HTML. Preserve the disclaimer on cards/details.
Section and detail `references` use the same reference shape.

Countermeasure shape:

```json
{
  "code": "mission-conditioning",
  "title": "Understand mission-approved conditioning",
  "summary": "...",
  "body": "...",
  "authorizationNote": "Educational context only...",
  "version": 1,
  "contentFormat": "PLAIN_TEXT",
  "review": {"method": "SOURCE_VERIFICATION_NOT_CLINICAL_CERTIFICATION", "reviewedAt": "2026-11-15T00:00:00Z", "note": "..."},
  "indicatorCodes": ["blood_pressure", "bone_mineral_density", "heart_rate", "muscle"],
  "findings": [
    {"code": "muscle-grip-strength-context", "indicatorCode": "muscle", "metricCode": "grip_strength", "unit": "kgf", "title": "Measurement context: muscle / grip_strength", "meaning": "Educational context lookup only..."}
  ],
  "references": [],
  "media": []
}
```

## Reuse in future assessments

Library codes: `measurement-context`, `mission-conditioning`, `sleep-environment`,
`behavioral-support`, `nutrition-planning`, `radiation-protection`.
Topic associations resolve through the explicit indicator mapping. Finding mappings
have composite foreign keys to both the metric catalog and the corresponding
countermeasure/indicator pair, preventing cross-indicator mismatches.

Seed finding codes are `<indicator-with-hyphens>-<metric-with-hyphens>-context`.
They mean educational measurement context, not abnormality, diagnosis, severity,
clinical thresholds or treatment indications. The two muscle metrics and the two
blood-pressure metrics have separate stable codes. The `/findings` API supplies
the vocabulary; clients should not reconstruct identifiers from display text.

A future reviewed adapter may resolve a known structured finding code and display
its mapped entries as **general education**, retaining `authorizationNote`. Unknown
codes must never fall back to matching free-form model text. This phase implements
no model adapter, inference call, personalized recommendation endpoint or assessment
link to individual users. Additional finding meanings require explicit editorial
definitions and curated mappings in a later content migration.

## Editorial publication workflow

Use reviewed Flyway content migrations or an explicitly authorized database-owner
transaction. Do not run these instructions against development as part of testing.
There is no ordinary API credential with publication powers.

1. Create topics/countermeasures as DRAFT. A direct PUBLISHED insert is rejected.
2. Populate the six ordered sections and attach a verified reference to each.
   Add explicit indicator mappings and countermeasure citations. References require
   official HTTPS URLs, verification date and a verification note.
3. Verify each claim against the cited source. Withhold unsupported claims, or state
   that the effect is pending specialist review; do not present it as established.
   Preserve the nonclinical disclaimer and individual-authorization distinction.
4. Set `reviewed_by`, `reviewed_at`, `review_note` and PUBLISHED only after source
   verification. Countermeasures publish first. Topic publication requires all six
   cited sections and at least one published countermeasure for its indicator.
5. To edit published content, first update **only** `status='DRAFT'`. The database
   automatically clears its review fields and increments its version. Make changes,
   repeat source verification and explicitly republish with fresh review metadata.

Published content, sections, citations, mappings and media cannot be edited silently.
Child-edit triggers lock both old and new parents to serialize publication with
content changes. Reference and finding definitions are immutable: use a new stable
code to correct a meaning and update associations while the parent is withdrawn.
Database owners remain trusted and can bypass ordinary application controls; do not
grant runtime clients editorial SQL privileges. This is a controlled seed workflow,
not a clinical content management certification.

## Placeholder media and replacement

Each topic has IMAGE and VIDEO metadata with `PENDING`, `available=false`, descriptive
filenames, alt text and honest pending source credits. No binary media files exist
at these paths. No NASA imagery has been downloaded, generated or falsely attributed.
The backend supplies metadata only; it does not host a new asset server.

Suggested paths:

```text
/media/knowledge/{topic-code}/{topic-code}-overview-placeholder.webp
/media/knowledge/{topic-code}/{topic-code}-explainer-placeholder.mp4
```

Render a local generic placeholder while `available=false`; do not request or embed
the missing path. Do not represent PENDING media as genuine NASA material. Only
embed approved media, and retain its alt text and source credit. Video accessibility
can use a descriptive textual alternative and the topic's text; final captioning
and playback accessibility must be checked when selecting real media.

Replacement needs no schema change. In an authorized editorial transaction:
withdraw the owning topic/countermeasure, replace `filename`, `asset_path`,
`alt_text`, `source_credit`, `media_type` and ordering as needed, check licensing,
authenticity, accessibility and asset availability, then set `review_status='APPROVED'`,
`reviewed_by` and `reviewed_at`. Repeat the parent review and republish. Supported
formats are SVG/PNG/JPG/JPEG/WebP images and MP4/WebM video. Paths must be local,
under `/media/knowledge/`, without traversal, query strings or executable URL schemes.
Deploy the reviewed asset at that path through the eventual frontend/static host.
The API `available` flag reflects editorial approval; storage existence is verified
by the publishing operator, not probed by the backend.

## Validation

Focused PostgreSQL 17 / Spring Security suite:

```powershell
.\mvnw.cmd -B '-Dtest=KnowledgeHubTests,AccountSchemaTests' test
```

Full regression:

```powershell
.\mvnw.cmd -B test
```

Both use the existing nonreusable PostgreSQL 17 Testcontainers configuration and
never use the development DB URL. Coverage includes V35→V36 upgrade, catalog and
seed integrity, authenticated role access, denied writes, disabled users, hidden
drafts, safe errors, composite finding mappings, publication gates, invalid media,
and replacement/republication.

Executed on 2026-11-15 using PostgreSQL 17.12 Testcontainers:

| Suite | Tests | Failures | Errors | Skips | Result |
|---|---:|---:|---:|---:|---|
| Focused: KnowledgeHubTests + AccountSchemaTests | 16 | 0 | 0 | 0 | BUILD SUCCESS, 53.091 seconds |
| Full backend regression | 302 | 0 | 0 | 0 | BUILD SUCCESS, 5 minutes 26 seconds |

The focused upgrade validated V1–V35, applied V36 and validated the resulting
history. Tests created only disposable test-container databases/schemas. Development
PostgreSQL on 5433 was not connected to or migrated. No clinical thresholds were
activated, no ML model was connected, and no files under frontend, ml or simulation
were modified. Nothing was staged, committed or pushed. Stop here for review before
ML integration.

## Implementation files

New files:

- `src/main/resources/db/migration/V36__health_knowledge_hub.sql`: schema, publication guards, source-verified educational seeds and mappings.
- `src/main/java/com/augustine/nasa_space_app_backend/dto/KnowledgeResponses.java`: frontend response allowlist.
- `src/main/java/com/augustine/nasa_space_app_backend/service/KnowledgeService.java`: authenticated published-content reads and explicit mapping resolution.
- `src/main/java/com/augustine/nasa_space_app_backend/controller/KnowledgeController.java`: read-only routes.
- `src/main/java/com/augustine/nasa_space_app_backend/controller/KnowledgeExceptionHandler.java`: safe catalog errors.
- `src/test/java/com/augustine/nasa_space_app_backend/KnowledgeHubTests.java`: 12 PostgreSQL/security/publication/upgrade tests.
- `docs/health-knowledge-hub-phase4f.md`: this contract, sources and workflow.

Updated files:

- `src/main/java/com/augustine/nasa_space_app_backend/security/SecurityConfig.java`: allow only authenticated GET routes for the two established roles.
- `src/test/java/com/augustine/nasa_space_app_backend/AccountSchemaTests.java`: expect V36 and seven migrations after V29.

Generated test logs are `backend/target-phase4f-focused.log` and
`backend/target-phase4f-full.log`. A local seed-generation helper under ignored
`backend/target/` was used to author V36; it is not a runtime component or deployment
dependency. Flyway executes the complete SQL migration directly.
