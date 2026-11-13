import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface SegmentedProps<T extends string> {
  value: T;
  options: { id: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  label?: string;
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md', label }: SegmentedProps<T>) {
  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={value === o.id ? 'is-active' : ''}
          onClick={() => onChange(o.id)}
        >
          {o.icon && <Icon name={o.icon} size={15} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__knob" />
    </button>
  );
}

export function Section({ title, icon, aside, children }: { title: string; icon?: IconName; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="group">
      <div className="group__head">
        <h2>
          {icon && <Icon name={icon} size={15} />}
          {title}
        </h2>
        {aside}
      </div>
      <div className="group__body">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row__text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  );
}
