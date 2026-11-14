# Grade checks and explicit grade edits

[Tutorial](tutorial/README.md) · [Working files](FILES.md) · [Implementation research](../research/17-grade-measurement-and-editing/README.md)

Restart the current source with `npm start`. Feature 4 adds a **Grade check** tool (`G`) and a **Grade / slope** section when inspecting a path. These work with supplied point elevations and manually drawn linework; they do not generate a terrain surface.

## Measure two controls

1. Choose **Grade check** or press **G** outside an input field.
2. Move near an existing endpoint, spot, midpoint, arc center, or enabled intersection target. Confirm the target feedback; **Tab** cycles overlapping candidates.
3. Pick control **A**, then control **B**. Visible imported references are valid measurement sources and stay locked.
4. Review horizontal XY distance, signed elevation difference, signed percent grade, H:V ratio, and downhill direction in Properties.
5. Inspect the A/B markers and downhill arrow on the plan. A third pick starts a new pair; **Clear grade check** or **Escape** clears the current check. Hold Space to pan while keeping the measurement.

Grade check always acquires the target's actual XYZ, independently of Drawing elevation or the drawing tools' optional Z matching. Object snaps are required in this tool; grid rounding and Alt/Option cannot substitute a guessed elevation. A free plan click is rejected. Intersections whose sources have different Z values are rejected; cycle to a known point/endpoint/midpoint or choose another control. Intersection availability follows the existing intersection-snap setting.

Readouts are two-point checks in the project's common XY/Z units. They do not interpolate ground between controls, evaluate drainage capacity, or apply code/design criteria. Verify the coordinate/vertical context of supplied data before using a result. Editing a document or undoing/redoing clears temporary picked checks; they are not persistent relationships.

## Interpret the numbers

```text
horizontal run = hypot(B.x - A.x, B.y - A.y)
elevation difference = B.z - A.z
percent grade A→B = 100 × elevation difference / horizontal run
H:V magnitude = horizontal run / abs(elevation difference) : 1
```

Percent grade uses horizontal distance, not 3D line length. Positive means **B is higher than A**; negative means B is lower. The arrow points downhill, so a positive grade has a B→A arrow. The H:V value is an unsigned magnitude; direction is displayed separately.

| Controls                             | Grade and ratio                                                  |
| ------------------------------------ | ---------------------------------------------------------------- |
| A Z=100, B Z=102, horizontal run=100 | +2%; 50 H : 1 V; downhill B→A                                    |
| A Z=102, B Z=100, horizontal run=100 | −2%; 50 H : 1 V; downhill A→B                                    |
| Same Z, nonzero horizontal run       | 0%; Level / V=0; no downhill arrow                               |
| Same XY, different Z                 | Undefined percent grade; 0 H : 1 V / vertical; no plan direction |
| Identical XYZ                        | Undefined grade/ratio; coincident controls                       |

The selected-path check is between consecutive vertices, including the last→first segment on a closed polyline. On an arc, **horizontal run is its endpoint chord**, explicitly labeled in the panel. Curves currently have constant Z, so their endpoint grade is level; this is not a grade along a varying-elevation curve.

## Set a grade on a proposed polyline

1. Choose **Select**, select a proposed straight polyline, and expand **Grade / slope** in Properties.
2. Choose **Measured segment**. A is the first vertex shown and B is the next vertex in path order.
3. Choose **Held elevation**: A or B.
4. Enter **Grade from A to B · %**. The sign always follows A→B, even when B is held.
5. Review the proposed moving vertex's exact Z, unchanged held Z, resulting grade, and any adjacent segment whose grade would also change. An orange dashed plan overlay identifies a preview.
6. Choose **Apply grade**. This creates one undoable edit to one vertex Z. Use Undo/Redo to review it, then save/export normally.

Examples with a 100-foot horizontal run:

- Hold A at Z=100, enter **+2.5%**: B becomes **102.5**.
- Hold B at Z=102, enter **−3.25%**: A becomes **105.25**, since B must be below A in the A→B direction.

Only the chosen polyline vertex Z changes. Its XY and the held endpoint stay fixed. An interior vertex also participates in a neighboring segment, whose grade change appears in the preview. Other features and reference controls remain independent; they are not automatically moved to the new elevation.

## Protected geometry and preview behavior

Grade editing is available for proposed polylines containing only straight segments. A path containing any circular arc remains planar, including when its chosen segment is straight. Contours, boundaries, building outlines, spots, and imported references use their existing elevation/inspection controls; the grade editor does not flatten curves or reshape these objects.

A zero horizontal run cannot define a finite percent-grade edit. Nonfinite input, out-of-range resulting coordinates, and elevation differences too small to represent at the held Z are rejected. Steep/negative/zero grades are otherwise mathematical inputs, without universal compliance thresholds. Review the resulting grade in the preview because stored double-precision coordinates determine the achieved result. Display rounding never changes the saved calculation.

Typing a grade creates a preview only. **Save**, portable copies, and DXF export continue using committed geometry until **Apply grade** is chosen. Measurement markers, arrows, and preview labels are temporary and are not exported as annotation objects. Reopening a project, including another disk revision with the same project identity, starts a fresh measurement/editing session.

Applied varying-Z straight polylines export as true 3D POLYLINE entities. The independent CAD check verifies held controls, exact global XY, expected changed Z, and the computed grade in the actual output. Native Civil 3D 2025 receiving validation remains a separate check.
