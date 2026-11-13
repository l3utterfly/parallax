import { useEffect, useRef, useState, type DragEvent } from 'react';
import { deleteModel, downloadModel, removeBackground, type Backend, type Phase } from '../ml/withoutbg/client';
import { Segmented } from './Controls';
import { BG_MODEL } from './dummy';
import { Icon } from './Icon';
import { FitFrame, Scan } from './Stage';
import { StepLayout } from './StepLayout';
import { ModelTask, TaskList, TaskRow, type RowState } from './Tasks';
import { formatBytes, type Cutout, type SourceImage } from './types';

type View = 'overlay' | 'cutout' | 'original';

/** Progress-bar span for each phase, and roughly how long it takes (ms) for the creep animation. */
const PHASES: Record<Phase, { label: string; from: number; to: number; expect: number }> = {
  decoding: { label: 'Reading the image', from: 0, to: 0.06, expect: 300 },
  loading: { label: 'Loading the model', from: 0.06, to: 0.28, expect: 2500 },
  router: { label: 'Finding the subject', from: 0.28, to: 0.45, expect: 900 },
  matting: { label: 'Building the alpha matte', from: 0.45, to: 0.94, expect: 2500 },
  compositing: { label: 'Compositing the cutout', from: 0.94, to: 1, expect: 400 },
};

interface DownloadState {
  status: RowState;
  loaded: number;
  startedAt: number;
  /** Seconds elapsed at the last progress update. */
  seconds: number;
  error?: string;
}

interface ProcessState {
  status: 'idle' | 'running' | 'error';
  phase: Phase;
  phaseAt: number;
  backend?: Backend;
  error?: string;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Props {
  source: SourceImage | null;
  cutout: Cutout | null;
  /** null while the stored model files are being checked. */
  modelStored: boolean | null;
  onChoose: (file: File | 'sample') => void;
  onCutout: (cutout: Cutout) => void;
  onModelStored: (stored: boolean) => void;
  onBusy: (busy: boolean) => void;
  onNext: () => void;
}

export function StepImage({ source, cutout, modelStored, onChoose, onCutout, onModelStored, onBusy, onNext }: Props) {
  const [dl, setDl] = useState<DownloadState>({ status: 'pending', loaded: 0, startedAt: 0, seconds: 0 });
  const [proc, setProc] = useState<ProcessState>({ status: 'idle', phase: 'decoding', phaseAt: 0 });
  const [now, setNow] = useState(0);
  const [view, setView] = useState<View>('overlay');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const downloading = dl.status === 'running';
  const processing = proc.status === 'running';
  const running = downloading || processing;
  useEffect(() => onBusy(running), [running, onBusy]);

  // Tick while processing so the bar creeps forward within each phase.
  useEffect(() => {
    if (!processing) return;
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [processing]);

  const ph = PHASES[proc.phase];
  const procProgress = ph.from + (ph.to - ph.from) * (1 - Math.exp(-Math.max(0, now - proc.phaseAt) / ph.expect));
  const procLabel = ph.label + '…' + (proc.backend === 'wasm' ? ' (on the CPU, WebGPU is unavailable)' : '');

  const run = async () => {
    if (!source) return;
    if (!modelStored) {
      setDl({ status: 'running', loaded: 0, startedAt: performance.now(), seconds: 0 });
      try {
        await downloadModel((loaded) => setDl((d) => ({ ...d, loaded, seconds: (performance.now() - d.startedAt) / 1000 })));
        setDl((d) => ({ ...d, status: 'done' }));
        onModelStored(true);
      } catch (e) {
        setDl((d) => ({ ...d, status: 'error', error: message(e) }));
        return;
      }
    }
    const t0 = performance.now();
    setProc({ status: 'running', phase: 'decoding', phaseAt: t0 });
    setNow(t0);
    try {
      const res = await removeBackground(source.blob, (phase, backend) =>
        setProc((p) => ({ ...p, phase, phaseAt: performance.now(), backend: backend ?? p.backend })),
      );
      onCutout({
        blob: res.png,
        url: URL.createObjectURL(res.png),
        backend: res.backend,
        seconds: (performance.now() - t0) / 1000,
      });
      setProc((p) => ({ ...p, status: 'idle' }));
      setView('overlay');
    } catch (e) {
      setProc((p) => ({ ...p, status: 'error', error: message(e) }));
    }
  };

  const removeStoredModel = async () => {
    await deleteModel();
    setDl({ status: 'pending', loaded: 0, startedAt: 0, seconds: 0 });
    onModelStored(false);
  };

  const pick = () => input.current?.click();

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) onChoose(file);
  };

  // ── Stage ────────────────────────────────────────────────────────────
  let stage;
  if (!source) {
    stage = (
      <div
        className={`dropzone${over ? ' is-over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={pick}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pick()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <div className="dropzone__art" aria-hidden="true">
          <span className="dropzone__card dropzone__card--back" />
          <span className="dropzone__card dropzone__card--mid" />
          <span className="dropzone__card dropzone__card--front">
            <Icon name="upload" size={26} />
          </span>
        </div>
        <strong>Drop a character image here</strong>
        <span className="muted">
          or <span className="text-link">browse your files</span>
        </span>
        <span className="dropzone__formats">PNG · JPG · WebP · up to 4096 px</span>
      </div>
    );
  } else {
    const aspect = source.width / source.height;
    const done = !!cutout && !running;
    stage = (
      <FitFrame aspect={aspect} className="photo">
        {(!done || view !== 'cutout') && (
          <img src={source.url} alt="" className={done && view === 'overlay' ? 'is-dim' : ''} />
        )}
        {done && view === 'cutout' && <div className="checker" />}
        {done && view !== 'original' && (
          <img src={cutout.url} alt="Character cutout" className={`cutout${view === 'overlay' ? ' cutout--glow' : ''}`} />
        )}
        {processing && <Scan progress={procProgress} label={procLabel} />}
        {downloading && (
          <div className="stage-veil">
            <div className="stage-pill">
              <Icon name="download" size={15} />
              Downloading model · {Math.round((dl.loaded / (BG_MODEL.files.reduce((s, f) => s + f.sizeMB, 0) * 1e6)) * 100)}%
            </div>
          </div>
        )}
      </FitFrame>
    );
  }

  const stageTop =
    source && cutout && !running ? (
      <Segmented
        size="sm"
        label="Preview"
        value={view}
        onChange={setView}
        options={[
          { id: 'overlay', label: 'Overlay' },
          { id: 'cutout', label: 'Cutout' },
          { id: 'original', label: 'Original' },
        ]}
      />
    ) : null;

  // ── Panel ────────────────────────────────────────────────────────────
  const modelState: RowState = downloading ? 'running' : dl.status === 'error' ? 'error' : modelStored ? 'done' : 'pending';
  const cutState: RowState = processing ? 'running' : proc.status === 'error' ? 'error' : cutout ? 'done' : 'pending';
  const failed = dl.status === 'error' || proc.status === 'error';

  return (
    <StepLayout
      stage={stage}
      stageTop={stageTop}
      eyebrow="Step 1 of 3"
      title={source ? 'Cut out the character' : 'Choose a character'}
      description={
        source
          ? 'The character is lifted onto its own layer. The original photo is kept as is, and sits behind the cutout in the final scene.'
          : 'Pick a photo or illustration with one clear subject. It becomes the foreground layer of your scene.'
      }
      footer={
        <>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onChoose(f);
              e.target.value = '';
            }}
          />
          {!source && (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => onChoose('sample')}>
                Use sample
              </button>
              <button type="button" className="btn btn--primary" onClick={pick}>
                <Icon name="image" />
                Choose image
              </button>
            </>
          )}
          {source && !cutout && (
            <button type="button" className="btn btn--primary btn--wide" onClick={run} disabled={running}>
              {running ? (
                <>
                  <span className="spinner spinner--sm spinner--dark" />
                  {downloading ? 'Downloading model…' : 'Cutting out…'}
                </>
              ) : failed ? (
                <>
                  <Icon name="refresh" />
                  Try again
                </>
              ) : (
                <>
                  <Icon name="wand" />
                  Remove background
                </>
              )}
            </button>
          )}
          {source && cutout && (
            <button type="button" className="btn btn--primary btn--wide" onClick={onNext} disabled={running}>
              Continue to depth
              <Icon name="arrowRight" />
            </button>
          )}
        </>
      }
    >
      {!source && (
        <ul className="tips">
          <li>
            <Icon name="sparkle" size={16} />
            <div>
              <strong>One clear subject</strong>
              <span>A person, character or object that stands out from the background.</span>
            </div>
          </li>
          <li>
            <Icon name="image" size={16} />
            <div>
              <strong>At least 1000 px</strong>
              <span>Larger images give cleaner edges and a sharper result.</span>
            </div>
          </li>
          <li>
            <Icon name="cpu" size={16} />
            <div>
              <strong>Stays on your device</strong>
              <span>The models are downloaded once and run locally. Your photo is never uploaded.</span>
            </div>
          </li>
        </ul>
      )}

      {source && (
        <>
          <div className="filecard">
            <img src={source.url} alt="" />
            <div className="filecard__text">
              <strong>{source.name}</strong>
              <span>
                {source.width} × {source.height} · {formatBytes(source.bytes)}
              </span>
            </div>
            <button type="button" className="btn btn--small btn--ghost" onClick={pick} disabled={running}>
              Replace
            </button>
          </div>

          <TaskList>
            <ModelTask
              model={BG_MODEL}
              state={modelState}
              loaded={dl.loaded}
              seconds={dl.seconds}
              doneText={dl.status === 'done' ? 'Downloaded' : 'Saved'}
              error={dl.error}
              aside={
                modelState === 'done' &&
                !running && (
                  <button type="button" className="text-btn task__action" onClick={removeStoredModel}>
                    Delete
                  </button>
                )
              }
            />
            <TaskRow
              icon="wand"
              title="Remove background"
              subtitle="Separate the character from the scene"
              state={cutState}
              progress={procProgress}
              detail={procLabel}
              doneText={cutout ? `${cutout.seconds.toFixed(1)} s · ${cutout.backend === 'webgpu' ? 'GPU' : 'CPU'}` : 'Done'}
              error={proc.error}
            />
          </TaskList>

          {cutout && !running && (
            <div className="outputs">
              <h3>Output</h3>
              <div className="outputs__grid">
                <figure className="output">
                  <div className="output__thumb checker">
                    <img src={cutout.url} alt="" />
                  </div>
                  <figcaption>
                    <strong>Character cutout</strong>
                    <span>PNG with transparency</span>
                  </figcaption>
                </figure>
                <figure className="output">
                  <div className="output__thumb">
                    <img src={source.url} alt="" />
                  </div>
                  <figcaption>
                    <strong>Original</strong>
                    <span>Kept as the backdrop</span>
                  </figcaption>
                </figure>
              </div>
            </div>
          )}
        </>
      )}
    </StepLayout>
  );
}
