// Packages a finished scene as a Layla mini-app zip:
//
//   app.json          title, tagline, description, icon and preview for Layla's app list
//   index.html        the standalone player (three.js included) with the scene settings baked in
//   background.<ext>  the original photo, as uploaded
//   character.png     the cutout (original with the matte as alpha)
//   depth.png         16-bit depth map of the original
//   icon.png          square thumbnail
//   preview.jpg       downscaled original, used as the listing background
//
// Everything sits at the zip root, as Layla's importer expects. index.html loads
// the images with relative fetches, which Layla serves from the mini-app folder.

import playerCode from 'virtual:parallax-player';
import type { ViewerSettings } from '../parallax/ParallaxViewer';
import { SCENE_ELEMENT_ID, STAGE_ELEMENT_ID, STATUS_ELEMENT_ID, type SceneFile } from '../player/scene';
import { zip } from './zip';

export interface SceneExportInput {
  title: string;
  original: Blob;
  originalName: string;
  cutout: Blob;
  depth: Blob;
  settings: ViewerSettings;
}

const ICON_SIZE = 512;
const PREVIEW_LONG_SIDE = 1024;

const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
const text = (s: string) => new TextEncoder().encode(s);

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'parallax-scene';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function extensionOf(blob: Blob, name: string): string {
  const fromType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type];
  return fromType ?? (name.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase() || 'jpg');
}

/** Draws `image` scaled to cover a w×h canvas (centred crop) and encodes it. */
async function render(image: Blob, w: number, h: number, type: string, quality?: number): Promise<Blob> {
  const bmp = await createImageBitmap(image);
  const scale = Math.max(w / bmp.width, h / bmp.height);
  const dw = bmp.width * scale;
  const dh = bmp.height * scale;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
  bmp.close();
  return canvas.convertToBlob({ type, quality });
}

async function preview(image: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(image);
  const scale = Math.min(1, PREVIEW_LONG_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  bmp.close();
  return render(image, w, h, 'image/jpeg', 0.85);
}

const MOTION_HINT = {
  pointer: 'Move your pointer or drag to look around.',
  tilt: 'Tilt your device to look around.',
  drift: 'The scene sways gently on its own.',
} as const;

function indexHtml(title: string, scene: SceneFile): string {
  // Keep "</script" out of the inline JSON and code so the HTML parser can't end the element early.
  const json = JSON.stringify(scene).replace(/</g, '\\u003c');
  const code = playerCode.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #000; touch-action: none; }
  #${STAGE_ELEMENT_ID} { position: fixed; inset: 0; }
  #${STATUS_ELEMENT_ID} {
    position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%);
    padding: 8px 14px; border-radius: 999px; background: rgba(0, 0, 0, 0.6); color: #fff;
    font: 500 13px/1.3 system-ui, -apple-system, sans-serif; white-space: nowrap; pointer-events: none;
  }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div id="${STAGE_ELEMENT_ID}"></div>
<div id="${STATUS_ELEMENT_ID}">Loading…</div>
<script type="application/json" id="${SCENE_ELEMENT_ID}">${json}</script>
<script>${code}</script>
</body>
</html>
`;
}

/** Builds the mini-app zip for a scene. */
export async function exportScene(input: SceneExportInput): Promise<{ blob: Blob; filename: string }> {
  const { settings } = input;
  const title = input.title.trim() || 'Parallax scene';
  const backgroundName = `background.${extensionOf(input.original, input.originalName)}`;

  const scene: SceneFile = {
    version: 1,
    files: { background: backgroundName, character: 'character.png', depth: 'depth.png' },
    settings: {
      depthScale: settings.depthScale,
      motion: settings.motion,
      focus: settings.focus,
      zoom: settings.zoom,
      motionSource: settings.motionSource,
    },
  };

  const appJson = {
    title,
    tagline: 'A 2.5D parallax scene',
    description: `A photo turned into a 2.5D scene with depth. ${MOTION_HINT[settings.motionSource]}`,
    iconUri: 'icon.png',
    backgroundImgUri: 'preview.jpg',
    version: '1.0.0',
  };

  const [icon, previewJpg] = await Promise.all([
    render(input.original, ICON_SIZE, ICON_SIZE, 'image/png'),
    preview(input.original),
  ]);

  const blob = await zip([
    { name: 'app.json', data: text(JSON.stringify(appJson, null, 2)), compress: true },
    { name: 'index.html', data: text(indexHtml(title, scene)), compress: true },
    { name: backgroundName, data: await bytes(input.original) },
    { name: 'character.png', data: await bytes(input.cutout) },
    { name: 'depth.png', data: await bytes(input.depth) },
    { name: 'icon.png', data: await bytes(icon) },
    { name: 'preview.jpg', data: await bytes(previewJpg) },
  ]);
  return { blob, filename: `${slugify(title)}.zip` };
}
