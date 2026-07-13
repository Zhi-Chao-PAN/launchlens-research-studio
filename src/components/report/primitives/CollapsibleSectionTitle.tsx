import type { FocusEventHandler, MouseEventHandler, ReactNode } from "react";

interface CollapsibleSectionTitleProps {
  children: ReactNode;
  controls: string;
  expanded: boolean;
  onToggle: () => void;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
  onMouseEnter?: MouseEventHandler<HTMLButtonElement>;
}

/** A semantic heading whose disclosure action remains keyboard accessible. */
export function CollapsibleSectionTitle({
  children,
  controls,
  expanded,
  onToggle,
  onFocus,
  onMouseEnter,
}: CollapsibleSectionTitleProps) {
  return (
    <h2 className="research-section-title collapsible">
      <button
        type="button"
        className="research-section-toggle"
        aria-expanded={expanded}
        aria-controls={controls}
        onClick={onToggle}
        onFocus={onFocus}
        onMouseEnter={onMouseEnter}
      >
        <span className="research-section-collapse-icon" aria-hidden>
          {expanded ? "\u25BE" : "\u25B8"}
        </span>
        <span>{children}</span>
      </button>
    </h2>
  );
}
