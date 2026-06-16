import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

const designs = {
  'SCV': {
    primitive: 'squat hexagon body + 2 tread rectangles + 2 small forward claw lines + 1 core circle',
    brief: 'Make a tiny worker vehicle glyph: blocky hex cabin, side treads, two short tool arms at the nose, one power dot.',
    svg: ['polygon hex cabin', '2 rounded rectangles for treads', '2 short line claws', '1 circle core'],
    omit: 'driver, legs, hoses, construction texture, perspective cabin height',
  },
  'Marine': {
    primitive: '3 ovals/circles + 1 rifle line: helmet oval, 2 pauldron circles, straight gun bar',
    brief: 'Make the Marine almost absurdly simple: a center helmet oval, two shoulder ovals, and one long rifle stroke pointing forward.',
    svg: ['1 helmet ellipse', '2 pauldron circles/ellipses', '1 straight rifle line or thin rounded rectangle'],
    omit: 'torso, legs, hands, backpack, armor panel noise, face, boots',
  },
  'Firebat': {
    primitive: 'Marine base + 2 oversized shoulder ovals + 2 short flame/nozzle bars',
    brief: 'Use the Marine glyph family, but widen the shoulders and replace the rifle with twin short forward flamers.',
    svg: ['1 helmet ellipse', '2 large pauldron ellipses', '2 parallel nozzle lines', 'optional 2 tiny flame arcs'],
    omit: 'full body, backpack, hands, rendered fire, hoses, legs',
  },
  'Medic': {
    primitive: 'Marine base + small shoulder ovals + 1 medical cross',
    brief: 'Use the Marine glyph family, shrink the shoulders, remove the weapon, and put a clean cross on the center.',
    svg: ['1 helmet/body ellipse', '2 small shoulder ellipses', '2 crossing short lines for the cross'],
    omit: 'staff, face, backpack equipment, legs, complex medical gear',
  },
  'Ghost': {
    primitive: 'Marine base + small shoulder ovals + 1 extra-long rifle line',
    brief: 'Use the Marine glyph family, make the body narrower, shrink the shoulders, and give it a long sniper rifle line.',
    svg: ['1 narrow helmet ellipse', '2 small pauldron ellipses', '1 long rifle line', 'optional cloak wedge behind'],
    omit: 'face, hair, cloak folds, legs, pouches, binocular details',
  },
  'Vulture': {
    primitive: 'long hover-bike wedge + 2 rear fin arcs + 1 nose cannon line',
    brief: 'Flatten it into a fast bike icon: a narrow spear body, two rear fins, and a small front gun.',
    svg: ['1 long wedge polygon', '2 rear fin paths', '1 nose line', '1 tiny cockpit oval'],
    omit: 'rider, wheels, exhaust effects, underside machinery',
  },
  'Siege Tank': {
    primitive: '2 tread rectangles + 1 turret circle/hex + 1 forward barrel line',
    brief: 'Classic top-down tank: wide tread blocks, centered turret, one readable barrel.',
    svg: ['2 rounded rectangles for treads', '1 central turret circle or hex', '1 barrel line/rect'],
    omit: 'tiny panels, height, track links, secondary guns',
  },
  'Siege Tank (Siege Mode)': {
    primitive: '2 braced tread rectangles + 2 side stabilizer lines + 1 very long cannon',
    brief: 'Make tank mode look deployed: wider stance, visible side braces, and the longest cannon in the Terran ground set.',
    svg: ['2 wide tread rectangles', '2-4 stabilizer lines', '1 central turret', '1 long cannon line'],
    omit: 'crew, tiny screws, perspective barrel shading',
  },
  'Goliath': {
    primitive: 'box torso + 2 leg rectangles + 2 shoulder weapon pods',
    brief: 'Do not draw a humanoid; draw a compact walker glyph with a square center and four chunky mechanical protrusions.',
    svg: ['1 square/hex torso', '2 lower leg rectangles', '2 side pod rectangles', 'short gun lines'],
    omit: 'head, arms, feet detail, biped anatomy, tiny missiles',
  },
  'Wraith': {
    primitive: 'narrow center dart + 2 swept wing triangles + 2 tail prongs',
    brief: 'A small Terran fighter: sharp central dart, swept wings, and tail prongs.',
    svg: ['1 dart polygon', '2 wing triangles', '2 short tail lines', '1 cockpit oval'],
    omit: 'engine texture, underside detail, missile mounts',
  },
  'Dropship': {
    primitive: 'box transport oval/rect + 2 side pod ovals + rear ramp line',
    brief: 'Make it read as a transport, not a fighter: rounded cargo block, side engines, rear ramp.',
    svg: ['1 rounded rectangle hull', '2 side pod ellipses', '1 rear ramp line', 'small nose mark'],
    omit: 'windows, landing gear, hull plating noise',
  },
  'Science Vessel': {
    primitive: 'large sensor circle + 2 side pods + 1 dish/radar arc',
    brief: 'A floating detector: round saucer body, side nodes, and a clear sensor dish/arc.',
    svg: ['1 main circle', '2 side circles', '1 radar arc path', '1 core circle'],
    omit: 'struts, tiny probes, complex underside',
  },
  'Valkyrie': {
    primitive: 'wide frigate bar + 4 side missile pod rectangles + nose wedge',
    brief: 'Make it wider than Wraith and busier only in silhouette: a missile rack aircraft with paired side pods.',
    svg: ['1 wide hull polygon', '4 small side rectangles', '1 nose triangle', '2 tail lines'],
    omit: 'individual rockets, cockpit detail, perspective wings',
  },
  'Battlecruiser': {
    primitive: 'large long capital hull + broad shoulder blocks + blunt nose',
    brief: 'Largest Terran air silhouette: a long fortress ship with blocky shoulders and one central bridge/core.',
    svg: ['1 long hull polygon', '2 broad side block polygons', '1 nose wedge', '1 core circle'],
    omit: 'turret fields, windows, tiny decks, surface greebles',
  },
  'Spider Mine': {
    primitive: 'tiny triangle + 3 short prong lines + 1 center dot',
    brief: 'A readable mine at tiny size: triangular body, three legs/prongs, one glow dot.',
    svg: ['1 small triangle', '3 short lines', '1 tiny circle'],
    omit: 'many mechanical legs, shadows, underside',
  },
  'Nuclear Missile': {
    primitive: 'long missile capsule + 2 fin triangles + warning core dot',
    brief: 'A simple top-down missile: narrow capsule with fins and one hot center dot.',
    svg: ['1 long rounded rect/path', '2 fin triangles', '1 core circle', '1 nose line'],
    omit: 'smoke, labels, warhead markings, metal texture',
  },

  'Probe': {
    primitive: 'forward V/boomerang + 1 center core + 2 tiny side nodes',
    brief: 'Ignore source perspective: make a forward-pointing V or boomerang, point facing up, with a small energy core.',
    svg: ['1 V-shaped path/polygon', '1 core circle', '2 small side circles'],
    omit: 'four-point star symmetry, dangling underside, tiny worker beam',
  },
  'Zealot': {
    primitive: 'Marine-like 3 ovals + 2 sword arcs instead of rifle',
    brief: 'Use the infantry glyph family: helmet/shoulders like a Marine, but the identity is two clean psi-blade arcs.',
    svg: ['1 helmet ellipse', '2 shoulder ellipses', '2 curved blade paths'],
    omit: 'legs, cloth, face, hands, blade texture',
  },
  'Dragoon': {
    primitive: '1 orb/shell + 4 simple legs',
    brief: 'Make it unmistakably a walker orb: central round shell with four legs radiating diagonally.',
    svg: ['1 central circle/ellipse', '4 leg lines or tapered paths', '1 core circle'],
    omit: 'extra leg joints, gold plating, face, underside',
  },
  'High Templar': {
    primitive: 'small robe teardrop + large psi halo circle/arc',
    brief: 'A fragile caster glyph: tiny central robe/body inside a much larger energy halo.',
    svg: ['1 teardrop body path', '1 halo circle/arc', '1 small core'],
    omit: 'arms, face, robe folds, staffs, legs',
  },
  'Dark Templar': {
    primitive: 'dark narrow cloak wedge + 1 long crescent blade',
    brief: 'A stealth melee glyph: narrow cloaked body with one asymmetric crescent blade sweeping forward.',
    svg: ['1 narrow wedge/teardrop', '1 crescent path', '1 small core'],
    omit: 'cloth detail, face, limbs, dual anatomy',
  },
  'Archon': {
    primitive: 'large glowing orb + 2 arm flare arcs',
    brief: 'An energy being, not a body: big orb center with two symmetric arm flares.',
    svg: ['1 large circle', '2 side arc paths', '1-2 inner rings'],
    omit: 'legs, face, armor, fingers, anatomy',
  },
  'Dark Archon': {
    primitive: 'large orb + crescent shell arcs + darker hollow center',
    brief: 'Sibling to Archon, but more enclosed and crescent-like: orb wrapped by two shadowy shell arcs.',
    svg: ['1 large circle/ellipse', '2 crescent arc paths', '1 hollow inset circle'],
    omit: 'humanoid body, face, hands, detailed smoke',
  },
  'Reaver': {
    primitive: 'heavy beetle oval + front mouth notch + 2 side tread/leg arcs',
    brief: 'A lumbering robotics beetle: wide oval shell, front launch mouth, simple side supports.',
    svg: ['1 large oval/pill body', '1 front notch/inset', '2 side arcs', '1 core'],
    omit: 'many legs, internal machinery, surface plating noise',
  },
  'Scarab': {
    primitive: 'tiny glowing orb',
    brief: 'Treat Scarab as a projectile/resource glyph: one bright orb with a small ring, no reference image needed.',
    svg: ['1 small circle', 'optional 1 ring circle'],
    omit: 'beetle body, legs, wings, any complex detail',
  },
  'Observer': {
    primitive: 'tiny eye/lens circle + 2 side fin arcs',
    brief: 'A small detector drone: central lens dot, two side fins, very little else.',
    svg: ['1 lens circle', '2 fin arc paths', '1 small body ellipse'],
    omit: 'weapon cues, many antennae, underside',
  },
  'Shuttle': {
    primitive: 'oval transport shell + 2 side nacelle ovals + hollow center',
    brief: 'Protoss transport: rounded hollow body with side nacelles, slower and fuller than a fighter.',
    svg: ['1 large oval/capsule', '2 side ellipses', '1 dark inset oval'],
    omit: 'windows, landing gear, perspective underside',
  },
  'Scout': {
    primitive: 'fighter dart + 2 curved wings + center cockpit/core',
    brief: 'A Protoss fighter: cleaner and more curved than Wraith, with a bright center core.',
    svg: ['1 central dart', '2 curved wing paths', '1 core circle'],
    omit: 'tiny weapon mounts, plating, underside',
  },
  'Carrier': {
    primitive: 'large crescent hull + 2 bay slots + center core',
    brief: 'Protoss capital ship: broad crescent hull with simple interceptor bay marks.',
    svg: ['1 wide crescent/oval path', '2 inset bay lines/rects', '1 core circle'],
    omit: 'individual interceptors on the hull, tiny decks, plating',
  },
  'Interceptor': {
    primitive: 'tiny diamond dart + 1 core dot',
    brief: 'A one-bite fighter glyph: diamond body, point forward, one glow dot.',
    svg: ['1 diamond polygon', '1 tiny circle'],
    omit: 'wings, cockpit detail, weapon marks',
  },
  'Arbiter': {
    primitive: 'round saucer/crescent + 1 stasis core + cloak ring',
    brief: 'A magical saucer: round/crescent hull with a central stasis core and subtle outer ring.',
    svg: ['1 round/crescent body', '1 core circle', '1 outer arc/ring'],
    omit: 'underside, small fins, tiny surface details',
  },
  'Corsair': {
    primitive: 'thin crescent fighter + split wing tips + tiny core',
    brief: 'A fast crescent air unit: thin boomerang silhouette with split tips.',
    svg: ['1 crescent path', '2 split-tip lines', '1 core circle'],
    omit: 'cockpit detail, missiles, plating texture',
  },

  'Larva': {
    primitive: 'small curled comma + 2 segment arcs + head dot',
    brief: 'A tiny curled grub icon, readable as production larva without drawing anatomy.',
    svg: ['1 comma-shaped path', '2 short segment arcs', '1 head circle'],
    omit: 'legs, teeth, texture, slime',
  },
  'Egg': {
    primitive: 'vertical oval cocoon + 2 vein curves + glow slit',
    brief: 'An organic cocoon: simple oval with a central slit and a couple of curved vein lines.',
    svg: ['1 oval', '2 curve lines', '1 small slit ellipse/line'],
    omit: 'surface bumps, slime, cracks everywhere',
  },
  'Drone': {
    primitive: 'beetle oval + 2 small mandible arcs + rear abdomen line',
    brief: 'Zerg worker: compact beetle body, tiny front mandibles, one rear segment.',
    svg: ['1 oval/teardrop body', '2 mandible arcs', '1 rear segment line', '1 core'],
    omit: 'legs, worker beam, shell texture',
  },
  'Overlord': {
    primitive: 'large floating sac oval + 3 tentacle lines + 2 eye dots',
    brief: 'A slow supply creature: big bag body, hanging tentacles, two small eyes/cores.',
    svg: ['1 large oval/blob path', '3 tentacle paths', '2 small circles'],
    omit: 'many appendages, facial detail, belly texture',
  },
  'Zergling': {
    primitive: 'jaw wedge + longer torso oval + 2 forward claw arcs',
    brief: 'The simplest swarm attacker: open jaws at the front, a small elongated torso, and two forward claw arcs.',
    svg: ['1 head/jaw wedge path', '1 long torso oval/path', '2 forward claw arc paths'],
    omit: 'many legs, teeth rows, horns, detailed carapace',
  },
  'Hydralisk': {
    primitive: 'Marine-like center head + large jaws + 2 mantis/back-wing arcs instead of pauldrons',
    brief: 'Read it like an alien ranged infantry glyph: central head/torso, oversized jaws, and two back mantis arcs where shoulders would be.',
    svg: ['1 central head/torso oval', '2 jaw arcs', '2 mantis/back-wing arcs', 'optional spine line'],
    omit: 'tail coil, many teeth, legs/feet, underbody texture',
  },
  'Lurker': {
    primitive: 'low buried oval + 4 long lateral spike lines + front head notch',
    brief: 'A buried threat glyph: flat body with side spikes stretching wider than the body.',
    svg: ['1 low oval/path', '4 side spike lines', '1 front notch/core'],
    omit: 'upright posture, many legs, dirt mound detail',
  },
  'Mutalisk': {
    primitive: 'larger Scourge-like manta: 2 big wing arcs + long center body + forked tail',
    brief: 'Because the sprite reads close to Scourge, make Mutalisk the bigger manta version: wide bat wings, longer body, and forked tail.',
    svg: ['2 large wing arc paths', '1 long body teardrop', '2 tail fork lines', '1 head/core'],
    omit: 'ribbed wing membrane detail, belly, tiny claws, full monster anatomy',
  },
  'Scourge': {
    primitive: 'tiny Mutalisk seed: small wing pair + round bomb body + split tail',
    brief: 'Keep it related to Mutalisk but much smaller and more explosive: round center body, tiny wings, split tail.',
    svg: ['1 round/teardrop body', '2 small wing arcs', '2 split tail lines'],
    omit: 'large manta wings, long torso, detailed face',
  },
  'Guardian': {
    primitive: 'heavy crab flyer + wide side claws/wings + long abdomen',
    brief: 'Make Guardian slower and heavier than Mutalisk: broad crab-like front, long abdomen, fat side wings/claws.',
    svg: ['1 broad front oval', '2 wide side claw/wing arcs', '1 long abdomen path'],
    omit: 'small wing membrane detail, legs, underside',
  },
  'Devourer': {
    primitive: 'fat air shell + big front maw/horn + stubby wings',
    brief: 'The biggest Zerg air attacker: swollen shell, large maw at the nose, short heavy wings.',
    svg: ['1 fat oval/shell path', '1 front maw notch/arc', '2 stubby wing paths', '1 core'],
    omit: 'purple belly ribs, many teeth, texture',
  },
  'Queen': {
    primitive: 'slender insect body + 2 side wing arcs + long tail line',
    brief: 'A caster flyer: elegant insect body, light wings, long trailing tail, less bulky than Mutalisk.',
    svg: ['1 slender body path', '2 wing arcs', '1 tail line', '1 head/core'],
    omit: 'legs, face, membrane veins, underside',
  },
  'Defiler': {
    primitive: 'flipped Sunken Colony glyph: low spined body + root/tail arcs + caster core',
    brief: 'Use the existing Sunken Colony defense sprite language, flipped into a mobile caster: low spined body, rootlike arcs, small caster core.',
    svg: ['1 low tapered body path', '2 root/tentacle arcs', 'short spine lines', '1 core circle'],
    omit: 'building base, many legs, texture, upright monster anatomy',
  },
  'Ultralisk': {
    primitive: 'huge oval body + 2 massive tusk/scythe arcs + head plate',
    brief: 'Largest Zerg ground silhouette: big body, two huge forward tusk arcs, simple head plate.',
    svg: ['1 large oval/blob body', '2 huge tusk arc paths', '1 head plate polygon', '1 core'],
    omit: 'small legs, carapace texture, many spikes',
  },
  'Infested Terran': {
    primitive: 'small Marine-like blob + swollen explosive core circle',
    brief: 'A corrupted infantry glyph: tiny humanoid/Marine base almost swallowed by one big unstable core.',
    svg: ['1 small body oval', '2 tiny shoulder blobs', '1 oversized core circle'],
    omit: 'face, rifle, legs, gore texture',
  },
  'Broodling': {
    primitive: 'mini Zergling: tiny jaw wedge + 2 small claw arcs',
    brief: 'Simpler and smaller than Zergling: tiny jaws and two claw arcs, no long torso emphasis.',
    svg: ['1 tiny head wedge', '1 small body oval', '2 claw arcs'],
    omit: 'many legs, horns, detailed shell',
  },

  'Command Center': {
    primitive: 'large octagon footprint + 4 corner blocks + central landing circle',
    brief: 'Terran HQ as a top-down fortress pad: octagon base, corner bastions, central command/landing ring.',
    svg: ['1 octagon polygon', '4 small corner rectangles', '1 central circle', 'cross lines'],
    omit: 'height, windows, antenna clutter, perspective walls',
  },
  'Supply Depot': {
    primitive: 'flat rectangle pad + central mast/antenna + 2 crossbars',
    brief: 'A supply structure icon: simple ground pad and antenna mast, not a perspective tower.',
    svg: ['1 rounded rectangle base', '1 vertical line mast', '2 horizontal crossbar lines', '1 top dot'],
    omit: 'side walls, ramps, crates, perspective height',
  },
  'Refinery': {
    primitive: 'geyser ring + 2 tank circles + central pipe',
    brief: 'Terran gas building: mechanical ring over a vent, paired tanks, central pipe glow.',
    svg: ['1 ring/rounded rectangle base', '2 tank circles', '1 center pipe rectangle', 'gas core'],
    omit: 'walkways, tiny pipes, height detail',
  },
  'Barracks': {
    primitive: 'rectangular factory block + front door slot + 2 roof chevrons',
    brief: 'Infantry production: blocky rectangle, obvious bay door, two roof vents/chevrons.',
    svg: ['1 rounded rectangle', '1 dark door rectangle', '2 chevron polylines', '1 beacon dot'],
    omit: 'windows, ramps, wall texture, perspective roof',
  },
  'Engineering Bay': {
    primitive: 'square workshop + 2 side wing rectangles + central wrench/core mark',
    brief: 'Upgrade workshop: square block with side wings and one technical center mark.',
    svg: ['1 square/rounded rect', '2 side rectangles', '1 small core circle', 'short tool lines'],
    omit: 'tiny machinery, roof detail, height',
  },
  'Bunker': {
    primitive: 'small squat octagon + 4 firing slit lines',
    brief: 'A compact defensive pillbox: low octagon footprint and firing slits on the sides.',
    svg: ['1 small octagon polygon', '4 short slit lines', '1 central dot'],
    omit: 'soldiers, sandbags, perspective wall thickness',
  },
  'Academy': {
    primitive: 'rectangular block + training ring/circle + antenna dot',
    brief: 'Terran tech/training building: block footprint with one central training-ring motif.',
    svg: ['1 rectangle/hex base', '1 central circle', '1 antenna line/dot'],
    omit: 'windows, small props, roof clutter',
  },
  'Missile Turret': {
    primitive: 'small base circle + rotating turret cross + 2 missile lines',
    brief: 'Anti-air tower: central pivot with a clear twin-launcher cross.',
    svg: ['1 base circle', '1 turret line/cross', '2 missile rectangles/lines', '1 core'],
    omit: 'lattice tower detail, height, individual missiles',
  },
  'Factory': {
    primitive: 'large rectangle block + wide vehicle bay + 2 smokestack circles',
    brief: 'Vehicle production: wide industrial block, large garage mouth, two stack/vent circles.',
    svg: ['1 large rounded rect', '1 dark bay rectangle', '2 stack circles', 'vent lines'],
    omit: 'pipes everywhere, roof texture, perspective ramps',
  },
  'Machine Shop': {
    primitive: 'small add-on rectangle + gear circle + pipe line',
    brief: 'Factory add-on: compact side lab with one gear/core circle and a pipe connection.',
    svg: ['1 small rectangle', '1 gear/core circle', '1 connector line'],
    omit: 'full standalone factory details, tiny machinery',
  },
  'Starport': {
    primitive: 'landing pad ring + 2 hangar arms + runway center line',
    brief: 'Air production: pad/ring footprint with two arms and a clear runway/hangar line.',
    svg: ['1 large circle/rounded pad', '2 side arm rectangles', '1 center runway line', '1 core'],
    omit: 'height, gantries, tiny lights',
  },
  'Control Tower': {
    primitive: 'add-on square + radar dish circle/arc + antenna line',
    brief: 'Starport add-on: small control block with radar dish motif.',
    svg: ['1 small square/rect', '1 dish arc/circle', '1 antenna line', '1 dot'],
    omit: 'windows, tower height, many antennas',
  },
  'Armory': {
    primitive: 'armored hex block + central shield/plate + 2 side vents',
    brief: 'Weapons upgrade building: heavy hexagonal block with a bold central armor plate.',
    svg: ['1 hex polygon', '1 central shield polygon', '2 vent lines'],
    omit: 'tiny guns, interior tools, roof clutter',
  },
  'Science Facility': {
    primitive: 'large lab circle/oval + 2 module pods + central reactor core',
    brief: 'Advanced lab: rounder than other Terran buildings, with two side modules and a glowing core.',
    svg: ['1 oval/rounded rect', '2 pod circles/rects', '1 central core circle', 'ring line'],
    omit: 'small domes, windows, platform height',
  },
  'Physics Lab': {
    primitive: 'add-on pod + atom/orbit ring + small core',
    brief: 'Science add-on: compact pod marked by an atom-like orbit ring.',
    svg: ['1 small oval/rect pod', '1 orbit ellipse', '1 core circle'],
    omit: 'many instruments, height, cables',
  },
  'Covert Ops': {
    primitive: 'add-on pod + stealth eye/slit + antenna spike',
    brief: 'Ghost tech add-on: darker compact pod with a single eye/slit motif.',
    svg: ['1 small rect/hex pod', '1 narrow slit ellipse/line', '1 antenna line'],
    omit: 'satellites, rooms, detailed panels',
  },
  'Comsat Station': {
    primitive: 'add-on block + satellite dish circle/arc + scan beam line',
    brief: 'Scanner add-on: small block with one unmistakable dish and scan arc.',
    svg: ['1 small rectangle', '1 dish arc/circle', '1 diagonal scan line', '1 dot'],
    omit: 'tower height, support struts, many antennae',
  },
  'Nuclear Silo': {
    primitive: 'vertical silo capsule + hazard core + 2 side clamps',
    brief: 'Nuke add-on: long silo capsule with two clamps and a warning-hot core.',
    svg: ['1 long capsule/rounded rect', '2 side clamp lines', '1 core circle'],
    omit: 'full missile render, labels, tiny warning signs',
  },

  'Nexus': {
    primitive: 'large rounded diamond/oval + central crystal circle + 4 energy ribs',
    brief: 'Protoss HQ: smooth symmetrical base around a central crystal/core.',
    svg: ['1 rounded diamond/oval path', '1 central circle', '4 short rib lines/arcs'],
    omit: 'gold detail, height, stairs, tiny pylons',
  },
  'Pylon': {
    primitive: 'tall diamond crystal + energy ring/base circle',
    brief: 'A power crystal glyph: one diamond shard in a circular field.',
    svg: ['1 diamond polygon', '1 base circle/ring', '1 core circle'],
    omit: 'stand height, tiny prongs, texture',
  },
  'Assimilator': {
    primitive: 'gas ring + 3 curved prongs + green core vent',
    brief: 'Protoss gas building: elegant ring over vent, three curved prongs, glowing core.',
    svg: ['1 circular/oval ring', '3 curved prong paths', '1 center core'],
    omit: 'platform height, small fins, vents everywhere',
  },
  'Gateway': {
    primitive: 'wide arch/crescent + central portal oval + 2 side pillars',
    brief: 'Unit warp building: a gate icon seen from above, with portal center and two side pillars.',
    svg: ['1 arch/capsule path', '1 dark portal oval', '2 pillar ellipses/rects', 'core'],
    omit: 'stairs, upright arch height, panel decoration',
  },
  'Forge': {
    primitive: 'compact diamond block + hammer/anvil core line + 2 side fins',
    brief: 'Upgrade forge: dense diamond workshop with one technical central mark.',
    svg: ['1 diamond/hex body', '2 side fin polygons', '1 core circle', 'short tool line'],
    omit: 'tiny machinery, flame, gold trim',
  },
  'Photon Cannon': {
    primitive: 'base circle + 4 petal legs + central cannon orb',
    brief: 'Protoss defense: four-point base with a single orb/cannon in the middle.',
    svg: ['1 base circle/ring', '4 small petal polygons/ellipses', '1 central orb'],
    omit: 'turret height, tiny braces, crystal texture',
  },
  'Cybernetics Core': {
    primitive: 'triangular/diamond tech core + 3 node circles',
    brief: 'Tech building: angular core with three connected nodes.',
    svg: ['1 diamond/triangle body', '3 small node circles', '2-3 connector lines'],
    omit: 'standing towers, tiny fins, surface panels',
  },
  'Shield Battery': {
    primitive: 'small round battery + 2 crescent shield arcs + center core',
    brief: 'Energy refill building: small round core wrapped in shield arcs.',
    svg: ['1 small circle/oval body', '2 crescent arcs', '1 core circle'],
    omit: 'base legs, intricate crystal supports',
  },
  'Robotics Facility': {
    primitive: 'long oval factory + 2 side bays + rear robotics pad',
    brief: 'Robotics production: elongated smooth factory with two clear side bays.',
    svg: ['1 long oval/rounded rectangle', '2 side bay rectangles/ellipses', '1 center line/core'],
    omit: 'upright pylons, tiny struts, surface plating',
  },
  'Stargate': {
    primitive: 'large open ring/crescent + 2 launch prongs',
    brief: 'Air warp building: open ring/portal with two launch prongs, more hollow than Gateway.',
    svg: ['1 open crescent/ring path', '2 prong polygons/lines', '1 center core/ring'],
    omit: 'height, tiny lights, full platform detail',
  },
  'Citadel of Adun': {
    primitive: 'ceremonial diamond + 2 blade-like side arcs + core',
    brief: 'Zealot tech building: a temple-like diamond with blade arcs, tying it to melee upgrades.',
    svg: ['1 diamond body', '2 side blade arcs', '1 core circle'],
    omit: 'stairs, statues, gold ornament',
  },
  'Templar Archives': {
    primitive: 'library oval/diamond + 2 scroll/psi rings + center halo',
    brief: 'Caster tech building: quiet symmetrical archive with a psi halo motif.',
    svg: ['1 oval/diamond body', '2 ring/circle marks', '1 central halo/core'],
    omit: 'walls, small windows, surface decoration',
  },
  'Robotics Support Bay': {
    primitive: 'support pod rectangle/oval + 2 gear nodes + connector line',
    brief: 'Robotics add-on building: compact workshop pod with paired gear-like nodes.',
    svg: ['1 rounded rectangle/oval body', '2 node circles', '1 connector line'],
    omit: 'tools, tiny arms, platform height',
  },
  'Observatory': {
    primitive: 'round observatory disk + big lens circle + antenna arc',
    brief: 'Detector tech building: round disk dominated by a lens.',
    svg: ['1 disk circle', '1 larger lens circle/inset', '1 antenna/radar arc'],
    omit: 'tower height, windows, many dishes',
  },
  'Fleet Beacon': {
    primitive: 'tall beacon diamond + 2 orbit rings + top core',
    brief: 'Capital ship tech: beacon crystal with orbit rings, taller in concept but flattened into rings and diamond.',
    svg: ['1 diamond/crystal polygon', '2 orbit ellipses', '1 top/core circle'],
    omit: 'stairs, tiny crystals, height shading',
  },
  'Arbiter Tribunal': {
    primitive: 'round tribunal disk + crescent stasis motif + 3 nodes',
    brief: 'Arbiter tech: formal circular disk with crescent/stasis mark.',
    svg: ['1 large circle/oval body', '1 crescent arc', '3 node circles'],
    omit: 'columns, tiny ornaments, perspective height',
  },

  'Hatchery': {
    primitive: 'large organic blob + 3 sac circles + 3 root lines',
    brief: 'Zerg HQ: broad living mound with a few sacs and root tendrils, not a detailed nest.',
    svg: ['1 large blob path', '3 sac circles', '3 root/tentacle lines', '1 core'],
    omit: 'egg clutter, surface texture, tiny larvae',
  },
  'Lair': {
    primitive: 'Hatchery blob + taller central spire/eye + extra root arcs',
    brief: 'Upgrade of Hatchery: same living mound, but sharper central eye/spire and more root arcs.',
    svg: ['1 blob path', '1 central spire/eye oval', '3-4 root arcs', 'sac circles'],
    omit: 'dense growth texture, perspective height',
  },
  'Hive': {
    primitive: 'largest Zerg HQ blob + crown spikes + many root arcs',
    brief: 'Final HQ: biggest organic mound, crown-like spikes, root network around the edge.',
    svg: ['1 large blob path', '3-5 crown spike lines/polygons', 'root arcs', 'central core'],
    omit: 'surface bumps, many holes, height shading',
  },
  'Creep Colony': {
    primitive: 'small root mound + central sprout dot + 3 root lines',
    brief: 'Base colony: small organic mound with roots, intentionally less weapon-like than Sunken or Spore.',
    svg: ['1 small blob/circle', '3 root lines', '1 sprout/core circle'],
    omit: 'spikes, turret features, many tentacles',
  },
  'Sunken Colony': {
    primitive: 'root base + tall central spike triangle + side barb lines',
    brief: 'Ground defense: the existing sprite language is good, a central spine rising from a root base.',
    svg: ['1 root/base blob', '1 tall spike triangle/path', '2-4 side barb lines', '1 core'],
    omit: 'building wall, many textures, perspective trunk',
  },
  'Spore Colony': {
    primitive: 'root base + round spore bulb + 3 antenna/spore arcs',
    brief: 'Air defense: same colony family, but bulbous spore head instead of a spear spike.',
    svg: ['1 root/base blob', '1 bulb circle/oval', '3 antenna arcs/lines', 'small dots'],
    omit: 'central spear, complex mushroom texture',
  },
  'Spawning Pool': {
    primitive: 'organic basin oval + dark pool circle + 3 teeth/spikes',
    brief: 'Unit production pool: wide basin with a dark central pool and a few teeth.',
    svg: ['1 basin oval/blob', '1 dark pool ellipse', '3 small spike triangles', '1 core'],
    omit: 'liquid rendering, many teeth, surface bumps',
  },
  'Evolution Chamber': {
    primitive: 'round mutation sac + 4 vein arcs + center eye/core',
    brief: 'Upgrade organ: bulbous chamber with veins and a single center eye/core.',
    svg: ['1 round blob', '4 vein arcs', '1 center core circle'],
    omit: 'many pods, high mound, texture',
  },
  'Hydralisk Den': {
    primitive: 'den mound + 2 jaw arcs + spine line',
    brief: 'Hydralisk-themed building: mound that echoes jaws and spine, not a literal creature.',
    svg: ['1 mound/blob path', '2 jaw arc paths', '1 spine line', '1 core'],
    omit: 'full hydralisk body, many teeth, cave texture',
  },
  'Extractor': {
    primitive: 'organic gas ring + 3 tendrils + center vent',
    brief: 'Zerg gas structure: living ring over a vent, with a few tendrils gripping it.',
    svg: ['1 ring/blob path', '3 tendril paths', '1 vent ellipse/core'],
    omit: 'pipes, many sacs, height',
  },
  'Spire': {
    primitive: 'sharp tower glyph flattened: central spike + 2 wing roots + base blob',
    brief: 'Air tech organ: a spire read from above as a central spike with wing-like roots.',
    svg: ['1 central spike polygon/path', '2 wing/root arcs', '1 base blob', 'core'],
    omit: 'vertical height detail, tiny ribs',
  },
  'Greater Spire': {
    primitive: 'Spire + larger crown/wing arcs + extra core ring',
    brief: 'Upgrade spire: wider and more crowned than Spire, with larger wing arcs.',
    svg: ['1 larger central spike', '2 big crown/wing arcs', '1 ring/core', 'base blob'],
    omit: 'dense ridges, perspective height',
  },
  "Queen's Nest": {
    primitive: 'nest oval + 2 wing-like side arcs + egg/core circles',
    brief: 'Queen tech: organic nest that echoes the Queen flyer with side wing arcs and egg nodes.',
    svg: ['1 nest oval/blob', '2 side wing arcs', '2-3 small egg/core circles'],
    omit: 'many eggs, vines, wall texture',
  },
  'Nydus Canal': {
    primitive: 'large mouth ring + 3 teeth arcs + tunnel core',
    brief: 'Transport tunnel: big organic mouth/portal, a few teeth, dark center.',
    svg: ['1 mouth ring/oval', '3 tooth arcs/triangles', '1 dark center oval', 'root lines'],
    omit: 'full worm body, terrain clutter, many teeth',
  },
  'Ultralisk Cavern': {
    primitive: 'large cavern mound + 2 tusk arcs + heavy doorway',
    brief: 'Ultralisk tech: massive den with two tusk arcs, clearly heavier than other Zerg tech.',
    svg: ['1 large mound/blob', '2 tusk arcs', '1 dark doorway oval', 'core'],
    omit: 'rocks, tiny spikes everywhere, perspective cave walls',
  },
  'Defiler Mound': {
    primitive: 'low mound + 2 root/tentacle arcs + spined caster pit',
    brief: 'Defiler tech: low spined mound echoing the Defiler/Sunken language, with tentacle roots.',
    svg: ['1 low blob/mound', '2 tentacle arcs', 'short spine lines', '1 pit/core circle'],
    omit: 'many small holes, surface texture, height',
  },

  'Mineral Field': {
    primitive: '3-5 faceted crystal polygons',
    brief: 'Neutral mineral patch: cluster of simple cyan crystals, each a polygon shard.',
    svg: ['3-5 crystal polygons', '2-4 facet lines'],
    omit: 'ground tiles, shadows, tiny sparkle noise',
  },
  'Vespene Geyser': {
    primitive: 'crater oval + 2 gas plume curves + green core',
    brief: 'Neutral gas node: dark crater ring with a couple of green rising gas curves.',
    svg: ['1 crater oval/polygon', '2 plume paths', '1 green core circle'],
    omit: 'terrain detail, smoke rendering, complex rocks',
  },
};

const reviewed = {
  'SCV': {
    primitive: 'forklift beetle worker: squat cabin/oval + 2 side block treads + 2 rear exhaust circles + 2 forward claw arcs',
    brief: 'Normalize the lower-right reference into an upward-facing worker beetle/vehicle: compact center body, side blocks, rear exhaust circles, and two forward utility claws.',
    svg: ['1 squat cabin oval/hex', '2 side tread/block rounded rectangles', '2 rear exhaust circles', '2 forward claw arcs/lines', '1 small core'],
    projection: 'The source faces lower-right. Ignore the apparent upright cabin height and leg-like machinery; flatten it into a beetle-like vehicle footprint facing up.',
    animation: 'Keep the two claw arcs separate for harvest/build motions; side blocks can bob subtly during movement; exhaust circles can pulse.',
    omit: 'driver, legs, hoses, construction texture, perspective cabin height, cast shadow',
  },
  'Marine': {
    projection: 'The source faces lower-right and shows legs because of the tilted camera. True top-down is only helmet, shoulder pads, and rifle direction.',
    animation: 'Keep both pauldron ovals separate; they are the movement bob handles. Keep rifle as its own line/rect for attack recoil.',
  },
  'Firebat': {
    primitive: 'Marine family: helmet oval + 2 oversized pauldron ovals + 2 short forward nozzle/flame bars',
    brief: 'Use the Marine glyph family, but make the shoulders much larger and replace the rifle with twin short forward flamers.',
    projection: 'The source faces lower-right and makes tanks/backpack look tall. Collapse the backpack mass into oversized shoulder ovals and short nozzles.',
    animation: 'Keep oversized pauldrons separate for movement bob; keep each flamer/nozzle separate for firing flicker or recoil.',
  },
  'Medic': {
    primitive: 'Marine family: helmet oval + 2 small pauldron ovals + 1 cross mark, no weapon',
    brief: 'Use the Marine glyph family with smaller shoulders and a clean medical cross replacing any weapon read.',
    projection: 'The source faces lower-right. The medical identity is not the tiny gear in the image; flatten it into a cross on the infantry glyph.',
    animation: 'Keep pauldrons separate for movement bob; keep cross/core separate for healing pulse.',
  },
  'Ghost': {
    primitive: 'Marine family: narrow helmet oval + 2 small pauldron ovals + 1 extra-long rifle line',
    brief: 'Use the Marine glyph family, but make it slimmer and make the sniper rifle visibly longer than the Marine rifle.',
    projection: 'The source faces lower-right; do not preserve legs, cloak folds, or body height. The long gun is the read.',
    animation: 'Keep pauldrons separate for movement bob; long rifle line should recoil independently during attack.',
  },
  'Vulture': {
    primitive: 'long spear-nose wedge + 2 rear pod ovals + 1 short center gun/mine line',
    brief: 'Rotate the lower-right source to face up and read it as a fast triangular hover-bike: long nose wedge with two rear pods.',
    svg: ['1 long triangular nose/body polygon', '2 rear pod ellipses', '1 small center line for weapon/mine cue', 'optional cockpit dot'],
    projection: 'Ignore the apparent rider/height and any shadow. The top-down footprint is a spear with rear pods.',
    animation: 'Rear pods can jitter or bob for hover movement; nose/center line points facing and can flash for attack.',
  },
  'Goliath': {
    primitive: 'central crab body + 2 shoulder missile blocks + 2 forward gun arms + 2 leg pads',
    brief: 'Flatten the walker into a compact crab-mech glyph with a central body, shoulder pods, gun arms, and leg pads.',
    svg: ['1 central rounded rectangle/hex', '2 shoulder pod rectangles', '2 forward gun lines/rectangles', '2 lower leg pad rectangles'],
    projection: 'The lower-right reference looks humanoid because of perspective. Do not draw a standing robot; draw the top footprint of a compact walker.',
    animation: 'Leg pads can stomp; forward guns recoil; shoulder pods flash independently for missile fire.',
  },
  'Wraith': {
    primitive: 'split-nose dart + 4 separated engine/pod shapes + swept wing triangles',
    brief: 'A small fighter with a forked nose and separated pods, rotated from lower-right to face up.',
    svg: ['1 forked central dart polygon', '2 swept wing triangles', '2-4 pod ellipses/rectangles', '1 cockpit/core oval'],
    projection: 'Do not keep underside or shadow. The forked nose and separated pods are the true top-down cues.',
    animation: 'Engine pods can pulse; forked nose/cockpit points facing; wing pods remain separate for banking.',
  },
  'Dropship': {
    primitive: 'twin-cylinder transport: 2 long side nacelles + central bridge block + rear fin + front docking hole',
    brief: 'Make it a transport by emphasizing two long nacelles and a central bridge, not fighter wings.',
    svg: ['2 long side capsule/rounded rectangles', '1 central body/bridge polygon', '1 rear fin triangle', '1 front docking circle/oval'],
    projection: 'The source faces lower-right. Collapse cylinder height into capsule footprints; ignore cast shadow.',
    animation: 'The two nacelles are hover bob handles; rear fin can tilt; docking hole/core can pulse.',
  },
  'Science Vessel': {
    primitive: 'large disk hull + 3 or 4 satellite pods + radar/sensor arcs',
    brief: 'Flatten it into a detector disk with separate sensor pods around the perimeter.',
    svg: ['1 large central circle/disk', '3-4 small pod circles', '2 radar arc paths', '1 central core'],
    projection: 'The source shows vertical body mass; in top-down this is a circular disk with pods. Delete underside and height.',
    animation: 'Side pods can orbit/bob; radar arcs can pulse or rotate for detector/science actions.',
  },
  'Valkyrie': {
    primitive: 'wide brick aircraft + 4 missile/wing blocks + blunt nose',
    brief: 'Make it much wider and chunkier than Wraith: a missile rack aircraft with tall side blocks flattened into footprint rectangles.',
    svg: ['1 wide hull rounded rectangle/polygon', '4 missile/wing block rectangles', '1 blunt nose rectangle', 'short rear lines'],
    projection: 'Ignore vertical winglet height; convert the red winglets into side block silhouettes.',
    animation: 'Missile blocks can flash in pairs; hull can bank as one piece.',
  },
  'Battlecruiser': {
    primitive: 'capital H-shape: long central spine + paired broad side arms + blocky bow/core',
    brief: 'Rotate the lower-right source to face up and simplify into a capital ship footprint: long spine, side arms, blocky front.',
    svg: ['1 long central spine rectangle/polygon', '2-4 side arm polygons', '1 blocky bow polygon', '1 forward core circle'],
    projection: 'Do not draw deck height, turrets, or shadow. The top-down read is a long H-like footprint.',
    animation: 'Forward core is the Yamato/attack handle; side engines can glow separately.',
  },
  'Spider Mine': {
    primitive: 'small circle body + 3 or 4 short leg ticks + 1 center arming light',
    brief: 'Draw a circular mine with tiny deploy legs, not a dumbbell or vehicle.',
    svg: ['1 small circle body', '3-4 short leg lines', '1 tiny center circle'],
    projection: 'The reference side caps are perspective/lighting traps. True top-down should be a simple circle with legs.',
    animation: 'Leg ticks fold out on deploy/wake; center light pulses when armed.',
    omit: 'dumbbell silhouette, side-cap emphasis, shadows, complex leg detail',
  },
  'Nuclear Missile': {
    projection: 'The downloaded image is an explosion icon, not a clean missile reference. Use it only as a warning/glow cue; design the unit as a top-down missile capsule.',
    animation: 'Missile body is static; warning core can pulse; fins stay separate for readability.',
  },
  'Siege Tank': {
    projection: 'The source faces lower-right. Rotate to face up; keep the top footprint: twin treads, turret, short barrel. Ignore track texture and wall height.',
    animation: 'Turret and barrel rotate/recoil as one handle; treads can scroll/bob separately.',
  },
  'Siege Tank (Siege Mode)': {
    projection: 'The source file duplicates tank mode, so the deployed silhouette is design-authored: same base, wider braces, much longer cannon.',
    animation: 'Cannon recoils hard; side braces are separate deploy handles; treads stay planted.',
  },

  'Probe': {
    projection: 'The lower-right isometric source is especially misleading. Flatten it to a forward V/boomerang with the point facing up; do not preserve dangling underside pieces.',
    animation: 'Side nodes can orbit or pulse; center core can glow for harvesting.',
  },
  'Zealot': {
    primitive: 'Marine-like humanoid: weird Protoss head oval/crest + 2 funny pauldron ovals + 2 blade arcs',
    brief: 'Treat Protoss infantry as humans with funny heads and funny pauldrons. Zealot is a Marine-family glyph with two sword arcs instead of a gun.',
    svg: ['1 weird Protoss head ellipse/crest', '2 pauldron ellipses', '2 forward blade arc paths', 'optional center core dot'],
    projection: 'The source faces lower-right and stands upright. Flatten to the same top-down infantry chassis as Marine; legs and body height are discarded.',
    animation: 'Pauldrons bob for movement; each blade arc is separate for slash animation.',
  },
  'Dark Templar': {
    primitive: 'Zealot-like humanoid: weird Protoss head + 2 funny pauldrons + 1 blade arc',
    brief: 'Do not make a robed statue. Dark Templar is basically Zealot/Marine grammar with one blade and optional cloak tail.',
    svg: ['1 weird Protoss head ellipse/crest', '2 pauldron ellipses', '1 long blade arc', 'optional trailing cloak stroke'],
    projection: 'The lower-right upright body and cloak height are projection traps. Keep only head, pauldrons, one blade, and a small cloak cue.',
    animation: 'Pauldrons bob; single blade arc slashes; cloak stroke can trail during movement.',
    omit: 'full robe body, legs, face, cloth folds, dual blades',
  },
  'Dragoon': {
    projection: 'The source faces lower-right but the true primitive is obvious: central orb/shell and four leg pods. Do not preserve leg joints or faceplate height.',
    animation: 'Four legs are separate stepping handles; central orb/core can pulse for firing.',
  },
  'High Templar': {
    primitive: 'Protoss humanoid caster: weird head + 2 small funny pauldrons + large psi halo/robe aura',
    brief: 'Treat as a small Protoss person, not an abstract robe: funny head/pauldrons with a bigger caster aura behind it.',
    svg: ['1 weird head ellipse/crest', '2 small pauldron ellipses', '1 aura/halo arc', '1 core dot'],
    projection: 'The lower-right source shows upright robe mass. Flatten the body to humanoid head/shoulder primitives plus aura.',
    animation: 'Pauldrons bob; aura/halo pulses for spellcast.',
  },
  'Archon': {
    projection: 'The humanoid inside is mostly energy and perspective. True top-down is an energy orb with tendril/arm arcs.',
    animation: 'Outer orbit arcs and tendril arms pulse independently; central orb scales for attack/spell effects.',
  },
  'Dark Archon': {
    projection: 'Like Archon, flatten to an orb. Preserve the darker horn/claw shapes as internal crescent marks, not a standing body.',
    animation: 'Crescent shell arcs pulse/rotate; inner horn marks can flare during cast.',
  },
  'Reaver': {
    primitive: 'pill-bug tank: segmented armored oval + small front claw/mouth + side pod ticks',
    brief: 'Flatten it into a heavy segmented pill-bug robotics tank with a front scarab-launch mouth.',
    svg: ['1 large pill/oval body', '3-4 segment arc lines', '1 front mouth notch', '2-4 side pod ticks'],
    projection: 'The source faces lower-right; the top-down footprint is the armored oval and front mouth, not the tall shell curve.',
    animation: 'Front mouth opens/fires scarabs; side pods can crawl/bob slowly.',
  },
  'Observer': {
    primitive: 'tiny cylinder eye: small body capsule + front lens circle + 2 tiny fins/antennae',
    brief: 'Use the reference as a little floating camera: lens circle at the front, compact body, tiny fins.',
    svg: ['1 small capsule/ellipse body', '1 front lens circle', '2 small fin arcs/lines'],
    projection: 'Ignore shadow and body height; flatten to a tiny lens drone facing up.',
    animation: 'Lens/core pulses; fins can wobble subtly.',
  },
  'Shuttle': {
    primitive: 'rounded transport claw: crescent shell + hollow cargo center + rear pod',
    brief: 'Flatten the lower-right transport into a broad curved shell around a hollow center.',
    svg: ['1 large crescent/rounded shell path', '1 dark hollow oval/slot', '1 rear pod/ellipse'],
    projection: 'Do not preserve vertical body height or underside. Keep the footprint of the curved transport shell.',
    animation: 'Rear pod/engine pulses; shell banks as one piece.',
  },
  'Scout': {
    primitive: 'long needle fighter + 2 swept fins + 2 close engine pods',
    brief: 'A smoother Protoss cousin to Wraith: long central needle, swept fins, paired pods close to the body.',
    svg: ['1 long central needle polygon', '2 swept fin polygons/paths', '2 engine pod circles/ellipses', '1 core'],
    projection: 'Rotate lower-right source to up; ignore height and shadow.',
    animation: 'Pods pulse; fins bank; nose/core points facing.',
  },
  'Carrier': {
    primitive: 'long oval surfboard hull + 2 dark side rail crescents + rear tube pods',
    brief: 'Make the capital ship a long oval hull with side rails and rear pod/tube marks.',
    svg: ['1 long oval/rounded hull', '2 side crescent rail paths', '2-4 rear pod circles/rects', '1 center core'],
    projection: 'The source faces lower-right; do not preserve hull height. Side rail crescents are the top-down identity.',
    animation: 'Rear pods/bays pulse for interceptor launch; central hull remains stable.',
  },
  'Interceptor': {
    primitive: 'tiny twin-pod dart: small bridge body + 2 engine circles/capsules',
    brief: 'The source is not a diamond; it is a tiny craft with two red engine pods and a small bridge.',
    svg: ['1 tiny central body polygon', '2 engine pod circles/capsules', '1 nose line/dot'],
    projection: 'Rotate lower-right source to face up and flatten; ignore shadow.',
    animation: 'Two pods pulse; tiny body darts forward.',
  },
  'Arbiter': {
    primitive: '2 offset crescent blades wrapped around a small stasis core',
    brief: 'Do not make it a plain round saucer. The reference is two large crescent hull blades around green cores.',
    svg: ['2 large crescent paths', '1 small central body/oval', '2-3 core circles'],
    projection: 'The source faces lower-right and exaggerates vertical fins. Flatten to paired crescent footprints and a core.',
    animation: 'Crescent blades can counter-rotate or pulse; stasis core is separate.',
  },
  'Corsair': {
    primitive: 'split crescent/boomerang fighter + 2 forward prongs + small dorsal cap/core',
    brief: 'Use a forked crescent aircraft silhouette with two forward prongs and glowing tips.',
    svg: ['1 split crescent/boomerang path', '2 forward prong tips', '1 small core/dorsal cap'],
    projection: 'Rotate lower-right source to up and remove body height. The forked crescent footprint is what matters.',
    animation: 'Prong tips pulse for attack; crescent banks as one piece.',
  },

  'Larva': {
    projection: 'The source faces lower-right on creep. Flatten to a curled comma; ignore shadow and tiny legs.',
    animation: 'Whole comma squashes/curls; segment ticks can ripple.',
  },
  'Egg': {
    primitive: 'simple top-down egg/cocoon oval + 2-4 large plate/vein marks',
    brief: 'Do not include a base. From true top-down this is just an egg/cocoon shape with a few large surface plates.',
    svg: ['1 oval/blob egg body', '2-4 broad plate/vein arcs or ovals', 'optional small core/slit'],
    projection: 'The source base exists because of the tilted camera. Delete the base and root skirt; keep only the egg footprint.',
    animation: 'Whole egg can pulse/swell; plate marks can flex.',
    omit: 'base, roots, ground slime, shadow, many cracks',
  },
  'Drone': {
    primitive: 'top-down beetle: oval shell + small mandibles + short front harvest claw arcs',
    brief: 'Despite the lower-right source showing membranes and claws, the true top-down read should be beetle-like.',
    svg: ['1 beetle oval/teardrop shell', '2 small mandible arcs', '2 short front claw arcs', '1 rear segment line'],
    projection: 'Source perspective exposes side membranes and tall claws. Collapse to a beetle oval facing up.',
    animation: 'Front claws/mandibles are harvest handles; shell can bob during movement.',
  },
  'Overlord': {
    primitive: 'huge lumpy sac + perimeter spike ticks + dangling tentacle/pod lines',
    brief: 'Keep it a large organic supply sac, but add a few spike ticks and dangling lines so it is not a smooth balloon.',
    svg: ['1 large blob/oval body', '4-6 short perimeter spike ticks', '3 dangling tentacle lines', '2 small eye/core dots'],
    projection: 'The lower-right reference shows lots of vertical lumps. Flatten to a lumpy sac footprint and delete shadow.',
    animation: 'Tentacle lines bob; perimeter spikes stay fixed; eye/core dots pulse.',
  },
  'Zergling': {
    projection: 'The source faces lower-right and shows legs/tail. Rotate to up and keep only jaws, longer torso, and two forward claw arcs.',
    animation: 'Jaw wedge snaps open/closed; each forward claw arc is a slash handle; torso bobs.',
  },
  'Hydralisk': {
    projection: 'The lower-right reference has a messy lower body. Flatten to a ranged infantry glyph: head/jaws plus two mantis/back-wing arcs.',
    animation: 'Jaw arcs can open; mantis/back-wing arcs recoil when launching spines; spine line/core can flash.',
  },
  'Lurker': {
    primitive: 'sprawled Hydralisk trap: triangular head/body + 4 big lateral scythe legs + low abdomen',
    brief: 'Make it wider than Hydralisk with four exaggerated side scythes so it reads as a burrow/trap attacker.',
    svg: ['1 triangular head/body path', '4 long side scythe arc paths', '1 low abdomen oval', 'optional spine line'],
    projection: 'Source faces lower-right. Do not keep upright body height; rotate to up and widen the scythes.',
    animation: 'Side scythes are attack/burrow handles; body stays low.',
  },
  'Mutalisk': {
    primitive: 'larger Scourge-family manta: 2 broad membrane arcs + long segmented center spine + forked stinger',
    brief: 'The sprite reads close to Scourge, so make Mutalisk the larger longer version with broad wings and a forked tail.',
    svg: ['2 large membrane wing arcs/paths', '1 long central teardrop/spine path', '2 tail fork lines', '1 small head/core'],
    projection: 'The source faces lower-right. Ignore wing fold height and shadows; preserve only membrane arcs, center spine, tail.',
    animation: 'Wing arcs flap; forked tail trails; center core fires glaive/wave.',
  },
  'Scourge': {
    primitive: 'tiny Scourge-family flyer: small wing arcs + compact bomb/maw body + 3-4 forward tine lines',
    brief: 'Keep it related to Mutalisk but tiny, with a compact explosive body and forward claw/tine marks.',
    svg: ['1 small bomb/teardrop body', '2 small wing arcs', '3-4 short forward tine lines', 'optional split tail'],
    projection: 'Rotate lower-right source to up; do not preserve shadow or detailed body segments.',
    animation: 'Wing arcs flutter; whole body can pulse before detonation; tines point attack direction.',
  },
  'Guardian': {
    primitive: 'flying crab: central sac cluster + 4 heavy curved claws around it',
    brief: 'Do not describe it as wings. It is a heavy flying crab with red sac mass and large curved claw limbs.',
    svg: ['1 central sac/blob cluster', '4 curved claw arc paths', '1 head/core dot'],
    projection: 'Source faces lower-right and shows underside. Flatten into radial crab-claw footprint facing up.',
    animation: 'Four claw arcs can flex; sac/core pulses for siege attack.',
  },
  'Devourer': {
    primitive: 'fat curled shell + segmented crescent body + giant forward mouth',
    brief: 'Anchor the design on the huge mouth and fat curled shell; side/underside color becomes one crescent segment mark.',
    svg: ['1 fat shell oval/blob', '1 segmented crescent/body arc', '1 large mouth oval/notch', '2 short horn/tusk lines'],
    projection: 'The lower-right image shows lots of underside. Delete underside ribs except one crescent cue; keep the mouth and shell footprint.',
    animation: 'Mouth opens/fires acid; shell segments can pulse slowly.',
  },
  'Queen': {
    primitive: 'broad manta cloak-wing triangle + horseshoe head/jaw arc + 2 front dangling pod ticks',
    brief: 'The Queen is not slender here: use a broad red manta-like pad under a large horseshoe jaw/carapace.',
    svg: ['1 broad cloak/wing triangle or rounded wedge', '1 horseshoe head/jaw arc', '2 small front pod/tick shapes', '1 core'],
    projection: 'Source faces lower-right and is tall. Flatten the wing pad and horseshoe head; delete hanging shadow.',
    animation: 'Horseshoe jaw/carapace opens for spellcast; side cloak/wing pad ripples; pod ticks bob.',
  },
  'Defiler': {
    primitive: 'mobile Sunken-family caster: segmented red spine tail + small front head/core + fan of root/tentacle legs',
    brief: 'Use Sunken Colony language flipped into a mobile caster: spine-tail behind, small caster head at front, root legs fanning out.',
    svg: ['1 segmented spine/tail path', '1 small front head/core circle/oval', '4-6 root/tentacle leg lines', 'short spine ticks'],
    projection: 'The lower-right source is already low, but still rotate to up. Do not turn it into a planted building base.',
    animation: 'Root/tentacle legs scuttle; front core pulses for plague/swarm; spine tail flexes.',
  },
  'Ultralisk': {
    primitive: 'huge body oval + 2 massive crescent tusk blades + small head plate',
    brief: 'The tusks are the unit. Keep the body simple and make the two crescent blades enormous and separate.',
    svg: ['1 large body oval/blob', '2 huge crescent tusk paths', '1 small head plate polygon', '1 core'],
    projection: 'Source faces lower-right. Ignore legs and shell height; rotate to up and preserve the tusk arcs.',
    animation: 'Each tusk arc is a separate slash handle; body lumbers underneath.',
  },
  'Infested Terran': {
    primitive: 'corrupted Marine-family blob: small head/pauldrons + swollen explosive core + claw/tendril ticks',
    brief: 'Keep a tiny infantry read but let a big unstable core dominate.',
    svg: ['1 small head/helmet oval', '2 shoulder/blob ellipses', '1 oversized core circle', '2-3 tendril/claw ticks'],
    projection: 'Source faces lower-right and stands upright. Flatten to corrupted infantry glyph; delete legs/height.',
    animation: 'Core pulses for detonation; small shoulder blobs bob; tendril ticks twitch.',
  },
  'Broodling': {
    primitive: 'tiny claw bug: small body oval + 2 front claw arcs + 2 rear leg ticks',
    brief: 'Smaller and simpler than Zergling, more bug-like and less jaw-focused.',
    svg: ['1 small body oval', '2 front claw arcs', '2 rear leg ticks', 'optional head dot'],
    projection: 'Source faces lower-right. Rotate to up; ignore shadow and tiny anatomy.',
    animation: 'Front claws snap; body scuttles.',
  },

  'Command Center': {
    primitive: 'round/octagonal HQ footprint + central command dome circle + 2 add-on/landing-pad lumps',
    brief: 'Flatten the fortress into a round/octagonal base with central dome and a couple of large perimeter modules.',
    svg: ['1 large octagon/circle footprint', '1 central dome circle', '2-4 perimeter module blocks/circles', 'ring/cross lines'],
    projection: 'The ramp, wall height, and cast shadows are perspective. Keep the top footprint and dome.',
    animation: 'Central dome/core can pulse; add-on modules remain separate for future landing/lift-off cues.',
  },
  'Supply Depot': {
    primitive: 'low rectangular depot footprint + 2 circular fan caps + 1 red hatch/gear circle',
    brief: 'Do not make it an antenna tower. Use a low rectangular pad with two fan circles and one hatch circle.',
    svg: ['1 low rounded rectangle footprint', '2 fan circles', '1 hatch/gear circle', 'short vent lines'],
    projection: 'The raised lid is vertical perspective; flatten it into a hatch circle on the roof.',
    animation: 'Fan caps can spin/pulse; hatch circle can open/close if animated.',
  },
  'Refinery': {
    primitive: 'central vent/ring + 4 mechanical tank blocks + curved pipe lines',
    brief: 'Flatten tall towers into square pods around a central gas ring, with pipe arcs as the main identity.',
    svg: ['1 central vent ring/circle', '4 tank blocks/circles', '2-4 curved pipe paths', 'gas core'],
    projection: 'The source height is mostly tower perspective. Collapse towers into top-down pods around the vent.',
    animation: 'Pipe lines/gas core pulse; vent ring can shimmer.',
  },
  'Barracks': {
    primitive: 'rectangular infantry block + 2 roof vent squares + central bay/door slot + 4 landing feet',
    brief: 'Use the building footprint: rectangular production block with roof vents and central bay.',
    svg: ['1 rectangular footprint', '2 roof vent rectangles', '1 dark bay/door slot', '4 small foot circles/rects'],
    projection: 'The tall walls and legs are perspective. Flatten the legs into small foot pads and keep the top roof blocks.',
    animation: 'Door slot can open; roof vents can pulse.',
  },
  'Engineering Bay': {
    primitive: 'blocky lab body + 3 landing-foot disks + 1 red side dome',
    brief: 'Flatten to a rectangular lab with three small foot disks and one obvious red dome/module.',
    svg: ['1 blocky rounded rectangle body', '3 small foot circles', '1 side dome circle', 'short connector lines'],
    projection: 'Perspective makes the lab look tall. Treat it as a top footprint with foot disks.',
    animation: 'Foot disks can idle bob if lifted; dome/core can pulse for upgrade activity.',
  },
  'Bunker': {
    primitive: 'squat octagon/dome + central circle + 4 firing slit blocks',
    brief: 'Use a low defensive pillbox footprint: octagon base, central hatch circle, firing slits.',
    svg: ['1 octagon footprint', '1 central circle', '4 short slit rectangles/lines'],
    projection: 'Ramps and wall height are projection clutter. Keep only the footprint and slits.',
    animation: 'Slits flash for gunfire; central hatch remains static.',
  },
  'Academy': {
    primitive: 'cluster of circles: large dome circle + small tower circle + open crescent courtyard + rectangular block',
    brief: 'Flatten the training building into its circular roof forms and crescent courtyard.',
    svg: ['1 large dome circle', '1 small tower circle', '1 open crescent arc/ring', '1 rectangular block'],
    projection: 'Tall towers become circles on the footprint. Delete vertical height and shadows.',
    animation: 'Small tower/core can blink; crescent/ring can pulse for research.',
  },
  'Missile Turret': {
    primitive: 'square base + central pivot circle + rotating twin side launcher rectangles',
    brief: 'Top-down anti-air turret: square base and a twin-pod head that can rotate.',
    svg: ['1 square/octagon base', '1 central pivot circle', '2 side launcher rectangles', 'short barrel lines'],
    projection: 'Vertical launcher panels become side rectangles attached to the turret head.',
    animation: 'Entire launcher head rotates; launcher rectangles flash independently.',
  },
  'Factory': {
    primitive: 'large rectangle footprint + 2 dark vehicle bay rectangles + 3 roof vent circles + rear stack block',
    brief: 'Flatten the factory into a broad industrial rectangle with bay marks and round roof vents.',
    svg: ['1 large rectangle/rounded rectangle', '2 dark bay rectangles', '3 roof vent circles', '1 rear stack block'],
    projection: 'Sloped walls and height are perspective. Keep roof/bay footprints.',
    animation: 'Bay rectangles can open; vent circles can pulse.',
  },
  'Machine Shop': {
    primitive: 'add-on rounded rectangle + large side capsule/cylinder + striped vent lines',
    brief: 'Use a compact workshop pad with one big side capsule/pipe and roof vent stripes.',
    svg: ['1 rounded rectangle pad', '1 side capsule/large circle+rect', '3-5 parallel vent lines', 'connector line'],
    projection: 'Cylinder height becomes a capsule footprint; do not draw upright stacks.',
    animation: 'Side capsule/core can pulse; vent lines flicker during upgrades.',
  },
  'Starport': {
    primitive: 'large circular landing pad + 4 arm/spoke supports + rectangular hangar attachments',
    brief: 'Mostly a circle plus spokes: a landing pad with attached hangar arms.',
    svg: ['1 large circle/ring pad', '4 spoke/arm rectangles or lines', '2 rectangular hangar attachments', 'center core'],
    projection: 'The source height is minimal but shadows lie. Keep pad ring and support footprint.',
    animation: 'Pad ring can pulse; arms can light during production/lift-off.',
  },
  'Control Tower': {
    primitive: 'round/square add-on footprint + radar dish arc + antenna dot',
    brief: 'Flatten the tower into a control pad with one scanning dish.',
    svg: ['1 round/square add-on footprint', '1 dish arc/circle', '1 antenna line', '1 dot/core'],
    projection: 'Tall metal tower is vertical perspective; represent it as a footprint plus dish.',
    animation: 'Dish arc rotates/scans; antenna dot blinks.',
  },
  'Armory': {
    primitive: 'central circular forge pit + 4 perimeter posts/pods + connecting block arms',
    brief: 'Use the forge ring as identity, with surrounding post footprints.',
    svg: ['1 central ring/circle', '4 post circles/rectangles', '2-4 connector lines/blocks', '1 core'],
    projection: 'Tall spires collapse into perimeter post shapes. Delete height.',
    animation: 'Central ring pulses for upgrades; post cores can blink.',
  },
  'Science Facility': {
    primitive: 'large red dome oval + several satellite pod circles + connecting lab block',
    brief: 'Flatten the lab cluster into round pods around one dominant dome.',
    svg: ['1 large dome oval/circle', '3-5 satellite pod circles', '1 connecting block shape', 'short connector lines'],
    projection: 'Cylinders and dome height are perspective. Keep top footprints only.',
    animation: 'Pods pulse; main dome/core glows during research.',
  },
  'Physics Lab': {
    primitive: 'round nose dome + long instrument capsule/beam + small pivot base',
    brief: 'Use the telescope/capsule read from the image, not an abstract atom symbol.',
    svg: ['1 round nose/dome circle', '1 long capsule/rectangle instrument arm', '1 pivot base circle', 'connector line'],
    projection: 'The instrument points lower-right in source; rotate to face up or align as an add-on footprint, with no vertical height.',
    animation: 'Instrument capsule can charge/pulse; pivot base can rotate slightly.',
  },
  'Covert Ops': {
    primitive: 'low stealth add-on rectangle + 2 parallel roof bars + 1 forward visor/cylinder',
    brief: 'Flatten into a squat covert module: paired roof bars and a nose slit/cylinder.',
    svg: ['1 low rounded rectangle body', '2 parallel roof rectangles/lines', '1 forward slit/capsule', 'small core'],
    projection: 'Striped rear mass and height are perspective. Keep low footprint and roof marks.',
    animation: 'Forward visor/slit can pulse; roof bars can flicker.',
  },
  'Comsat Station': {
    primitive: 'ring pad + rectangular module + 2 separate dish arcs',
    brief: 'Scanner building: a circular pad and two dish shapes, not just a generic add-on box.',
    svg: ['1 circular ring pad', '1 rectangular module', '2 dish arc/circle shapes', 'small scan dots'],
    projection: 'Dish height becomes arcs/circles on the top footprint; delete shadows.',
    animation: 'Dish arcs rotate/scan; ring pad pulses during scan.',
  },
  'Nuclear Silo': {
    primitive: 'round silo hatch + missile nose/core circle + 2 side clamp marks',
    brief: 'For the building add-on, prefer a top-down hatch/missile cue over a tall rocket.',
    svg: ['1 round hatch circle/ring', '1 missile nose/core circle', '2 side clamp lines/rectangles'],
    projection: 'The reference is a tall missile. Flatten it into a silo hatch footprint with missile cue.',
    animation: 'Hatch/core pulses when armed; clamp marks can open.',
  },

  'Nexus': {
    primitive: 'square/diamond pyramid footprint + central crystal + 4 corner pylon nodes',
    brief: 'Do not make it round. Flatten the Nexus into a symmetrical diamond/square base with central crystal and corner nodes.',
    svg: ['1 large diamond/square footprint', '1 central crystal diamond/circle', '4 corner node circles/ellipses', 'short rib lines'],
    projection: 'Tall side towers become corner nodes. Stairs and height are projection detail.',
    animation: 'Central crystal pulses; corner nodes can glow independently.',
  },
  'Pylon': {
    primitive: 'central crystal diamond + surrounding crescent/ring cradle',
    brief: 'Power structure: one glowing diamond inside a simple ring/cradle.',
    svg: ['1 diamond crystal polygon', '1 surrounding crescent/ring path', '1 core/facet line'],
    projection: 'The vertical crystal should still read as a top-down diamond/shard; delete stand height and shadow.',
    animation: 'Crystal pulses; ring stays static or hums.',
  },
  'Gateway': {
    primitive: 'portal oval + 2 heavy side pillar blocks + broad cross platform',
    brief: 'Flatten into a gateway footprint: portal center, side pillars, platform arms.',
    svg: ['1 central portal oval', '2 side pillar rounded rectangles/polygons', '2-4 platform arm polygons', 'core glow'],
    projection: 'Do not preserve upright arch height or dangling struts. Keep portal/pillar footprint.',
    animation: 'Portal oval pulses; side pillar cores flash for warp-in.',
  },
  'Photon Cannon': {
    primitive: 'concentric base rings + 8 small outer pads + central rotating orb/turret',
    brief: 'Use the deployed top-down read: circular pad, outer petal pads, center cannon orb.',
    svg: ['2-3 concentric circles/rings', '6-8 small outer pad ellipses/rectangles', '1 central orb circle'],
    projection: 'Tower height collapses into central orb/ring. Preserve petal pad footprint, not vertical column.',
    animation: 'Central orb/turret rotates and fires; outer pads stay fixed; rings pulse.',
  },
  'Stargate': {
    primitive: 'two opposing crescent hulls + glowing launch channel between them',
    brief: 'The source is perspective-heavy. True top-down is an open paired-crescent portal for aircraft.',
    svg: ['2 opposing crescent paths', '1 central glowing channel rectangle/oval', '2 small end caps/cores'],
    projection: 'Do not preserve tall hull surfaces. Flatten to paired crescent footprints and center channel.',
    animation: 'Crescents can pulse; center launch channel glows during production.',
  },

  'Hatchery': {
    primitive: 'central mound circle/blob + 5 or 6 radial tube arms + curled root hooks',
    brief: 'Use the radial organic footprint: center mound with tube arms spreading out.',
    svg: ['1 central blob/circle', '5-6 radial tube rounded rectangles/paths', '3-5 curled root hook paths', '1 core'],
    projection: 'The vertical central tower is perspective. Collapse it into a central mound footprint.',
    animation: 'Root hooks/tube arms can pulse; central mound breathes for larvae production.',
  },
  'Sunken Colony': {
    primitive: 'planted root mound + big forward spike/claw mass + small side spike ticks',
    brief: 'Ground defense: planted mound with attack spike/claw mass. Related to Defiler but static.',
    svg: ['1 root mound blob', '1 large forward spike/claw path', '2-4 side spike lines', '1 core'],
    projection: 'Ignore vertical mound height; rotate lower-right source to up and keep planted footprint.',
    animation: 'Forward spike/claw thrusts for attack; mound/root base stays planted.',
  },
  'Spore Colony': {
    primitive: 'root mound + bulb/spore circle + 3 antenna/spore arcs + green vent/core',
    brief: 'Air defense: bulbous spore head on a root base, not a vertical trumpet.',
    svg: ['1 root/base blob', '1 bulb circle/oval', '3 antenna/spore arc paths', '1 green/core circle'],
    projection: 'The tall trumpet is a projection trap. Flatten it into a bulb and antenna arcs.',
    animation: 'Antenna arcs twitch; bulb/core pulses for anti-air attack.',
  },
  'Spawning Pool': {
    primitive: 'two green pool ellipses inside a spiky organic frame',
    brief: 'This reference is already close to top-down: simplify to two pool ovals and a jagged root outline.',
    svg: ['1 spiky organic outline/blob', '2 dark/green pool ellipses', '3-5 perimeter spike triangles/lines'],
    projection: 'Mostly top-down already; delete texture and small root clutter.',
    animation: 'Pool ellipses bubble/pulse; perimeter frame stays fixed.',
  },
  'Spire': {
    primitive: 'ring/donut opening + radial tendril supports + base circle',
    brief: 'Collapse the tall spire into concentric top-down rings and radial tendrils.',
    svg: ['1 donut/ring circle', '1 center dark hole circle', '6-8 radial tendril lines/paths', '1 base circle/ellipse'],
    projection: 'The tall stem is projection. From above it becomes ring opening and support tendrils.',
    animation: 'Ring pulses; tendrils ripple for morph/research.',
  },
  'Nydus Canal': {
    primitive: 'large green mouth/portal oval + tooth ticks around rim + side rim arcs',
    brief: 'Transport tunnel as a top-down organic portal mouth.',
    svg: ['1 large portal oval/ring', '1 green center oval', '4-6 tooth tick lines/triangles', '2 side rim arcs'],
    projection: 'Tall flaps/horns become rim arcs. Delete vertical tunnel height and shadow.',
    animation: 'Portal center pulses; tooth ticks/rim arcs flex when opening.',
  },
  'Defiler Mound': {
    primitive: 'long low spined nest + 2 huge curved horn/tentacle arcs + dark crystal spike cluster',
    brief: 'Building cousin of Defiler: horizontal spined mound with large horn arcs and dark spike cluster.',
    svg: ['1 long mound/blob path', '2 huge horn/tentacle arc paths', '3-5 crystal spike polygons/lines', '1 pit/core circle'],
    projection: 'The image is fairly top-down but still includes height on crystals. Flatten crystals into spike marks on the footprint.',
    animation: 'Horn/tentacle arcs pulse slowly; pit/core glows for tech activity.',
  },
};

for (const [name, extra] of Object.entries(reviewed)) {
  if (!designs[name]) throw new Error(`Reviewed data for unknown item: ${name}`);
  Object.assign(designs[name], extra);
}

const raceTone = {
  terran: 'blocky Terran machinery: rectangles, rounded rectangles, clipped polygons, straight lines',
  protoss: 'smooth Protoss energy geometry: diamonds, ovals, crescents, rings, clean symmetry',
  zerg: 'organic Zerg glyphs: blobs, claws, arcs, spines, sacs, root lines',
  neutral: 'neutral resource geometry: simple fixed-color readable map objects',
};

const existingImageFor = (item) => item.localPath ? `\`${item.localPath.split('/').at(-1)}\`` : 'none; accepted as a generated glowing-orb concept';

const contentFor = (item) => {
  const design = designs[item.name];
  if (!design) throw new Error(`Missing design data for ${item.name}`);
  const svgList = design.svg.map((line) => `- ${line}`).join('\n');
  const related = relatedNote(item.name);
  return `# ${item.name}

Reference image: ${existingImageFor(item)}

Purpose: imagegen prompt seed and SVG authoring guide for an original pure 2D top-down Tron sprite. Use the Liquipedia image only to understand the broad identity, then flatten it into primitive geometry. Do not copy, trace, preserve pose, preserve lower-right facing, or keep perspective/underside detail.

Facing rule:

- Liquipedia unit references usually face lower-right. Our SVG source faces up (-Y). Rotate the idea mentally; preserve parts, not the screenshot angle.
- Shadows, feet, bases, undersides, and vertical height are projection evidence, not top-down shapes.

Primitive read:

- ${design.primitive}.

Projection correction:

- ${design.projection ?? 'Flatten the lower-right/isometric reference into an orthographic top-down footprint. Keep only shapes that would still exist from directly above.'}

Imagegen brief:

- ${design.brief}
- Style: near-black filled shapes, bright cyan/white neon outlines, flat orthographic top-down view, transparent or dark flat background.
- Complexity target: readable at 32 px; prefer 2-5 primitives before internal lines.
- Race grammar: ${raceTone[item.race]}.
${related ? `- Differentiation: ${related}\n` : ''}
SVG primitive plan:

${svgList}

Animation handles:

- ${design.animation ?? 'Keep major protrusions as separate SVG primitives where possible so movement, attack, or idle pulses can animate without redrawing the whole sprite.'}

Omit:

- ${design.omit}.
`;
};

function relatedNote(name) {
  const notes = {
    Marine: 'This defines the infantry baseline: three ovals/circles plus weapon line.',
    Firebat: 'Must read as Marine-family, but wider and shorter-ranged than Ghost or Marine.',
    Medic: 'Must read as Marine-family support; cross replaces weapon.',
    Ghost: 'Must read as Marine-family sniper; long rifle is the identity.',
    Zealot: 'Shares the infantry baseline with Marine, but swords replace gun.',
    Dragoon: 'Do not add body complexity; orb plus four legs is enough.',
    Probe: 'Correct for source distortion: top-down silhouette is a V/boomerang, point forward.',
    Zergling: 'Keep it more primitive than Hydralisk: jaws, torso, two claw arcs.',
    Hydralisk: 'Reads as Zerg ranged infantry: jaws and mantis/back-wing arcs where pauldrons would be.',
    Mutalisk: 'Keep it visually related to Scourge, but larger, longer, and wider.',
    Scourge: 'Keep it visually related to Mutalisk, but tiny and bomb-like.',
    Defiler: 'Use the current Sunken Colony defensive sprite idea, flipped into a mobile caster.',
    'Sunken Colony': 'This is the source language for Defiler, but planted and defensive.',
    Scarab: 'No downloaded source image is needed; this is a tiny glowing projectile orb.',
  };
  return notes[name] ?? '';
}

let written = 0;
for (const item of manifest.items) {
  const dir = item.localPath ? dirname(join(root, item.localPath)) : join(root, item.race, item.type, slug(item.name));
  writeFileSync(join(dir, 'description.md'), contentFor(item), 'utf8');
  written += 1;
}

console.log(`Wrote ${written} description.md files.`);

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
