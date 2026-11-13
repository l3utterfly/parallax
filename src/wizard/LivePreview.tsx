import { Viewer } from '../components/Viewer';
import type { ViewerSettings } from '../parallax/ParallaxViewer';
import type { PreparedAssets } from '../parallax/prepare';
import { DeviceFrame, type Device } from './Stage';

/** The real parallax viewer inside a device frame, with a loading state until the layers are built. */
export function LivePreview({ device, assets, settings }: { device: Device; assets: PreparedAssets | null; settings: ViewerSettings }) {
  return (
    <DeviceFrame device={device}>
      <Viewer assets={assets} settings={settings} />
      {!assets && (
        <div className="stage-veil">
          <div className="stage-pill">
            <span className="spinner spinner--sm" />
            Building layers…
          </div>
        </div>
      )}
      {device === 'phone' && <span className="device__island" />}
    </DeviceFrame>
  );
}
