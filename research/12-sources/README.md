# Sources and evidence register

[Research index](../../README.md) · [Risks and open questions](../11-risks-and-open-questions/README.md)

Research reviewed online on **October 26, 2026**. Sources below are primary documentation, upstream projects, research authors, public agencies, or official vendor product descriptions. No competitor product was operated or benchmarked. Older references are identified where version matters.

The other READMEs place links near supported claims. This register provides a reusable lookup and identifies evidence limits. Product choices, formulas/algorithm proposals, targets, and estimates are recommendations or engineering analysis rather than claims that a vendor has validated this design.

## Autodesk: grading and exchange

| ID | Primary source | Used for / qualification |
| --- | --- | --- |
| A01 | [Civil 3D 2026: supported LandXML data](https://help.autodesk.com/cloudhelp/2026/ENG/Civil3D-UserGuide/files/GUID-4D10ABA5-5EA0-41A8-BB61-C3F446CE7C6B.htm) | Supported exchange data and N,E,Z coordinate convention |
| A02 | [Civil 3D 2026: LandXML import settings](https://help.autodesk.com/cloudhelp/2026/ENG/Civil3D-UserGuide/files/GUID-FB6846E6-9E14-4C2D-B06A-E96FBD1399DB.htm) | Quick/Full Import and source-data controls; not an application test |
| A03 | [Autodesk Grading Optimization overview](https://help.autodesk.com/cloudhelp/ENU/C3DGO-Help/files/about.html) | Existing constraint/optimization workflow and return to Civil 3D |
| A04 | [Civil 3D 2024: about grading](https://help.autodesk.com/cloudhelp/2024/ENU/Civil3D-UserGuide/files/GUID-3E75D600-B442-4C78-8DCC-C649E1ED1F87.htm) | Existing grading workflow context; older release reference |
| A05 | [Autodesk DXF: LWPOLYLINE](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm) | Plan vertex/elevation/extrusion representation |
| A06 | [Imported LandXML surface boundary issue](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Imported-surface-through-xml-show-triangles-outside-of-the-boundary-or-border-in-Civil-3D.html) | Documented edge case; not proof every import has the issue |
| A07 | [Duplicate and crossing feature lines](https://help.autodesk.com/cloudhelp/2022/ENU/Civil3D-BestPractices/files/GUID-6CEA853D-6F56-4265-A343-092B3F02C4D2.htm) | Site interaction risk; older official best-practice reference |
| A08 | [TinSurface.CreateFromLandXML](https://help.autodesk.com/cloudhelp/2022/ENU/Civil3D-API/files/html/e3344531-c49f-503d-1a47-d26ff98faf21.htm) | API existence; verify against selected current SDK/build |
| A09 | [Civil 3D .NET 10 transition notice](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Civil-3D-Requirements-for-products-affected-by-the-Microsoft-NET-10-transition.html) | September 2026 update/runtime guidance; highly version-sensitive |
| A10 | [Civil 3D 2025 .NET Core development](https://help.autodesk.com/cloudhelp/2025/ENU/Civil3D-DevGuide/files/GUID-E6657034-71E5-4753-8AFD-139DC612B86D.htm) | Historical .NET 8 transition context; do not use alone for current runtime selection |

## Geometry and optimization

| ID | Primary source | Used for / qualification |
| --- | --- | --- |
| G01 | [CGAL 2D triangulation manual](https://doc.cgal.org/latest/Triangulation_2/index.html) | Constrained triangulation, domain representation, topology concepts |
| G02 | [Shewchuk: robust geometric predicates](https://www.cs.cmu.edu/~quake/robust.html) | Numerical-predicate failures and adaptive methods |
| G03 | [CDT upstream](https://github.com/artem-ogre/CDT) | C++ triangulation candidate, documented features/build requirements/license |
| G04 | [CDT.NET upstream](https://github.com/MichaCo/CDT.NET) | Managed alternative; not independently benchmarked |
| G05 | [Clipper2 overview](https://www.angusj.com/clipper2/Docs/Overview.htm) | Polygon operations and available implementations |
| G06 | [Clipper2 robustness](https://www.angusj.com/clipper2/Docs/Robustness.htm) | Scaling/rounding and small-feature behavior |
| G07 | [OSQP documentation](https://osqp.org/docs/) | Convex QP formulation and solver candidate |
| G08 | [OSQP status/error reference](https://osqp.org/docs/interfaces/status_values.html) | Solver-state handling, inaccurate outcomes, error interpretation |
| G09 | [GDAL contour algorithms API](https://gdal.org/en/stable/api/gdal_alg.html) | Raster contouring distinction; not a recommended TIN design kernel |

The proposed daylight construction, TIN contour pipeline, drainage diagnostics, and TIN-overlay volume calculation are engineering designs in this brief. They have not been implemented or verified here. Sources for individual numerical concepts are not certification of the combined product.

## Programming, file libraries, and licensing

| ID | Primary source | Used for / qualification |
| --- | --- | --- |
| T01 | [Microsoft .NET releases/support](https://learn.microsoft.com/dotnet/core/releases-and-support) | Current runtime lifecycle choice; verify patch at implementation |
| T02 | [Microsoft WPF overview](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/overview/) | Desktop capabilities and Windows-only scope |
| T03 | [SkiaSharp upstream](https://github.com/mono/SkiaSharp) | Graphics bindings, project license, source/notices for evaluation |
| T04 | [IxMilia.Dxf upstream](https://github.com/ixmilia/dxf) | DXF IO candidate, license and explicit AutoCAD caveats |
| L01 | [Clipper2 license](https://www.angusj.com/clipper2/Docs/License.htm) | Boost Software License 1.0 declaration |
| L02 | [CGAL licensing](https://www.cgal.org/license.html) | Package-dependent open-source and commercial model |
| L03 | [Triangle author's distribution page](https://www.cs.cmu.edu/~quake/triangle.html) | Commercial inclusion restriction; distinguish from separately released predicates |
| L04 | [Mozilla MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) | Covered-file/larger-work explanation |
| L05 | [MPL 2.0 license](https://www.mozilla.org/en-US/MPL/2.0/) | Governing license text for MPL candidates |
| L06 | [ODA Drawings SDK](https://www.opendesign.com/products/drawings) | General DWG/DGN capabilities; vendor scope, not a quote |
| L07 | [ODA Civil SDK](https://www.opendesign.com/products/civil) | Civil-object capabilities and membership/SIG conditions |

## Survey, coordinates, and engineering context

| ID | Primary source | Used for / qualification |
| --- | --- | --- |
| E01 | [PROJ FAQ](https://proj.org/en/stable/faq.html) | Axis-order and CRS-description pitfalls |
| E02 | [NIST US survey foot](https://www.nist.gov/pml/us-surveyfoot) | Deprecation and legacy context |
| E03 | [NIST revised conversion factors](https://www.nist.gov/pml/us-surveyfoot/revised-unit-conversion-factors) | Unit factors, distinct from coordinate-datum transformation |
| E04 | [US Access Board: ADA Chapter 4](https://www.access-board.gov/ada/chapter/ch04/) | Walking-surface technical slope criteria; applicability still needs scoping |
| E05 | [HUD Fair Housing Act Design Manual](https://www.huduser.gov/portal/publications/PDF/FAIRHOUSING/fairfull.pdf) | Multifamily design/accessibility context, not a project-specific determination |
| E06 | [ICC-published 2023 Oregon residential code sample](https://shop.iccsafe.org/media/wysiwyg/material/5110L23-Sample.pdf) | Foundation drainage example from a specific jurisdiction/edition |
| E07 | [Fresno County grading/drainage information](https://www.fresnocountyca.gov/Departments/Public-Works-and-Planning/divisions-of-public-works-and-planning/development-services-division/grading) | Example of local drainage considerations; not a general US rule |
| E08 | [USGS 3DEP vertical-accuracy FAQ](https://www.usgs.gov/faqs/what-vertical-accuracy-3d-elevation-program-3dep-dems?items_per_page=6&page=1) | Source/product-dependent terrain quality |

The application needs editable, traceable rule profiles. A referenced technical limit or manual does not determine adopted code, exceptions, permits, geotechnical suitability, discharge permissions, or applicability to a particular property.

## Competitor sources

| ID | Official source | Qualification |
| --- | --- | --- |
| C01 | [Bentley OpenSite+](https://www.bentley.com/products/opensite/) | Vendor feature/benefit claims; no independent timing test |
| C02 | [Carlson Precision 3D](https://www.carlsonsw.com/product/carlson-precision-3d) | Official surface-editing/contouring feature descriptions |
| C03 | [Site3D features](https://www.site3d.co.uk/features.htm) | Official grading/earthworks workflow descriptions |

Autodesk competitor references are A03–A04. Prices, license quotes, market size, and comparative performance were not established. Customer-specific scripts/templates require discovery rather than assumptions from marketing pages.

## Access limitations and evidence boundaries

- The [original LandXML 1.2 XSD endpoint](https://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd) was inaccessible through the research browser. No schema artifact was downloaded or validated. Obtain a trusted copy and verify permitted redistribution before including it in a repository/build.
- An official [ICSM structural-requirements document](https://www.icsm.gov.au/sites/default/files/ePlan-Protocol-LandXML-Structural-Requirements-v1.0.pdf) references the LandXML schema, but it concerns an ePlan profile. It is not a substitute for the terrain writer's complete XSD or Civil 3D receiving tests.
- The [2024 IRC foundations chapter](https://codes.iccsafe.org/content/IRC2024V1.1/chapter-4-foundations) appeared in search results but returned HTTP 403 when opened. This brief does not claim that its complete current R401.3 wording was directly reviewed. The cited Oregon sample is clearly labeled with its own jurisdiction/edition.
- Autodesk's .NET transition notice was available in search-indexed content; a direct browser extraction returned no body text. Recheck the notice and exact deployed runtime/SDK before compiling a companion add-in.
- Repository pages and mutable `/latest/` or `/stable/` documentation can change. At implementation, record the selected release/commit and repeat capability/license checks. No dependency was installed or pinned in this research-only repository.
- Primary-source documentation establishes published capabilities. It does not establish a working application, correct serialization, current customer standards, or engineering sign-off.

## Maintaining this research

Recheck Autodesk host/runtime/import guidance, active dependency licenses/releases, commercial SDK terms, and locally applicable engineering standards before implementation or release. Update architecture decisions when experiments provide stronger evidence. Attach fixture IDs and exact tool/application versions to compatibility and performance claims so future readers can reproduce them.
