import { describe, expect, it } from 'vitest';
import { Ray, Vec3, reflect, refract, schlick } from '../src/engine/vec';
import { Rng } from '../src/engine/rng';
import { AABB, Sphere, buildBVH, hitAll, hitBVH, hitScene, prepareScene, renderRows, toByte } from '../src/engine/tracer';
import { scenes } from '../src/engine/scene';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('vector math', () => {
  it('computes dot, cross and length', () => {
    const a = new Vec3(1, 2, 3);
    const b = new Vec3(4, 5, 6);
    expect(a.dot(b)).toBe(32);
    expect(a.cross(b)).toEqual(new Vec3(-3, 6, -3));
    close(new Vec3(3, 4, 0).length(), 5);
    close(a.unit().length(), 1);
  });

  it('reflects about a normal', () => {
    expect(reflect(new Vec3(1, -1, 0), new Vec3(0, 1, 0))).toEqual(new Vec3(1, 1, 0));
  });

  it('refracts according to Snell’s law', () => {
    const n = new Vec3(0, 1, 0);
    const incoming = new Vec3(1, -1, 0).unit();
    const out = refract(incoming, n, 1 / 1.5);
    const sinIn = Math.abs(incoming.x);
    const sinOut = Math.abs(out.unit().x);
    close(sinIn / sinOut, 1.5, 1e-9);
  });

  it('Schlick reflectance is low head-on and 1 at grazing angles', () => {
    close(schlick(1, 1.5), 0.04, 1e-12);
    close(schlick(0, 1.5), 1);
  });
});

describe('intersection', () => {
  const sphere = new Sphere({ center: [0, 0, -5], radius: 1, material: { type: 'lambertian', albedo: [1, 1, 1] } });

  it('hits a sphere at the nearest root with an outward normal', () => {
    const h = sphere.hit(new Ray(new Vec3(0, 0, 0), new Vec3(0, 0, -1)), 0.001, Infinity)!;
    close(h.t, 4);
    expect(h.normal).toEqual(new Vec3(0, 0, 1));
    expect(h.frontFace).toBe(true);
  });

  it('misses when the ray points away', () => {
    expect(sphere.hit(new Ray(new Vec3(0, 0, 0), new Vec3(0, 0, 1)), 0.001, Infinity)).toBeNull();
    expect(sphere.hit(new Ray(new Vec3(0, 3, 0), new Vec3(0, 0, -1)), 0.001, Infinity)).toBeNull();
  });

  it('flips the normal for hits from inside', () => {
    const h = sphere.hit(new Ray(new Vec3(0, 0, -5), new Vec3(0, 0, -1)), 0.001, Infinity)!;
    expect(h.frontFace).toBe(false);
    expect(h.normal).toEqual(new Vec3(-0, -0, 1));
  });

  it('box slab test', () => {
    const box = new AABB(new Vec3(-1, -1, -1), new Vec3(1, 1, 1));
    expect(box.hit(new Ray(new Vec3(0, 0, 5), new Vec3(0, 0, -1)), 0, Infinity)).toBe(true);
    expect(box.hit(new Ray(new Vec3(3, 0, 5), new Vec3(0, 0, -1)), 0, Infinity)).toBe(false);
  });
});

describe('BVH', () => {
  it('returns the same nearest hit as brute force for 2,000 random rays', () => {
    const scene = scenes['Random spheres']();
    const spheres = scene.spheres.map((s) => new Sphere(s));
    const bvh = buildBVH(spheres);
    const rng = new Rng(1);
    for (let i = 0; i < 2000; i++) {
      const ray = new Ray(new Vec3(rng.range(-12, 12), rng.range(0.1, 3), rng.range(-12, 12)), rng.unitVector());
      const a = hitBVH(bvh, ray, 0.001, Infinity);
      const b = hitAll(spheres, ray, 0.001, Infinity);
      expect(a?.t).toBe(b?.t);
    }
  });

  it('scene lookup (BVH + large objects) matches brute force', () => {
    const data = scenes['Random spheres']();
    const prepared = prepareScene(data);
    const spheres = data.spheres.map((s) => new Sphere(s));
    const rng = new Rng(9);
    for (let i = 0; i < 2000; i++) {
      const ray = new Ray(new Vec3(rng.range(-12, 12), rng.range(0.1, 3), rng.range(-12, 12)), rng.unitVector());
      expect(hitScene(prepared, ray, 0.001, Infinity)?.t).toBe(hitAll(spheres, ray, 0.001, Infinity)?.t);
    }
  });
});

describe('rendering', () => {
  it('is deterministic for a given seed', () => {
    const scene = prepareScene(scenes.Materials());
    const a = renderRows(scene, 32, 18, [5, 9], new Rng(3)).pixels;
    const b = renderRows(scene, 32, 18, [5, 9], new Rng(3)).pixels;
    expect(a).toEqual(b);
    expect(a.length).toBe(2 * 32 * 3);
  });

  it('renders the sky at the top of a daytime scene', () => {
    const scene = prepareScene(scenes['Random spheres']());
    const { pixels } = renderRows(scene, 16, 9, [0], new Rng(5));
    // Sky is bright and bluish
    expect(pixels[2]).toBeGreaterThan(0.5);
    expect(pixels[2]).toBeGreaterThanOrEqual(pixels[0]);
  });

  it('maps linear values to bytes', () => {
    expect(toByte(0)).toBe(0);
    expect(toByte(100)).toBe(255);
    expect(toByte(0.25)).toBeGreaterThan(100);
  });
});
