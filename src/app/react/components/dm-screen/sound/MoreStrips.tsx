import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { t } from '../../../../i18n';

/** A page of the row at a time, so the strip at its edge stays in view as a landmark. */
const PAGE_SHARE = 0.8;

/** Says how many strips lie out of view on one side of the desk, and scrolls to them. */
export function MoreStrips({ row, side, count }: { row: React.RefObject<HTMLElement | null>; side: 'start' | 'end'; count: number }): React.JSX.Element | null {
  if (count === 0) return null;
  const Icon = side === 'start' ? ChevronLeft : ChevronRight;
  const scroll = (): void => {
    const element = row.current;
    if (!element) return;
    const reduced = element.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
    element.scrollBy({ left: (side === 'start' ? -1 : 1) * element.clientWidth * PAGE_SHARE, behavior: reduced ? 'auto' : 'smooth' });
  };
  return (
    <button type="button" className="atlas-sound-more-strips" data-side={side} aria-label={t('audio.moreStripsLabel', { count })} onClick={scroll}>
      <Icon aria-hidden="true" />
      <span>{t('audio.moreStrips', { count })}</span>
    </button>
  );
}
