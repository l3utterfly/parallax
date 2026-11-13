import type { ReactNode } from 'react';

interface Props {
  stage: ReactNode;
  stageTop?: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
  footer: ReactNode;
}

/** Two-pane layout shared by every step: the stage (image or preview) and the side panel. */
export function StepLayout({ stage, stageTop, eyebrow, title, description, children, footer }: Props) {
  return (
    <div className="workspace">
      <section className="stage">
        {stageTop && <div className="stage__top">{stageTop}</div>}
        <div className="stage__area">{stage}</div>
      </section>
      <aside className="panel">
        <div className="panel__body">
          <header className="panel__head">
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          {children}
        </div>
        <footer className="panel__footer">{footer}</footer>
      </aside>
    </div>
  );
}
