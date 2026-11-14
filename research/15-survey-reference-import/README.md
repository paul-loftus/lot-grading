# Survey/reference import implementation

[Research index](../README.md) · [Priority 2](../14-professional-feature-priorities/README.md#2-survey-and-reference-import) · [User guide](../../docs/IMPORT.md)

Implementation date: **November 13, 2026**. This records feature 2's initial supported scope. The user guide documents the subset and limits.

## Evidence and decisions

DXF uses paired group codes and values with section/entity markers. A bounded TypeScript reader handles this structure directly, adding no runtime dependency or Python requirement to the application. This is an implementation choice for a documented subset, not a general AutoCAD document editor. [Autodesk group structure](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-89CB823D-614D-4D1E-8204-568EC72DF869.htm).

The LWPOLYLINE specification distinguishes common elevation, bulges, and object coordinate systems. The importer retains exact bulges and accepts only default positive-Z extrusion; it reports other systems instead of treating local coordinates as world XY. [LWPOLYLINE specification](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm).

Legacy POLYLINE distinguishes header elevation, 3D vertices, fitted paths, and mesh flags. The reader separates those cases and reports unsupported fits/meshes. ARC/CIRCLE use exact circular segments in the existing model. [POLYLINE specification](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-ABF6B778-BE20-4B49-9B58-A94E64CEFFF3.htm), [ARC specification](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-0B14D8F1-0EBA-44BF-9108-57D8CE614BC8.htm).

Civil 3D point formats describe column arrangement, delimiters, and coordinate context. The UI therefore provides explicit X/Y/Z mapping, common presets, actual-coordinate preview, unit confirmation, and a known-coordinate comparison. Labels do not trigger transformations. [Point-file formats](https://help.autodesk.com/cloudhelp/2025/ENU/Civil3D-UserGuide/files/GUID-7B81CCC9-B538-4E32-869E-AE08135AD7AD.htm).

Keeping locked reference groups separate from proposed entities is a product decision: protect the base plan while reusing the snap engine. Groups start visible and excluded from export. Visibility and export inclusion remain independent, providing a basic reference workflow before the fuller layer manager in priority 6.

## Preservation and boundaries

Schema 3 embeds original bytes, a SHA-256 identity, file name, units, date, record metadata, mapping, skipped records, and a confirmed control. Source paths are not portable design data. Import is a validated, undoable change. Unknown context remains unknown. Known source units must match project units; unitless sources require explicit confirmation.

No unit conversion, reprojection, vertical adjustment, block expansion, or Civil 3D custom-object extraction is performed. Unsupported geometry is reported before acceptance. LandXML points/faces belong with terrain import in priority 8. Relinking, editable copies, and general layer management remain separate work.

## Verification

The fixture was authored with independent `ezdxf` APIs. It includes large fractional world coordinates, varying-Z linework, 2D/3D polylines, a bulged curve, an arc across 0 degrees, a circle, and a point. Four deliberate unsupported cases exercise reporting. The separate CAD-reader gate compares re-exported geometry directly with that original source, checks a clean audit, and verifies original bytes, fingerprint, and export scope.

Unit and browser/native tests cover mapping, quoted/multiline descriptions, BOM/CRLF preservation, malformed sources, duplicate IDs, units, schema boundaries, locks, snaps, controls, source downloads, undo/redo, and portable save/reopen in isolated profiles. Permitted real survey files and Civil 3D 2025 receiving tests remain the next external validation.
