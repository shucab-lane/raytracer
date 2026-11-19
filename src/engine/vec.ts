export class Vec3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  static from(a: readonly [number, number, number]) {
    return new Vec3(a[0], a[1], a[2]);
  }

  add(v: Vec3) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v: Vec3) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  mul(s: number) { return new Vec3(this.x * s, this.y * s, this.z * s); }
  mulV(v: Vec3) { return new Vec3(this.x * v.x, this.y * v.y, this.z * v.z); }
  neg() { return new Vec3(-this.x, -this.y, -this.z); }
  dot(v: Vec3) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v: Vec3) {
    return new Vec3(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x);
  }
  lengthSquared() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSquared()); }
  unit() { return this.mul(1 / this.length()); }
  nearZero() { const s = 1e-8; return Math.abs(this.x) < s && Math.abs(this.y) < s && Math.abs(this.z) < s; }
  axis(i: number) { return i === 0 ? this.x : i === 1 ? this.y : this.z; }
}

export class Ray {
  constructor(
    public origin: Vec3,
    public dir: Vec3,
  ) {}
  at(t: number) { return this.origin.add(this.dir.mul(t)); }
}

export function reflect(v: Vec3, n: Vec3): Vec3 {
  return v.sub(n.mul(2 * v.dot(n)));
}

/** Snell's law. `uv` and `n` must be unit vectors; `etaRatio` = n1 / n2. */
export function refract(uv: Vec3, n: Vec3, etaRatio: number): Vec3 {
  const cosTheta = Math.min(uv.neg().dot(n), 1);
  const perp = uv.add(n.mul(cosTheta)).mul(etaRatio);
  const parallel = n.mul(-Math.sqrt(Math.abs(1 - perp.lengthSquared())));
  return perp.add(parallel);
}

/** Schlick's approximation for reflectance at a dielectric boundary. */
export function schlick(cosine: number, ior: number): number {
  const r0 = ((1 - ior) / (1 + ior)) ** 2;
  return r0 + (1 - r0) * (1 - cosine) ** 5;
}
