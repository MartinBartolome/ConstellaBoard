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
| `raum` | studio_small_03 | nur Licht (heller Raum) |

Je Umgebung: `_2k.jpg` (Handy) und `_4k.jpg` (Desktop) als tonegemapptes
Panorama (AgX) für den bodenprojizierten Hintergrund, `_light.hdr` (512 × 256)
als Umgebungslicht.

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

`_orm.jpg`: Rot = Umgebungsverdeckung (AO), Grün = Rauheit.

Die Vorschaubilder in `thumbs/` sind Ausschnitte daraus.
Aufbereitet mit Blender (HDR → JPG/HDR) und Python/Pillow.
