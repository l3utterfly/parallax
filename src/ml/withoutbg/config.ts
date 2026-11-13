// withoutBG open-weights bundle (sidecar schema 3, "routed"), matting branch only.
// Values come from scripts/withoutBG/withoutbg-open-weights.onnx.json.

export interface ModelFile {
  name: string;
  bytes: number;
  sha256: string;
}

const REVISION = '232aa520ccb6f94316cd638a7d916832479ec9a8';

export const WITHOUTBG = {
  version: '10.12.4',
  /** Where the files are fetched from. Set VITE_WITHOUTBG_BASE_URL (e.g. /scripts/withoutBG/) to use local copies. */
  baseUrl:
    import.meta.env.VITE_WITHOUTBG_BASE_URL ??
    `https://huggingface.co/withoutbg/withoutbg-openweights-onnx/resolve/${REVISION}/`,
  /** Router: ConvNeXt/DINOv3 backbone. Only its features f0..f3 are used; they feed the matting graph. */
  router: {
    name: 'withoutbg-open-weights-backbone.onnx',
    bytes: 350_403_090,
    sha256: 'a64ba43cc25557f568ad6f35ed1139049dd43f5568385fa4f9848e0b4c7123ff',
  },
  /** Matting: Depth Anything V2-S + router features -> 448x448 alpha. */
  matting: {
    name: 'withoutbg-open-weights.onnx',
    bytes: 104_110_432,
    sha256: 'cd40bdd56770b78e9a3593aa6dbbd28cf20ed4f6861c3a1644504d585ea3e4fd',
  },
  /** rgb_matting: 448², bilinear, no antialias. rgb_depth: 518², bicubic with antialias. */
  mattingSize: 448,
  depthSize: 518,
  /** Images larger than this are scaled down before inference (the matte is scaled back up). */
  maxInferenceSize: 4096,
} as const;

export const WITHOUTBG_FILES: ModelFile[] = [WITHOUTBG.router, WITHOUTBG.matting];
export const WITHOUTBG_TOTAL_BYTES = WITHOUTBG_FILES.reduce((s, f) => s + f.bytes, 0);
