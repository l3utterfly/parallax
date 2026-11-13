// The ML worker: downloads models into OPFS and runs every pipeline, sharing
// one onnxruntime-web instance (and one GPU device) between them.

import { estimateDepth } from './depth/pipeline';
import { download } from './modelStore';
import { MODELS } from './models';
import type { Request, Response } from './protocol';
import { removeBackground } from './withoutbg/pipeline';

const post = (msg: Response) => self.postMessage(msg);

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data;
  const { id } = msg;
  const phase = (phase: Extract<Response, { type: 'phase' }>['phase'], backend?: Extract<Response, { type: 'phase' }>['backend']) =>
    post({ id, type: 'phase', phase, backend });
  try {
    switch (msg.type) {
      case 'download': {
        const spec = MODELS[msg.model];
        let last = 0;
        await download(spec.dir, new URL(spec.baseUrl, location.href).href, spec.files, (loaded, total) => {
          // Network chunks arrive far faster than the UI needs; ~10 updates a second is plenty.
          const t = performance.now();
          if (t - last < 100 && loaded < total) return;
          last = t;
          post({ id, type: 'progress', loaded, total });
        });
        post({ id, type: 'done' });
        break;
      }
      case 'removeBackground':
        post({ id, type: 'done', result: await removeBackground(msg.image, phase) });
        break;
      case 'estimateDepth':
        post({ id, type: 'done', result: await estimateDepth(msg.image, msg.cutout, phase) });
        break;
    }
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
