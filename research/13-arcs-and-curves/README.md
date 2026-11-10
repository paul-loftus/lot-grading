# Arcs and curves in the drawing tools

[Research index](../README.md) · [Drawing tutorial](../../docs/tutorial/README.md) · [Civil 3D exchange](../../docs/CIVIL3D.md)

Research date: **October 30, 2026**. This is an implementation decision for the existing Electron/React/TypeScript application. Published CAD behavior is linked below; tool priorities, the data contract, and acceptance criteria are LotGrade engineering decisions.

## Decision

Add **exact circular arc segments** to **Polyline**, **Contour**, and **polygon Boundary**, with a small **Line / Arc** selector. A single feature can contain straight segments and arcs. Keep Building and rectangular Boundary creation rectangular, and keep Spot elevation as a point.

Start with three-point arc construction: **start → point on the arc → endpoint**. Continue from the previous endpoint when drawing another segment. This matches a familiar CAD workflow without bringing the full CAD command interface into LotGrade. Autodesk's ARC documentation describes three-point construction alongside center/radius/angle alternatives; its PLINE command supports connected line and arc segments in one object. [Autodesk: arcs](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-C78378FD-4704-4D0A-9D86-82FCBB118097.htm), [Autodesk: PLINE](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-11883C70-6435-4F80-8FB4-F6E933B8FD94.htm).

Do not automatically smooth existing drawings, including Test 2. The designer should deliberately place each curve. General freeform splines, tangent constraints, radius-based fillets, and automatic joins are later features.

## Which tools deserve curves?

| Tool                 | Decision                           | Practical use / boundary                                                                               |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Contour              | Add mixed line/arc drawing         | Trace constant-elevation curves around a pad or landscape feature; every vertex and arc stays at one Z |
| Polyline             | Add mixed line/arc drawing         | Draw curved paving edges, planting edges, and other plan linework at one elevation                     |
| Polygon Boundary     | Add mixed line/arc drawing         | Describe curved lot frontages and design limits while keeping one closed feature                       |
| Rectangular Boundary | Keep two-corner rectangle creation | A rectangle has straight sides by definition; use Polygon when curved edges are required               |
| Building             | Keep rectangle creation            | Preserve the existing footprint workflow; a future general footprint tool can reuse the path geometry  |
| Spot elevation       | No curve mode                      | A spot represents one XYZ location                                                                     |
| Select / Pan         | Support curved objects             | Selection, movement, fit, and measurements must follow the curve rather than its endpoint chord        |

These priorities are based on the current product's scope. They are not a claim that all real buildings or property boundaries have rectangular geometry.

## Interface workflow

1. Choose Polyline, Contour, or polygon Boundary and set its drawing elevation.
2. Choose **Line** for the next straight segment or **Arc** for the next circular segment.
3. For the first arc, click its start, a point that the arc passes through, and its endpoint. Show a live preview before the final click.
4. For the next arc, reuse the current endpoint and ask only for a point on the arc and its new endpoint.
5. Switching Line/Arc preserves completed draft segments. A pending through-point must be completed or deliberately discarded before finishing.
6. Finish the feature with Enter or the existing Finish control. Escape cancels the unfinished draft.

Use visible prompts such as “Choose a point on the arc” and “Choose the arc endpoint.” A through-point lies **on** the curve; it is not the circle center or a Bézier handle. Repeated or collinear picks should produce a useful correction message while preserving completed draft work.

Selection and property editing should show the curved segment clearly and provide meaningful curve values, such as radius or signed sweep. Keep DXF terminology such as “bulge” in implementation documentation rather than making users calculate it. Straightening a segment is an explicit edit, not a side effect of saving or changing elevation.

This scope gives positional continuity between consecutive segments: they share endpoints. It does not guarantee tangency or smooth curvature across their joins. Autodesk offers separate tangent/continuation methods; those deserve a later, explicit workflow. [Autodesk: arcs](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-C78378FD-4704-4D0A-9D86-82FCBB118097.htm).

## Programming representation

Keep world-coordinate endpoint vertices and store an optional, parallel `bulges` array. Entry `bulges[i]` describes the segment from vertex `i` to the next vertex. Zero means straight; a nonzero signed value defines a circular arc. For a closed path, the last entry describes the closing segment. For an open path, the last entry must be zero. This mirrors LWPOLYLINE's outgoing-segment convention. [ezdxf: LWPolyline](https://ezdxf.readthedocs.io/en/stable/dxfentities/lwpolyline.html).

For chord length `c`, signed sweep `theta` in radians, and bulge `b`:

```text
b = tan(theta / 4)
theta = 4 atan(b)
radius = c (1 + b²) / (4 |b|)
arc length = radius |theta|
```

Positive bulge follows a counterclockwise sweep in world XY; negative bulge follows clockwise. A semicircle has `|b| = 1`; larger magnitudes select major arcs. Do not replace a tiny but intentional curve with a straight line merely because it looks straight at the current zoom.

Construct a three-point arc using differences from a nearby endpoint, rather than squaring large global survey coordinates directly. Reject coincident and near-collinear inputs using a documented, scale-aware tolerance. Validate that derived radius, center, sweep, and bounds are finite and inside supported limits.

Use one geometry module for rendering, selection paths, fit bounds, and measurements. Length must use the circular arc, not its chord. For a closed path, add each signed circular-segment contribution to the endpoint polygon's signed area:

```text
area correction = 0.5 radius² (theta - sin(theta))
```

Fit and export extents must include any cardinal circle extrema contained in the arc's sweep. Endpoint-only bounds can omit the top, bottom, or side of a curve. Use numerically stable equivalents near zero sweep.

Render the exact circular geometry with SVG path `A` commands and equal X/Y radii. Choose the large-arc and sweep flags from the signed sweep. LotGrade's world Y points up while screen Y points down, so the rendering transform reverses the apparent sweep direction. Use that same path for the visible stroke, hit target, and closed fill. [W3C SVG path specification](https://www.w3.org/TR/SVG2/paths.html#PathDataEllipticalArcCommands).

## Elevations and DXF export

Export planar curves as **LWPOLYLINE with group code 42 bulges**, retaining the common elevation in group 38. The DXF stays R2013/AC1027; the additive curve support becomes LotGrade export contract 2. Straight legacy drawings must retain their previous serialized output. [Autodesk: LWPOLYLINE DXF](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm).

A curved feature must have **one elevation for the entire path** in this implementation. Existing varying-elevation straight polylines remain supported. Reject attempts to combine changing vertex Z values with bulges, and explain how to assign a common elevation. Never silently flatten the elevations, drop the curves, or export endpoint chords. Autodesk explicitly documents that 3D polylines cannot contain arc segments. [Autodesk: 3DPOLY](https://help.autodesk.com/cloudhelp/2025/ENG/AutoCAD-Core/files/GUID-10E0EDAB-BF4C-442C-93DA-E516F6DEAA7B.htm).

Use **project schema 2 for curve-bearing files**, while continuing to open legacy schema 1 drawings. Rev 0 does not understand bulges: adding them to a schema 1 file would let an older application open it and silently treat the arcs as straight segments. The newer schema makes older applications reject unsupported geometry instead.

## Why defer arbitrary splines and smoothing?

A circular arc has a known radius and a compact exact CAD representation. A general spline needs a separate model for fit/control points, degree, knots, continuity, and possibly weights. Autodesk's SPLINE command distinguishes fit-point and control-vertex workflows; fit splines are cubic and their knot parameterization affects shape. Uniform parameterization can overshoot the picked points. [Autodesk: SPLINE](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-5E7D51E2-1595-4E0C-85F8-2D7CBD166A08.htm).

Future spline work should choose a documented interpolation rule, expose its controls, and add exact SPLINE exchange or a clearly specified approximation tolerance. Painting a smooth screen path while exporting old straight segments would create a different drawing downstream.

Contour smoothing also has an engineering consequence. Civil 3D distinguishes display smoothing from modifying the terrain surface; its surface-smoothing documentation explains that separately smoothed contours can overlap. A prettier curve does not establish a valid proposed surface or prove drainage. [Civil 3D: contour display](https://help.autodesk.com/cloudhelp/2025/ENU/Civil3D-UserGuide/files/GUID-D3CE4E3C-F543-478C-9A28-F6F72A186998.htm), [Civil 3D: smoothing surfaces](https://help.autodesk.com/cloudhelp/2025/ENU/Civil3D-UserGuide/files/GUID-43BF4B80-4D20-4588-A5C2-54C83DBB9ADF.htm).

## Acceptance evidence

- Independently known clockwise/counterclockwise, quarter-circle, semicircle, and major-arc cases; exact lengths, signed areas, and extrema.
- Collinear/coincident picks, tiny sweeps, large asymmetric world coordinates, malformed bulge arrays, and invalid nonplanar curves.
- Mixed straight/arc contours and polylines, curved closed boundaries including their closing segment, and untouched rectangle/spot workflows.
- Preview, mode changes, cancellation, selection near the arc away from its chord, move, duplicate, undo/redo, save/open, and export through the interface.
- Independent DXF parsing that compares endpoint coordinates, bulges, reconstructed arc radius/center/sweep, elevation, layers, units, closure, and a clean audit.
- Legacy sample output unchanged, schema 1 still readable, and schema 2 rejected by the original Rev 0 reader.
- A real Civil 3D 2025 receiving check for the new curve fixture. Automated geometry checks do not replace that receiving test.

These are acceptance requirements, not a claim that documentation alone verifies the feature. Record actual test results with the implementation and keep the existing Civil 3D receiving limitation visible.
