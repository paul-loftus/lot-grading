# Architecture and programming stack

[Research index](../../README.md) · [Libraries](../09-libraries-and-licensing/README.md) · [Roadmap](../10-development-roadmap/README.md)

## Recommended implementation

Use a **modular desktop application**, with engineering logic independent of its UI. Recommended baseline, subject to the early platform/library experiments:

| Concern | Starting choice | Reason / qualification |
| --- | --- | --- |
| Application and domain | C# on .NET 10 LTS | Strong desktop tooling, typed domain model, straightforward future Civil 3D integration |
| Desktop UI | WPF, MVVM, Windows x64 first | Established numeric-entry/desktop controls; assumes a Windows-first customer base |
| Plan drawing | SkiaSharp on a dedicated canvas | Efficient batched 2D drawing; benchmark linework, labels, and hit testing |
| Surface engine | Headless C# domain/geometry services | Test and run without a window or Civil 3D |
| Constrained triangulation | C++ CDT through a thin C ABI, evaluated against CDT.NET | Native candidate has a small focused scope; managed alternative may simplify delivery |
| Plan polygon operations | Clipper2 C# | Avoid an additional native boundary for clipping/offsets |
| DXF exchange | Evaluate IxMilia.Dxf behind an adapter | Required entity subset and actual AutoCAD acceptance need proof |
| LandXML exchange | Bounded C# XML reader/writer | Implement a deliberately small, schema-validated surface subset |
| Project storage | Versioned ZIP container with JSON metadata and binary mesh buffers | Portable single-file documents; atomic saves and recoverable revisions |
| Optimization | Deferred; OSQP evaluation for a restricted fixed-topology QP | Do not make the initial product depend on global optimization |
| Research scripts | Optional Python notebooks/scripts | Use for numerical experiments and independent comparison, not a second production engine |

Microsoft documents .NET 10 as LTS through November 2028; verify the current supported patch at implementation. WPF itself runs only on Windows. [Microsoft release/support guidance](https://learn.microsoft.com/dotnet/core/releases-and-support), [WPF overview](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/overview/)

SkiaSharp provides .NET bindings for 2D graphics. Its library capabilities justify evaluation, not an unmeasured CAD-performance claim. [Official project](https://github.com/mono/SkiaSharp)

## Alternatives and decision triggers

| Approach | Strong fit | Tradeoff / decision |
| --- | --- | --- |
| Standalone C#/WPF | Windows professional workflows and future Autodesk add-in sharing | Recommended if Windows-first assumption holds |
| C# with a cross-platform UI such as Avalonia | Required macOS/Linux desktop support | Evaluate actual controls/rendering/licensing before selecting; no cross-platform guarantee established here |
| TypeScript/React + desktop shell + native/WASM engine | A team already strong in web UI; eventual browser distribution | Attractive alternative; adds native packaging or browser precision/file/performance considerations |
| Native C++/Qt | A geometry-heavy team with strong C++ experience | More UI/build expertise and toolkit licensing evaluation |
| Civil 3D add-in with a focused workspace | Customers insist on no export/import boundary | Reuses native context, but requires Civil 3D and per-build integration/support |
| Python desktop application | Fast research and numerical experiments | Possible, but not the default production recommendation for the assumed team/audience |
| Cloud-first web app | Collaboration and zero desktop installation dominate | Introduces upload/privacy/offline/backend costs; validate demand first |

Do not choose a framework simply because the research workstation is a Mac. If macOS is a launch requirement, choose that explicitly before building WPF screens. Preserve UI-independent domain and IO code regardless.

## Suggested module boundaries

```text
src/
  LotGrader.Desktop/          # windows, commands, panels, application composition
  LotGrader.Rendering/        # plan canvas, labels, display caching, hit testing
  LotGrader.Domain/           # objects, constraints, units, stable identifiers
  LotGrader.Engine/           # grading operations, elevation logic, diagnostics
  LotGrader.Geometry/         # topology, mesh queries, contouring, spatial indexes
  LotGrader.Triangulation/    # interface and selected managed/native adapter
  LotGrader.IO/               # project, LandXML, DXF, CSV, export manifests
  LotGrader.Cli/              # headless rebuild, validation, fixture export
native/
  triangulation_bridge/      # only if the C++ candidate is selected
tests/
  analytic/                  # known surfaces and expected calculations
  geometry/                  # topology and pathological-input fixtures
  exchange/                  # real and synthetic interchange fixtures
  regression/                # minimized failures and approved baselines
tools/
  research/                  # optional independent comparison scripts
```

This is a proposed future layout; these directories are not an existing implementation. Begin with a few projects/modules and split further only when responsibilities justify it. A backend service, microservices, event streaming, and a distributed solver are unnecessary for the initial local workflow.

## Core processing contract

Treat a calculation as a pure operation over an immutable snapshot:

```text
BuildRequest:
  designRevision, sourceSurfaceRevision, operationDefinitions,
  coordinateContext, precisionPolicy, engineSettings

BuildResult:
  inputRevision, meshRevision, status,
  surface, derivedOutputs, diagnostics, provenance, timings
```

Every diagnostic should identify its objects/location, measured value, criterion, severity, and possible next action. Keep diagnostic generation separate enough that a second checker can detect engine mistakes.

Undo/redo applies commands to design intent rather than storing only rendered pixels or derived triangles. Editing a pad changes a semantic object; downstream computations are derived from that change. Validate dependency cycles, such as two spots each defined relative to the other.

## Responsiveness and resource management

- Run rebuilds and import/export outside the UI thread; support cancellation and progress.
- Tag calculations with revisions and discard obsolete results that finish after a newer request.
- Debounce expensive rebuilds during dragging; provide a visibly provisional preview and an accurate commit result.
- Keep a full-rebuild path as the initial correctness reference. Add local invalidation/rebuild only after profiling identifies a need.
- Use spatial indexes for point location, segment queries, snapping, and visible-extent rendering.
- Batch draw primitives; do not create a WPF control for every triangle or contour vertex.
- Build render buffers in local/view coordinates after subtracting a double-precision origin.
- Recompute exported geometry from the accepted engineering representation, not a simplified screen buffer.

## Managed versus native triangulation experiment

CDT documents constrained triangulation, robust predicates, and domain/hole operations; its managed port advertises similar features. Those claims do not establish behavior on residential grading data. [C++ CDT](https://github.com/artem-ogre/CDT), [CDT.NET](https://github.com/MichaCo/CDT.NET)

Run both through the same adapter contract on shared fixtures. Compare constraint retention, intersection handling, hole classification, input-order sensitivity, near-degenerate cases, performance, cancellation possibilities, and packaging. Prefer the managed implementation if it meets correctness and performance needs with acceptable maintenance confidence. Otherwise keep the C++ bridge narrow.

For a native bridge: pass bulk numeric arrays, explicit lengths and ownership, versioned structures, and error codes. Catch native exceptions before returning through the C ABI, release memory with its owning allocator, and test malformed input. Do not make one interop call per vertex. If later native instability justifies process isolation, introduce a worker process then; it is not required in the first architecture.

## Deployment and maintenance

Deliver a signed installer and signed updates. Support save/recovery before upgrades, a defined minimum Windows environment, and reproducible pinned builds. Test installation on a clean Windows machine with the actual native graphics/geometry dependencies. A Mac can host research, but does not replace Windows UI and Civil 3D validation.

Local design work should remain available without an active cloud session. Separate commercial entitlement policy from project-file readability. Keep diagnostic uploads opt-in and previewable because projects can contain client locations and survey data.

If a Civil 3D add-in is later introduced, compile and test its adapter against the exact supported Autodesk runtime/SDK combinations. The standalone application's .NET target and the in-process host's requirements are separate release decisions.
