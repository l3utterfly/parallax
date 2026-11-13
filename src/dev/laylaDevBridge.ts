// Development only: pretend to run inside Layla. Open the dev server with
// `?layla-mock` to use it.
//
// Installs the SDK's mock bridge (so the app takes its in-Layla code paths) and
// backs saveFile / deleteFileOrDir with the dev server's fake mini-app folder,
// which is served at the page root the way Layla serves the real one.

import { installLaylaMock } from '@layla-network/sdk';

const fileUrl = (path: string) => `/__layla-dev/file?path=${encodeURIComponent(path)}`;

export function installLaylaDevBridge(): void {
  installLaylaMock({
    saveFile: async ({ filename, contentBase64 }) => {
      const res = await fetch(fileUrl(filename), { method: 'PUT', body: contentBase64 });
      return { filename, success: res.ok, message: res.ok ? undefined : await res.text() };
    },
    deleteFileOrDir: async ({ path }) => {
      const res = await fetch(fileUrl(path), { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
    },
  });
  console.info('[dev] Layla mock bridge installed; models are saved to .layla-dev/app-folder/');
}
