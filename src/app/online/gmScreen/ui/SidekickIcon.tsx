import React from 'react';
import { cn } from '../../../../utils/cn';
import SIDEKICK_ICON_URL from '../../../assets/brand/sidekick-icon.webp?inline';

/** Sidekick's app icon, a square tile without corners of its own: each place rounds it to suit its size. */
export const SIDEKICK_ICON = SIDEKICK_ICON_URL;

/** The icon beside Sidekick's name: decoration, since the name stands beside it. */
export function SidekickIcon({ className }: { className?: string }): React.JSX.Element {
  return <img className={cn('atlas-sidekick-icon', className)} src={SIDEKICK_ICON} alt="" aria-hidden="true" draggable={false} />;
}
