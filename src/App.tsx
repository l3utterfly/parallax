import { useCallback, useEffect, useRef, useState } from 'react';
import { probeTilt } from './parallax/motion';
import { DEFAULT_SETTINGS, type ViewerSettings } from './parallax/ParallaxViewer';
import { prepareAssets, type PreparedAssets } from './parallax/prepare';
import { isModelStored } from './ml/client';
import { canReachDownloadHosts } from './ml/hostCheck';
import { inLayla } from './ml/storage';
import { PermissionsDialog } from './wizard/PermissionsDialog';
import type { Sample } from './wizard/catalog';
import type { Device } from './wizard/Stage';
import { StepConfigure } from './wizard/StepConfigure';
import { StepDepth } from './wizard/StepDepth';
import { Stepper } from './wizard/Stepper';
import { stepIndex, type StepId } from './wizard/steps';
import { StepImage } from './wizard/StepImage';
import { StepResult } from './wizard/StepResult';
import type { Cutout, DepthMap, SourceImage } from './wizard/types';

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
  const [device, setDevice] = useState<Device>('phone');
  const [assets, setAssets] = useState<PreparedAssets | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Are the models already in this browser's storage?
  useEffect(() => {
    isModelStored('withoutbg')
      .then(setBgStored)
      .catch(() => setBgStored(false));
    isModelStored('depth')
      .then(setDepthStored)
      .catch(() => setDepthStored(false));
  }, []);

  // Inside Layla, check once that its Mini-app permissions let the model downloads through.
  const [hostsBlocked, setHostsBlocked] = useState(false);
  useEffect(() => {
    if (!inLayla()) return;
    canReachDownloadHosts().then((ok) => setHostsBlocked(!ok));
  }, []);
  // Only worth interrupting for when a model still has to be downloaded.
  const showPermissions = hostsBlocked && (bgStored === false || depthStored === false);

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
    async (file: File | Sample) => {
      setError(null);
      try {
        const isFile = file instanceof File;
        const blob = isFile ? file : await fetchBlob(file.original);
        const url = isFile ? URL.createObjectURL(file) : file.original;
        const { width, height } = await readSize(url);
        setSource((old) => {
          if (old && !old.sample) URL.revokeObjectURL(old.url);
          return isFile
            ? { blob, url, name: file.name, width, height, bytes: file.size, sample: false }
            : { blob, url, name: file.name, width, height, bytes: blob.size, sample: true };
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
        setAssets(a);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [depth, cutout, source]);

  useEffect(() => () => assets?.dispose(), [assets]);

  // Default to tilt on devices with a motion sensor, unless the user already picked a source.
  const motionPicked = useRef(false);
  useEffect(() => {
    void probeTilt().then((ok) => {
      if (ok && !motionPicked.current) setSettings((s) => ({ ...s, motionSource: 'tilt' }));
    });
  }, []);

  const patchSettings = useCallback((p: Partial<ViewerSettings>) => {
    if (p.motionSource) motionPicked.current = true;
    setSettings((s) => ({ ...s, ...p }));
  }, []);

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

      {showPermissions && <PermissionsDialog onClose={() => setHostsBlocked(false)} />}

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
            device={device}
            onDevice={setDevice}
            onSettings={patchSettings}
            onReset={() =>
              patchSettings({
                depthScale: DEFAULT_SETTINGS.depthScale,
                motion: DEFAULT_SETTINGS.motion,
                zoom: DEFAULT_SETTINGS.zoom,
                focus: DEFAULT_SETTINGS.focus,
              })
            }
            onBack={() => go('depth')}
            onNext={() => go('result')}
          />
        )}
        {step === 'result' && source && cutout && depth && (
          <StepResult
            source={source}
            cutout={cutout}
            depth={depth}
            assets={assets}
            settings={settings}
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
