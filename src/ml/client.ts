// Main-thread API for the ML worker. All heavy work happens in the worker.

import { deleteFromAppFolder, downloadToAppFolder, isStoredInAppFolder } from './appFolderStore';
import { deleteStored, isStored } from './modelStore';
import { MODELS, type ModelId } from './models';
import { storageLocation } from './storage';
import type { Backend, CutoutPhase, CutoutResult, DepthPhase, DepthResult, Request, Response } from './protocol';

export type { Backend, CutoutPhase, CutoutResult, DepthPhase, DepthResult, ModelId };

type Listener = (msg: Response) => void;
/** Omit that distributes over a union. */
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

let worker: Worker | null = null;
let nextId = 1;
const listeners = new Map<number, Listener>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'ml' });
    worker.onmessage = (e: MessageEvent<Response>) => listeners.get(e.data.id)?.(e.data);
    worker.onerror = (e) => {
      // A crashed worker fails every pending request; the next call starts a fresh one.
      const message = e.message || 'The ML worker crashed.';
      for (const [id, l] of listeners) l({ id, type: 'error', message });
      listeners.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

/**
 * Stops the ML worker, freeing its models: their weights sit in the worker's
 * WASM heap (which never shrinks) and GPU buffers, several hundred MB that
 * otherwise stay resident for the rest of the session. Call it before
 * memory-heavy work once ML is done; iOS ends the page when it uses too much
 * memory. The next ML call starts a fresh worker and loads the models again.
 */
export function releaseMl(): void {
  if (!worker) return;
  worker.terminate();
  worker = null;
  for (const [id, l] of listeners) l({ id, type: 'error', message: 'The ML worker was stopped.' });
  listeners.clear();
}

function call<T>(req: Without<Request, 'id'>, onEvent: Listener = () => {}): Promise<T> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    listeners.set(id, (msg) => {
      if (msg.type === 'done') {
        listeners.delete(id);
        resolve(msg.result as T);
      } else if (msg.type === 'error') {
        listeners.delete(id);
        reject(new Error(msg.message));
      } else {
        onEvent(msg);
      }
    });
    getWorker().postMessage({ ...req, id } as Request);
  });
}

/** True when every file of the model is downloaded and verified. */
export function isModelStored(model: ModelId): Promise<boolean> {
  const where = storageLocation();
  const spec = MODELS[model];
  return where.kind === 'app-folder' ? isStoredInAppFolder(where.baseUrl, spec) : isStored(spec.dir, spec.files);
}

export function deleteModel(model: ModelId): Promise<void> {
  const where = storageLocation();
  return where.kind === 'app-folder' ? deleteFromAppFolder(MODELS[model]) : deleteStored(MODELS[model].dir);
}

/** Downloads the model's files (Layla app folder or OPFS), skipping any already stored. */
export async function downloadModel(model: ModelId, onProgress: (loaded: number, total: number) => void): Promise<void> {
  const where = storageLocation();
  // Saving into the Layla app folder goes through the SDK, which only exists on the page.
  if (where.kind === 'app-folder') return downloadToAppFolder(where.baseUrl, MODELS[model], onProgress);
  // Ask the browser not to evict the files under storage pressure. It may say no; that's fine.
  await navigator.storage.persist?.().catch(() => false);
  await call<void>({ type: 'download', model }, (m) => m.type === 'progress' && onProgress(m.loaded, m.total));
}

/** Cuts the subject out of `image` (withoutBG). The model must be downloaded first. */
export function removeBackground(image: Blob, onPhase: (phase: CutoutPhase, backend?: Backend) => void): Promise<CutoutResult> {
  return call<CutoutResult>({ type: 'removeBackground', image, storage: storageLocation() }, (m) => m.type === 'phase' && onPhase(m.phase as CutoutPhase, m.backend));
}

/** Estimates depth for `image` (Depth Anything V2). The model must be downloaded first. */
export function estimateDepth(
  image: Blob,
  cutout: Blob | null,
  onPhase: (phase: DepthPhase, backend?: Backend) => void,
): Promise<DepthResult> {
  return call<DepthResult>({ type: 'estimateDepth', image, cutout, storage: storageLocation() }, (m) => m.type === 'phase' && onPhase(m.phase as DepthPhase, m.backend));
}
