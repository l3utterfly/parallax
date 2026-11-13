import { Slider } from '../components/Slider';
import type { ViewMode, ViewerSettings } from '../parallax/ParallaxViewer';
import type { PreparedAssets } from '../parallax/prepare';
import { Row, Section, Segmented, Switch } from './Controls';
import { Icon } from './Icon';
import { LivePreview } from './LivePreview';
import type { Device } from './Stage';
import { StepLayout } from './StepLayout';
import type { ExtraSettings } from './types';
import { matchPreset, PRESETS, type PresetId } from './presets';

interface Props {
  assets: PreparedAssets | null;
  settings: ViewerSettings;
  extras: ExtraSettings;
  device: Device;
  onDevice: (d: Device) => void;
  onSettings: (patch: Partial<ViewerSettings>) => void;
  onExtras: (patch: Partial<ExtraSettings>) => void;
  onReset: () => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepConfigure({ assets, settings: s, extras: x, device, onDevice, onSettings, onExtras, onReset, onBack, onNext }: Props) {
  const preset = matchPreset(s);

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
      description="Adjust how the scene moves and where the clock sits. The preview updates live: move your pointer or drag on it to look around."
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
            value={x.motionSource}
            onChange={(v) => onExtras({ motionSource: v })}
            options={[
              { id: 'pointer', label: 'Pointer' },
              { id: 'tilt', label: 'Tilt' },
              { id: 'drift', label: 'Drift' },
            ]}
          />
        </Row>
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

      <Section title="Clock" icon="clock" aside={<Switch label="Show clock" checked={s.clock} onChange={(v) => onSettings({ clock: v })} />}>
        <div className={`group__fields${s.clock ? '' : ' is-disabled'}`}>
          <Row label="Format">
            <Segmented
              size="sm"
              label="Clock format"
              value={x.clockFormat}
              onChange={(v) => onExtras({ clockFormat: v })}
              options={[
                { id: '12h', label: '12h' },
                { id: '24h', label: '24h' },
              ]}
            />
          </Row>
          <Row label="Show date">
            <Switch label="Show date" checked={x.showDate} onChange={(v) => onExtras({ showDate: v })} />
          </Row>
          <Slider
            label="Depth"
            value={s.clockDepth}
            min={0}
            max={1}
            disabled={!s.clock}
            format={(v) => (v < 0.34 ? 'Far' : v < 0.67 ? 'Middle' : 'Near') + ` · ${v.toFixed(2)}`}
            onChange={(v) => onSettings({ clockDepth: v })}
          />
          <Slider
            label="Height"
            value={s.clockY}
            min={0}
            max={1}
            disabled={!s.clock}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onSettings({ clockY: v })}
          />
          <Slider
            label="Size"
            value={s.clockSize}
            min={0.2}
            max={1}
            disabled={!s.clock}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onSettings({ clockSize: v })}
          />
        </div>
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
