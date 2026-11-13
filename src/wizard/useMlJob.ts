import { useEffect, useState } from 'react';
import { deleteModel, downloadModel, type Backend, type ModelId } from '../ml/client';
import type { RowState } from './Tasks';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface DownloadState {
  status: 'idle' | 'running' | 'done' | 'error';
  loaded: number;
  startedAt: number;
  /** Seconds elapsed at the last progress update. */
  seconds: number;
  error?: string;
}

export type ModelDownload = ReturnType<typeof useModelDownload>;

/** Download state for one model, plus actions to fetch it (if needed) or delete it. */
export function useModelDownload(model: ModelId, stored: boolean | null, onStored: (stored: boolean) => void) {
  const [dl, setDl] = useState<DownloadState>({ status: 'idle', loaded: 0, startedAt: 0, seconds: 0 });

  /** Downloads the model unless it is stored. Resolves false if the download failed. */
  const ensure = async (): Promise<boolean> => {
    if (stored) return true;
    setDl({ status: 'running', loaded: 0, startedAt: performance.now(), seconds: 0 });
    try {
      await downloadModel(model, (loaded) => setDl((d) => ({ ...d, loaded, seconds: (performance.now() - d.startedAt) / 1000 })));
      setDl((d) => ({ ...d, status: 'done' }));
      onStored(true);
      return true;
    } catch (e) {
      setDl((d) => ({ ...d, status: 'error', error: message(e) }));
      return false;
    }
  };

  const remove = async () => {
    await deleteModel(model);
    setDl({ status: 'idle', loaded: 0, startedAt: 0, seconds: 0 });
    onStored(false);
  };

  const state: RowState =
    dl.status === 'running' ? 'running' : dl.status === 'error' ? 'error' : stored ? 'done' : 'pending';

  return {
    state,
    running: dl.status === 'running',
    failed: dl.status === 'error',
    justDownloaded: dl.status === 'done',
    loaded: dl.loaded,
    seconds: dl.seconds,
    error: dl.error,
    ensure,
    remove,
  };
}

export interface PhaseSpec {
  label: string;
  /** Progress-bar span covered by this phase. */
  from: number;
  to: number;
  /** Roughly how long the phase takes (ms); drives the creep within the span. */
  expect: number;
}

interface JobState<P> {
  status: 'idle' | 'running' | 'error';
  phase: P;
  phaseAt: number;
  backend?: Backend;
  error?: string;
}

/** A model run reported in phases, with a progress bar that creeps forward inside each phase. */
export function usePhasedJob<P extends string>(phases: Record<P, PhaseSpec>, first: NoInfer<P>) {
  const [job, setJob] = useState<JobState<P>>({ status: 'idle', phase: first, phaseAt: 0 });
  const [now, setNow] = useState(0);
  const running = job.status === 'running';

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const ph = phases[job.phase];
  const progress = ph.from + (ph.to - ph.from) * (1 - Math.exp(-Math.max(0, now - job.phaseAt) / ph.expect));
  const label = ph.label + '…' + (job.backend === 'wasm' ? ' (on the CPU, WebGPU is unavailable)' : '');

  /** Runs `fn`, tracking its phases. Resolves with its result and the wall time, or null if it failed. */
  const run = async <T>(
    fn: (onPhase: (p: P, backend?: Backend) => void) => Promise<T>,
  ): Promise<{ result: T; seconds: number } | null> => {
    const t0 = performance.now();
    setJob({ status: 'running', phase: first, phaseAt: t0 });
    setNow(t0);
    try {
      const result = await fn((phase, backend) =>
        setJob((j) => ({ ...j, phase, phaseAt: performance.now(), backend: backend ?? j.backend })),
      );
      setJob((j) => ({ ...j, status: 'idle' }));
      return { result, seconds: (performance.now() - t0) / 1000 };
    } catch (e) {
      setJob((j) => ({ ...j, status: 'error', error: message(e) }));
      return null;
    }
  };

  return { running, failed: job.status === 'error', error: job.error, progress, label, run };
}
