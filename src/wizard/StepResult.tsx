import { useEffect, useState } from 'react';
import type { ViewerSettings } from '../parallax/ParallaxViewer';
import type { PreparedAssets } from '../parallax/prepare';
import { Segmented } from './Controls';
import { Icon } from './Icon';
import { LivePreview } from './LivePreview';
import type { Device } from './Stage';
import { StepLayout } from './StepLayout';
import { matchPreset, PRESETS } from './presets';
import type { SourceImage } from './types';

interface Props {
  source: SourceImage;
  assets: PreparedAssets | null;
  settings: ViewerSettings;
  device: Device;
  onDevice: (d: Device) => void;
  onEdit: () => void;
  onRestart: () => void;
}

const MOTION_LABEL = { pointer: 'Pointer', tilt: 'Device tilt', drift: 'Auto drift' } as const;

export function StepResult({ source, assets, settings, device, onDevice, onEdit, onRestart }: Props) {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const preset = matchPreset(settings);
  // The result shows the composite scene regardless of what was being inspected.
  const view = { ...settings, view: 'composite' as const };

  return (
    <StepLayout
      stage={
        <>
          <LivePreview device={device} assets={assets} settings={view} />
          {toast && (
            <div className="toast" role="status">
              <Icon name="check" size={15} />
              {toast}
            </div>
          )}
        </>
      }
      stageTop={
        <Segmented
          size="sm"
          label="Device"
          value={device}
          onChange={onDevice}
          options={[
            { id: 'phone', label: 'Phone', icon: 'phone' },
            { id: 'tablet', label: 'Tablet', icon: 'tablet' },
            { id: 'desktop', label: 'Desktop', icon: 'monitor' },
          ]}
        />
      }
      eyebrow="Done"
      title="Your scene is ready"
      description="Move your pointer or drag on the preview to look around. Save it to your library, or go back and fine-tune."
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => setToast('Layers exported (demo)')}>
            <Icon name="share" />
            Export
          </button>
          <button type="button" className="btn btn--primary btn--wide" onClick={() => setToast('Saved to your library (demo)')}>
            <Icon name="save" />
            Save scene
          </button>
        </>
      }
    >
      <div className="success">
        <span className="success__badge">
          <Icon name="check" size={20} />
        </span>
        <div>
          <strong>2 layers built</strong>
          <span>Backdrop and character, each with its own depth.</span>
        </div>
      </div>

      <dl className="summary">
        <div>
          <dt>Source</dt>
          <dd>{source.name}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>
            {source.width} × {source.height}
          </dd>
        </div>
        <div>
          <dt>Depth</dt>
          <dd>16-bit · Depth Anything V2</dd>
        </div>
        <div>
          <dt>Motion</dt>
          <dd>
            {preset ? PRESETS[preset].label : 'Custom'} · {MOTION_LABEL[settings.motionSource]}
          </dd>
        </div>
      </dl>

      <div className="linkrow">
        <button type="button" className="text-btn" onClick={onEdit}>
          <Icon name="sliders" size={14} />
          Adjust settings
        </button>
        <button type="button" className="text-btn" onClick={onRestart}>
          <Icon name="refresh" size={14} />
          Import another image
        </button>
      </div>
    </StepLayout>
  );
}
