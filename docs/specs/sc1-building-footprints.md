# StarCraft Building Footprints

This document records the Terran building subset from BWAPI for quick design lookup. The full unit and building table is [BWAPI Unit Dimensions](./bwapi-unit-dimensions.md); use that full table as the local source of truth for tile footprints and original pixel bounds unless we deliberately diverge in a game-design note.

Source:

- Local clone: `E:\tmp\bwapi`
- File: `bwapi/BWAPILIBTest/unitTypesTest.cpp`
- Assertions used: `tileWidth()`, `tileHeight()`, `dimensionLeft()`, `dimensionUp()`, `dimensionRight()`, `dimensionDown()`, `width()`, `height()`, `isAddon()`, `canBuildAddon()`, `isFlyingBuilding()`

Build tile size is `32x32 px`.

## Terran

| Building | Tile footprint | Pixel bounds `width x height` | Add-on | Can build add-on | Flying building |
|---|---:|---:|---:|---:|---:|
| Command Center | 4x3 | 117x83 | no | yes | yes |
| Comsat Station | 2x2 | 69x42 | yes | no | no |
| Nuclear Silo | 2x2 | 69x42 | yes | no | no |
| Supply Depot | 3x2 | 77x49 | no | no | no |
| Refinery | 4x2 | 113x64 | no | no | no |
| Barracks | 4x3 | 105x73 | no | no | yes |
| Academy | 3x2 | 85x57 | no | no | no |
| Factory | 4x3 | 113x81 | no | yes | yes |
| Starport | 4x3 | 97x79 | no | yes | yes |
| Control Tower | 2x2 | 76x47 | yes | no | no |
| Science Facility | 4x3 | 97x77 | no | yes | yes |
| Covert Ops | 2x2 | 76x47 | yes | no | no |
| Physics Lab | 2x2 | 76x47 | yes | no | no |
| Machine Shop | 2x2 | 71x49 | yes | no | no |
| Engineering Bay | 4x3 | 97x61 | no | no | yes |
| Armory | 3x2 | 96x55 | no | no | no |
| Missile Turret | 2x2 | 33x49 | no | no | no |
| Bunker | 3x2 | 65x41 | no | no | no |

Notes:

- `Tile footprint` is placement/pathing metadata and belongs in `data-footprint`.
- `Pixel bounds` describe the original Brood War unit image dimensions. They can guide visible-box proportions, but they do not require scaling the SVG coordinates.
- Supply Depot remains visually simple and square in our art direction while retaining its `3x2` placement footprint.
