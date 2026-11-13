// Startup check that the model download hosts are reachable.
//
// Layla gives each mini-app a content security policy that only allows the
// sites listed in its Mini-app permissions. A blocked host makes `fetch` reject
// straight away, so asking for one byte of each model is enough to tell. The
// request follows Hugging Face's redirect to its CDN, so that host is checked too.

import { MODELS } from './models';

/** What the user adds in Layla's Mini-app permissions. Hugging Face redirects downloads to a regional `*.hf.co` CDN. */
export const DOWNLOAD_HOSTS = ['huggingface.co', '*.huggingface.co', '*.hf.co'] as const;

/** Slow networks aren't a permissions problem; give up on a probe after this long and count it as reachable. */
const TIMEOUT_MS = 20_000;

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Any HTTP status means the connection was allowed. Drop the body in case the server ignored the range.
    void res.body?.cancel().catch(() => {});
    return true;
  } catch (e) {
    return e instanceof DOMException && e.name === 'TimeoutError';
  }
}

/** False when a model download host is blocked. Offline counts as reachable: there's nothing to fix in settings. */
export async function canReachDownloadHosts(): Promise<boolean> {
  if (navigator.onLine === false) return true;
  const urls = Object.values(MODELS)
    .map((spec) => new URL(spec.files[0].name, new URL(spec.baseUrl, location.href)))
    // Local copies (VITE_*_BASE_URL) need no permission.
    .filter((url) => url.origin !== location.origin)
    .map((url) => url.href);
  const results = await Promise.all(urls.map(reachable));
  return results.every(Boolean);
}
