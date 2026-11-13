import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { totalMB, type ModelInfo } from './catalog';
import { Icon } from './Icon';

/** Box with the image's aspect ratio, fitted inside the stage (contain). Children stack on top of each other. */
export function FitFrame({ aspect, children, className = '' }: { aspect: number; children: ReactNode; className?: string }) {
  return (
    <div className={`fit ${className}`} style={{ '--aspect': aspect } as CSSProperties}>
      {children}
    </div>
  );
}

/** Before/after slider: `before` is revealed left of the handle, `after` right of it. */
export function Compare({ before, after, beforeLabel, afterLabel }: { before: ReactNode; after: ReactNode; beforeLabel: string; afterLabel: string }) {
  const [pos, setPos] = useState(0.5);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const update = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    setPos(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  };

  return (
    <div
      ref={ref}
      className="compare"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && update(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <div className="compare__layer">{after}</div>
      <div className="compare__layer" style={{ clipPath: `inset(0 ${(1 - pos) * 100}% 0 0)` }}>
        {before}
      </div>
      <span className="compare__tag compare__tag--left" style={{ opacity: pos > 0.12 ? 1 : 0 }}>
        {beforeLabel}
      </span>
      <span className="compare__tag compare__tag--right" style={{ opacity: pos < 0.88 ? 1 : 0 }}>
        {afterLabel}
      </span>
      <div
        className="compare__handle"
        style={{ left: `${pos * 100}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Comparison position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos * 100)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 0.05));
          if (e.key === 'ArrowRight') setPos((p) => Math.min(1, p + 0.05));
        }}
      >
        <span className="compare__grip">
          <Icon name="arrowLeft" size={12} />
          <Icon name="arrowRight" size={12} />
        </span>
      </div>
    </div>
  );
}

/** Sweeping scan line used while a model is "processing" the image. */
export function Scan({ progress, label }: { progress: number; label: string }) {
  return (
    <>
      <div className="scan" style={{ top: `${progress * 100}%` }} />
      <div className="stage-pill">
        <span className="spinner spinner--sm" />
        {label}
      </div>
    </>
  );
}

export type Device = 'phone' | 'tablet' | 'desktop';

const DEVICE_ASPECT: Record<Device, number> = { phone: 9 / 19.5, tablet: 3 / 4, desktop: 16 / 10 };

/** Rounded device-shaped frame for the live preview. */
export function DeviceFrame({ device, children }: { device: Device; children: ReactNode }) {
  return (
    <FitFrame aspect={DEVICE_ASPECT[device]} className={`device device--${device}`}>
      <div className="device__screen">{children}</div>
    </FitFrame>
  );
}

/** Dims the stage while a model downloads. */
export function DownloadVeil({ model, loaded }: { model: ModelInfo; loaded: number }) {
  return (
    <div className="stage-veil">
      <div className="stage-pill">
        <Icon name="download" size={15} />
        Downloading model · {Math.min(100, Math.round((loaded / (totalMB(model) * 1e6)) * 100))}%
      </div>
    </div>
  );
}
