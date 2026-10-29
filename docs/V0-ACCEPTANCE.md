# Version 0 acceptance and verification

[Main README](../README.md) · [Development](DEVELOPMENT.md) · [Civil 3D exchange](CIVIL3D.md)

This checklist defines the first executable drafting release. It distinguishes an implemented feature, automated evidence, native-platform evidence, and a real Civil 3D receiving test. A completed test plan or a packaged executable is not proof that the application has run on that operating system.

## Recorded evidence

For application commit `eb828d30564699220814748ffaefd8b64309655f`, the [native CI run](https://github.com/paul-loftus/lot-grading/actions/runs/40425455328) passed on **Windows x64, macOS Intel, and macOS Apple Silicon**. All three jobs passed core/export tests, independent DXF comparisons, browser/desktop workflows, packaging, and the test against the packaged executable. The suite includes focused inspector edits committed before native-menu export and before closing the app.

The receiving target is **Civil 3D 2025**. Its actual DXF open/AUDIT/control-point test remains pending; the independent reader and native app tests are separate evidence. Later commits must pass the same matrix before replacing the tested bundles.

## Requirement checklist

| Requirement | Evidence to collect |
| --- | --- |
| Execute on macOS | Launch the production Electron app on macOS; interact with its project and drawing screens; verify a packaged `.app` exists |
| Execute on Windows | Run desktop tests on Windows, launch the packaged `.exe`, and preserve the exact CI run/build result |
| Project management | Create, open, rename, duplicate/delete where supported, and return from a drawing to the project list without losing saved data |
| Drawing interface | Pan/zoom a world-coordinate canvas, inspect coordinates, select entities, and distinguish draft versus committed geometry |
| Basic tools | Draw polylines, elevation contours, lot boundaries, building outlines, and spot points; finish/cancel appropriately |
| Edit and revise | Change supported properties, delete a selected entity, and exercise undo/redo without corrupting the project |
| Save/open | Save a native project file, reopen it in a fresh application session, and compare geometry, units, and metadata |
| Civil 3D export | Export every supported kind; independently read generated DXF and compare geometry/elevations/units/layers |
| Export remains protected | Run core/export regression and independent-reader gates on every platform and before packaging |
| Actual receiving behavior | Open a generated DXF in the targeted Civil 3D version and compare known control values; record the version/build and result |

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

Use a different file path when comparing two revisions; do not overwrite the only source of expected values. Record the project file, DXF, source commit, application version, OS/architecture, and receiving application build with the result.

## Export regression contract

The v0 export contract should cover:

- Every entity kind offered by the drawing tools.
- Open versus closed geometry and the order/coordinates of vertices.
- Constant-elevation contours and varying-elevation linework.
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
