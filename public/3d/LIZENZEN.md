# Herkunft und Lizenzen der 3D-Assets

Alle Dateien in diesem Ordner stammen von **Poly Haven** (https://polyhaven.com)
und stehen unter **CC0 1.0** (gemeinfrei, keine Namensnennung nötig).
Sie wurden für das Web verkleinert und neu komprimiert.

## Umgebungen (`env/`)

| Datei-Präfix | Poly-Haven-HDRI | Inhalt |
|---|---|---|
| `alpenwiese` | alps_field | Bergwiese |
| `sommerwiese` | meadow_2 | Wiese mit Bäumen |
| `waldbach` | mossy_forest | Bach im Moos-Wald |
| `seeufer` | lakeside | Seeufer |
| `strand` | secluded_beach | Sandstrand |
| `abendfeld` | sunset_meadow_path | Feldweg am Abend |
| `atelier` | studio_country_hall | nur Licht (gebauter Raum) |
| `wohnzimmer` | lythwood_room | nur Licht (gebauter Raum) |
| `salon` | combination_room | nur Licht (gebauter Raum) |
| `raum` | studio_small_03 | nur Licht (heller Raum) |

Je Umgebung: `_2k.jpg` (Handy) und `_4k.jpg` (Desktop) als tonegemapptes
Panorama (AgX) für den bodenprojizierten Hintergrund, `_light.hdr` (512 × 256)
als Umgebungslicht.

## Möbel (`moebel/`)

| Datei | Poly-Haven-Modell | Anpassung |
|---|---|---|
| `picknicktisch.glb` | wooden_picnic_table | – |
| `tisch-hell.glb` | wooden_table_02 | – |
| `stuhl-weiss.glb` | painted_wooden_chair_01 | – |
| `esstisch.glb` | dining_table | ohne Tischläufer |
| `stuhl-leder.glb` | dining_chair_02 | – |
| `sessel-gruen.glb` | GreenChair_01 | – |

| `raum-wohnzimmer.glb` | sofa_03, throw_pillows_01, wooden_bookshelf_worn, calathea_orbifolia_01, side_table_01, ceramic_vase_01, hanging_picture_frame_01, modern_ceiling_lamp_01, wicker_basket_01 | teils vereinfacht |
| `raum-atelier.glb` | painted_wooden_shelves, anthurium_botany_01, calathea_orbifolia_01, standing_picture_frame_01, hanging_picture_frame_02, wicker_basket_01, Sofa_01, side_table_01 | teils vereinfacht |
| `raum-salon.glb` | Chandelier_02, ornate_mirror_01, ClassicConsole_01, Sofa_01, ceramic_vase_01, hanging_picture_frame_02, calathea_orbifolia_01 | teils vereinfacht |
| `natur.glb` | rock_moss_set_01, fern_02, shrub_02, shrub_03, tree_stump_01, rock_07, shrub_sorrel_01 | Auswahl, vereinfacht |

Die Sammlungen (`raum-*`, `natur`) haben Texturen mit 512 px. Gras ist prozedural (eigene Halme).

glTF (1k-Texturen) zu GLB gepackt, Texturen als JPEG neu komprimiert (glTF-Transform).

## Texturen (`tex/`)

| Datei-Präfix | Poly-Haven-Textur | Anpassung |
|---|---|---|
| `ahorn` | white_maple_veneer | – |
| `eiche` | oak_veneer_01 | – |
| `kirsche` | cherry_veneer | – |
| `nussbaum` | oak_veneer_01 | dunkel gebeizt (Farbkorrektur) |
| `filz` | polar_fleece | Graustufen, im Browser eingefärbt |
| `leinen` | rough_linen | Graustufen, im Browser eingefärbt |
| `figur` | white_maple_veneer | aufgehellte Maserung, mit Figurenfarbe eingefärbt |
| `raum/dielen` | wood_floor | – |
| `raum/dielen-hell` | white_planks_clean | – |
| `raum/parkett` | herringbone_parquet | – |
| `raum/putz`, `raum/putz-beige` | white_plaster_rough_01, beige_wall_001 | Graustufen, im Browser eingefärbt |
| `raum/teppich` | curly_teddy_natural | – |
| `boden/gras` | leafy_grass | – |
| `boden/waldboden` | forest_leaves_02 | – |
| `boden/ufer` | rocky_trail | – |
| `boden/sand` | coast_sand_01 | – |

`_orm.jpg`: Rot = Umgebungsverdeckung (AO), Grün = Rauheit.

Die Vorschaubilder in `thumbs/` sind Ausschnitte daraus (Räume: Bildschirmfotos der 3D-Ansicht).
Aufbereitet mit Blender (HDR → JPG/HDR) und Python/Pillow.
