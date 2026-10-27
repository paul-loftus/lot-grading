# Civil 3D interoperability

[Research index](../../README.md) · [Data and coordinates](../07-data-and-coordinates/README.md) · [Validation](../08-validation-and-testing/README.md)

## Recommended exchange contract

Ship an export package with **DXF contours + LandXML 1.2 surface + a manifest and import instructions**, all from the same accepted surface revision.

| Deliverable | Intended use | What it does not carry |
| --- | --- | --- |
| DXF | Open/view contour linework, spot grades, and optional breaklines in Civil 3D | Native Civil 3D surface definition or live grading behavior |
| LandXML | Create a TIN surface from exported vertices and faces | This application's operation history, full styles, or all object semantics |
| Native project | Reopen and edit the complete design in this application | A directly editable Civil 3D project |
| Manifest/report | Identify units, datum, revisions, tolerances, scope, and unresolved findings | A substitute for checking the receiving drawing |

Autodesk documents LandXML import for surface definitions, source data, and other civil data, with coordinates handled as **Northing, Easting, Level**. The serializer must therefore explicitly map internal E,N,Z into N,E,Z. [Supported LandXML data](https://help.autodesk.com/cloudhelp/2026/ENG/Civil3D-UserGuide/files/GUID-4D10ABA5-5EA0-41A8-BB61-C3F446CE7C6B.htm)

## LandXML surface export

Use a conservative subset focused on TIN surfaces. Proposed required content:

- LandXML 1.2 root namespace/version and complete unit declaration.
- Application/version identity and unambiguous surface name.
- A TIN definition with finite vertex coordinates, unique point identifiers, and explicit triangular face references.
- Faces clipped to the intended outer domain and holes, with consistent winding.
- Coordinate-system metadata where supported, plus the authoritative project coordinate description in the manifest.
- Optional boundary and breakline source data only after testing the precise serialization and Civil 3D behavior.

Do not export only points and expect triangulation to remain unchanged. Do not export only contour lines and describe them as an equivalent surface. Treat preserved face connectivity and the active domain as acceptance requirements.

**Import setting matters:** Autodesk's Civil 3D documentation distinguishes **Quick Import**, which uses points and can change triangulation, from **Full Import**, which reads points and faces. It also documents source-data and snapshot settings. Recommend Full Import for the surface-fidelity workflow, record other settings in tests, and decide whether source objects are needed. [Civil 3D 2026 LandXML import settings](https://help.autodesk.com/cloudhelp/2026/ENG/Civil3D-UserGuide/files/GUID-FB6846E6-9E14-4C2D-B06A-E96FBD1399DB.htm)

The LandXML schema URL was not retrievable through the research browser. Obtain and pin an authenticated/provenance-checked LandXML 1.2 XSD before implementing the writer, then validate files against it. No schema-valid sample XML is claimed or supplied here. A valid XSD result still does not prove correct coordinates, boundary interpretation, or Civil 3D behavior. See [source-access limitations](../12-sources/README.md#access-limitations-and-evidence-boundaries).

## DXF contour export

Recommended initial profile: a tested ASCII DXF revision supporting LWPOLYLINE; evaluate R2010/R2013 with the selected writer and receiving versions. Use only the small supported entity set the product needs.

For each contour, write one or more **LWPOLYLINE** entities with XY vertices and a constant elevation h, using the default upward extrusion normal so object and world coordinate treatment is unambiguous. Autodesk's DXF reference specifies the elevation field as group code 38. For varying-elevation breaklines, use a true 3D polyline with vertex Z values. [Autodesk LWPOLYLINE reference](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm)

Proposed layer defaults, configurable per office:

| Layer | Content |
| --- | --- |
| `FG-CONT-MAJOR` | Major proposed contours |
| `FG-CONT-MINOR` | Minor proposed contours |
| `FG-BREAKLINE` | Varying-elevation design controls |
| `FG-LIMIT` | Proposed grading boundary |
| `FG-SPOT` | Spot points and separate text |
| `FG-LABEL` | Static contour labels |

These are suggested names, not an asserted industry standard. Export boundaries with explicit semantics and document whether they are 2D limits or draped 3D lines. Keep contour geometry continuous beneath display labels; text-gap presentation should not destroy the exported terrain evidence.

Set drawing unit metadata where supported, but do not trust that metadata to cause the desired transformation. Verify the file's actual coordinate values and the receiving drawing's insertion/import behavior. Never shift a state-plane drawing near the origin in the export just because rendering uses local coordinates.

Static text in DXF is not a dynamic Civil 3D contour label. If native labels are required, recommend labeling the imported surface in Civil 3D or developing a companion add-in later.

## Input strategy

| Input | Initial treatment |
| --- | --- |
| LandXML TIN | Preserve existing vertices/faces and valid domain; select the intended surface |
| DXF references | Support explicit entity types and layer selection; report skipped entities |
| Survey CSV | Explicit E/N/Z column and unit mapping; require domain/breakline decisions when building a surface |
| Contour-only terrain | Later/limited approximation workflow; identify lost information and uncertainty |
| DWG | Ask users to export a supported exchange format initially; direct access is a separate feature decision |
| Raster DEM / point cloud | Defer or preprocess externally until there is a justified ingestion scope |

Normalize block transforms, arc/bulge tessellation, and coordinate systems when supporting them. If the initial DXF importer does not support blocks or certain geometry, report that limitation and provide preparation instructions; do not silently omit potentially controlling linework.

## Why direct DWG is deferred

General DWG drawing support and Civil 3D intelligent-object support are different integrations. ODA offers a Drawings SDK and a Civil SDK; its Civil SDK documentation lists civil object access/creation and additional membership/SIG licensing conditions. Scope, exact supported entities, versions, dependencies, redistribution, and commercial terms need evaluation with ODA. [Drawings SDK](https://www.opendesign.com/products/drawings), [Civil SDK](https://www.opendesign.com/products/civil)

A DWG containing plain contour polylines is also different from a DWG containing a native TIN surface. Do not promise the latter from a general DXF/DWG library.

## Optional companion add-in

Once manual exchange works, a small C# add-in could select/export input geometry, import the result, apply office surface/label styles, and reduce preparation work. Keep design computation in the standalone application or reusable core. File exchange is a reasonable first integration boundary; live synchronization adds object identity, conflict, lifecycle, and versioning problems.

Autodesk exposes a `TinSurface.CreateFromLandXML` method in its API documentation; confirm the exact overload and behavior in each target SDK rather than copying older samples. [API reference](https://help.autodesk.com/cloudhelp/2022/ENU/Civil3D-API/files/html/e3344531-c49f-503d-1a47-d26ff98faf21.htm)

Runtime compatibility must track the **exact Civil 3D build/update**, not just its release year. Autodesk's September 2026 guidance describes a .NET 10 transition for affected products, including 2026.2.2 and 2025.2.6 updates, and states that 2027 includes .NET 10 support. Verify SDK/plugin compatibility on the selected builds. [Autodesk transition notice](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Civil-3D-Requirements-for-products-affected-by-the-Microsoft-NET-10-transition.html)

## Proposed receiving procedure

1. Start a controlled Civil 3D drawing; record product build, template, units, and coordinate settings.
2. Import LandXML using the documented test profile, including Full Import. Disable unintended translation/rotation and record conversion behavior.
3. Inspect the TIN domain, holes, known points, breakline behavior, elevations, and quantities; regenerate contours with the agreed interval/base.
4. Open the DXF separately, verify coordinates/elevations, then test the intended insertion/reference workflow into the project drawing.
5. Compare exported contours with surface-generated contours using equivalent unsmoothed settings.
6. Re-export the imported surface and compare its geometry to the application result, allowing point-ID renumbering and triangle ordering changes.

Do not equate byte-identical XML with surface equivalence. Compare active domains, face connectivity where promised, and elevations at known/control/sample points.

## Known interoperability traps

- Boundary and hole behavior needs an adversarial test, not just a rectangular surface. Autodesk has documented an imported-surface boundary issue and an import-setting workaround. [Autodesk support note](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Imported-surface-through-xml-show-triangles-outside-of-the-boundary-or-border-in-Civil-3D.html)
- Feature lines can interact with crossing lines in the same Civil 3D site. Keep exported controls in a deliberate site strategy and test their effect. [Autodesk crossing-feature guidance](https://help.autodesk.com/cloudhelp/2022/ENU/Civil3D-BestPractices/files/GUID-6CEA853D-6F56-4265-A343-092B3F02C4D2.htm)
- US survey feet and international feet differ; preserve the intended units and verify actual numbers.
- Surface styles can change displayed contour smoothing and intervals without changing the TIN.
- Reimporting a changed design is a new revision, not proven bidirectional synchronization.

**Research-stage evidence status:** the initial brief established documented exchange routes only. V0 now implements and independently tests DXF linework export; see the current [Civil 3D exchange contract](../../docs/CIVIL3D.md). Native Civil 3D receiving validation and LandXML surface implementation remain separate work.
