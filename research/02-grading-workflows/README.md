# Grading workflows and engineering requirements

[Research index](../../README.md) · [Engine](../03-surface-and-contour-engine/README.md) · [UX](../06-user-experience/README.md)

## Model the design controls behind the contours

A contour is an equal-elevation line derived from a surface. The application should let the designer work with both the plan and the controls that create that surface. Directly moving a contour without a defined surface-edit operation produces ambiguous terrain between lines.

Proposed standard workflow:

1. Import existing ground and reference geometry; verify units, coordinates, elevation datum, and source quality.
2. Identify the lot, grading limit, no-disturbance areas, street/curb controls, and receiving drainage locations.
3. Place the building and distinguish finished-floor, garage/threshold, pad, and adjacent finished-ground elevations.
4. Establish fixed boundary grades, yard zones, swales, driveway controls, and any known inlets.
5. Build the proposed surface; inspect contours, slopes, cross sections, and flow paths.
6. Resolve conflicts, failed tie-ins, unintended low spots, and unsupported conditions.
7. Save a design revision and export a matching surface, linework, and report.

## Essential domain objects

| Object | Required meaning |
| --- | --- |
| Existing ground (EG) | Immutable source surface with provenance and a known valid domain |
| Finished ground (FG) | Proposed ground surface generated from accepted design controls |
| Lot boundary | Ownership/context boundary; does not automatically authorize grading or drainage |
| Grading limit | Where proposed work ends; may differ from the lot boundary |
| Building footprint | Building location, entrances, and excluded ground area |
| Building pad | Defined platform surface; separate from finished floor and ground at the wall |
| Spot elevation | A fixed value, bounded value, or explicit relative reference |
| Breakline | A line that must be represented in the terrain mesh, such as a crest or swale bottom |
| Swale | A longitudinal low line plus banks/cross section, fall, and an identified outlet |
| Slope zone | A region with a target plane or permitted directional grades |
| Tie-in / daylight | Connection between design grading and a reference surface or fixed edge |
| Exclusion | A hole or protected region with explicit boundary behavior |
| Rule profile | Named, versioned project criteria and their source; applicability is explicit |

Never infer “approved outlet” from the lowest point on the property. Store the destination and the designer's intended receiving condition.

## Housing types need different controls

| Type | Important conditions | Recommended rollout |
| --- | --- | --- |
| Detached home | Pad/floor separation, garage approach, side-yard fall, rear/front drainage, street tie-in | First complete workflow |
| Townhouse row | Stepped pads, shared interfaces, connected access, end-unit drainage, consistent common controls | Next release; test the whole row context |
| Apartment / multifamily | Multiple entrances, accessible routes, common areas, parking/curb interaction, shared drainage | Later supported workflow with additional checks |
| Walkout basement or steep lot | Multiple thresholds, daylight basement, large grade changes, walls | Explicitly bounded pilot or deferred |

An apartment is generally a building/site grading problem rather than one independently gradeable dwelling unit. Do not split a shared site into isolated designs that cannot reconcile their boundaries.

## Criteria and regulatory context

These sources identify requirements the product must be able to represent; they do not establish which law applies to an unspecified project.

- A published **2023 Oregon residential code** sample includes the familiar foundation drainage criterion of a 6-inch fall in the first 10 feet and an exception addressing physical constraints. This is one jurisdiction/edition example, not a universal preset. [ICC-published code sample](https://shop.iccsafe.org/media/wysiwyg/material/5110L23-Sample.pdf)
- For applicable ADA walking surfaces, §403.3 sets running slope at no steeper than 1:20 and cross slope at no steeper than 1:48. Other route components have other requirements. [US Access Board technical standards](https://www.access-board.gov/ada/chapter/ch04/)
- Multifamily housing introduces Fair Housing Act design/accessibility considerations that should be evaluated separately from ADA scoping. [HUD Fair Housing Act Design Manual](https://www.huduser.gov/portal/publications/PDF/FAIRHOUSING/fairfull.pdf)
- Local drainage policy may address effects across property lines. Fresno County provides one official example of restrictions linked to existing drainage conditions. [County grading information](https://www.fresnocountyca.gov/Departments/Public-Works-and-Planning/divisions-of-public-works-and-planning/development-services-division/grading)

Recommendation: require a project-specific rule profile with jurisdiction, adoption/edition, author, date, units, applicability, and source link. Rules should support preferred targets and hard limits separately. Preserve the criterion and actual measured result; a label such as “2%” must not hide a computed 2.08% or 2.2%.

Ground slope, foundation exposure, allowable driveway geometry, geotechnical limits, flood criteria, easements, and discharge permissions all require project context. Store designer inputs and findings; do not claim blanket code compliance from slope tests alone.

## Checks that make the tool useful

- **Building drainage:** detect reverse slopes toward defined building-edge control bands and compare threshold/adjacent-grade relationships.
- **Swale continuity:** verify a descending longitudinal path reaches its intended outlet and that banks are modeled.
- **Tie-ins:** show maximum mismatch at grading boundaries and locations that leave the valid EG domain.
- **Access:** evaluate along-route and cross-route grades over actual geometry, including transitions and entrances.
- **Shared boundaries:** compare both sides of connected lots; shared controls should have one identity or an explicit interface contract.
- **Constructibility:** flag narrow slivers, abrupt grade changes, excessive grades, and unmodeled vertical discontinuities.
- **Earthwork:** report the calculation boundary, excluded areas, and whether quantities are finished-ground geometric volumes or adjusted excavation estimates.

Surface flow directions are geometric diagnostics. They do not establish storm capacity, ponding depth during a storm, pipe performance, infiltration, erosion performance, or downstream adequacy. Treat hydrologic/hydraulic integration as additional engineering work.

## Minimum realistic pilot inputs

Obtain an EG surface, lot and building geometry, street/curb elevations, surveyed tie-in controls, benchmark/datum information, drainage destinations, easements, and the engineer's applicable criteria. Survey points without breaklines or reliable boundaries need a separate surface-building workflow. Public elevation data may support context, but its source-specific accuracy must be assessed; USGS publishes varying accuracy information for its elevation products. [USGS 3DEP accuracy FAQ](https://www.usgs.gov/faqs/what-vertical-accuracy-3d-elevation-program-3dep-dems?items_per_page=6&page=1)
