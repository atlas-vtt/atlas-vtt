import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { t } from '../../../../i18n';

interface CardMoreButtonProps {
  /** Opens the card's menu, the one a right-click opens, hanging from this button. */
  onOpen: (button: HTMLElement) => void;
}

/**
 * A card's ⋯ button (decision #20): the right-click menu for the pointer and for touch, which has no right-click.
 * It stands beside the card's option, never inside it (an option holds no control: axe `nested-interactive`), over
 * the corner of its art, and is shown on hover, focus and selection, always under a coarse pointer. It is for the
 * pointer, as the art well's other controls: hidden from assistive tech and out of the tab order, since the focused
 * card opens the same menu with Shift+F10 or the menu key.
 */
export function CardMoreButton({ onOpen }: CardMoreButtonProps): React.JSX.Element {
  const stop = (event: React.SyntheticEvent): void => event.stopPropagation();
  return (
    <div className="atlas-asset-card-actions" aria-hidden="true">
      <LabelTooltip label={t('am.card.more')} shortcut="Shift+F10">
        <Button
          variant="ghost"
          size="icon"
          className="atlas-asset-card-more"
          tabIndex={-1}
          // A press keeps focus where it is (on the card): the button is not a stop of its own.
          onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onClick={(event) => { event.stopPropagation(); onOpen(event.currentTarget); }}
          onDoubleClick={stop}
          onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onOpen(event.currentTarget); }}
        >
          <MoreHorizontal />
        </Button>
      </LabelTooltip>
    </div>
  );
}
