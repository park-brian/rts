# StarCraft: Brood War — Spells & Upgrades Reference

All numbers verified against Liquipedia (liquipedia.net/starcraft). Times are at Fastest game
speed as listed by Liquipedia. This is a source-of-truth companion to `docs/specs/sc1-spec.md`.

---

## PART A — SPELLS & ABILITIES (Energy Costs)

Spellcasters build energy up to a max of **200** (250 with the respective energy reactor upgrade).
Most casters start at **50** energy.

### Terran

| Caster | Ability | Energy | Range | Effect | Researched at |
|---|---|---|---|---|---|
| Marine / Firebat | Stim Pack | **0** (costs 10 HP) | self | +50% attack speed & move speed for ~12.6 s | Academy |
| Ghost | Lockdown | **100** | 8 | Disables a mechanical unit for ~43.8 s (1040–1047 frames) | Covert Ops |
| Ghost | Personnel Cloaking | **25** initial + **~0.93/s** drain | self | Cloaks the Ghost until toggled off or energy depleted | Covert Ops |
| Ghost | Nuclear Strike (target) | **0** (requires a built Nuclear Missile) | 8 (10 w/ Ocular Implants) | 500 dmg or 2/3 max HP+shields, whichever greater; 100/50/25% by radius. Ghost channels ~14.5 s | Nuclear Silo (missile); Ghost designates |
| Science Vessel | Defensive Matrix | **100** | 10 | 250 HP non-regenerating shield on target, lasts ~56.7 s | None (innate) |
| Science Vessel | Irradiate | **75** | 9 | 249.9 dmg over 25.2 s to biological units in 32 px radius around target | Science Facility |
| Science Vessel | EMP Shockwave | **100** | 8 | Sets shields & energy to 0 in 96×96 px area | Science Facility |
| Medic | Heal | **0** (auto, drains energy: 2 HP per 1 energy) | melee | Restores HP to biological friendly units | None (innate) |
| Medic | Restoration | **50** | 6 | Removes Lockdown, Optical Flare, Irradiate, Plague, Ensnare, Parasite (not Stasis) | Academy |
| Medic | Optical Flare | **75** | 9 | Permanently reduces target sight to 1 (until Restored); removes detection | Academy |
| Comsat Station | Scanner Sweep | **50** | global | Vision + detection over ~1 screen for ~6.8–11 s | (add-on to CC; needs Academy) |
| Wraith | Cloaking Field | **25** initial + **~0.19/s** drain | self | Cloaks the Wraith | Control Tower |
| Battlecruiser | Yamato Gun | **150** | 10 | 260 explosive damage to a single target | Physics Lab |

### Protoss

| Caster | Ability | Energy | Range | Effect | Researched at |
|---|---|---|---|---|---|
| High Templar | Psionic Storm | **75** | 9 | 112 dmg over 8 ticks (0.33 s each) in 96×96 px area | Templar Archives |
| High Templar | Hallucination | **100** | 7 | Creates 2 illusory copies of target; last ~56.7 s | Templar Archives |
| Arbiter | Stasis Field | **100** | 9 | Freezes units in 3×3 (96×96 px) for ~43.8 s (invulnerable, cannot act) | Arbiter Tribunal |
| Arbiter | Recall | **150** | global | Teleports friendly units in 138×133 px to the Arbiter | Arbiter Tribunal |
| Arbiter | Cloak (passive) | **0** (innate) | aura | Permanently cloaks nearby friendly units | None (innate) |
| Dark Archon | Mind Control | **150** | 8 | Permanently takes control of target unit; sets caster's shields to 0 | Templar Archives |
| Dark Archon | Feedback | **50** | 10 | Drains all target energy and deals damage equal to energy lost | None (innate) |
| Dark Archon | Maelstrom | **100** | 10 | Stuns biological units in 96×96 px for ~7.48 s (178 frames) | Templar Archives |
| Corsair | Disruption Web | **125** | 9 | 120×80 px zone; ground units/buildings under it cannot attack; lasts 15.12 s | Fleet Beacon |

### Zerg

| Caster | Ability | Energy | Range | Effect | Researched at |
|---|---|---|---|---|---|
| Queen | Spawn Broodling | **150** | 9 | Instantly kills target ground unit; spawns 2 Broodlings (30 HP, ~75.2 s lifespan). Exceptions: Probe/Reaver/Archon etc. | Queen's Nest |
| Queen | Ensnare | **75** | 9 | Slows units/reveals cloaked in 128×128 px for 25.2 s | Queen's Nest |
| Queen | Parasite | **75** | 12 | Permanent vision of target (and detection if target detects) | None (innate) |
| Queen | Infestation (Infest CC) | **0** (autocast) | melee | Infests a Terran CC under 1/2 HP → Infested CC | None (innate) |
| Defiler | Dark Swarm | **100** | 9 | 160×160 px cloud; blocks ranged attacks vs ground units; lasts 37.8 s | None (innate) |
| Defiler | Plague | **150** | 9 | 128×128 px; ~11.74 HP/s over 25.2 s (cannot kill, min 1 HP) | Defiler Mound |
| Defiler | Consume | **0** to cast (**gains +50** energy per unit) | 1 | Sacrifices an owned Zerg unit (not Larva) to restore 50 energy | Defiler Mound |

---

## PART B — UPGRADES (Mineral / Gas / Time / Effect)

Research time = Liquipedia value (Fastest). M = minerals, G = gas. Three-level weapon/armor
upgrades increase cost by a fixed increment per level (noted per table).

### Terran

#### Weapon & Armor (3 levels each)

| Upgrade | L1 | L2 | L3 | Increment | Building | Effect |
|---|---|---|---|---|---|---|
| Infantry Weapons | 100M/100G, 167.58s | 175M/175G, 180.18s | 250M/250G, 192.78s | +75/+75 | Engineering Bay | Marine/Firebat/Ghost +1 dmg/level |
| Infantry Armor | 100M/100G, 167.58s | 175M/175G, 180.18s | 250M/250G, 192.78s | +75/+75 | Engineering Bay | SCV/Marine/Medic/Firebat/Ghost +1 armor/level |
| Vehicle Weapons | 100M/100G, 167.58s | 175M/175G, 180.18s | 250M/250G, 192.78s | +75/+75 | Armory | Vulture/Tank/Goliath +dmg/level |
| Vehicle Plating | 100M/100G, 167.58s | 175M/175G, 180.18s | 250M/250G, 192.78s | +75/+75 | Armory | Vulture/Goliath/Tank +1 armor/level |
| Ship Weapons | 100M/100G, 167.58s | 150M/150G, 180.18s | 200M/200G, 192.78s | +50/+50 | Armory | Wraith/BC/Valkyrie +dmg/level |
| Ship Plating | 150M/150G, 167.58s | 225M/225G, 180.18s | 300M/300G, 192.78s | +75/+75 | Armory | Wraith/Dropship/Vessel/BC/Valkyrie +1 armor/level |

#### Ability / Mobility / Reactor

| Upgrade | Cost | Time | Building | Effect |
|---|---|---|---|---|
| Stim Pack | 100M/100G | 50.4s | Academy | Marine/Firebat gain Stim |
| U-238 Shells | 150M/150G | 63s | Academy | Marine range 4 → 5 |
| Restoration | 100M/100G | 50.4s | Academy | Unlocks Medic Restoration |
| Optical Flare | 100M/100G | 75.6s | Academy | Unlocks Medic Optical Flare |
| Caduceus Reactor | 150M/150G | 105s | Academy | Medic max energy 200 → 250 |
| Ion Thrusters | 100M/100G | 63s | Machine Shop | Vulture move speed +~50% |
| Spider Mines | 100M/100G | 50.4s | Machine Shop | Vultures gain 3 Spider Mines |
| Siege Tech | 150M/150G | 50.4s | Machine Shop | Tanks gain Siege Mode |
| Charon Boosters | 100M/100G | 83.79s | Machine Shop | Goliath air range 5 → 8 |
| Personnel Cloaking | 100M/100G | 50s | Covert Ops | Ghost cloak |
| Lockdown | 200M/200G | 63s | Covert Ops | Unlocks Lockdown |
| Ocular Implants | 100M/100G | 104.58s | Covert Ops | Ghost sight 9 → 11 |
| Moebius Reactor | 150M/150G | 104.58s | Covert Ops | Ghost max energy 200 → 250 |
| Cloaking Field | 150M/150G | 63s | Control Tower | Wraith cloak |
| Apollo Reactor | 200M/200G | 104.58s | Control Tower | Wraith max energy 200 → 250 |
| Yamato Cannon | 100M/100G | 75.6s | Physics Lab | Unlocks Yamato Gun |
| Colossus Reactor | 150M/150G | 104.58s | Physics Lab | Battlecruiser max energy 200 → 250 |
| EMP Shockwave | 200M/200G | 75.6s | Science Facility | Unlocks EMP |
| Irradiate | 200M/200G | 50.4s | Science Facility | Unlocks Irradiate |
| Titan Reactor | 150M/150G | 104.58s | Science Facility | Science Vessel max energy 200 → 250 |

### Protoss

#### Weapon, Shield & Air (3 levels each)

| Upgrade | L1 | L2 | L3 | Increment | Building | Effect |
|---|---|---|---|---|---|---|
| Ground Weapons | 100M/100G, 167.58s | 150M/150G, 180.18s | 200M/200G, 192.78s | +50/+50 | Forge | Zealot +1, Dragoon +2, DT/Archon +3 per level |
| Ground Armor | 100M/100G, 167.58s | 175M/175G, 180.18s | 250M/250G, 192.78s | +75/+75 | Forge | Ground units +1 armor/level |
| Plasma Shields | 200M/200G, 167.58s | 300M/300G, 180.18s | 400M/400G, 192.78s | +100/+100 | Forge | All units & buildings +1 shield/level |
| Air Weapons | 100M/100G, 167.58s | 175M/175G, 180.18s | 250M/250G, 192.78s | +75/+75 | Cybernetics Core | Scout/Corsair/Interceptor/Arbiter +dmg/level |
| Air Armor | 150M/150G, 167.58s | 225M/225G, 180.18s | 300M/300G, 192.78s | +75/+75 | Cybernetics Core | Air units +1 armor/level |

#### Ability / Mobility / Reactor

| Upgrade | Cost | Time | Building | Effect |
|---|---|---|---|---|
| Singularity Charge | 150M/150G | 104.58s | Cybernetics Core | Dragoon range 4 → 6 |
| Leg Enhancements | 150M/150G | 83.79s | Citadel of Adun | Zealot move speed +~50% |
| Gravitic Drive | 200M/200G | 104.58s | Robotics Support Bay | Shuttle move speed +~50% |
| Reaver Capacity | 200M/200G | 104.58s | Robotics Support Bay | Reaver scarab capacity 5 → 10 |
| Scarab Damage | 200M/200G | 104.58s | Robotics Support Bay | Scarab damage 100 → 125 |
| Gravitic Thrusters | 200M/200G | 104.58s | Fleet Beacon | Scout move speed increase |
| Carrier Capacity | 100M/100G | 63s | Fleet Beacon | Carrier interceptor capacity 4 → 8 |
| Apial Sensors | 100M/100G | 104.58s | Fleet Beacon | Scout sight 8 → 10 |
| Argus Jewel | 100M/100G | 104.58s | Fleet Beacon | Corsair max energy 200 → 250 |
| Disruption Web | 200M/200G | 50s | Fleet Beacon | Unlocks Disruption Web |
| Sensor Array | 150M/150G | 83.79s | Observatory | Observer sight 9 → 11 |
| Gravitic Boosters | 150M/150G | 83.79s | Observatory | Observer move speed +~50% |
| Psionic Storm | 200M/200G | 75.6s | Templar Archives | Unlocks Psionic Storm |
| Hallucination | 150M/150G | 50.4s | Templar Archives | Unlocks Hallucination |
| Khaydarin Amulet | 150M/150G | 104.58s | Templar Archives | High Templar max energy 200 → 250 |
| Maelstrom | 100M/100G | 63s | Templar Archives | Unlocks Maelstrom |
| Mind Control | 200M/200G | 75.6s | Templar Archives | Unlocks Mind Control |
| Argus Talisman | 150M/150G | 104.58s | Templar Archives | Dark Archon max energy 200 → 250 |
| Stasis Field | 150M/150G | 63s | Arbiter Tribunal | Unlocks Stasis Field |
| Recall | 150M/150G | 75.6s | Arbiter Tribunal | Unlocks Recall |
| Khaydarin Core | 150M/150G | 104.58s | Arbiter Tribunal | Arbiter max energy 200 → 250 |

### Zerg

#### Weapon, Carapace & Air (3 levels each)

| Upgrade | L1 | L2 | L3 | Increment | Building | Effect |
|---|---|---|---|---|---|---|
| Melee Attacks | 100M/100G, 167.58s | 150M/150G, 180.18s | 200M/200G, 192.78s | +50/+50 | Evolution Chamber | Zergling +1, Ultralisk +3, Broodling +1 per level |
| Missile Attacks | 100M/100G, 167.58s | 150M/150G, 180.18s | 200M/200G, 192.78s | +50/+50 | Evolution Chamber | Hydralisk +1, Lurker +2 per level |
| Carapace | 150M/150G, 167.58s | 225M/225G, 180.18s | 300M/300G, 192.78s | +75/+75 | Evolution Chamber | Ground units +1 armor/level |
| Flyer Attacks | 100M/100G, 167.58s | 175M/175G, 180.18s | 250M/250G, 192.78s | +75/+75 | Spire / Greater Spire | Mutalisk +1, Guardian/Devourer +2 per level |
| Flyer Carapace | 150M/150G, 167.58s | 225M/225G, 180.18s | 300M/300G, 192.78s | +75/+75 | Spire / Greater Spire | Air units +1 armor/level |

#### Ability / Mobility / Reactor

| Upgrade | Cost | Time | Building | Effect |
|---|---|---|---|---|
| Metabolic Boost | 100M/100G | 63s | Spawning Pool | Zergling move speed +~50% |
| Adrenal Glands | 200M/200G | 63s | Spawning Pool (Hive) | Zergling attack speed increase |
| Muscular Augments | 150M/150G | 63s | Hydralisk Den | Hydralisk move speed +~50% |
| Grooved Spines | 150M/150G | 63s | Hydralisk Den | Hydralisk range 4 → 5 |
| Lurker Aspect | 200M/200G | 75.6s | Hydralisk Den | Allows Hydralisk → Lurker morph |
| Pneumatized Carapace | 150M/150G | 83.79s | Lair/Hive | Overlord move speed increase |
| Ventral Sacs | 200M/200G | 100.8s | Lair/Hive | Overlords can transport ground units |
| Antennae | 150M/150G | 83.79s | Lair/Hive | Overlord sight 9 → 11 |
| Anabolic Synthesis | 200M/200G | 83.79s | Ultralisk Cavern | Ultralisk move speed +~50% |
| Chitinous Plating | 150M/150G | 83.79s | Ultralisk Cavern | Ultralisk armor +2 |
| Gamete Meiosis | 150M/150G | 104.58s | Queen's Nest | Queen max energy 200 → 250 |
| Ensnare | 100M/100G | 50s | Queen's Nest | Unlocks Ensnare |
| Spawn Broodling | 100M/100G | 50s | Queen's Nest | Unlocks Spawn Broodling |
| Metasynaptic Node | 150M/150G | 104.58s | Defiler Mound | Defiler max energy 200 → 250 |
| Plague | 200M/200G | 63s | Defiler Mound | Unlocks Plague |
| Consume | 100M/100G | 63s | Defiler Mound | Unlocks Consume |

---

## Notes / caveats for the engine

- **Cloak energy:** ~25 to activate + a per-second drain (Ghost ~0.93/s, Wraith ~0.19/s per
  Liquipedia; these per-second figures differ between pages — treat the drain as approximate
  and pin it to frame-based engine constants).
- **"Costs 0" abilities:** Stim Pack (costs 10 HP), Nuclear Strike (consumes a built missile),
  Consume (costs 0, *gains* 50), Infest CC (autocast) all cost 0 energy.
- **Feedback** deals damage equal to the target's current energy and drains it all.
- Repeated research times 167.58 / 180.18 / 192.78 (L1/L2/L3 weapon-armor) and 104.58 (most
  reactor/sight upgrades) are consistent across the table.
- Source: [Upgrades](https://liquipedia.net/starcraft/Upgrades), [Spells](https://liquipedia.net/starcraft/Spells), and individual ability pages.
