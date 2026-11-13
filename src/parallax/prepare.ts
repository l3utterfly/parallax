import * as THREE from 'three';
import { decodeDepth, readPixels } from './decode';
import { boxBlur, count, dilate, erode, invert, pushPullFill, resample } from './fill';

export interface SourceBlobs {
  background: Blob;
  character: Blob;
  depth: Blob;
}

export interface PreparedAssets {
  /** Background image size in pixels; the character must match it. */
  width: number;
  height: number;
  aspect: number;
  /** Working resolution of the depth arrays below. */
  workW: number;
  workH: number;
  /** Depth (0..1, 1 = near) with the character removed and the hole filled in. */
  bgDepth: Float32Array;
  /** Depth of the character, extended outward past its silhouette. */
  fgDepth: Float32Array;
  bgTexture: THREE.Texture;
  fgTexture: THREE.Texture;
  /** Grayscale visualizations of bgDepth / fgDepth for the debug view. */
  bgDepthTexture: THREE.DataTexture;
  fgDepthTexture: THREE.DataTexture;
  stats: { bgMean: number; fgMean: number; coverage: number };
  /** Centroid of the character's solid pixels, 0..1 across the image (t = 0 is the top row). */
  fgCenter: { u: number; t: number };
  info: { depthWidth: number; depthHeight: number; depthBits: number; warnings: string[] };
  dispose(): void;
}

/** Long side of the working resolution used for depth processing and the mesh. */
const WORK_LONG = 512;

async function colorTexture(blob: Blob): Promise<{ tex: THREE.Texture; w: number; h: number }> {
  // Premultiplied so mipmaps and linear filtering don't produce dark fringes around the cut-out.
  const bmp = await createImageBitmap(blob, {
    imageOrientation: 'flipY',
    premultiplyAlpha: 'premultiply',
    colorSpaceConversion: 'none',
  });
  const tex = new THREE.Texture(bmp);
  tex.flipY = false; // already flipped by createImageBitmap
  tex.premultiplyAlpha = false; // already premultiplied
  tex.colorSpace = THREE.NoColorSpace; // pass sRGB bytes straight through
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return { tex, w: bmp.width, h: bmp.height };
}

function depthVisTexture(depth: Float32Array, alpha: Float32Array | null, w: number, h: number): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const dst = (h - 1 - y) * w; // DataTexture row 0 is the bottom
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = alpha ? alpha[i] : 1;
      const g = Math.round(depth[i] * 255 * a);
      const o = (dst + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = g;
      data[o + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export async function prepareAssets(src: SourceBlobs): Promise<PreparedAssets> {
  const warnings: string[] = [];
  const [bg, fg, depth] = await Promise.all([
    colorTexture(src.background),
    colorTexture(src.character),
    decodeDepth(src.depth),
  ]);

  const { w: width, h: height } = bg;
  const aspect = width / height;
  if (fg.w !== width || fg.h !== height) {
    warnings.push(`Character is ${fg.w}×${fg.h} but the background is ${width}×${height}; it was stretched to fit.`);
  }
  if (Math.abs(depth.width / depth.height - aspect) > 0.01) {
    warnings.push(`Depth map aspect ratio (${depth.width}×${depth.height}) differs from the background.`);
  }
  if (depth.colorized) {
    warnings.push('Depth map looks colorized. Use the grayscale *_16bit.png from depth_test.py, not the colored preview.');
  }
  if (depth.bitDepth < 16) {
    warnings.push(`Depth map is ${depth.bitDepth}-bit; a 16-bit PNG gives smoother depth.`);
  }

  const scale = Math.min(1, WORK_LONG / Math.max(width, height));
  const workW = Math.max(2, Math.round(width * scale));
  const workH = Math.max(2, Math.round(height * scale));

  const d = resample(depth.data, depth.width, depth.height, workW, workH);

  const fgBmp = await createImageBitmap(src.character, {
    resizeWidth: workW,
    resizeHeight: workH,
    resizeQuality: 'high',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const px = readPixels(fgBmp, workW, workH);
  fgBmp.close();
  const alpha = new Float32Array(workW * workH);
  const solid = new Uint8Array(workW * workH);
  const any = new Uint8Array(workW * workH);
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = px[i * 4 + 3] / 255;
    solid[i] = alpha[i] > 0.5 ? 1 : 0;
    any[i] = alpha[i] > 0.03 ? 1 : 0;
  }
  const coverage = count(solid) / solid.length;
  if (coverage > 0.98) warnings.push('Character image has almost no transparency; is it a cut-out PNG with alpha?');
  if (coverage < 0.001) warnings.push('Character image is (almost) fully transparent.');

  // The depth model blurs depth across the silhouette, so pull both layers'
  // trusted regions away from the edge before filling.
  const r = Math.max(1, Math.round(Math.max(workW, workH) / 512));
  const bgValid = invert(dilate(any, workW, workH, 6 * r));
  let fgValid = erode(solid, workW, workH, 3 * r);
  if (count(fgValid) < 16) fgValid = solid;

  const bgDepth = count(bgValid) ? boxBlur(pushPullFill(d, bgValid, workW, workH), workW, workH, 2 * r) : d;
  const fgDepth = count(fgValid) ? boxBlur(pushPullFill(d, fgValid, workW, workH), workW, workH, r) : d;

  let bgSum = 0;
  let bgN = 0;
  let fgSum = 0;
  let fgN = 0;
  let fgX = 0;
  let fgY = 0;
  for (let i = 0; i < d.length; i++) {
    if (bgValid[i]) {
      bgSum += d[i];
      bgN++;
    }
    if (solid[i]) {
      fgSum += d[i];
      fgN++;
      fgX += i % workW;
      fgY += Math.floor(i / workW);
    }
  }
  const bgMean = bgN ? bgSum / bgN : 0.3;
  const fgMean = fgN ? fgSum / fgN : 0.7;
  const fgCenter = fgN ? { u: (fgX / fgN + 0.5) / workW, t: (fgY / fgN + 0.5) / workH } : { u: 0.5, t: 0.5 };

  const bgDepthTexture = depthVisTexture(bgDepth, null, workW, workH);
  const fgDepthTexture = depthVisTexture(fgDepth, alpha, workW, workH);

  return {
    width,
    height,
    aspect,
    workW,
    workH,
    bgDepth,
    fgDepth,
    bgTexture: bg.tex,
    fgTexture: fg.tex,
    bgDepthTexture,
    fgDepthTexture,
    stats: { bgMean, fgMean, coverage },
    fgCenter,
    info: { depthWidth: depth.width, depthHeight: depth.height, depthBits: depth.bitDepth, warnings },
    dispose() {
      for (const t of [bg.tex, fg.tex, bgDepthTexture, fgDepthTexture]) {
        t.dispose();
        if (t.image instanceof ImageBitmap) t.image.close();
      }
    },
  };
}
