# Path Tracer

A physically based path tracer written from scratch in TypeScript. It renders in the browser across parallel Web Workers and refines the image progressively, sample by sample.

**Live demo:** https://shucab-lane.github.io/raytracer/

Built while working through the "Build your own 3D renderer" section of [build-your-own-x](https://github.com/codecrafters-io/build-your-own-x), following Peter Shirley's *Ray Tracing in One Weekend* and extending it.

## Features

- **Path tracing** with up to 12 bounces per ray and Russian-roulette termination for dim paths
- **Materials**: diffuse (Lambertian), metal with adjustable roughness, glass (refraction with Snell's law, total internal reflection, and Schlick's Fresnel approximation), and emissive lights
- **Thin-lens camera** with configurable field of view, aperture and focus distance, which gives depth of field
- **Bounding volume hierarchy (BVH)**, built by splitting on the longest axis at the median, with large objects such as the ground kept outside the tree. On the 485-sphere scene, ray intersection is **2.9× faster** than testing every sphere
- **Parallel rendering**: rows are spread across a pool of Web Workers (one per CPU core). Results come back as transferable `Float32Array`s, so nothing is copied
- **Progressive refinement**: each pass adds one sample per pixel to an accumulation buffer, so a noisy preview appears right away and converges over time
- Tone mapping and gamma correction, pause and resume, PNG export, and 3 scenes
- 13 tests (Vitest): vector math, reflection and refraction against Snell's law, sphere and box intersection, BVH results checked against brute force on 2,000 random rays, and deterministic seeded rendering

## How it works

```
main thread                                   worker pool (N = CPU cores)
───────────                                   ─────────────────────────────
scene data ──postMessage(init)──────────────► build BVH once
rows for worker k ──postMessage(render)─────► for each pixel in those rows:
                                                 ray = camera.ray(jittered u, v)
                                                 color = trace(ray)   ← up to 12 bounces
accumulate += pixels ◄──Float32Array (transferred)──┘
display = toneMap(accumulate / samples)       … and the worker is sent its rows again
```

1. **Camera.** For each pixel, a ray starts at a random point on the lens and passes through a jittered point in the pixel. The jitter gives anti-aliasing; the lens gives depth of field.
2. **Intersection.** `hitScene` tests the few large objects directly, then walks the BVH. Boxes that the ray misses (a slab test) skip their whole subtree.
3. **Scattering.** At each hit, the material decides the next ray direction and how much light it absorbs (`throughput *= albedo`). Rays that escape pick up the sky color; rays that hit a light add its emission.
4. **Accumulation.** Every sample is added to a per-pixel sum. The displayed image is the average, so noise goes down as 1/√samples.

Each worker uses its own seeded random number generator (mulberry32), so renders are reproducible and the tests are deterministic.

## Project structure

```
src/
  engine/
    vec.ts       Vec3, Ray, reflect, refract, Schlick
    rng.ts       seeded PRNG and sampling helpers
    scene.ts     scene descriptions (plain data, sent to workers)
    tracer.ts    spheres, AABB, BVH, camera, path tracing loop
  app/
    worker.ts    renders rows on request
    main.ts      worker pool, accumulation buffer, UI
tests/
  tracer.test.ts
```

## Running locally

```bash
npm install
npm run dev     # http://localhost:5173/raytracer/
npm test
npm run build
```
