# Civil 3D export contract — v0

LotGrade v0 exports **ASCII DXF R2013 (AC1027)**. Open the `.dxf` drawing directly in Civil 3D, then save it as a DWG or copy/reference its entities into an existing drawing after checking coordinates and units.

The export contains drawing geometry. It does not create a Civil 3D TIN surface, grading objects, dynamic contour labels, or a LandXML terrain file. V0 contours are user-drawn, constant-elevation lines. A later surface engine must preserve this linework export route while adding tested surface exchange.

## What is preserved

| V0 object | DXF representation |
| --- | --- |
| Contour or constant-elevation polyline | LWPOLYLINE with constant Z in the elevation field |
| Varying-elevation polyline | True 3D POLYLINE with every vertex Z retained |
| Lot boundary / building footprint | Closed polyline with its actual elevations |
| Spot elevation | POINT at exact XYZ plus static TEXT label at the same Z |

World X/Easting, Y/Northing, and Z values are exported in project units, with no origin shift, smoothing, simplification, or automatic unit conversion. The screen's zoom and pan never affect export coordinates. All supported objects are exported, including geometry outside the visible viewport. Invalid geometry stops export with an explanation instead of silently omitting objects.

Project layers become DXF layers (names differing only in case share the first spelling, following CAD's case-insensitive layer convention). Coordinates use JavaScript double precision and round-trip numeric serialization. Meters use `$INSUNITS=6`, international feet use `2`, and US survey feet use `21`; US survey foot units require a modern receiving AutoCAD/Civil 3D version. The two foot definitions are never silently exchanged. Unit metadata does not establish a coordinate system, datum, or an automatic receiving-drawing transformation.

Autodesk's [LWPOLYLINE reference](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm) documents constant elevation and closure. Its [POLYLINE reference](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-ABF6B778-BE20-4B49-9B58-A94E64CEFFF3.htm) documents the 3D and closed flags.

## Receiving checklist

1. Export DXF from the project and record its units and coordinate/benchmark context.
2. In Civil 3D use **Open** to open the DXF directly. Use **Zoom Extents** if the lot is outside the initial view.
3. Inspect **Drawing Utilities → Units** / `INSUNITS` and compare several known XYZ control points using Properties or `LIST`. Confirm that the receiving drawing's units and reference frame match before inserting/copying geometry elsewhere.
4. Select a contour and verify its nonzero elevation. Inspect a varying-elevation 3D polyline's vertices separately. Check closed boundaries and layer names.
5. Run `AUDIT`, inspect the geometry, and save a DWG. If creating a TIN from the linework in Civil 3D, establish boundaries/breaklines and review that separate surface-building workflow; contours alone do not encode a unique terrain mesh.

Native Civil 3D receiving tests have not been run on this development machine. The automated gate proves independent DXF parsing and preservation of the frozen geometry contract; it is not a claim of Autodesk certification or complete civil-engineering validity.

## Keep export working during development

- `npm test` exercises the writer, malformed input, deterministic output, all supported object kinds, negative/nonzero Z, large coordinates, closure, and unit metadata.
- `npm run test:interop` generates fresh DXF files using the current writer and independently reads them with **ezdxf 1.4.3**. It verifies each source vertex, primary object, label, layer, unit declaration, and zero reader-reported repairs/errors.
- The versioned source fixtures live in `tests/fixtures/export/cases.json`; their expected type counts and unit codes are explicit. Generated files go to ignored `tests/.generated/`.
- CI runs these gates on macOS and Windows. New drawing kinds must add an explicit serializer (enforced at typecheck), fixture coverage, and independent-parser assertions before release.
- A change to coordinate interpretation, DXF version, units, entity representation, or lossless export behavior is an interchange contract change requiring review and matching tests. Do not weaken the independent verifier to make a rendering change pass.

To run the independent gate locally, make a Python virtual environment, install `ezdxf==1.4.3`, and point `PYTHON` at that environment's Python executable if it is not the default interpreter. Python/ezdxf are development test dependencies, not runtime requirements for the desktop application.
