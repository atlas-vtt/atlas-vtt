import React, { useId } from 'react';

interface FilterSectionProps {
  title: string;
  /** Shown beside the title, e.g. the picked range. */
  summary?: string | undefined;
  /** The filter narrows the list; marks its title. */
  active: boolean;
  /** A control at the header's end, such as the search of an options filter; it may take the summary's place. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** One filter in the filter panel: a title over its controls. */
export function FilterSection({ title, summary, active, action, children }: FilterSectionProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section className={`atlas-filter-section${active ? ' atlas-active' : ''}`} aria-labelledby={titleId}>
      <div className="atlas-filter-section__header">
        <span id={titleId} className="atlas-filter-section__title">{title}</span>
        {summary && <span className="atlas-filter-section__summary">{summary}</span>}
        {action}
      </div>
      {children}
    </section>
  );
}
