# Survey and reference import

[Tutorial](tutorial/README.md) · [Development](DEVELOPMENT.md) · [Research](../research/15-survey-reference-import/README.md)

Launch the current source with `npm start`, open a project with the intended units, and choose **Import reference** in the workspace header. This adds locked reference groups to the current project. **Open project file** opens a complete LotGrade project instead.

## Survey points

1. Choose a UTF-8 `.csv`, `.txt`, or `.xyz` file. Choose comma, semicolon, tab, or whitespace separation. Blank records and records beginning with `#` are ignored.
2. Choose **PNEZD**, **PENZD**, **XYZ / ENZ**, or custom mapping. X is easting, Y is northing, and Z is elevation. These three fields are required and must use distinct columns; point number and description are optional.
3. Enable **First record is a header** when appropriate. Headers are not discarded automatically. Inspect **Raw source rows** and the interpreted coordinate table.
4. Confirm source units. These must match project units, including the specific foot definition. Enter horizontal/vertical context if known; blank labels remain **Unknown**. Labels do not transform coordinates or establish a datum.
5. Choose a control object and vertex. Enable **Compare with a known coordinate**, enter expected XYZ, and review the differences. Alternatively, verify the displayed control directly. No automatic alignment or adjustment occurs.
6. Review skipped records and explicitly accept a partial import if necessary. Confirm units/alignment and choose **Import locked reference**.

Try the fictional [PNEZD sample](../tests/fixtures/import/survey-pnezd.csv): choose PNEZD, enable its header, and confirm international feet. It contains three points; the first control is X **2000000.25**, Y **5000000.75**, Z **98.125**.

Quoted delimited fields support embedded separators, escaped double quotes, and multiline descriptions. In whitespace files, an unquoted multiword description is accepted when it is the last mapped field. Use `.` for decimal points; scientific notation is supported. Missing elevations and duplicate supplied point numbers are reported. Coincident points with different numbers remain separate observations.

## DXF base plans

Choose an ASCII/UTF-8 `.dxf` and follow the same preview, units, and control-check workflow. Supported model-space objects preserve XYZ, layers, closure, and circular geometry.

| Object                      | Imported representation                                    |
| --------------------------- | ---------------------------------------------------------- |
| LINE                        | Straight polyline with both endpoint elevations            |
| POINT                       | Survey/spot reference at its original XYZ                  |
| LWPOLYLINE                  | Straight/bulged segments at the common elevation           |
| Legacy 2D POLYLINE / VERTEX | Straight/bulged segments using header elevation            |
| 3D POLYLINE / VERTEX        | Straight segments with per-vertex elevations               |
| Planar ARC                  | Exact circular segment, including a sweep across 0 degrees |
| Planar CIRCLE               | Four exact quarter circles, closed                         |

The subset accepts default positive-Z extrusion. Tilted/reversed object coordinate systems, nonzero thickness, wide polylines, fitted/spline polylines, meshes, and paper space are reported as skipped. TEXT/MTEXT, INSERT/block instances, xrefs, hatches, dimensions, splines, Civil 3D custom objects, surfaces, and other unsupported types are also reported. Block definitions are not expanded. Colors, line types, CAD labels, and styles are not reproduced. Base polylines are not automatically classified as proposed contours or boundaries.

Known DXF units must agree with project units. Unknown/unitless files require an explicit unit choice; other unit declarations are blocked. Convert units or coordinate systems explicitly in the source application first. This version performs no scaling, reprojection, vertical adjustment, or origin shift.

The fictional [DXF sample](../tests/fixtures/import/base-plan.dxf) contains **seven supported objects and four deliberate unsupported cases**, using international feet in the same coordinate area as the point sample. Expect seven supported and four skipped records.

Malformed file structure prevents import. Invalid individual objects appear in the skipped-record report. Accepting a partial import is explicit. Canceling or rejecting the import leaves the drawing unchanged.

## Working with references

Open **Features**, then expand a source under **Locked reference sources**.

- **Show reference / allow snaps** controls both display and snap eligibility. References are dimmed and cannot be selected, moved, or edited as proposed features.
- Draw with **Object snap ON** to use visible reference targets. XY-only snaps retain Drawing elevation; **Match target elevation** explicitly acquires source Z. Snaps do not create persistent relationships.
- **Include reference in DXF export** starts off. Enable it for each source needed in the deliverable. This is independent of visibility: hiding an included source keeps it in the export.
- **Source objects and controls** shows records, point numbers/descriptions, layers, and coordinates. **Import report** identifies skipped records and the confirmed alignment control. Large lists show their first 100 entries; complete data remains saved.
- **Download original** restores the exact supplied bytes, including BOM/CRLF. The application does not overwrite the original file.
- Import, removal, visibility, and export-selection changes support Undo/Redo. **Remove reference** removes the attachment from this project without deleting a source file on disk.

References are always locked in this version. Importing an externally revised source creates another group. Automatic relinking, editable copies, and the full layer manager are later work. Imported points are not automatically triangulated.

## Saving and limits

Reference projects use **schema 3**. The original bytes, file name, SHA-256 fingerprint, units, import date, mapping, record metadata, skipped-record report, and alignment confirmation travel inside the portable project. No absolute source path is stored. A project containing a real survey also contains that survey's information when shared.

Older applications reject schema 3. The current build still opens schemas 1 and 2. DXF export retains the existing R2013 drawing-entity contract. Selecting a reference exports its supported geometry and static point labels, rather than reproducing the original CAD document.

Limits: **4 MB per source**, **20 sources**, **10,000 combined proposed/reference objects**, **200,000 combined vertices**, and **20 MB per saved project**. Point files support 100 columns and 10,000 data rows. The plan preview shows the first 500 supported objects; counts, controls, and import cover the complete supported dataset. Fit drawing includes visible references.

Independent CAD-reader checks compare the imported/re-exported DXF directly with its original fixture, including true arc geometry and source Z. Native Civil 3D 2025 receiving validation remains separate.
