// The bundled sample images and the models the import steps download, as shown in the UI.

import { MODELS, type ModelId } from '../ml/models';
import { WITHOUTBG } from '../ml/withoutbg/config';

const base = import.meta.env.BASE_URL;

export interface Sample {
  id: string;
  /** Shown under the thumbnail. */
  label: string;
  /** File name shown once the sample is loaded. */
  name: string;
  original: string;
}

export const SAMPLES: Sample[] = [
  { id: 'layla', label: 'Layla', name: 'layla.png', original: `${base}samples/layla/original.png` },
  { id: 'yor', label: 'Yor', name: 'yor.jpg', original: `${base}samples/yor/original.jpg` },
];

export interface ModelFileInfo {
  name: string;
  sizeMB: number;
}

export interface ModelInfo {
  id: ModelId;
  name: string;
  source: string;
  files: ModelFileInfo[];
}

const files = (id: ModelId) => MODELS[id].files.map((f) => ({ name: f.name, sizeMB: Math.round(f.bytes / 1e6) }));

export const BG_MODEL: ModelInfo = {
  id: 'withoutbg',
  name: 'withoutBG open weights',
  source: `Hugging Face · v${WITHOUTBG.version}`,
  files: files('withoutbg'),
};

export const DEPTH_MODEL: ModelInfo = {
  id: 'depth',
  name: 'Depth Anything V2 Small',
  source: 'Hugging Face · ViT-S',
  files: files('depth'),
};

export const totalMB = (m: ModelInfo) => m.files.reduce((s, f) => s + f.sizeMB, 0);
