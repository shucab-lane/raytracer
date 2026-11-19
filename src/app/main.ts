import { scenes } from '../engine/scene';
import { toByte } from '../engine/tracer';
import type { FromWorker, ToWorker } from './worker';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const sceneSelect = document.getElementById('scene') as HTMLSelectElement;
const resSelect = document.getElementById('resolution') as HTMLSelectElement;
const sppSelect = document.getElementById('spp') as HTMLSelectElement;
const threadsSelect = document.getElementById('threads') as HTMLSelectElement;
const restartBtn = document.getElementById('restart') as HTMLButtonElement;
const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;
const progress = document.getElementById('progress') as HTMLDivElement;
const statEls = {
  samples: document.getElementById('s-samples')!,
  rays: document.getElementById('s-rays')!,
  time: document.getElementById('s-time')!,
  objects: document.getElementById('s-objects')!,
};

const cores = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 16));
for (const n of [...new Set([1, 2, 4, cores])].filter((n) => n <= cores).sort((a, b) => a - b)) {
  const opt = document.createElement('option');
  opt.value = String(n);
  opt.textContent = `${n} worker${n > 1 ? 's' : ''}`;
  threadsSelect.append(opt);
}
threadsSelect.value = String(cores);
for (const name of Object.keys(scenes)) {
  const opt = document.createElement('option');
  opt.value = opt.textContent = name;
  sceneSelect.append(opt);
}

let workers: Worker[] = [];
let accum = new Float32Array(0);
let rowSamples = new Uint32Array(0);
let image: ImageData;
let width = 0;
let height = 0;
let target = 0;
let totalRays = 0;
let startTime = 0;
let elapsedBeforePause = 0;
let paused = false;
let finished = false;
let dirty = false;
let seedCounter = 1;
let rowGroups: number[][] = [];

function stopWorkers() {
  workers.forEach((w) => w.terminate());
  workers = [];
}

function start() {
  stopWorkers();
  const [w, h] = resSelect.value.split('x').map(Number);
  width = w;
  height = h;
  target = Number(sppSelect.value);
  canvas.width = width;
  canvas.height = height;
  accum = new Float32Array(width * height * 3);
  rowSamples = new Uint32Array(height);
  image = ctx.createImageData(width, height);
  totalRays = 0;
  elapsedBeforePause = 0;
  startTime = performance.now();
  paused = false;
  finished = false;
  pauseBtn.textContent = 'Pause';

  const scene = scenes[sceneSelect.value]();
  statEls.objects.textContent = `${scene.spheres.length} spheres`;

  const n = Number(threadsSelect.value);
  // Interleave rows so every worker covers the whole image and it fills in evenly
  rowGroups = Array.from({ length: n }, () => [] as number[]);
  const chunk = 4;
  for (let y = 0, g = 0; y < height; y += chunk, g = (g + 1) % n) {
    for (let r = y; r < Math.min(y + chunk, height); r++) rowGroups[g].push(r);
  }

  workers = rowGroups.map((rows) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.postMessage({ type: 'init', scene, width, height } satisfies ToWorker);
    worker.onmessage = (e: MessageEvent<FromWorker>) => onResult(worker, e.data);
    dispatch(worker, rows);
    return worker;
  });
}

function dispatch(worker: Worker, rows: number[]) {
  if (paused) return;
  const pending = rows.filter((y) => rowSamples[y] < target);
  if (pending.length === 0) return;
  worker.postMessage({ type: 'render', rows: pending, seed: seedCounter++ * 7919 } satisfies ToWorker);
}

function onResult(worker: Worker, msg: FromWorker) {
  if (!workers.includes(worker)) return;
  let i = 0;
  for (const y of msg.rows) {
    let o = y * width * 3;
    for (let x = 0; x < width * 3; x++) accum[o++] += msg.pixels[i++];
    rowSamples[y]++;
  }
  totalRays += msg.rays;
  dirty = true;
  dispatch(worker, msg.rows);
}

function draw() {
  requestAnimationFrame(draw);
  if (!dirty || !image) return;
  dirty = false;
  const data = image.data;
  for (let y = 0; y < height; y++) {
    const n = rowSamples[y];
    if (n === 0) continue;
    const inv = 1 / n;
    let a = y * width * 3;
    let p = y * width * 4;
    for (let x = 0; x < width; x++) {
      data[p++] = toByte(accum[a++] * inv);
      data[p++] = toByte(accum[a++] * inv);
      data[p++] = toByte(accum[a++] * inv);
      data[p++] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  updateStats();
}

function updateStats() {
  let min = Infinity;
  for (let y = 0; y < height; y++) min = Math.min(min, rowSamples[y]);
  const elapsed = elapsedBeforePause + (paused || finished ? 0 : performance.now() - startTime);
  if (min >= target && !finished) {
    finished = true;
    elapsedBeforePause = elapsed;
  }
  const secs = (finished ? elapsedBeforePause : elapsed) / 1000;
  statEls.samples.textContent = `${min} / ${target}`;
  statEls.rays.textContent = secs > 0 ? `${((totalRays / secs) / 1e6).toFixed(2)} M/s` : '–';
  statEls.time.textContent = `${secs.toFixed(1)} s${finished ? ' ✓' : ''}`;
  progress.style.width = `${(100 * min) / target}%`;
}

restartBtn.addEventListener('click', start);
[sceneSelect, resSelect, sppSelect, threadsSelect].forEach((el) => el.addEventListener('change', start));
pauseBtn.addEventListener('click', () => {
  if (finished) return;
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  if (paused) elapsedBeforePause += performance.now() - startTime;
  else {
    startTime = performance.now();
    workers.forEach((w, i) => dispatch(w, rowGroups[i]));
  }
});
saveBtn.addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `${sceneSelect.value.toLowerCase().replace(/\s+/g, '-')}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
});

// Smaller default on phones
if (window.innerWidth < 700) resSelect.value = '480x270';
start();
requestAnimationFrame(draw);
