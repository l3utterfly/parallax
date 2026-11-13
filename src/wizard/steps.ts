export type StepId = 'image' | 'depth' | 'configure' | 'result';

export const STEPS: { id: StepId; label: string; sub: string }[] = [
  { id: 'image', label: 'Character', sub: 'Cut out' },
  { id: 'depth', label: 'Depth', sub: 'Depth map' },
  { id: 'configure', label: 'Configure', sub: 'Motion & clock' },
  { id: 'result', label: 'Result', sub: 'Preview' },
];

export const stepIndex = (id: StepId) => STEPS.findIndex((s) => s.id === id);
