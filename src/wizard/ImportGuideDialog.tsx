import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

const shot = (n: number) => `${import.meta.env.BASE_URL}tutorials/import/${n}.jpg`;

interface Step {
  title: string;
  text: string;
  image?: { src: string; alt: string };
}

const STEPS: Step[] = [
  {
    title: 'Add an animated background',
    text: 'Open your character in Layla, go to the Appearance tab, and tap Add under Animated Background.',
    image: { src: shot(1), alt: "Layla's Create Character screen, Appearance tab, with the Animated Background section" },
  },
  {
    title: 'Choose the type "Mini-app"',
    text: 'When Layla asks for a background type, pick Mini-app. That is the format your scene was saved in.',
    image: { src: shot(2), alt: 'The background type picker with Mini-app among the options' },
  },
  {
    title: 'Import the scene',
    text: 'Tap Import Custom Mini-app and choose the .zip you just saved. Next time, it is already in the list.',
    image: { src: shot(3), alt: 'The Choose a Custom Mini-app sheet with Import Custom Mini-app at the top' },
  },
  {
    title: 'Save and chat',
    text: 'Save the character and start chatting. Your character now sits in front of the scene, which moves as you look around.',
  },
];

interface Props {
  /** The file that was just saved, if the guide opened after a save. */
  filename?: string;
  onClose: () => void;
}

/** Explains how to use a saved scene as a character's animated background in Layla. */
export function ImportGuideDialog({ filename, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog dialog--guide"
      aria-labelledby="import-guide-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog__head">
        <h2 id="import-guide-title">Use your scene in Layla</h2>
        <button type="button" className="btn btn--ghost btn--icon btn--small" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="dialog__body">
        <p>
          {filename ? (
            <>
              Your scene was saved as <strong>{filename}</strong>, a Layla mini-app.
            </>
          ) : (
            'Save scene creates a Layla mini-app (.zip).'
          )}{' '}
          Set it as a character's animated background:
        </p>
        <ol className="guide">
          {STEPS.map((step, i) => (
            <li key={step.title} className="guide__step">
              <span className="guide__num" aria-hidden="true">
                {i + 1}
              </span>
              <div className="guide__content">
                <strong>{step.title}</strong>
                <p>{step.text}</p>
                {step.image && <img src={step.image.src} alt={step.image.alt} loading="lazy" />}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="dialog__foot">
        <button type="button" className="btn btn--primary btn--wide" onClick={onClose}>
          Got it
        </button>
      </div>
    </dialog>
  );
}
