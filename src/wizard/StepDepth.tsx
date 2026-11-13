import { useEffect, useState } from 'react';
import { estimateDepth, type DepthPhase } from '../ml/client';
import { DEPTH_MODEL } from './catalog';
import { Segmented } from './Controls';
import { Icon } from './Icon';
import { Compare, DownloadVeil, FitFrame, Scan } from './Stage';
import { StepLayout } from './StepLayout';
import { ModelRow, TaskList, TaskRow, type RowState } from './Tasks';
import type { Cutout, DepthMap, SourceImage } from './types';
import { useModelDownload, usePhasedJob, type PhaseSpec } from './useMlJob';

type View = 'split' | 'depth' | 'original';

const PHASES: Record<DepthPhase, PhaseSpec> = {
  decoding: { label: 'Preparing the image', from: 0, to: 0.08, expect: 300 },
  loading: { label: 'Loading the model', from: 0.08, to: 0.3, expect: 1500 },
  depth: { label: 'Estimating depth', from: 0.3, to: 0.88, expect: 2500 },
  encoding: { label: 'Encoding 16-bit depth', from: 0.88, to: 1, expect: 500 },
};

interface Props {
  source: SourceImage;
  /** Used to measure how far the character sits in front of the scene. */
  cutout: Cutout | null;
  depth: DepthMap | null;
  /** null while the stored model file is being checked. */
  modelStored: boolean | null;
  onDepth: (depth: DepthMap) => void;
  onModelStored: (stored: boolean) => void;
  onBusy: (busy: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepDepth({ source, cutout, depth, modelStored, onDepth, onModelStored, onBusy, onBack, onNext }: Props) {
  const dl = useModelDownload('depth', modelStored, onModelStored);
  const job = usePhasedJob(PHASES, 'decoding');
  const [view, setView] = useState<View>('split');

  const running = dl.running || job.running;
  useEffect(() => onBusy(running), [running, onBusy]);

  const run = async () => {
    if (!(await dl.ensure())) return;
    const res = await job.run((onPhase) => estimateDepth(source.blob, cutout?.blob ?? null, onPhase));
    if (!res) return;
    const { png, backend, means } = res.result;
    onDepth({ blob: png, url: URL.createObjectURL(png), backend, seconds: res.seconds, means });
    setView('split');
  };

  const aspect = source.width / source.height;
  const done = !!depth && !running;
  const original = <img src={source.url} alt="" />;

  const stage = (
    <FitFrame aspect={aspect} className="photo">
      {done ? (
        <>
          {view === 'split' && (
            <Compare
              before={original}
              after={<img src={depth.url} alt="Depth map" className="depthmap" />}
              beforeLabel="Original"
              afterLabel="Depth"
            />
          )}
          {view === 'depth' && <img src={depth.url} alt="Depth map" className="depthmap" />}
          {view === 'original' && original}
        </>
      ) : (
        <>
          {original}
          {job.running && <Scan progress={job.progress} label={job.label} />}
          {dl.running && <DownloadVeil model={DEPTH_MODEL} loaded={dl.loaded} />}
        </>
      )}
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

  const depthState: RowState = job.running ? 'running' : job.failed ? 'error' : depth ? 'done' : 'pending';
  const failed = dl.failed || job.failed;
  const means = depth?.means;
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
                  {dl.running ? 'Downloading model…' : 'Estimating depth…'}
                </>
              ) : failed ? (
                <>
                  <Icon name="refresh" />
                  Try again
                </>
              ) : (
                <>
                  <Icon name="mountain" />
                  Detect depth
                </>
              )}
            </button>
          ) : (
            <button type="button" className="btn btn--primary btn--wide" onClick={onNext} disabled={running}>
              Continue to configure
              <Icon name="arrowRight" />
            </button>
          )}
        </>
      }
    >
      <TaskList>
        <ModelRow model={DEPTH_MODEL} download={dl} busy={running} />
        <TaskRow
          icon="mountain"
          title="Estimate depth"
          subtitle={`Process the original at ${source.width} × ${source.height}`}
          state={depthState}
          progress={job.progress}
          detail={job.label}
          doneText={depth ? `${depth.seconds.toFixed(1)} s · ${depth.backend === 'webgpu' ? 'GPU' : 'CPU'}` : 'Done'}
          error={job.error}
        />
      </TaskList>

      {done && (
        <div className="outputs">
          <h3>Output</h3>
          <figure className="output output--wide">
            <div className="output__thumb">
              <img src={depth.url} alt="" className="depthmap" />
            </div>
            <figcaption>
              <strong>Depth map</strong>
              <span>16-bit grayscale · white is near</span>
            </figcaption>
          </figure>

          {means && (
            <div className="range">
              <div className="range__head">
                <span>Layer separation</span>
                <span className="muted">{Math.abs(means.character - means.background).toFixed(2)}</span>
              </div>
              <div className="range__bar">
                <span className="range__mark" style={{ left: pct(means.background) }} data-label="Background" />
                <span className="range__mark range__mark--accent" style={{ left: pct(means.character) }} data-label="Character" />
              </div>
              <div className="range__ends">
                <span>Far</span>
                <span>Near</span>
              </div>
            </div>
          )}
        </div>
      )}

      {!depth && !running && !failed && (
        <p className="note">
          <Icon name="info" size={15} />
          Depth is estimated from the full original image, not the cutout, so the background gets depth too.
        </p>
      )}
    </StepLayout>
  );
}
