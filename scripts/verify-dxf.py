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
    if "extents" in expected:
        for header, key in (("$EXTMIN", "min"), ("$EXTMAX", "max")):
            equal_point(doc.header[header], dict(zip(("x", "y", "z"), expected["extents"][key])), header)
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
            # Checking vertices alone would accept a curve silently flattened to
            # straight chords. DXF bulges belong to each outgoing vertex, including
            # the last-to-first segment of a closed path.
            source_bulges = source.get("bulges", [0] * len(points))
            assert len(source_bulges) == len(points), "Fixture bulges must match source vertices"
            for index, actual in enumerate(entity.get_points("b")):
                # Both values are serialized IEEE doubles; require exact equality
                # so even a shallow nonzero arc cannot pass as a straight segment.
                assert actual[0] == source_bulges[index], f"{source['id']} bulge {index} changed: {actual[0]!r} != {source_bulges[index]!r}"
        else:
            assert not any(source.get("bulges", [])), "A curved path must not be flattened into a 3D polyline"
            assert entity.dxftype() == "POLYLINE" and entity.is_3d_polyline
            assert entity.is_closed == source["closed"]
            assert len(entity.vertices) == len(points)
            for index, vertex in enumerate(entity.vertices):
                equal_point(vertex.dxf.location, points[index], f"{source['id']} vertex {index}")

    controls = expected.get("arcControls", [])
    arc_count = sum(sum(bulge != 0 for bulge in source.get("bulges", [])) for source in case["project"]["entities"])
    assert len(controls) == arc_count, "Every fixture arc needs an independent analytic control"
    for control in controls:
        source_id = control["sourceId"]
        # ezdxf reconstructs real ARC entities from the exported bulges. These
        # expected centers/radii/midpoints are hand-specified analytic controls,
        # rather than values computed by LotGrade's own geometry helpers.
        segments = list(by_id[source_id].virtual_entities())
        arc = segments[control["segmentIndex"]]
        assert arc.dxftype() == "ARC", f"Expected an arc in {source_id} segment {control['segmentIndex']}"
        equal_point(arc.dxf.center, dict(zip(("x", "y", "z"), control["center"])), f"{source_id} arc center")
        equal_number(arc.dxf.radius, control["radius"], f"{source_id} arc radius")
        sweep = (arc.dxf.end_angle - arc.dxf.start_angle) % 360
        equal_number(sweep, control["sweepDegrees"], f"{source_id} arc sweep")
        midpoint_angle = math.radians(arc.dxf.start_angle + sweep / 2)
        midpoint = (
            arc.dxf.center.x + arc.dxf.radius * math.cos(midpoint_angle),
            arc.dxf.center.y + arc.dxf.radius * math.sin(midpoint_angle),
            arc.dxf.center.z,
        )
        equal_point(midpoint, dict(zip(("x", "y", "z"), control["midpoint"])), f"{source_id} arc midpoint")
    print(f"PASS {case['name']}: independently parsed geometry, bulges/arc controls, layers, units, elevations, closure and zero CAD-reader repairs")


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
