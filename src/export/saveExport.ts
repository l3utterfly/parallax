// Hands an exported file to the user: inside Layla through the host (saved to the
// mini-app's files and offered in the share sheet), elsewhere as a browser download.

import { layla } from '../layla';
import { inLayla } from '../ml/storage';

export async function saveExport(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  if (inLayla()) {
    // Pass the Blob itself: the SDK sends it to the host in parts, encoding one
    // part at a time, instead of one base64 string of the whole zip.
    const result = await (await layla()).utils.saveFile(`exports/${filename}`, blob, true);
    if (!result.success) throw new Error(result.message ?? `Could not save ${filename}.`);
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
