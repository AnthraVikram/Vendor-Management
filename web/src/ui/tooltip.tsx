import { cloneElement, ReactElement, useId } from 'react';

// Names an icon-only control on hover and keyboard focus (Feature 005 FR-040). The control keeps its own accessible
// name; the tooltip only describes it, and CSS shows it, so nothing depends on hovering.
export function Tooltip({ label, children }: { label: string; children: ReactElement<{ 'aria-describedby'?: string }> }) {
  const id = useId();
  return (
    <span className="tooltip-host">
      {cloneElement(children, { 'aria-describedby': id })}
      <span role="tooltip" id={id} className="tooltip">{label}</span>
    </span>
  );
}
