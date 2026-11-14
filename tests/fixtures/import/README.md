# Illustrative import fixtures

[Import guide](../../../docs/IMPORT.md) · [Implementation decisions](../../../research/15-survey-reference-import/README.md)

These are fictional engineering controls for repeatable import tests, using international feet and a local coordinate frame. They contain no real property survey or client data.

- `survey-pnezd.csv`: UTF-8 BOM, CRLF line endings, a header, three PNEZD records, and a quoted comma in a description. Its first XYZ is `(2000000.25, 5000000.75, 98.125)`.
- `base-plan.dxf`: independently authored using ezdxf 1.4.3 APIs. Seven supported model-space objects occupy named `EXISTING-*` and `SURVEY-*` layers: a varying-Z LINE, bulged LWPOLYLINE, 3D POLYLINE, legacy 2D POLYLINE, ARC crossing 0 degrees, CIRCLE, and POINT. Four deliberately unsupported records use layer `0`: TEXT, INSERT, a tilted CIRCLE, and a wide LWPOLYLINE. The INSERT references a simple block definition.

`scripts/generate-import-fixture.ts` imports the DXF and generates excluded/included reference exports under ignored `tests/.generated/`. `scripts/verify-import.py` compares those exports directly against this original CAD fixture, including coordinates, true arcs, Z, layers, units, a clean reader audit, original bytes, and SHA-256 identity. The fixture can be opened manually in the import dialog: expect **7 supported / 4 skipped**.
