import React, { useRef, useState } from 'react';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';

interface CutTooltipProps {
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  /** What the tooltip says, or null where nothing is hidden; by default the text while its line cuts it. */
  wholeOf?: (element: HTMLElement) => string | null;
}

/** Whether a line cuts its own text (an ellipsis). */
export function isCut(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth + 1;
}

function cutText(element: HTMLElement): string | null {
  return isCut(element) ? (element.textContent ?? '') : null;
}

/**
 * The whole of a text that its line cuts (an ellipsis), in a tooltip, and only while it is cut: the tooltip asks as it
 * is about to open, so a name that fits never shows one, and a name written into the element later (the music card's
 * title) is read as it stands then.
 */
export function CutTooltip({ children, wholeOf = cutText }: CutTooltipProps): React.JSX.Element {
  const element = useRef<HTMLElement | null>(null);
  const [whole, setWhole] = useState('');
  const isCut = (): boolean => {
    const shown = element.current && wholeOf(element.current);
    if (!shown) return false;
    setWhole(shown);
    return true;
  };
  return (
    <LabelTooltip label={whole} opensWhen={isCut} describe>
      {React.cloneElement(children, { onPointerEnter: (event: React.PointerEvent<HTMLElement>) => { element.current = event.currentTarget; } })}
    </LabelTooltip>
  );
}
