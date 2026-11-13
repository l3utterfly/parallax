export interface SourceImage {
  url: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  /** True for the bundled sample, whose URL must not be revoked. */
  sample: boolean;
}

export type MotionSource = 'pointer' | 'tilt' | 'drift';
export type ClockFormat = '12h' | '24h';

/** Options that only exist in the UI for now; the viewer doesn't read them yet. */
export interface ExtraSettings {
  motionSource: MotionSource;
  clockFormat: ClockFormat;
  showDate: boolean;
}

export const DEFAULT_EXTRAS: ExtraSettings = { motionSource: 'pointer', clockFormat: '12h', showDate: true };

export const formatBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
