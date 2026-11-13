import { useEffect, useState } from 'react';
import { Segmented } from './Controls';
import { DEPTH_MODEL, DEPTH_PHASES, DEPTH_STATS, phaseFor, SAMPLE, totalMB } from './dummy';
import { Icon } from './Icon';
import { Compare, FitFrame, Scan } from './Stage';
import { StepLayout } from './StepLayout';
import { ModelTask, TaskList, TaskRow } from './Tasks';
import type { SourceImage } from './types';
import { useSimulatedTask } from './useSimulatedTask';

type View = 'split' | 'depth' | 'original';

interface Props {
  source: SourceImage;
  depth: string | null;
  modelCached: boolean;
  onDepth: (url: string) => void;
  onModelCached: () => void;
  onBusy: (busy: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepDepth({ source, depth, modelCached, onDepth, onModelCached, onBusy, onBack, onNext }: Props) {
  const download = useSimulatedTask(2600);
  const infer = useSimulatedTask(3000);
  const [view, setView] = useState<View>('split');

  const running = download.status === 'running' || infer.status === 'running';
  useEffect(() => onBusy(running), [running, onBusy]);

  const run = async () => {
    if (!modelCached) {
      await download.start();
      onModelCached();
    }
    await infer.start();
    onDepth(SAMPLE.depth);
  };

  const aspect = source.width / source.height;
  const done = !!depth && !running;
  const original = <img src={source.url} alt="" />;
  const depthImg = <img src={depth ?? SAMPLE.depth} alt="Depth map" className="depthmap" />;

  const stage = (
    <FitFrame aspect={aspect} className="photo">
      {!done && (
        <>
          {original}
          {infer.status === 'running' && (
            <>
              <img
                src={SAMPLE.depth}
                alt=""
                className="depthmap"
                style={{ clipPath: `inset(0 0 ${(1 - infer.progress) * 100}% 0)` }}
              />
              <Scan progress={infer.progress} label={phaseFor(DEPTH_PHASES, infer.progress)} />
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
        </>
      )}
      {done && view === 'split' && <Compare before={original} after={depthImg} beforeLabel="Original" afterLabel="Depth" />}
      {done && view === 'depth' && depthImg}
      {done && view === 'original' && original}
    </FitFrame>
  );

  const stageTop = done ? (
    <Segmented
      size="sm"
      label="Preview"
      value={view}
      onChange={setView}
      options={[
        { id: 'split', label: 'Compare' },
        { id: 'depth', label: 'Depth' },
        { id: 'original', label: 'Original' },
      ]}
    />
  ) : null;

  const s = DEPTH_STATS;
  const pct = (v: number) => `${v * 100}%`;

  return (
    <StepLayout
      stage={stage}
      stageTop={stageTop}
      eyebrow="Step 2 of 3"
      title="Detect depth"
      description="Depth Anything estimates how far away every pixel is in the original image. This is what lets the layers move at different speeds."
      footer={
        <>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onBack} disabled={running} aria-label="Back">
            <Icon name="arrowLeft" />
          </button>
          {!depth ? (
            <button type="button" className="btn btn--primary btn--wide" onClick={run} disabled={running}>
              {running ? (
                <>
                  <span className="spinner spinner--sm spinner--dark" />
                  {download.status === 'running' ? 'Downloading model…' : 'Estimating depth…'}
                </>
              ) : (
                <>
                  <Icon name="mountain" />
                  Detect depth
                </>
              )}
            </button>
          ) : (
            <button type="button" className="btn btn--primary btn--wide" onClick={onNext}>
              Continue to configure
              <Icon name="arrowRight" />
            </button>
          )}
        </>
      }
    >
      <TaskList>
        <ModelTask
          model={DEPTH_MODEL}
          state={download.status === 'running' ? 'running' : modelCached ? 'done' : 'pending'}
          loaded={download.progress * totalMB(DEPTH_MODEL) * 1e6}
          seconds={download.runningFor}
          doneText={download.status === 'done' ? 'Downloaded' : 'Cached'}
        />
        <TaskRow
          icon="mountain"
          title="Estimate depth"
          subtitle={`Process the original at ${source.width} × ${source.height}`}
          state={infer.status === 'running' ? 'running' : depth ? 'done' : 'pending'}
          progress={infer.progress}
          detail={phaseFor(DEPTH_PHASES, infer.progress)}
          doneText={infer.elapsed ? `${infer.elapsed.toFixed(1)} s` : 'Done'}
        />
      </TaskList>

      {done && (
        <div className="outputs">
          <h3>Output</h3>
          <figure className="output output--wide">
            <div className="output__thumb">
              <img src={depth} alt="" className="depthmap" />
            </div>
            <figcaption>
              <strong>Depth map</strong>
              <span>16-bit grayscale · white is near</span>
            </figcaption>
          </figure>

          <div className="range">
            <div className="range__head">
              <span>Depth range</span>
              <span className="muted">
                {s.min.toFixed(2)} to {s.max.toFixed(2)}
              </span>
            </div>
            <div className="range__bar">
              <span className="range__fill" style={{ left: pct(s.min), right: pct(1 - s.max) }} />
              <span className="range__mark" style={{ left: pct(s.background) }} data-label="Background" />
              <span className="range__mark range__mark--accent" style={{ left: pct(s.character) }} data-label="Character" />
            </div>
            <div className="range__ends">
              <span>Far</span>
              <span>Near</span>
            </div>
          </div>
        </div>
      )}

      {!depth && !running && (
        <p className="note">
          <Icon name="info" size={15} />
          Depth is estimated from the full original image, not the cutout, so the background gets depth too.
        </p>
      )}
    </StepLayout>
  );
}
