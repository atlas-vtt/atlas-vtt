import React from 'react';
import { useGridAnnouncement } from '../hooks/useGridAnnouncement';
import type { GridResults } from '../utils/gridAnnouncement';

interface GridAnnouncerProps {
  /** Selected assets and folders together. */
  selectionCount: number;
  /** What the grid lists; null while it lists another place's assets. */
  results: GridResults | null;
}

/**
 * Tells screen readers how many items are selected and how many a search or filters leave: a polite live region
 * outside the panes that swap, so it stays mounted and each change is read once. Nothing is shown.
 */
export function GridAnnouncer({ selectionCount, results }: GridAnnouncerProps): React.JSX.Element {
  const text = useGridAnnouncement(selectionCount, results);
  return (
    <div className="atlas-am-announcer" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
