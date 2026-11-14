"""Independent check of held controls, applied grades, source XYZ and real DXF Z."""
import json
import math
from pathlib import Path

import ezdxf

root = Path(__file__).resolve().parent.parent / 'tests/.generated'
project = json.loads((root / 'applied-grade.lotgrade').read_text())
doc = ezdxf.readfile(root / 'applied-grade.dxf')
audit = doc.audit()
assert not audit.errors and not audit.fixes
assert doc.dxfversion == 'AC1027' and doc.header['$INSUNITS'] == 2
assert len(doc.modelspace()) == 4
expected = {
    'hold-a': [(2000000.25, 5000000.75, 100), (2000100.25, 5000000.75, 102.5), (2000150.25, 5000000.75, 101)],
    'hold-b': [(2000000.25, 5000020.75, 105.25), (2000100.25, 5000020.75, 102)],
    'benchmark': [(2000010.25, 5000030.75, 100.5)],
}
by_id = {e.get_xdata('LOTGRADE')[0].value: e for e in doc.modelspace()}
assert set(by_id) == {'hold-a', 'hold-b', 'benchmark', 'benchmark:label'}
for source in project['entities']:
    wanted = expected[source['id']]
    item = by_id[source['id']]
    if source['kind'] == 'point':
        assert item.dxftype() == 'POINT' and item.dxf.layer == 'FG-SPOT'
        points = [item.dxf.location]
    else:
        assert item.dxftype() == 'POLYLINE' and item.is_3d_polyline and not item.is_closed
        assert item.dxf.layer == 'FG-BREAKLINE'
        points = list(item.points())
    assert len(points) == len(wanted)
    for actual, point, saved in zip(points, wanted, source['points'], strict=True):
        for axis, component, expected_value in zip(('x', 'y', 'z'), actual, point):
            assert math.isclose(component, expected_value, rel_tol=0, abs_tol=1e-9)
            assert saved[axis] == expected_value
for identity, grade in [('hold-a', 2.5), ('hold-b', -3.25)]:
    a, b = list(by_id[identity].points())[:2]
    run = math.hypot(b.x - a.x, b.y - a.y)
    assert run == 100
    assert (b.z - a.z) / run * 100 == grade
assert 'gradeOverlay' not in project and 'gradeControls' not in project
print('PASS applied grades: held endpoints, adjacent vertex Z, global XY, independent percent calculation, static benchmark, units and zero CAD-reader repairs')
