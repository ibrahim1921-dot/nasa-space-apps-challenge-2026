# Frontend integration assumptions

These are provisional frontend adapter shapes, not changes to API contract v0.1.
The backend team should confirm them before integration.

| Endpoint | Provisional response |
| --- | --- |
| health | `{ status: "UP" }` |
| crew | Array of `{ id, name, role }` |
| readings | `{ crewId, indicator, source, readings: [{ recordedAt, value, status }], usual?: { low, high } }` |
| nights | `{ subject, source, subjects: [id], nights: [{ date, status, anomalyScore, reason }] }` |
| labs | `{ analyte, source, unit, analytes: [id], referenceRange: { low, high }, draws: [{ draw, crew1, crew2, crew3, crew4 }] }` |
| radiation | `{ source, days: [{ date, dailyDose, accumulatedDose }] }` |

Summary indicators may include `reasons`, `usual`, and `guidance`; missing optional data is shown as unavailable. Summary body region IDs are `head`, `chest`, `abdomen`, `whole_body`, and `bones_muscles`. Context has no medical status. Check-in results use the supplied object of indicators and global guidance; partial evaluations remain partial and are not filled with invented results.

The sample's `usual.mean` is insufficient to calculate a reference band. Bands appear only for explicit `low` and `high` bounds. Escalation identifiers provisionally accept `crew_medical_officer` and `flight_surgeon`; other values are displayed literally.

Mocks use fixed synthetic scenarios, never medical thresholds. All demo charts, including the NASA/PhysioNet contextual views, are visibly marked synthetic and must not be presented as real dataset observations.

Open backend questions: endpoint shapes and empty states; subject/analyte discovery; available history limits; usual range bounds; per-indicator versus global guidance; escalation enum; server-side mood access control; retry deduplication. The offline queue sends an `Idempotency-Key` header; the backend must support it to prevent duplicates after uncertain network failures. A browser crew picker is not authentication. Local data is stored per crew ID, but is accessible to other people using the same browser profile; production privacy needs authenticated server access and an agreed storage policy.

HTTP errors display the API's message and are not treated as an offline success. Network failures and unavailable server responses can use cached GET data; with no cache, the page shows an explicit unavailable state. Pending check-ins are never given a medical result until the API evaluates them.
