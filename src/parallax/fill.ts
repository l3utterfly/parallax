// CPU helpers for building per-layer depth maps at a small working resolution.

/** Square max filter (dilation) of a binary mask with radius r. */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 0;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let i = x0; i <= x1 && !m; i++) m = mask[row + i];
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 0;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let j = y0; j <= y1 && !m; j++) m = tmp[j * w + x];
      out[y * w + x] = m;
    }
  }
  return out;
}

export function invert(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}

/** Square min filter (erosion) of a binary mask with radius r. */
export function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return invert(dilate(invert(mask), w, h, r));
}

export function count(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}

/**
 * Push-pull hole filling: values where `valid` is 0 are replaced by a smooth
 * extrapolation of the surrounding valid values (image pyramid down, then
 * bilinear fill back up). Valid pixels are kept as they are.
 */
export function pushPullFill(src: Float32Array, valid: Uint8Array, w: number, h: number): Float32Array {
  type Level = { w: number; h: number; v: Float32Array; a: Uint8Array };
  const levels: Level[] = [{ w, h, v: Float32Array.from(src), a: valid.slice() }];

  while (true) {
    const L = levels[levels.length - 1];
    if (L.w <= 1 && L.h <= 1) break;
    const nw = Math.max(1, Math.ceil(L.w / 2));
    const nh = Math.max(1, Math.ceil(L.h / 2));
    const v = new Float32Array(nw * nh);
    const a = new Uint8Array(nw * nh);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let s = 0;
        let n = 0;
        for (let dy = 0; dy < 2; dy++) {
          const sy = 2 * y + dy;
          if (sy >= L.h) continue;
          for (let dx = 0; dx < 2; dx++) {
            const sx = 2 * x + dx;
            if (sx >= L.w) continue;
            const i = sy * L.w + sx;
            if (L.a[i]) {
              s += L.v[i];
              n++;
            }
          }
        }
        if (n) {
          v[y * nw + x] = s / n;
          a[y * nw + x] = 1;
        }
      }
    }
    levels.push({ w: nw, h: nh, v, a });
  }

  if (!levels[levels.length - 1].a[0]) return Float32Array.from(src); // nothing valid

  for (let k = levels.length - 2; k >= 0; k--) {
    const F = levels[k];
    const C = levels[k + 1];
    for (let y = 0; y < F.h; y++) {
      for (let x = 0; x < F.w; x++) {
        const i = y * F.w + x;
        if (F.a[i]) continue;
        F.v[i] = sampleBilinear(C.v, C.w, C.h, (x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5);
      }
    }
  }
  return levels[0].v;
}

/** Bilinear sample in pixel coordinates, clamped to the edges. */
export function sampleBilinear(v: Float32Array, w: number, h: number, x: number, y: number): number {
  x = Math.min(Math.max(x, 0), w - 1);
  y = Math.min(Math.max(y, 0), h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = v[y0 * w + x0] * (1 - fx) + v[y0 * w + x1] * fx;
  const b = v[y1 * w + x0] * (1 - fx) + v[y1 * w + x1] * fx;
  return a * (1 - fy) + b * fy;
}

/** Separable box blur with radius r (edges clamped). */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return Float32Array.from(src);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[row + Math.min(Math.max(i, 0), w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / n;
      s += src[row + Math.min(x + r + 1, w - 1)] - src[row + Math.max(x - r, 0)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += tmp[Math.min(Math.max(i, 0), h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
    }
  }
  return out;
}

/** Resize a single-channel float image: area average when shrinking, bilinear when growing. */
export function resample(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  if (sw === dw && sh === dh) return Float32Array.from(src);
  const out = new Float32Array(dw * dh);
  const sx = sw / dw;
  const sy = sh / dh;
  if (sx >= 1 && sy >= 1) {
    for (let y = 0; y < dh; y++) {
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      for (let x = 0; x < dw; x++) {
        const x0 = Math.floor(x * sx);
        const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
        let s = 0;
        for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) s += src[j * sw + i];
        out[y * dw + x] = s / ((y1 - y0) * (x1 - x0));
      }
    }
  } else {
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        out[y * dw + x] = sampleBilinear(src, sw, sh, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5);
      }
    }
  }
  return out;
}
