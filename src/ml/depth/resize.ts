// Ports of the preprocessing in scripts/Depth-Anything-V2/depth_anything_v2/dpt.py
// (image2tensor) and the output resize in depth_test.py.

/** numpy's round(): halves go to the nearest even number. */
function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/**
 * Model input size for an image: Resize(keep_aspect_ratio, resize_method='lower_bound',
 * ensure_multiple_of=14). The short side becomes at least `size`.
 */
export function inputSize(w: number, h: number, size: number, multiple: number): { width: number; height: number } {
  const scale = Math.max(size / w, size / h);
  const constrain = (x: number) => {
    let y = roundHalfEven(x / multiple) * multiple;
    if (y < size) y = Math.ceil(x / multiple) * multiple;
    return y;
  };
  return { width: constrain(scale * w), height: constrain(scale * h) };
}

/** cv2 INTER_CUBIC taps for one axis: 4 clamped source indices and weights per output pixel. */
function cubicAxis(src: number, dst: number) {
  const idx = new Int32Array(dst * 4);
  const wts = new Float32Array(dst * 4);
  const scale = src / dst;
  const A = -0.75;
  for (let d = 0; d < dst; d++) {
    const fx = (d + 0.5) * scale - 0.5;
    const sx = Math.floor(fx);
    const x = fx - sx;
    const c0 = ((A * (x + 1) - 5 * A) * (x + 1) + 8 * A) * (x + 1) - 4 * A;
    const c1 = ((A + 2) * x - (A + 3)) * x * x + 1;
    const c2 = ((A + 2) * (1 - x) - (A + 3)) * (1 - x) * (1 - x) + 1;
    const cs = [c0, c1, c2, 1 - c0 - c1 - c2];
    for (let k = 0; k < 4; k++) {
      idx[d * 4 + k] = Math.min(src - 1, Math.max(0, sx - 1 + k)); // cv2 replicates the border
      wts[d * 4 + k] = cs[k];
    }
  }
  return { idx, wts };
}

/**
 * RGBA bytes (w×h) -> float32 NCHW [1,3,nh,nw]: cv2.resize(INTER_CUBIC) of the
 * [0,1] RGB image, then (x - mean) / std.
 */
export function rgbaToCubicNormalizedNCHW(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  nw: number,
  nh: number,
  mean: readonly number[],
  std: readonly number[],
): Float32Array {
  const hx = cubicAxis(w, nw);
  const vy = cubicAxis(h, nh);
  // Horizontal pass: h rows × nw columns × 3 channels (interleaved).
  const tmp = new Float32Array(h * nw * 3);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < nw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < 4; k++) {
        const p = (row + hx.idx[x * 4 + k]) * 4;
        const wt = hx.wts[x * 4 + k];
        r += rgba[p] * wt;
        g += rgba[p + 1] * wt;
        b += rgba[p + 2] * wt;
      }
      const o = (y * nw + x) * 3;
      tmp[o] = r / 255;
      tmp[o + 1] = g / 255;
      tmp[o + 2] = b / 255;
    }
  }
  // Vertical pass, then normalize into planar output.
  const plane = nw * nh;
  const out = new Float32Array(3 * plane);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += tmp[(vy.idx[y * 4 + k] * nw + x) * 3 + c] * vy.wts[y * 4 + k];
        out[c * plane + y * nw + x] = (s - mean[c]) / std[c];
      }
    }
  }
  return out;
}

/** Float plane (sw×sh) -> (dw×dh), torch bilinear with align_corners=True. */
export function resizeAlignCorners(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  const out = new Float32Array(dw * dh);
  const sxScale = dw > 1 ? (sw - 1) / (dw - 1) : 0;
  const syScale = dh > 1 ? (sh - 1) / (dh - 1) : 0;
  const x0 = new Int32Array(dw);
  const x1 = new Int32Array(dw);
  const fx = new Float32Array(dw);
  for (let x = 0; x < dw; x++) {
    const p = x * sxScale;
    x0[x] = Math.floor(p);
    x1[x] = Math.min(x0[x] + 1, sw - 1);
    fx[x] = p - x0[x];
  }
  for (let y = 0; y < dh; y++) {
    const p = y * syScale;
    const y0 = Math.floor(p);
    const y1 = Math.min(y0 + 1, sh - 1);
    const fy = p - y0;
    const r0 = y0 * sw;
    const r1 = y1 * sw;
    for (let x = 0; x < dw; x++) {
      const a = src[r0 + x0[x]];
      const b = src[r0 + x1[x]];
      const c = src[r1 + x0[x]];
      const d = src[r1 + x1[x]];
      const top = a + (b - a) * fx[x];
      const bot = c + (d - c) * fx[x];
      out[y * dw + x] = top + (bot - top) * fy;
    }
  }
  return out;
}
