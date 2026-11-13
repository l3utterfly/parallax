// Model files live in the Origin Private File System (OPFS): private to this
// origin, survives reloads, and handles files of hundreds of MB (the Cache API
// failed on a 350 MB entry in testing). Each file is written next to a small
// "<name>.ok" marker that is only created after the SHA-256 check passes, so an
// interrupted download is never mistaken for a complete one.
//
// Downloading uses FileSystemSyncAccessHandle, so it must run in a worker.
// The read/status/delete helpers work on the main thread too.

import type { ModelFile } from './withoutbg/config';

/** FileSystemSyncAccessHandle (worker-only); not in TypeScript's DOM lib yet. */
interface SyncAccessHandle {
  write(buffer: ArrayBufferView, options?: { at?: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}

const syncHandle = (h: FileSystemFileHandle) =>
  (h as FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncAccessHandle> }).createSyncAccessHandle();

async function folder(dir: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
  const root = await navigator.storage.getDirectory();
  try {
    return await root.getDirectoryHandle(dir, { create });
  } catch {
    return null;
  }
}

async function exists(d: FileSystemDirectoryHandle, name: string): Promise<File | null> {
  try {
    return await (await d.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

/** True when every file is stored completely and was verified. */
export async function isStored(dir: string, files: ModelFile[]): Promise<boolean> {
  const d = await folder(dir, false);
  if (!d) return false;
  for (const f of files) {
    const [file, ok] = await Promise.all([exists(d, f.name), exists(d, f.name + '.ok')]);
    if (!file || !ok || file.size !== f.bytes) return false;
  }
  return true;
}

export async function readFile(dir: string, file: ModelFile): Promise<ArrayBuffer> {
  const d = await folder(dir, false);
  const f = d && (await exists(d, file.name));
  if (!f) throw new Error(`${file.name} is not downloaded.`);
  return f.arrayBuffer();
}

export async function deleteStored(dir: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(dir, { recursive: true });
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e;
  }
}

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Downloads any files that aren't stored yet. `onProgress` reports bytes across
 * all files, counting already-stored files as done.
 */
export async function download(
  dir: string,
  baseUrl: string,
  files: ModelFile[],
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  const d = (await folder(dir, true))!;
  const total = files.reduce((s, f) => s + f.bytes, 0);
  let done = 0;

  for (const f of files) {
    if (await isStored(dir, [f])) {
      done += f.bytes;
      onProgress(done, total);
      continue;
    }
    await d.removeEntry(f.name + '.ok').catch(() => {});

    const res = await fetch(new URL(f.name, new URL(baseUrl, location.href)));
    if (!res.ok || !res.body) throw new Error(`Download failed for ${f.name} (HTTP ${res.status}).`);

    const handle = await syncHandle(await d.getFileHandle(f.name, { create: true }));
    let at = 0;
    try {
      handle.truncate(0);
      const reader = res.body.getReader();
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        handle.write(value, { at });
        at += value.byteLength;
        onProgress(done + Math.min(at, f.bytes), total);
      }
      handle.flush();
    } finally {
      handle.close();
    }

    if (at !== f.bytes) throw new Error(`${f.name} is ${at} bytes, expected ${f.bytes}. Try again.`);
    const hash = toHex(await crypto.subtle.digest('SHA-256', await readFile(dir, f)));
    if (hash !== f.sha256) {
      await d.removeEntry(f.name).catch(() => {});
      throw new Error(`${f.name} failed its checksum. Try again.`);
    }
    const ok = await syncHandle(await d.getFileHandle(f.name + '.ok', { create: true }));
    ok.write(new TextEncoder().encode(hash), { at: 0 });
    ok.flush();
    ok.close();
    done += f.bytes;
  }
}
