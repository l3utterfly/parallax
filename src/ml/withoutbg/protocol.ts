/** Messages between the background-removal client and its worker. */

export type Backend = 'webgpu' | 'wasm';

export type Phase = 'decoding' | 'loading' | 'router' | 'matting' | 'compositing';

export interface CutoutResult {
  /** PNG: the original image with the matte as its alpha channel. */
  png: Blob;
  width: number;
  height: number;
  backend: Backend;
  /** Milliseconds per phase. */
  timings: Partial<Record<Phase, number>>;
}

export type Request =
  | { id: number; type: 'download'; baseUrl: string }
  | { id: number; type: 'run'; image: Blob };

export type Response =
  | { id: number; type: 'progress'; loaded: number; total: number }
  | { id: number; type: 'phase'; phase: Phase; backend?: Backend }
  | { id: number; type: 'done'; result?: CutoutResult }
  | { id: number; type: 'error'; message: string };
