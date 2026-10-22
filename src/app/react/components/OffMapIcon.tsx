import React from 'react';

/**
 * A token standing beside the map: a filled disc left of a map outline. It marks a combatant kept
 * beside the map without the stroke of the hidden badge's crossed-out eye, so the two never read as
 * one. Drawn on Lucide's 24 px grid and sized by the surrounding CSS like the Lucide icons next to it.
 */
export function OffMapIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="11" y="3" width="11" height="18" rx="2" />
      <path d="M11 9h11M11 15h11" strokeWidth={1.5} />
      <circle cx="5" cy="12" r="3.5" fill="currentColor" />
    </svg>
  );
}
