import type { CSSProperties } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step = 0.01, disabled, format, onChange }: Props) {
  return (
    <label className={`slider${disabled ? ' slider--disabled' : ''}`}>
      <span className="slider__row">
        <span>{label}</span>
        <span className="slider__value">{format ? format(value) : value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        style={{ '--p': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
