# Risks, open questions, and decisions

[Research index](../../README.md) · [Validation](../08-validation-and-testing/README.md) · [Roadmap](../10-development-roadmap/README.md)

## Highest-priority risks

Priority describes the recommended order of investigation, not a measured probability. Owners are proposed roles for a future team.

| Priority | Risk / consequence | Proposed owner | Mitigation and evidence needed |
| --- | --- | --- | --- |
| P0 | Contours look reasonable but the terrain drains incorrectly | Civil engineer + engine developer | Review the TIN, control residuals, sections, flat areas, depressions, and outlet paths on analytic and real cases |
| P0 | Civil 3D rebuilds a different surface or fills a hole | Interoperability developer | Full-face export, pinned import settings, boundary/hole fixtures, real receiving/re-export tests |
| P0 | Wrong axes, foot definition, or vertical reference shifts the design | IO/domain developer | Explicit coordinate contract, asymmetric controls, known benchmark checks, no silent transformations |
| P0 | Inputs lack the accuracy/coverage needed for lot design | Civil engineer + product lead | Source-quality/provenance requirements and clear unsupported/missing-data diagnostics |
| P0 | Application cannot represent a required wall or conflicting elevation | Engine developer + engineer | Enforce initial 2.5D scope; reject unsupported discontinuities; design patches/interfaces before expansion |
| P1 | Import/export preparation eliminates time savings | Product lead | Measure the entire customer task; investigate a companion tool if justified |
| P1 | “Simple” daylight grading fails at concave corners and tight yards | Geometry developer | Bounded operation scope, assembled-surface validation, adversarial fixtures and explicit failures |
| P1 | Numerical instability causes broken topology or hanging builds | Geometry developer | Robust predicates, local origin, separate tolerances, bounded work, minimized regression cases |
| P1 | Revisions silently invalidate neighboring townhouse grades | Domain developer + engineer | Shared control identities, dependency tracking, row/context validation |
| P1 | Optimization returns a plausible approximation with violations | Optimization developer + engineer | Defer initially; restricted formulation, solver-state handling, independent residual checks |
| P1 | Stack selection conflicts with launch platforms or team skills | Technical lead | Confirm Windows/macOS requirements and team experience before UI implementation |
| P1 | Geometry or CAD dependency is unsuitable for distribution | Technical lead | Pin sources, review actual licenses/components, prepare notices/source access, obtain commercial terms where needed |
| P1 | Civil 3D runtime/build changes break a companion add-in | Integration developer | Keep exchange usable independently; test exact host builds and SDK/runtime combinations |
| P2 | Dense labels/reference linework recreate the clutter users want to avoid | UX/product lead | Task-based tools, visibility defaults, label density, observed usability testing |
| P2 | Public terrain or quantities are overinterpreted | Product + engineer | Show source quality, calculation scope, assumptions, and limits of completed checks |
| P2 | Data loss, malformed files, or native errors erode trust | Application developer | Atomic save, recovery, bounded parsers, native boundary validation, clean-machine release tests |
| P2 | Established tools already satisfy the proposed benefit | Product lead | Compare complete tasks against skilled workflows; validate repeat use and willingness to pay |

## Decisions to settle before substantial implementation

| Question | Working assumption | Evidence that changes the recommendation |
| --- | --- | --- |
| Who is the first user? | Professional civil/site designer | Homeowner/builder self-service requires a different product and input workflow |
| Which country/jurisdiction? | US context for this research | Different units, standards, approvals, and drafting practices require localized rules |
| Which housing type launches first? | Detached home | A townhouse/multifamily pilot needs larger context and more controls immediately |
| Windows or cross-platform? | Windows x64 first | Required macOS support changes WPF choice before implementation |
| Standalone or add-in? | Standalone editor, file exchange first | Strong demand for in-drawing work may justify an early focused add-in |
| What input files actually arrive? | LandXML terrain plus DXF/reference linework | DWG-only, contour-only, or point-cloud-heavy inputs expand ingestion scope |
| What should Civil 3D receive? | Contour polylines and a TIN | Native editable grading objects, labels, styles, or live sync require additional integration |
| Which Civil 3D builds? | Select from pilot installations | Cannot certify a release family without real receiving tests |
| What engineering tolerance is required? | Start experiments around millimeter-scale exchange comparison | Customer standards, survey quality, and geometry determine actual precision policy |
| Is automatic grading essential at launch? | Explicit controls and fast updates first | Discovery may justify limited assistance, but does not remove validation needs |
| How complex are lots? | No exact vertical walls or arbitrary site structures | Required discontinuities change the surface representation/scope |
| What team and budget are available? | Two experienced developers + recurring engineer input | Solo or non-geometry team should narrow scope/revisit library and UI choices |

These questions do not prevent completing research. They are the recommended discovery agenda, not requests for approval of this documentation.

## Important evidence gaps

1. **No real Civil 3D compatibility test.** Published import support establishes a route, not a guarantee for a writer or every product update.
2. **No verified LandXML XSD artifact.** The original schema endpoint was inaccessible through the research browser. Obtain a trusted copy, record its provenance/hash, and validate an implementation against it.
3. **No library bake-off.** Candidate capabilities and licenses were reviewed, but no source build or runtime benchmark was performed.
4. **No customer interviews.** Speed, simplicity, input practicality, repeat usage, and pricing remain hypotheses.
5. **No engineering approval.** Domain requirements and checks need review by a practicing engineer familiar with the target jurisdiction and pilot sites.
6. **No applicable-code determination.** Referenced standards are contextual evidence. The 2024 ICC chapter could not be directly fetched; the available Oregon sample is explicitly a different edition/jurisdiction.
7. **No vendor quotes.** Direct DWG/Civil SDK costs and terms remain unverified.
8. **No platform/installation proof.** Windows UI, native deployment, graphics, and Autodesk runtime compatibility need actual machines.

## Decision record template

For each substantial implementation choice, capture:

```text
Decision ID and date:
Problem / required behavior:
Alternatives considered:
Relevant source and exact version/build:
Experiment / fixture and result:
Chosen approach and rationale:
Known limitations and fallback:
Owner and review trigger:
```

First records should cover launch platform, Civil 3D exchange profile, coordinate/precision policy, triangulation implementation, supported daylight configurations, and pilot success metrics.

## Recommended stopping or pivot conditions

- If survey/reference preparation dominates the task, solve ingestion/integration before expanding the grading engine.
- If required lots commonly need unsupported discontinuities or large connected site models, revise the initial scope and representation instead of silently approximating them.
- If target Civil 3D imports cannot preserve the promised surface with an acceptable workflow, revise the export contract or introduce a tested companion integration before selling compatibility.
- If pilots show no meaningful end-to-end benefit, revise the workflow/product position before investing in optimization or a broad feature catalog.

These are investment decisions based on observed outcomes, not reasons to defer the initial bounded experiments.
