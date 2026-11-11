# Test 3 · Precision Showcase

[Editable project](Test-3-Precision-Showcase.lotgrade) · [DXF drawing](Test-3-Precision-Showcase.dxf) · [Overview](overview.png) · [House detail](house-detail.png) · [Verification controls](verification.json)

This is a detailed corner-lot example drawn through LotGrade's native interface. It exercises circular arcs and the new precision-placement tools in one house-and-site plan. The drawing uses **international feet**, a local illustrative coordinate system, and manually assigned elevations. It is a demonstration rather than a surveyed or engineered grading design.

## Open it

Use the current source build (`npm start`). In LotGrade, open **Test 3 · Precision Showcase** from the local project library, or use **Open project file** to import the `.lotgrade` file linked above. Older Rev 0 bundles do not include the precision controls and cannot open curve-bearing schema 2 files.

Start with **Fit drawing**. The street runs along the front and west sides, the house occupies the center, the rear deck opens onto a semicircular patio, and the east yard contains a rain-garden outline and setting-out guides. Five contours wrap around the house/patio area and stop at the driveway edges.

## What to inspect

| Area / feature                                 | What it demonstrates                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Curved property corner and street edges        | Mixed straight/arc paths and a true curved boundary closure                                                                    |
| Five contours, 102.50–104.50                   | Four exact quarter-circle segments per contour, with a driveway gap                                                            |
| House                                          | A 52 × 46-foot rectangle placed using an exact start coordinate and a calculated bearing/distance to the opposite corner       |
| Garage, porch, steps, deck, and interior lines | A fuller house layout with separate floor/threshold levels                                                                     |
| Semicircular patio                             | A 16-foot-radius curved boundary; its center control was placed using an arc-center snap                                       |
| Rain garden                                    | A clockwise 270-degree major arc, a center acquired with matching Z, and a midpoint acquired with XY-only snapping             |
| Driveway edges and centerline                  | Varying-Z straight polylines, exact fractional coordinates, a north-bearing placement, and snapped garage connections          |
| Front walks                                    | Explicit vertex elevations and endpoint snaps to the steps                                                                     |
| West/east drainage lines                       | A south-bearing placement and connections to existing outlet points with source-Z acquisition                                  |
| Axis A / Axis B                                | Finite intersection snapping and rejection of ambiguous source elevations                                                      |
| Trees T1–T6                                    | Both arc directions; T4 exercises radius/direction editing, and T6 is a duplicated crown offset 10 feet east and 10 feet south |
| Grid override point                            | Alt/Option bypasses a nearby object snap while the 5-foot grid remains active                                                  |

The completed drawing contains **47 primary features**, including **5 contours**, **13 spot elevations**, and **37 circular arc segments**. Each feature has an appropriate named DXF layer. The current application colors linework by feature kind, so layer names primarily organize the exported drawing.

## Known controls

| Feature          |              X |              Y |       Z | Acquisition                                                                                   |
| ---------------- | -------------: | -------------: | ------: | --------------------------------------------------------------------------------------------- |
| Garage threshold |           77.5 |          36.25 |  104.75 | Garage-edge midpoint, source Z matched                                                        |
| House FFE        |            100 |          77.25 |  105.25 | Exact coordinate entry                                                                        |
| FG at house      |          116.5 |          61.25 |  104.75 | House corner snapped in XY while preserving a different drawing elevation                     |
| Patio center     |           92.5 |         119.25 |  104.75 | Arc-center snap selected from overlapping targets                                             |
| Rain garden low  |            151 |            105 |  102.75 | Arc-center snap with source Z                                                                 |
| Rain garden rim  | 143.2218254069 | 112.7781745931 |  103.25 | True major-arc midpoint, XY-only snap                                                         |
| XY-only crossing |         149.75 |          42.25 | 102.375 | Intersection of guides at Z=102.125 and Z=102.625; matching source Z is deliberately rejected |
| Grid override    |            165 |             45 | 102.875 | Alt/Option mouse placement at approximately (163, 43.2), rounded by the 5-foot grid           |
| West outlet      |          42.25 |              8 |   101.5 | Exact control point used by the west drainage line                                            |
| East outlet      |         170.25 |          16.25 |  101.75 | Exact control point used by the east drainage line                                            |

Full-precision values, source identities, analytic arc centers/radii/midpoints, and the recorded UI exercises are in `verification.json`. The table rounds the rain-garden midpoint for readability.

## Try the controls yourself

1. Choose **Select**, then pick a feature from **Features** to inspect its coordinates, elevations, and export layer. Expand **Segments and curves** on a contour or patio to inspect radii and direction.
2. Choose **Spot**, set a distinctive drawing elevation, and move near a garage corner or threshold. With **Object snap ON**, the marker and feedback show which endpoint/point/midpoint is being offered. Use **Tab** to cycle overlapping targets.
3. Leave **Match target elevation** off to acquire XY only. Turn it on to copy an unambiguous source Z. At the Axis A / Axis B crossing, source elevations differ; the application explains why it cannot match a single Z there.
4. Hover near the rain garden's arc midpoint or center. These targets follow the real arc geometry rather than the endpoint chord.
5. Open **Precise placement** and enter a fractional X/Y point while the grid remains at 5 feet. Exact entry bypasses both snapping systems. After placing a start, try **Bearing / distance**: 0 is north and 90 is east.
6. Hold **Alt/Option** near an object target to bypass object snapping temporarily. The separate grid setting still applies.
7. Use **Undo/Redo** after an experimental feature. Save a separate project copy before keeping substantial changes to the demonstration.

The native drawing session also exercised undo/redo on the grid-override point and reopening the saved project. Snaps identify locations; they do not create persistent relationships or automatically reshape neighboring features.

## Civil 3D handoff

Open the DXF directly in Civil 3D 2025 and use Zoom Extents. Check the declared international-foot units, known controls, nonzero Z values, layers, and true arc segments. The DXF contains drawing entities, not a TIN surface. Follow the [receiving checklist](../../docs/CIVIL3D.md#receiving-checklist).

The project and DXF are checked independently for matching source geometry, bulges, layers, elevations, and a clean CAD-reader audit. The analytic arc controls cover all 37 saved arc segments. An actual receiving check in Civil 3D remains separate from those file checks.
