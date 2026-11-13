import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AssetSlot, type SlotValue } from './components/AssetSlot';
import { Slider } from './components/Slider';
import { Viewer } from './components/Viewer';
import { DEFAULT_SETTINGS, type ViewMode, type ViewerSettings } from './parallax/ParallaxViewer';
import { prepareAssets, type PreparedAssets } from './parallax/prepare';

type SlotKey = 'background' | 'character' | 'depth';
type Slots = Record<SlotKey, SlotValue | null>;

const SAMPLE: Record<SlotKey, string> = {
  background: 'samples/anime/background.jpg',
  character: 'samples/anime/character.png',
  depth: 'samples/anime/depth.png',
};

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'composite', label: 'Composite' },
  { id: 'background', label: 'Background' },
  { id: 'character', label: 'Character' },
  { id: 'depth', label: 'Depth' },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function toSlot(blob: Blob, name: string): SlotValue {
  return { blob, name, url: URL.createObjectURL(blob) };
}

export default function App() {
  const [slots, setSlots] = useState<Slots>({ background: null, character: null, depth: null });
  const [assets, setAssets] = useState<PreparedAssets | null>(null);
  const [status, setStatus] = useState<{ kind: 'idle' | 'loading' | 'ready' | 'error'; message?: string }>({
    kind: 'idle',
  });
  const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);
  const requestId = useRef(0);
  const slotsRef = useRef(slots);
  const assetsRef = useRef<PreparedAssets | null>(null);

  const set = <K extends keyof ViewerSettings>(key: K, value: ViewerSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  // Rebuild the scene whenever all three inputs are present.
  const rebuild = useCallback(async (next: Slots) => {
    const { background, character, depth } = next;
    if (!background || !character || !depth) return;
    const id = ++requestId.current;
    setStatus({ kind: 'loading' });
    try {
      const prepared = await prepareAssets({
        background: background.blob,
        character: character.blob,
        depth: depth.blob,
      });
      if (id !== requestId.current) {
        prepared.dispose();
        return;
      }
      const { bgMean, fgMean } = prepared.stats;
      setSettings((s) => ({
        ...s,
        focus: +lerp(bgMean, fgMean, 0.6).toFixed(2),
        clockDepth: +lerp(bgMean, fgMean, 0.3).toFixed(2),
      }));
      assetsRef.current?.dispose();
      assetsRef.current = prepared;
      setAssets(prepared);
      setStatus({ kind: 'ready' });
    } catch (e) {
      if (id === requestId.current) setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const updateSlots = useCallback(
    (patch: Partial<Slots>) => {
      const prev = slotsRef.current;
      for (const key of Object.keys(patch) as SlotKey[]) {
        const old = prev[key];
        if (old) URL.revokeObjectURL(old.url);
      }
      const next = { ...prev, ...patch };
      slotsRef.current = next;
      setSlots(next);
      void rebuild(next);
    },
    [rebuild],
  );

  const loadSample = useCallback(async () => {
    try {
      const entries = await Promise.all(
        (Object.keys(SAMPLE) as SlotKey[]).map(async (key) => {
          const res = await fetch(import.meta.env.BASE_URL + SAMPLE[key]);
          if (!res.ok) throw new Error(`Failed to load ${SAMPLE[key]}`);
          return [key, toSlot(await res.blob(), SAMPLE[key].split('/').pop()!)] as const;
        }),
      );
      updateSlots(Object.fromEntries(entries));
    } catch (e) {
      setStatus({ kind: 'error', message: String(e) });
    }
  }, [updateSlots]);

  const setSlot = (key: SlotKey, file: File) => updateSlots({ [key]: toSlot(file, file.name) });

  useEffect(() => {
    void loadSample();
  }, [loadSample]);

  const missing = (Object.keys(slots) as SlotKey[]).filter((k) => !slots[k]);

  return (
    <div className="app">
      <aside className="panel">
        <header className="panel__header">
          <h1>Parallax</h1>
          <p>2.5D photo viewer: background and character layers, each with its own depth, with the clock between them.</p>
        </header>

        <section className="section">
          <div className="section__head">
            <h2>Layers</h2>
            <button type="button" className="link" onClick={loadSample}>
              Load sample
            </button>
          </div>
          <AssetSlot
            index={1}
            title="Background"
            hint="The scene with the character removed and the hole filled in."
            accept="image/*"
            value={slots.background}
            onChange={(f) => setSlot('background', f)}
          />
          <AssetSlot
            index={2}
            title="Character"
            hint="PNG cut-out with alpha, same size as the background."
            accept="image/png,image/webp"
            checker
            value={slots.character}
            onChange={(f) => setSlot('character', f)}
          />
          <AssetSlot
            index={3}
            title="Depth map"
            hint="Grayscale PNG of the original photo, white = near. Use *_16bit.png from depth_test.py."
            accept="image/png,image/*"
            value={slots.depth}
            onChange={(f) => setSlot('depth', f)}
          />
        </section>

        <section className="section">
          <h2>Motion</h2>
          <Slider label="Depth" value={settings.depthScale} min={0} max={1} onChange={(v) => set('depthScale', v)} />
          <Slider label="Camera travel" value={settings.motion} min={0} max={0.5} onChange={(v) => set('motion', v)} />
          <Slider label="Focus depth" value={settings.focus} min={0} max={1} onChange={(v) => set('focus', v)} />
          <Slider
            label="Zoom"
            value={settings.zoom}
            min={1}
            max={1.5}
            format={(v) => `${v.toFixed(2)}×`}
            onChange={(v) => set('zoom', v)}
          />
        </section>

        <section className="section">
          <div className="section__head">
            <h2>Clock</h2>
            <label className="toggle">
              <input type="checkbox" checked={settings.clock} onChange={(e) => set('clock', e.target.checked)} />
              <span>Show</span>
            </label>
          </div>
          <Slider
            label="Depth"
            value={settings.clockDepth}
            min={0}
            max={1}
            disabled={!settings.clock}
            onChange={(v) => set('clockDepth', v)}
          />
          <Slider
            label="Position"
            value={settings.clockY}
            min={0}
            max={1}
            disabled={!settings.clock}
            onChange={(v) => set('clockY', v)}
          />
          <Slider
            label="Size"
            value={settings.clockSize}
            min={0.2}
            max={1}
            disabled={!settings.clock}
            onChange={(v) => set('clockSize', v)}
          />
        </section>

        <section className="section">
          <h2>View</h2>
          <div className="segmented">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={settings.view === v.id ? 'is-active' : ''}
                onClick={() => set('view', v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </section>

        {assets && (
          <section className="section info">
            <div>
              Image {assets.width}×{assets.height} · depth {assets.info.depthWidth}×{assets.info.depthHeight} (
              {assets.info.depthBits}-bit)
            </div>
            <div>
              Mean depth: background {assets.stats.bgMean.toFixed(2)}, character {assets.stats.fgMean.toFixed(2)}
            </div>
            {assets.info.warnings.map((w) => (
              <div key={w} className="warning">
                {w}
              </div>
            ))}
          </section>
        )}
      </aside>

      <main className="viewer">
        <div className="viewer__frame" style={assets ? ({ '--aspect': assets.aspect } as React.CSSProperties) : undefined}>
          <Viewer assets={assets} settings={settings} />
          {status.kind !== 'ready' && (
            <div className="viewer__overlay">
              {status.kind === 'loading' && 'Building layers…'}
              {status.kind === 'error' && <span className="warning">{status.message}</span>}
              {status.kind === 'idle' && missing.length > 0 && `Add ${missing.join(', ')} to start.`}
            </div>
          )}
        </div>
        <p className="viewer__hint">Move the mouse anywhere in the window to tilt the view.</p>
      </main>
    </div>
  );
}
