#!/usr/bin/env python3
"""Independent interoperability gate: read real writer output with ezdxf.

Install dev dependency: python -m pip install ezdxf==1.4.3
Run through npm run test:interop so fixtures come from the current TS exporter.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

try:
    import ezdxf
    from ezdxf.lldxf.encoding import decode_dxf_unicode
except ImportError:
    sys.exit("Install the independent CAD reader with: python -m pip install ezdxf==1.4.3")

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = json.loads((ROOT / "tests/fixtures/export/cases.json").read_text(encoding="utf-8"))


def equal_number(actual: float, expected: float, context: str) -> None:
    # No relative tolerance: a large global coordinate must not hide a shift.
    assert math.isclose(actual, expected, rel_tol=0, abs_tol=1e-9), f"{context}: {actual!r} != {expected!r}"


def equal_point(actual, expected: dict, context: str) -> None:
    for index, axis in enumerate(("x", "y", "z")):
        equal_number(float(actual[index]), expected[axis], f"{context}.{axis}")


def verify(case: dict, filename: Path | None = None) -> None:
    filename = filename or ROOT / "tests/.generated" / f"{case['name']}.dxf"
    assert filename.is_file(), f"Missing generated fixture: {filename}; run npm run test:interop"
    content = filename.read_bytes()
    assert content.isascii(), f"{filename}: writer contract requires ASCII DXF"
    doc = ezdxf.readfile(filename)
    assert doc.dxfversion == "AC1027", f"Unexpected DXF version: {doc.dxfversion}"
    audit = doc.audit()
    assert not audit.errors, f"CAD reader found unrecoverable errors: {audit.errors}"
    assert not audit.fixes, f"CAD reader had to repair the drawing: {audit.fixes}"
    expected = case["expected"]
    assert doc.header["$INSUNITS"] == expected["insunits"]
    assert doc.header["$MEASUREMENT"] == expected["measurement"]
    equal_point(doc.header["$INSBASE"], {"x": 0, "y": 0, "z": 0}, "insertion base")
    model = doc.modelspace()
    counts = {kind: len(model.query(kind)) for kind in ("LWPOLYLINE", "POLYLINE", "POINT", "TEXT")}
    assert counts["LWPOLYLINE"] == expected["lwpolylineCount"], counts
    assert counts["POLYLINE"] == expected["polyline3dCount"], counts
    assert counts["POINT"] == expected["pointCount"], counts
    assert counts["TEXT"] == expected["textCount"], counts
    assert len(model) == expected["primaryEntityCount"] + expected["textCount"], "An entity was omitted or invented"
    by_id = {}
    for entity in model:
        data = entity.get_xdata("LOTGRADE")
        assert len(data) == 1 and data[0].code == 1000, "Missing stable source identity"
        identity = data[0].value
        assert identity not in by_id, f"Duplicate source identity in DXF: {identity}"
        by_id[identity] = entity

    for source in case["project"]["entities"]:
        assert source["id"] in by_id, f"Missing source object: {source['id']}"
        entity = by_id[source["id"]]
        assert decode_dxf_unicode(entity.dxf.layer).casefold() == source["layer"].casefold(), f"Layer changed for {source['id']}"
        assert doc.layers.has_entry(entity.dxf.layer), "Entity layer missing from LAYER table"
        points = source["points"]
        if source["kind"] == "point":
            assert entity.dxftype() == "POINT"
            equal_point(entity.dxf.location, points[0], source["id"])
            label = by_id[f"{source['id']}:label"]
            assert label.dxftype() == "TEXT"
            assert decode_dxf_unicode(label.dxf.layer).casefold() == source["layer"].casefold()
            assert source["name"] in decode_dxf_unicode(label.dxf.text), "Spot name/Unicode text was lost"
            equal_number(label.dxf.insert.z, points[0]["z"], "spot label elevation")
            continue
        if all(point["z"] == points[0]["z"] for point in points):
            assert entity.dxftype() == "LWPOLYLINE", f"Expected constant-elevation polyline for {source['id']}"
            assert entity.closed == source["closed"]
            assert len(entity) == len(points)
            equal_number(entity.dxf.elevation, points[0]["z"], "constant elevation")
            for index, point in enumerate(entity.vertices_in_wcs()):
                equal_point(point, points[index], f"{source['id']} vertex {index}")
        else:
            assert entity.dxftype() == "POLYLINE" and entity.is_3d_polyline
            assert entity.is_closed == source["closed"]
            assert len(entity.vertices) == len(points)
            for index, vertex in enumerate(entity.vertices):
                equal_point(vertex.dxf.location, points[index], f"{source['id']} vertex {index}")
    print(f"PASS {case['name']}: independently parsed geometry, layers, units, elevations, closure and zero CAD-reader repairs")


if __name__ == "__main__":
    if sys.argv[1:] == ["--example"]:
        stem = ROOT / "examples/Willow-Creek-Lot-12"
        project = json.loads(stem.with_suffix(".lotgrade").read_text(encoding="utf-8"))
        constant_lines = sum(source["kind"] != "point" and all(point["z"] == source["points"][0]["z"] for point in source["points"]) for source in project["entities"])
        spots = sum(source["kind"] == "point" for source in project["entities"])
        case = {
            "name": "Willow-Creek-Lot-12 receiving sample", "project": project,
            "expected": {"insunits": 2, "measurement": 0, "primaryEntityCount": 10, "textCount": spots, "lwpolylineCount": constant_lines, "polyline3dCount": len(project["entities"]) - constant_lines - spots, "pointCount": spots},
        }
        verify(case, stem.with_suffix(".dxf"))
    elif sys.argv[1:]:
        sys.exit("Usage: verify-dxf.py [--example]")
    else:
        for test_case in CONTRACT["cases"]:
            verify(test_case)
    print(f"Verified DXF contract {CONTRACT['contractVersion']} with ezdxf {ezdxf.__version__}; Civil 3D receiving validation is still required.")
