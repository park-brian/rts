# StarCraft: Brood War — Game Data Specification

> Source-of-truth game data for the engine. Values are for **StarCraft: Brood War (1.16.1)**
> on **"Fastest"** game speed. **Store all durations as integer frame counts** (×23.81 from
> the second values here). Verified against Liquipedia, the StarCraft Fandom wiki, and
> TeamLiquid; values that couldn't be re-verified live reflect well-established community data
> and are marked **(approx)**.
>
> Companion: [`../research/sc1-spells-upgrades.md`](../research/sc1-spells-upgrades.md) (full
> spell/upgrade cross-reference for all three races). This doc is the canonical engine spec;
> **Terran is complete (our first milestone); Protoss & Zerg follow.**

---

## PART A — UNIVERSAL MECHANICS

### 1. Game speed & time

StarCraft logic runs in discrete **logical steps ("frames")**. Game speed only changes the
real-time duration of each frame; per-frame logic is identical.

| Speed | ms/frame | frames/sec |
|---|---|---|
| Slowest | 167 | 5.99 |
| Slower | 111 | 9.01 |
| Slow | 83 | 12.05 |
| Normal | 67 | 14.93 |
| Fast | 56 | 17.86 |
| Faster | 48 | 20.83 |
| **Fastest** | **42** | **23.81** |

- 1 frame = 42 ms = 0.042 s; 1 real second ≈ **23.81 frames** (often rounded to 24).
- **Formula:** `real_seconds = frames / 23.81`, `frames = real_seconds × 23.81`.
- "In-game seconds" (Blizzard's balancing unit) ≈ Normal-speed seconds. **Store everything as
  frames**; the "seconds" in the tables below = frames ÷ 23.81 (Fastest).

> Engine note: store all durations (build, cooldown, research, spell duration) as integer
> frame counts. Determinism requires integer/fixed-point math everywhere (see architecture).

### 2. Tile & coordinate system

| Unit | Size | Use |
|---|---|---|
| **Build tile** | 32×32 px | Building placement; map dimensions measured in build tiles |
| **Mini-tile** | 16×16 px | Terrain detail (4 per build tile) |
| **Walk tile** | 8×8 px | Pathfinding / walkability (16 per build tile) |
| **Pixel** | 1 px | Unit positions at sub-tile precision |

- Origin (0,0) top-left; +X right, +Y down. Map size given in build tiles (e.g. 128×128).
- Range/sight expressed in **matrix tiles** (1 tile = 32 px) but computed in pixels.

### 3. Resources

| Resource | Per trip | Start amount | When depleted |
|---|---|---|---|
| **Minerals** | 8 | **1500**/patch | Patch vanishes at 0 |
| **Vespene Gas** | 8 | **5000**/geyser | Yields **2/trip** after exhaustion (refinery shows "depleted") |

- **Optimal saturation:** **2 SCVs per mineral patch** (a 3rd adds ~half a worker via
  queuing); **3 SCVs per gas geyser**. A standard main (~8 patches + 1 geyser) saturates at
  ~16–24 mineral + 3 gas workers.
- Resources are deducted **at the start** of an action; cancelling refunds **75%**.

### 4. Supply / Control / Psi

- Terran **Supply** / Protoss **Psi** / Zerg **Control** — same mechanic. **Cap: 200**;
  production blocks at the cap.
- Stored internally in **half-supply units** (×2), which is why Zerglings cost "0.5 supply".
- Terran providers: Command Center +10, Supply Depot +8. (Protoss: Nexus +10, Pylon +8.
  Zerg: Hatchery/Lair/Hive +1 (×2 internal), Overlord +8.)

### 5. Combat model

#### Damage type × unit size — multiplier table

| Type ↓ / Size → | **Small** | **Medium** | **Large** |
|---|---|---|---|
| **Normal** | 100% | 100% | 100% |
| **Concussive** | 100% | 50% | 25% |
| **Explosive** | 50% | 75% | 100% |

- A 4th internal type, **Independent / Ignore-Armor**, exists for special effects (Irradiate,
  Lockdown, most spell damage) — no size multiplier, no armor reduction.
- **Sizes:** Small (most infantry, Vultures, Wraiths, Mutalisks), Medium (Firebats, Ghosts,
  Lurkers, Archons), Large (Tanks, Goliaths, BCs, Ultralisks, **all buildings**).

#### Damage order of operations (per hit)

1. **Base weapon damage** + (upgrade level × per-level bonus).
2. Multiply by the **type × target-size** factor above (buildings = Large).
3. If target has **Protoss shields > 0:** subtract shield-armor upgrades, apply to shields.
   Shields take damage essentially un-reduced by size/type beyond the multiplier already
   applied; only shield-armor upgrade reduces it.
4. After shields (or if none): subtract the unit's **armor** (flat, 1 point = 1 less damage
   per hit, **after** the type multiplier).
5. **Minimum damage floor: 0.5** — every hit deals ≥ 0.5 to HP.
6. **Splash** weapons reapply at radius falloff (e.g. Siege: 100% inner / 50% mid / 25% outer).
7. **Multi-shot** weapons (e.g. Goliath air = 2 shots, Valkyrie = 8) subtract armor **per
   shot**, so armor is stronger vs. many small hits.

#### Cooldown, range, shields
- **Cooldown** in frames (Marine 15 ≈ 0.63 s). `DPS = damage×shots / (cooldown/23.81)`.
- **Range** in matrix tiles edge-to-edge; melee ≈ 0 (~15 px). Bunkered units gain **+1 range**.
- **Protoss shields** absorb before HP, regenerate over time, reduced only by shield-armor.

### 6. Upgrades model
- **Weapon upgrades:** flat bonus to base damage *before* the type multiplier, *per shot*.
- **Armor/plating upgrades:** +1 flat per-hit reduction per level.
- **Shield upgrades (Protoss):** +1 shield-armor per level.
- Three levels each; higher levels cost/take more and may need a higher-tier building.

### 7. Vision & detection
- **Sight range** (tiles) drives fog reveal; independent of weapon range and **not** raised by
  weapon upgrades (exceptions like Ocular Implants are explicit).
- **High ground** grants vision over low; low→high attacks roll a **miss chance** (~53% miss).
- **Cloak/Burrow** units are invisible/untargetable except by **detectors**. Terran detectors:
  Comsat scan, Science Vessel (mobile), Missile Turret (static).

---

## PART B — TERRAN

> Times in real seconds (Fastest). Damage = `base (+per-upgrade)`. Range/sight in tiles.

### Units

| Unit | Min | Gas | Sup | Build | HP | Armor | Size | Gnd Atk (dmg/type/cd/rng/×shots) | Air Atk | Move | Sight | Produced by / Requires |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **SCV** | 50 | 0 | 1 | 17.86 | 60 | 0 | Small | 5 Normal / 0.63 / melee / 1 | — | 4.92 | 7 | Command Center |
| **Marine** | 50 | 0 | 1 | 15.12 | 40 | 0 | Small | 6 (+1) Normal / 0.63 / 4 (+1 U-238) / 1 | 6 Normal, rng 4 | 4.0 (6.0 stim) | 7 | Barracks |
| **Firebat** | 50 | 25 | 1 | 15.12 | 50 | 1 | Small | 16 (8×2)(+2) Concussive / 1.05 / 2 splash / 1 | — | 4.0 (stim) | 7 | Barracks + Academy |
| **Medic** | 50 | 25 | 1 | 18.90 | 60 | 1 | Small | heals (no attack) | — | 4.0 | 9 | Barracks + Academy |
| **Ghost** | 25 | 75 | 1 | 31.50 | 45 | 0 | Medium | 10 (+1) Concussive / 0.92 / 7 / 1 | 10 (+1) Concussive / 7 | 4.0 | 9 (+2 Ocular) | Barracks + Academy + Covert Ops |
| **Vulture** | 75 | 0 | 2 | 12.60 | 80 | 0 | Small | 20 (+2) Concussive / 1.26 / 5 / 1 | — | 6.4 (~9.6 Ion) | 8 | Factory |
| **Siege Tank (Tank)** | 150 | 100 | 2 | 31.50 | 150 | 1 | Large | 30 (+3) Explosive / 1.55 / 7 / 1 | — | 4.0 | 10 | Factory + Machine Shop |
| **Siege Tank (Siege)** | — | — | — | — | 150 | 1 | Large | 70 (+5) Explosive splash / 3.15 / 12 (min 2) / 1 | — | immobile | 10 | toggle (Siege Tech) |
| **Goliath** | 100 | 50 | 2 | 25.20 | 125 | 1 | Large | 12 (+1) Normal / 0.92 / 6 / 1 | 20 (10×2)(+2 ea) Explosive / 1.85 / 5 (8 Charon) | 4.57 | 8 | Factory + Machine Shop |
| **Wraith** | 150 | 100 | 2 | 37.80 | 120 | 0 | Large | 8 (+1) Normal / 1.26 / 5 / 1 | 20 (+2) Explosive / 1.89 / 5 | 6.66 | 7 | Starport |
| **Dropship** | 100 | 100 | 2 | 31.50 | 150 | 1 | Large | transport (8 cap) | — | 5.46 | 8 | Starport + Control Tower |
| **Science Vessel** | 100 | 225 | 2 | 50.40 | 200 | 1 | Large | detector / caster | — | 5.0 | 10 | Starport + Control Tower |
| **Valkyrie** | 250 | 125 | 3 | 31.50 | 200 | 2 | Large | — | 48 (6×8)(+1 ea) Explosive splash / 4.0 / 6 | 6.66 | 8 | Starport + Control Tower + Armory |
| **Battlecruiser** | 400 | 300 | 6 | 84.00 | 500 | 3 | Large | 25 (+3) Normal / 1.89 / 6 / 1 | 25 (+3) Normal / 1.89 / 6 | 2.5 | 11 | Starport + Control Tower + Physics Lab |
| **Spider Mine** | 3/Vulture | — | 0 | — | 20 | 0 | Small | 125 Explosive splash / detonate | — | fast | 3 | laid by Vulture (Spider Mines tech) |
| **Nuclear Missile** | 200 | 200 | 0 | 37.80 | — | — | — | 500 or ⅔ target max HP (lesser), splash | — | — | — | Nuclear Silo (Ghost launches) |

Spellcaster abilities/energy: see [spells reference](../research/sc1-spells-upgrades.md#terran).
(Max energy 200, start 50; +50 max with the respective Reactor upgrade.)

### Buildings

Placement footprints and original pixel bounds are tracked in [BWAPI Unit Dimensions](./bwapi-unit-dimensions.md), sourced from BWAPI `UnitType` assertions. The Terran building subset is summarized in [StarCraft Building Footprints](./sc1-building-footprints.md).

| Building | Min | Gas | Build | HP | Armor | Produces / Researches | Requires |
|---|---|---|---|---|---|---|---|
| **Command Center** | 400 | 0 | 75.6 | 1500 | 1 | SCVs; +10 supply; resource drop-off; can lift/land | — |
| **Supply Depot** | 100 | 0 | 25.2 | 500 | 1 | +8 supply | Command Center |
| **Refinery** | 100 | 0 | 25.2 | 750 | 1 | Gas collection | on geyser |
| **Barracks** | 150 | 0 | 50.4 | 1000 | 1 | Marine, Firebat, Medic, Ghost | Command Center |
| **Engineering Bay** | 125 | 0 | 37.8 | 850 | 1 | Infantry Weapons/Armor 1–3 | Command Center |
| **Bunker** | 100 | 0 | 18.9 | 350 | 1 | Garrison 4 infantry (+1 range) | Barracks |
| **Academy** | 150 | 0 | 50.4 | 600 | 1 | Stim, U-238, Caduceus, Restoration, Optical Flare; unlocks Firebat/Medic; enables Comsat | Barracks |
| **Missile Turret** | 75 | 0 | 18.9 | 200 | 0 | Anti-air + **detector** | Engineering Bay |
| **Factory** | 200 | 100 | 50.4 | 1250 | 1 | Vulture, Siege Tank, Goliath | Barracks |
| **Machine Shop** (add-on) | 50 | 50 | 25.2 | 750 | 1 | Siege Tech, Spider Mines, Ion Thrusters; unlocks Tank/Goliath | Factory |
| **Starport** | 150 | 100 | 50.4 | 1300 | 1 | Wraith, Dropship, Sci Vessel, Valkyrie, BC | Factory |
| **Control Tower** (add-on) | 50 | 50 | 25.2 | 500 | 1 | Cloaking Field, Apollo Reactor; unlocks Dropship/Vessel/Valkyrie/BC | Starport |
| **Armory** | 100 | 50 | 50.4 | 750 | 1 | Vehicle & Ship Weapons/Plating 1–3; enables Goliath air range/Valkyrie | Factory |
| **Science Facility** | 100 | 150 | 50.4 | 850 | 1 | Irradiate, EMP, Titan Reactor | Starport |
| **Physics Lab** (add-on) | 50 | 50 | 25.2 | 600 | 1 | Yamato, Colossus Reactor; unlocks Battlecruiser | Science Facility |
| **Covert Ops** (add-on) | 50 | 50 | 25.2 | 750 | 1 | Lockdown, Cloaking, Ocular Implants, Moebius Reactor; unlocks Ghost | Science Facility |
| **Comsat Station** (add-on) | 50 | 50 | 25.2 | 500 | 1 | Scanner Sweep (detector) | Command Center + Academy |
| **Nuclear Silo** (add-on) | 100 | 100 | 50.4 | 600 | 1 | Builds/holds 1 Nuclear Missile | Command Center + Covert Ops |

> Add-ons attach to a parent (CC, Factory, Starport, Science Facility); one add-on per structure.

### Upgrades & research

Full Terran upgrade/research costs, times, and prerequisites:
see [spells & upgrades reference → Terran](../research/sc1-spells-upgrades.md#terran-1).
Key combat upgrades: Infantry/Vehicle/Ship Weapons & Armor 1–3 (Engineering Bay / Armory),
Stim Pack & U-238 (Academy), Siege Tech / Spider Mines / Ion Thrusters (Machine Shop).

### Engine-implementation reminders
1. Store all times as **frames** (×23.81 from the seconds above).
2. Apply damage in the exact order in §A.5; enforce the **0.5 minimum** floor.
3. Multi-shot weapons (Goliath air, Valkyrie) subtract armor **per shot**.
4. Buildings count as **Large** for the type-multiplier table.

### Key sources
[Damage Type](https://liquipedia.net/starcraft/Damage_Type) ·
[Armor](https://liquipedia.net/starcraft/Armor) ·
[Damage Order of Operations](https://liquipedia.net/starcraft/Damage_Order_of_Operations) ·
[Game Speed](https://liquipedia.net/starcraft/Game_Speed) ·
[Terran Units](https://liquipedia.net/starcraft/Terran_Units) ·
[Fandom: Damage types](https://starcraft.fandom.com/wiki/Damage_types)

---

## PART C — PROTOSS

> Protoss units have **HP + Shields + armor** (shields take un-typed damage, regen ~7/s out of
> combat, reduced only by Plasma Shield upgrades). Buildings must be inside a **Pylon power
> field**. Production **warps in** and frees the Probe immediately (unlike Terran SCV).
> Times in game seconds (Fastest). Full spell/upgrade cross-ref: [spells & upgrades → Protoss](../research/sc1-spells-upgrades.md#protoss).

### Units

| Unit | Min | Gas | Sup | Build | HP | Shld | Armor | Size | Gnd Dmg (type) | Air Dmg (type) | CD | Rng G/A | ×Atk | Sight | Built at / Requires |
|---|---:|---:|---:|---:|---:|---:|---:|:--:|---|---|---:|---|:--:|---:|---|
| **Probe** | 50 | 0 | 1 | 12.6 | 20 | 20 | 0 | S | 5 (Normal) | — | 22 | 1 | 1 | 8 | Nexus |
| **Zealot** | 100 | 0 | 2 | 25.2 | 100 | 60 | 1 | S | 16 (8×2, Normal) | — | 22 | 1 | 2 | 7 | Gateway |
| **Dragoon** | 125 | 50 | 2 | 31.5 | 100 | 80 | 1 | L | 20 (Explosive) | 20 (Explosive) | 30 | 4 (6 Singularity) | 1 | 8 | Gateway + Cybernetics Core |
| **High Templar** | 50 | 150 | 2 | 31.5 | 40 | 40 | 0 | S | caster | — | — | — | — | 7 | Gateway + Templar Archives |
| **Dark Templar** | 125 | 100 | 2 | 31.5 | 80 | 40 | 1 | S | 40 (Normal) | — | 30 | 1 | 1 | 7 | Gateway + Templar Archives (perma-cloaked) |
| **Archon** | (2×HT) | — | 4 | 12.6 merge | 10 | 350 | 0 | L | 30 (Normal) | 30 (Normal) | 20 | 2 | 1 | 8 | Merge 2 High Templar |
| **Dark Archon** | (2×DT) | — | 4 | 12.6 merge | 25 | 200 | 1 | L | caster | — | — | — | — | 10 | Merge 2 Dark Templar |
| **Reaver** | 200 | 100 | 4 | 44.0 | 100 | 80 | 0 | L | 100 (125 upg) Scarab splash | — | 60 | 8 | 1 | 10 | Robotics Facility + Support Bay |
| **Scarab** | 15 | 0 | 0 | 4.0 | — | — | — | — | 100/125 (Normal splash) | — | — | — | — | — | Inside Reaver (holds 5/10) |
| **Observer** | 25 | 75 | 1 | 25.2 | 40 | 20 | 0 | S | — | — | — | — | — | 9 (11 upg) | Robotics Facility (cloaked detector, flying) |
| **Shuttle** | 200 | 0 | 2 | 37.8 | 80 | 60 | 1 | L | transport (8) | — | — | — | — | 8 | Robotics Facility |
| **Scout** | 275 | 125 | 3 | 50.4 | 150 | 100 | 0 | L | 8 (Normal) | 28 (14×2, Explosive) | G30/A22 | 4 | G1/A2 | 8 (10 upg) | Stargate |
| **Carrier** | 350 | 250 | 6 | 86.4 | 300 | 150 | 4 | L | via Interceptors | via Interceptors | — | leash | — | 11 | Stargate + Fleet Beacon (holds 4/8) |
| **Interceptor** | 25 | 0 | 0 | 12.6 | 40 | 40 | 0 | S | 6 (Normal) | 6 (Normal) | — | — | 1 | 6 | Inside Carrier |
| **Arbiter** | 100 | 350 | 4 | 100.8 | 200 | 150 | 1 | L | 10 (Explosive) | 10 (Explosive) | 45 | 5 | 1 | 9 | Stargate + Arbiter Tribunal (cloaks allies) |
| **Corsair** | 150 | 100 | 2 | 25.2 | 100 | 80 | 1 | M | — | 5 (Explosive splash) | 8 | 5 | 1 | 9 | Stargate |

> Archon/Dark Archon cost = the two consumed Templars (no extra minerals/gas on merge; supply already counted).
> Caster energy/abilities: see [spells → Protoss](../research/sc1-spells-upgrades.md#protoss).

### Buildings

| Building | Min | Gas | Build | HP | Shld | Armor | Produces / Researches | Requires |
|---|---:|---:|---:|---:|---:|---:|---|---|
| **Nexus** | 400 | 0 | 120 | 750 | 750 | 1 | Probes; +10 supply; drop-off | — |
| **Pylon** | 100 | 0 | 18 | 300 | 300 | 0 | +8 supply; powers buildings | — |
| **Assimilator** | 100 | 0 | 25.2 | 450 | 450 | 1 | Gas harvesting | on geyser |
| **Gateway** | 150 | 0 | 37.8 | 500 | 500 | 1 | Zealot, Dragoon, HT, DT | Nexus |
| **Forge** | 150 | 0 | 25.2 | 550 | 550 | 1 | Ground weapon/armor, Plasma Shields | Nexus |
| **Photon Cannon** | 150 | 0 | 31.5 | 100 | 100 | 0 | Defense + detector: 20 (Normal) G&A, cd 22, rng 7 | Forge |
| **Cybernetics Core** | 200 | 0 | 37.8 | 500 | 500 | 1 | Air upgrades, Singularity; enables Dragoon/Stargate/Robotics | Gateway |
| **Shield Battery** | 100 | 0 | 18 | 200 | 200 | 1 | Restores nearby shields (energy) | Gateway |
| **Robotics Facility** | 200 | 200 | 50.4 | 500 | 500 | 1 | Shuttle, Reaver, Observer | Cybernetics Core |
| **Stargate** | 150 | 150 | 44 | 600 | 600 | 1 | Scout, Corsair, Carrier, Arbiter | Cybernetics Core |
| **Citadel of Adun** | 150 | 100 | 37.8 | 450 | 450 | 1 | Leg Enhancements; enables Templar Archives | Cybernetics Core |
| **Templar Archives** | 150 | 200 | 44 | 500 | 500 | 1 | HT/DT tech; Storm, Hallucination, Maelstrom, Mind Control, energy upgrades | Citadel of Adun |
| **Robotics Support Bay** | 150 | 100 | 18 | 450 | 450 | 1 | Scarab Damage, Reaver Capacity, Gravitic Drive; enables Reaver | Robotics Facility |
| **Observatory** | 50 | 100 | 18 | 250 | 250 | 1 | Sensor Array, Gravitic Boosters; enables Observer | Robotics Facility |
| **Fleet Beacon** | 300 | 200 | 37.8 | 500 | 500 | 1 | Carrier/Scout/Corsair upgrades, Disruption Web; enables Carrier | Stargate |
| **Arbiter Tribunal** | 200 | 150 | 37.8 | 500 | 500 | 1 | Recall, Stasis, Khaydarin Core; enables Arbiter | Stargate + Templar Archives |

### Upgrades & research
Full list: [spells & upgrades → Protoss](../research/sc1-spells-upgrades.md#protoss-1). Ground/Air
Weapons & Armor and Plasma Shields 1–3 (Forge / Cybernetics Core); key tech: Singularity Charge
(Dragoon range), Leg Enhancements (Zealot speed), Psionic Storm (Templar Archives).

## PART D — ZERG

> **Zerg mechanics:** all non-building units **regenerate HP** (~4 HP per ~14.6 s — only Zerg
> do this). Production is **morph-based**: units hatch from **larvae** (larva → Egg, consumed);
> a **Drone morphs into a building** (Drone consumed); **Lair/Hive, Lurker, Guardian/Devourer,
> Sunken/Spore Colony, Greater Spire** are morphs of an existing unit/building. Buildings (except
> Extractor) must be on **creep**. Times in game seconds (Fastest).

### Units

| Unit | Min | Gas | Sup | Build | HP | Armor | Size | Gnd Dmg (type) | Air Dmg (type) | CD | Rng G/A | ×Atk | Sight | Morph from / Requires |
|---|---:|---:|---:|---:|---:|---:|:--:|---|---|---:|---|:--:|---:|---|
| **Larva** | — | — | 0 | — | 25 | 10 | S | — | — | — | — | — | 4 | Hatchery/Lair/Hive (max 3) |
| **Drone** | 50 | 0 | 1 | 12.6 | 40 | 0 | S | 5 (Normal) | — | 22 | 1 | 1 | 7 | Larva |
| **Overlord** | 100 | 0 | 0 | 25.2 | 200 | 0 | L | — | — | — | — | — | 9 (11 upg) | Larva; **+8 supply**, detector, transport (Ventral Sacs) |
| **Zergling** | 25/pair | 0 | 0.5 ea | 28 (pair) | 35 | 0 | S | 5 (Normal) | — | 8 (6 Adrenal) | 1 | 1 | 5 | Larva (2/egg) / Spawning Pool |
| **Hydralisk** | 75 | 25 | 1 | 28 | 80 | 0 | M | 10 (Explosive) | 10 (Explosive) | 15 | 4 (5 Grooved) | 1 | 6 | Larva / Hydralisk Den |
| **Lurker** | 50 | 100 | 2 | 40 | 125 | 1 | L | 20 (Explosive, line splash) | — | 37 | 6 | 1 | 8 | Morph from Hydralisk / Lurker Aspect (burrow to attack) |
| **Mutalisk** | 100 | 100 | 2 | 40 | 120 | 0 | S | 9 (Normal, bounce 9/3/1) | 9 (bounce) | 30 | 3 | 1 | 7 | Larva / Spire |
| **Scourge** | 25/pair | 75/pair | 0.5 ea | 30 (pair) | 25 | 0 | S | — | 110 (Normal, suicide) | — | collision | — | 5 | Larva (2/egg) / Spire |
| **Guardian** | 50 | 100 | 2 | 40 | 150 | 2 | L | 20 (Normal) | — | 30 | 8 | 1 | 8 | Morph from Mutalisk / Greater Spire |
| **Devourer** | 150 | 50 | 2 | 40 | 250 | 2 | L | — | 25 (Explosive) + Acid Spores | 100 | 6 | 1 | 8 | Morph from Mutalisk / Greater Spire |
| **Queen** | 100 | 100 | 2 | 50 | 120 | 0 | M | caster | — | — | — | — | 10 | Larva / Queen's Nest |
| **Defiler** | 50 | 150 | 2 | 31.5 | 80 | 1 | M | caster | — | — | — | — | 10 | Larva / Defiler Mound |
| **Ultralisk** | 200 | 200 | 4 | 60 | 400 | 1 (3 Chitinous) | L | 20 (Normal) | — | 15 | 1 | 1 | 7 | Larva / Ultralisk Cavern |
| **Infested Terran** | 100 | 50 | 1 | 40 | 60 | 0 | S | 500 (Normal, suicide splash) | — | — | collision | — | 5 | Infest damaged Terran CC w/ Queen |
| **Broodling** | — | — | 0 | — | 30 | 0 | S | 4 (Normal) | — | 15 | 1 | 1 | 5 | Queen Spawn Broodlings (dies ~30 s) |

> Zergling/Scourge cost shown per-pair (one egg makes two). Caster abilities: see [spells → Zerg](../research/sc1-spells-upgrades.md#zerg).

### Buildings

| Building | Min | Gas | Build | HP | Armor | Produces / Researches | Requires |
|---|---:|---:|---:|---:|---:|---|---|
| **Hatchery** | 300 | 0 | 120 | 1250 | 1 | Larvae; +1 supply; Drone/Overlord/Zergling; drop-off | — |
| **Lair** | (150) | (100) | 100 | 1800 | 1 | Morph of Hatchery; tier-2 tech; Overlord upgrades, Burrow | Hatchery + Spawning Pool |
| **Hive** | (200) | (150) | 120 | 2500 | 1 | Morph of Lair; tier-3 tech | Lair + Queen's Nest |
| **Creep Colony** | 75 | 0 | 20 | 400 | 0 | Spreads creep; morphs to Sunken/Spore | Hatchery |
| **Sunken Colony** | (50) | 0 | 20 | 300 | 2 | Anti-ground: 40 (Explosive), cd 32, rng 7 | Morph of Creep Colony + Spawning Pool |
| **Spore Colony** | (50) | 0 | 20 | 400 | 0 | Anti-air + detector: 15 (Normal), cd 15, rng 7 | Morph of Creep Colony + Evolution Chamber |
| **Spawning Pool** | 200 | 0 | 65 | 750 | 0 | Zergling; Metabolic Boost, Adrenal Glands; enables Lair/Sunken | Hatchery |
| **Evolution Chamber** | 75 | 0 | 25 | 750 | 0 | Melee/Missile & Carapace upgrades; enables Spore | Hatchery |
| **Hydralisk Den** | 100 | 50 | 25 | 850 | 0 | Hydralisk; Muscular Augments, Grooved Spines, Lurker Aspect | Spawning Pool |
| **Extractor** | 50 | 0 | 25 | 750 | 0 | Gas harvesting | on geyser |
| **Spire** | 200 | 150 | 75 | 600 | 0 | Mutalisk, Scourge; Flyer upgrades | Lair |
| **Greater Spire** | (100) | (150) | 120 | 1000 | 0 | Morph of Spire; enables Guardian & Devourer | Spire + Hive |
| **Queen's Nest** | 150 | 100 | 50 | 850 | 0 | Queen; Ensnare, Spawn Broodlings; enables Hive | Lair |
| **Nydus Canal** | 150 | 0 | 40 | 250 | 0 | Linked instant-transport exits | Lair |
| **Ultralisk Cavern** | 150 | 200 | 65 | 600 | 0 | Ultralisk; Chitinous Plating, Anabolic Synthesis | Hive |
| **Defiler Mound** | 100 | 100 | 60 | 850 | 1 | Defiler; Plague, Consume | Hive |

> Parenthesized costs = **morph cost** added on top of the consumed structure/unit (e.g. Lair = 150/100 on a Hatchery; Sunken/Spore = 50 on a Creep Colony).

### Larva & supply mechanics
- Each **Hatchery/Lair/Hive** holds **max 3 larvae**; a new larva spawns ~every **14–15 s** while
  below 3 (pauses at 3). Larvae are immobile, stay near the hatch on creep.
- All base units morph from a **larva** (→ Egg during build); **Lurker/Guardian/Devourer** morph
  from existing units. More hatcheries = more parallel larvae = the core of Zerg macro.
- **Supply:** Overlord +8 (mobile, killable, also detector/transport), Hatchery/Lair/Hive +1. Cap 200.

### Upgrades & research
Full list: [spells & upgrades → Zerg](../research/sc1-spells-upgrades.md#zerg-1). Melee/Missile
Attacks & Carapace and Flyer Attacks/Carapace 1–3 (Evolution Chamber / Spire); key tech: Metabolic
Boost (Zergling speed), Lurker Aspect, Burrow, Plague/Consume (Defiler Mound).

### Notes & caveats (Protoss/Zerg)
- Protoss shields regen ~7 HP/s out of combat; Zerg HP regen ~4 HP/~14.6 s; Terran HP does not regen.
- Movement speeds are qualitative where exact px/frame values vary by source (e.g. Zealot 3.6,
  Dragoon 5.0, Mutalisk 6.66 base — verify per-unit page for engine precision). Marked **(approx)**.
- A few secondary research times vary by patch/source; treat ±a few seconds as **(approx)**.
