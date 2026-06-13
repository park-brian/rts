// Lightweight CPU particle pool for combat FX (muzzle flashes, explosions). It's
// purely cosmetic — driven off observable world state in the renderer, never the
// sim — so it can use wall-clock time and Math.random freely without touching
// determinism. Each live particle is written as one additive quad into the FX
// instance batch (gl/renderer.ts), sharing the same sprite shader + glow sprite.

type Particle = {
  x: number; y: number; // world px
  vx: number; vy: number; // world px / s
  life: number; max: number; // seconds remaining / total
  size0: number; size1: number; // world px, start → end
  r: number; g: number; b: number; a: number; // peak color (additive)
  drag: number; // per-second velocity damping
  streak: boolean; // stretch along velocity (sparks) vs. round (flashes)
};

const TAU = Math.PI * 2;
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export class Particles {
  private ps: Particle[] = [];
  private readonly cap = 3000;

  get count(): number { return this.ps.length; }

  /** A weapon discharge: a bright round flash plus a few forward sparks. */
  emitMuzzle(x: number, y: number, angle: number): void {
    if (this.ps.length >= this.cap) return;
    this.ps.push({
      x, y, vx: 0, vy: 0, life: 0.09, max: 0.09,
      size0: 11, size1: 3, r: 1, g: 0.92, b: 0.62, a: 0.95, drag: 0, streak: false,
    });
    for (let i = 0; i < 4; i++) {
      const a = angle + rand(-0.35, 0.35);
      const sp = rand(120, 240);
      this.ps.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.1, 0.2), max: 0.2,
        size0: 5, size1: 1.5, r: 1, g: 0.8, b: 0.42, a: 0.9, drag: 5, streak: true,
      });
    }
  }

  /** A unit/building destroyed: an expanding flash plus radial debris sparks. */
  emitExplosion(x: number, y: number, scale: number): void {
    if (this.ps.length >= this.cap) return;
    this.ps.push({
      x, y, vx: 0, vy: 0, life: 0.28, max: 0.28,
      size0: scale * 1.1, size1: scale * 2.6, r: 1, g: 0.72, b: 0.36, a: 1, drag: 0, streak: false,
    });
    const n = Math.min(28, 8 + Math.round(scale));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.2, 0.2);
      const sp = rand(60, 60 + scale * 9);
      this.ps.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.25, 0.55), max: 0.55,
        size0: rand(2, 4.5), size1: 0.5,
        r: 1, g: rand(0.6, 0.85), b: rand(0.25, 0.45), a: 0.95, drag: 2.5, streak: true,
      });
    }
  }

  update(dt: number): void {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]!; ps.pop(); continue; }
      const damp = 1 - Math.min(1, p.drag * dt);
      p.vx *= damp; p.vy *= damp;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  /** Emit each live particle as (centerX, centerY, w, h, rot, r, g, b, alpha). */
  write(push: (x: number, y: number, w: number, h: number, rot: number, r: number, g: number, b: number, a: number) => void): void {
    for (const p of this.ps) {
      const t = 1 - p.life / p.max; // 0 → 1 over lifetime
      const fade = p.life / p.max; // 1 → 0
      const size = p.size0 + (p.size1 - p.size0) * t;
      const alpha = p.a * fade;
      if (p.streak) {
        const speed = Math.hypot(p.vx, p.vy);
        const len = size * (1 + speed * 0.012);
        const rot = Math.atan2(p.vx, -p.vy); // glow "up" (−y) points along velocity
        push(p.x, p.y, size, len, rot, p.r, p.g, p.b, alpha);
      } else {
        push(p.x, p.y, size, size, 0, p.r, p.g, p.b, alpha);
      }
    }
  }
}
