// Depth estimation with Depth Anything V2 Small, mirroring infer() + the 16-bit
// output in scripts/Depth-Anything-V2/depth_test.py.

import { encode } from 'fast-png';
import type { Backend, DepthPhase, DepthResult } from '../protocol';
import { createSession, decodeRgba, once, ort, pickBackend } from '../runtime';
import { DEPTH } from './config';
import { inputSize, resizeAlignCorners, rgbaToCubicNormalizedNCHW } from './resize';

const session = once(async () => ({
  model: await createSession('depth', DEPTH.model.name),
  backend: await pickBackend(),
}));

/**
 * Estimates depth for `image`. With a `cutout` (same size, alpha = character),
 * also reports the mean depth of the character and of the rest of the scene.
 */
export async function estimateDepth(
  image: Blob,
  cutout: Blob | null,
  phase: (p: DepthPhase, b?: Backend) => void,
): Promise<DepthResult> {
  phase('decoding');
  const img = await decodeRgba(image);
  const { width: W, height: H } = img;
  const size = inputSize(W, H, DEPTH.inputSize, DEPTH.multipleOf);
  const input = rgbaToCubicNormalizedNCHW(img.data, W, H, size.width, size.height, DEPTH.mean, DEPTH.std);

  phase('loading', await pickBackend());
  const s = await session();

  phase('depth', s.backend);
  const out = await s.model.run({ pixel_values: new ort.Tensor('float32', input, [1, 3, size.height, size.width]) });
  const pred = out.predicted_depth;
  const [oh, ow] = pred.dims.slice(-2);
  const raw = (await pred.getData()) as Float32Array;
  pred.dispose();

  phase('encoding', s.backend);
  const depth = resizeAlignCorners(raw, ow, oh, W, H);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < depth.length; i++) {
    const v = depth[i];
    if (!Number.isFinite(v)) throw new Error('The model returned invalid depth.');
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(max - min, 1e-8);
  // (norm * 65535).astype(np.uint16) truncates.
  const u16 = new Uint16Array(W * H);
  for (let i = 0; i < u16.length; i++) u16[i] = Math.floor(((depth[i] - min) / range) * 65535);

  let means: DepthResult['means'] = null;
  if (cutout) {
    const a = await decodeRgba(cutout, { width: W, height: H });
    let fg = 0;
    let fgN = 0;
    let bg = 0;
    let bgN = 0;
    for (let i = 0; i < u16.length; i++) {
      if (a.data[i * 4 + 3] >= 128) {
        fg += u16[i];
        fgN++;
      } else {
        bg += u16[i];
        bgN++;
      }
    }
    means = {
      character: fgN ? fg / fgN / 65535 : 0,
      background: bgN ? bg / bgN / 65535 : 0,
    };
  }

  const encoded = encode({ width: W, height: H, data: u16, channels: 1, depth: 16 }) as Uint8Array<ArrayBuffer>;
  return { png: new Blob([encoded], { type: 'image/png' }), width: W, height: H, backend: s.backend, means };
}
