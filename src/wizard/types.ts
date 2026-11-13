import type { Backend } from '../ml/client';

export interface SourceImage {
  blob: Blob;
  url: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  /** True for the bundled sample, whose URL must not be revoked. */
  sample: boolean;
}

/** Output of step 1: the original image with the matte as alpha. */
export interface Cutout {
  blob: Blob;
  url: string;
  backend: Backend;
  /** Wall time of the whole background-removal run. */
  seconds: number;
}

/** Output of step 2: Depth Anything's relative inverse depth for the original image. */
export interface DepthMap {
  /** 16-bit grayscale PNG, white = near. */
  blob: Blob;
  url: string;
  backend: Backend;
  seconds: number;
  /** Mean depth (0 = far, 1 = near) of the character and of the rest of the scene. */
  means: { character: number; background: number } | null;
}

export type MotionSource = 'pointer' | 'tilt' | 'drift';
export type ClockFormat = '12h' | '24h';

/** Options that only exist in the UI for now; the viewer doesn't read them yet. */
export interface ExtraSettings {
  motionSource: MotionSource;
  clockFormat: ClockFormat;
  showDate: boolean;
}

export const DEFAULT_EXTRAS: ExtraSettings = { motionSource: 'pointer', clockFormat: '12h', showDate: true };

export const formatBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
