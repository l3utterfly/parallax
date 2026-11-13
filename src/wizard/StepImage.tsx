import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Segmented } from './Controls';
import { BG_MODEL, CUTOUT_PHASES, phaseFor, SAMPLE } from './dummy';
import { Icon } from './Icon';
import { FitFrame, Scan } from './Stage';
import { StepLayout } from './StepLayout';
import { ModelTask, TaskList, TaskRow } from './Tasks';
import { formatBytes, type SourceImage } from './types';
import { useSimulatedTask } from './useSimulatedTask';

type View = 'overlay' | 'cutout' | 'original';

interface Props {
  source: SourceImage | null;
  cutout: string | null;
  modelCached: boolean;
  onChoose: (file: File | 'sample') => void;
  onCutout: (url: string) => void;
  onModelCached: () => void;
  onBusy: (busy: boolean) => void;
  onNext: () => void;
}

export function StepImage({ source, cutout, modelCached, onChoose, onCutout, onModelCached, onBusy, onNext }: Props) {
  const download = useSimulatedTask(3800);
  const cut = useSimulatedTask(2600);
  const [view, setView] = useState<View>('overlay');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const running = download.status === 'running' || cut.status === 'running';
  useEffect(() => onBusy(running), [running, onBusy]);

  const run = async () => {
    if (!modelCached) {
      await download.start();
      onModelCached();
    }
    await cut.start();
    onCutout(SAMPLE.cutout);
  };

  const pick = () => input.current?.click();

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) onChoose(file);
  };

  const fileInput = (
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
  );

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
          <img src={cutout} alt="Character cutout" className={`cutout${view === 'overlay' ? ' cutout--glow' : ''}`} />
        )}
        {cut.status === 'running' && (
          <>
            <img
              src={SAMPLE.cutout}
              alt=""
              className="cutout cutout--glow"
              style={{ clipPath: `inset(0 0 ${(1 - cut.progress) * 100}% 0)` }}
            />
            <Scan progress={cut.progress} label={phaseFor(CUTOUT_PHASES, cut.progress)} />
          </>
        )}
        {download.status === 'running' && (
          <div className="stage-veil">
            <div className="stage-pill">
              <Icon name="download" size={15} />
              Downloading model · {Math.round(download.progress * 100)}%
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
  const cutState = cut.status === 'running' ? 'running' : cutout ? 'done' : 'pending';

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
          {fileInput}
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
                  {download.status === 'running' ? 'Downloading model…' : 'Cutting out…'}
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
            <button type="button" className="btn btn--primary btn--wide" onClick={onNext}>
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
            <ModelTask model={BG_MODEL} task={download} cached={modelCached} />
            <TaskRow
              icon="wand"
              title="Remove background"
              subtitle="Separate the character from the scene"
              state={cutState}
              progress={cut.progress}
              detail={phaseFor(CUTOUT_PHASES, cut.progress)}
              doneText={cut.elapsed ? `${cut.elapsed.toFixed(1)} s` : 'Done'}
            />
          </TaskList>

          {cutout && !running && (
            <div className="outputs">
              <h3>Output</h3>
              <div className="outputs__grid">
                <figure className="output">
                  <div className="output__thumb checker">
                    <img src={cutout} alt="" />
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
