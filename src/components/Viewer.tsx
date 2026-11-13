import { useEffect, useRef } from 'react';
import { ParallaxViewer, type ViewerSettings } from '../parallax/ParallaxViewer';
import type { PreparedAssets } from '../parallax/prepare';

interface Props {
  assets: PreparedAssets | null;
  settings: ViewerSettings;
}

export function Viewer({ assets, settings }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const viewer = useRef<ParallaxViewer | null>(null);

  useEffect(() => {
    const v = new ParallaxViewer(ref.current!);
    viewer.current = v;
    return () => {
      v.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    viewer.current?.setAssets(assets);
  }, [assets]);

  useEffect(() => {
    viewer.current?.setSettings(settings);
  }, [settings]);

  return <div ref={ref} className="viewer__canvas" />;
}
