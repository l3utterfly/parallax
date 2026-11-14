// Inputs that steer the parallax camera: device tilt and an automatic drift.
// Each produces a look offset in -1..1 on both axes; the viewer eases toward it.
//
// Tilt uses DeviceOrientationEvent, which every mobile browser supports, but
// only on a secure origin (HTTPS or localhost), and on iOS only after
// DeviceOrientationEvent.requestPermission() is called from a tap. Phones with a
// gyroscope fire 'deviceorientation'; some without one (accelerometer + compass
// only) fire just 'deviceorientationabsolute', so both are used.

export type MotionSource = 'pointer' | 'tilt' | 'drift';

export type TiltAccess =
  /** Orientation data is arriving. */
  | 'granted'
  /** The user or the browser refused motion access. */
  | 'denied'
  /** No orientation data arrived: no usable sensor. */
  | 'unavailable'
  /** The page isn't on HTTPS or localhost, so the browser never sends sensor data. */
  | 'insecure';

const ORIENTATION_EVENTS = ['deviceorientation', 'deviceorientationabsolute'] as const;
/** How long to wait for the first reading before deciding there is no sensor. */
const PROBE_MS = 1500;

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

type OrientationEventCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** True when the main pointer is a mouse or trackpad, i.e. most likely a desktop. */
const isDesktop = () => matchMedia('(pointer: fine)').matches;

/** Chromium exposes sensor permissions; a 'denied' there means site settings block motion. */
async function sensorsBlocked(): Promise<boolean> {
  if (!navigator.permissions) return false;
  const query = (name: string) =>
    navigator.permissions.query({ name: name as PermissionName }).then(
      (s) => s.state === 'denied',
      () => false, // Firefox and Safari don't know these permission names.
    );
  const results = await Promise.all([query('accelerometer'), query('gyroscope')]);
  return results.some(Boolean);
}

/** Starts listening for orientation readings; `wait(ms)` resolves true once one with data has arrived. */
function listenForReading() {
  let seen = false;
  let notify: (() => void) | null = null;
  const onEvent = (e: Event) => {
    const o = e as DeviceOrientationEvent;
    if (o.beta == null || o.gamma == null) return;
    seen = true;
    notify?.();
  };
  for (const type of ORIENTATION_EVENTS) window.addEventListener(type, onEvent);
  const stop = () => {
    for (const type of ORIENTATION_EVENTS) window.removeEventListener(type, onEvent);
  };
  const wait = (ms: number) =>
    new Promise<boolean>((resolve) => {
      if (seen) return resolve(true);
      const timer = setTimeout(() => resolve(seen), ms);
      notify = () => {
        clearTimeout(timer);
        resolve(true);
      };
    }).finally(stop);
  return { wait };
}

/**
 * Asks for motion-sensor access and checks that orientation data actually
 * arrives. iOS shows its prompt only when this runs inside a tap or click, so
 * call it straight from the handler (before any other await).
 *
 * Actual readings decide the result. Permission answers only pick the message
 * when nothing arrives, because WebView hosts can report "denied" through the
 * permission APIs and still deliver events (Android WebView always delivers).
 */
export async function requestTiltAccess(): Promise<TiltAccess> {
  if (!window.isSecureContext) return 'insecure';
  const ctor = (window as Window & { DeviceOrientationEvent?: OrientationEventCtor }).DeviceOrientationEvent;
  if (!ctor) return 'unavailable';

  const reading = listenForReading();
  let refused = false;
  // Must be the first await, so iOS still sees the user gesture.
  if (typeof ctor.requestPermission === 'function') {
    try {
      refused = (await ctor.requestPermission()) !== 'granted';
    } catch {
      refused = true;
    }
  }
  // The wait starts after the prompt is answered, however long the user takes.
  if (await reading.wait(PROBE_MS)) return 'granted';
  if (refused || (await sensorsBlocked())) {
    // Desktop browsers may refuse simply because there's no sensor; report that rather than "blocked".
    return isDesktop() ? 'unavailable' : 'denied';
  }
  return 'unavailable';
}

/** True when the browser only sends orientation data after a tap-triggered permission prompt (iOS). */
export function tiltNeedsTap(): boolean {
  const ctor = (window as Window & { DeviceOrientationEvent?: OrientationEventCtor }).DeviceOrientationEvent;
  return typeof ctor?.requestPermission === 'function';
}

/**
 * Guesses, without prompting, whether this device can drive the scene by tilt.
 * Where data flows freely (Android, Chromium) it waits for a real reading. On
 * iOS nothing arrives before the permission tap, so a touch screen is taken as
 * the sign of a phone or tablet with a gyroscope.
 */
export async function probeTilt(): Promise<boolean> {
  if (!window.isSecureContext || !('DeviceOrientationEvent' in window)) return false;
  if (tiltNeedsTap()) return !isDesktop();
  return listenForReading().wait(PROBE_MS);
}

/** Device rotation relative to its natural portrait orientation, in degrees (0, 90, 180, 270). */
function screenAngle(): number {
  // iOS before 16.4 has no screen.orientation, only the older window.orientation (-90..180).
  const angle = screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0;
  return ((angle % 360) + 360) % 360;
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
  /** Set once relative readings arrive; absolute ones are then ignored so the two don't fight. */
  private relative = false;

  start(): void {
    if (this.active) return;
    this.active = true;
    for (const type of ORIENTATION_EVENTS) window.addEventListener(type, this.onOrientation);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    for (const type of ORIENTATION_EVENTS) window.removeEventListener(type, this.onOrientation);
    this.rest = null;
    this.relative = false;
    this.x = this.y = 0;
  }

  private onOrientation = (event: Event): void => {
    const e = event as DeviceOrientationEvent;
    if (e.beta == null || e.gamma == null) return;
    if (e.type === 'deviceorientation') this.relative = true;
    else if (this.relative) return;

    // gamma = left/right tilt, beta = front/back tilt, in the device's portrait frame.
    // Rotate them into screen axes so landscape works too.
    const angle = screenAngle();
    let x = e.gamma;
    let y = e.beta;
    if (angle === 90) [x, y] = [e.beta, -e.gamma];
    else if (angle === 180) [x, y] = [-e.gamma, -e.beta];
    else if (angle === 270) [x, y] = [-e.beta, e.gamma];

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
