import { Rng } from '../engine/rng';
import { SceneData } from '../engine/scene';
import { PreparedScene, prepareScene, renderRows } from '../engine/tracer';

export type ToWorker =
  | { type: 'init'; scene: SceneData; width: number; height: number }
  | { type: 'render'; rows: number[]; seed: number };

export type FromWorker = { type: 'done'; rows: number[]; pixels: Float32Array; rays: number; ms: number };

let scene: PreparedScene | null = null;
let width = 0;
let height = 0;

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    scene = prepareScene(msg.scene);
    width = msg.width;
    height = msg.height;
    return;
  }
  if (!scene) return;
  const start = performance.now();
  const { pixels, rays } = renderRows(scene, width, height, msg.rows, new Rng(msg.seed));
  const reply: FromWorker = { type: 'done', rows: msg.rows, pixels, rays, ms: performance.now() - start };
  (self as any).postMessage(reply, [pixels.buffer]);
};
