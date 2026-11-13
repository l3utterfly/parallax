// Resizers that match the reference pipeline (scripts/withoutBG/withoutbg_test.py)
// so the browser produces the same matte as onnxruntime in Python.

/** Sampling positions for torch bilinear, align_corners=False, no antialias. */
function bilinearAxis(src: number, dst: number) {
  const i0 = new Int32Array(dst);
  const i1 = new Int32Array(dst);
  const f = new Float32Array(dst);
  const scale = src / dst;
  for (let i = 0; i < dst; i++) {
    const p = Math.max((i + 0.5) * scale - 0.5, 0);
    i0[i] = Math.floor(p);
    i1[i] = Math.min(i0[i] + 1, src - 1);
    f[i] = p - i0[i];
  }
  return { i0, i1, f };
}

/** RGBA bytes (w×h) -> float32 NCHW [1,3,size,size] in [0,1], torch bilinear (no antialias). */
export function rgbaToBilinearNCHW(rgba: Uint8ClampedArray, w: number, h: number, size: number): Float32Array {
  const out = new Float32Array(3 * size * size);
  const ry = bilinearAxis(h, size);
  const rx = bilinearAxis(w, size);
  const plane = size * size;
  for (let y = 0; y < size; y++) {
    const r0 = ry.i0[y] * w;
    const r1 = ry.i1[y] * w;
    const fy = ry.f[y];
    for (let x = 0; x < size; x++) {
      const c0 = rx.i0[x];
      const c1 = rx.i1[x];
      const fx = rx.f[x];
      for (let ch = 0; ch < 3; ch++) {
        const a = rgba[(r0 + c0) * 4 + ch];
        const b = rgba[(r0 + c1) * 4 + ch];
        const c = rgba[(r1 + c0) * 4 + ch];
        const d = rgba[(r1 + c1) * 4 + ch];
        const top = a + (b - a) * fx;
        const bot = c + (d - c) * fx;
        out[ch * plane + y * size + x] = (top + (bot - top) * fy) / 255;
      }
    }
  }
  return out;
}

/** Single-channel float plane (sw×sh) -> (dw×dh), torch bilinear. */
export function resizePlaneBilinear(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  const out = new Float32Array(dw * dh);
  const ry = bilinearAxis(sh, dh);
  const rx = bilinearAxis(sw, dw);
  for (let y = 0; y < dh; y++) {
    const r0 = ry.i0[y] * sw;
    const r1 = ry.i1[y] * sw;
    const fy = ry.f[y];
    for (let x = 0; x < dw; x++) {
      const fx = rx.f[x];
      const a = src[r0 + rx.i0[x]];
      const b = src[r0 + rx.i1[x]];
      const c = src[r1 + rx.i0[x]];
      const d = src[r1 + rx.i1[x]];
      const top = a + (b - a) * fx;
      const bot = c + (d - c) * fx;
      out[y * dw + x] = top + (bot - top) * fy;
    }
  }
  return out;
}

// --- PIL-style bicubic with antialias (Image.resize(BICUBIC) on float "F" images) ---

function bicubic(x: number): number {
  const a = -0.5;
  x = Math.abs(x);
  if (x < 1) return ((a + 2) * x - (a + 3)) * x * x + 1;
  if (x < 2) return (((x - 5) * x + 8) * x - 4) * a;
  return 0;
}

/** Port of Pillow's precompute_coeffs for one axis. */
function bicubicCoeffs(inSize: number, outSize: number) {
  const scale = inSize / outSize;
  const filterscale = Math.max(scale, 1);
  const support = 2 * filterscale;
  const ksize = Math.ceil(support) * 2 + 1;
  const kk = new Float32Array(outSize * ksize);
  const bounds = new Int32Array(outSize * 2);
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    const ss = 1 / filterscale;
    const xmin = Math.max(Math.trunc(center - support + 0.5), 0);
    const xmax = Math.min(Math.trunc(center + support + 0.5), inSize) - xmin;
    let ww = 0;
    for (let x = 0; x < xmax; x++) {
      const w = bicubic((x + xmin - center + 0.5) * ss);
      kk[xx * ksize + x] = w;
      ww += w;
    }
    if (ww !== 0) for (let x = 0; x < xmax; x++) kk[xx * ksize + x] /= ww;
    bounds[xx * 2] = xmin;
    bounds[xx * 2 + 1] = xmax;
  }
  return { kk, bounds, ksize };
}

/**
 * RGBA bytes (w×h) -> float32 NCHW [1,3,size,size] in [0,1], resampled per
 * channel like Pillow's float bicubic (which matches torch bicubic + antialias).
 */
export function rgbaToBicubicNCHW(rgba: Uint8ClampedArray, w: number, h: number, size: number): Float32Array {
  const hz = bicubicCoeffs(w, size);
  const vt = bicubicCoeffs(h, size);
  const out = new Float32Array(3 * size * size);
  const tmp = new Float32Array(h * size);
  const plane = size * size;
  for (let ch = 0; ch < 3; ch++) {
    // Horizontal pass: h rows × size columns.
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let xx = 0; xx < size; xx++) {
        const xmin = hz.bounds[xx * 2];
        const n = hz.bounds[xx * 2 + 1];
        const k = xx * hz.ksize;
        let s = 0;
        for (let x = 0; x < n; x++) s += rgba[(row + xmin + x) * 4 + ch] * hz.kk[k + x];
        tmp[y * size + xx] = s / 255;
      }
    }
    // Vertical pass.
    for (let yy = 0; yy < size; yy++) {
      const ymin = vt.bounds[yy * 2];
      const n = vt.bounds[yy * 2 + 1];
      const k = yy * vt.ksize;
      for (let xx = 0; xx < size; xx++) {
        let s = 0;
        for (let y = 0; y < n; y++) s += tmp[(ymin + y) * size + xx] * vt.kk[k + y];
        out[ch * plane + yy * size + xx] = s;
      }
    }
  }
  return out;
}
