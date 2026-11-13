import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { totalMB, type ModelInfo } from './catalog';
import type { ModelDownload } from './useMlJob';

export type RowState = 'pending' | 'running' | 'done' | 'error';

interface TaskRowProps {
  icon: IconName;
  title: string;
  subtitle: string;
  state: RowState;
  progress?: number;
  detail?: string;
  doneText?: string;
  error?: string;
  aside?: ReactNode;
  children?: ReactNode;
}

export function TaskRow({ icon, title, subtitle, state, progress = 0, detail, doneText, error, aside, children }: TaskRowProps) {
  return (
    <li className={`task is-${state}`}>
      <span className="task__icon">
        {state === 'done' ? (
          <Icon name="check" size={16} />
        ) : state === 'running' ? (
          <span className="spinner" />
        ) : state === 'error' ? (
          <Icon name="x" size={16} />
        ) : (
          <Icon name={icon} size={16} />
        )}
      </span>
      <div className="task__body">
        <div className="task__top">
          <span className="task__title">{title}</span>
          <span className="task__meta">
            {state === 'running' ? `${Math.round(progress * 100)}%` : state === 'done' ? (doneText ?? 'Done') : state === 'error' ? 'Failed' : ''}
            {aside}
          </span>
        </div>
        <div className="task__sub">{state === 'error' && error ? error : state === 'running' && detail ? detail : subtitle}</div>
        {state === 'running' && (
          <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        {children}
      </div>
    </li>
  );
}

export function TaskList({ children }: { children: ReactNode }) {
  return <ol className="tasks">{children}</ol>;
}

interface ModelTaskProps {
  model: ModelInfo;
  state: RowState;
  /** Bytes received so far (while running). */
  loaded: number;
  /** Seconds since the download started. */
  seconds: number;
  doneText?: string;
  error?: string;
  aside?: ReactNode;
}

/** Download row for a model, with transfer stats and the file list. */
export function ModelTask({ model, state, loaded, seconds, doneText = 'Saved', error, aside }: ModelTaskProps) {
  const total = totalMB(model);
  const got = loaded / 1e6;
  const speed = got / Math.max(0.001, seconds);
  const left = speed > 0.5 ? Math.max(1, Math.round((total - got) / speed)) : null;
  const ends = model.files.map((_, i) => model.files.slice(0, i + 1).reduce((sum, f) => sum + f.sizeMB, 0));

  return (
    <TaskRow
      icon="download"
      title={`Download ${model.name}`}
      subtitle={state === 'done' ? `Saved on this device · ${total} MB` : `${total} MB · ${model.source} · runs on your device`}
      state={state}
      progress={got / total}
      detail={`${got.toFixed(0)} of ${total} MB` + (speed > 0.5 ? ` · ${speed.toFixed(0)} MB/s` : '') + (left ? ` · ${left} s left` : '')}
      doneText={doneText}
      error={error}
      aside={aside}
    >
      {state === 'running' && (
        <ul className="files">
          {model.files.map((f, i) => {
            const start = i ? ends[i - 1] : 0;
            const p = Math.max(0, Math.min(1, (got - start) / (ends[i] - start)));
            return (
              <li key={f.name} className={p >= 1 ? 'is-done' : p > 0 ? 'is-active' : ''}>
                <span className="files__name">{f.name}</span>
                <span className="files__size">{p >= 1 ? <Icon name="check" size={13} /> : `${f.sizeMB} MB`}</span>
              </li>
            );
          })}
        </ul>
      )}
    </TaskRow>
  );
}

/** ModelTask driven by useModelDownload, with a Delete action once the model is stored. */
export function ModelRow({ model, download: d, busy }: { model: ModelInfo; download: ModelDownload; busy: boolean }) {
  return (
    <ModelTask
      model={model}
      state={d.state}
      loaded={d.loaded}
      seconds={d.seconds}
      doneText={d.justDownloaded ? 'Downloaded' : 'Saved'}
      error={d.error}
      aside={
        d.state === 'done' &&
        !busy && (
          <button type="button" className="text-btn task__action" onClick={d.remove}>
            Delete
          </button>
        )
      }
    />
  );
}
