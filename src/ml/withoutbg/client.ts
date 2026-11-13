// Main-thread API for background removal. All heavy work happens in the worker.

import { deleteStored, isStored } from '../modelStore';
import { WITHOUTBG, WITHOUTBG_FILES } from './config';
import type { Backend, CutoutResult, Phase, Request, Response } from './protocol';

export type { Backend, CutoutResult, Phase };

const STORE_DIR = `withoutbg-${WITHOUTBG.version}`;

type Listener = (msg: Response) => void;
/** Omit that distributes over a union. */
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
let worker: Worker | null = null;
let nextId = 1;
const listeners = new Map<number, Listener>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'withoutbg' });
    worker.onmessage = (e: MessageEvent<Response>) => listeners.get(e.data.id)?.(e.data);
    worker.onerror = (e) => {
      // A crashed worker fails every pending request; the next call starts a fresh one.
      const message = e.message || 'The background removal worker crashed.';
      for (const [id, l] of listeners) l({ id, type: 'error', message });
      listeners.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

function call(req: Without<Request, 'id'>, onEvent: Listener = () => {}): Promise<CutoutResult | undefined> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    listeners.set(id, (msg) => {
      if (msg.type === 'done') {
        listeners.delete(id);
        resolve(msg.result);
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

/** True when both model files are already downloaded and verified. */
export function isModelStored(): Promise<boolean> {
  return isStored(STORE_DIR, WITHOUTBG_FILES);
}

export async function deleteModel(): Promise<void> {
  await deleteStored(STORE_DIR);
}

/** Downloads the model files into OPFS (skipping any already stored). */
export async function downloadModel(onProgress: (loaded: number, total: number) => void): Promise<void> {
  // Ask the browser not to evict the files under storage pressure. It may say no; that's fine.
  await navigator.storage.persist?.().catch(() => false);
  const baseUrl = new URL(WITHOUTBG.baseUrl, location.href).href;
  await call({ type: 'download', baseUrl }, (m) => m.type === 'progress' && onProgress(m.loaded, m.total));
}

/** Cuts the subject out of `image`. The model must be downloaded first. */
export async function removeBackground(image: Blob, onPhase: (phase: Phase, backend?: Backend) => void): Promise<CutoutResult> {
  const result = await call({ type: 'run', image }, (m) => m.type === 'phase' && onPhase(m.phase, m.backend));
  return result!;
}
