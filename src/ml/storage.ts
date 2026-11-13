// Where downloaded models live.
//
// - Inside Layla: in the mini-app's own folder. Layla serves that folder from a
//   localhost server whose port changes on every launch, so origin-scoped
//   browser storage (OPFS) would start empty each time. The folder persists, and
//   `layla.utils.saveFile` writes into it (see appFolderStore.ts).
// - In a normal browser (development): OPFS (see modelStore.ts).

export type StorageLocation =
  | { kind: 'opfs' }
  /** `baseUrl` is the mini-app folder as served to the page (where index.html lives). */
  | { kind: 'app-folder'; baseUrl: string };

/** True inside the Layla WebView (or with the SDK's mock bridge installed). */
export function inLayla(): boolean {
  return typeof window !== 'undefined' && !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;
}

/** Picks the storage for this page. Main thread only; the worker receives it with each request. */
export function storageLocation(): StorageLocation {
  return inLayla() ? { kind: 'app-folder', baseUrl: new URL('./', document.baseURI).href } : { kind: 'opfs' };
}
