# Validation, testing, and acceptance

[Research index](../../README.md) · [Engine](../03-surface-and-contour-engine/README.md) · [Civil 3D exchange](../04-civil3d-interoperability/README.md)

## Quality strategy

Validate three different things: **the mathematical surface**, **the engineering workflow**, and **the receiving Civil 3D result**. A screen preview, schema-valid XML, or successful import alone cannot establish all three.

Use small analytic fixtures before large real projects. Keep independent calculations or a separate checker for important quantities and constraints. Tests that only repeat the production implementation can agree with the same error.

## Proposed analytic fixture suite

| Fixture | Independent expected result |
| --- | --- |
| Tilted rectangular plane | Exact triangle gradients, spot elevations, and evenly spaced contours |
| Flat pad and surrounding plane | Pad elevations, planned grade breaks, contour plateau handling |
| V-shaped swale | Known longitudinal fall and bank geometry; flow reaches designated endpoint |
| Ridge and saddle | Correct branching/meeting behavior at critical levels without duplicate edges |
| Closed depression | Diagnostic identifies the basin; engine does not silently fill it |
| Concave limit and internal hole | No active faces or contour segments across excluded areas |
| Crossing compatible breaklines | Split topology with the agreed Z at intersection |
| Crossing incompatible breaklines | Named conflict; no silently averaged elevation |
| Coplanar and near-collinear input | Defined degeneracy behavior; no invalid faces or hangs |
| Daylight to a known plane | Analytic intersection, cut/fill choice, correct assembled boundary |
| No daylight intersection | Bounded termination and a located failure |
| Two different EG/FG triangulations | Overlay-volume result agrees with analytic piecewise integration |
| Mixed cut and fill in one region | Separate cut/fill totals, including splitting at zero difference |
| Large coordinates | Same relative geometry after local-origin translation |
| Meter/international-foot/survey-foot variants | Correct equivalent coordinates and areas/volumes |
| Shared townhouse edge | Both designs retain consistent interface elevation |
| Unsupported wall | Clear limitation; no merged top/bottom or arbitrary narrow triangles |

Use fixtures with exact-on-contour vertices, negative levels, very short segments, duplicate points, nested boundaries, and surface gaps. Retain minimized real failures as regression fixtures.

## Geometry invariants

- All engineering coordinates are finite; face references are valid.
- No active triangle has invalid area/orientation or overlaps another active triangle interior.
- Every intended constraint is represented by an edge or ordered subedge chain with provenance.
- Every domain boundary/hole is represented correctly; coverage matches the declared domain within the precision policy.
- A continuous surface has compatible elevations across shared edges.
- Every contour has the intended level within numerical tolerance and lies on the accepted TIN before optional presentation simplification.
- Contour endpoints are justified by boundaries, degeneracies, or documented branching; no arbitrary gaps arise from stitching.
- Cancellation or failed builds preserve the previous accepted revision.

Do not universally assert that same-level contour branches can never meet: saddles require special handling. Define valid topology and deterministic polyline splitting for those cases.

## Engineering checks

Calculate residuals in project units: elevation mismatch, grade difference, uncovered edge length, and disconnected outlet path. Check every required control and full affected segments/regions, not only selected sample points. Verify that route running slope and crossfall are evaluated relative to the actual direction of travel.

Test rule applicability, disabled criteria, hard/preferred constraints, and recorded acknowledgements. An advisory acknowledgement must never change the computed geometry or turn an unsatisfied hard constraint into a satisfied one.

If optimization is added, independently verify constraints after the solve, including triangle gradients and drainage paths. OSQP has distinct solved, inaccurate, infeasible, time-limit, and numerical error states; preserve and interpret them explicitly. [OSQP status reference](https://osqp.org/docs/interfaces/status_values.html)

## Civil 3D compatibility matrix

Select exact supported builds from pilot practices. Candidate release families may include 2025, 2026, and 2027, but **none is certified by this research**. Record release, update/build, runtime, template, unit settings, LandXML settings, and contour style.

For each supported build, test:

| Exchange case | Required evidence |
| --- | --- |
| Plain LandXML TIN | Imported known points, mesh, and active domain match |
| Concave boundary and hole | No filled gaps or unwanted outside faces |
| Major/minor DXF contours | Open successfully with expected elevation, layers, closure, and extent |
| DXF 3D breaklines | Every vertex retains its Z and plan position |
| Large coordinates and foot variants | No axis swap, translation, unit factor, or precision loss |
| Full vs Quick LandXML import | Document expected triangulation differences and required settings |
| Source-data settings | Check duplicate controls and any interaction with imported surfaces |
| Re-export from Civil 3D | Geometric equivalence despite renumbering/reordering |
| Existing drawing insertion | Known reference/control points align in the actual receiving workflow |
| Reimport revised design | Naming/conflict behavior does not silently overwrite an unintended surface |

For surface fidelity, compare vertices, normalized triangle connectivity where required, full boundary/hole geometry, and elevations at controls and independent points. Add comparisons on and either side of swales/ridges and near grade breaks. Matching bounding boxes is insufficient.

Regenerated contour comparisons need equal base, interval, domain, and unsmoothed settings. Near-flat triangles make horizontal contour position sensitive to tiny elevation differences; compare elevations and the underlying surface as well as horizontal line distance.

## Proposed initial tolerances and performance targets

These values are hypotheses for the first experiments. Agree them with the pilot engineer and record them per fixture.

| Metric | Proposed initial target |
| --- | --- |
| Exchange coordinate/elevation difference | ≤0.001 m equivalent on supported fixtures; stricter analytic checks internally |
| Hard constraints | Satisfied within an explicitly declared engineering/numeric tolerance; all residuals reported |
| Simple analytic quantities | Match closed-form result to the fixture's numerical integration tolerance |
| Pointer/selection response | p95 under 100 ms while background work runs |
| Pan/zoom | Around 60 fps on the declared reference machine/scene |
| Typical local design update | p95 under 1 second for the agreed small-lot fixture |
| Full rebuild | Under 5 seconds on an initial 100,000-triangle test scene, or documented scope adjustment |
| Recovery | Last committed project and recoverable autosave survive interrupted save/build tests |

Choose a concrete reference Windows laptop, initially around 16 GB RAM with an SSD, then measure CPU/GPU/driver, mesh size, feature count, contour density, and peak memory. Define “typical lot” using pilot data; triangle count alone does not capture difficult geometry. No performance has been measured yet.

For independent validation of real earthwork quantities, reconcile calculation boundaries, building treatment, surface scope, precision, and material assumptions before choosing a permitted discrepancy. A blanket percentage threshold can hide a modeling error.

## Reliability and import robustness

Exercise malformed XML/DXF, huge counts, invalid face IDs, duplicate IDs, NaN/infinity, incomplete ZIP files, interrupted saves, stale caches, and missing references. Bound parser resource use and prevent XML external resource resolution or ZIP path traversal. Native bridges need sanitizer/fuzz coverage of array bounds and error paths.

Use property-based/metamorphic tests where they add evidence: translating the project should preserve relative grades and volumes; consistent unit conversion should preserve physical results; reordering nonconflicting input should not change engineering outcomes. Where equivalent Delaunay meshes are possible, test equivalence and deterministic tie-breaking rather than expecting arbitrary library index order.

## Pilot and release gates

Before a production release, complete at least one full detached-home job from source files through a checked Civil 3D handoff, then repeat with representative difficult cases. Have a practicing civil/site engineer review controls, diagnostics, sections, and exported geometry. Verify installation/recovery on clean machines and record supported scope and known limitations.

Usability acceptance should count total elapsed task time and downstream corrections, as described in [product research](../01-product-and-market/README.md). Release only the housing types and geometric conditions actually exercised.

**Research-stage status:** this was the initial test plan. For implemented v0 tests and current evidence, use the [acceptance checklist](../../docs/V0-ACCEPTANCE.md). Surface-engine validation and professional design review remain future work.
