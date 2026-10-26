# Development roadmap and proof points

[Research index](../../README.md) · [Architecture](../05-architecture-and-stack/README.md) · [Risk register](../11-risks-and-open-questions/README.md)

## Build in evidence-producing stages

The next investment should establish that the surface is correct, the handoff works, and the focused workflow saves time. Build one complete slice before expanding the number of grading objects or housing types.

The estimates below are planning ranges, not commitments. They assume roughly **two experienced software developers**, one capable of computational geometry, plus regular access to a practicing civil/site engineer and pilot designers. Some activities can overlap; elapsed total is not the sum of all rows. A solo developer should reduce initial scope and re-estimate after the first experiments.

| Stage | Indicative effort / elapsed range | Concrete output | Exit criterion |
| --- | --- | --- | --- |
| 0. Discovery and input collection | 1–2 weeks | Task recordings, prepared files, required Civil 3D builds, platform decision | Agreement on one initial lot workflow and measurable baseline |
| 1. Interchange proof | 1–2 weeks | Tiny analytic TIN, DXF contours, export manifest, receiving checklist | Actual Civil 3D imports preserve required coordinates/elevations/domain |
| 2. Geometry foundation | 2–4 weeks | Headless mesh adapter, constraints, contours, analytic fixtures | Constraint/domain/degeneracy cases pass; library decision recorded |
| 3. Detached-home vertical slice | 4–8 weeks | Project → EG/reference import → pad/yard/swale/tie-in → review → export | A pilot designer completes a realistic supported lot end to end |
| 4. Reliability and pilot hardening | 4–8 weeks | Diagnostics, sections, recovery, numeric entry, packaging, regression corpus | Engineer-reviewed pilot tasks and measured speed/cleanup benefit |
| 5. Housing/workflow expansion | Re-estimate after pilots | Townhouse interfaces, repeated templates, later multifamily controls | Each added workflow passes its own cases and handoff checks |
| 6. Optional assistance/integration | Re-estimate per feature | Limited optimization or Civil 3D companion add-in | Demonstrated reduction in an observed bottleneck without hidden violations |

A reasonable initial planning envelope is **roughly 3–6 months to a restricted pilot** for the assumed team, with substantial uncertainty around difficult geometry and customer data. A production product with broad townhouse/multifamily support is a separate estimate. No fixed budget is defensible before stages 0–2.

## Stage 0: agree the first job

Recruit a proposed 6–10 designers across at least three practices, with a smaller hands-on pilot group. Collect permitted examples and record which preparation steps are required. Confirm Windows versus macOS, standalone versus in-Civil-3D expectations, and whether LandXML/DXF input is practical.

Select one detached-home case and one difficult variant, such as a tight side yard or changed garage elevation. Define the control elevations, grading limit, outlet, criteria, and expected handoff. Establish baseline total task time and downstream cleanup, not just contour drafting time.

**Decision:** if preparing inputs costs more than the grading workflow saves, investigate a companion exporter or revised input strategy before adding features.

## Stage 1: prove the export before the editor

Implement a headless experiment that writes a small known surface and its contours. Include a concave boundary/hole case and asymmetric E/N coordinates so an axis swap is obvious. Test meters and the foot definitions used by pilot customers.

Run the [Civil 3D receiving procedure](../04-civil3d-interoperability/README.md#proposed-receiving-procedure) on real installations. Retain source fixture, exported files, checksums, exact build/settings, re-export, and numerical comparison report. Obtain and pin the LandXML schema, and validate emitted XML.

**Decision:** pass only when actual Civil 3D geometry matches the intended surface and DXF linework. A screenshot of imported contours is insufficient. If boundary/source-data settings affect results, define and test the supported import profile.

## Stage 2: make the engineering core dependable

Compare CDT native and managed implementations through one interface. Establish geometry tolerances and input validation. Implement constrained surface construction, elevation assignment, contours, point queries, and limited explicit grading operations on analytic fixtures.

Build a CLI that can load a fixture, rebuild, produce diagnostics, and export a deterministic package. Make the same core callable by the future UI. Start with full rebuilds; benchmark before optimizing.

**Decision:** choose the geometry backend using correctness, maintainability, deployment, and measured performance. Exclude unsupported daylight/corner or vertical-wall configurations explicitly.

## Stage 3: first complete editor

Minimum backlog in dependency order:

1. Versioned project save/open, EG import, reference canvas, coordinates and unit confirmation.
2. Selection, snapping, numeric entry, undo/redo, stable semantic object IDs.
3. Building footprint and distinct pad/floor/garage controls.
4. Fixed grades, simple yard regions, swale controls with an explicit outlet.
5. Bounded supported daylight/tie-in operation and clear conflicts.
6. Derived contours, slope/flow checks, sections, accepted/stale surface status.
7. Matching DXF/LandXML/manifest export and receiving instructions.

Include at least one closed low-spot and one no-daylight test before putting the tool in front of pilots. Either correctly implement geometric quantities or leave them explicitly unavailable; do not ship an unlabeled approximate “earthwork” number.

## Stage 4: turn a demonstration into a pilot product

Measure the performance targets on an agreed reference machine, work through pilot issues, and harden import reporting, recovery, version migration, diagnostics, and the signed installer. Check large-coordinate behavior and repeated revision/export workflows.

Complete practicing-engineer reviews and real Civil 3D round trips. Publish the supported version/build matrix and geometric scope. Review dependency notices/source obligations and commercial distribution needs.

**Decision:** continue based on observed adoption, time savings, confidence in revisions, and acceptable support burden. Use the proposed 30% median end-to-end improvement target as a hypothesis, with sample size and exceptions reported.

## Later features, ordered by demonstrated need

| Feature | Add when |
| --- | --- |
| Office house/lot templates | Repeated controls demonstrably consume pilot time |
| Townhouse/shared-lot workflows | Shared boundary ownership and row-level tests are established |
| Multifamily workflows | Route, parking, entrance, and common-area requirements are specified and checked |
| Civil 3D companion add-in | Input preparation/import styling is a measured bottleneck |
| Constrained elevation assistance | Explicit operations are reliable and repetitive adjustment remains costly |
| Direct DWG | Input friction justifies SDK cost and expanded validation |
| Point-cloud/DEM ingestion | Customers supply those sources often enough to justify a source-quality workflow |
| Hydraulic integration | Demand, models, validation data, and specialist expertise are available |

## Practical first two weeks

Week 1: define the pilot workflow and exact receiving environment; obtain representative files and criteria; agree platform and exchange expectations; prepare analytic surfaces and the acceptance checklist.

Week 2: implement and test the minimal LandXML/DXF writer in Civil 3D; compare native/managed triangulation on a small shared corpus; record pass/fail evidence and architecture decisions. If Civil 3D access or source files are unavailable, finish the local experiments but do not mark the handoff milestone passed.

This repository completes the research/documentation stage. The milestones above are recommended implementation work, not work already performed.
