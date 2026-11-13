import type { ViewerSettings } from '../parallax/ParallaxViewer';

export type PresetId = 'subtle' | 'balanced' | 'dramatic';

export const PRESETS: Record<PresetId, { label: string; values: Pick<ViewerSettings, 'depthScale' | 'motion' | 'zoom'> }> = {
  subtle: { label: 'Subtle', values: { depthScale: 0.32, motion: 0.1, zoom: 1.06 } },
  balanced: { label: 'Balanced', values: { depthScale: 0.5, motion: 0.18, zoom: 1.12 } },
  dramatic: { label: 'Dramatic', values: { depthScale: 0.78, motion: 0.3, zoom: 1.22 } },
};

export function matchPreset(s: ViewerSettings): PresetId | null {
  for (const [id, p] of Object.entries(PRESETS) as [PresetId, (typeof PRESETS)[PresetId]][]) {
    const v = p.values;
    if (Math.abs(s.depthScale - v.depthScale) < 0.005 && Math.abs(s.motion - v.motion) < 0.005 && Math.abs(s.zoom - v.zoom) < 0.005)
      return id;
  }
  return null;
}
