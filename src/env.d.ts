interface ImportMetaEnv {
  /** Base URL for the withoutBG ONNX files, e.g. `/scripts/withoutBG/` to serve the local copies in dev. */
  readonly VITE_WITHOUTBG_BASE_URL?: string;
  /** Base URL for the Depth Anything V2 Small ONNX file (`model.onnx`). */
  readonly VITE_DEPTH_BASE_URL?: string;
}

/** The standalone scene player as one self-contained script (built by the parallax-player plugin in vite.config.ts). */
declare module 'virtual:parallax-player' {
  const code: string;
  export default code;
}
