import { useLayoutEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../utils/motion';

/** How long the cards take to pile up as a side is lifted, and to spread out again where it is let go. */
const PILE_MS = 320;
const PILE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** Where a card stood in its side (its `translate` included), and how it was turned and faded. */
interface Drawn {
  x: number;
  y: number;
  rotate: string;
  opacity: string;
}

function translationOf(style: CSSStyleDeclaration): { x: number; y: number } {
  const [x = '0', y = '0'] = (style.translate || 'none') === 'none' ? [] : style.translate.split(' ');
  return { x: parseFloat(x) || 0, y: parseFloat(y) || 0 };
}

function styleOf(element: HTMLElement): CSSStyleDeclaration | null {
  return element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
}

function cardsOf(side: HTMLElement): HTMLElement[] {
  return [...side.querySelectorAll<HTMLElement>(':scope > .atlas-initiative-card')];
}

function drawn(card: HTMLElement): Drawn {
  const style = styleOf(card);
  const moved = style ? translationOf(style) : { x: 0, y: 0 };
  return {
    x: card.offsetLeft + moved.x,
    y: card.offsetTop + moved.y,
    rotate: !style || style.rotate === 'none' ? '0deg' : style.rotate,
    opacity: style?.opacity ?? '1',
  };
}

/**
 * A side held by its heading piles its cards up behind its first, as a phone stacks what it carries, so a side of
 * twenty is carried like one card; let go, they spread out into the side again. The pile itself is the stylesheet's
 * (the held side's cards share one place); this moves the cards between their places. Call the returned function with
 * the side as it is pressed and as it is let go. Where the drop changed the order the cards already glide to their new
 * places (`useTurnMotion`, from where the pile was), and this leaves them to it. The side must be the cards'
 * `offsetParent`.
 */
export function useSidePile(held: boolean): (side: HTMLElement | null) => void {
  const side = useRef<HTMLElement | null>(null);
  const cards = useRef(new Map<HTMLElement, Drawn>());
  const sideMoved = useRef({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const element = side.current;
    if (!element || typeof element.animate !== 'function' || prefersReducedMotion(element)) return;
    const now = cardsOf(element);
    if (!held && now.some((card) => card.getAnimations().length > 0)) return;
    for (const card of now) {
      const was = cards.current.get(card);
      if (!was) continue;
      card.animate(
        [{ translate: `${was.x - card.offsetLeft}px ${was.y - card.offsetTop}px`, rotate: was.rotate, opacity: was.opacity, offset: 0 }],
        { duration: PILE_MS, easing: PILE_EASING, fill: 'backwards' },
      );
    }
    // Let go where it was lifted, the side itself comes home from where the pointer left it
    const { x, y } = sideMoved.current;
    if (!held && Math.hypot(x, y) >= 0.5) {
      element.animate([{ translate: `${x}px ${y}px`, offset: 0 }], { duration: PILE_MS, easing: PILE_EASING, fill: 'backwards' });
    }
  }, [held]);

  return (element) => {
    side.current = element;
    cards.current = new Map(element ? cardsOf(element).map((card) => [card, drawn(card)]) : []);
    const style = element ? styleOf(element) : null;
    sideMoved.current = style ? translationOf(style) : { x: 0, y: 0 };
  };
}
