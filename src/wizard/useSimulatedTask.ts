import { useCallback, useEffect, useRef, useState } from 'react';

export type TaskStatus = 'idle' | 'running' | 'done';

export interface SimulatedTask {
  status: TaskStatus;
  /** 0..1 */
  progress: number;
  /** Seconds the last run took. */
  elapsed: number;
  /** Seconds since the current run started. */
  runningFor: number;
  start: () => Promise<void>;
}

/**
 * Stand-in for a real download or inference job: animates progress from 0 to 1
 * over `durationMs` with a slightly uneven pace so it reads like real work.
 */
export function useSimulatedTask(durationMs: number): SimulatedTask {
  const [state, setState] = useState({ status: 'idle' as TaskStatus, progress: 0, elapsed: 0, runningFor: 0 });
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const start = useCallback(
    () =>
      new Promise<void>((resolve) => {
        cancelAnimationFrame(raf.current);
        const t0 = performance.now();
        setState({ status: 'running', progress: 0, elapsed: 0, runningFor: 0 });
        const tick = (now: number) => {
          const t = Math.min(1, (now - t0) / durationMs);
          if (t >= 1) {
            setState({ status: 'done', progress: 1, elapsed: durationMs / 1000, runningFor: durationMs / 1000 });
            resolve();
            return;
          }
          // Ease out, with a gentle wobble so the bar doesn't move like a metronome.
          const eased = 1 - Math.pow(1 - t, 1.6);
          const wobble = Math.sin(t * 19) * 0.012 * (1 - t);
          setState({ status: 'running', progress: Math.max(0, Math.min(0.995, eased + wobble)), elapsed: 0, runningFor: (now - t0) / 1000 });
          raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
      }),
    [durationMs],
  );

  return { ...state, start };
}
