# Professional workflow priorities

[Research index](../README.md) · [Original roadmap](../10-development-roadmap/README.md) · [Current application](../../README.md) · [Verification evidence](../../docs/V0-ACCEPTANCE.md)

Planning date: **November 10, 2026**. Baseline: the curve-capable application at `2def453`. This document is a proposed backlog, not an implementation record. No features are implemented by this planning update.

## Implementation checkpoint · November 10, 2026

The planning documentation was committed and pushed as `16c76bc`. The subsequent feature 1 implementation adds endpoint/point/midpoint/arc-center/intersection snaps, visible feedback, target cycling and a temporary override, explicit XY-versus-source-Z behavior, exact coordinate entry, and survey bearing/distance placement. The current tutorial documents that first usable scope. Perpendicular, tangent, and tracking snaps remain later refinements. Features 2–4 have not been started at this checkpoint.

## Recommendation

**November 13, 2026 update:** feature 2 now has a [documented DXF/point import workflow](../../docs/IMPORT.md): mapped CSV/text points, a DXF subset, preview/counts/skipped-record reporting, unit and known-coordinate checks, embedded original sources, and locked reference groups with independent visibility/export controls. Schema 3 preserves that data. Features 3–4 remain unstarted. See the [implementation decisions](../15-survey-reference-import/README.md).

Prioritize a complete real-lot workflow: **bring in existing information → draw and connect precisely → check grades → save a clear project revision → hand it back to Civil 3D**. Then extend that workflow with design controls, terrain surfaces, and bounded grading assistance.

The ranking combines observed gaps in the current code, the user's recent file-location question, the original grading objectives, and established CAD/grading interactions. Professional demand and time savings still need direct testing with practicing designers. The ordering is our product judgment; the linked vendor documentation supports specific workflow precedents rather than this exact ranking.

## What already exists

The application already has a project library, portable project copies, automatic library saves with atomic file replacement, undo/redo, post-placement numeric vertex editing, grid snapping, single-feature movement/duplication, exact planar circular arcs, basic plan measurements, editable DXF layer names, and DXF export.

At the planning baseline, the important gaps were object snapping, precise entry during drawing, survey/reference import, remembered working-file locations, revision recovery, grade calculations, a fuller editing workflow, layer visibility/locking, semantic grading controls, and a terrain engine. See the implementation checkpoint above for subsequent progress. Current curves have one elevation throughout. Manually drawn contours do not establish a continuous ground surface.

## Priority list

Effort is relative engineering complexity, not a schedule or staffing estimate. A minimal dependency may need to accompany an earlier feature: reference import, for example, needs a basic read-only reference group before the full layer manager exists.

| Rank | Feature                                                          | First useful result                                                               | Relative effort                                                |
| ---- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1    | Precision drawing and object snaps                               | Place geometry on actual endpoints and enter coordinates/dimensions while drawing | Medium                                                         |
| 2    | Survey and reference import                                      | Start from a real DXF base plan and mapped survey-point file                      | Large                                                          |
| 3    | Professional file handling and recovery                          | Know the working file, save back to it, and recover an earlier revision           | Medium                                                         |
| 4    | Slope measurement and explicit grade edits                       | Inspect fall and set an endpoint from a chosen grade                              | Medium                                                         |
| 5    | Faster geometry editing                                          | Edit vertices directly and revise groups of features efficiently                  | Medium–large                                                   |
| 6    | Layers, reference visibility, and useful annotations             | Keep a real base plan readable while checking proposed work                       | Medium                                                         |
| 7    | Fixed/relative elevation controls and building-pad relationships | Revise a design while retaining street, threshold, and boundary controls          | Large                                                          |
| 8    | Existing/proposed terrain surfaces and generated contours        | Generate contours from a defined, inspectable surface                             | Very large                                                     |
| 9    | Complete Civil 3D handoff and review packages                    | Transfer the actual TIN and matching linework from one revision                   | Large                                                          |
| 10   | Bounded grading assistance and drainage diagnostics              | Apply supported yard/swale/tie-in operations and locate conflicts                 | Very large                                                     |
| 11   | Profiles, sections, and cut/fill quantities                      | Review transitions and compare existing/proposed ground                           | Large                                                          |
| 12   | Office templates and repeat-lot workflows                        | Reuse a checked setup across similar lots                                         | Medium–large; shared-lot support is a separate large expansion |

## 1. Precision drawing and object snaps

**Why first:** grid snap does not connect geometry to the actual survey or to another feature. Editing every coordinate afterward is slow and makes small connection errors easy to miss.

Start with endpoint, existing-point, midpoint, and arc-center snaps, visible snap markers, and X/Y or distance/bearing entry during placement. Add intersection, perpendicular, tangent, and tracking snaps after the basic selection behavior is reliable. Support temporary snap overrides and a way to cycle competing targets.

Make **XY location** and **elevation acquisition** separate choices. Snapping to a reference at Z=0 must not silently overwrite the intended grading elevation. A snap should not implicitly create a permanent dependency between objects; persistent connections belong to an explicit relationship model.

**Completion example:** draw a precisely dimensioned driveway edge from an existing garage corner to a surveyed street point without repairing its vertices afterward.

Autodesk documents object snaps with visual target confirmation and distinguishes projected snaps from acquiring an object's actual Z. [Object-snap workflow](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-8F5E5431-9EFB-414E-BC6D-2C65EFB2DAC3.htm), [3D snap/elevation behavior](https://help.autodesk.com/cloudhelp/2025/ENG/AutoCAD-Core/files/GUID-F556F13A-C248-4452-9AE6-AADF0DFC8142.htm).

## 2. Survey and reference import

**Why next:** a professional should be able to start with existing information rather than redraw a survey.

Begin with a documented DXF subset for reference linework and CSV/text survey points with column mapping, point number, description, X/Y/Z, and unit confirmation. Include preview, object counts, unsupported-object reporting, source identification, and a known-coordinate alignment check. Preserve original source files and make imported references read-only by default.

Store the horizontal coordinate context, vertical datum or local benchmark, units, and source information. Unknown values should stay explicitly unknown. Assigning a coordinate-system label must not move coordinates; any later conversion or transformation needs an explicit preview. Add LandXML points/faces when surface import is introduced in priority 8. Investigate PDF/image underlays if pilot inputs justify them.

**Completion example:** bring in a permitted survey, verify a benchmark and lot corner, and begin proposed grading in the same coordinate frame.

Civil 3D's point-file workflow requires an explicit description of the incoming column arrangement, which supports a mapping/preview approach here. [Point import and file formats](https://help.autodesk.com/cloudhelp/2025/ENU/Civil3D-UserGuide/files/GUID-39559803-50DE-462F-B4D3-8ABAC900C60D.htm).

## 3. Professional file handling and recovery

**Why this is early:** the recent question about file locations identifies a concrete usability problem. The current library and external snapshot copies are useful, but their relationship is easy to misunderstand.

Propose an explicit working-file association: show the project location, offer **Show in Finder/Explorer**, remember recent projects and export folders, and define Save, Save As, and Save a Copy clearly. Saving a working file should update that file; keeping a separate copy should be an explicit action. Store machine-specific path preferences separately from portable design data.

Extend existing atomic saves with bounded revision backups, a recovery chooser, and protection against silently overwriting a file changed by another session. Missing paths and moved references should be recoverable through a relink workflow. Preserve an intelligible saved/unsaved/recovery state.

**Completion example:** reopen yesterday's project, identify its location, revise it, save to the intended file, and restore the previous revision after a deliberate test failure.

Autodesk's recovery manager is a useful precedent for presenting available drawing/backup versions together. Its specific DWG file conventions do not need to be copied into LotGrade. [Drawing Recovery Manager](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-3F8671B7-B5E7-4092-96C7-C7C330E6C06C.htm).

## 4. Slope measurement and explicit grade edits

**Why this matters:** elevations alone do not tell a designer whether a driveway, yard edge, or swale has the intended fall.

Show horizontal distance, elevation difference, signed percent grade, clearly labeled H:V ratios, and direction arrows between chosen controls. Let the user choose the held endpoint, enter a grade, preview the resulting elevation, and apply one undoable edit. The basic two-point operation can precede a terrain engine; it must not imply that the surrounding ground has been checked.

Use horizontal distance for percent grade: a 2-foot rise over a 100-foot horizontal run is 2%. Handle zero horizontal run explicitly. Project criteria should be supplied and identified by the designer rather than presented as universal compliance defaults. Retain the existing planar-curve restriction; changing Z along an arc needs a separate plan/profile representation and exchange decision.

**Completion example:** hold the street point, set the garage approach grade, and inspect the resulting endpoint elevation before accepting it. A simple longitudinal line-profile preview can follow this measurement tool; surface sections belong to priority 11.

Civil 3D exposes edits by grade, slope, elevation, or elevation difference between selected controls. [Set grade/slope between points](https://help.autodesk.com/cloudhelp/2025/ENU/Civil3D-UserGuide/files/GUID-4A3A774F-06E4-4ED6-8EBE-3B2F8A3E6E7E.htm).

## 5. Faster geometry editing

Add draggable vertex grips, vertex insertion/removal, multi-selection, box selection, and group move/copy first. Follow with explicit join/break, trim/extend, offset, rotate, fillet, and tangent-arc operations based on observed pilot tasks.

Preserve exact arcs, elevations, layers, and identities through each operation. Joining paths with different elevations must expose the conflict instead of flattening them. Offsetting a curve must handle invalid radii and intersections. Keep each accepted operation undoable as a coherent action.

**Completion example:** revise the driveway width and move a house/garage/porch arrangement without selecting and rebuilding every piece individually. General polygon building footprints would also remove the need to assemble every nonrectangular house from rectangles.

## 6. Layers, reference visibility, and useful annotations

Current layer-name assignment is not yet a display-management workflow. Add show/hide, lock, isolate, dimmed references, and purpose-based groups for survey, existing ground, proposed work, buildings, and checks. Make export inclusion explicit and separate from temporary screen visibility.

Add movable spot/contour/grade labels, major/minor styling, sensible label density, and lightweight dimensions. Let users focus on a small task without placing every annotation on screen. Reuse exact values beneath display rounding. A grade arrow on a selected line describes that line; a terrain-flow arrow requires a surface analysis.

**Completion example:** lock and dim the survey, isolate proposed grading, and review elevations without labels covering the house or adjacent contours.

Autodesk's layer workflow provides precedents for function-based groups, visibility, and locking while retaining reference geometry. [Layer organization and locking](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-6B3E3B5D-3AE2-4162-A5FE-CFE42AB0743B.htm).

## 7. Fixed/relative elevation controls and building-pad relationships

Introduce explicit fixed, adjustable-with-bounds, and derived elevation controls. Store floor, pad, garage slab, threshold, and adjacent finished ground as separate values with named relationships. Distinguish the lot boundary from the grading limit and any protected edge.

A first slice can update explicit relationships and report incompatible inputs. Detect missing references and dependency cycles, preview affected objects, and preserve fixed controls. An adjustable value gives a later grading operation permission within defined bounds; it is not permission for arbitrary background changes. Keep building exclusions separate from assumptions about excavation under the building.

**Completion example:** change the finished floor, update the linked threshold, and identify the driveway conflict while the surveyed street elevation remains fixed.

This is consistent with the distinction between absolute and surface-relative elevations in Civil 3D, although LotGrade should make its own dependency behavior explicit. [Feature-line elevation editing](https://help.autodesk.com/cloudhelp/2025/ENU/Civil3D-UserGuide/files/GUID-3DADB332-93E5-499E-9D36-D6EAE264BF16.htm).

## 8. Existing/proposed terrain surfaces and generated contours

This is the largest change toward the original grading goal. Add an existing-ground surface with provenance and a separate proposed-ground surface built from accepted controls, breaklines, grading limits, and exclusions. Import existing LandXML faces where available; unconnected survey points need their own surface-building assumptions.

Use a constrained TIN with point queries, inspectable triangles, explicit coverage, and contours generated from that same surface. Distinguish manual linework from derived contours. Mark results stale after an input changes and preserve the last accepted result when a rebuild fails.

Start with planes and one detached-home case. Verify holes, breaklines, saddles, incompatible crossings, and large coordinates. Curved constraints need a documented mesh approximation tolerance while source drawing arcs remain exact. Use the [surface-engine research](../03-surface-and-contour-engine/README.md) for the deeper geometric plan.

**Completion example:** adjust a pad control and rebuild a matching surface/contour set that can be independently queried and checked.

## 9. Complete Civil 3D handoff and review packages

Preserve the existing DXF route throughout development. Add export profiles, selected deliverable scope, layer/label conventions, and a record tying outputs to project revision, units, coordinate context, and findings. Add LandXML TIN output once a valid surface exists so the receiving designer can use the same terrain rather than reconstruct it from contours.

Prototype face-preserving surface exchange alongside priority 8; do not wait for all automated grading operations. The larger productized export package is ranked here because it depends on a surface model. Test concave limits, holes, curves, differing foot definitions, and known controls in the actual Civil 3D 2025 receiving workflow.

**Completion example:** open the matching DXF and surface in Civil 3D, check the benchmark and terrain domain, and trace both outputs to the same accepted LotGrade revision.

Autodesk documents LandXML point/face support and distinguishes Full import from point-only Quick import, which may retriangulate. This makes face/domain verification part of the proposed handoff. [Supported LandXML data](https://help.autodesk.com/cloudhelp/2025/ENG/Civil3D-UserGuide/files/GUID-4D10ABA5-5EA0-41A8-BB61-C3F446CE7C6B.htm), [LandXML import settings](https://help.autodesk.com/cloudhelp/2025/ENG/Civil3D-UserGuide/files/GUID-FB6846E6-9E14-4C2D-B06A-E96FBD1399DB.htm).

## 10. Bounded grading assistance and drainage diagnostics

Build deterministic operations first: a yard band at a specified slope, a swale with an identified outlet, a controlled driveway, and a tie-in to valid existing ground. Operate within a declared grading limit and report failures at their locations.

Then consider adjustment of flexible controls within bounds. Retain fixed controls and report remaining grade/threshold/tie-in conflicts. Support sloping curved driveway geometry only after defining its horizontal path, elevation profile, and a validated export representation; a planar DXF arc cannot simply acquire independent endpoint Z values.

Civil 3D's feature lines support curved segments where 3D polylines do not, which makes a future feature-line workflow worth investigating separately from the current planar arc format. [Feature lines and curved segments](https://help.autodesk.com/cloudhelp/2025/ENG/Civil3D-UserGuide/files/GUID-D2F8697E-A909-4F58-8ABF-065E2F8EA1E3.htm).

Detect reverse grades, unintended low spots, disconnected outlets, and missing surface coverage. Explain the affected controls and actual residual values. Terrain-flow checks do not calculate stormwater capacity; hydrology is a separate later scope.

**Completion example:** regrade one supported side yard to a chosen outlet, or explain exactly why fixed inputs prevent it. Autodesk's grading criteria show a precedent for explicit targets and slope/distance parameters. [Grading criteria](https://help.autodesk.com/cloudhelp/2025/ENG/Civil3D-UserGuide/files/GUID-6266C918-C677-48E1-BB2C-8CE9860F0B00.htm).

## 11. Profiles, sections, and cut/fill quantities

Add surface cross-sections through the house, yard, and driveway to expose transitions that are hard to understand in plan. A lightweight 3D inspection view can follow without becoming necessary for ordinary drawing.

Calculate cut and fill only after existing/proposed surfaces, their shared domain, and exclusions are established. Report cut and fill separately, identify uncovered areas, and state whether material adjustments or foundation excavation are included. Verify analytic cases and an independent real-case comparison before treating quantities as decision-ready.

**Completion example:** review a driveway transition and compare two pad options using sections and quantities calculated over the same stated area.

## 12. Office templates and repeat-lot workflows

After a single-lot workflow is useful, add reusable building/pad assemblies, preferred layers/labels, named criteria profiles, and coordinated export presets. A repeated house layout should preserve relationships instead of becoming unrelated copies of numbers.

Use pilot evidence to choose the first template types. Townhouse rows require shared boundary controls and whole-row checks; apartment sites add common access, parking, and drainage context. Treat these as supported workflow expansions with their own validation, not just more rectangles on the canvas.

**Completion example:** place a checked house/garage/pad assembly on another compatible lot and identify which site-specific controls still need confirmation.

## Suggested delivery sequence

1. **First practical drafting milestone: priorities 1–4.** Import one real base plan and point file, snap and draw precisely, measure/apply a grade explicitly, save to a known location, and use the existing DXF handoff. Include minimal reference locking and visibility with import.
2. **Efficient engineering drafting: priorities 5–7.** Speed revisions, control visual clutter, and express fixed/relative design intent.
3. **Actual surface-based grading: priorities 8–10.** Build and inspect terrain, prove surface handoff, then add bounded grading operations and diagnostics.
4. **Review and repeated production: priorities 11–12.** Add sections/quantities and reuse workflows validated on real lots.

The recommended first implementation ticket was **endpoint/point snapping plus visible snap feedback and explicit XY-versus-Z behavior**. The checkpoints above now record the precision controls and the first survey/reference import workflow. The next unstarted feature is priority 3, professional file handling/recovery; perpendicular/tangent/tracking snaps remain refinements to priority 1.

## Professional readiness alongside the feature work

Before claiming pilot readiness, record the real Civil 3D receiving result, verify the current native-platform builds, and exercise recovery on actual files. Plan signed distribution, clear version/migration behavior, and useful local diagnostic reports when distributing to pilot users. These are continuing release tasks, not substitutes for the workflow priorities above.

Observe a small group of practicing designers doing the same lot task in their current workflow and in LotGrade. Measure import preparation, editing, checking, export cleanup, and recovery separately. Reorder this backlog if input preparation, grading checks, or a missing operation dominates the actual task.

Avoid calendar promises until the first scoped feature and pilot inputs are agreed. Direct DWG support, broad cloud collaboration, whole-site optimization, unrestricted splines, and hydraulic modeling need separate demand and engineering justification.

## Scope of this update

The original planning update created this document and linked it from the existing roadmap and research index without changing application behavior. The later checkpoints record features 1 and 2 separately. The [current tutorial](../../docs/tutorial/README.md) and [import guide](../../docs/IMPORT.md) describe implemented features.
