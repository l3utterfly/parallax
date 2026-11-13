import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, type ViewerSettings } from './parallax/ParallaxViewer';
import { prepareAssets, type PreparedAssets } from './parallax/prepare';
import { isModelStored } from './ml/client';
import { SAMPLE } from './wizard/catalog';
import type { Device } from './wizard/Stage';
import { StepConfigure } from './wizard/StepConfigure';
import { StepDepth } from './wizard/StepDepth';
import { Stepper } from './wizard/Stepper';
import { stepIndex, type StepId } from './wizard/steps';
import { StepImage } from './wizard/StepImage';
import { StepResult } from './wizard/StepResult';
import { DEFAULT_EXTRAS, type Cutout, type DepthMap, type ExtraSettings, type SourceImage } from './wizard/types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function readSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = url;
  });
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.blob();
}


export default function App() {
  const [step, setStep] = useState<StepId>('image');
  const [reachable, setReachable] = useState(0);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<SourceImage | null>(null);
  const [cutout, setCutoutState] = useState<Cutout | null>(null);
  const [depth, setDepthState] = useState<DepthMap | null>(null);
  const [bgStored, setBgStored] = useState<boolean | null>(null);
  const [depthStored, setDepthStored] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);
  const [extras, setExtras] = useState<ExtraSettings>(DEFAULT_EXTRAS);
  const [device, setDevice] = useState<Device>('phone');
  const [assets, setAssets] = useState<PreparedAssets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tuned = useRef<ViewerSettings>(DEFAULT_SETTINGS);

  // Are the models already in this browser's storage?
  useEffect(() => {
    isModelStored('withoutbg')
      .then(setBgStored)
      .catch(() => setBgStored(false));
    isModelStored('depth')
      .then(setDepthStored)
      .catch(() => setDepthStored(false));
  }, []);

  // Results own object URLs; release the old one when a result is replaced.
  const setCutout = useCallback((next: Cutout | null) => {
    setCutoutState((old) => {
      if (old && old !== next) URL.revokeObjectURL(old.url);
      return next;
    });
  }, []);
  const setDepth = useCallback((next: DepthMap | null) => {
    setDepthState((old) => {
      if (old && old !== next) URL.revokeObjectURL(old.url);
      return next;
    });
  }, []);

  const go = useCallback((id: StepId) => {
    setStep(id);
    setReachable((r) => Math.max(r, stepIndex(id)));
    window.scrollTo({ top: 0 });
  }, []);

  const choose = useCallback(
    async (file: File | 'sample') => {
      setError(null);
      try {
        const blob = file === 'sample' ? await fetchBlob(SAMPLE.original) : file;
        const url = file === 'sample' ? SAMPLE.original : URL.createObjectURL(file);
        const { width, height } = await readSize(url);
        setSource((old) => {
          if (old && !old.sample) URL.revokeObjectURL(old.url);
          return file === 'sample'
            ? { blob, url, name: SAMPLE.name, width, height, bytes: blob.size, sample: true }
            : { blob, url, name: file.name, width, height, bytes: file.size, sample: false };
        });
        setCutout(null);
        setDepth(null);
        setAssets(null);
        setReachable(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [setCutout, setDepth],
  );

  const restart = () => {
    setSource((old) => {
      if (old && !old.sample) URL.revokeObjectURL(old.url);
      return null;
    });
    setCutout(null);
    setDepth(null);
    setAssets(null);
    setReachable(0);
    setStep('image');
  };

  // Build the live preview layers: original photo as the backdrop, the cutout in front, both with the real depth.
  useEffect(() => {
    if (!depth || !cutout || !source) return;
    let cancelled = false;
    prepareAssets({ background: source.blob, character: cutout.blob, depth: depth.blob })
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
  }, [depth, cutout, source]);

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
        <div className="topbar__end" />
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
            modelStored={bgStored}
            onChoose={choose}
            onCutout={(c) => {
              setCutout(c);
              setReachable((r) => Math.max(r, 1));
            }}
            onModelStored={setBgStored}
            onBusy={setBusy}
            onNext={() => go('depth')}
          />
        )}
        {step === 'depth' && source && (
          <StepDepth
            source={source}
            cutout={cutout}
            depth={depth}
            modelStored={depthStored}
            onDepth={(d) => {
              setDepth(d);
              setReachable((r) => Math.max(r, 2));
            }}
            onModelStored={setDepthStored}
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
