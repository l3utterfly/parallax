// Placeholder data for the import UI. Nothing here runs a model yet: the
// "processing" steps are timed simulations that hand back the sample files.

const base = import.meta.env.BASE_URL;

export const SAMPLE = {
  name: 'anime_long_hair.jpg',
  original: `${base}samples/anime/original.jpg`,
  cutout: `${base}samples/anime/character.png`,
  depth: `${base}samples/anime/depth.png`,
  width: 1006,
  height: 1012,
  bytes: 129_532,
};

export interface ModelFile {
  name: string;
  sizeMB: number;
}

export interface ModelInfo {
  name: string;
  source: string;
  files: ModelFile[];
}

export const BG_MODEL: ModelInfo = {
  name: 'withoutBG open weights',
  source: 'Hugging Face · v10.12.4',
  files: [
    { name: 'withoutbg-open-weights-backbone.onnx', sizeMB: 350 },
    { name: 'withoutbg-open-weights.onnx', sizeMB: 104 },
  ],
};

export const DEPTH_MODEL: ModelInfo = {
  name: 'Depth Anything V2 Small',
  source: 'Hugging Face · ViT-S',
  files: [{ name: 'depth_anything_v2_vits.onnx', sizeMB: 99 }],
};

export const totalMB = (m: ModelInfo) => m.files.reduce((s, f) => s + f.sizeMB, 0);

/** Status lines shown while a simulated job runs, picked by progress. */
export const CUTOUT_PHASES = ['Finding the subject', 'Refining hair and edges', 'Building the alpha matte'];
export const DEPTH_PHASES = ['Running at 518 px', 'Upsampling to full size', 'Encoding 16-bit depth'];

/** Dummy depth statistics for the sample (0 = far, 1 = near). */
export const DEPTH_STATS = { min: 0.04, max: 0.97, character: 0.74, background: 0.28 };

export function phaseFor(phases: string[], progress: number): string {
  return phases[Math.min(phases.length - 1, Math.floor(progress * phases.length))] + '…';
}
