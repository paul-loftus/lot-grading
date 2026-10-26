# Data model, coordinates, and project persistence

[Research index](../../README.md) · [Engine](../03-surface-and-contour-engine/README.md) · [Exchange](../04-civil3d-interoperability/README.md)

## Coordinate contract

Use an explicitly defined projected or local engineering coordinate system. Store engineering values in **double precision**, with canonical computation in meters and an explicit conversion back to source/output units. Preserve original source metadata and checksums; never overwrite a source file during normalization.

Keep these concepts separate:

| Field | Purpose |
| --- | --- |
| Horizontal CRS | Projection, reference frame/datum, zone, axes, and units |
| Vertical reference | Named vertical datum, ellipsoidal height, or documented local benchmark |
| Horizontal / vertical units | Explicit independent unit factors, including mixed-unit inputs |
| Coordinate epoch | Stored where applicable to the supplied reference system |
| Grid-to-ground context | Whether coordinates/distances use a project ground adjustment or grid convention |
| Local computational origin | Reversible translation for numerical/rendering convenience |
| Display units and rounding | User presentation; independent of stored precision |
| Output coordinate context | Exact export units, origin, axes, and any approved transformation |

An EPSG identifier alone is not a complete description of a local site calibration or a vertical benchmark. Unknown metadata should remain explicitly unknown; do not invent a datum.

## Axis order and conversions

Use internal **X=Easting, Y=Northing, Z=Elevation** in the chosen engineering frame. At the LandXML boundary, explicitly serialize **Northing, Easting, Level**. Do not spread axis swaps across unrelated functions.

If future CRS transformation is required, evaluate PROJ with pinned data and operations. PROJ follows authority-defined axis ordering and recommends richer CRS descriptions such as WKT2; test adapters rather than assuming every EPSG tuple is E,N. [PROJ FAQ](https://proj.org/en/stable/faq.html)

Assigning a CRS label and transforming coordinate values are different operations. The first release should preserve a single agreed project frame and perform explicit unit conversions; mixed-CRS data should be rejected or transformed through a separately verified workflow. Vertical transformations require their own supported operation and sometimes grid resources; horizontal reprojection alone does not establish correct ground elevations.

Support both foot definitions for legacy data:

```text
international foot = 0.3048 meters exactly
US survey foot     = 1200 / 3937 meters exactly
```

NIST documents the definitions and deprecation of the US survey foot for new applications after 2022, while identifying legacy use. Do not reinterpret existing survey-foot coordinates as international feet merely because the older unit is deprecated. [NIST conversion factors](https://www.nist.gov/pml/us-surveyfoot/revised-unit-conversion-factors), [NIST survey-foot guidance](https://www.nist.gov/pml/us-surveyfoot)

Illustration: at a coordinate of 2,000,000 feet, choosing the other factor changes the converted coordinate by approximately 1.22 meters. This is a unit-conversion example, not a survey datum transformation.

## Precision policy

Choose separate documented tolerances. Initial experiment values might include XY/Z comparison tolerances around **0.001 m** for supported engineering fixtures, with finer computational/stitching tolerances. These are proposed software targets, not universal design requirements or input accuracy claims. Determine safe values using actual geometry and the required deliverables.

Subtract the local origin in double precision before building single-precision render buffers. Never convert global coordinates to float first. In binary mesh data, specify floating type, endianness, index width, and array sizes. JSON double values should round-trip without precision loss; use invariant numeric formatting for every exchange writer.

Do not silently snap survey observations or fixed design controls to a display grid. Any import cleanup/merge should produce a report and preserve enough provenance to inspect the change.

## Proposed core model

```text
Project
  id, schemaVersion, coordinateContext, precisionPolicy
  ruleProfiles[], sourceReferences[], designRevisions[]

SourceReference
  id, originalFilename, contentHash, importSettings
  coordinateContext, timestamp, validityDomain, qualityNotes

DesignObject
  id, kind, geometry, elevationDefinition, parameters
  sourceReferences[], dependencies[], revision

Constraint
  id, affectedObjects[], type, valueOrBounds, units
  hardOrPreferred, applicability, criterionSource

SurfaceSnapshot
  id, inputRevision, vertices[], faces[], boundaries[], holes[]
  constraintEdgeMap, status, engineVersion, buildSettings

Diagnostic
  id, revision, severity, code, geometryOrLocation
  contributingObjects[], measuredValue, criterion, resolutionState

ExportRecord
  id, projectRevision, surfaceRevision, outputFilesAndHashes
  coordinateContext, exportProfile, timestamp, findingsSummary
```

This is a conceptual model, not a finalized serialization schema. Stable IDs must survive edits; generated mesh indices are not suitable identities for long-lived building or swale objects.

Store references such as “garage threshold = finished floor minus 0.10 m” as relations with units and source IDs. Resolve them into numeric values for a build. Detect cycles and missing references before computation.

## Separate surfaces and ownership

Keep EG immutable and FG design intent editable. An FG surface may describe a changed area only or a combined EG+FG result; name the chosen scope explicitly. Do not combine a new FG area with unrelated source faces and accidentally create duplicate/overlapping terrain.

Store building footprints, pad platforms, and ground holes separately. A building exclusion from the ground display does not by itself define earthwork under the building. Quantities require an explicit calculation boundary and treatment of pads/excavation.

For townhouse/shared-lot use, introduce a shared control object or a versioned boundary agreement with referenced geometry/elevations. Repeated independent copies of one edge will drift during revisions.

## Proposed native project container

```text
example.lotgrade                # proposed extension; not an established format
  manifest.json                # schema, project ID, coordinates, checksums
  design.json                  # semantic objects, constraints, source references
  rules.json                   # criteria versions and applicability
  surfaces/eg.mesh             # normalized source mesh with domain
  surfaces/fg.mesh             # optional accepted derived snapshot
  sources/                    # optional embedded permitted originals
  reports/                    # optional findings and export history
```

Use atomic save to a temporary file followed by replacement, with backup/recovery and an exclusive-writer policy. Include bounded autosave history. Project migrations should write a new version or backup and never silently discard unknown fields or unsupported object types.

Cached FG geometry is useful for fast reopening, but it must be tagged with the exact engine/settings/input revision. Rebuild or mark it stale if those do not match. A cache is not an independent source of truth.

## File and data hygiene

Use XML parsers with external entity/network resolution disabled and explicit size/depth limits. Limit ZIP entry size/count and reject path traversal. Restrict DXF/CSV import scope and report malformed or unsupported content. Check finite coordinates, resource budgets, and index bounds before native calls.

Keep client documents local by default. An optional diagnostic bundle should preview its contents and permit removal of source data. Avoid uploading lot coordinates or drawings merely to collect a crash report.
