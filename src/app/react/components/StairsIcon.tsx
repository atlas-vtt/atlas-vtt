import React from 'react';

interface StairsIconProps {
  className?: string;
  /** Square box in pixels, like lucide's `size`; CSS may size it instead. */
  size?: number;
}

/**
 * A flight of steps rising to the right, drawn like a lucide icon (24 px box, 2 px round strokes):
 * the stairs tool, and the badge stairs show on the map.
 */
export function StairsIcon({ className, size = 24 }: StairsIconProps): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 20h5v-5h5v-5h5V5h3" />
    </svg>
  );
}
