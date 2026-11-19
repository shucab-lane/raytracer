import { Rng } from './rng';

export type RGB = [number, number, number];
export type XYZ = [number, number, number];

export type MaterialData =
  | { type: 'lambertian'; albedo: RGB }
  | { type: 'metal'; albedo: RGB; fuzz: number }
  | { type: 'dielectric'; ior: number }
  | { type: 'light'; emit: RGB };

export interface SphereData {
  center: XYZ;
  radius: number;
  material: MaterialData;
}

export interface CameraData {
  lookFrom: XYZ;
  lookAt: XYZ;
  vup: XYZ;
  vfov: number;
  aperture: number;
  focusDist: number;
}

export interface SceneData {
  name: string;
  spheres: SphereData[];
  camera: CameraData;
  sky: 'day' | 'night';
}

const ground = (albedo: RGB = [0.5, 0.5, 0.5]): SphereData => ({
  center: [0, -1000, 0],
  radius: 1000,
  material: { type: 'lambertian', albedo },
});

/** The cover scene from "Ray Tracing in One Weekend": ~480 random spheres. */
function randomSpheres(): SceneData {
  const rng = new Rng(42);
  const spheres: SphereData[] = [ground()];
  for (let a = -11; a < 11; a++) {
    for (let b = -11; b < 11; b++) {
      const center: XYZ = [a + 0.9 * rng.next(), 0.2, b + 0.9 * rng.next()];
      const dx = center[0] - 4, dz = center[2];
      if (Math.sqrt(dx * dx + 0.04 + dz * dz) <= 0.9) continue;
      const choose = rng.next();
      let material: MaterialData;
      if (choose < 0.8) {
        material = { type: 'lambertian', albedo: [rng.next() * rng.next(), rng.next() * rng.next(), rng.next() * rng.next()] };
      } else if (choose < 0.95) {
        material = { type: 'metal', albedo: [rng.range(0.5, 1), rng.range(0.5, 1), rng.range(0.5, 1)], fuzz: rng.range(0, 0.5) };
      } else {
        material = { type: 'dielectric', ior: 1.5 };
      }
      spheres.push({ center, radius: 0.2, material });
    }
  }
  spheres.push({ center: [0, 1, 0], radius: 1, material: { type: 'dielectric', ior: 1.5 } });
  spheres.push({ center: [-4, 1, 0], radius: 1, material: { type: 'lambertian', albedo: [0.4, 0.2, 0.1] } });
  spheres.push({ center: [4, 1, 0], radius: 1, material: { type: 'metal', albedo: [0.7, 0.6, 0.5], fuzz: 0 } });
  return {
    name: 'Random spheres',
    spheres,
    sky: 'day',
    camera: { lookFrom: [13, 2, 3], lookAt: [0, 0, 0], vup: [0, 1, 0], vfov: 20, aperture: 0.1, focusDist: 10 },
  };
}

function materials(): SceneData {
  return {
    name: 'Materials',
    sky: 'day',
    spheres: [
      ground([0.8, 0.8, 0.0]),
      { center: [0, 0.5, -1], radius: 0.5, material: { type: 'lambertian', albedo: [0.1, 0.2, 0.5] } },
      // Hollow glass sphere: a negative radius flips the normals
      { center: [-1, 0.5, -1], radius: 0.5, material: { type: 'dielectric', ior: 1.5 } },
      { center: [-1, 0.5, -1], radius: -0.42, material: { type: 'dielectric', ior: 1.5 } },
      { center: [1, 0.5, -1], radius: 0.5, material: { type: 'metal', albedo: [0.8, 0.6, 0.2], fuzz: 0.05 } },
    ],
    camera: { lookFrom: [-2, 2, 1], lookAt: [0, 0.4, -1], vup: [0, 1, 0], vfov: 30, aperture: 0.05, focusDist: 3.4 },
  };
}

function nightLights(): SceneData {
  const rng = new Rng(7);
  const spheres: SphereData[] = [ground([0.45, 0.45, 0.5])];
  const colors: RGB[] = [[4, 1.2, 0.6], [0.6, 2, 4], [3.5, 3, 1], [1, 4, 1.5]];
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    spheres.push({ center: [Math.cos(angle) * 2.2, 0.35, Math.sin(angle) * 2.2], radius: 0.35, material: { type: 'light', emit: colors[i] } });
  }
  for (let i = 0; i < 14; i++) {
    const angle = rng.range(0, Math.PI * 2), r = rng.range(3, 6);
    spheres.push({
      center: [Math.cos(angle) * r, 0.25, Math.sin(angle) * r],
      radius: 0.25,
      material: rng.next() < 0.5
        ? { type: 'metal', albedo: [0.9, 0.9, 0.9], fuzz: rng.range(0, 0.2) }
        : { type: 'lambertian', albedo: [rng.next(), rng.next(), rng.next()] },
    });
  }
  spheres.push({ center: [0, 1.2, 0], radius: 1.2, material: { type: 'metal', albedo: [0.95, 0.95, 0.95], fuzz: 0 } });
  return {
    name: 'Night lights',
    sky: 'night',
    spheres,
    camera: { lookFrom: [7, 3, 6], lookAt: [0, 0.8, 0], vup: [0, 1, 0], vfov: 32, aperture: 0.08, focusDist: 9 },
  };
}

export const scenes: Record<string, () => SceneData> = {
  'Random spheres': randomSpheres,
  Materials: materials,
  'Night lights': nightLights,
};
