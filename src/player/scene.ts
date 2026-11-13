// The scene description baked into an exported mini-app's index.html.

import type { ViewerSettings } from '../parallax/ParallaxViewer';

/** Settings that make up the look of a scene (the rest of ViewerSettings is editor-only). */
export type SceneSettings = Pick<ViewerSettings, 'depthScale' | 'motion' | 'focus' | 'zoom' | 'motionSource'>;

export interface SceneFile {
  version: 1;
  /** Paths relative to index.html. */
  files: { background: string; character: string; depth: string };
  settings: SceneSettings;
}

/** id of the <script type="application/json"> element holding the SceneFile. */
export const SCENE_ELEMENT_ID = 'parallax-scene';
/** id of the element the player renders into. */
export const STAGE_ELEMENT_ID = 'parallax-stage';
/** id of the status line (loading, errors, "tap to enable motion"). */
export const STATUS_ELEMENT_ID = 'parallax-status';
