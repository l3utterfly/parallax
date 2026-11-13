// Shared access to the Layla host (only meaningful inside the Layla WebView; see ml/storage.ts inLayla()).

import type LaylaSDK from '@layla-network/sdk';

// Loaded on first use, so code paths that never talk to the host (and the ML worker) don't bundle the SDK.
let sdk: Promise<LaylaSDK> | null = null;

export const layla = (): Promise<LaylaSDK> => (sdk ??= import('@layla-network/sdk').then((m) => new m.default()));

/** Base64 without the data URI prefix, as `layla.utils.saveFile` expects. FileReader does the encoding natively. */
export function toBase64(data: Blob | Uint8Array<ArrayBuffer>): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(data instanceof Blob ? data : new Blob([data]));
  });
}
