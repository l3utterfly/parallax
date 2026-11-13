// Model storage in the Layla mini-app folder.
//
// Writing goes through `layla.utils.saveFile`, which takes a whole file as one
// base64 string over the WebView bridge, so each model is saved as fixed-size
// parts (`<file>.part000`, `.part001`, ...). Reading doesn't use the bridge at
// all: Layla serves the mini-app folder over localhost, so the parts are plain
// `fetch`es from the page's own origin, copied into one buffer.
//
// `<file>.manifest.json` is written only after every part is saved and the
// reassembled file has passed its SHA-256 check, so an interrupted download is
// never mistaken for a complete one; the next attempt overwrites the parts.
//
// Reading works on any thread; saving and deleting need the page (the SDK posts
// through window.ReactNativeWebView).

import type LaylaSDK from '@layla-network/sdk';
import type { ModelFile } from './modelStore';
import type { ModelSpec } from './models';

/** Raw bytes per part: an 11 MB base64 string per saveFile call. */
export const PART_BYTES = 8 * 1024 * 1024;
/** Parts fetched at once when reading back. */
const READ_CONCURRENCY = 4;

interface FileManifest {
  name: string;
  bytes: number;
  sha256: string;
  partBytes: number;
  parts: number;
}

const folder = (spec: ModelSpec) => `models/${spec.dir}`;
const partPath = (spec: ModelSpec, file: ModelFile, i: number) => `${folder(spec)}/${file.name}.part${String(i).padStart(3, '0')}`;
const manifestPath = (spec: ModelSpec, file: ModelFile) => `${folder(spec)}/${file.name}.manifest.json`;
const partCount = (file: ModelFile) => Math.ceil(file.bytes / PART_BYTES);

const expectedManifest = (file: ModelFile): FileManifest => ({
  name: file.name,
  bytes: file.bytes,
  sha256: file.sha256,
  partBytes: PART_BYTES,
  parts: partCount(file),
});

// Loaded on first save/delete, so the worker (which only reads) doesn't bundle the SDK.
let sdk: Promise<LaylaSDK> | null = null;
const layla = () => (sdk ??= import('@layla-network/sdk').then((m) => new m.default()));

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** Base64 without the data URI prefix; FileReader does the encoding natively. */
function toBase64(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes]));
  });
}

async function save(path: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const result = await (await layla()).utils.saveFile(path, await toBase64(bytes), false);
  if (!result.success) throw new Error(`Could not save ${path}: ${result.message ?? 'unknown error'}`);
}

async function fileStored(baseUrl: string, spec: ModelSpec, file: ModelFile): Promise<boolean> {
  try {
    const res = await fetch(new URL(manifestPath(spec, file), baseUrl), { cache: 'no-store' });
    if (!res.ok) return false;
    const m = (await res.json()) as FileManifest;
    const want = expectedManifest(file);
    return (Object.keys(want) as (keyof FileManifest)[]).every((k) => m[k] === want[k]);
  } catch {
    return false;
  }
}

/** True when every file of the model is saved and verified. */
export async function isStoredInAppFolder(baseUrl: string, spec: ModelSpec): Promise<boolean> {
  const results = await Promise.all(spec.files.map((f) => fileStored(baseUrl, spec, f)));
  return results.every(Boolean);
}

/** Reassembles a saved file from its parts. Works in workers too. */
export async function readFromAppFolder(baseUrl: string, spec: ModelSpec, file: ModelFile): Promise<ArrayBuffer> {
  const out = new Uint8Array(file.bytes);
  const parts = partCount(file);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < parts; i = next++) {
      const res = await fetch(new URL(partPath(spec, file, i), baseUrl), { cache: 'no-store' });
      if (!res.ok) throw new Error(`${file.name} part ${i} is missing (HTTP ${res.status}). Download the model again.`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const expected = Math.min(PART_BYTES, file.bytes - i * PART_BYTES);
      if (bytes.length !== expected) throw new Error(`${file.name} part ${i} is damaged. Download the model again.`);
      out.set(bytes, i * PART_BYTES);
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, parts) }, worker));
  return out.buffer;
}

/**
 * Downloads any files of the model that aren't saved yet, saving them part by
 * part. `onProgress` reports downloaded bytes across all files. Main thread only.
 */
export async function downloadToAppFolder(
  baseUrl: string,
  spec: ModelSpec,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  const total = spec.files.reduce((s, f) => s + f.bytes, 0);
  let done = 0;
  let lastReport = 0;
  const report = (loaded: number, force = false) => {
    const t = performance.now();
    if (!force && t - lastReport < 100) return;
    lastReport = t;
    onProgress(loaded, total);
  };

  for (const file of spec.files) {
    if (await fileStored(baseUrl, spec, file)) {
      done += file.bytes;
      report(done, true);
      continue;
    }

    const res = await fetch(new URL(file.name, new URL(spec.baseUrl, location.href)));
    if (!res.ok || !res.body) throw new Error(`Download failed for ${file.name} (HTTP ${res.status}).`);

    // Fill one part at a time and save it before reading on, so only one part is held in memory.
    const reader = res.body.getReader();
    let index = 0;
    let part = new Uint8Array(Math.min(PART_BYTES, file.bytes));
    let fill = 0;
    let received = 0;
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      received += value.byteLength;
      if (received > file.bytes) throw new Error(`${file.name} is larger than expected. Try again.`);
      for (let off = 0; off < value.byteLength; ) {
        const n = Math.min(part.length - fill, value.byteLength - off);
        part.set(value.subarray(off, off + n), fill);
        fill += n;
        off += n;
        if (fill === part.length) {
          await save(partPath(spec, file, index), part);
          index++;
          // Zero-length after the last part; `received <= file.bytes` guarantees no more data then.
          part = new Uint8Array(Math.max(0, Math.min(PART_BYTES, file.bytes - index * PART_BYTES)));
          fill = 0;
        }
      }
      report(done + received);
    }
    if (received !== file.bytes) throw new Error(`${file.name} is ${received} bytes, expected ${file.bytes}. Try again.`);

    // Check what actually landed on disk, not just what was downloaded.
    const hash = toHex(await crypto.subtle.digest('SHA-256', await readFromAppFolder(baseUrl, spec, file)));
    if (hash !== file.sha256) throw new Error(`${file.name} failed its checksum. Try again.`);
    await save(manifestPath(spec, file), new TextEncoder().encode(JSON.stringify(expectedManifest(file))) as Uint8Array<ArrayBuffer>);

    done += file.bytes;
    report(done, true);
  }
}

/** Removes every saved file of the model. Main thread only. */
export async function deleteFromAppFolder(spec: ModelSpec): Promise<void> {
  await (await layla()).utils.deleteFileOrDir(folder(spec));
}
