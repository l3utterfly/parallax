import { useEffect, useRef, useState } from 'react';
import { canReachDownloadHosts, DOWNLOAD_HOSTS } from '../ml/hostCheck';
import { Icon } from './Icon';

const SCREENSHOT = `${import.meta.env.BASE_URL}tutorials/mini-app-permissions.jpg`;

interface Props {
  onClose: () => void;
}

/** Shown when Layla's Mini-app permissions block the model downloads. */
export function PermissionsDialog({ onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [checking, setChecking] = useState(false);
  const [stillBlocked, setStillBlocked] = useState(false);

  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const recheck = async () => {
    setChecking(true);
    const ok = await canReachDownloadHosts();
    setChecking(false);
    if (ok) onClose();
    else setStillBlocked(true);
  };

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="permissions-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog__head">
        <h2 id="permissions-title">Allow model downloads</h2>
        <button type="button" className="btn btn--ghost btn--icon btn--small" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="dialog__body">
        <p>
          Parallax downloads its AI models from Hugging Face, and Layla is blocking those sites. Open Layla's{' '}
          <strong>Mini-app Settings</strong> and add these sites under <strong>Mini-app permissions</strong>:
        </p>
        <ul className="dialog__hosts">
          {DOWNLOAD_HOSTS.map((host) => (
            <li key={host}>
              <code>{host}</code>
            </li>
          ))}
        </ul>
        <figure className="dialog__shot">
          <img src={SCREENSHOT} alt="Layla's Mini-app permissions screen with huggingface.co, *.huggingface.co and *.hf.co added" />
          <figcaption>Mini-app permissions with the sites added.</figcaption>
        </figure>
        {stillBlocked && (
          <p className="dialog__warn" role="status">
            Still blocked. If you have added the sites, close Parallax and open it again.
          </p>
        )}
      </div>
      <div className="dialog__foot">
        <button type="button" className="btn btn--ghost btn--wide" onClick={onClose}>
          Not now
        </button>
        <button type="button" className="btn btn--primary btn--wide" disabled={checking} onClick={recheck}>
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>
    </dialog>
  );
}
