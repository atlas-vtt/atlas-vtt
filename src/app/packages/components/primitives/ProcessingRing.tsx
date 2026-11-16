import React from 'react';
import './processing-ring.scss';

/**
 * A small ring that fills with `percent` from the top, in the theme's accent: how far a map image
 * being processed has come. Decorative; whoever shows it names the progress in words.
 */
export function ProcessingRing({ percent }: { percent: number }): React.JSX.Element {
  return (
    <svg className="atlas-processing-ring" viewBox="0 0 16 16" aria-hidden="true">
      <circle className="atlas-processing-ring__track" cx="8" cy="8" r="6" />
      <circle
        className="atlas-processing-ring__fill"
        cx="8"
        cy="8"
        r="6"
        pathLength={100}
        strokeDasharray="100"
        strokeDashoffset={100 - percent}
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}
