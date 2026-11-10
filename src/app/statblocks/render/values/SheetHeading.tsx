import React from 'react';
import { cn } from '../../../../utils/cn';

interface SheetHeadingProps {
  children: React.ReactNode;
  /** A smaller heading without a rule, for a break inside a section. */
  minor?: boolean | undefined;
  /** A control at the heading's end, on its line ("Add ability"). It is no part of the heading's name. */
  action?: React.ReactNode;
  /** The heading stands in for a name not given yet (a tile just placed), in the faint text of a blank. */
  placeholder?: boolean | undefined;
}

/**
 * A heading inside the card ("ACTIONS"): a Heading block, or the heading of a
 * Section, Entries, Text or Spells block. The class is the companion theme's,
 * which gives it its heading face.
 */
export function SheetHeading({ children, minor = false, action, placeholder = false }: SheetHeadingProps): React.JSX.Element {
  const className = cn('atlas-sb-section-heading', minor && 'atlas-sb-section-heading--minor', placeholder && 'atlas-sb-placeholder');
  const rule = !minor && <div className="atlas-sb-rule" />;
  if (!action) {
    return (
      <div className={className} role="heading" aria-level={3}>
        {children}
        {rule}
      </div>
    );
  }
  return (
    <div className={className}>
      <div className="atlas-sb-section-heading__row">
        <span role="heading" aria-level={3}>{children}</span>
        {action}
      </div>
      {rule}
    </div>
  );
}
