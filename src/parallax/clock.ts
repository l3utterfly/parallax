import * as THREE from 'three';

/** Lock-screen style clock drawn to a canvas texture (aspect 2:1). */
export class ClockTexture {
  readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
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

  update(force = false): void {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
    const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
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
    ctx.font = `600 58px ${font}`;
    ctx.fillText(date, w / 2, 96);
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
