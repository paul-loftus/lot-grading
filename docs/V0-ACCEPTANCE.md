# Version 0 acceptance and verification

[Main README](../README.md) · [Development](DEVELOPMENT.md) · [Civil 3D exchange](CIVIL3D.md)

This checklist defines the first executable drafting release. It distinguishes an implemented feature, automated evidence, native-platform evidence, and a real Civil 3D receiving test. A completed test plan or a packaged executable is not proof that the application has run on that operating system.

## Recorded evidence

For application commit `eb828d30564699220814748ffaefd8b64309655f`, the [native CI run](https://github.com/paul-loftus/lot-grading/actions/runs/40425455328) passed on **Windows x64, macOS Intel, and macOS Apple Silicon**. All three jobs passed core/export tests, independent DXF comparisons, browser/desktop workflows, packaging, and the test against the packaged executable. The suite includes focused inspector edits committed before native-menu export and before closing the app.

The receiving target is **Civil 3D 2025**. Its actual DXF open/AUDIT/control-point test remains pending; the independent reader and native app tests are separate evidence. Later commits must pass the same matrix before replacing the tested bundles.

The later circular-arc update uses project schema 2 for curve-bearing drawings and export contract 2. The baseline CI evidence above predates that update and does not establish that its curves have passed native-platform or Civil 3D receiving tests. Record the updated revision and actual results separately.

For the curve implementation developed from `5c7a5d6`, local verification on **October 30, 2026** passed formatting, typechecking, **46 unit tests**, production build, all **7 independent DXF checks**, and **11 browser/native application workflows**. An isolated macOS Apple Silicon bundle built with the existing packaging script also passed both native desktop tests, including focused radius edits committed before export and exact curve reopening. Running the original `rev-0` project reader against both file versions confirmed that it accepts legacy drawings and rejects curved schema 2 files.

Those are local macOS results. Updated Windows/Intel Mac CI evidence and the separate Civil 3D 2025 receiving test are still required before claiming those checks passed for curves.

On **November 10, 2026**, the subsequent local precision-placement update passed **52 unit tests**, **14 browser/native workflows**, production build/typechecking, formatting, and all **7 independent DXF checks**. The added workflows exercise fractional coordinate placement with grid snap enabled, endpoint/midpoint/arc-center/intersection feedback, overlapping-target cycling, explicit source-Z acquisition, bearing/distance entry, exact small boundaries, and Alt/Option override while a settings control has focus. Source-elevation acquisition for a spot does not unexpectedly change the drawing elevation. Native tests use isolated temporary profiles. These results do not establish updated Windows receiving behavior or Civil 3D acceptance.

Local feature 2 verification on **November 13, 2026**, developed from `12945d1`, passed **60 unit tests**, **17 browser/native workflows**, formatting, typechecking, production build, and **8 independent CAD-reader checks** (the existing seven plus a direct original-source import/export comparison). Import tests cover mapped survey points, original BOM/CRLF bytes, explicit units and control-point comparison, skipped-record acknowledgment, locked reference snaps, visibility versus export selection, undo/view restoration, and native portable save/reopen. Large-coordinate previews use a display origin while source coordinates remain unchanged. Native tests use isolated temporary profiles. Updated Windows/Intel Mac and actual Civil 3D 2025 receiving validation remain pending for this update.

Local feature 3 verification on **November 13, 2026**, developed from `1665dfe`, passed **69 unit tests**, **20 browser/native workflows**, typechecking, production build, and **8 independent CAD-reader checks**. The new checks exercise real temporary-directory file writes, Save/Save As/Copy associations, focused edits, restart/recent paths, source-path privacy, external-change guards, missing-file relinking, concurrent sessions and locks, bounded snapshots, corrupt-library recovery, and preservation of schema 3 sources/curves. Browser recovery and its download-only file semantics are exercised separately. Native tests use isolated profiles; updated Windows/Intel Mac and actual Civil 3D 2025 receiving checks remain separate requirements.

Local feature 4 verification on **November 13, 2026**, developed from `0f9c9b5`, passed **79 unit tests**, **24 browser/native workflows**, typechecking, production build, formatting, and **9 independent CAD-reader checks**. Grade tests cover horizontal-run math, fixed A→B signs while holding either endpoint, H:V and zero-run cases, large coordinates, protected curves/reference geometry, immutable previews, adjacent-edge effects, one-step Undo/Redo, source-XYZ picks/cycling, preview isolation from saved/exported geometry, and native reopen. The added reader gate verifies literal expected XYZ and independently computed grades in real DXF output. An Escape regression check confirms incomplete arc drafts still cancel when grade state is present. Screenshots were inspected locally. Native tests use isolated profiles; updated Windows/Intel Mac and Civil 3D 2025 receiving checks remain separate requirements.

## Requirement checklist

| Requirement               | Evidence to collect                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Execute on macOS          | Launch the production Electron app on macOS; interact with its project and drawing screens; verify a packaged `.app` exists               |
| Execute on Windows        | Run desktop tests on Windows, launch the packaged `.exe`, and preserve the exact CI run/build result                                      |
| Project management        | Create, open, rename, duplicate/delete where supported, and return from a drawing to the project list without losing saved data           |
| Drawing interface         | Pan/zoom a world-coordinate canvas, inspect coordinates, select entities, and distinguish draft versus committed geometry                 |
| Basic tools               | Draw polylines, elevation contours, lot boundaries, building outlines, and spot points; finish/cancel appropriately                       |
| Circular arcs             | Mix Line/Arc segments in polylines, contours, and polygon boundaries; retain radius/direction and exact curvature after edits/save/export |
| Edit and revise           | Change supported properties, delete a selected entity, and exercise undo/redo without corrupting the project                              |
| Save/open                 | Save a native project file, reopen it in a fresh application session, and compare geometry, units, and metadata                           |
| Civil 3D export           | Export every supported kind; independently read generated DXF and compare geometry/elevations/units/layers                                |
| Export remains protected  | Run core/export regression and independent-reader gates on every platform and before packaging                                            |
| Actual receiving behavior | Open a generated DXF in the targeted Civil 3D version and compare known control values; record the version/build and result               |

## Manual end-to-end acceptance

Use a fresh project so sample content cannot conceal missing behavior:

1. Create a named project in meters. Open its drawing workspace.
2. Draw a closed lot boundary, closed building outline, open polyline, and a contour with an elevation that is clearly nonzero, such as 102.375.
3. Add a spot elevation. Change an entity's elevation/name using the inspector, then undo and redo the change.
4. Pan and zoom. Confirm a known entity's numeric coordinates remain unchanged.
5. Save the project to a native project file. Close/reopen the application and reopen that file. Compare all entities, closure, names, and elevations.
6. Export DXF. Read it using `npm run test:interop` fixtures and perform the separate Civil 3D procedure in [CIVIL3D.md](CIVIL3D.md) for the manual project.
7. Repeat the essential save/open/export sequence in feet and US survey feet. Use asymmetric, large coordinates in at least one fixture; the exporter must preserve their values.
8. Try cancelling an unfinished drawing, save dialog, open dialog, and export dialog. Existing committed geometry/files must remain intact.
9. Try opening malformed or unsupported-version project data. It must produce a useful error and preserve the currently open valid project.
10. Complete the same workflow on both operating systems before claiming cross-platform runtime validation.

For the curve update, also perform these checks:

1. In Polyline and Contour, choose **Arc (3 points)** and draw start → through-point → endpoint. Continue with another arc and then a line in the same draft. Changing segment mode must retain completed segments and discard only an unfinished through-point.
2. Try finishing while the current arc still needs its endpoint, and try coincident/collinear picks. Existing completed segments must survive and the feedback must explain how to continue.
3. Draw a polygon boundary with a curved closing edge. Compare its true arc perimeter/area, and fit a major arc whose extrema lie outside the endpoint bounds.
4. Select the arc away from its chord, move and duplicate it, and exercise undo/redo. In **Segments and curves**, edit radius/direction, convert a straight segment to an arc, and straighten it again.
5. Change a curved feature's Z and verify all its vertices remain at one elevation. Confirm varying-Z straight polylines still work and cannot receive an arc until explicitly given a common elevation.
6. Save/reopen/export a schema 2 drawing, open a legacy schema 1 drawing, reject malformed/nonplanar bulges, and confirm an original Rev 0 reader refuses schema 2. Existing straight sample DXFs must remain byte-identical.
7. Independently inspect exported arc bulges and reconstructed geometry, then perform the curved-path receiving checks in Civil 3D 2025. Record platform, exact source revision, and results rather than inferring them from this checklist.

Use a different file path when comparing two revisions; do not overwrite the only source of expected values. Record the project file, DXF, source commit, application version, OS/architecture, and receiving application build with the result.

## Export regression contract

The v0 export contract should cover:

- Every entity kind offered by the drawing tools.
- Open versus closed geometry and the order/coordinates of vertices.
- Constant-elevation contours and varying-elevation linework.
- Exact clockwise/counterclockwise and major/semicircular arcs, mixed straight/arc segments, and a curved closing edge.
- Curve-aware extrema, arc lengths, signed closed areas, valid bulge arrays, and rejection of nonplanar curves.
- Negative, fractional, zero, and nonzero elevations.
- Large asymmetric X/Y coordinates without axis swaps, translation, or display rounding.
- Each supported unit declaration, especially international feet versus US survey feet.
- Layers and point label behavior that are explicitly documented.
- Invalid project/entity data being rejected rather than silently omitted.
- Native project serialization round-trip before exporting again.

The independent DXF reader should report a clean audit and compare actual semantic content against fixed expected values. Binary/text ordering is a separate deterministic-output check; semantic equivalence matters more than arbitrary handle order.

## Honest release boundaries

Version 0 exports drafting entities to a DXF drawing for opening in Civil 3D. It does not create a native Civil 3D TIN surface or intelligent grading object, and it does not automatically compute grading contours from terrain. LandXML terrain exchange and a verified engineering surface engine belong to later development.

An independent DXF read/audit establishes a strong file-format check, but it does not certify Autodesk's receiving behavior. Until the Civil 3D procedure is performed on a real installation, describe compatibility as the supported DXF exchange route with that validation still outstanding.

The build workflow creates unsigned development bundles unless release signing is configured. Shipping a polished installer, platform signing/notarization, automatic updates, or production engineering approval is outside this v0 drafting milestone. These limitations should remain clear in the main README and release notes.
