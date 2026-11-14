// Shared access to the Layla host (only meaningful inside the Layla WebView; see ml/storage.ts inLayla()).

import type LaylaSDK from '@layla-network/sdk';

// Loaded on first use, so code paths that never talk to the host (and the ML worker) don't bundle the SDK.
let sdk: Promise<LaylaSDK> | null = null;

export const layla = (): Promise<LaylaSDK> => (sdk ??= import('@layla-network/sdk').then((m) => new m.default()));
