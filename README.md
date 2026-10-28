# LotGrade · v0

A focused **macOS and Windows desktop drawing workspace** for residential lots. Create and manage local projects, draw elevated linework, save portable project files, and export a DXF drawing for AutoCAD / Civil 3D.

The primary export target is **Civil 3D 2025**. Native Windows, Intel Mac, and Apple Silicon Mac application tests have passed; the separate receiving check in Civil 3D 2025 is still required.

## Run the desktop app

Requires Node.js **22.12 or newer** and npm. From this folder:

```sh
npm ci
npm start
```

`npm start` builds and launches the desktop application. No server, account, or Python runtime is needed to use the app. Projects are stored in the application's local user-data directory. **Save project** writes to that library; **Save project as…** writes a portable `.lotgrade` copy through a native file dialog.

For a browser development preview, run `npm run dev` and open the local address it prints. Browser projects are stored in that browser, separately from desktop projects. Use `.lotgrade` copies to move projects between environments or computers.

## What works in v0

- Project library: create, open, search, sort, rename, duplicate, delete with confirmation, and import saved project files.
- Drawing tools: polylines, constant-elevation contours, polygon/rectangular lot boundaries, building rectangles, and spot elevations.
- Editing: selection, moving features, numeric elevation/vertex editing, custom DXF layers, undo/redo, grid snapping, pan, zoom, and fit drawing.
- Local saving, portable `.lotgrade` save/open, and elevation-preserving **DXF R2013 export** for every available drawing tool.
- Explicit meters, international feet, and US survey feet; exported coordinates remain in project units with no origin shift or Z flattening.

Explore the included example from the project dashboard. It is illustrative linework, not an engineered grading design.

The matching [sample project and DXF](examples/README.md) include known coordinates and elevations for a real Civil 3D receiving check.

## Civil 3D export is a release requirement

**Export DXF** writes the current in-memory project through the same export module on both platforms. A project-library save failure does not prevent saving a portable copy or exporting valid work.

The export contract has type-level coverage for every drawing kind, frozen geometry/unit fixtures, regression tests, and an **independent ezdxf reader** that verifies fresh output. CI runs these checks and desktop workflows on macOS Apple Silicon, macOS Intel, and Windows before publishing build artifacts. Packaging also runs the export checks. See [Civil 3D import instructions and limits](docs/CIVIL3D.md) and the [development/export-change policy](docs/DEVELOPMENT.md).

These checks guard against regressions; they do not replace actual receiving tests in Civil 3D. No native Civil 3D import is claimed until that validation is recorded. DXF contains elevated drawing entities and static labels; it is not a native Civil 3D TIN or live grading model.

## Build desktop bundles

The build-time independent-reader gate requires Python 3.10+ and ezdxf. Create a local test environment first:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
```

On Windows, use `python -m venv .venv` and `.venv\Scripts\python -m pip install -r requirements-dev.txt`. The gate discovers this environment automatically; `PYTHON` can override it.

```sh
npm run package -- --platform=darwin --arch=arm64
npm run package -- --platform=darwin --arch=x64
npm run package -- --platform=win32 --arch=x64
```

Bundles appear in `release/`. On macOS, open `LotGrade.app`. On Windows, open `LotGrade.exe` from its complete application folder; do not copy the EXE by itself. V0 bundles are unsigned development builds. macOS signing/notarization and Windows installer distribution are later release tasks.

## Validate changes

```sh
npm run check
npm run test:interop
npx playwright install chromium
npm run test:e2e
```

After installing the independent reader, run `npm run setup:hooks` to require the build and DXF checks before local Git pushes. CI runs the native matrix separately. GitHub's current plan does not support required branch-protection checks on this private repository.

The end-to-end suite exercises project management, every drawing tool, editing, undo/redo, project save/open, export, and native desktop persistence/dialogs. The CI also launches each packaged executable. [V0 acceptance checklist](docs/V0-ACCEPTANCE.md) records verification scope and remaining manual checks.

## Scope and next steps

V0 is the drawing and exchange foundation. Automated grading, terrain import/triangulation, drainage validation, earthwork volumes, and LandXML surface export require subsequent engineering work. The architecture keeps the model, project persistence, drawing workspace, and CAD exporter separate so those features can grow around the protected exchange contract.

The original product and engineering research is preserved in the [research index](research/README.md), with 12 topic READMEs and primary sources. Its earlier Windows-first stack recommendation is superseded for this implementation by the explicit macOS + Windows requirement and the Electron/React/TypeScript decision in [development notes](docs/DEVELOPMENT.md).
