// onnxruntime-web setup shared by every pipeline in the ML worker.

import * as ort from 'onnxruntime-web/webgpu';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { readFromAppFolder } from './appFolderStore';
import { readFile } from './modelStore';
import { MODELS, type ModelId } from './models';
import type { Backend } from './protocol';
import type { StorageLocation } from './storage';

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
ort.env.logLevel = 'error';

export { ort };

let backend: Promise<Backend> | null = null;
let storage: StorageLocation = { kind: 'opfs' };

/** Where model files are read from; the page sends this with each run request. */
export function setStorage(location: StorageLocation): void {
  storage = location;
}

/** WebGPU when the browser has a GPU adapter, otherwise the WASM (CPU) backend. */
export function pickBackend(): Promise<Backend> {
  backend ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    try {
      return gpu && (await gpu.requestAdapter()) ? 'webgpu' : 'wasm';
    } catch {
      return 'wasm';
    }
  })();
  return backend;
}

/** Creates a session from a stored model file. The file buffer is dropped once the weights are loaded. */
export async function createSession(
  model: ModelId,
  fileName: string,
  extra: ort.InferenceSession.SessionOptions = {},
): Promise<ort.InferenceSession> {
  const spec = MODELS[model];
  const file = spec.files.find((f) => f.name === fileName)!;
  const buffer =
    storage.kind === 'app-folder' ? await readFromAppFolder(storage.baseUrl, spec, file) : await readFile(spec.dir, file);
  const bytes = new Uint8Array(buffer);
  return ort.InferenceSession.create(bytes, {
    executionProviders: [await pickBackend()],
    graphOptimizationLevel: 'all',
    // Errors only: ORT otherwise warns on every session that it keeps shape ops on the CPU, which is expected.
    logSeverityLevel: 3,
    ...extra,
  });
}

/** Lazily creates something once; a failure is not cached, so the next call retries. */
export function once<T>(make: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => {
    p ??= make().catch((e) => {
      p = null;
      throw e;
    });
    return p;
  };
}

/** Decodes an image (EXIF orientation applied) to non-premultiplied RGBA bytes. */
export async function decodeRgba(
  image: Blob,
  resize?: { width: number; height: number },
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const bmp = await createImageBitmap(image, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
    ...(resize && { resizeWidth: resize.width, resizeHeight: resize.height, resizeQuality: 'high' }),
  });
  const { width, height } = bmp;
  const ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}
