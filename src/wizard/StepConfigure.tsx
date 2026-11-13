import { useState } from 'react';
import { Slider } from '../components/Slider';
import { requestTiltAccess, type TiltAccess } from '../parallax/motion';
import type { MotionSource, ViewMode, ViewerSettings } from '../parallax/ParallaxViewer';
import type { PreparedAssets } from '../parallax/prepare';
import { Row, Section, Segmented } from './Controls';
import { Icon } from './Icon';
import { LivePreview } from './LivePreview';
import type { Device } from './Stage';
import { StepLayout } from './StepLayout';
import { matchPreset, PRESETS, type PresetId } from './presets';

interface Props {
  assets: PreparedAssets | null;
  settings: ViewerSettings;
  device: Device;
  onDevice: (d: Device) => void;
  onSettings: (patch: Partial<ViewerSettings>) => void;
  onReset: () => void;
  onBack: () => void;
  onNext: () => void;
}

const MOTION_HINT: Record<MotionSource, string> = {
  pointer: 'Move your pointer, or drag on the preview, to look around.',
  tilt: 'Tilt your phone or tablet to look around.',
  drift: 'The scene sways slowly on its own.',
};

const TILT_PROBLEM: Partial<Record<TiltAccess, string>> = {
  unavailable: 'No motion sensor on this device, so the preview stays still here. On a phone or tablet it follows the tilt.',
  denied: "Motion access was blocked. Allow it in the browser's site settings to use tilt.",
};

export function StepConfigure({ assets, settings: s, device, onDevice, onSettings, onReset, onBack, onNext }: Props) {
  const preset = matchPreset(s);
  const [tilt, setTilt] = useState<TiltAccess | 'checking' | null>(null);

  const setMotionSource = (motionSource: MotionSource) => {
    onSettings({ motionSource });
    if (motionSource !== 'tilt') return;
    // iOS only shows its permission prompt from a tap, so ask right here.
    setTilt('checking');
    void requestTiltAccess().then(setTilt);
  };
  const tiltProblem = s.motionSource === 'tilt' && tilt && tilt !== 'checking' ? TILT_PROBLEM[tilt] : undefined;

  return (
    <StepLayout
      stage={<LivePreview device={device} assets={assets} settings={s} />}
      stageTop={
        <>
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
        </>
      }
      eyebrow="Step 3 of 3"
      title="Tune the motion"
      description={`Adjust how the scene moves. The preview updates live. ${MOTION_HINT[s.motionSource]}`}
      footer={
        <>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onBack} aria-label="Back">
            <Icon name="arrowLeft" />
          </button>
          <button type="button" className="btn btn--primary btn--wide" onClick={onNext}>
            <Icon name="sparkle" />
            Create scene
          </button>
        </>
      }
    >
      <div className="presets" role="radiogroup" aria-label="Preset">
        {(Object.keys(PRESETS) as PresetId[]).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={preset === id}
            className={`preset preset--${id}${preset === id ? ' is-active' : ''}`}
            onClick={() => onSettings(PRESETS[id].values)}
          >
            <span className="preset__art" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            {PRESETS[id].label}
          </button>
        ))}
      </div>

      <Section
        title="Motion"
        icon="move"
        aside={
          <button type="button" className="text-btn" onClick={onReset}>
            <Icon name="refresh" size={13} />
            Reset
          </button>
        }
      >
        <Row label="Driven by">
          <Segmented
            size="sm"
            label="Motion source"
            value={s.motionSource}
            onChange={setMotionSource}
            options={[
              { id: 'pointer', label: 'Pointer' },
              { id: 'tilt', label: 'Tilt' },
              { id: 'drift', label: 'Drift' },
            ]}
          />
        </Row>
        {tiltProblem && (
          <p className="note note--compact">
            <Icon name="info" size={14} />
            {tiltProblem}
          </p>
        )}
        <Slider label="Depth strength" value={s.depthScale} min={0} max={1} onChange={(v) => onSettings({ depthScale: v })} />
        <Slider label="Camera travel" value={s.motion} min={0} max={0.5} onChange={(v) => onSettings({ motion: v })} />
        <Slider label="Focus depth" value={s.focus} min={0} max={1} onChange={(v) => onSettings({ focus: v })} />
        <Slider
          label="Zoom"
          value={s.zoom}
          min={1}
          max={1.5}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v) => onSettings({ zoom: v })}
        />
      </Section>

      <Section title="Inspect" icon="layers">
        <Segmented<ViewMode>
          size="sm"
          label="Layer view"
          value={s.view}
          onChange={(v) => onSettings({ view: v })}
          options={[
            { id: 'composite', label: 'Scene' },
            { id: 'background', label: 'Back' },
            { id: 'character', label: 'Front' },
            { id: 'depth', label: 'Depth' },
          ]}
        />
      </Section>
    </StepLayout>
  );
}
