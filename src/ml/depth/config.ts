// Depth Anything V2 Small, ONNX export from onnx-community (Apache-2.0).
// Checked against scripts/Depth-Anything-V2/depth_test.py: same output to within 2/65535.

import type { ModelFile } from '../modelStore';

const REVISION = '4472b7362082ad9968fee890ca0f1e5aca36b93d';

export const DEPTH = {
  version: 'v2-small-fp32',
  /** Set VITE_DEPTH_BASE_URL to serve the file from somewhere else. */
  baseUrl:
    import.meta.env.VITE_DEPTH_BASE_URL ??
    `https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/${REVISION}/onnx/`,
  model: {
    name: 'model.onnx',
    bytes: 99_060_839,
    sha256: 'afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c',
  } satisfies ModelFile,
  /** Short side fed to the model (keep aspect ratio, both sides rounded to a multiple of 14). */
  inputSize: 518,
  multipleOf: 14,
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
} as const;
