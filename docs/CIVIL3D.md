# Civil 3D export contract — v0

The primary receiving target is **Autodesk Civil 3D 2025**, confirmed for this project on October 28, 2026. LotGrade v0 exports **ASCII DXF R2013 (AC1027)**. Open the `.dxf` drawing directly in Civil 3D 2025, then save it as a DWG or copy/reference its entities into an existing drawing after checking coordinates and units.

The export contains drawing geometry. It does not create a Civil 3D TIN surface, grading objects, dynamic contour labels, or a LandXML terrain file. Contours are user-drawn, constant-elevation paths that can contain straight and circular arc segments. A later surface engine must preserve this linework export route while adding tested surface exchange.

**Export contract 2** adds exact circular arcs while keeping the R2013/AC1027 DXF version. Existing straight-only drawings retain their contract 1 byte output.

## What is preserved

| V0 object                               | DXF representation                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Contour or constant-elevation polyline  | LWPOLYLINE with constant Z in the elevation field                               |
| Constant-elevation path containing arcs | LWPOLYLINE with exact outgoing-segment bulges in group 42; common Z in group 38 |
| Varying-elevation polyline              | True 3D POLYLINE with every vertex Z retained                                   |
| Lot boundary / building footprint       | Closed polyline with its actual elevations                                      |
| Spot elevation                          | POINT at exact XYZ plus static TEXT label at the same Z                         |

World X/Easting, Y/Northing, and Z values are exported in project units, with no origin shift, smoothing, simplification, or automatic unit conversion. The screen's zoom and pan never affect export coordinates. All supported objects are exported, including geometry outside the visible viewport. Invalid geometry stops export with an explanation instead of silently omitting objects.

Project layers become DXF layers (names differing only in case share the first spelling, following CAD's case-insensitive layer convention). Coordinates use JavaScript double precision and round-trip numeric serialization. Meters use `$INSUNITS=6`, international feet use `2`, and US survey feet use `21`; US survey foot units require a modern receiving AutoCAD/Civil 3D version. The two foot definitions are never silently exchanged. Unit metadata does not establish a coordinate system, datum, or an automatic receiving-drawing transformation.

Autodesk's 2025 [LWPOLYLINE reference](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm) documents constant elevation and closure. Its [POLYLINE reference](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-ABF6B778-BE20-4B49-9B58-A94E64CEFFF3.htm) documents the 3D and closed flags. The [2025 INSUNITS reference](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-A58A87BB-482B-4042-A00A-EEF55A2B4FD8.htm) includes US survey feet (21).

## Curve representation and project compatibility

Polyline, Contour, and polygon Boundary support mixed straight/circular arc segments. Each arc is represented by its endpoint vertices and a signed bulge, `tan(sweep / 4)`, on its starting vertex. A closed boundary's last bulge describes its closing segment. The exporter writes the actual arc; it does not sample it into many short lines or reduce it to its endpoint chord. Bounds include the curve's extrema.

Curved features must have one common elevation. Changing a vertex Z on an already curved feature moves all its vertex elevations together. Existing varying-Z straight polylines continue to export as true 3D POLYLINE. A varying-Z feature cannot gain an arc until it is explicitly assigned a common elevation. Autodesk's [3DPOLY documentation](https://help.autodesk.com/cloudhelp/2025/ENG/AutoCAD-Core/files/GUID-10E0EDAB-BF4C-442C-93DA-E516F6DEAA7B.htm) states that 3D polylines do not support arc segments.

Curve-bearing `.lotgrade` files use project schema 2. Legacy schema 1 drawings remain readable and do not need a geometric conversion. A project that has upgraded to schema 2 keeps that version even if its arcs are later straightened. Original Rev 0 applications reject schema 2; putting curves into a schema 1 file would let those older readers silently lose their curvature. This project-file version change is separate from the DXF version.

Arbitrary splines and automatic smoothing are outside this implementation. The [curve research](../research/13-arcs-and-curves/README.md) records the alternatives and acceptance requirements.

## Receiving checklist

1. In Civil 3D 2025 run `ABOUT` and record the exact update/build. Export DXF from LotGrade and record its project units and coordinate/benchmark context.
2. Use **Open** in Civil 3D 2025 to open the DXF directly. Use **Zoom Extents** if the lot is outside the initial view. The ready-made [Willow Creek sample](../examples/README.md) supplies a matching project/DXF and known controls for this test.
3. Inspect **Drawing Utilities → Units** / `INSUNITS` and compare several known XYZ control points using Properties or `LIST`. Confirm that the receiving drawing's units and reference frame match before inserting/copying geometry elsewhere.
4. Select a contour and verify its nonzero elevation. Inspect a varying-elevation 3D polyline's vertices separately. For a curved path, inspect an arc segment's radius, direction, and elevation; compare a known point on the arc so a chord cannot pass the check. Check closed boundaries, including any curved closing segment, and layer names.
5. Run `AUDIT`, inspect the geometry, and save a DWG. If creating a TIN from the linework in Civil 3D, establish boundaries/breaklines and review that separate surface-building workflow; contours alone do not encode a unique terrain mesh.

Native Civil 3D receiving tests have not been run on this development machine. The automated gate proves independent DXF parsing and preservation of the frozen geometry contract; it is not a claim of Autodesk certification or complete civil-engineering validity.

Record the receiving result with the exact 2025 build, source commit, input file, whether the file opened without an error, the `AUDIT` result, and the known control/elevation checks. The first sample check is the front-threshold POINT at **X=44.5, Y=39, Z=103.5** in international feet. Do not mark Civil 3D 2025 receiving validation passed until an actual installation has completed these checks.

## Keep export working during development

- `npm test` exercises the writer, malformed input, deterministic output, all supported object kinds, negative/nonzero Z, large coordinates, closure, and unit metadata. Curve regressions must also cover signed bulges, planar restrictions, correct bounds, and untouched legacy output.
- `npm run test:interop` generates fresh DXF files using the current writer and independently reads them with **ezdxf 1.4.3**. Verification covers source vertices, curve bulges/reconstructed geometry, primary objects, labels, layers, units, and zero reader-reported repairs/errors.
- The versioned source fixtures live in `tests/fixtures/export/cases.json`; their expected type counts and unit codes are explicit. Generated files go to ignored `tests/.generated/`.
- CI runs these gates on macOS and Windows. New drawing kinds must add an explicit serializer (enforced at typecheck), fixture coverage, and independent-parser assertions before release.
- A change to coordinate interpretation, DXF version, units, entity representation, or lossless export behavior is an interchange contract change requiring review and matching tests. Do not weaken the independent verifier to make a rendering change pass.

To run the independent gate locally, make a Python virtual environment, install `ezdxf==1.4.3`, and point `PYTHON` at that environment's Python executable if it is not the default interpreter. Python/ezdxf are development test dependencies, not runtime requirements for the desktop application.
