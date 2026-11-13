// Background removal worker: downloads the withoutBG files into OPFS and runs
// router + matting with onnxruntime-web (WebGPU, or WASM when WebGPU is missing).
// Mirrors RoutedPipeline.run() in scripts/withoutBG/withoutbg_test.py, matting branch only.

import { encode } from 'fast-png';
import * as ort from 'onnxruntime-web/webgpu';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { download, readFile } from '../modelStore';
import { WITHOUTBG, WITHOUTBG_FILES } from './config';
import type { Backend, CutoutResult, Phase, Request, Response } from './protocol';
import { resizePlaneBilinear, rgbaToBicubicNCHW, rgbaToBilinearNCHW } from './resize';

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
ort.env.logLevel = 'error';

const STORE_DIR = `withoutbg-${WITHOUTBG.version}`;
const FEATURES = ['f0', 'f1', 'f2', 'f3'] as const;

const post = (msg: Response, transfer: Transferable[] = []) => self.postMessage(msg, { transfer });

interface Sessions {
  router: ort.InferenceSession;
  matting: ort.InferenceSession;
  backend: Backend;
}
let sessions: Promise<Sessions> | null = null;

async function pickBackend(): Promise<Backend> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  try {
    return gpu && (await gpu.requestAdapter()) ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}

async function createSessions(): Promise<Sessions> {
  const backend = await pickBackend();
  const create = async (file: (typeof WITHOUTBG_FILES)[number], extra: ort.InferenceSession.SessionOptions = {}) => {
    // The file buffer is only needed until the session has copied the weights.
    const bytes = new Uint8Array(await readFile(STORE_DIR, file));
    return ort.InferenceSession.create(bytes, { executionProviders: [backend], graphOptimizationLevel: 'all', ...extra });
  };
  // Keep the router's features on the GPU; they go straight into the matting graph.
  const router = await create(
    WITHOUTBG.router,
    backend === 'webgpu' ? { preferredOutputLocation: Object.fromEntries(FEATURES.map((f) => [f, 'gpu-buffer'])) } : {},
  );
  const matting = await create(WITHOUTBG.matting);
  return { router, matting, backend };
}

function getSessions(): Promise<Sessions> {
  sessions ??= createSessions().catch((e) => {
    sessions = null;
    throw e;
  });
  return sessions;
}

function pixels(bmp: ImageBitmap): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
}

async function run(id: number, image: Blob): Promise<CutoutResult> {
  const timings: CutoutResult['timings'] = {};
  let t = performance.now();
  const phase = (p: Phase, backend?: Backend) => {
    post({ id, type: 'phase', phase: p, backend });
    t = performance.now();
  };
  const lap = (p: Phase) => (timings[p] = performance.now() - t);

  phase('decoding');
  const opts: ImageBitmapOptions = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
  const orig = await createImageBitmap(image, opts);
  const { width: W, height: H } = orig;
  const origPx = pixels(orig);
  orig.close();
  // Like fit_max_size(): very large images are scaled down for inference.
  const max = WITHOUTBG.maxInferenceSize;
  const fit = Math.min(1, max / W, max / H);
  let w = W;
  let h = H;
  let workPx = origPx;
  if (fit < 1) {
    w = Math.max(1, Math.floor(W * fit));
    h = Math.max(1, Math.floor(H * fit));
    const small = await createImageBitmap(image, { ...opts, resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
    workPx = pixels(small);
    small.close();
  }
  const S = WITHOUTBG.mattingSize;
  const D = WITHOUTBG.depthSize;
  const rgbMatting = new ort.Tensor('float32', rgbaToBilinearNCHW(workPx, w, h, S), [1, 3, S, S]);
  const rgbDepth = new ort.Tensor('float32', rgbaToBicubicNCHW(workPx, w, h, D), [1, 3, D, D]);
  lap('decoding');

  phase('loading', await pickBackend());
  const s = await getSessions();
  lap('loading');

  phase('router', s.backend);
  const feats = await s.router.run({ rgb_matting: rgbMatting }, [...FEATURES]);
  lap('router');

  phase('matting', s.backend);
  let alpha448: Float32Array;
  try {
    const out = await s.matting.run(
      { rgb_depth: rgbDepth, rgb_matting: rgbMatting, f0: feats.f0, f1: feats.f1, f2: feats.f2, f3: feats.f3 },
      ['coarse_alpha'],
    );
    alpha448 = (await out.coarse_alpha.getData()) as Float32Array;
    out.coarse_alpha.dispose();
  } finally {
    for (const f of FEATURES) feats[f].dispose();
  }
  lap('matting');

  phase('compositing', s.backend);
  for (let i = 0; i < alpha448.length; i++) {
    if (!Number.isFinite(alpha448[i])) throw new Error('The model returned an invalid matte.');
  }
  // Upsample to the working size, then (if it was scaled down) to the original size.
  let matte = resizePlaneBilinear(alpha448, S, S, w, h);
  if (w !== W || h !== H) matte = resizePlaneBilinear(matte, w, h, W, H);
  const rgba = new Uint8Array(origPx.buffer, origPx.byteOffset, origPx.byteLength);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4 + 3] = Math.min(255, Math.max(0, Math.floor(matte[i] * 255 + 0.5)));
  }
  const encoded = encode({ width: W, height: H, data: rgba, channels: 4, depth: 8 }) as Uint8Array<ArrayBuffer>;
  const png = new Blob([encoded], { type: 'image/png' });
  lap('compositing');

  return { png, width: W, height: H, backend: s.backend, timings };
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data;
  try {
    if (msg.type === 'download') {
      let last = 0;
      await download(STORE_DIR, msg.baseUrl, WITHOUTBG_FILES, (loaded, total) => {
        // Network chunks arrive far faster than the UI needs; ~10 updates a second is plenty.
        const t = performance.now();
        if (t - last < 100 && loaded < total) return;
        last = t;
        post({ id: msg.id, type: 'progress', loaded, total });
      });
      post({ id: msg.id, type: 'done' });
    } else if (msg.type === 'run') {
      post({ id: msg.id, type: 'done', result: await run(msg.id, msg.image) });
    }
  } catch (err) {
    post({ id: msg.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
