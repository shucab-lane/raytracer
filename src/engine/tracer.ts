import { Rng } from './rng';
import { CameraData, MaterialData, SceneData, SphereData } from './scene';
import { Ray, Vec3, reflect, refract, schlick } from './vec';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Hit {
  t: number;
  point: Vec3;
  normal: Vec3; // always faces against the ray
  frontFace: boolean;
  material: MaterialData;
}

export class Sphere {
  center: Vec3;
  constructor(
    data: SphereData,
    public radius = data.radius,
    public material = data.material,
  ) {
    this.center = Vec3.from(data.center);
  }

  hit(ray: Ray, tMin: number, tMax: number): Hit | null {
    const oc = ray.origin.sub(this.center);
    const a = ray.dir.lengthSquared();
    const halfB = oc.dot(ray.dir);
    const c = oc.lengthSquared() - this.radius * this.radius;
    const disc = halfB * halfB - a * c;
    if (disc < 0) return null;
    const sqrtd = Math.sqrt(disc);
    let root = (-halfB - sqrtd) / a;
    if (root <= tMin || root >= tMax) {
      root = (-halfB + sqrtd) / a;
      if (root <= tMin || root >= tMax) return null;
    }
    const point = ray.at(root);
    const outward = point.sub(this.center).mul(1 / this.radius);
    const frontFace = ray.dir.dot(outward) < 0;
    return { t: root, point, normal: frontFace ? outward : outward.neg(), frontFace, material: this.material };
  }

  bounds(): AABB {
    const r = Math.abs(this.radius);
    return new AABB(this.center.sub(new Vec3(r, r, r)), this.center.add(new Vec3(r, r, r)));
  }
}

export class AABB {
  constructor(
    public min: Vec3,
    public max: Vec3,
  ) {}

  /** Slab test. */
  hit(ray: Ray, tMin: number, tMax: number): boolean {
    // Unrolled per axis: this is the hottest function in the renderer
    const o = ray.origin, d = ray.dir, lo = this.min, hi = this.max;
    let inv = 1 / d.x;
    let t0 = (lo.x - o.x) * inv, t1 = (hi.x - o.x) * inv;
    if (inv < 0) { const s = t0; t0 = t1; t1 = s; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMax <= tMin) return false;
    inv = 1 / d.y;
    t0 = (lo.y - o.y) * inv; t1 = (hi.y - o.y) * inv;
    if (inv < 0) { const s = t0; t0 = t1; t1 = s; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMax <= tMin) return false;
    inv = 1 / d.z;
    t0 = (lo.z - o.z) * inv; t1 = (hi.z - o.z) * inv;
    if (inv < 0) { const s = t0; t0 = t1; t1 = s; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    return tMax > tMin;
  }

  static union(a: AABB, b: AABB) {
    return new AABB(
      new Vec3(Math.min(a.min.x, b.min.x), Math.min(a.min.y, b.min.y), Math.min(a.min.z, b.min.z)),
      new Vec3(Math.max(a.max.x, b.max.x), Math.max(a.max.y, b.max.y), Math.max(a.max.z, b.max.z)),
    );
  }
}

// ---------------------------------------------------------------------------
// Bounding volume hierarchy
// ---------------------------------------------------------------------------

export type BVHNode =
  | { leaf: true; box: AABB; spheres: Sphere[] }
  | { leaf: false; box: AABB; left: BVHNode; right: BVHNode };

/** Splits on the longest axis at the median centroid until leaves hold ≤ 2 spheres. */
export function buildBVH(spheres: Sphere[]): BVHNode {
  const box = spheres.map((s) => s.bounds()).reduce(AABB.union);
  if (spheres.length <= 2) return { leaf: true, box, spheres };
  const extent = box.max.sub(box.min);
  const axis = extent.x > extent.y && extent.x > extent.z ? 0 : extent.y > extent.z ? 1 : 2;
  const sorted = spheres.slice().sort((a, b) => a.center.axis(axis) - b.center.axis(axis));
  const mid = sorted.length >> 1;
  return { leaf: false, box, left: buildBVH(sorted.slice(0, mid)), right: buildBVH(sorted.slice(mid)) };
}

export function hitBVH(node: BVHNode, ray: Ray, tMin: number, tMax: number): Hit | null {
  if (!node.box.hit(ray, tMin, tMax)) return null;
  if (node.leaf) {
    let closest: Hit | null = null;
    for (const s of node.spheres) {
      const h = s.hit(ray, tMin, closest ? closest.t : tMax);
      if (h) closest = h;
    }
    return closest;
  }
  const left = hitBVH(node.left, ray, tMin, tMax);
  const right = hitBVH(node.right, ray, tMin, left ? left.t : tMax);
  return right ?? left;
}

/** Brute force reference used by tests and the BVH benchmark. */
export function hitAll(spheres: Sphere[], ray: Ray, tMin: number, tMax: number): Hit | null {
  let closest: Hit | null = null;
  for (const s of spheres) {
    const h = s.hit(ray, tMin, closest ? closest.t : tMax);
    if (h) closest = h;
  }
  return closest;
}

// ---------------------------------------------------------------------------
// Camera (thin lens model, for depth of field)
// ---------------------------------------------------------------------------

export class Camera {
  private origin: Vec3;
  private lowerLeft: Vec3;
  private horizontal: Vec3;
  private vertical: Vec3;
  private u: Vec3;
  private v: Vec3;
  private lensRadius: number;

  constructor(c: CameraData, aspect: number) {
    const theta = (c.vfov * Math.PI) / 180;
    const viewportH = 2 * Math.tan(theta / 2);
    const viewportW = aspect * viewportH;
    const from = Vec3.from(c.lookFrom);
    const w = from.sub(Vec3.from(c.lookAt)).unit();
    this.u = Vec3.from(c.vup).cross(w).unit();
    this.v = w.cross(this.u);
    this.origin = from;
    this.horizontal = this.u.mul(viewportW * c.focusDist);
    this.vertical = this.v.mul(viewportH * c.focusDist);
    this.lowerLeft = from.sub(this.horizontal.mul(0.5)).sub(this.vertical.mul(0.5)).sub(w.mul(c.focusDist));
    this.lensRadius = c.aperture / 2;
  }

  ray(s: number, t: number, rng: Rng): Ray {
    const rd = rng.inUnitDisk().mul(this.lensRadius);
    const offset = this.u.mul(rd.x).add(this.v.mul(rd.y));
    const origin = this.origin.add(offset);
    const target = this.lowerLeft.add(this.horizontal.mul(s)).add(this.vertical.mul(t));
    return new Ray(origin, target.sub(origin));
  }
}

// ---------------------------------------------------------------------------
// Path tracing
// ---------------------------------------------------------------------------

export const MAX_DEPTH = 12;

export interface PreparedScene {
  bvh: BVHNode | null;
  /** Very large objects (like the ground) would make every BVH box huge, so they're tested separately. */
  large: Sphere[];
  sky: SceneData['sky'];
  cameraData: CameraData;
}

export function prepareScene(scene: SceneData): PreparedScene {
  const spheres = scene.spheres.map((s) => new Sphere(s));
  const large = spheres.filter((s) => Math.abs(s.radius) > 50);
  const small = spheres.filter((s) => Math.abs(s.radius) <= 50);
  return { bvh: small.length ? buildBVH(small) : null, large, sky: scene.sky, cameraData: scene.camera };
}

export function hitScene(scene: PreparedScene, ray: Ray, tMin: number, tMax: number): Hit | null {
  let closest = hitAll(scene.large, ray, tMin, tMax);
  if (scene.bvh) {
    const h = hitBVH(scene.bvh, ray, tMin, closest ? closest.t : tMax);
    if (h) closest = h;
  }
  return closest;
}

function background(dir: Vec3, sky: SceneData['sky']): Vec3 {
  const t = 0.5 * (dir.unit().y + 1);
  if (sky === 'night') return new Vec3(0.01, 0.012, 0.03).mul(1 - t).add(new Vec3(0.02, 0.03, 0.08).mul(t));
  return new Vec3(1, 1, 1).mul(1 - t).add(new Vec3(0.5, 0.7, 1).mul(t));
}

/** Iterative path tracer: follow one light path, multiplying attenuation at each bounce. */
export function traceRay(ray: Ray, scene: PreparedScene, rng: Rng): Vec3 {
  let throughput = new Vec3(1, 1, 1);
  let color = new Vec3(0, 0, 0);

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const hit = hitScene(scene, ray, 0.001, Infinity);
    if (!hit) return color.add(throughput.mulV(background(ray.dir, scene.sky)));

    const m = hit.material;
    let scattered: Vec3;
    switch (m.type) {
      case 'light':
        return color.add(throughput.mulV(Vec3.from(m.emit)));
      case 'lambertian': {
        scattered = hit.normal.add(rng.unitVector());
        if (scattered.nearZero()) scattered = hit.normal;
        throughput = throughput.mulV(Vec3.from(m.albedo));
        break;
      }
      case 'metal': {
        scattered = reflect(ray.dir.unit(), hit.normal).add(rng.inUnitSphere().mul(m.fuzz));
        if (scattered.dot(hit.normal) <= 0) return color; // absorbed
        throughput = throughput.mulV(Vec3.from(m.albedo));
        break;
      }
      case 'dielectric': {
        const ratio = hit.frontFace ? 1 / m.ior : m.ior;
        const unitDir = ray.dir.unit();
        const cos = Math.min(unitDir.neg().dot(hit.normal), 1);
        const sin = Math.sqrt(1 - cos * cos);
        const cannotRefract = ratio * sin > 1;
        scattered =
          cannotRefract || schlick(cos, ratio) > rng.next()
            ? reflect(unitDir, hit.normal)
            : refract(unitDir, hit.normal, ratio);
        break;
      }
    }
    ray = new Ray(hit.point, scattered);

    // Russian roulette: randomly end dim paths early without biasing the result
    if (depth > 3) {
      const p = Math.max(throughput.x, throughput.y, throughput.z);
      if (rng.next() > p) return color;
      throughput = throughput.mul(1 / p);
    }
  }
  return color;
}

/**
 * Render one sample per pixel for the given rows.
 * Returns linear RGB for those rows, packed row after row.
 */
export function renderRows(
  scene: PreparedScene,
  width: number,
  height: number,
  rows: number[],
  rng: Rng,
): { pixels: Float32Array; rays: number } {
  const camera = new Camera(scene.cameraData, width / height);
  const pixels = new Float32Array(rows.length * width * 3);
  let i = 0;
  for (const y of rows) {
    for (let x = 0; x < width; x++) {
      const u = (x + rng.next()) / (width - 1);
      const v = (height - 1 - y + rng.next()) / (height - 1);
      const c = traceRay(camera.ray(u, v, rng), scene, rng);
      // Clamp fireflies from tiny bright lights
      pixels[i++] = Math.min(c.x, 20);
      pixels[i++] = Math.min(c.y, 20);
      pixels[i++] = Math.min(c.z, 20);
    }
  }
  return { pixels, rays: rows.length * width };
}

/** Linear → sRGB-ish (gamma 2), with simple tone mapping, to an 8-bit channel. */
export function toByte(linear: number): number {
  const mapped = linear / (1 + linear * 0.15); // gentle Reinhard-style rolloff for lights
  return Math.round(255 * Math.min(1, Math.sqrt(Math.max(0, mapped * 1.15))));
}
