# Library candidates, licensing, and adoption

[Research index](../../README.md) · [Architecture](../05-architecture-and-stack/README.md) · [Sources](../12-sources/README.md)

## Selection principle

Use existing libraries for numerical predicates, triangulation, polygon operations, rendering, and file mechanics. Own the residential grading semantics, validation, workflow, and export contract. Do not build a new Delaunay triangulator merely to avoid a dependency.

The table records upstream capabilities/licenses observed during research, not a dependency lockfile or final distribution review. Pin exact versions and audit their actual shipped source and transitive components before adoption.

| Component | Intended role | Upstream licensing / evidence | Recommendation |
| --- | --- | --- | --- |
| [CDT C++](https://github.com/artem-ogre/CDT) | Constrained triangulation | MPL-2.0; upstream documents robust predicates and constrained/conforming triangulation | Primary native candidate; prove correctness on project fixtures |
| [CDT.NET](https://github.com/MichaCo/CDT.NET) | Managed alternative | MPL-2.0; C# port with documented constraint/hole handling | Compare with native candidate; do not assume maturity or performance equivalence |
| [Clipper2](https://www.angusj.com/clipper2/Docs/Overview.htm) | Polygon clipping and offsets | Boost Software License 1.0 per [upstream license](https://www.angusj.com/clipper2/Docs/License.htm) | Recommended evaluation; document integer scaling and small-feature effects |
| [SkiaSharp](https://github.com/mono/SkiaSharp) | 2D canvas | MIT project license; native/third-party notices also apply | Recommended evaluation for plan rendering |
| [IxMilia.Dxf](https://github.com/ixmilia/dxf) | DXF reader/writer | MIT; upstream identifies AutoCAD compatibility caveats and entity limitations | Candidate for required subset, validated in receiving applications |
| [OSQP](https://osqp.org/docs/) | Optional fixed-topology convex QP | Apache-2.0 | Evaluate after explicit grading; audit selected algebra backend and bindings |
| [CGAL](https://www.cgal.org/license.html) | Alternative geometry toolkit | Package-specific GPL/LGPL and commercial options | Strong technical alternative; select packages and distribution model deliberately |
| [Triangle](https://www.cs.cmu.edu/~quake/triangle.html) | Alternative mesher/reference | Author states commercial inclusion requires a license | Do not assume it is permissively licensed because it is downloadable |
| [ODA Drawings SDK](https://www.opendesign.com/products/drawings) | Optional DWG drawing support | Commercial terms require direct evaluation | Defer unless input friction justifies it |
| [ODA Civil SDK](https://www.opendesign.com/products/civil) | Optional native civil-object access | Upstream lists membership/SIG conditions | Evaluate separately from ordinary DWG access |
| [PROJ](https://proj.org/en/stable/faq.html) | Later CRS transformation | Library and transformation-data distribution must be audited at adoption | Avoid adding transformation scope until required; preserve source metadata now |

Do not extend a library's license statement to an unrelated port or wrapper. Every dependency and bundled native/data component needs its own provenance.

## What MPL means for the recommendation

Mozilla explains that MPL obligations operate at the covered-file level and that a larger proprietary work can include MPL-covered components. Separate original proprietary files are not automatically required to become MPL simply by linking. Distribution still requires following the license's source-availability and notice provisions for covered software. [Mozilla MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/), [license text](https://www.mozilla.org/en-US/MPL/2.0/)

Recommended practice: preserve covered files and notices, track modifications, make the exact required covered source available to recipients, and record how the shipped build maps to that source. Review the actual pinned dependency and distribution before release. A C ABI or dynamic link does not remove license obligations.

## Triangulation adoption experiment

Prepare a reproducible, shared corpus:

- Rectangular and concave sites, internal holes, and multiple disconnected grading regions.
- Dense breaklines with valid crossings, incompatible elevations handled before meshing, and very short segments.
- Nearly collinear/cocircular points, large-coordinate/local-coordinate variants, and duplicate input.
- Representative pilot meshes at multiple sizes.

For each candidate, record the exact commit/version, build flags, constraint insertion semantics, whether new vertices are generated, boundary/hole classification, error behavior, runtime/memory, maintenance evidence, and integration effort. New XY vertices require an explicit elevation rule; the triangulator cannot infer the intended ground height.

CDT has documented floating-point build constraints for its predicates; preserve upstream-required arithmetic behavior rather than enabling unsafe fast-math across the bridge. Treat any managed port's behavior as separately tested.

A candidate passes only if mandatory constraints and domain behavior hold across the corpus. Fast incorrect output is a failure. If the managed candidate passes equally well, its simpler packaging can justify preferring it.

## DXF adoption experiment

IxMilia's README notes that AutoCAD can reject files that appear plausible and gives entity/version-specific caveats. Validate at least LWPOLYLINE elevation, closure, 3D polyline vertices, layers, text, units, large coordinates, and supported DXF revisions in the actual downstream workflow. Avoid advanced entities until there is a demonstrated need. [Upstream compatibility notes](https://github.com/ixmilia/dxf)

Import support requires its own tests: a writer supporting a simple line does not establish that the reader resolves arbitrary blocks, splines, transforms, proxies, or reference attachments correctly.

## Distribution inventory

Maintain a machine-readable inventory/SBOM with component name, version, source URL/commit, license, bundled native binaries/data, local modifications, and notice/source delivery mechanism. Include graphics libraries, font/shaping components, installer/update dependencies, and future commercial SDKs.

Pin package and native build inputs, run vulnerability checks appropriate to the stack, and test upgrades against the geometry/exchange corpus. Keep a documented replacement boundary around triangulation and DXF IO so a dependency issue does not force a domain-model rewrite.

## Cost items still unknown

This research does not establish commercial SDK quotes or project pricing. Budget for Civil 3D test access, Windows test machines, signing certificates, distribution/update infrastructure, dependency maintenance, and practicing-engineer review. Obtain vendor terms only after defining required platforms, versions, entities, redistribution, and support. Open-source license suitability does not by itself establish a zero-maintenance integration.
