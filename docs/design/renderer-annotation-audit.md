# Renderer Annotation Audit

This is the roster-level checklist for SVG renderer metadata. It covers the
Brood War unit and building roster that we are hand-authoring under `docs/design`.

Rules from `sprite-rigging-contract.md` apply to every row:

- Local art stays in a `64x64` viewBox.
- Units face local forward `0 -1`.
- `data-anchor` is the rotation/placement pivot.
- `data-visible-box` is the visible ink fit box.
- Buildings also carry `data-footprint` from `docs/specs/bwapi-unit-dimensions.md`.
- SVG order is z-order: underparts first, body second, lights/cores last.
- Runtime-critical hooks must be `data-*` attributes because export strips comments.

Current app renderer note: generated SVG data is preserved, but
`packages/app/src/gl/renderer.ts` still draws each sprite as one centered square
quad sized by sim radius. This audit describes the metadata the next renderer
pass must consume.

## Terran Units

Source: `docs/design/terran-sprite-sheet.html`

| Unit | Runtime key | Anchor / fit | Renderer notes |
|---|---|---|---|
| SCV | `scv` | Head/cabin center, visible box | Arms animate under square side blocks and head; no body mass should affect pivot. |
| Marine | `marine` | Helmet center, visible box | Three-circle infantry base; side circles walk/fire, gun emits forward. |
| Firebat | `firebat` | Helmet center, visible box | Wide side circles stay mostly static; twin nozzles emit forward from below side circles. |
| Medic | `medic` | Helmet center, visible box | Small side circles; helmet cross is the support-state light. |
| Ghost | `ghost` | Helmet center, visible box | Marine firing stance with small side circles and long gun forward emission. |
| Vulture | `vulture` | Chassis/cabin center, visible box | Long split-wedge bike; rear thrusters emit local `0 1`. |
| Siege Tank | `siegeTank` | Turret/chassis center, visible box | Treads/hull are body; turret and barrel are independent aim/recoil parts. |
| Siege Tank Siege Mode | `siegeMode` | Turret/chassis center, visible box | Same tank body; longer barrel plus front/rear supports sliding under hull. |
| Goliath | `goliath` | Torso-head center, visible box | Square machine infantry; twin cannons are independent recoil/fire sources. |
| Wraith | `wraith` | Fuselage center, visible box | Stubby trapezoid wings; wing and nose lasers fire forward, rear thrusters glow. |
| Dropship | `dropship` | Fuselage/cargo center, visible box | Wide transport; cargo dots fill by cargo state, rear thrusters glow. |
| Science Vessel | `scienceVessel` | Ring center, visible box | Detector/caster orb; spokes/dots pulse around centered ring. |
| Valkyrie | `valkyrie` | Fuselage center, visible box | Slim dropship-like body, winglets, squat rear thrusters. |
| Battlecruiser | `battlecruiser` | Central spine center, visible box | Long H/hammerhead hull; Yamato block charges, rear wing lasers fire, rear thrusters glow. |
| Spider Mine | `spiderMine` | Perfect circle center, visible box | Circular body with legs; core dot pulses before radial detonation. |
| Nuclear Missile | `nuclearMissile` | Missile center, visible box | Projectile travels forward; exhaust/light emits local `0 1`. |

## Terran Buildings

Source: `docs/design/svgs/terran/buildings/*.svg`

| Building | Runtime key | Footprint | Renderer notes |
|---|---|---:|---|
| Command Center | `commandCenter` | 4x3 | Octagonal HQ hull; four lift pads define occupied envelope, command circle pulses. |
| Supply Depot | `supplyDepot` | 3x2 | Square-ish shell; fans spin, south light/bay is state light. |
| Refinery | `refinery` | 4x2 | Wide gas shell; three smoke-stack rings are gas/emission identity parts. |
| Barracks | `barracks` | 4x3 | Production block with small lift pads; vertical roof lines stay rigid. |
| Engineering Bay | `engineeringBay` | 4x3 | Smaller beveled lab with oversized lift pads and inset hull line. |
| Bunker | `bunker` | 3x2 | Pillbox shell; north/south/east/west slit rectangles are visibility/fire identity. |
| Academy | `academy` | 3x2 | Training dome, side tower dome, rear block, courtyard arc. |
| Missile Turret | `missileTurret` | 2x2 | Rotating pivot plus twin launchers; launchers emit forward. |
| Factory | `factory` | 4x3 | Octagonal liftable hull; full-width band lines, fan spin, roof square. |
| Machine Shop | `machineShop` | 2x2 | Add-on pad with gear, vents, parent connector. |
| Starport | `starport` | 4x3 | Landing pad plus three thrusters/supports; supports are center-to-center spokes. |
| Control Tower | `controlTower` | 2x2 | Add-on pad; lowered dish sweeps, antenna dot blinks. |
| Armory | `armory` | 3x2 | Incomplete octagon; diagonal rays terminate at bevel midpoints, hub pulses. |
| Science Facility | `scienceFacility` | 4x3 | Lab shell with four endpoint thrusters and high central sphere. |
| Physics Lab | `physicsLab` | 2x2 | Add-on pad; instrument capsule charges around pivot. |
| Covert Ops | `covertOps` | 2x2 | Add-on pad; twin roof bars and forward visor flicker. |
| Comsat Station | `comsatStation` | 2x2 | Sonar scanner rings and sweep arm pulse from center. |
| Nuclear Silo | `nuclearSilo` | 2x2 | Hatch ring, missile core, clamps; launch/armed pulse from center. |

## Protoss Units

Source: `docs/design/protoss/protoss-sprite-sheet.html`

| Unit | Runtime key | Anchor / fit | Renderer notes |
|---|---|---|---|
| Probe | `probe` | Shell center, visible box | Small wide arbiter-like V/boomerang; eye/core hovers high. |
| Zealot | `zealot` | Helmet center, visible box | Human-like rig: oval head, leaf side ovals, two psi blades. |
| Dragoon | `dragoon` | Orb center, visible box | Orb body with four independent jointed legs; plasma emits from orb core. |
| High Templar | `highTemplar` | Helmet center, visible box | Small splayed side ovals; hand orbs above shoulders emit spells. |
| Dark Templar | `darkTemplar` | Helmet center, visible box | High Templar body language with one sweeping blade from right side. |
| Archon | `archon` | Aura/core center, visible box | Team-color glow ball with blue core; radial effects only. |
| Dark Archon | `darkArchon` | Aura/core center, visible box | Team-color glow ball with dark core; radial spell effects. |
| Reaver | `reaver` | Shell/launcher center, visible box | Long oval shell; circular launcher head emits Scarab forward. |
| Scarab | `scarab` | Orb center, visible box | Tiny glowing projectile orb. |
| Observer | `observer` | Lens/body center, visible box | Oval detector eye with side fins; lens scans. |
| Shuttle | `shuttle` | Transport shell center, visible box | Smooth delta transport; cargo dots fill, three rear thruster dots glow. |
| Scout | `scout` | Fuselage center, visible box | Smooth airplane body; under-wing engines fire, rear dots thrust. |
| Carrier | `carrier` | Hull cluster center, visible box | Large triad hull; interceptor launches from side hull edges. |
| Interceptor | `interceptor` | Fighter center, visible box | Tiny rigid fighter; forward shot from nose/core. |
| Arbiter | `arbiter` | Main hull center, visible box | Main shell above smaller lower shell; high caster eye/core. |
| Corsair | `corsair` | Trident hull center, visible box | Queen-derived trident flyer; core emits disruption shot forward. |

## Protoss Buildings

Source: `docs/design/protoss/protoss-building-sprite-sheet.html`

| Building | Runtime key | Footprint | Renderer notes |
|---|---|---:|---|
| Nexus | `nexus` | 4x3 | Pyramid base; glowing hull edges, apex cap, low warp eye. |
| Pylon | `pylon` | 2x2 | Center crystal with cradle lines; field ring expands from core. |
| Assimilator | `assimilator` | 4x2 | Wide narrow gas capsule; side eyes and vertical gas core pulse. |
| Gateway | `gateway` | 4x3 | Split pyramid halves; centered portal ring/core pulses. |
| Forge | `forge` | 3x2 | Circle over square and side cap; forge core upgrade pulse. |
| Photon Cannon | `photonCannon` | 2x2 | Concentric turret rings; inner core fires forward. |
| Cybernetics Core | `cyberneticsCore` | 3x2 | Left backing rect, main eye, two edge nodes beneath main circle. |
| Shield Battery | `shieldBattery` | 3x2 | Thin cross arms and small inner core; shield state pulses. |
| Robotics Facility | `roboticsFacility` | 3x2 | Eye-shaped oval with horizontal bisectors, iris ring, pupil. |
| Stargate | `stargate` | 4x3 | Side-facing launch hull pair with graceful inner arcs and center launch core. |
| Citadel of Adun | `citadelOfAdun` | 3x2 | Long skinny left block, right tall bar, right-shifted joining circle. |
| Templar Archives | `templarArchives` | 3x2 | Organic right-pointing leaf, center circle, right-end dot. |
| Robotics Support Bay | `roboticsSupportBay` | 3x2 | Oval bay and hub under four overlaid support arms. |
| Observatory | `observatory` | 3x2 | Quarter-wheel arc with three spoke nodes and lower lens. |
| Fleet Beacon | `fleetBeacon` | 3x2 | Starfleet-like delta insignia with central eye/pupil. |
| Arbiter Tribunal | `arbiterTribunal` | 3x2 | Four pointed cardinal rays under smaller tribunal circle. |

## Zerg Units

Source: `docs/design/zerg/zerg-sprite-sheet.html`

| Unit | Runtime key | Anchor / fit | Renderer notes |
|---|---|---|---|
| Larva | `larva` | Body center, visible box | Tiny wriggling body with antennae. |
| Egg | `egg` | Cocoon center, visible box | Simple oval cocoon; no base, no underside. |
| Drone | `drone` | Beetle/leaf body center, visible box | Beetle-like oval with side leaves and grab jaws. |
| Overlord | `overlord` | Sac center, visible box | Round storage sac; horn mandibles, tentacles, radial storage markers. |
| Zergling | `zergling` | Hull/head center, visible box | Long torso, split jaws, forward/rear triangle limbs. |
| Hydralisk | `hydralisk` | Head/core center, visible box | Upright ranged head; mini tusks/mandibles and spine-shot core. |
| Lurker | `lurker` | Circle body center, visible box | Circular body, long triangle spike limbs, split mandibles. |
| Mutalisk | `mutalisk` | Body/head center, visible box | Bat wings, mandibles, tail; glaive from head core. |
| Scourge | `scourge` | Body center, visible box | Tiny wing dart; radial suicide impact. |
| Guardian | `guardian` | Manta body center, visible box | Wide manta body with front mandibles; siege projectile from head core. |
| Devourer | `devourer` | Shell/core center, visible box | Slim shell with maw, tusks, delta wings, acid core. |
| Queen | `queen` | Trident hull center, visible box | North-facing trident caster hull; spell effects from caster core. |
| Defiler | `defiler` | Body/caster center, visible box | Scorpion-like caster; pincers/tail twitch, spell core pulses. |
| Ultralisk | `ultralisk` | Hull center, visible box | Wide hull with tusks and four triangle legs; melee from tusks. |
| Infested Terran | `infestedTerran` | Helmet center, visible box | Marine-like silhouette with infection dot; radial explosion from anchor. |
| Broodling | `broodling` | Hull center, visible box | Small scuttle body and triangle limbs; melee from front. |

## Zerg Buildings

Source: `docs/design/zerg/zerg-building-sprite-sheet.html`

| Building | Runtime key | Footprint | Renderer notes |
|---|---|---:|---|
| Hatchery | `hatchery` | 4x3 | Brood mound and centered core; roots stay planted. |
| Lair | `lair` | 4x3 | Hatchery base plus under-spine mound and deeper brood core. |
| Hive | `hive` | 4x3 | Hatchery base plus edge-reaching spike wedges and hive core. |
| Creep Colony | `creepColony` | 2x2 | Root mound and central stalk; morph pulse from stalk core. |
| Sunken Colony | `sunkenColony` | 2x2 | Root base and attack spine; ground spike emits forward. |
| Spore Colony | `sporeColony` | 2x2 | Bulb cap with three spore pods; anti-air spores from pod ring. |
| Spawning Pool | `spawningPool` | 3x2 | Oval mouth pool; pool core ripples. |
| Evolution Chamber | `evolutionChamber` | 3x2 | Mutation sac with central core and three equidistant nodes. |
| Hydralisk Den | `hydraliskDen` | 3x2 | Jaw mound with side arcs and triangular den eye. |
| Extractor | `extractor` | 4x2 | Simple gas ring and central sac with side horn clamps. |
| Spire | `spire` | 2x2 | Triangular stalk and top eye/core. |
| Greater Spire | `greaterSpire` | 2x2 | Larger stalk and clustered eye cores around main eye. |
| Queen's Nest | `queensNest` | 3x2 | Nest bowl, four radial spokes, centered core. |
| Nydus Canal | `nydusCanal` | 2x2 | Open mouth ring and dark throat; transport pulse from throat. |
| Ultralisk Cavern | `ultraliskCavern` | 3x2 | Horned cavern mouth with tusks and central eye/core. |
| Defiler Mound | `defilerMound` | 4x2 | Low caster mound with vertical caster slit. |
| Infested Command Center | `commandCenter` today | 4x3 | Sim currently reuses Terran Command Center art; design gap until an infested overlay or dedicated `infestedCommandCenter` sprite is authored. |
