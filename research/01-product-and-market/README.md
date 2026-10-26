# Product and market

[Research index](../../README.md) · [Workflow requirements](../02-grading-workflows/README.md) · [Roadmap](../10-development-roadmap/README.md)

## Product thesis

The opportunity is a focused residential grading workspace that helps a designer reach an understandable, editable result and hand it back to Civil 3D quickly. A useful positioning hypothesis is:

> Import a lot and its existing ground, establish the house and drainage controls, adjust grades while contours update, and export a checked surface and contour drawing.

This hypothesis needs customer validation. A smaller interface alone does not prove that another application saves time: preparation, importing, exporting, and downstream cleanup all count.

## Initial users and jobs

| User | Main job | Product implication |
| --- | --- | --- |
| Civil/site engineer | Resolve building elevations, drainage, access, and tie-ins | Numeric control, clear constraints, sections, provenance |
| Civil designer or technician | Produce and revise lot grading repeatedly | Templates, snapping, keyboard entry, immediate feedback |
| Small land-development practice | Complete smaller jobs without a large workflow overhead | Local files, predictable installation, minimal setup |
| Builder's design team | Evaluate house placement and elevation alternatives | Saved alternatives, reusable building templates, transparent quantities |

Target professional design first. A homeowner-oriented product would require a different input-data workflow, terminology, support model, and boundary around engineering decisions.

## Existing alternatives

The following capabilities come from official documentation and product pages. They establish competition, not measured usability or reliability.

| Product / approach | Evidence | Implication for this product |
| --- | --- | --- |
| Civil 3D grading | Feature-line and projected grading workflows already exist. [Autodesk grading overview](https://help.autodesk.com/cloudhelp/2024/ENU/Civil3D-UserGuide/files/GUID-3E75D600-B442-4C78-8DCC-C649E1ED1F87.htm) | Benchmark a skilled user's existing workflow, including templates. |
| Autodesk Grading Optimization | Uses deterministic optimization with grading and drainage constraints and returns results to Civil 3D. [Official overview](https://help.autodesk.com/cloudhelp/ENU/C3DGO-Help/files/about.html) | Automatic grading is already available; explainability and task speed must distinguish the product. |
| Bentley OpenSite+ | Bentley markets parametric site objects, earthworks optimization, and integrated drainage analysis. These are vendor claims. [Product page](https://www.bentley.com/products/opensite/) | Broad site optimization is a competitive field; begin with a narrower lot workflow. |
| Carlson P3D | Carlson lists surface creation/editing, dynamic contours, breaklines, and volume tools. [Product page](https://www.carlsonsw.com/product/carlson-precision-3d) | Dynamic contours alone will not differentiate the tool. |
| Site3D | Documents editable earthwork features, stepped grading, and quantities updated with design changes. [Feature reference](https://www.site3d.co.uk/features.htm) | Ease of use is already a competitor claim; test complete tasks. |
| Firm-specific scripts and templates | Customer discovery required; no scripts were inspected | Ask what is already automated before rebuilding it. |

No market size, pricing comparison, purchase intent, or competitor performance is established by this research. Do not treat advertised speed or AI functionality as independent evidence.

## Recommended product boundary

Start with one detached home and a small surrounding context, while retaining a data model that can hold multiple buildings and shared edges. A townhouse often depends on its neighbors' grades; an apartment building commonly depends on parking, access routes, common areas, and multiple entrances. Those workflows deserve separate product validation.

| First usable release | Later expansion | Separate product scope |
| --- | --- | --- |
| Existing terrain, lot boundary, building footprint | Repeated lots and townhouse rows | Road corridor design |
| Pads, spot grades, breaklines, slope zones | More complex driveway transitions | Utility and pipe networks |
| Simple swales and explicit outlets | Constrained elevation assistance | Full hydrologic/hydraulic design |
| Tie-ins, sections, local grade diagnostics | Multi-building multifamily sites | Structural retaining-wall design |
| DXF contours, LandXML TIN, project file | Civil 3D companion add-in | General-purpose CAD replacement |

Do not allow an unsupported site condition to be disguised by an attractive contour picture. Make limitations visible at the affected geometry.

## Differentiation to test

1. **Residential intent:** change a pad elevation and see yard, driveway, and tie-in consequences together.
2. **Understandable revisions:** show which controls are fixed, derived, or conflicting.
3. **Clean workspace:** contextual tools, muted references, restrained labels, one issue list.
4. **Low handoff cost:** correct elevations, coordinates, boundary behavior, and a short Civil 3D import procedure.
5. **Reusable practice standards:** office-approved templates and rule profiles with explicit versions.

## Customer discovery and commercial validation

Recruit a proposed 6–10 designers across at least three practices. Observe actual detached-home, townhouse, and multifamily tasks, using files they are permitted to share. Capture the time spent preparing input, designing, checking, exporting, and cleaning up in Civil 3D. Include a competent Civil 3D baseline, not just novice use.

Ask which revisions recur, how a design is approved, what files arrive, whether DWG-only input is a barrier, which versions are deployed, and whether independent desktop software is acceptable. Collect failed or awkward examples as well as simple ones.

Proposed pilot success criteria: a material reduction in total task time, fewer import/export corrections, no loss of required control, and willingness to use the result on another job. A starting business target is **at least 30% median end-to-end time reduction** on the agreed pilot tasks; it is unmeasured and should be revised with baseline evidence.

Test willingness to pay after demonstrating a working handoff. Compare a per-seat subscription and an annual desktop license with maintenance; no price is recommended yet. Use observed hours saved, procurement preferences, support cost, and paid pilot conversion to set pricing. Do not forecast revenue from vendor feature lists.
