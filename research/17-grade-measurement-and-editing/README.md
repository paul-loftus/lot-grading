# Grade measurement and explicit edits

[Research index](../README.md) · [Priority 4](../14-professional-feature-priorities/README.md#4-slope-measurement-and-explicit-grade-edits) · [User guide](../../docs/GRADES.md)

Implementation date: **November 13, 2026**. This implements a two-control check and a bounded vertex-elevation edit, before terrain generation or persistent grading relationships.

## Evidence and interaction decisions

USGS defines percent slope from elevation change divided by horizontal distance, multiplied by 100. The core uses world XY run rather than the sloping 3D length. It keeps a signed A→B convention, an unsigned explicitly labeled H:V ratio, and a separate downhill direction. Zero-run and coincident controls have explicit undefined states. [USGS slope calculation](https://www.usgs.gov/educational-resources/determine-percent-slope-and-angle-slope).

Autodesk exposes elevation/grade editing from a held reference point and selected feature-line points. The implementation follows the interaction principle of selecting controls and reviewing elevation changes, while deliberately limiting edits to one proposed straight-polyline vertex. It does not create native Civil 3D feature lines or copy their automatic relationships. [Autodesk elevation tools](https://www.autodesk.com/learn/ondemand/curated/civil-3d-quick-start-guide/41LCSGHziASPUBePmR9Wue), [reference-based elevation editing](https://help.autodesk.com/cloudhelp/2025/ENU/Civil3D-UserGuide/files/GUID-4239370C-6545-457B-BCD8-A9E361CAD73B.htm).

Provide both a read-only Grade check tool and a selected-segment editor. The former always acquires source XYZ, so drawing elevation cannot silently contaminate a measurement. It rejects ambiguous crossing Z rather than averaging. Imported references remain locked and usable as controls. The editor names A/B, lets the user hold either, previews the moving Z and adjacent-segment effects, and applies once through the existing undoable commit path.

Positive grade always means B is above A. With horizontal run H and percent g, hold A to set `B.z = A.z + H*g/100`, or hold B to set `A.z = B.z - H*g/100`. This fixed direction avoids silently reversing the meaning of a signed input when changing the held endpoint. It is a UI/math decision rather than an engineering design criterion.

## Representation boundaries

All calculations use project-coordinate doubles in one common XY/Z unit system. Source geometry has no view offsets applied. H:V is `H/abs(deltaZ):1`; level and vertical cases are named explicitly rather than displaying misleading finite ratios or zero grades. Values outside the supported numeric range are reported. Previewed source Z remains full precision; rounding is presentation only.

Curves retain their constant-Z representation. Any curve-bearing path is excluded from grade edits, including its straight segments. A curve's measurement is explicitly between endpoints on the chord. A varying-Z curve needs a separate plan/profile model and exchange decision. Contours, boundaries, building floors and points are also outside this grade edit; locked reference groups never enter the editable entity lookup.

Checks, plan arrows and previews are session state, absent from saved projects and DXF annotations. Committed edits change only one vertex Z, leaving ID, XY, layer, closure, other vertices, and external controls intact. Reopening a revision starts a fresh workspace session, even with the same project ID. No project-schema or DXF-contract change is needed.

## Verification and remaining scope

Unit tests cover rise/fall, held A/B sign, H:V, unit invariance, large coordinates, zero run, extreme numeric cases, adjacent/closing segments, immutable previews, curve/kind/reference guards, and save/export preservation. Browser/native workflows exercise pick/cycle behavior, source-Z acquisition, preview isolation, Apply/Undo/Redo, portability, and actual native export/reopen. A separate ezdxf gate reads freshly generated applied-grade output and compares explicit expected XYZ and independently computed grades.

This does not validate ground between controls, implement slope criteria, generate a TIN, calculate drainage capacity, add persistent constraints, or grade curved feature lines. Longitudinal profile previews remain a possible later refinement. Permitted pilot designs and actual Civil 3D receiving tests remain external validation work.
