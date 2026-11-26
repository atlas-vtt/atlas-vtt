import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface PaneMessageProps {
  icon: LucideIcon;
  title: string;
  /** A sentence under the title. */
  hint?: React.ReactNode;
  /** The one thing to do about it: a button, or an offer. */
  action?: React.ReactNode;
}

/** What the content pane says in place of cards: an empty tab, a filter that matched nothing, a load that failed. */
export function PaneMessage({ icon: Icon, title, hint, action }: PaneMessageProps): React.JSX.Element {
  return (
    <>
      <Icon className="atlas-empty-icon" aria-hidden="true" />
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </>
  );
}
