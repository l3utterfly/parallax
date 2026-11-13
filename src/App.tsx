import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, type ViewerSettings } from './parallax/ParallaxViewer';
import { prepareAssets, type PreparedAssets } from './parallax/prepare';
import { SAMPLE } from './wizard/dummy';
import type { Device } from './wizard/Stage';
import { StepConfigure } from './wizard/StepConfigure';
import { StepDepth } from './wizard/StepDepth';
import { Stepper } from './wizard/Stepper';
import { stepIndex, type StepId } from './wizard/steps';
import { StepImage } from './wizard/StepImage';
import { StepResult } from './wizard/StepResult';
import { DEFAULT_EXTRAS, type ExtraSettings, type SourceImage } from './wizard/types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function readSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = url;
  });
}

/**
 * Builds the viewer layers. For now this always uses the bundled sample (original
 * photo as the backdrop, the sample cutout and depth map), whatever image was picked.
 */
async function loadSampleAssets(): Promise<PreparedAssets> {
  const [background, character, depth] = await Promise.all(
    [SAMPLE.original, SAMPLE.cutout, SAMPLE.depth].map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load ${url}`);
      return res.blob();
    }),
  );
  return prepareAssets({ background, character, depth });
}

export default function App() {
  const [step, setStep] = useState<StepId>('image');
  const [reachable, setReachable] = useState(0);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<SourceImage | null>(null);
  const [cutout, setCutout] = useState<string | null>(null);
  const [depth, setDepth] = useState<string | null>(null);
  const [cached, setCached] = useState({ bg: false, depth: false });
  const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);
  const [extras, setExtras] = useState<ExtraSettings>(DEFAULT_EXTRAS);
  const [device, setDevice] = useState<Device>('phone');
  const [assets, setAssets] = useState<PreparedAssets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tuned = useRef<ViewerSettings>(DEFAULT_SETTINGS);

  const go = useCallback((id: StepId) => {
    setStep(id);
    setReachable((r) => Math.max(r, stepIndex(id)));
    window.scrollTo({ top: 0 });
  }, []);

  const choose = useCallback(
    async (file: File | 'sample') => {
      setError(null);
      try {
        const url = file === 'sample' ? SAMPLE.original : URL.createObjectURL(file);
        const { width, height } = file === 'sample' ? SAMPLE : await readSize(url);
        setSource((old) => {
          if (old && !old.sample) URL.revokeObjectURL(old.url);
          return file === 'sample'
            ? { url, name: SAMPLE.name, width, height, bytes: SAMPLE.bytes, sample: true }
            : { url, name: file.name, width, height, bytes: file.size, sample: false };
        });
        setCutout(null);
        setDepth(null);
        setReachable(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  const restart = () => {
    setSource((old) => {
      if (old && !old.sample) URL.revokeObjectURL(old.url);
      return null;
    });
    setCutout(null);
    setDepth(null);
    setReachable(0);
    setStep('image');
  };

  // Build the live preview layers once depth is available.
  useEffect(() => {
    if (!depth || assets) return;
    let cancelled = false;
    loadSampleAssets()
      .then((a) => {
        if (cancelled) return a.dispose();
        const { bgMean, fgMean } = a.stats;
        const tunedSettings = {
          ...DEFAULT_SETTINGS,
          focus: +lerp(bgMean, fgMean, 0.6).toFixed(2),
          clockDepth: +lerp(bgMean, fgMean, 0.3).toFixed(2),
        };
        tuned.current = tunedSettings;
        setSettings(tunedSettings);
        setAssets(a);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [depth, assets]);

  useEffect(() => () => assets?.dispose(), [assets]);

  const patchSettings = useCallback((p: Partial<ViewerSettings>) => setSettings((s) => ({ ...s, ...p })), []);
  const patchExtras = useCallback((p: Partial<ExtraSettings>) => setExtras((s) => ({ ...s, ...p })), []);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="brand__name">Parallax</span>
          <span className="brand__tag">New scene</span>
        </div>
        <Stepper current={step} reachable={reachable} disabled={busy} onSelect={go} />
        <div className="topbar__end">
          <span className="chip" title="Processing is simulated and returns sample images">
            <span className="chip__dot" />
            Demo data
          </span>
        </div>
      </header>

      {error && (
        <div className="banner" role="alert">
          {error}
          <button type="button" className="text-btn" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <main className="main" key={step}>
        {step === 'image' && (
          <StepImage
            source={source}
            cutout={cutout}
            modelCached={cached.bg}
            onChoose={choose}
            onCutout={(url) => {
              setCutout(url);
              setReachable((r) => Math.max(r, 1));
            }}
            onModelCached={() => setCached((c) => ({ ...c, bg: true }))}
            onBusy={setBusy}
            onNext={() => go('depth')}
          />
        )}
        {step === 'depth' && source && (
          <StepDepth
            source={source}
            depth={depth}
            modelCached={cached.depth}
            onDepth={(url) => {
              setDepth(url);
              setReachable((r) => Math.max(r, 2));
            }}
            onModelCached={() => setCached((c) => ({ ...c, depth: true }))}
            onBusy={setBusy}
            onBack={() => go('image')}
            onNext={() => go('configure')}
          />
        )}
        {step === 'configure' && (
          <StepConfigure
            assets={assets}
            settings={settings}
            extras={extras}
            device={device}
            onDevice={setDevice}
            onSettings={patchSettings}
            onExtras={patchExtras}
            onReset={() => setSettings(tuned.current)}
            onBack={() => go('depth')}
            onNext={() => go('result')}
          />
        )}
        {step === 'result' && source && (
          <StepResult
            source={source}
            assets={assets}
            settings={settings}
            extras={extras}
            device={device}
            onDevice={setDevice}
            onEdit={() => go('configure')}
            onRestart={restart}
          />
        )}
      </main>
    </div>
  );
}
