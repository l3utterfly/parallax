// Inputs that steer the parallax camera: device tilt and an automatic drift.
// Each produces a look offset in -1..1 on both axes; the viewer eases toward it.

export type MotionSource = 'pointer' | 'tilt' | 'drift';
export type TiltAccess = 'granted' | 'denied' | 'unavailable';

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

type OrientationEventCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * Asks for motion-sensor access (iOS shows a prompt, so call this from a tap or
 * click) and checks that orientation data actually arrives. Desktops usually
 * have no sensor and resolve 'unavailable'.
 */
export async function requestTiltAccess(): Promise<TiltAccess> {
  const ctor = (window as Window & { DeviceOrientationEvent?: OrientationEventCtor }).DeviceOrientationEvent;
  if (!ctor) return 'unavailable';
  // Desktop browsers may refuse the permission simply because there's no sensor;
  // with a mouse as the main pointer, report that rather than "blocked".
  const refused = (): TiltAccess => (matchMedia('(pointer: fine)').matches ? 'unavailable' : 'denied');
  if (typeof ctor.requestPermission === 'function') {
    try {
      if ((await ctor.requestPermission()) !== 'granted') return refused();
    } catch {
      return refused();
    }
  }
  return new Promise((resolve) => {
    const finish = (result: TiltAccess) => {
      window.removeEventListener('deviceorientation', onEvent);
      clearTimeout(timer);
      resolve(result);
    };
    const onEvent = (e: DeviceOrientationEvent) => {
      if (e.beta != null && e.gamma != null) finish('granted');
    };
    const timer = setTimeout(() => finish('unavailable'), 1000);
    window.addEventListener('deviceorientation', onEvent);
  });
}

/** Degrees of tilt away from the rest pose that give a full look offset. */
const TILT_RANGE = 18;
/** How quickly the rest pose follows the current pose, per event (keeps any comfortable angle centered). */
const RECENTER = 0.015;

/** Turns device orientation into a look offset relative to a slowly re-centering rest pose. */
export class TiltTracker {
  x = 0;
  y = 0;
  private rest: { x: number; y: number } | null = null;
  private active = false;

  start(): void {
    if (this.active) return;
    this.active = true;
    window.addEventListener('deviceorientation', this.onOrientation);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('deviceorientation', this.onOrientation);
    this.rest = null;
    this.x = this.y = 0;
  }

  private onOrientation = (e: DeviceOrientationEvent): void => {
    if (e.beta == null || e.gamma == null) return;
    // gamma = left/right tilt, beta = front/back tilt, in the device's portrait frame.
    // Rotate them into screen axes so landscape works too.
    const angle = screen.orientation?.angle ?? 0;
    let x = e.gamma;
    let y = e.beta;
    if (angle === 90) [x, y] = [e.beta, -e.gamma];
    else if (angle === 180) [x, y] = [-e.gamma, -e.beta];
    else if (angle === 270 || angle === -90) [x, y] = [-e.beta, e.gamma];

    if (!this.rest) this.rest = { x, y };
    this.rest.x += (x - this.rest.x) * RECENTER;
    this.rest.y += (y - this.rest.y) * RECENTER;
    this.x = clamp((x - this.rest.x) / TILT_RANGE);
    this.y = clamp((y - this.rest.y) / TILT_RANGE);
  };
}

/** A slow, never-repeating sway (two incommensurate sine waves). `t` is in seconds. */
export function drift(t: number): { x: number; y: number } {
  return { x: Math.sin(t * 0.43) * 0.75, y: Math.sin(t * 0.31 + 1.3) * 0.5 };
}
