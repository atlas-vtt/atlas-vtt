import React from 'react';
import { WIDGET_ICON_VIEW_BOX } from '../../types/widgetIcons';

interface GameIconProps {
  /** A game-icons.net silhouette on the 512×512 canvas (`WIDGET_ICON_VIEW_BOX`). */
  path: string;
  className?: string;
  /** Square box in pixels, like lucide's `size`; CSS may size it instead. */
  size?: number;
}

/** A game-icons.net glyph in `currentColor`, sized like the lucide icons beside it. */
export function GameIcon({ path, className, size = 24 }: GameIconProps): React.ReactElement {
  return (
    <svg viewBox={WIDGET_ICON_VIEW_BOX} width={size} height={size} fill="currentColor" className={className} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
