import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SectionHeaderProps {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  /** Shown at the row's end, beside the toggle rather than inside it. */
  end?: React.ReactNode;
}

/** The title of a section of the content, which folds the section away. */
export function SectionHeader({ title, count, collapsed, onToggle, end }: SectionHeaderProps): React.JSX.Element {
  return (
    <div className="atlas-section-header-row">
      <div
        className="atlas-section-header"
        onClick={onToggle}
        role="button"
        aria-expanded={!collapsed}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
      >
        <ChevronDown className={`atlas-chevron ${collapsed ? 'atlas-collapsed' : ''}`} />
        <h3>{title}</h3>
        <span className="atlas-section-count">{count}</span>
      </div>
      {end}
    </div>
  );
}
