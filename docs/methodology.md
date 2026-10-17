# Methodology

How Terrae is made: its sources, the rules that decide where each boundary runs, the guarantees every release is
checked against, and the known limitations. It covers the countries and territories (ADM0), their first-level
divisions (ADM1) and their second-level divisions (ADM2). It applies to release 2026.10; the
[changelog](changelog.md) records what changes between releases.

## Scope

ADM0 is the first administrative level: countries, dependent territories and the areas that belong to neither. The
dataset covers the land surface of the whole world, Antarctica included. Territorial waters, exclusive economic
zones and maritime boundaries are outside its scope.

ADM1 is the level below: the states, provinces, regions or equivalent divisions of each unit. It is built inside
the units of the reference layer, so the divisions of a country add up to that country exactly.

ADM2 is the level below that: counties, districts, departments, prefectures or their equivalent. It is built inside
the first-level divisions, so the three levels are one geometry read at three depths: a county's edge on a state
line is that state line, and a state's edge on a border is that border.

The ADM0 sections come first; [first-level divisions](#first-level-divisions-adm1) and
[second-level divisions](#second-level-divisions-adm2) have their own.

A unit is a mapping unit, not a statement about sovereignty or recognition. Units are listed in an established
international code list or declared below as special areas; the dataset records disputes but does not resolve them.

## Sources

| Source | Used for |
|---|---|
| OpenStreetMap, planet file of 28 September 2026 (checksum in `MANIFEST.json`) | Boundary geometry: administrative boundary relations at level 2, and at levels 3–4 where a territory with its own code is mapped there; the relations of disputed and de facto areas |
| Land polygons built from the same planet file's coastline with `osmcoastline` | The land surface: what is land and what is sea |
| ISO 3166-1 | The list of units with codes; alpha-2, alpha-3 and numeric codes; English short names (given verbatim) |
| UN M49 (United Nations Statistics Division) | M49 codes and English names (given verbatim) |
| UN General Assembly and Security Council resolutions, treaties and agreements cited per area | The status of territories, where a UN position exists (see [the partition rules](#the-reference-partition)) |
| OpenStreetMap, the same planet file: administrative boundary relations at levels 3 to 8 | The geometry, local names and codes of the first-level divisions |
| ISO 3166-2 | Which divisions are a country's first level (see [first-level divisions](#first-level-divisions-adm1)) |
| Wikidata (CC0) | English names of divisions, where OpenStreetMap has none |

All geometry comes from one pinned planet file, so every boundary in a release describes the same moment. Where the
snapshot caught an object mid-edit and could not be assembled, OpenStreetMap's own next version of that object is
applied as a cited patch and listed in the changelog. Release 2026.10 carries one: a Poland–Ukraine border way
(way 223105819, version 23).

## Units and identifiers

The release has 255 units:

- **249 units with an ISO 3166-1 code**: 197 states, 51 dependent territories and Antarctica.
- **Kosovo**, with the user-assigned codes XK and XKX that the European Union, the IMF and the World Bank use. These
  codes are not assigned by ISO, and the data says so (`code_status`).
- **Five special areas** that no rule assigns to a unit: Bir Tawil (claimed by neither neighbour), the Abyei Area
  (status undetermined under the 2005 Comprehensive Peace Agreement), Akrotiri and Dhekelia (the Sovereign Base
  Areas), the Spratly Islands (several claimants, no UN position) and the undemarcated section of the Southern
  Patagonian Ice Field (provisional, pending demarcation).

Every unit has a `unit_key`: its ISO 3166-1 alpha-3 code, `XKX` for Kosovo, or `SA-` and a name for a special area.
Keys are stable across releases; a key that leaves the dataset is never reused. ISO fields are filled only where ISO
assigns the code; special areas carry no country code. Names are neutral English names. The ISO and UN names are
kept verbatim in their own fields, attributed, and are not the dataset's labels.

## The reference partition

The reference layer is a **partition** of the land: every point of land lies in exactly one unit. Where boundary
sources overlap or leave land unassigned, these rules decide, in this order:

1. **One unit per code.** Each ISO 3166-1 code is one unit, as are Kosovo and the declared special areas.
2. **A UN position, where one exists.** Where the UN General Assembly or Security Council has taken a position on a
   territory's status, the partition follows it: the Golan Heights in Syria, Crimea and the four oblasts annexed in
   2022 in Ukraine, Northern Cyprus in Cyprus, Western Sahara as its own unit, the West Bank and Gaza in Palestine.
3. **Otherwise, effective control**: the unit that administers the land. This describes administration; it is not a
   finding of sovereignty.
4. **Otherwise, a special area** with no sovereign.

Occupation, annexation and de facto administration never move land between units in the reference layer. They are
recorded in the disputes and de facto layers instead.

Contested land is assigned by named rules, each with its basis and status. The rules are published with every
release (`tables/partition_rule.csv`):

| Rule | Land | Assigned to | Basis |
|---|---|---|---|
| Area | Golan Heights | Syria | UN SC res. 497 (1981) |
| Area | Abyei Area | Abyei (special area) | 2005 Abyei Protocol; UN SC res. 1990 |
| Area | Spratly Islands | Spratly Islands (special area) | Several claimants; no UN position |
| Area | Senkaku / Diaoyu Islands | Japan | Effective control |
| Overlap | Crimea and Sevastopol (Russia / Ukraine) | Ukraine | UN GA res. 68/262 (2014) |
| Overlap | Western Sahara (Morocco / Western Sahara) | Western Sahara | UN list of Non-Self-Governing Territories |
| Overlap | Kafia Kingi (Sudan / South Sudan) | Sudan | Effective control |
| Overlap | Navassa Island (Haiti / US Minor Outlying Islands) | US Minor Outlying Islands | Effective control |
| Overlap | Morocco / Mauritania, outside Western Sahara | Mauritania | Effective control |
| Overlap | Southern Patagonian Ice Field (Argentina / Chile), within its section | Special area | Undemarcated section (1998 agreement); provisional |
| Gap | Land south of 60°S | Antarctica | Antarctic Treaty, art. VI |
| Gap | Bir Tawil | Bir Tawil (special area) | Claimed by neither Egypt nor Sudan |
| Gap | West Bank, unassigned land | Palestine | UN SC res. 2334 (2016) |
| Gap | Ilemi Triangle, unassigned land | Kenya | Effective control |
| Gap | Glorioso Islands | French Southern Territories | Effective control |

The remaining overlaps and gaps between boundary polygons are small residuals: river islands, undemarcated stretches
and digitising differences. Release 2026.10 has 689, totalling 181 km²; 58 exceed 0.01 km² and the largest is
94 km². Each is assigned automatically:

- to the unit that held the land in the previous edition, where there was one;
- otherwise to the neighbour that shares the longest edge with it;
- otherwise to the nearest unit.

Every assignment is listed with its rule and area in `tables/partition_log.csv`.

## Disputes, claims and de facto control

Three structures sit beside the partition and never change it:

- **Dispute areas** (`disputes`, 35 in this release). Each is an occupied, claimed, disputed or de facto
  administered area, or an Antarctic claim sector. Each records who administers it, its place in the partition
  (`reference_units`), the basis (a UN resolution, a control line, effective control, a treaty, or undetermined),
  its reference and source, and the OpenStreetMap relations its geometry comes from. Antarctic sectors are cut from
  Antarctica along the claimed meridians.
- **Claims** (`claims`, 54). Many-to-many: a claimant claims a whole unit or a dispute area. A claimant is a
  unit or a de facto authority.
- **De facto authorities** (`authorities`, 6). Authorities that hold territory but are not units.
  "Administered by" describes control and never implies recognition.

The **de facto layer** is derived from these. Every administered area moves from its reference unit to its
administrator, and each de facto authority becomes a feature of its own. Annexation claims without a control line
are not moved. A claimant's view (all that a claimant claims, added to it) is derived the same way on request, and
is not published as a layer.

## First-level divisions (ADM1)

ADM1 has 3,907 features in the 255 units: 3,863 divisions, 28 units
that are their own single division, and 16 named undivided areas.

### Which divisions are the first level

OpenStreetMap numbers administrative levels from 3 to 8, but the numbers mean different things in different
countries: level 4 is the four nations in the United Kingdom, the regions in France and the states in the United
States. The level is therefore never assumed. For each unit:

1. **By ISO 3166-2 code.** The divisions are the unit's boundary relations that carry the country's first-level
   ISO 3166-2 codes, at whatever level OpenStreetMap draws them. Where ISO's top tier is a grouping, as in
   Indonesia, the second tier is used. A coded division lying inside another of the set (Paris inside
   Île-de-France) is left out.
2. The set is used if it covers at least 75% of the unit's land or carries at least 80% of the country's ISO codes.
   A complete set is the first level however much land lies outside it: Greenland's five municipalities cover half
   of Greenland, and the rest is a national park that belongs to none of them.
3. **Otherwise by level**: the shallowest OpenStreetMap level that covers the unit with at least three relations.
4. **Otherwise the unit is its own division.** This is the case for Monaco, the Vatican, most small territories and
   the special areas, where OpenStreetMap has no subdivision.

One unit is set by hand, with the reason published (`tables/overrides.csv`): Palestine's divisions are the West
Bank and the Gaza Strip, because OpenStreetMap maps only five of the sixteen governorates.

Four rules complete a set:

- **A code carried twice.** Where two relations carry the same code, the one at the country's usual level is kept.
- **Divisions newer than the ISO list.** A relation at the same level whose land is at least half uncovered is
  added: Mali's 2023 regions, Ethiopia's new regional states, Algeria's newest provinces. Such a division has no ISO
  code, or one that OpenStreetMap carries and the list does not yet (`iso_3166_2_status`).
- **Divisions that cross a unit's edge.** The reference partition does not always follow OpenStreetMap's country
  lines. A division of a neighbouring unit that carries this unit's country code serves both, each side with its
  own land: the Laâyoune-Sakia El Hamra region lies partly in Morocco and partly in Western Sahara.
- **De facto authorities.** Divisions created by a de facto authority are not divisions of the unit in the
  reference layer, and are never added.

### Cutting the land

The divisions of a unit are cut from that unit's own land, never from the land of another. Their boundaries and
the unit's outline are noded together and each resulting face is given to the division whose polygon holds it. The
divisions of a unit therefore tile it exactly, and neighbouring divisions share identical edges.

Land that two divisions' polygons both cover goes to the ISO-coded division over an uncoded one, otherwise to the
division that holds more of the land around it. In release 2026.10 this is 141 km² in the whole world.

### Land in no division

Some land lies in no division of its unit. It is decided in this order:

1. **Named rules**, each with its basis and published with the release (`tables/area_rules.csv`). A rule either
   makes the land a named **undivided area** or assigns it to a division:

   | Kind | What | In release 2026.10 |
   |---|---|---|
   | `water` | A lake that OpenStreetMap draws outside every division. No source divides it, so it is not divided | Lake Victoria, Lake Tanganyika (Tanzania and Burundi), Lake Malawi, Lake Rukwa, Lake Eyasi, Lake Manyara, Laguna Merín, the Dead Sea, Lake Skadar |
   | `unorganised` | Land outside every division by law | The Northeast Greenland National Park; the Outer Islands of Seychelles; New Zealand's Area Outside Territorial Authority (the Kermadec and subantarctic islands) |
   | `de_facto` | Land administered by a de facto authority, where OpenStreetMap maps only that authority's divisions | Northern Cyprus, South Ossetia, Sahil (Somaliland) |
   | assigned | Land a division's relation omits, but which a source places in it | The Golan Heights in Quneitra Governorate; Kafia Kingi in South Darfur; the Ilemi Triangle in Turkana County; five districts of Baku |

2. **One neighbouring division.** Land that touches one division only, its other edges being the unit's own border
   or coast, belongs to that division. No line needs to be drawn.
3. **Islets** that touch no division go to the nearest one.
4. **Slivers** along borders and coasts go, piece by piece, to the division that shares the longest edge.

No boundary is ever invented: where no source divides land, it stays undivided and is named.

### Names and codes

- `name` is the local name from OpenStreetMap.
- `name_en` is OpenStreetMap's English name; where it has none, the English label of the division's Wikidata item;
  where there is none either, the local name. `name_en_source` says which.
- `iso_3166_2` is the code OpenStreetMap carries. Of the 3,863 divisions, 3,550 have one.
  A division without a code is not a lesser division: its country may have none in ISO 3166-2, or it may be newer
  than the list.
- `adm1_id` identifies a feature: its OpenStreetMap relation (`r` and the relation number), `u-` and the unit key
  for a unit that is its own division, or `x-` and a name for an undivided area.

## Second-level divisions (ADM2)

ADM2 has 50,231 features: 48,689 divisions in 160 units, 1,385
first-level divisions that have no second level and are carried as one feature each, and 157 undivided
areas. Every feature lies in exactly one first-level division, and the features of a first-level division tile it
exactly. The layer covers the whole world.

### Which divisions are the second level

The second level is harder to find than the first: ISO 3166-2 codes few second levels, and OpenStreetMap's
`admin_level` numbers mean different things from country to country, and sometimes inside one. The level is
therefore measured against the first-level divisions already built:

1. **Each relation belongs to one first-level division**: the one that holds most of its land.
2. **The country's level** is the shallowest OpenStreetMap level, deeper than its first level, that divides the
   country: the first-level divisions it covers (at least 75% of each) hold at least 75% of the country's land, and it
   has at least twice as many relations as there are first-level divisions. Germany's second level is the Kreis
   (level 6), not the Regierungsbezirk (level 5), which only four Länder have.
3. **A first-level division the country's level does not reach** takes its own shallowest level that covers it:
   Northern Ireland's districts are level 7 where Great Britain's counties and council areas are level 6; Beijing has
   districts and no prefectures. With no such level it has no second level, and is carried whole: Berlin, Ceuta, the
   District of Columbia.
4. **A country no level divides** is treated the same way, division by division, but only if the first-level
   divisions that then have a second level hold at least 75% of its land. Otherwise the source does not divide the
   country, a map of it would show only where OpenStreetMap happens to be complete, and the country has no second
   level in this release: 17 units, from Angola (8% of its land) to Paraguay and Western Sahara (73%).

In 50 more units that have first-level divisions, OpenStreetMap maps no tier below them at all. Many are small states
that have none (Malta, Andorra, the Bahamas); others are not mapped (Egypt, Libya, Chad). All 67 are listed, each with
its measure, in `tables/no_second_level.csv`.

Where the measured level is not an administrative tier, the level is set by hand and the reason published
(`tables/overrides.csv`). In release 2026.10:

| Where | Second level | Why |
|---|---|---|
| Brazil | municípios (level 8) | Levels 5 and 6 are IBGE's intermediate and immediate geographic regions: statistical, without government |
| Finland | municipalities (level 8) | Level 7 is the sub-regions, a statistical grouping no longer in use |
| Canada | level 6, else each province's own | Level 5 mixes real divisions with informal regions |
| Palestine | the Gaza Strip's governorates only | The West Bank's level 6 is the Oslo areas A, B and C: control zones, not divisions |
| United Arab Emirates | Abu Dhabi's three regions only | Level 8 is communities and neighbourhoods |
| Bosnia and Herzegovina | the Federation's cantons only | Republika Srpska has no tier between the entity and its municipalities |
| North Macedonia | none | Level 8 below the municipalities is settlements |
| Newfoundland and Labrador, Zagreb, Beirut, Islamabad | none | The level below is geographic regions, settlements, city quarters or planning zones |
| Metro Manila | its sixteen cities and one municipality | Level 5 there is four statistical districts |
| Crimea | the ten raions of Ukraine's 2020 law | The 25 earlier units are mapped at the same level on the same land |

Four rules complete a level:

- **Divisions the level lacks.** A country's second level is not always at one number: England's metropolitan
  counties and Greater London are level 5 where its other counties are level 6; Quebec's cities that act as regional
  county municipalities are only level 8; the cities a Chinese province administers directly are level 6 where
  prefectures are level 5. A relation of another level is added when at least half of its land, and at least
  1 km², lies where the level leaves a gap; of several on the same land, the shallowest. In release 2026.10,
  521 divisions.
- **Divisions in two first-level divisions.** A relation that truly lies in two (New Zealand's districts do not all
  follow regional lines) is a feature in each, with its own land in each. A sliver where two drawings of one
  boundary disagree is not: it takes at least 1 km² that the other division's own members leave uncovered.
- **De facto authorities.** As at the first level, the divisions of a de facto authority are never used; nor is a
  relation of another level used to fill land that another state administers. In Myanmar's Shan State,
  OpenStreetMap maps the counties that the Wa, Kokang and Mong La administrations have drawn for themselves at the
  level of the country's districts and on the same land: they and the relations inside them are set aside, the
  districts keep their land, and the land that only those counties cover is an undivided area.
- **Relations that are not divisions.** A relation mapped at the level of the divisions without being one is set
  aside, with the reason (`tables/overrides.csv`): England's combined authorities, which are joint bodies of
  councils and would stand in for the metropolitan districts; a military base; the areas of two land claim
  agreements in northern Canada; a relation its mapper named a duplicate.
- **A relation that is a first-level division elsewhere** (a Moroccan province that is a first-level division of
  Western Sahara) is a second-level division only where a real share of it lies, never across a border by the width
  of a line.

### Cutting the land, and land in no division

The second level is cut from the first exactly as the first is cut from the units: boundaries noded together, each
face given to the division whose polygon holds it, gaps decided by the same rules in the same order. Two things
differ.

Land that two divisions of the level both cover goes to the smaller one: a division lying inside another's polygon
is an enclave the outer one failed to cut out, such as an independent city in its county.

"Large" is relative here. Land in no division becomes an undivided area when it is at least 100 km², as at the
first level, or at least half the median area of its first-level division's own divisions (and 1 km², and not a
strip): a hole the size of a division is a division the source lacks, or a lake outside every division, not a
neighbour's land. Named rules (`tables/area_rules.csv`) say what the largest ones are: the Great Lakes waters that
OpenStreetMap draws outside every county of Michigan, Lake Titicaca, unorganized Yukon. An undivided area without
a named rule is of kind `de_facto` where the only divisions the source maps on it are a de facto authority's, and
otherwise of kind `unmapped`: the source has no division there, and whether that is law or a gap in OpenStreetMap
is not established. The 16 undivided areas of the first level are carried down as they are. Release 2026.10
adds 141 at this level: 28 of water, 5 unorganised, 4 de facto and 104 unmapped.

An island that touches no division goes to the nearest one, as at the first level; an undivided area of land counts
as a neighbour there, so that the islets off an unorganised coast stay with it.

### Names and codes

Names and codes follow the first level's rules. `adm2_id` is `r` and the relation number; a relation that is a
feature in two first-level divisions carries `@` and the second one's id; a first-level division without a second
level keeps its own id, names and code, with `kind` = `whole_parent`. Each feature names its first-level division
(`adm1_id`, `adm1_name`) and its unit.

## Geometry and topology

Each unit's land is the intersection of its boundary extent with the land polygons. Boundaries are noded together,
so that neighbouring units share identical edges, and are assembled into one coverage. Thin seams, degenerate
rings and fragments under 100 m² that this leaves are cleaned.

Every release guarantees, at every level:

- **Validity.** Every polygon and line is valid under OGC Simple Features rules.
- **Partition.** No two units overlap. No land is left outside a unit, within a 10 m² tolerance per piece.
- **Shared edges.** Neighbouring units share identical borders, vertex for vertex.
- **Consistent layers.** Dispute areas and de facto features lie exactly on the reference units' edges. No two de
  facto features overlap.
- **Lines are polygon edges.** Each line layer consists of its polygon layer's own edges, and each feature's lines
  add up to its perimeter.
- **Divisions fit their parent.** The first-level divisions of a unit cover it without gap or overlap, and their
  outer edge is the unit's own; the second-level divisions of a first-level division do the same; at every level.

Coordinates are WGS 84 longitude and latitude (EPSG:4326). Features that cross the antimeridian are split along it,
as in the source, and lines are not drawn along the antimeridian or the South Pole edge of Antarctica.

## Levels of detail

| Level | Simplification | Suited to |
|---|---|---|
| `native` | None: OpenStreetMap's own vertices | Analysis, large-scale maps |
| `high` | About 15 m | Maps to about 1:100,000 |
| `medium` | About 150 m | Maps to about 1:1,000,000 |
| `low` | About 1,500 m | World and continental maps, the web |

Release 2026.10 publishes `medium` and `low` openly. `high` and `native` are built and checked in exactly the
same way and are not part of the open release.

The three simplified levels are generated from `native`, never edited separately:

1. The world is cut into 2° cells. In each cell, the boundaries of the deepest divisions (whose outer edges are the
   boundaries of the first-level divisions, of the units and the coastlines), dispute boundaries and the cell's
   rectangle are noded together into faces.
2. The faces are simplified together, cell by cell, with topology-preserving coverage simplification (GEOS). The
   cell rectangle is held fixed, so cells join exactly, and each edge is simplified once for every feature that
   uses it. Coasts are simplified with the sea, so they stay closed.
3. The tolerance is converted to degrees at each cell's latitude. It is capped at one twentieth of the square root
   of the area of the smallest unit in the cell, so small units keep their shape.
4. Units, their divisions of both levels, dispute areas, de facto features and lines are all assembled from the same
   simplified faces. A first-level division is the union of its second-level divisions' faces, and a unit the union
   of its first-level divisions', so the three levels cannot drift apart: a division's edge on a border is that
   border, at `low` as at `native`.

**One grid.** The same line reaches the build in several writings: a division's edge, its neighbour's, a dispute
area's along the same coast. They differ by the rounding of a number, and noded as they are they leave faces without
width, hairline inlets and wrong labels between them. All boundaries are therefore noded on a grid of 10⁻⁹ degrees,
about a tenth of a millimetre. OpenStreetMap's own coordinates have seven decimals and lie on that grid, so they do
not move; computed points move by less than the grid. On it the writings coincide.

Simplification can still flatten a strip that has a shape at `native`: a strip of Maryland half a metre wide runs
along Virginia's shore of the Potomac, and at `medium` it would be a second line on top of the coast. A face
flattened to no width takes its unit, its divisions and its dispute areas from the land beside it, at that level
only; so does a face that has no width at `native`, at each level again, since the land beside it can change. A division is never removed from a level by this rule.

Two rules protect small islands. Island parts below a level's minimum (1,000 m² at `medium`, 1 km² at `low`) are
dropped, but never more than 5% of a unit's area, never a unit's largest part, never a part that touches
another unit, and never the island that holds the largest part of a division of either level: every division
exists at every level. An island that simplification flattens to no width is dropped whatever its size. An
island-only unit whose area a level would change by more than 5% keeps the shape of a finer level. Both are listed per release (`tables/lvl_dropped.csv`, `tables/lvl_fallback.csv`).

The only trace of the cells is a collinear vertex wherever a line crosses a 2° grid line; it does not change any
shape.

## Lines

Each layer comes as polygons and as lines. Lines are made from the faces of the same level. Each edge is labelled
with the faces beside it, found by exact geometric containment. Edges are merged into one line per pair of sides:

- **Reference and de facto lines**: `land_boundary` between two units or features (`side_a`, `side_b`), and
  `coastline` where one side is sea.
- **Dispute lines**: the outline of each area, as `coastline`, `reference_boundary` (where the area's edge is also a
  boundary between units) or `area_boundary` (inside a unit).

- **First-level lines**: `adm1_boundary` between two divisions of one unit, `adm0_boundary` between divisions
  of two units, and `coastline`. They are the reference lines' own edges, split by division: the country borders
  and coasts of the two levels coincide.

- **Second-level lines**: `adm2_boundary` between two divisions of one first-level division, and `adm1_boundary`,
  `adm0_boundary` and `coastline` where the first-level lines run: those are the first-level lines' own edges, split
  again.

A shared border appears once in a layer: a country's lines include the borders with its neighbours, and the
neighbours' files repeat the same line with the same `line_id`.

## Validation

Each release is built from scratch and must pass these checks before it is published:

- every unit present, and no invalid geometry at any level;
- no overlaps and no gaps on land, measured against the land polygons;
- no invalid coverage edges (edges that cross or nearly coincide without being shared);
- 44 reference points (capitals, disputed towns, islands, enclaves), each in the unit its rule names;
- every dispute area inside its units, to the square metre, at every level;
- no overlap between de facto features;
- at every level, each feature's lines equal its perimeter, to a relative difference of 10⁻⁹;
- at every level, no line runs twice along a face without width;
- at `native`, each unit is the same land whether or not its divisions are built with it (area within 1 part in
  10¹²; every difference in outline explained);
- a comparison with the previous edition, unit by unit, reviewed by hand.

The first-level divisions must pass these, measured against the published units of the same level:

| Check | Requirement | Release 2026.10 |
|---|---|---|
| Structure and validity | Every feature a valid MultiPolygon in EPSG:4326, coordinates in range, no repeated vertices | 3,907 features, none invalid |
| Completeness | Every unit has its divisions; every division exists at every level | 255 units, none without |
| Fit to the unit | The divisions' areas add up to their unit's, and no two overlap | Within 1 part in 10¹³ |
| Outer edge | Every difference between a unit and the union of its divisions is thinner than the tolerance | No difference at any level |
| Artefacts | No degenerate part, sliver or detached fragment created by the build; no duplicate geometry | None |
| Attributes | Every feature named; no code or identifier twice; every undivided area has its kind and basis | None missing |

The second-level divisions must pass the same checks, measured against the published first-level divisions of the
same level:

| Check | Requirement | Release 2026.10 |
|---|---|---|
| Structure and validity | Every feature a valid MultiPolygon in EPSG:4326, coordinates in range, no repeated vertices | 50,231 features, none invalid |
| Completeness | Every first-level division has its features; every feature exists at every level | 3,907 first-level divisions, none without |
| Fit to the parent | The features' areas add up to their first-level division's, and no two overlap | Within 1 part in 10¹³ |
| Outer edge | Every difference between a first-level division and the union of its features is thinner than the tolerance | No difference at any level |
| Artefacts | No degenerate part, sliver or detached fragment created by the build; no duplicate geometry | None |
| Attributes | Every feature named; no identifier twice; every feature in one first-level division and one unit; every undivided area has its kind and basis | None missing |

**Tolerance.** The tolerance for the outer edge is 10 nanometres of width. It is the width that is measured, not
the area: the geodesic area of a zero-width difference along a border that follows a parallel can read as square
kilometres without being land. In release 2026.10 nothing is measured against it: units, first-level and
second-level divisions are assembled from the same faces, and the union of the children is the parent at every
level, with the same parts and the same holes.

**The partitions and the levels agree.** The first and second levels are first built each as a partition of its
parent, and then all three levels are assembled again from one set of faces on the grid. At `native` each division
of the assembled levels is compared with the same division of its partition: the largest difference in release
2026.10 is 35 m², for a first-level division and for a second-level one: the rounding to the grid along long
straight boundaries.

Three kinds of feature are cleaned, each listed in `tables/build_log.csv`: a detached piece that a division holds
only by a rule and that lies against another division goes to that division; so does a piece under 100 m² or
thinner than 0.5 m; where a boundary crosses an islet and each piece is that small, the islet goes whole to the
division with the larger share.

Positional accuracy is OpenStreetMap's, which varies from place to place and is not certified.

## Exceptions and limitations

Stated exceptions, each recorded in the data:

- **East Jerusalem** follows OpenStreetMap's boundary of Israel's administration, and this release has no dispute
  area for it, because no sourced line of the 1949 armistice is available in the source data.
- **The Ilemi Triangle.** The part that OpenStreetMap gives to South Sudan stays there, because the source has no
  polygon of the whole triangle. The remaining land is assigned to Kenya by effective control.
- **The Southern Patagonian Ice Field.** The undemarcated section is a provisional special area, to be revised when
  the boundary is demarcated.

- **Cyprus.** The relation carrying the code of Kyrenia District is drawn in OpenStreetMap as the northern
  authorities' district of the same extent. It is kept as Kyrenia District; the rest of the north is an undivided
  area.
- **Western Sahara.** Its divisions are the provinces of the administering power, as they are mapped. The division
  of the territory along the berm is in the de facto and disputes layers, not at the first level.
- **Lakes** that OpenStreetMap draws outside every division are undivided areas, although some countries divide
  them in law. A source that draws those lines would replace the rule.

Known limitations:

- Small divisions lose their shape at `low`, which is made for world maps: a division a few kilometres across is
  reduced to a handful of vertices. Forty-one of the 3,907 first-level features differ from their native
  area by more than 20% at `low` (Malta's local councils, the smallest municipalities of Slovenia, divisions made of
  islets), and three at `medium`. Of the 50,231 second-level features, 1,325 do at `low` (307 by more than
  half; seven towns of 0.4 to 5 km², enclaves in a rural municipality, keep under 1% of their area) and 52 at
  `medium`: the towns and villages of Saskatchewan and Alberta, the communes of Vietnam's cities, Japan's smallest
  municipalities. The tolerance follows the smallest country in each cell, not the
  smallest division: a tolerance that followed the smallest municipality would leave `low` as heavy as `medium`
  across most of Europe. For second-level work, `medium` is the level to use.
- **The second level is not one tier.** It is the first tier below the first level that the source maps as a whole:
  counties in the United States, départements in France, municipalities in Brazil, where no tier lies between state
  and município. Features of different countries are not comparable in size or in powers.
- **Countries without a second level.** 67 units that have first-level divisions have no second level in this
  release, because OpenStreetMap maps none or maps one over less than three quarters of their land. Their
  first-level divisions are carried into the second level whole, so that the level still covers the world.
  `tables/no_second_level.csv` gives the measure for each.
- **Unmapped areas.** 104 undivided areas of the second level are of kind `unmapped`: land of a divided
  first-level division that no division of the source covers. Some are law (unorganized territory), some are
  missing relations; the release does not tell them apart.
- A division's `name_en` is as good as its source: OpenStreetMap's English name, or Wikidata's label.
- The ISO 3166-2 list used to choose the first level is older than some recent reforms. Divisions it lacks are
  included by the rule above, without an ISO code.
- In `low`, three small units differ from their native area by more than 5%: Åland (−37%), Hong Kong (−8%) and Macau
  (−6%). In `medium`, Åland (−5%).
- The coastline is OpenStreetMap's: in general the mean high-water line. Inland water, including large lakes, is
  part of the land surface.
- Geodesic areas along borders that follow a parallel (Egypt–Sudan at 22°N, Canada–United States at 49°N) depend on
  vertex density, so they vary slightly between levels. Planar areas do not.

## Releases and updates

A release is named by year and month (`2026.10`) and is complete and self-contained. Each is built from one
pinned snapshot and published with a manifest, SHA-256 checksums for every file, the provenance tables and these
documents. A published release is never changed. A correction is a new release, with its changes recorded in the
[changelog](changelog.md).

`unit_key`, `area_id`, `feature_key` and `line_id` are stable across releases; a key that leaves the dataset is
never reused. An `adm1_id` is stable for as long as OpenStreetMap keeps the division's relation. Field names change only in a new major schema, announced in the changelog.

## Licence and attribution

The data is available under the [Open Database License 1.0](licence.md), because it is derived from OpenStreetMap.
The required credit is **© OpenStreetMap contributors; Terrae**. The documents and the website text are available under Creative Commons
Attribution 4.0.

## Disclaimer

Boundaries, names and designations in this dataset do not imply the expression of any opinion concerning the legal
status of any country, territory or area, or of its authorities, or concerning the delimitation of its frontiers.
The data is provided as is, without warranty of any kind.
