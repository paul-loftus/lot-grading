# Residential lot grading software — research

Research date: **October 26, 2026**. This repository contains a product and engineering research brief, not an implemented or validated grading application.

## Recommended approach

Build a **standalone, local-first desktop tool for designing residential finished-ground surfaces**, with contours generated from that surface. Give the designer a small set of meaningful controls: building pads, spot elevations, breaklines, yard slopes, swales, driveways, grading limits, and tie-ins to existing ground.

Deliver **DXF contour linework and LandXML 1.2 TIN surfaces together**. DXF satisfies the immediate need to open contours in Civil 3D; LandXML carries the terrain mesh so the receiving designer does not have to reconstruct it from contours. These are distinct deliverables, and neither preserves this application's full design history. Autodesk documents surface import in its [LandXML support reference](https://help.autodesk.com/cloudhelp/2026/ENG/Civil3D-UserGuide/files/GUID-4D10ABA5-5EA0-41A8-BB61-C3F446CE7C6B.htm).

For a Windows-first professional product, the recommended starting stack is **C# / .NET 10, WPF, and SkiaSharp for the plan canvas**, with a headless engineering core and a replaceable triangulation adapter. Start the geometry evaluation with the C++ CDT library behind a small C interface; compare its managed port before accepting native deployment complexity. This is a recommendation based on the expected Civil 3D audience, not a confirmed platform requirement. If macOS is required at launch, revisit the UI framework before implementation.

The first development milestone should be a **small, verifiable Civil 3D export experiment**, followed by one complete detached-home grading workflow. Add townhouse and multifamily workflows in stages. Keep whole-site optimization, direct DWG support, and full stormwater simulation outside the first release.

## Research map

| README | Use it to answer |
| --- | --- |
| [01 · Product and market](research/01-product-and-market/README.md) | Who is this for, what already exists, and how can it be better? |
| [02 · Grading workflows](research/02-grading-workflows/README.md) | What must the software understand about real lot grading? |
| [03 · Surface and contour engine](research/03-surface-and-contour-engine/README.md) | How should grading, triangulation, contours, drainage checks, and volumes work? |
| [04 · Civil 3D interoperability](research/04-civil3d-interoperability/README.md) | What should be imported/exported, and how should compatibility be proved? |
| [05 · Architecture and stack](research/05-architecture-and-stack/README.md) | Which languages, frameworks, modules, and application structure should be used? |
| [06 · User experience](research/06-user-experience/README.md) | How can the tool stay fast and uncluttered? |
| [07 · Data and coordinates](research/07-data-and-coordinates/README.md) | How should projects, units, elevations, references, and coordinate systems be stored? |
| [08 · Validation and testing](research/08-validation-and-testing/README.md) | How can we tell whether the product is correct and trustworthy? |
| [09 · Libraries and licensing](research/09-libraries-and-licensing/README.md) | Which dependencies are candidates, and what adoption issues matter? |
| [10 · Development roadmap](research/10-development-roadmap/README.md) | What should be built first, by whom, and with what exit criteria? |
| [11 · Risks and open questions](research/11-risks-and-open-questions/README.md) | What could invalidate the approach, and how should it be investigated? |
| [12 · Sources](research/12-sources/README.md) | Where is the primary evidence, and what could not be verified? |

Suggested first read: **01 → 02 → 04 → 05 → 10**. Use 03, 07, and 08 together when implementing the engine.

## How to interpret the findings

- **Evidence** describes a capability or limitation supported by a linked primary source. Vendor claims are identified as vendor claims; competitor products were not benchmarked.
- **Recommendation** describes the proposed product or implementation. Architecture, algorithms, workflow priorities, and acceptance targets are engineering judgments.
- **Proposed target / estimate** is a starting point for experiments, not measured product performance or a delivery commitment.
- **Open question** needs customer evidence, an engineering decision, a license review, or a real file/application test.

Working assumptions: professional civil/site designers are the initial users; US residential work is the first research context; existing survey-quality terrain and reference linework are supplied; Civil 3D remains the downstream documentation environment. Country, target versions, budget, team, platform, and initial housing type remain unconfirmed.

No Civil 3D installation, real project files, user interviews, library benchmarks, or engineering sign-off were available during this research. In particular, **compatibility is a documented route to validate, not a tested promise**. The [risk register](research/11-risks-and-open-questions/README.md) and [roadmap](research/10-development-roadmap/README.md) turn those gaps into concrete next steps.
