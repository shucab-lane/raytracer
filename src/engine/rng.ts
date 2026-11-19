import { Vec3 } from './vec';

/** Small, fast seeded PRNG (mulberry32), so every worker and test is reproducible. */
export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number) {
    return min + (max - min) * this.next();
  }
  inUnitSphere(): Vec3 {
    while (true) {
      const p = new Vec3(this.range(-1, 1), this.range(-1, 1), this.range(-1, 1));
      if (p.lengthSquared() < 1) return p;
    }
  }
  unitVector(): Vec3 {
    return this.inUnitSphere().unit();
  }
  inUnitDisk(): Vec3 {
    while (true) {
      const p = new Vec3(this.range(-1, 1), this.range(-1, 1), 0);
      if (p.lengthSquared() < 1) return p;
    }
  }
}
