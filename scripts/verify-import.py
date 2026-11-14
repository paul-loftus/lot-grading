"""Compare imported/re-exported geometry directly to an independently authored DXF."""
import base64
import hashlib
import json
import math
from pathlib import Path

import ezdxf

ROOT = Path(__file__).resolve().parent.parent
source_file = ROOT / 'tests/fixtures/import/base-plan.dxf'
source = ezdxf.readfile(source_file)
result = ezdxf.readfile(ROOT / 'tests/.generated/reference-round-trip.dxf')
excluded = ezdxf.readfile(ROOT / 'tests/.generated/reference-excluded.dxf')
for doc in (result, excluded):
    audit = doc.audit()
    assert not audit.errors and not audit.fixes
    assert doc.header['$INSUNITS'] == 2
assert len(excluded.modelspace()) == 0, 'References must be excluded by default'
assert len(result.modelspace()) == 8, 'Seven source objects plus one static point label'


def near(a, b):
    assert math.isclose(a, b, rel_tol=0, abs_tol=1e-9), (a, b)


def point(a, b):
    for first, second in zip(a, b):
        near(first, second)


for original in source.modelspace():
    layer = original.dxf.layer
    if not layer.startswith(('EXISTING-', 'SURVEY-')):
        continue  # Deliberately unsupported records use layer 0.
    matches = [e for e in result.modelspace() if e.dxf.layer == layer and e.dxftype() != 'TEXT']
    assert len(matches) == 1, layer
    written = matches[0]
    kind = original.dxftype()
    if kind == 'LINE':
        vertices = list(written.points())
        point(vertices[0], original.dxf.start)
        point(vertices[1], original.dxf.end)
    elif kind == 'POINT':
        point(written.dxf.location, original.dxf.location)
    elif kind == 'LWPOLYLINE':
        assert written.dxftype() == kind and written.closed == original.closed
        near(written.dxf.elevation, original.dxf.elevation)
        for a, b in zip(written.get_points('xyb'), original.get_points('xyb'), strict=True):
            point(a, b)
    elif kind == 'POLYLINE':
        assert bool(written.is_closed) == bool(original.is_closed)
        expected = list(original.points())
        actual = list(written.points()) if written.dxftype() == 'POLYLINE' else list(written.vertices_in_wcs())
        assert len(expected) == len(actual)
        for a, b in zip(actual, expected):
            point(a, (b.x, b.y, b.z if original.is_3d_polyline else original.dxf.elevation.z))
    elif kind in ('ARC', 'CIRCLE'):
        arcs = list(written.virtual_entities())
        assert len(arcs) == (1 if kind == 'ARC' else 4)
        for arc in arcs:
            assert arc.dxftype() == 'ARC'
            point(arc.dxf.center, original.dxf.center)
            near(arc.dxf.radius, original.dxf.radius)
        if kind == 'ARC':
            point(arcs[0].start_point, original.start_point)
            point(arcs[0].end_point, original.end_point)
        else:
            near(sum((a.dxf.end_angle - a.dxf.start_angle) % 360 for a in arcs), 360)
        near(written.dxf.elevation, original.dxf.center.z)

saved = json.loads((ROOT / 'tests/.generated/reference-round-trip.lotgrade').read_text())
reference = saved['references'][0]
assert base64.b64decode(reference['contentBase64']) == source_file.read_bytes()
assert reference['sha256'] == hashlib.sha256(source_file.read_bytes()).hexdigest()
assert len(reference['issues']) == 4
print('PASS reference import round trip: independent original-source geometry, true arcs, Z, layers, units, original bytes, export scope and zero reader repairs')
