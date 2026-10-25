# Game assets

Everything in this folder is shipped with the game and served at `/assets/<path>`, e.g.
`/assets/vehicles/singles/police-car.glb`. Only browser-ready files live here: `.glb`, `.gltf` with
the `.bin` and textures it references, and UI images and fonts. Source formats (FBX, OBJ, Blend,
previews, zips) are kept in [`art-source/`](../../../../art-source) at the repo root.

## Layout

`<category>/<pack>/`. Categories follow the size catalog in `packages/shared/src/scale.ts`.
Packs from Kenney are prefixed `kenney-`; one-off models live in `<category>/singles/`.

Keep each pack's folder together: many models load textures from a path relative to themselves
(Kenney models use `Textures/colormap.png`, the Downtown kit and hairstyles use files next to them).

| Folder | Models |
| --- | ---: |
| `animals/animal-kit/` | 25 |
| `animals/animated-fish/` | 52 |
| `animals/kenney-cube-pets/` | 24 |
| `buildings/architecture-pack/` | 10 |
| `buildings/city-kit/` | 31 |
| `buildings/city-pack/` | 70 |
| `buildings/downtown-city-megakit/` | 153 |
| `buildings/interiors/` | 3 |
| `buildings/kenney-building-kit/` | 79 |
| `buildings/kenney-city-kit-commercial/` | 41 |
| `buildings/kenney-city-kit-industrial/` | 37 |
| `buildings/kenney-city-kit-suburban/` | 40 |
| `buildings/kenney-modular-buildings/` | 108 |
| `buildings/singles/` | 1 |
| `characters/base/` | 2 |
| `characters/fitness-characters/` | 4 |
| `characters/hairstyles/` | 8 |
| `characters/kenney-mini-characters/` | 26 |
| `characters/mannequin/` | 1 |
| `characters/modular-men/` | 11 |
| `characters/modular-women/` | 8 |
| `characters/singles/` | 3 |
| `food/food-kit/` | 148 |
| `food/kenney-food-kit/` | 200 |
| `food/kenney-mini-market/` | 20 |
| `furniture/coffeehouse-lounge/` | 77 |
| `furniture/house-interior/` | 58 |
| `furniture/kenney-furniture-kit/` | 140 |
| `furniture/office-pack/` | 104 |
| `furniture/restaurant-bits/` | 110 |
| `furniture/singles/` | 8 |
| `nature/stylized-nature-megakit/` | 68 |
| `props/kenney-blaster-kit/` | 40 |
| `props/kenney-graveyard-kit/` | 91 |
| `props/kenney-mini-arcade/` | 20 |
| `roads/kenney-city-kit-roads/` | 95 |
| `roads/kenney-road-tiles/` | 302 |
| `scifi/kenney-modular-space-kit/` | 40 |
| `scifi/kenney-space-station-kit/` | 97 |
| `ui/kenney-input-prompts/` | — |
| `vehicles/kenney-train-kit/` | 103 |
| `vehicles/modular-train/` | 11 |
| `vehicles/singles/` | 16 |

`characters/base` and `animations/` are what the game currently loads (see `packages/shared/src/humans.ts`).

## Licences

- **Kenney** packs (`kenney-*`) and **Quaternius** packs are CC0; each Kenney pack keeps its `License.txt`.
- Single models below come from Poly Pizza, where many are **CC-BY**: credit the author in the game
  if you ship them. Check each model's page on poly.pizza to confirm its licence.

| File | Model | Author |
| --- | --- | --- |
| `buildings/interiors/apartment-2.glb` | Apartment 2 | Gabriele Romagnoli |
| `buildings/interiors/house-interior.glb` | House interior | Gabriele Romagnoli |
| `buildings/interiors/living-room.glb` | Living Room | Alex Safayan |
| `buildings/singles/fire-station-with-fire-trucks.glb` | Fire Station with Fire Trucks | Ivan Klus |
| `characters/singles/animated-woman-2.glb` | Animated Woman | Quaternius |
| `characters/singles/animated-woman.glb` | Animated Woman | Quaternius |
| `characters/singles/character-animated.glb` | Character Animated | Quaternius |
| `furniture/singles/bed-2.glb` | Bed | CMHT Oculus |
| `furniture/singles/bed-3.glb` | Bed | CMHT Oculus |
| `furniture/singles/bed.glb` | Bed | CMHT Oculus |
| `furniture/singles/couch-2.glb` | Couch | J-Toastie |
| `furniture/singles/couch.glb` | Couch | Alex Safayan |
| `furniture/singles/double-bed.glb` | Double Bed | Zsky |
| `furniture/singles/sofa-2.glb` | Sofa | jeremy |
| `furniture/singles/sofa.glb` | Sofa | Quaternius |
| `vehicles/singles/2015-dodge-challenger.glb` | 2015 Dodge Challenger | Grzybek |
| `vehicles/singles/ambulance.glb` | Ambulance by Poly | Poly by Google |
| `vehicles/singles/bus.glb` | Bus | jeremy |
| `vehicles/singles/camaro-zl1-2017.glb` | Camaro ZL1 2017 | Kris Tong |
| `vehicles/singles/car.glb` | Car | theking1322 |
| `vehicles/singles/cargo-truck.glb` | Cargo Truck | J-Toastie |
| `vehicles/singles/chevrolet-camaro.glb` | Chevrolet Camaro | PuKkBuMXDD |
| `vehicles/singles/ferrari-f40.glb` | Ferrari F40 | PuKkBuMXDD |
| `vehicles/singles/mitsubishi-l200.glb` | Mitsubishi L200 | Muhammad Reyhan |
| `vehicles/singles/pickup-truck.glb` | Pickup Truck | Quaternius |
| `vehicles/singles/police-car.glb` | Police Car | Quaternius |
| `vehicles/singles/sports-car.glb` | Sports Car | Quaternius |
| `vehicles/singles/sushi-truck.glb` | Sushi Truck | Quaternius |
| `vehicles/singles/suv.glb` | SUV | Quaternius |
| `vehicles/singles/taxi.glb` | Taxi | Quaternius |
| `vehicles/singles/truck.glb` | Truck | sugamo |
