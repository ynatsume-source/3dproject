# Gauge setup connection review — 2026-10-12

## Scope and bases

- Independently reviewed `79106ca9456857add0dc31aa9b3f7640ffc9c347` (`fix/gauge-setup-epoch`), against `a6ac02e155cb32d17ea5d9ebbd028909bf237916`.
- Main at review: `395beae25c3460d13cf04296375af2ee552186d7`; it is an ancestor of the integration candidate.
- `a6ac02e` contains the 13-file science import from `1e2e103338e053245b05223bbba28205344c252a`. The science review was already accepted; it was not repeated. This follow-up changes no science equations, coefficients, versions or files.
- Review covers setup comparison, hypothesis/report consumers, placement records and the existing load/runner/water connection. It is not a whole-repository review. Other natural-world changes and the separate F1/F2/F4 candidates are excluded.

## Findings and changes

1. **P1 — absolute threshold crosses setups.** `hypoRead` restricts the observations used to *create* a hypothesis, but an existing `h.mark` and pending alarm remain active at the new zero. The absolute hypothesis now carries `processId` and `runId`. On replacement, the whole old hypothesis is retained in `village.hypoHistory` with retirement time and next run ID, and no longer participates in current alarms/tallies. The new setup uses its own first 16 readings (the existing sample requirement). Earlier qualitative heat insight survives; numerical threshold and tallies start afresh. Untagged legacy hypotheses are archived without inventing their provenance on the first tagged reading, or at replacement.
2. **P2 — morning report mixes gauges and setups.** `morningNight` previously counted every numeric gauge reading and reported the last one, including a weather pot. It now reports the test gauge's latest setup only, including the zero-reading interval following placement. The spoken frame, listener diary and knowledge share that filtered set.
3. **P2 — placement diagnostics use stale display weather.** `gaugePlaced` read `wxNow`, which can lag the recorded placement time. It now reads `islandWeather(clockMs)`. For example, in the synthetic corrupt-pot scenario the prior cached pressure was 1012.7 hPa while the placement-time record was 1013.3 hPa. These diagnostics remain in the world's record; the reinstallation diary only says it was placed again.

The day-difference hypothesis remains active: its threshold describes a difference, and `dayAgo` only compares readings with the same process and run ID. It is usable from the first valid within-setup pair, without an extra quarantine. A new first-day reading cannot pair with an old setup or another gauge.

A released water lot may be merged into the rain jar. The ledger retains 1,000,000 mg total in the integration fixture before/after replacement, including the newly reserved 250,000 mg. Placement records retain old and new lot IDs even when the old lot no longer exists. Reusing the old lot ID is not required.

## Verification

- Fixed SHA, original `gauge-epoch-check`: **11/11 pass**. This does not cover the threshold/report defects above.
- New deterministic `gauge-hypothesis-check`, run against fixed-SHA `residents.ts`: **13/21 fail**, including old threshold/alarm carryover, mixed morning report and stale weather. With this patch: **21/21 pass**.
- Extended `gauge-epoch-check`: **17/17 pass**. Both old process versions stop without being relabelled; reservations release; both corrupt gauge states fail and reinstall with reasons; old observations/hypotheses survive; actual residents save/load preserves active hypotheses, archives, placement records, run identities and water. Legacy saves without `hypoHistory` are covered.
- Existing `hypo-check`: **7/7 pass**.
- Typecheck and production build: **pass**. Existing Vite config/chunk-size warnings remain.
- Initial full fast suite: 38/39 passed; `social` had four failures because its gauge fixtures used the fictitious process ID `test`. The fixtures now carry the real test-gauge process ID and a setup ID, with a later weather-pot decoy to verify the spoken report, listener diaries and onward sharing still use the test gauge. Final full-suite rerun: **39/39 pass**, including the updated social fixtures.

The deterministic check extracts the actual resident functions with the TypeScript parser; it stubs weather and presentation, not comparison logic. The integration check uses `makeResidents`, the real runner and science implementations, an in-memory `localStorage`, and synthetic lots. No user saves, credentials or paid AI calls are used.

Reproduce the fixed-SHA failures:

```sh
git show 79106ca9456857add0dc31aa9b3f7640ffc9c347:src/robots/residents.ts > /tmp/gauge-before.ts
GAUGE_RESIDENTS=/tmp/gauge-before.ts node --import tsx scripts/gauge-hypothesis-check.ts
```

Run the current checks:

```sh
npm run typecheck
npm run build
node scripts/checks.mjs fast
```

## Limits and existing issues

- The pre-existing 400-entry `gaugeLog` cap still evicts oldest entries. No new clearing of history is introduced; this separate retention issue remains open. Hypothesis archives are saved without a new truncation policy.
- The existing general `setWeather` storm notification includes true pressure in resident diaries. This predates the reviewed epoch change, is outside the placement-record fix, and remains for the separate connection/privacy fixes. This PR does not claim all resident weather exposure is resolved.
- Slow suite, browser rendering/HUD, GPU/performance and real user-save migration were not run. This patch changes resident logic and synthetic-tested save fields, not rendering; no visual/performance acceptance claim is made.
- No main merge/push, deploy, or communication to Claude.
