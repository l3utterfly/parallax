import { useEffect, useState } from 'react';
import type { ViewerSettings } from '../parallax/ParallaxViewer';
import type { PreparedAssets } from '../parallax/prepare';
import { Segmented } from './Controls';
import { Icon } from './Icon';
import { LivePreview } from './LivePreview';
import type { Device } from './Stage';
import { StepLayout } from './StepLayout';
import { matchPreset, PRESETS } from './presets';
import type { Cutout, DepthMap, SourceImage } from './types';

interface Props {
  source: SourceImage;
  cutout: Cutout;
  depth: DepthMap;
  assets: PreparedAssets | null;
  settings: ViewerSettings;
  device: Device;
  onDevice: (d: Device) => void;
  onEdit: () => void;
  onRestart: () => void;
}

const MOTION_LABEL = { pointer: 'Pointer', tilt: 'Device tilt', drift: 'Auto drift' } as const;

/** "anime_long_hair.jpg" -> "Anime long hair" */
function defaultTitle(fileName: string): string {
  const words = fileName.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Parallax scene';
}

export function StepResult({ source, cutout, depth, assets, settings, device, onDevice, onEdit, onRestart }: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const [title, setTitle] = useState(() => defaultTitle(source.name));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Loaded on demand: the exporter carries the whole standalone player.
      const [{ exportScene }, { saveExport }] = await Promise.all([
        import('../export/sceneExport'),
        import('../export/saveExport'),
      ]);
      const { blob, filename } = await exportScene({
        title,
        original: source.blob,
        originalName: source.name,
        cutout: cutout.blob,
        depth: depth.blob,
        settings,
      });
      const how = await saveExport(blob, filename);
      setToast(how === 'shared' ? `Saved ${filename}` : `Downloaded ${filename}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

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
      description="Move your pointer or drag on the preview to look around. Save it as a Layla mini-app, or go back and fine-tune."
      footer={
        <button type="button" className="btn btn--primary btn--wide" onClick={save} disabled={saving}>
          {saving ? (
            <>
              <span className="spinner spinner--sm spinner--dark" />
              Packaging…
            </>
          ) : (
            <>
              <Icon name="save" />
              Save scene
            </>
          )}
        </button>
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

      <label className="field">
        <span className="field__label">Scene name</span>
        <input
          className="field__input"
          value={title}
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Parallax scene"
        />
        <span className="field__hint">Saved as a Layla mini-app (.zip) with the photo, cutout and depth map.</span>
      </label>

      {error && (
        <p className="note note--error" role="alert">
          <Icon name="info" size={15} />
          {error}
        </p>
      )}

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
