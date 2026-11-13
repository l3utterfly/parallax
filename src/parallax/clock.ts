import * as THREE from 'three';

export type ClockFormat = '12h' | '24h';

export interface ClockOptions {
  format: ClockFormat;
  showDate: boolean;
}

/**
 * The time as "9:41" (12h) or "21:41" (24h), in the user's locale but without
 * an AM/PM marker. Taken from the hour..minute parts, so locales that put the
 * marker first or use another separator ("9.41") still work.
 */
function formatTime(now: Date, format: ClockFormat): string {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: format === '24h' ? '2-digit' : 'numeric',
    minute: '2-digit',
    hourCycle: format === '24h' ? 'h23' : 'h12',
  }).formatToParts(now);
  const from = parts.findIndex((p) => p.type === 'hour');
  const to = parts.findIndex((p) => p.type === 'minute');
  return parts
    .slice(from, to + 1)
    .map((p) => p.value)
    .join('');
}

/** Lock-screen style clock drawn to a canvas texture (aspect 2:1). */
export class ClockTexture {
  readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private options: ClockOptions = { format: '12h', showDate: true };
  private lastKey = '';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.premultiplyAlpha = true;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.update(true);
  }

  /** Redraws right away if the options changed. */
  configure(options: ClockOptions): void {
    if (options.format === this.options.format && options.showDate === this.options.showDate) return;
    this.options = { ...options };
    this.update(true);
  }

  update(force = false): void {
    const now = new Date();
    const { format, showDate } = this.options;
    const time = formatTime(now, format);
    const date = showDate ? now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : '';
    const key = time + date;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;

    const ctx = this.canvas.getContext('2d')!;
    const { width: w, height: h } = this.canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 12;
    const font = '"SF Pro Display", -apple-system, "Segoe UI Variable Display", "Segoe UI", Roboto, system-ui, sans-serif';
    if (date) {
      ctx.font = `600 58px ${font}`;
      ctx.fillText(date, w / 2, 96);
    }
    ctx.font = `700 330px ${font}`;
    const metrics = ctx.measureText(time);
    const fit = Math.min(1, (w * 0.96) / metrics.width);
    ctx.save();
    ctx.translate(w / 2, 440);
    ctx.scale(fit, 1);
    ctx.fillText(time, 0, 0);
    ctx.restore();
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
