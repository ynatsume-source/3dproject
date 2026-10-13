# Coconut husk soaking: isolated review fixture

Base: `c29829f53a2e19852ced6650ecefdff34473edbc`. This is a bookkeeping and lifecycle prototype, **not calibrated retting science**. Nothing registers it in the production dispatcher, process catalog, resident behavior, rope recipes or readiness flags. Existing scientific parameters, equations and process versions are unchanged.

Local identifier `prototype_coconut_husk_soak`, version `0.0.1`, state `prototype-coconut-husk/1`. It intentionally does not claim the already-used p30x identifier or settle the proposed p06/p07 naming. The existing `civ-sci-test-2` request envelope is used for host compatibility; the prototype is not an entry in that catalog.

## Explicit assumptions, not adopted specifications

Every caller must supply `HuskAssumptions`. Tests choose one hour of eligible island-clock time, a flat 10–40 °C eligibility window, 333333 ppm wet/dry fiber split, water mass at least equal to husk mass, and a 10 kg total-load capacity proxy. These are arithmetic fixtures, not measured temperatures, rates, yields, vessel capacities or realistic waiting times. There are no calibration sources (`sourceRefs: []`); earlier FAO references are not repurposed as calibration.

Inputs are exactly one reserved `coconut_husk` lot, one reserved `process_water` lot, and one local `fixture_coir_basin`. The check feeds real output from `p30x_coconut_milk` into the prototype. Other plants, maturity classes, seawater and rainwater are not classified or approved by this fixture. Generic process water means only an explicit unclassified test-water assumption, not a potable-water assertion.

`recover_fixture` is an **unmodelled test separation**, not resident pounding work and not a claim that passive soaking yields finished rope fiber. After the assumed eligible time it partitions husk into wet `plant_fiber` and wet `pith`. Before that time it returns the husk. There is no evaporation, water uptake, microbial decay, leaching, dissolved solids, contamination, temperature-dependent kinetic law, mechanical energy or equipment wear model. The reserved water is returned unchanged only under those fixture exclusions. No dry fiber or removed water is invented. Production needs a decision about dirty-water identity and composition before integration.

Both husk water and dry mass are split with integer BigInt arithmetic; residual mg go to pith. Generated quality includes exact `prototype_water_mg` so ppm rounding cannot destroy constituent accounting on reload. `readHuskPrototypeLot` validates the local generated-lot input contract. Returned husk and water can start another fixture run; fiber/pith only have a local reader and no enabled downstream production consumer. This does not claim compatibility with an existing rope recipe.

## Clock, persistence and settlement

- The harness declares `clock: 'island'`; the pure core takes already-converted timestamps. Using the existing island clock adapter demonstrates compatibility, not owner adoption of its current time acceleration for this process.
- Environment is sampled at run-origin + n × 30 seconds and held through each cell, including JSON save/reload inside a cell. A request supplies one environmental sample, held into subsequent cells until the next request; callers must split requests at relevant environmental changes. Partition equality requires the same environmental forcing, not two differently sampled weather histories.
- Missing, stale, future-dated or nonfinite temperature freezes eligible time and permanently marks history incomplete. A previously held valid cell completes before a newly reported gap affects the next cell. This follows the existing contract's passive-outage rule without guessing a temperature. Known out-of-window temperature freezes progress without declaring missing history.
- Observations contain only a qualitative sight description. Eligible time and history completeness remain diagnostics/state; they are not instrument readings or resident journal text.
- `world-pause` and `shutdown` preserve running state and settle nothing. `operator` returns unseparated husk and water. Explicit equipment loss returns husk and spills all reserved water to ground under the required test-only loss assumption. Recovery settles once, at its action time. Duplicate terminal state use is refused; the host's request-id guard prevents repeat ledger commits.
- Only saved run states resume accumulated time. A new run on returned husk resets fixture time: transferring progress across potentially changed assumptions is not specified. Prior time remains lot provenance. Existing historical records are not deleted.
- Saved state binds world/epoch/run, input fingerprints, assumptions and reserved equipment identity. Schema, nested cell types, continuity, grid alignment, bounds and terminal state are checked before integration. Changed equipment is refused except at the explicit loss boundary. The fixture assumes the typed request envelope; it does not replace a general untrusted JSON request parser.
- Each request is limited to one day and safe-integer clock arithmetic to bound work; longer experiments use consecutive requests. This is an execution guard, not a physical waiting limit.

## Main-side gaps kept out of scope

The ledger can reserve integer-mg lots and equipment and preserve numeric quality, but lacks an agreed water-source/dirty-water ontology, production coir-basin specification and calibrated fiber/pith definitions. The local basin capacity is a mass proxy, not a volumetric production vessel model. No catalog or material schema was broadened.

The existing host's `nextRequest` assumes reserved equipment still exists when constructing views; actual equipment disappearance needs a host-side loss-event adapter before enabling any resident flow. Tests exercise the core's explicit missing-equipment request, rather than pretending this production gap is solved. The host's bounded committed-request history remains an existing general limitation; this change only checks normal retry idempotence.

## Review handoff

Automated checks cover one-hour vs seven-minute partitions, mid-cell JSON restoration, look neutrality, held weather/gaps/resumption, operational pause/shutdown/operator stop/equipment loss, explicit recovery, actual milk-process husk input, generated-lot reload, nested corrupt-state and version refusal, input/equipment/configuration changes, integer mass preservation, island-clock ledger save/restore, released reservations and duplicate commit rejection. These establish engineering behavior, not biological validity.

Scientific review still needs to choose (1) material/maturity scope and water types, (2) waiting/temperature/missing-data policy and any intentional time shortening, and (3) whether pounding is a separate process, with energy/yield/moisture/dirty-water and equipment-loss accounting. Rainwater, passive soaking followed by separate pounding, and the current island acceleration are proposals only. Minimal owner direction is the intended material/water scope and whether to pursue a separate pounding process; numerical calibration should follow scientific review, not an owner guess.

No production activation, main merge, deployment, real user save access or paid AI invocation is part of this prototype. Browser/visual and long simulation checks are not substitutes for the missing science review.

## Independent review corrections (HUSK-1/2/3)

- **Chronological settlement:** actions belong to `[from, to)`; `stop` occurs at `to`. The earliest recovery action therefore ends the run before a later operator stop, pause, shutdown or equipment loss. That single selected ending determines status, settlement and water disposition: later equipment loss cannot spill water already returned by recovery. An empty equipment view on an explicit later loss boundary is allowed for an existing saved run; its saved equipment identity describes the earlier operation.
- **Same-time boundary:** a recovery at exactly `interval.to` is outside the action interval and the entire request is refused without settlement, even when a stop is present. Encode that action in the next interval. At that boundary operator stop/equipment loss already terminated the run, so it cannot subsequently recover; world-pause/shutdown preserve the run and allow recovery at the next interval's start. Multiple recovery actions at the same valid timestamp settle exactly once. These rules retain the shared half-open interval contract; they introduce no competing-event priority inside one valid request.
- **Water input:** optional `process_water.water_ppm` must equal 1000000, including when exact water mass is absent. Contradictory values are refused without consumption. Missing quality remains accepted as unclassified all-water fixture input. This does not introduce mixed or dirty water.
- **Save compatibility:** schema `/1` is retained. Assumption object keys within the binding are sorted before comparison and when writing the next state. Existing `/1` bindings with either original or reordered keys remain readable when all values and other binding components match. No scientific value is migrated; changed values, invalid nested state and malformed binding JSON remain refused.

The six independent-review counterexamples were reproduced on `59b7114afbe9ed72bc88b1d3cfeff05237d6c9f1` before changing the core, then passed after correction. Regression checks also cover same-time boundary handling for all four stops, unsorted/duplicate recoveries, water-quality combinations, legacy key orders, every assumption field changing, and malformed binding data. Scientific assumptions, production registration and readiness remain unchanged.
