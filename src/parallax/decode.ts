import { decode } from 'fast-png';

export interface DepthImage {
  width: number;
  height: number;
  /** Min-max normalized to 0..1. Larger = closer (Depth Anything inverse depth). */
  data: Float32Array;
  bitDepth: number;
  /** True if the PNG looks like a colormapped preview instead of raw grayscale. */
  colorized: boolean;
}

function isPng(buf: Uint8Array): boolean {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

/**
 * Decodes a depth map. PNGs are decoded in JS so 16-bit files from
 * scripts/Depth-Anything-V2/depth_test.py (`*_16bit.png`) keep full precision;
 * browsers would quantize them to 8 bits. Anything else falls back to the
 * browser decoder (first channel).
 */
export async function decodeDepth(blob: Blob): Promise<DepthImage> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (isPng(buf)) {
    const png = decode(buf);
    if (!png.palette && png.depth >= 8) {
      const { width, height, channels } = png;
      const src = png.data;
      const max = (1 << png.depth) - 1;
      const data = new Float32Array(width * height);
      for (let i = 0; i < data.length; i++) data[i] = src[i * channels] / max;
      let colorized = false;
      if (channels >= 3) {
        let off = 0;
        let n = 0;
        const step = Math.max(1, Math.floor(data.length / 5000));
        for (let i = 0; i < data.length; i += step, n++) {
          const r = src[i * channels];
          const g = src[i * channels + 1];
          const b = src[i * channels + 2];
          if (Math.abs(r - g) > max * 0.06 || Math.abs(g - b) > max * 0.06) off++;
        }
        colorized = off / n > 0.2;
      }
      return { width, height, data: normalize(data), bitDepth: png.depth, colorized };
    }
  }

  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const { width, height } = bmp;
  const px = readPixels(bmp, width, height);
  bmp.close();
  const data = new Float32Array(width * height);
  let off = 0;
  for (let i = 0; i < data.length; i++) {
    data[i] = px[i * 4] / 255;
    if (Math.abs(px[i * 4] - px[i * 4 + 1]) > 15 || Math.abs(px[i * 4 + 1] - px[i * 4 + 2]) > 15) off++;
  }
  return { width, height, data: normalize(data), bitDepth: 8, colorized: off / data.length > 0.2 };
}

function normalize(d: Float32Array): Float32Array {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < d.length; i++) {
    if (d[i] < lo) lo = d[i];
    if (d[i] > hi) hi = d[i];
  }
  const range = hi - lo;
  if (range < 1e-6) return d;
  for (let i = 0; i < d.length; i++) d[i] = (d[i] - lo) / range;
  return d;
}

export function readPixels(src: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}
