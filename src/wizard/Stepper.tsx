import { Icon } from './Icon';
import { STEPS, type StepId } from './steps';

interface Props {
  current: StepId;
  /** Index of the furthest step the user may jump to. */
  reachable: number;
  disabled?: boolean;
  onSelect: (id: StepId) => void;
}

export function Stepper({ current, reachable, disabled, onSelect }: Props) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  return (
    <nav className="stepper" aria-label="Import steps">
      <ol>
        {STEPS.map((s, i) => {
          const done = i < currentIndex || (i <= reachable && i !== currentIndex && i < reachable);
          const state = i === currentIndex ? 'current' : done ? 'done' : 'todo';
          const canGo = !disabled && i <= reachable && i !== currentIndex;
          return (
            <li key={s.id} className={`stepper__item is-${state}`}>
              {i > 0 && <span className={`stepper__line${i <= Math.max(currentIndex, reachable) ? ' is-filled' : ''}`} />}
              <button
                type="button"
                disabled={!canGo}
                aria-current={state === 'current' ? 'step' : undefined}
                onClick={() => onSelect(s.id)}
              >
                <span className="stepper__dot">
                  {state === 'done' ? <Icon name="check" size={14} /> : s.id === 'result' ? <Icon name="sparkle" size={14} /> : i + 1}
                </span>
                <span className="stepper__text">
                  <span className="stepper__label">{s.label}</span>
                  <span className="stepper__sub">{s.sub}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
