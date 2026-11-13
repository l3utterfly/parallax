// Background removal: router + matting, mirroring RoutedPipeline.run() in
// scripts/withoutBG/withoutbg_test.py (matting branch only).

import { encode } from 'fast-png';
import type { Backend, CutoutPhase, CutoutResult } from '../protocol';
import { createSession, decodeRgba, once, ort, pickBackend } from '../runtime';
import { WITHOUTBG } from './config';
import { resizePlaneBilinear, rgbaToBicubicNCHW, rgbaToBilinearNCHW } from './resize';

const FEATURES = ['f0', 'f1', 'f2', 'f3'] as const;

const sessions = once(async () => {
  const backend = await pickBackend();
  // Keep the router's features on the GPU; they go straight into the matting graph.
  const router = await createSession(
    'withoutbg',
    WITHOUTBG.router.name,
    backend === 'webgpu' ? { preferredOutputLocation: Object.fromEntries(FEATURES.map((f) => [f, 'gpu-buffer'])) } : {},
  );
  const matting = await createSession('withoutbg', WITHOUTBG.matting.name);
  return { router, matting, backend };
});

export async function removeBackground(image: Blob, phase: (p: CutoutPhase, b?: Backend) => void): Promise<CutoutResult> {
  phase('decoding');
  const orig = await decodeRgba(image);
  const { width: W, height: H } = orig;
  // Like fit_max_size(): very large images are scaled down for inference.
  const fit = Math.min(1, WITHOUTBG.maxInferenceSize / W, WITHOUTBG.maxInferenceSize / H);
  const work =
    fit < 1 ? await decodeRgba(image, { width: Math.max(1, Math.floor(W * fit)), height: Math.max(1, Math.floor(H * fit)) }) : orig;
  const { width: w, height: h } = work;
  const S = WITHOUTBG.mattingSize;
  const D = WITHOUTBG.depthSize;
  const rgbMatting = new ort.Tensor('float32', rgbaToBilinearNCHW(work.data, w, h, S), [1, 3, S, S]);
  const rgbDepth = new ort.Tensor('float32', rgbaToBicubicNCHW(work.data, w, h, D), [1, 3, D, D]);

  phase('loading', await pickBackend());
  const s = await sessions();

  phase('router', s.backend);
  const feats = await s.router.run({ rgb_matting: rgbMatting }, [...FEATURES]);

  phase('matting', s.backend);
  let alpha: Float32Array;
  try {
    const out = await s.matting.run(
      { rgb_depth: rgbDepth, rgb_matting: rgbMatting, f0: feats.f0, f1: feats.f1, f2: feats.f2, f3: feats.f3 },
      ['coarse_alpha'],
    );
    alpha = (await out.coarse_alpha.getData()) as Float32Array;
    out.coarse_alpha.dispose();
  } finally {
    for (const f of FEATURES) feats[f].dispose();
  }

  phase('compositing', s.backend);
  for (let i = 0; i < alpha.length; i++) {
    if (!Number.isFinite(alpha[i])) throw new Error('The model returned an invalid matte.');
  }
  // Upsample to the working size, then (if it was scaled down) to the original size.
  let matte = resizePlaneBilinear(alpha, S, S, w, h);
  if (w !== W || h !== H) matte = resizePlaneBilinear(matte, w, h, W, H);
  const rgba = new Uint8Array(orig.data.buffer, orig.data.byteOffset, orig.data.byteLength);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4 + 3] = Math.min(255, Math.max(0, Math.floor(matte[i] * 255 + 0.5)));
  }
  const encoded = encode({ width: W, height: H, data: rgba, channels: 4, depth: 8 }) as Uint8Array<ArrayBuffer>;
  return { png: new Blob([encoded], { type: 'image/png' }), width: W, height: H, backend: s.backend };
}
