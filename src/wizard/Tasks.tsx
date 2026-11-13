import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { totalMB, type ModelInfo } from './dummy';
import type { SimulatedTask } from './useSimulatedTask';

type RowState = 'pending' | 'running' | 'done';

interface TaskRowProps {
  icon: IconName;
  title: string;
  subtitle: string;
  state: RowState;
  progress?: number;
  detail?: string;
  doneText?: string;
  children?: ReactNode;
}

export function TaskRow({ icon, title, subtitle, state, progress = 0, detail, doneText, children }: TaskRowProps) {
  return (
    <li className={`task is-${state}`}>
      <span className="task__icon">
        {state === 'done' ? <Icon name="check" size={16} /> : state === 'running' ? <span className="spinner" /> : <Icon name={icon} size={16} />}
      </span>
      <div className="task__body">
        <div className="task__top">
          <span className="task__title">{title}</span>
          <span className="task__meta">
            {state === 'running' ? `${Math.round(progress * 100)}%` : state === 'done' ? (doneText ?? 'Done') : ''}
          </span>
        </div>
        <div className="task__sub">{state === 'running' && detail ? detail : subtitle}</div>
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

/** Download row for a model, with simulated transfer stats and the file list. */
export function ModelTask({ model, task, cached }: { model: ModelInfo; task: SimulatedTask; cached: boolean }) {
  const total = totalMB(model);
  const running = task.status === 'running';
  const state: RowState = running ? 'running' : cached ? 'done' : 'pending';
  const got = task.progress * total;
  const speed = 96 + Math.round(Math.sin(task.progress * 23) * 14);
  const left = Math.max(1, Math.round((total - got) / speed));

  const ends = model.files.map((_, i) => model.files.slice(0, i + 1).reduce((sum, f) => sum + f.sizeMB, 0) / total);
  return (
    <TaskRow
      icon="download"
      title={`Download ${model.name}`}
      subtitle={cached ? `Saved on this device · ${total} MB` : `${total} MB · ${model.source} · runs on your device`}
      state={state}
      progress={task.progress}
      detail={`${got.toFixed(0)} of ${total} MB · ${speed} MB/s · ${left} s left`}
      doneText={task.status === 'done' ? 'Downloaded' : 'Cached'}
    >
      {running && (
        <ul className="files">
          {model.files.map((f, i) => {
            const start = i ? ends[i - 1] : 0;
            const end = ends[i];
            const p = Math.max(0, Math.min(1, (task.progress - start) / (end - start)));
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
