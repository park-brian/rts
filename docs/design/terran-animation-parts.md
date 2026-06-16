# Terran Sprite Animation Parts

This file explains the part metadata in `terran-sprite-sheet.html`. All sprites are authored facing up. Emission directions are local vectors before the sprite is rotated in-game.

Metadata contract:

- `data-anchor`: local rotation/scale anchor in the 64x64 viewBox.
- `data-visible-box`: authored visible ink bounds in local coordinates, formatted `x y w h`; used by the renderer to fit visible art to gameplay size.
- `data-part`: stable target name for animation code.
- `data-parent`: parent part or `root`; use this when a part should animate from a logical parent instead of the sprite center.
- `data-origin`: local part pivot/reference point in `x y`.
- `data-rest`: local rest reference point in `x y` when different from `data-origin`.
- `data-anim`: intended animation role.
- `data-emits`: effect or projectile emitted by this part.
- `data-emission-dir`: local emission direction as `x y`; forward fire is `0 -1`, rear thrust is `0 1`.
- `data-slide-dir`: local deploy/retract direction for sliding parts.

Do not scale SVG geometry to represent unit size. Size belongs to gameplay radius and renderer placement; part animation belongs to parent/local anchors.

## Terran Unit Animation Notes

| Unit | Moving parts | Emission parts |
|---|---|---|
| SCV | `left-arm`, `right-arm`; side blocks and head stay layered above the arms. | none yet |
| Marine | `left-side-circle`, `right-side-circle` bob during walk/run; firing stance offsets one side circle forward while `gun` recoils. | `gun`, `0 -1` |
| Firebat | Body stays still while firing; nozzles pulse. | `left-flame-nozzle`, `right-flame-nozzle`, `0 -1` |
| Medic | Cross can pulse for heal; side circles can share slow infantry bob if needed. | cross pulse only for support effect |
| Ghost | Same firing stance as Marine, but with smaller side circles and `long-gun` recoil. | `long-gun`, `0 -1` |
| Vulture | Thrusters glow/flicker; nose wedges stay rigid. | thrusters `0 1` |
| Tank | `turret` and `barrel` aim independently from treads/hull; barrel recoils. | `barrel`, `0 -1` |
| Siege Mode | Same tank base; `front-support` slides `0 -1`, `rear-support` slides `0 1`; turret/barrel aim independently. | `barrel`, `0 -1` |
| Goliath | `left-cannon` and `right-cannon` are fire sources and recoil backward. | both cannons, `0 -1` |
| Wraith | Wing/body stays rigid; lasers pulse; thrusters glow. | lasers `0 -1`; thrusters `0 1` |
| Dropship | Thrusters glow; body stays rigid; `cargo-dot-1..8` light up in two center columns as storage is used. | thrusters `0 1`; cargo dots are state lights |
| Science Vessel | Ring/dots can pulse or rotate as a caster/detector read. | radial/caster effects from anchor |
| Valkyrie | Slim body and larger winglets stay rigid; two squat rear thrusters glow. | thrusters `0 1` |
| Battlecruiser | Four trapezoid wings stay rigid; rear lasers pulse; square Yamato block can charge; rear thruster cores glow. | rear lasers `0 -1`; thruster cores `0 1`; Yamato charge from `yamato-cannon` |
| Spider Mine | Legs can twitch; `core-dot` pulses before detonation. | radial explosion from anchor |
| Nuclear Missile | Projectile sprite; body stays rigid with optional exhaust behind it. | travel direction `0 -1`, exhaust `0 1` |
