# BWAPI Unit Dimensions

This document records BWAPI unit type dimensions for the full StarCraft/Brood War unit type table. Use this as the local source of truth for tile footprints and original pixel bounds unless a separate game-design note intentionally diverges.

Source:

- Local clone: `E:\tmp\bwapi`
- File: `bwapi/BWAPILIBTest/unitTypesTest.cpp`
- Assertions used: `tileWidth()`, `tileHeight()`, `dimensionLeft()`, `dimensionUp()`, `dimensionRight()`, `dimensionDown()`, `width()`, `height()`, `isBuilding()`, `isAddon()`, `isFlyingBuilding()`, `isSpecialBuilding()`

Build tile size is `32x32 px`. Pixel bounds are BWAPI unit image bounds, not our SVG coordinates. For non-buildings, `tileWidth()`/`tileHeight()` are often `1x1`; use pixel bounds and gameplay radius for visual scale.

## Terran

| Unit type | Tile footprint | Pixel bounds | L/U/R/D | Building | Add-on | Flying building | Special building |
|---|---:|---:|---:|---:|---:|---:|---:|
| Terran Marine | 1x1 | 17x20 | 8/9/8/10 | no | no | no | no |
| Terran Ghost | 1x1 | 15x22 | 7/10/7/11 | no | no | no | no |
| Terran Vulture | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Terran Goliath | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Terran Siege Tank Tank Mode | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Terran SCV | 1x1 | 23x23 | 11/11/11/11 | no | no | no | no |
| Terran Wraith | 1x1 | 38x30 | 19/15/18/14 | no | no | no | no |
| Terran Science Vessel | 2x2 | 65x50 | 32/33/32/16 | no | no | no | no |
| Hero Gui Montag | 1x1 | 23x22 | 11/7/11/14 | no | no | no | no |
| Terran Dropship | 2x2 | 49x37 | 24/16/24/20 | no | no | no | no |
| Terran Battlecruiser | 2x2 | 75x59 | 37/29/37/29 | no | no | no | no |
| Terran Vulture Spider Mine | 1x1 | 15x15 | 7/7/7/7 | no | no | no | no |
| Terran Nuclear Missile | 1x1 | 15x29 | 7/14/7/14 | no | no | no | no |
| Terran Civilian | 1x1 | 17x20 | 8/9/8/10 | no | no | no | no |
| Hero Sarah Kerrigan | 1x1 | 15x22 | 7/10/7/11 | no | no | no | no |
| Hero Alan Schezar | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Hero Jim Raynor Vulture | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Hero Jim Raynor Marine | 1x1 | 17x20 | 8/9/8/10 | no | no | no | no |
| Hero Tom Kazansky | 1x1 | 38x30 | 19/15/18/14 | no | no | no | no |
| Hero Magellan | 2x2 | 65x50 | 32/33/32/16 | no | no | no | no |
| Hero Edmund Duke Tank Mode | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Hero Edmund Duke Siege Mode | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Hero Arcturus Mengsk | 2x2 | 75x59 | 37/29/37/29 | no | no | no | no |
| Hero Hyperion | 2x2 | 75x59 | 37/29/37/29 | no | no | no | no |
| Hero Norad II | 2x2 | 75x59 | 37/29/37/29 | no | no | no | no |
| Terran Siege Tank Siege Mode | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Terran Firebat | 1x1 | 23x22 | 11/7/11/14 | no | no | no | no |
| Terran Medic | 1x1 | 17x20 | 8/9/8/10 | no | no | no | no |
| Terran Valkyrie | 2x2 | 49x37 | 24/16/24/20 | no | no | no | no |
| Hero Alexei Stukov | 1x1 | 15x22 | 7/10/7/11 | no | no | no | no |
| Hero Gerard DuGalle | 2x2 | 75x59 | 37/29/37/29 | no | no | no | no |
| Hero Infested Duran | 1x1 | 15x22 | 7/10/7/11 | no | no | no | no |
| Terran Command Center | 4x3 | 117x83 | 58/41/58/41 | yes | no | yes | no |
| Terran Comsat Station | 2x2 | 69x42 | 37/16/31/25 | yes | yes | no | no |
| Terran Nuclear Silo | 2x2 | 69x42 | 37/16/31/25 | yes | yes | no | no |
| Terran Supply Depot | 3x2 | 77x49 | 38/22/38/26 | yes | no | no | no |
| Terran Refinery | 4x2 | 113x64 | 56/32/56/31 | yes | no | no | no |
| Terran Barracks | 4x3 | 105x73 | 48/40/56/32 | yes | no | yes | no |
| Terran Academy | 3x2 | 85x57 | 40/32/44/24 | yes | no | no | no |
| Terran Factory | 4x3 | 113x81 | 56/40/56/40 | yes | no | yes | no |
| Terran Starport | 4x3 | 97x79 | 48/40/48/38 | yes | no | yes | no |
| Terran Control Tower | 2x2 | 76x47 | 47/24/28/22 | yes | yes | no | no |
| Terran Science Facility | 4x3 | 97x77 | 48/38/48/38 | yes | no | yes | no |
| Terran Covert Ops | 2x2 | 76x47 | 47/24/28/22 | yes | yes | no | no |
| Terran Physics Lab | 2x2 | 76x47 | 47/24/28/22 | yes | yes | no | no |
| Terran Machine Shop | 2x2 | 71x49 | 39/24/31/24 | yes | yes | no | no |
| Terran Engineering Bay | 4x3 | 97x61 | 48/32/48/28 | yes | no | yes | no |
| Terran Armory | 3x2 | 96x55 | 48/32/47/22 | yes | no | no | no |
| Terran Missile Turret | 2x2 | 33x49 | 16/32/16/16 | yes | no | no | no |
| Terran Bunker | 3x2 | 65x41 | 32/24/32/16 | yes | no | no | no |

## Protoss

| Unit type | Tile footprint | Pixel bounds | L/U/R/D | Building | Add-on | Flying building | Special building |
|---|---:|---:|---:|---:|---:|---:|---:|
| Protoss Corsair | 1x1 | 36x32 | 18/16/17/15 | no | no | no | no |
| Protoss Dark Templar | 1x1 | 24x26 | 12/6/11/19 | no | no | no | no |
| Protoss Dark Archon | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Protoss Probe | 1x1 | 23x23 | 11/11/11/11 | no | no | no | no |
| Protoss Zealot | 1x1 | 23x19 | 11/5/11/13 | no | no | no | no |
| Protoss Dragoon | 1x1 | 32x32 | 15/15/16/16 | no | no | no | no |
| Protoss High Templar | 1x1 | 24x24 | 12/10/11/13 | no | no | no | no |
| Protoss Archon | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Protoss Shuttle | 2x1 | 40x32 | 20/16/19/15 | no | no | no | no |
| Protoss Scout | 2x1 | 36x32 | 18/16/17/15 | no | no | no | no |
| Protoss Arbiter | 2x2 | 44x44 | 22/22/21/21 | no | no | no | no |
| Protoss Carrier | 2x2 | 64x64 | 32/32/31/31 | no | no | no | no |
| Protoss Interceptor | 1x1 | 16x16 | 8/8/7/7 | no | no | no | no |
| Hero Dark Templar | 1x1 | 24x26 | 12/6/11/19 | no | no | no | no |
| Hero Zeratul | 1x1 | 24x26 | 12/6/11/19 | no | no | no | no |
| Hero Tassadar Zeratul Archon | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Hero Fenix Zealot | 1x1 | 23x19 | 11/5/11/13 | no | no | no | no |
| Hero Fenix Dragoon | 1x1 | 32x32 | 15/15/16/16 | no | no | no | no |
| Hero Tassadar | 1x1 | 24x24 | 12/10/11/13 | no | no | no | no |
| Hero Mojo | 2x1 | 36x32 | 18/16/17/15 | no | no | no | no |
| Hero Warbringer | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Hero Gantrithor | 2x2 | 64x64 | 32/32/31/31 | no | no | no | no |
| Protoss Reaver | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Protoss Observer | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Protoss Scarab | 1x1 | 5x5 | 2/2/2/2 | no | no | no | no |
| Hero Danimoth | 2x2 | 44x44 | 22/22/21/21 | no | no | no | no |
| Hero Aldaris | 1x1 | 24x24 | 12/10/11/13 | no | no | no | no |
| Hero Artanis | 2x1 | 36x32 | 18/16/17/15 | no | no | no | no |
| Hero Raszagal | 1x1 | 36x32 | 18/16/17/15 | no | no | no | no |
| Protoss Nexus | 4x3 | 113x79 | 56/39/56/39 | yes | no | no | no |
| Protoss Robotics Facility | 3x2 | 77x37 | 36/16/40/20 | yes | no | no | no |
| Protoss Pylon | 2x2 | 33x33 | 16/12/16/20 | yes | no | no | no |
| Protoss Assimilator | 4x2 | 97x57 | 48/32/48/24 | yes | no | no | no |
| Protoss Observatory | 3x2 | 89x45 | 44/16/44/28 | yes | no | no | no |
| Protoss Gateway | 4x3 | 97x73 | 48/32/48/40 | yes | no | no | no |
| Protoss Photon Cannon | 2x2 | 41x33 | 20/16/20/16 | yes | no | no | no |
| Protoss Citadel of Adun | 3x2 | 65x49 | 24/24/40/24 | yes | no | no | no |
| Protoss Cybernetics Core | 3x2 | 81x49 | 40/24/40/24 | yes | no | no | no |
| Protoss Templar Archives | 3x2 | 65x49 | 32/24/32/24 | yes | no | no | no |
| Protoss Forge | 3x2 | 73x45 | 36/24/36/20 | yes | no | no | no |
| Protoss Stargate | 4x3 | 97x73 | 48/40/48/32 | yes | no | no | no |
| Protoss Fleet Beacon | 3x2 | 88x57 | 40/32/47/24 | yes | no | no | no |
| Protoss Arbiter Tribunal | 3x2 | 89x57 | 44/28/44/28 | yes | no | no | no |
| Protoss Robotics Support Bay | 3x2 | 65x53 | 32/32/32/20 | yes | no | no | no |
| Protoss Shield Battery | 3x2 | 65x33 | 32/16/32/16 | yes | no | no | no |

## Zerg

| Unit type | Tile footprint | Pixel bounds | L/U/R/D | Building | Add-on | Flying building | Special building |
|---|---:|---:|---:|---:|---:|---:|---:|
| Zerg Larva | 1x1 | 16x16 | 8/8/7/7 | no | no | no | no |
| Zerg Egg | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Zerg Zergling | 1x1 | 16x16 | 8/4/7/11 | no | no | no | no |
| Zerg Hydralisk | 1x1 | 21x23 | 10/10/10/12 | no | no | no | no |
| Zerg Ultralisk | 2x2 | 38x32 | 19/16/18/15 | no | no | no | no |
| Zerg Broodling | 1x1 | 19x19 | 9/9/9/9 | no | no | no | no |
| Zerg Drone | 1x1 | 23x23 | 11/11/11/11 | no | no | no | no |
| Zerg Overlord | 2x2 | 50x50 | 25/25/24/24 | no | no | no | no |
| Zerg Mutalisk | 2x2 | 44x44 | 22/22/21/21 | no | no | no | no |
| Zerg Guardian | 2x2 | 44x44 | 22/22/21/21 | no | no | no | no |
| Zerg Queen | 2x2 | 48x48 | 24/24/23/23 | no | no | no | no |
| Zerg Defiler | 1x1 | 27x25 | 13/12/13/12 | no | no | no | no |
| Zerg Scourge | 1x1 | 24x24 | 12/12/11/11 | no | no | no | no |
| Hero Torrasque | 2x2 | 38x32 | 19/16/18/15 | no | no | no | no |
| Hero Matriarch | 2x2 | 48x48 | 24/24/23/23 | no | no | no | no |
| Zerg Infested Terran | 1x1 | 17x20 | 8/9/8/10 | no | no | no | no |
| Hero Infested Kerrigan | 1x1 | 15x22 | 7/10/7/11 | no | no | no | no |
| Hero Unclean One | 1x1 | 27x25 | 13/12/13/12 | no | no | no | no |
| Hero Hunter Killer | 1x1 | 21x23 | 10/10/10/12 | no | no | no | no |
| Hero Devouring One | 1x1 | 16x16 | 8/4/7/11 | no | no | no | no |
| Hero Kukulza Mutalisk | 2x2 | 44x44 | 22/22/21/21 | no | no | no | no |
| Hero Kukulza Guardian | 2x2 | 44x44 | 22/22/21/21 | no | no | no | no |
| Hero Yggdrasill | 2x2 | 50x50 | 25/25/24/24 | no | no | no | no |
| Zerg Cocoon | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Zerg Devourer | 2x2 | 44x44 | 22/22/21/21 | no | no | no | no |
| Zerg Lurker Egg | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Hero Samir Duran | 1x1 | 15x22 | 7/10/7/11 | no | no | no | no |
| Zerg Lurker | 1x1 | 32x32 | 15/15/16/16 | no | no | no | no |
| Zerg Infested Command Center | 4x3 | 117x83 | 58/41/58/41 | yes | no | yes | no |
| Zerg Hatchery | 4x3 | 99x65 | 49/32/49/32 | yes | no | no | no |
| Zerg Lair | 4x3 | 99x65 | 49/32/49/32 | yes | no | no | no |
| Zerg Hive | 4x3 | 99x65 | 49/32/49/32 | yes | no | no | no |
| Zerg Nydus Canal | 2x2 | 64x64 | 32/32/31/31 | yes | no | no | no |
| Zerg Hydralisk Den | 3x2 | 81x57 | 40/32/40/24 | yes | no | no | no |
| Zerg Defiler Mound | 4x2 | 97x37 | 48/32/48/4 | yes | no | no | no |
| Zerg Greater Spire | 2x2 | 57x57 | 28/32/28/24 | yes | no | no | no |
| Zerg Queens Nest | 3x2 | 71x57 | 38/28/32/28 | yes | no | no | no |
| Zerg Evolution Chamber | 3x2 | 77x53 | 44/32/32/20 | yes | no | no | no |
| Zerg Ultralisk Cavern | 3x2 | 73x64 | 40/32/32/31 | yes | no | no | no |
| Zerg Spire | 2x2 | 57x57 | 28/32/28/24 | yes | no | no | no |
| Zerg Spawning Pool | 3x2 | 77x47 | 36/28/40/18 | yes | no | no | no |
| Zerg Creep Colony | 2x2 | 48x48 | 24/24/23/23 | yes | no | no | no |
| Zerg Spore Colony | 2x2 | 48x48 | 24/24/23/23 | yes | no | no | no |
| Zerg Sunken Colony | 2x2 | 48x48 | 24/24/23/23 | yes | no | no | no |
| Zerg Extractor | 4x2 | 128x64 | 64/32/63/31 | yes | no | no | no |

## Neutral/Special

| Unit type | Tile footprint | Pixel bounds | L/U/R/D | Building | Add-on | Flying building | Special building |
|---|---:|---:|---:|---:|---:|---:|---:|
| Spell Scanner Sweep | 1x1 | 27x31 | 13/13/13/17 | no | no | no | no |
| Critter Rhynadon | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Critter Bengalaas | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Special Cargo Ship | 1x1 | 32x32 | 15/15/16/16 | no | no | no | no |
| Special Mercenary Gunship | 1x1 | 32x32 | 15/15/16/16 | no | no | no | no |
| Critter Scantid | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Critter Kakaru | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Critter Ragnasaur | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Critter Ursadon | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Special Map Revealer | 1x1 | 27x31 | 13/13/13/17 | no | no | no | no |
| Spell Disruption Web | 4x3 | 120x80 | 60/40/59/39 | no | no | no | no |
| Special Crashed Norad II | 3x2 | 96x64 | 48/32/47/31 | yes | no | no | yes |
| Special Ion Cannon | 3x2 | 96x64 | 48/32/47/31 | yes | no | no | yes |
| Powerup Uraj Crystal | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Khalis Crystal | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Special Overmind With Shell | 5x3 | 160x73 | 80/32/79/40 | yes | no | no | yes |
| Special Overmind | 5x3 | 160x73 | 80/32/79/40 | yes | no | no | yes |
| Special Mature Chrysalis | 2x2 | 64x64 | 32/32/31/31 | yes | no | no | yes |
| Special Cerebrate | 3x2 | 73x64 | 40/32/32/31 | yes | no | no | yes |
| Special Cerebrate Daggoth | 3x2 | 73x64 | 40/32/32/31 | yes | no | no | yes |
| Special Stasis Cell Prison | 4x3 | 128x96 | 64/48/63/47 | yes | no | no | yes |
| Special Khaydarin Crystal Form | 4x3 | 128x96 | 64/48/63/47 | yes | no | no | yes |
| Special Protoss Temple | 7x3 | 224x96 | 112/48/111/47 | yes | no | no | yes |
| Special XelNaga Temple | 5x4 | 160x98 | 80/34/79/63 | yes | no | no | yes |
| Resource Mineral Field | 2x1 | 64x32 | 32/16/31/15 | yes | no | no | yes |
| Resource Mineral Field Type 2 | 2x1 | 64x32 | 32/16/31/15 | yes | no | no | yes |
| Resource Mineral Field Type 3 | 2x1 | 64x32 | 32/16/31/15 | yes | no | no | yes |
| Special Independant Starport | 2x2 | 64x64 | 32/32/31/31 | yes | no | no | yes |
| Resource Vespene Geyser | 4x2 | 128x64 | 64/32/63/31 | yes | no | no | yes |
| Special Warp Gate | 3x2 | 96x64 | 48/32/47/31 | yes | no | no | yes |
| Special Psi Disrupter | 5x3 | 150x86 | 80/38/69/47 | yes | no | no | yes |
| Special Zerg Beacon | 3x2 | 96x64 | 48/32/47/31 | yes | no | no | yes |
| Special Terran Beacon | 3x2 | 96x64 | 48/32/47/31 | yes | no | no | yes |
| Special Protoss Beacon | 3x2 | 96x64 | 48/32/47/31 | yes | no | no | yes |
| Special Zerg Flag Beacon | 3x2 | 96x64 | 48/32/47/31 | yes | no | no | yes |
| Special Terran Flag Beacon | 3x2 | 96x64 | 48/32/47/31 | yes | no | no | yes |
| Special Protoss Flag Beacon | 3x2 | 96x64 | 48/32/47/31 | yes | no | no | yes |
| Special Power Generator | 4x3 | 120x72 | 56/28/63/43 | yes | no | no | yes |
| Special Overmind Cocoon | 3x2 | 96x64 | 48/32/47/31 | yes | no | no | yes |
| Spell Dark Swarm | 5x5 | 160x160 | 80/80/79/79 | no | no | no | no |
| Special Floor Missile Trap | 2x2 | 64x64 | 32/32/31/31 | no | no | no | no |
| Special Floor Hatch | 8x4 | 256x128 | 128/64/127/63 | no | no | no | no |
| Special Upper Level Door | 3x2 | 70x38 | 25/17/44/20 | no | no | no | no |
| Special Right Upper Level Door | 3x2 | 70x38 | 44/17/25/20 | no | no | no | no |
| Special Pit Door | 3x2 | 70x38 | 41/17/28/20 | no | no | no | no |
| Special Right Pit Door | 3x2 | 70x38 | 28/17/41/20 | no | no | no | no |
| Special Floor Gun Trap | 2x2 | 64x64 | 32/32/31/31 | no | no | no | no |
| Special Wall Missile Trap | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Special Wall Flame Trap | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Special Right Wall Missile Trap | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Special Right Wall Flame Trap | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Special Start Location | 4x3 | 97x65 | 48/32/48/32 | yes | no | no | yes |
| Powerup Flag | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Young Chrysalis | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Psi Emitter | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Data Disk | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Khaydarin Crystal | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Mineral Cluster Type 1 | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Mineral Cluster Type 2 | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Protoss Gas Orb Type 1 | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Protoss Gas Orb Type 2 | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Zerg Gas Sac Type 1 | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Zerg Gas Sac Type 2 | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Terran Gas Tank Type 1 | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| Powerup Terran Gas Tank Type 2 | 1x1 | 32x32 | 16/16/15/15 | no | no | no | no |
| None | 0x0 | 1x1 | 0/0/0/0 | no | no | no | no |
| Unknown | 0x0 | 1x1 | 0/0/0/0 | no | no | no | no |

