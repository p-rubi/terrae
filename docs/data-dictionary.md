# Data dictionary

Every layer, field and file in Terrae release 2026.10: the countries and territories (ADM0), their first-level
divisions (ADM1) and the second-level divisions inside those (ADM2). How the values are made is in the
[methodology](methodology.md).

## Files

| Path | Contents |
|---|---|
| `world/terrae-adm0-2026.10-<level>-<layer>-<geometry>.<format>` | One layer at one level, whole world, as `gpkg`, `parquet`, `geojson` or `kml` |
| `packages/terrae-adm0-2026.10-<level>.gpkg` | Every layer of one level, polygons and lines, with `claims` and `authorities` |
| `packages/terrae-adm0-2026.10-<level>-<format>.zip` | The same as GeoParquet, GeoJSON or KML files, with the two tables as CSV |
| `places/<level>/<layer>/<geometry>/<key>.<format>` | One unit, de facto feature or dispute area, as `gpkg`, `geojson` or `kml` |
| `tiles/terrae-adm0-2026.10-viewer.pmtiles` | The vector tiles of the website's map (the `medium` level); not a download format |
| `tables/*.csv` | Claims, authorities and the build's provenance tables |
| `docs/*.md`, `README.md` | These documents |
| `MANIFEST.json`, `SHA256SUMS` | The release's source, file count and size; a SHA-256 checksum for every file |

The first-level divisions are a release folder of their own, `adm1/2026.10/`, with the same structure:

| Path | Contents |
|---|---|
| `world/terrae-adm1-2026.10-<level>-reference-<geometry>.<format>` | The divisions (`polygons`) or their edges (`lines`) at one level, whole world |
| `packages/terrae-adm1-2026.10-<level>.gpkg` | Polygons and lines of one level, with the table `area_rules` |
| `packages/terrae-adm1-2026.10-<level>-<format>.zip` | The same as GeoParquet, GeoJSON or KML files, with `area_rules.csv` |
| `places/<level>/reference/<geometry>/<unit_key>.<format>` | The divisions of one unit (or the lines on its divisions), as `gpkg`, `geojson` or `kml` |
| `tiles/terrae-adm1-2026.10-viewer.pmtiles` | The division boundaries of the website's map; not a download format |
| `tables/*.csv` | The named rules and the build's provenance tables |

The second-level divisions are a third folder, `adm2/2026.10/`, with the same paths (`terrae-adm2-…`): the
divisions, their edges, the divisions of one unit per file, the boundaries of the website's map, and the tables.

`<level>` is `medium` or `low`: release 2026.10 publishes these two levels (`high` and `native` are not part of the
open release; see the [methodology](methodology.md#levels-of-detail)). `<layer>` is `reference`, `de_facto` or `disputes`.
`<geometry>` is `polygons` or `lines`.

All geometry is in WGS 84 (EPSG:4326): MultiPolygon for polygons and MultiLineString for lines. GeoJSON follows RFC
7946 with seven decimals. KML holds one placemark per feature, named by its name (or `line_id`), with every field
as extended data. GeoParquet is written with zstd compression. Inside a GeoPackage the layers are named
`reference`, `de_facto`, `disputes`, `reference_lines`, `de_facto_lines` and `disputes_lines`; in an ADM1 GeoPackage,
`adm1` and `adm1_lines`; in an ADM2 GeoPackage, `adm2` and `adm2_lines`.

## reference

The units of the reference partition: one feature per unit.

| Field | Type | Meaning |
|---|---|---|
| `unit_key` | text | Stable key: the ISO 3166-1 alpha-3 code, `XKX` for Kosovo, `SA-…` for a special area |
| `name_en` | text | Neutral English name |
| `unit_kind` | text | `state`, `territory` or `special_area` |
| `special_area_kind` | text | For special areas: `antarctic_treaty_area`, `unclaimed`, `undetermined`, `sovereign_base_area` or `multi_claimed` |
| `iso_a2`, `iso_a3`, `iso_num` | text | ISO 3166-1 codes, only where ISO assigns them; empty for Kosovo and the special areas |
| `m49` | text | UN M49 code, where one exists |
| `code_a2`, `code_a3` | text | Interoperability codes: the ISO code, or a user-assigned code in established use (XK, XKX) |
| `code_status` | text | `iso_assigned`, `user_assigned_conventional` (from ISO's user-assigned range, not assigned by ISO), or empty (no code) |
| `iso_short_name` | text | ISO 3166-1 English short name, verbatim |
| `m49_name_en` | text | UN M49 English name, verbatim |
| `area_km2` | number | Geodesic area of this level's geometry |
| `vertices` | integer | Vertex count of this level's geometry |

## de_facto

The partition as administered: one feature per unit (as administered) and per de facto authority.

| Field | Type | Meaning |
|---|---|---|
| `feature_key` | text | A `unit_key` or an `authority_key` |
| `feature_kind` | text | `unit` or `authority` |
| `name_en` | text | Neutral English name |
| `area_km2` | number | Geodesic area of this level's geometry |

A unit whose whole territory is administered by others has no de facto feature. In 2026.10 that is Western
Sahara, which is divided between Morocco and the Sahrawi Arab Democratic Republic along the berm.

## disputes

Areas beside the partition, never in it: one feature per area. Areas may overlap one another; the Antarctic claims
do.

| Field | Type | Meaning |
|---|---|---|
| `area_id` | text | Stable key |
| `name_en` | text | Neutral English name |
| `area_kind` | text | `occupied`, `claimed` (an annexation claim not recognised by the UN), `disputed`, `de_facto` (held by a de facto authority) or `antarctic_claim` |
| `administered_by` | text | `unit_key` or `authority_key` of the administrator; empty when none, shared or unresolved |
| `reference_units` | text | The unit or units the partition puts the area in, comma-separated |
| `basis` | text | `un_resolution`, `control_line`, `effective_control`, `treaty` or `undetermined` |
| `basis_ref` | text | The resolution, line or treaty |
| `osm_relations` | text | The OpenStreetMap relations the geometry comes from, comma-separated (empty when derived) |
| `source`, `source_date`, `note` | text | Where the record comes from, its date, and remarks |
| `area_km2` | number | Geodesic area of this level's geometry |

## Line layers

`reference_lines` and `de_facto_lines` hold one feature per pair of sides:

| Field | Type | Meaning |
|---|---|---|
| `line_id` | text | Stable key: `land_boundary:<side_a>:<side_b>` or `coastline:<side_a>` |
| `line_kind` | text | `land_boundary` (two units or features) or `coastline` (one side is sea) |
| `side_a`, `name_a` | text | Key and name of one side; for a boundary, the key that sorts first |
| `side_b`, `name_b` | text | Key and name of the other side; empty for a coastline |
| `length_km` | number | Geodesic length |

`disputes_lines` hold one feature per area and kind of edge:

| Field | Type | Meaning |
|---|---|---|
| `line_id` | text | Stable key: `<line_kind>:<area_id>` |
| `line_kind` | text | `coastline`; `reference_boundary` (the edge is also a boundary between units); or `area_boundary` (the edge runs inside a unit) |
| `area_id`, `name_en` | text | The area |
| `length_km` | number | Geodesic length |

## adm1

The first-level divisions of the reference partition: one feature per division, per unit that is its own division,
and per undivided area. The features of a unit tile that unit exactly.

| Field | Type | Meaning |
|---|---|---|
| `adm1_id` | text | Key: `r` and the OpenStreetMap relation number; `r…@<unit_key>` for a relation that also serves a neighbouring unit; `u-<unit_key>` for a unit that is its own division; `x-<unit_key>-<name>` for an undivided area |
| `unit_key`, `unit_name` | text | The unit (ADM0) the feature belongs to |
| `name` | text | Local name, from OpenStreetMap |
| `name_en` | text | English name |
| `name_en_source` | text | `osm` (OpenStreetMap's English name), `wikidata` (the Wikidata label), `local_name` (no English name: the local one) or `terrae` (a whole unit or an undivided area) |
| `kind` | text | `division`, `whole_unit` (the unit has no divisions in the source) or `undivided` (land in no division) |
| `undivided_kind` | text | For undivided areas: `water`, `unorganised` or `de_facto` |
| `iso_3166_2` | text | ISO 3166-2 code, where the division has one |
| `iso_3166_2_status` | text | `iso_list` (in the ISO 3166-2 list used) or `osm_only` (carried by OpenStreetMap, newer than that list); empty without a code |
| `osm_relation` | integer | The OpenStreetMap relation the geometry comes from |
| `osm_admin_level` | integer | Its `admin_level` in OpenStreetMap (3 to 8); the first level is not the same number in every country |
| `wikidata` | text | Wikidata item, from OpenStreetMap |
| `selection` | text | How the division was chosen: `iso_first`, `iso_second`, `level`, `override`, `level_fill`, `whole_unit` or `undivided` (see the [methodology](methodology.md#first-level-divisions-adm1)) |
| `basis` | text | For undivided areas: why the land is in no division |
| `area_km2` | number | Geodesic area of this level's geometry |
| `vertices` | integer | Vertex count of this level's geometry |

## adm1_lines

The edges of the first-level divisions: one feature per pair of sides.

| Field | Type | Meaning |
|---|---|---|
| `line_id` | text | Key: `<line_kind>:<side_a>:<side_b>` or `coastline:<side_a>` |
| `line_kind` | text | `adm1_boundary` (two divisions of one unit), `adm0_boundary` (divisions of two units: the line is also a country border) or `coastline` |
| `side_a`, `name_a`, `unit_a` | text | Key, English name and unit of one side; for a boundary, the key that sorts first |
| `side_b`, `name_b`, `unit_b` | text | The other side; empty for a coastline |
| `length_km` | number | Geodesic length |

## area_rules

The named rules of the first level: land in no division, made an undivided area or assigned to a division.

| Field | Meaning |
|---|---|
| `rule_id` | Key |
| `unit_key` | The unit |
| `action` | `undivided` or `assign` |
| `adm1_id` | The undivided area made, or the division that receives the land |
| `name_en`, `undivided_kind` | For undivided areas: the name and kind |
| `basis`, `basis_ref` | Why, and the source |
| `status` | `rule`, `owner` (a decision of the dataset's author) or `proposed` |

## adm2

The second-level divisions: one feature per division, per first-level division that has no second level, and per
undivided area. The features of an ADM1 tile it exactly; the layer covers the whole world.

| Field | Type | Meaning |
|---|---|---|
| `adm2_id` | text | Key: `r` and the OpenStreetMap relation number; `r…@<adm1_id>` for a relation that is a division of two first-level divisions (it is one feature in each), or that is also a first-level division elsewhere; the `adm1_id` itself for a first-level division without a second level; `x-<adm1_id>-<name or number>` for an undivided area |
| `adm1_id`, `adm1_name` | text | The first-level division (ADM1) the feature belongs to |
| `unit_key`, `unit_name` | text | The unit (ADM0) |
| `name` | text | Local name, from OpenStreetMap |
| `name_en` | text | English name |
| `name_en_source` | text | `osm`, `wikidata`, `local_name` or `terrae` (as in `adm1`) |
| `kind` | text | `division`; `whole_parent` (the first-level division has no second level in the source: the feature is that division, with its id, names and code); or `undivided` (land in no division) |
| `undivided_kind` | text | For undivided areas: `water`, `unorganised`, `de_facto`, or `unmapped` (the source has no division there, and the reason is not established) |
| `iso_3166_2` | text | ISO 3166-2 code, where OpenStreetMap carries one |
| `iso_3166_2_status` | text | `iso_list` or `osm_only`; empty without a code |
| `osm_relation` | integer | The OpenStreetMap relation the geometry comes from |
| `osm_admin_level` | integer | Its `admin_level` in OpenStreetMap: the second level is not the same number in every country, nor always inside one |
| `wikidata` | text | Wikidata item, from OpenStreetMap |
| `selection` | text | How the division was chosen: `unit_level` (the country's measured second level), `per_parent` (the first-level division's own), `override` (set by hand, with the reason), `level_fill` (a division of two first-level divisions), `gap_fill` (a division mapped at another level), `whole_parent` or `undivided` (see the [methodology](methodology.md#second-level-divisions-adm2)) |
| `basis` | text | For undivided areas: why the land is in no division |
| `area_km2` | number | Geodesic area of this level's geometry |
| `vertices` | integer | Vertex count of this level's geometry |

## adm2_lines

The edges of the second-level divisions: one feature per pair of sides.

| Field | Type | Meaning |
|---|---|---|
| `line_id` | text | Key: `<line_kind>:<side_a>:<side_b>` or `coastline:<side_a>` |
| `line_kind` | text | `adm2_boundary` (two divisions of one first-level division), `adm1_boundary` (divisions of two first-level divisions of one unit), `adm0_boundary` (divisions of two units: the line is also a country border) or `coastline` |
| `side_a`, `name_a`, `adm1_a`, `unit_a` | text | Key, English name, first-level division and unit of one side; for a boundary, the key that sorts first |
| `side_b`, `name_b`, `adm1_b`, `unit_b` | text | The other side; empty for a coastline |
| `length_km` | number | Geodesic length |

The table `area_rules` of the ADM2 release has the fields of the first level's, with `adm2_ids` (the undivided
areas the rule made) in place of `adm1_id`.

## claims

| Field | Meaning |
|---|---|
| `claim_id` | Key |
| `unit_key` or `area_id` | What is claimed: a whole unit, or a dispute area |
| `claimant_key` | The claimant: a `unit_key` or an `authority_key` |
| `claim_type` | `full` or `partial` |
| `source`, `note` | The source of the claim, and remarks |

## authorities

| Field | Meaning |
|---|---|
| `authority_key` | Key (`DF-…`) |
| `name_en` | Neutral English name |
| `note` | Remarks, including recognition |

## Provenance tables

| File | Contents |
|---|---|
| `partition_rule.csv` | The named rules that assign contested land, with basis, reference and status (`rule`, `owner` decision or `provisional`) |
| `partition_log.csv` | Every assignment the build made: rule, step, from and to unit, area |
| `unit_source.csv` | The OpenStreetMap objects behind each unit |
| `land_removed.csv` | Land polygons removed from the land surface, with the reason |
| `lvl_fallback.csv` | Island units given a finer level's shape, with the area difference avoided |
| `lvl_dropped.csv` | Island parts dropped per level, with their area |

In the ADM1 release:

| File | Contents |
|---|---|
| `area_rules.csv` | The named rules (above) |
| `selection.csv` | How each unit's first level was chosen: the method, the OpenStreetMap levels, the share of land covered, the number of ISO codes |
| `overrides.csv` | Units whose first level was set by hand, with the reason |
| `attribute_fixes.csv` | Attribute values corrected against the source, with the reason |
| `build_log.csv` | Every decision of the build, with its rule: divisions added or replaced, overlaps settled, gaps assigned, fragments cleaned |

In the ADM2 release:

| File | Contents |
|---|---|
| `area_rules.csv` | The named rules of the second level |
| `selection.csv` | For each first-level division: how its second level was chosen, the OpenStreetMap level, the number of divisions and of undivided areas |
| `no_second_level.csv` | The units without a second level in this release, with the measure behind it |
| `overrides.csv` | Levels, members and exclusions set by hand, with the reason |
| `build_log.csv` | Every decision of the build, with its rule |
