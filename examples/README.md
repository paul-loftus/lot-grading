# Willow Creek · Lot 12 receiving sample

This is an illustrative v0 drawing for trying LotGrade and checking its DXF handoff. It is not a surveyed property or an engineered grading design.

- **[Willow-Creek-Lot-12.lotgrade](Willow-Creek-Lot-12.lotgrade):** use **Open project** in LotGrade to inspect, edit, save, and export the project.
- **[Willow-Creek-Lot-12.dxf](Willow-Creek-Lot-12.dxf):** open directly in Civil 3D with **Open**, then **Zoom Extents**. This is the matching export from the checked-in project revision.

The drawing uses **international feet**, a local illustrative coordinate frame, and no claimed horizontal/vertical datum. World X and Y are plan coordinates; Z is elevation. The DXF unit declaration is `$INSUNITS=2`. Source coordinates have not been shifted or converted.

## Known checks in Civil 3D

| Object / control | Expected coordinates or properties                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Lot boundary     | Closed polyline on `FG-LIMIT`; corners `(0,0,100)`, `(90,0,100)`, `(90,125,100)`, `(0,125,100)`   |
| Proposed home    | Closed polyline on `BUILDING`; corners `(23,39,103)`, `(66,39,103)`, `(66,80,103)`, `(23,80,103)` |
| Front threshold  | POINT on `FG-SPOT` at **X=44.5, Y=39, Z=103.5**, with a separate static text label                |
| Street tie-in    | POINT on `FG-SPOT` at **X=44.5, Y=0, Z=99.5**, with a separate static text label                  |
| Contour 100      | Open polyline on `FG-CONT-MINOR`, constant **Z=100**; first `(0,13,100)`, last `(90,11,100)`      |
| Contour 101      | Open polyline on `FG-CONT-MINOR`, constant **Z=101**; first `(0,28,101)`, last `(90,26,101)`      |
| Contour 102      | Open polyline on `FG-CONT-MINOR`, constant **Z=102**; first `(0,48,102)`, last `(90,44,102)`      |
| Contour 103      | Open polyline on `FG-CONT-MINOR`, constant **Z=103**; first `(0,106,103)`, last `(90,101,103)`    |
| Driveway west    | Open polyline on `FG-BREAKLINE`, **Z=101**, through `(28,0)`, `(28,32)`, `(33,39)`                |
| Driveway east    | Open polyline on `FG-BREAKLINE`, **Z=101**, through `(52,0)`, `(52,32)`, `(48,39)`                |
| Object count     | **10 primary objects**: 8 polylines and 2 POINTs, plus 2 static TEXT labels                       |

Use Properties or `LIST` to inspect elevations and closure, and `AUDIT` to check the receiving drawing. If inserting the geometry into another drawing, first confirm that drawing's units and coordinate context. Follow the complete [Civil 3D receiving checklist](../docs/CIVIL3D.md#receiving-checklist).

V0 exports drawing linework; this sample does not contain a TIN, native Civil 3D grading objects, a LandXML surface, or dynamic labels. Native Civil 3D receiving validation has not been performed here. Independent ezdxf checks confirm the written DXF parses with zero reported repairs/errors and preserves all source objects, vertices, elevations, layers, and closed/open states.

## Reproduce and verify

From the repository root:

```sh
node --import tsx scripts/generate-example.ts
python scripts/verify-dxf.py --example
```

Use the Python interpreter containing `ezdxf==1.4.3` (or `python3` if appropriate). The generator fixes project/entity IDs and timestamps so identical source geometry creates identical files. The regular TypeScript exporter tests compare this committed DXF to the current writer's output; if geometry or the interchange contract changes, review these receiving checks before regenerating the sample.

## Test 2 · house with contours

Open the **[Test 2 project](Test%202.lotgrade)** in LotGrade, inspect its **[preview](Test%202.png)**, or open the matching **[DXF](Test%202.dxf)** in Civil 3D. Its project name is `Test 2` and its description is `real test`.

This illustrative layout was drawn through LotGrade's desktop tools. It includes a house, attached garage, entry porch, rear patio, driveway, walk, street linework, spot elevations, and five contours from 103 to 105 feet in half-foot increments. The current project has 21 drawing objects; the full [original 22-object snapshot](Test%202%20-%20original/Test%202.lotgrade) and its DXF/preview are preserved in `Test 2 - original/` from before one interior wall line was removed.

Both project/DXF pairs were checked for matching geometry, elevations, layers, units, and a clean independent-reader audit. Like the Willow Creek example, Test 2 uses international feet and illustrative local coordinates. Its contours are manually drawn; this is not an engineered grading design or a record of completed Civil 3D receiving validation.
