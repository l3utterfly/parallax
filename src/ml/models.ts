// Every model the app downloads, with where it is fetched from and where it is stored in OPFS.

import { DEPTH } from './depth/config';
import type { ModelFile } from './modelStore';
import { WITHOUTBG } from './withoutbg/config';

export type ModelId = 'withoutbg' | 'depth';

export interface ModelSpec {
  /** OPFS folder; includes the version so an update never mixes files. */
  dir: string;
  baseUrl: string;
  files: ModelFile[];
}

export const MODELS: Record<ModelId, ModelSpec> = {
  withoutbg: {
    dir: `withoutbg-${WITHOUTBG.version}`,
    baseUrl: WITHOUTBG.baseUrl,
    files: [WITHOUTBG.router, WITHOUTBG.matting],
  },
  depth: {
    dir: `depth-anything-${DEPTH.version}`,
    baseUrl: DEPTH.baseUrl,
    files: [DEPTH.model],
  },
};

export const modelBytes = (id: ModelId) => MODELS[id].files.reduce((s, f) => s + f.bytes, 0);
