# User experience and uncluttered grading

[Research index](../../README.md) · [Workflow requirements](../02-grading-workflows/README.md) · [Pilot validation](../08-validation-and-testing/README.md)

## Design around a small number of tasks

The main screen should answer four questions: What am I changing? What is fixed? Where will the grade or drainage fail? What will Civil 3D receive?

Recommended layout:

```text
Project / Save / Undo / Redo                         Export
----------------------------------------------------------
Tasks: Import | Building | Grade | Drainage | Check
----------------------------------------------------------
Reference      Large plan canvas               Selected
visibility     with contextual handles          object
and objects                                    properties
----------------------------------------------------------
Cursor E / N / Z | grade readout | surface status | issues
```

Use a plan view by default, with an optional section pane through selected geometry. Add a simple 3D review view after plan editing is reliable. Three-dimensional navigation should not be required for ordinary elevation entry.

## First complete workflow

1. **Create project:** select display units and confirm coordinate/datum information. Import terrain and references with a visible extent and a known control point.
2. **Select the work area:** pick the lot and grading limit; identify protected boundaries and relevant neighboring controls.
3. **Place a building:** draw/pick its outline and enter floor, garage, pad, and ground relationships in one contextual panel.
4. **Establish drainage:** add swales, outlets, yard planes, and street/driveway controls.
5. **Edit:** drag or enter precise values; show the local impact on contours, slope arrows, and section geometry.
6. **Review:** navigate findings directly on the plan and resolve or acknowledge them according to the project's criteria.
7. **Export:** choose contour interval/layers and the surface package; show units, revision, scope, and outstanding findings.

Avoid a setup wizard that asks for every possible grading parameter before the user can see their lot. Ask for a value when it becomes meaningful, while preventing calculations that depend on missing information.

## Editing interactions

| Intent | Proposed interaction | Essential feedback |
| --- | --- | --- |
| Change pad elevation | Numeric entry or vertical adjustment handle | Updated tie-ins, affected driveway, delta from prior revision |
| Set a grade between controls | Select endpoints and enter signed percent or H:V | Direction arrow, elevation difference, horizontal length |
| Create a swale | Pick path, longitudinal fall, width/section, outlet | Bottom and banks, outlet status, reverse-grade findings |
| Match existing ground | Pick point or edge and choose an explicit relation | Sampled EG elevation, source identity, coverage status |
| Adjust side yard | Select yard region/edge and change a plane or slope target | Region extent, fixed edges, resulting limits |
| Inspect a contour | Select line and show level/source revision | Related surface and nearby controlling features |
| Resolve a conflict | Select finding and its contributing objects | Both required values and the measured mismatch |

Do not make unrestricted contour dragging the initial edit model. If introduced later, define it as a surface/constraint edit with a predictable rebuild, preview, undo, and checks.

## Precision entry and snapping

Provide object, endpoint, midpoint, intersection, perpendicular, and reference-surface snaps with visible identity. Distinguish XY snapping from acquiring a Z value; a plan reference line at Z=0 should not silently reset a grading control's elevation.

Support the project's common units and familiar entry forms such as signed percent and H:V. Always label a ratio's convention: **3H:1V** is not the same as 3V:1H. Use horizontal distance for grade calculations. Make fixed values, bounds, preferred targets, and derived values visually distinct.

Allow keyboard-driven repeated operations, copy/template placement, escape/cancel, and complete undo/redo. Never hide a controlling elevation because a property panel is collapsed.

## Keep information legible

- Show selected/affected objects strongly; mute background linework.
- Group visibility by purpose: existing ground, proposed ground, buildings, drainage, controls, findings, references.
- Offer focused review modes such as slope, drainage, and cut/fill rather than overlaying every analysis at once.
- Use contour-label collision avoidance and zoom-dependent density. Major contours should remain distinguishable without color alone.
- Separate measurements from text rounding. Let the user inspect full precision when a displayed value appears to be at a limit.
- Keep an issue list with selectable plan locations; avoid modal dialogs for every nonblocking condition.
- Show old results as **out of date** while rebuilding; never imply that stale contours represent the current design.

## Explain failures in the user's terms

Proposed messages:

| Situation | Useful message content |
| --- | --- |
| No daylight intersection | “The 3H:1V slope reaches the grading limit before existing ground. Extend the limit or change the design.” |
| Incompatible controls | “These two controls require different elevations at their crossing: 102.35 and 102.61.” |
| Missing outlet | “This swale ends inside the work area without a connected drainage destination.” |
| Missing source coverage | “Existing ground is unavailable along this part of the tie-in.” |
| Unsupported wall | “This edge requires two ground elevations at the same plan location. The current surface model cannot represent it.” |
| Incomplete rebuild | “Showing the last accepted surface. This change has not completed.” |

Messages should include units and links to the actual affected objects. Do not expose a solver exception or library class name as the primary explanation.

## Review and export behavior

Keep an always-available summary of project units/datum, accepted surface revision, and outstanding findings. Invalid topology or incomplete calculations should block engineering surface export. Nonblocking advisories may be acknowledged and recorded. The precise release policy belongs to the engineering team and must be tested with pilot users.

Export should include a readable manifest/report and a short receiving procedure. Avoid implying that every green check means full permit or drainage compliance. Explain exactly which criteria were evaluated.

## Test the simplicity claim

Observe first-use and repeat-use tasks without coaching. Measure setup time, grading/revision time, finding resolution, export time, and Civil 3D cleanup. Record wrong-unit entry, wrong-object selection, missed warnings, and undo usage as well as completion time.

Use at least one tricky case in each pilot: a constrained side yard, changing garage elevation, a failed daylight, a shared lot edge, or a near-flat drainage path. A useful interface must make the difficult case understandable, not just make the first rectangular pad easy.

These UI recommendations are product hypotheses. No usability study or interactive prototype was performed during this research.
