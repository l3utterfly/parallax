/** Messages between the main thread and the ML worker. Downloads into the Layla app folder run on the page instead. */

import type { ModelId } from './models';
import type { StorageLocation } from './storage';

export type Backend = 'webgpu' | 'wasm';

/** Background removal phases. */
export type CutoutPhase = 'decoding' | 'loading' | 'router' | 'matting' | 'compositing';
/** Depth estimation phases. */
export type DepthPhase = 'decoding' | 'loading' | 'depth' | 'encoding';
export type Phase = CutoutPhase | DepthPhase;

export interface CutoutResult {
  /** PNG: the original image with the matte as its alpha channel. */
  png: Blob;
  width: number;
  height: number;
  backend: Backend;
}

export interface DepthResult {
  /** 16-bit grayscale PNG of relative inverse depth, min-max normalized (white = near). */
  png: Blob;
  width: number;
  height: number;
  backend: Backend;
  /** Mean normalized depth (0 = far, 1 = near) under the cutout and outside it; null without a cutout. */
  means: { character: number; background: number } | null;
}

export type Request =
  | { id: number; type: 'download'; model: ModelId }
  | { id: number; type: 'removeBackground'; image: Blob; storage: StorageLocation }
  | { id: number; type: 'estimateDepth'; image: Blob; cutout: Blob | null; storage: StorageLocation };

export type Response =
  | { id: number; type: 'progress'; loaded: number; total: number }
  | { id: number; type: 'phase'; phase: Phase; backend?: Backend }
  | { id: number; type: 'done'; result?: CutoutResult | DepthResult }
  | { id: number; type: 'error'; message: string };
