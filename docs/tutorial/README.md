# LotGrade drawing tutorial

[Main README](../../README.md) · [Example files](../../examples/README.md) · [Civil 3D export guide](../CIVIL3D.md)

This guide walks through drawing a small residential lot, assigning elevations, making lines meet, drawing true circular arcs, and saving/exporting your work. Allow about 20–30 minutes for the first pass.

The current application supports manually drawn, elevated linework and circular arcs. Arbitrary splines, automatic smoothing, endpoint snapping/joining, slope calculations, and automatic grading are not available yet. All sample coordinates are illustrative.

This guide includes the curve update after the original `rev-0` snapshot. If your app does not show **Segment type**, rebuild and launch the current source with `npm start`; the original Rev 0 bundles do not contain these controls.

## Contents

- [1. Launch LotGrade](#1-launch-lotgrade)
- [2. Create a practice project](#2-create-a-practice-project)
- [3. Get comfortable with the workspace](#3-get-comfortable-with-the-workspace)
- [4. Draw the lot boundary](#4-draw-the-lot-boundary)
- [5. Add a building](#5-add-a-building)
- [6. Place spot elevations](#6-place-spot-elevations)
- [7. Draw lines and make connections](#7-draw-lines-and-make-connections)
- [8. Draw contours](#8-draw-contours)
- [9. Draw and edit circular curves](#9-draw-and-edit-circular-curves)
- [10. Edit and organize features](#10-edit-and-organize-features)
- [11. Save, reopen, and export](#11-save-reopen-and-export)
- [Keyboard reference](#keyboard-reference)
- [Troubleshooting](#troubleshooting)

## 1. Launch LotGrade

If you already have a built application, open **LotGrade.app** on Mac or **LotGrade.exe** on Windows. Keep the Windows executable in its complete application folder.

To launch from the source code, open a terminal in the repository folder and run:

```sh
npm ci
npm start
```

You need Node.js 22.12 or newer and npm. Run `npm ci` when first setting up the project or after its dependencies change; on subsequent launches, use `npm start`.

For a quick look before drawing anything, click **Explore an example project** on the dashboard. To follow the tutorial from scratch, create a new project instead.

## 2. Create a practice project

1. Click **New project**.
2. Enter `Tutorial · Lot 1` as the **Project name**.
3. Optionally add a description.
4. Set **Drawing units** to **International feet** so the numbers below match your project.
5. Click **Create project**.

X and Y are plan coordinates, and Z is elevation. In this tutorial, all three are in feet. Increasing X moves right/east; increasing Y moves up/north.

Choose units when creating the project. Rev 0 does not offer an in-place unit conversion. International feet and US survey feet are separate choices.

## 3. Get comfortable with the workspace

- **Left:** drawing tools. Hover over a tool to see its name and shortcut.
- **Center:** the plan canvas.
- **Right:** **Properties** for the active tool or selected feature, plus a **Features** list for selecting objects by name.
- **Top:** undo/redo, fit drawing, grid snap, save, and DXF export.
- **Bottom:** tool instructions and cursor coordinates. The Z readout shows the current drawing elevation, not the elevation under the cursor.

Try these controls:

| Action                       | How                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Zoom                         | Scroll over the canvas, or use its zoom buttons                                                              |
| Pan                          | Choose **Pan** (`H`) and drag; alternatively hold **Space** and drag, or drag with the middle mouse button   |
| Show the whole drawing       | Click **Fit drawing** in the top toolbar or the fit button beside the canvas zoom controls                   |
| Select a feature             | Choose **Select** (`V`) and click its line/outline or spot marker; alternatively choose it from **Features** |
| Cancel an unfinished drawing | Press **Esc** or click the draft's cancel button                                                             |

With nothing selected, the right panel shows **Grid spacing** and **Contour step**. Leave both at `1` for now, with **Grid snap ON** in the top toolbar.

Grid snap rounds newly placed X/Y positions to the chosen spacing. It does not snap to existing endpoints. At a distant zoom level, the displayed grid can show larger intervals than the actual snap spacing.

**For precise placement throughout this tutorial:** draw the required number of points approximately, select the finished feature, expand **Vertex coordinates**, and enter its exact X, Y, and Z values. Press **Enter** after each field to commit it. Numeric coordinate editing accepts fractional values even when grid snap is on.

## 4. Draw the lot boundary

1. Choose **Boundary** (`B`).
2. In the right panel, choose **Rectangle** under **Boundary shape**.
3. Set **Drawing elevation** to `100` and press **Enter**.
4. Click two opposite corners anywhere on the canvas, with some width and height between them. The rectangle finishes after the second click.
5. Open **Features** and choose **Lot boundary 1**.
6. Change **Feature name** to `Tutorial lot boundary` and press **Enter**.
7. Expand **Vertex coordinates** and enter these values:

| Vertex |   X |   Y |   Z |
| ------ | --: | --: | --: |
| 1      |   0 |   0 | 100 |
| 2      |  90 |   0 | 100 |
| 3      |  90 | 125 | 100 |
| 4      |   0 | 125 | 100 |

Click **Fit drawing**. You should see a closed 90-by-125-foot lot, with a perimeter of `430 ft` and an area of `11,250 ft²` in its properties.

For an irregular lot, choose **Boundary → Polygon**, click at least three corners, then press **Enter**, click **Finish boundary**, or click near the first point to close it. You do not need to repeat the first vertex. Boundary points must enclose an area; a row of points on one straight line will not finish as a boundary.

Polygon boundaries also offer **Line / Arc (3 points)** under **Segment type**. See [the curve walkthrough](#9-draw-and-edit-circular-curves) for a curved edge or curved closure. Rectangle creation keeps straight sides.

## 5. Add a building

1. Choose **Building** (`R`).
2. Set **Drawing elevation** to `103` and press **Enter**.
3. Click two opposite corners to place a footprint inside the lot.
4. Select **Building 1** from **Features**, rename it `Proposed home`, and enter:

| Vertex |   X |   Y |   Z |
| ------ | --: | --: | --: |
| 1      |  23 |  39 | 103 |
| 2      |  66 |  39 | 103 |
| 3      |  66 |  80 | 103 |
| 4      |  23 |  80 | 103 |

The result is a closed 43-by-41-foot footprint. The **Building** tool initially creates a rectangle aligned with the X/Y axes. Individual vertices can be edited afterward; rectangular relationships are not locked.

## 6. Place spot elevations

1. Choose **Spot** (`P`).
2. Set **Drawing elevation** to `99.5`, press **Enter**, and click near the street side of the lot.
3. Select the new spot from **Features**, rename it `Street tie-in`, and set its single vertex to **X = 44.5, Y = 0, Z = 99.5**.
4. Choose **Spot** again, set **Drawing elevation** to `103.5`, and place another point.
5. Select it, rename it `Front threshold`, and set **X = 44.5, Y = 39, Z = 103.5**.

Each click with **Spot** creates a separate feature. Its plan label displays its elevation; its descriptive name is available in **Properties** and **Features**.

## 7. Draw lines and make connections

### Make a straight line or a continuous path

1. Choose **Polyline** (`L`).
2. Set **Segment type** to **Line**, set **Drawing elevation**, and press **Enter**.
3. Click a start point and an end point for one straight segment. Click more points to add connected segments within the same feature.
4. Press **Enter** or click **Finish line**. Double-click can also finish a line.

A polyline needs at least two distinct endpoint vertices. Finishing leaves the tool active so you can start another line. Switching drawing tools or pressing **Esc** discards the unfinished draft; finish it first if you want to keep it. Changing only **Segment type** between Line and Arc keeps completed draft segments.

### Practice: connect the street to the threshold

Draw a **Polyline** with three approximate points and finish it. Select the resulting **Line 1**, rename it `Driveway centerline`, and edit its vertices:

| Vertex |    X |   Y |     Z |
| ------ | ---: | --: | ----: |
| 1      | 44.5 |   0 |  99.5 |
| 2      | 44.5 |  20 | 101.5 |
| 3      | 44.5 |  39 | 103.5 |

Its first and last vertices now exactly match the two spot elevations. This line has changing elevations; use a straight-segment **Polyline** for that purpose. A **Contour**, or any feature containing an arc, keeps every vertex at the same Z.

### Make two separate lines meet exactly

1. Select the first line and expand **Vertex coordinates**.
2. Read the X, Y, and Z of the endpoint you want to connect to. For the driveway above, vertex 3 is `(44.5, 39, 103.5)`.
3. Draw and finish a second polyline.
4. Select the second line and give its starting vertex those same three values. Set its remaining vertices where you want the line to go.

Matching X/Y makes lines meet in plan. Matching Z as well makes them meet at the same elevation. Merely crossing two lines on screen does not create a vertex at their intersection.

The features remain separate objects. Moving or changing one does not update the other or the spot elevation. Rev 0 has no automatic endpoint snap, join, trim, extend, or intersection tool. For a path you want to move as one object, draw all its segments as one polyline from the start.

## 8. Draw contours

1. Choose **Contour** (`C`).
2. Choose **Line** under **Segment type**, set **Drawing elevation** to `101`, and press **Enter**.
3. Click several points across the lot to trace a contour, then press **Enter** or click **Finish line**.
4. With no feature selected, use the `+ 1 ft` button in the right panel to set the next drawing elevation to `102`.
5. Draw and finish another contour.

**Contour step** controls the increment used by the plus/minus buttons. It does not generate intermediate contours or move existing ones. Change it in the drawing settings when nothing is selected.

To revise an existing contour, select it and change **Elevation**. All its vertices move to that Z. Editing a contour vertex's individual Z also changes every vertex's Z so the feature remains a constant-elevation contour. Changing the tool's **Drawing elevation** only affects new drawing work.

Contours and polylines finish as open objects. Boundaries and building outlines are closed automatically. Rev 0 has no close/open toggle for a finished feature.

## 9. Draw and edit circular curves

### Draw a three-point arc

1. Choose **Polyline** (`L`) or **Contour** (`C`). Polygon **Boundary** supports the same segment controls.
2. In the right panel, choose **Arc (3 points)** under **Segment type**.
3. Set **Drawing elevation** to `102` and press **Enter**.
4. Click the arc's **start**, a **point on the curve**, and its **endpoint**, in that order. The preview shows the curve before the last click.
5. Press **Enter** or click **Finish line** to keep the feature.

For a practice semicircle, use these plan positions:

| Pick |   X |   Y | Meaning                                 |
| ---- | --: | --: | --------------------------------------- |
| 1    |  10 |  60 | Start of the arc                        |
| 2    |  30 |  80 | A point on the arc, above the endpoints |
| 3    |  50 |  60 | End of the arc                          |

The second pick is on the curve; it is not the circle center. The saved arc has two endpoint vertices. Its through-point is used to determine the circular shape rather than becoming a third endpoint.

To make the result exact after approximate mouse placement, select the finished feature, rename it `Arc practice`, and set **Vertex coordinates** to `(10, 60, 102)` and `(50, 60, 102)`. Expand **Segments and curves**, set segment 1's **Radius** to `20`, and choose **Clockwise**. The arc should bow upward/northward between the endpoints, with a plan length of approximately `62.83 ft`.

### Mix straight segments and arcs

While a path is still being drawn, switch **Segment type** to **Line** and click the next endpoint to append a straight segment. Switch back to **Arc (3 points)** to append another curve: its start is the existing endpoint, so click only a point on the new curve and its endpoint.

Changing segment mode keeps the completed draft. If you have chosen a through-point but not its endpoint, switching mode discards that pending through-point. Finish is unavailable while an arc still needs its endpoint. Complete it, or switch back to Line to discard the incomplete bend before finishing. Pressing Esc cancels the whole unfinished feature.

For a polygon boundary, Enter finishes the boundary with a straight closing edge. To make the closing edge curved, choose Arc, pick its through-point, and click the boundary's first point as the arc endpoint.

The joins share endpoint positions. Tangency is not automatically constrained, so two arcs or a line and an arc can meet at an angle.

### Edit a finished curve

Select the feature and expand **Segments and curves**. Each segment offers a **Straight / Arc** type control. Arc segments also expose **Radius** and **Direction** (**Counterclockwise / Clockwise**).

Converting a straight segment to Arc starts with a 90-degree circular bend. Change Radius to reshape it, or Direction to reverse the bend. A circular arc's radius cannot be smaller than half the distance between its endpoints. Radius edits preserve whether an existing arc takes the minor or major route around its circle. Choose Straight to remove that segment's curvature explicitly.

Curved features use one elevation throughout, so editing any vertex Z moves all their vertex elevations together. Arc conversion is unavailable on a varying-elevation path; assign a common elevation first if a planar curve is intended. Keep a sloping driveway edge as a varying-Z straight polyline when its individual elevations matter.

These are true circular arcs in the drawing and DXF, not many short line approximations. Arbitrary splines and automatic smoothing are not included. Existing/Test 2 contours are not automatically reshaped. If you need a different number of endpoint vertices, redraw the path; add/remove-vertex commands are not yet available.

## 10. Edit and organize features

Select an object on the canvas with **Select** (`V`), or choose it from **Features**. The properties panel provides:

| Control                                | Use                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------- |
| **Feature name**                       | Give the object a descriptive name; press Enter to apply                   |
| **Elevation** / **Set all elevations** | Assign one Z to every vertex; this flattens a varying-elevation line       |
| **DXF layer**                          | Choose its export layer, such as `FG-DRIVEWAY`; press Enter to apply       |
| **Vertex coordinates**                 | Edit X/Y, or Z; contour and curved-path Z edits apply to the whole feature |
| **Segments and curves**                | Convert Straight/Arc segments; edit a planar arc's radius and direction    |
| **Duplicate**                          | Make a separate, slightly offset copy with the same elevations             |
| **Delete**                             | Remove the selected feature                                                |

To move an entire feature, drag it with **Select**. This changes X/Y while preserving Z. Grid snap applies to the move offset. To move only one vertex, use **Vertex coordinates**; the small selected-vertex markers are not draggable handles.

**Length**, **Perimeter**, and **Area** report plan measurements based on X/Y and include the actual circular segments. An arc is measured along its curve, not its endpoint chord. Length is not the three-dimensional distance along a sloping line. Fit drawing and project thumbnails also account for curves extending beyond their endpoint bounds.

Use the toolbar's **Undo** and **Redo** buttons to reverse or restore feature edits. The drawing history holds up to 100 feature-edit steps and resets when you reopen a project. It does not undo view changes or drawing settings. While typing in an input field, undo applies to text editing instead.

Project-level **Duplicate**, **Rename / details**, and **Delete** are available from the three-dot menu on each dashboard project card. Project deletion asks for confirmation and keeps any separately saved `.lotgrade` files.

## 11. Save, reopen, and export

### Save an editable project

Committed changes automatically save to the local project library. You can also click **Save project**. Finish any draft first: its preview points are not saved drawing features.

To keep an editable file in a folder you choose:

1. Click the arrow beside **Save project** (**More save options**).
2. Choose **Save project as…**.
3. Save the `.lotgrade` file.

**Save project as…** writes a snapshot copy. Later edits continue saving to the local library; save another copy when you want to update your external file.

Adding an arc upgrades the project file to schema 2, which stays in place even if you later straighten the arc. This application still opens older schema 1 projects. Original Rev 0 applications reject schema 2 rather than silently opening its curves as straight segments; use the current application when sharing a curved project.

To reopen a library project, click **Projects** and select its card. To open an external `.lotgrade` file, choose **Open project file** on the dashboard, or **Open project file…** from the save-options menu. Opening a file imports a copy into the library. If its project ID is already present, LotGrade creates another entry rather than replacing the existing project.

The browser preview (`npm run dev`) stores its projects separately from the desktop app and downloads saved copies/exports through the browser. Use `.lotgrade` files to move work between them or between computers.

### Export a DXF for Civil 3D 2025

1. Finish the current draft and review the features and elevations.
2. Click **Export DXF** and choose where to save the `.dxf` file.
3. In Civil 3D 2025, use **Open** to open the DXF directly.
4. Use **Zoom Extents** to find the drawing.
5. Check drawing units, layers, closed boundaries, and known coordinates/elevations before using the geometry elsewhere. The tutorial's `Front threshold` spot should be **X = 44.5, Y = 39, Z = 103.5** in international feet.

DXF includes all committed features, including those outside the visible canvas. It preserves source coordinates, elevations, and exact circular arcs. It contains elevated drawing entities, not a generated terrain surface or live grading model. Keep the `.lotgrade` file for continued editing in LotGrade; the application does not import DXF files.

See the [Civil 3D receiving checklist](../CIVIL3D.md#receiving-checklist) for the full check. Actual receiving validation in Civil 3D 2025 remains pending; the automated DXF checks are separate evidence.

## Keyboard reference

Tool shortcuts work when you are not typing in an input field. Use **Command** on Mac and **Ctrl** on Windows for the save/edit shortcuts below.

| Shortcut                   | Action                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `V`                        | Select                                                                                         |
| `H`                        | Pan                                                                                            |
| `L`                        | Polyline                                                                                       |
| `C`                        | Contour                                                                                        |
| `B`                        | Polygon lot boundary; choose Rectangle in Properties for a rectangular boundary                |
| `R`                        | Building rectangle                                                                             |
| `P`                        | Spot elevation                                                                                 |
| `A`                        | Switch the active Polyline, Contour, or polygon Boundary to Arc mode                           |
| `S`                        | Switch the active path to Line mode                                                            |
| Hold `Space` and drag      | Temporarily pan                                                                                |
| `Enter`                    | Finish a polyline, contour, or polygon boundary; in a numeric field, commit that field instead |
| `Esc`                      | Cancel an unfinished drawing and clear the selection                                           |
| `Delete` / `Backspace`     | Delete the selected feature when outside an input field                                        |
| `Command/Ctrl + Z`         | Undo                                                                                           |
| `Command/Ctrl + Shift + Z` | Redo; `Ctrl + Y` also works on Windows                                                         |
| `Command/Ctrl + S`         | Save to the local library                                                                      |
| `Command/Ctrl + Shift + S` | Save a portable project copy                                                                   |

The desktop application's **File** menu also offers `Command/Ctrl + N` for a new project, `Command/Ctrl + O` to open a project file, and `Command/Ctrl + E` to export DXF.

## Troubleshooting

| What happened?                                                          | What to try                                                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A shortcut types into a box instead of switching tools                  | Commit the field with Enter, then click the tool you want                                                                            |
| I cannot find the drawing                                               | Click Fit drawing; pan/zoom changes the view without moving your geometry                                                            |
| A number I typed did not apply                                          | Press Enter or move focus out of the field; invalid values revert to the previous value                                              |
| I can draw only on whole-foot positions                                 | Reduce Grid spacing, turn Grid snap off, or edit exact vertex coordinates afterward                                                  |
| Two lines look connected but have different heights                     | Compare both endpoint Z values as well as X/Y in Vertex coordinates                                                                  |
| Moving one connected-looking feature leaves a gap                       | Shared coordinates are not a live connection; update the other feature's endpoint too                                                |
| Changing Drawing elevation did not change an existing line              | Select that feature and edit Elevation or its vertex Z values                                                                        |
| A contour or curved feature will not keep different endpoint elevations | Use a straight-segment Polyline for changing elevations; contours and curved features keep one Z                                     |
| A draft disappeared after switching tools                               | Unfinished drafts are cancelled when switching; finish with Enter or the Finish button first                                         |
| An overlapping feature is hard to select                                | Choose it by name in Features                                                                                                        |
| Arc conversion is disabled on a selected line                           | Its vertices have different elevations; use Set all elevations to assign one common Z if a planar curve is intended                  |
| Three arc picks will not produce a curve                                | Choose distinct start/through/end points that are not all on a straight line; follow the displayed correction message                |
| Finish is unavailable after choosing a point on the arc                 | Choose the arc endpoint, or switch to Line to discard that pending through-point before finishing                                    |
| A curve bends the wrong way                                             | Select it, open Segments and curves, and change Direction                                                                            |
| The radius I entered is too small                                       | Use at least half the endpoint-to-endpoint distance, or move the endpoints closer together                                           |
| I need a spline, joined objects, or more vertices                       | Splines and joins are not included; use circular arcs or redraw with the needed endpoint vertices                                    |
| Saving to the library failed                                            | Use Save project as… to keep a portable copy and Export DXF to keep the current valid linework, then resolve the reported save error |
