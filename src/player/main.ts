// Standalone player for exported scenes. Built into one self-contained script
// (see the parallax-player plugin in vite.config.ts) and inlined into the
// mini-app's index.html, next to the background, character and depth files.
// Reuses the editor's renderer, so an exported scene looks the same as the preview.

import { DEFAULT_SETTINGS, ParallaxViewer } from '../parallax/ParallaxViewer';
import { requestTiltAccess } from '../parallax/motion';
import { prepareAssets } from '../parallax/prepare';
import { SCENE_ELEMENT_ID, STAGE_ELEMENT_ID, STATUS_ELEMENT_ID, type SceneFile } from './scene';

const status = document.getElementById(STATUS_ELEMENT_ID);
const say = (text: string) => {
  if (!status) return;
  status.textContent = text;
  status.hidden = !text;
};

async function load(path: string): Promise<Blob> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status}).`);
  return res.blob();
}

async function main() {
  const scene = JSON.parse(document.getElementById(SCENE_ELEMENT_ID)!.textContent!) as SceneFile;
  const { files, settings } = scene;

  const [background, character, depth] = await Promise.all([files.background, files.character, files.depth].map(load));
  const assets = await prepareAssets({ background, character, depth });

  const viewer = new ParallaxViewer(document.getElementById(STAGE_ELEMENT_ID)!);
  viewer.setAssets(assets);
  viewer.setSettings({ ...DEFAULT_SETTINGS, ...settings, view: 'composite' });
  say('');

  // Tilt: iOS only grants motion access from a tap, so ask on the first one.
  if (settings.motionSource === 'tilt') {
    const ctor = window.DeviceOrientationEvent as unknown as { requestPermission?: unknown } | undefined;
    if (typeof ctor?.requestPermission === 'function') {
      say('Tap to enable motion');
      window.addEventListener(
        'pointerdown',
        () => {
          say('');
          void requestTiltAccess();
        },
        { once: true },
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  say(e instanceof Error ? e.message : String(e));
});
