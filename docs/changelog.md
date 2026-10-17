# Changelog

Every Terrae release, newest first. A published release is never changed; a correction is a new release.

## 2026.10

First public release.

- 255 units forming one partition of the world's land: 249 with ISO 3166-1 codes, Kosovo, and five special
  areas.
- Geometry from the OpenStreetMap planet file of 28 September 2026 at native resolution (84.7 million vertices),
  with `high`, `medium` and `low` generated from it. The open release publishes `medium` and `low`.
- Three layers at every level: `reference`, `de_facto` and `disputes` (35 areas), all sharing their edges
  exactly; 54 claims and 6 de facto authorities.
- Every layer as polygons and as lines.
- GeoPackage, GeoParquet, GeoJSON and KML; a complete package per level in every format; one file per country,
  territory and dispute area.
- **First-level divisions (ADM1)**: 3,863 divisions in the 255 units, chosen by ISO 3166-2 code
  where OpenStreetMap carries it; 28 units that are their own division; 16 named
  undivided areas for land in no division. They tile the units exactly at every level, as polygons and as lines,
  in the same four formats, with one file per country.
- **Second-level divisions (ADM2)**: 48,689 divisions in 160 units, the tier that divides
  each country's first level in OpenStreetMap, measured country by country; 1,385 first-level divisions
  without a second level and 157 undivided areas complete the layer, which covers the whole world. They
  tile the first-level divisions exactly at every level.
- One cited patch to the source: OpenStreetMap's own version 23 of way 223105819, a Poland–Ukraine border way that
  the snapshot caught mid-edit.
