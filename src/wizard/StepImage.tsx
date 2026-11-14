import { useEffect, useRef, useState, type DragEvent } from 'react';
import { removeBackground, type CutoutPhase } from '../ml/client';
import { BG_MODEL, SAMPLES, type Sample } from './catalog';
import { Segmented } from './Controls';
import { Icon } from './Icon';
import { DownloadVeil, FitFrame, Scan } from './Stage';
import { StepLayout } from './StepLayout';
import { ModelRow, TaskList, TaskRow, type RowState } from './Tasks';
import { formatBytes, type Cutout, type SourceImage } from './types';
import { useModelDownload, usePhasedJob, type PhaseSpec } from './useMlJob';

type View = 'overlay' | 'cutout' | 'original';

const PHASES: Record<CutoutPhase, PhaseSpec> = {
  decoding: { label: 'Reading the image', from: 0, to: 0.06, expect: 300 },
  loading: { label: 'Loading the model', from: 0.06, to: 0.28, expect: 2500 },
  router: { label: 'Finding the subject', from: 0.28, to: 0.45, expect: 900 },
  matting: { label: 'Building the alpha matte', from: 0.45, to: 0.94, expect: 2500 },
  compositing: { label: 'Compositing the cutout', from: 0.94, to: 1, expect: 400 },
};

interface Props {
  source: SourceImage | null;
  cutout: Cutout | null;
  /** null while the stored model files are being checked. */
  modelStored: boolean | null;
  onChoose: (file: File | Sample) => void;
  onCutout: (cutout: Cutout) => void;
  onModelStored: (stored: boolean) => void;
  onBusy: (busy: boolean) => void;
  onNext: () => void;
}

export function StepImage({ source, cutout, modelStored, onChoose, onCutout, onModelStored, onBusy, onNext }: Props) {
  const dl = useModelDownload('withoutbg', modelStored, onModelStored);
  const job = usePhasedJob(PHASES, 'decoding');
  const [view, setView] = useState<View>('overlay');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const downloading = dl.running;
  const processing = job.running;
  const running = downloading || processing;
  useEffect(() => onBusy(running), [running, onBusy]);

  const run = async () => {
    if (!source || !(await dl.ensure())) return;
    const res = await job.run((onPhase) => removeBackground(source.blob, onPhase));
    if (!res) return;
    onCutout({ blob: res.result.png, url: URL.createObjectURL(res.result.png), backend: res.result.backend, seconds: res.seconds });
    setView('overlay');
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
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          // Moving between the zone's own children isn't leaving it.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={onDrop}
      >
        <button type="button" className="dropzone__pick" onClick={pick}>
          <span className="dropzone__art" aria-hidden="true">
            <span className="dropzone__card dropzone__card--back" />
            <span className="dropzone__card dropzone__card--mid" />
            <span className="dropzone__card dropzone__card--front">
              <Icon name="upload" size={26} />
            </span>
          </span>
          <strong>Drop a character image here</strong>
          <span className="muted">
            or <span className="text-link">browse your files</span>
          </span>
          <span className="dropzone__formats">PNG · JPG · WebP · up to 4096 px</span>
        </button>

        <div className="samples">
          <h3 className="samples__divider">
            <span>Or try a sample</span>
          </h3>
          <div className="samples__grid">
            {SAMPLES.map((s) => (
              <button key={s.id} type="button" className="sample" onClick={() => onChoose(s)}>
                <span className="sample__thumb">
                  <img src={s.original} alt="" loading="lazy" decoding="async" />
                </span>
                <span className="sample__label">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
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
        {processing && <Scan progress={job.progress} label={job.label} />}
        {downloading && <DownloadVeil model={BG_MODEL} loaded={dl.loaded} />}
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
  const cutState: RowState = processing ? 'running' : job.failed ? 'error' : cutout ? 'done' : 'pending';
  const failed = dl.failed || job.failed;

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
              <button type="button" className="btn btn--primary btn--wide" onClick={pick}>
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
            <ModelRow model={BG_MODEL} download={dl} busy={running} />
            <TaskRow
              icon="wand"
              title="Remove background"
              subtitle="Separate the character from the scene"
              state={cutState}
              progress={job.progress}
              detail={job.label}
              doneText={cutout ? `${cutout.seconds.toFixed(1)} s · ${cutout.backend === 'webgpu' ? 'GPU' : 'CPU'}` : 'Done'}
              error={job.error}
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
