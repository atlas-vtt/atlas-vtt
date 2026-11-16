const MARGIN = 10;
const OFFSET = 12;

/** Places a hover card beside the pointer at (x, y), below and right where it has room, else flipped, inside its window. */
export function placeHoverCard(card: HTMLElement, x: number, y: number): void {
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  let left = x + OFFSET;
  let top = y + OFFSET;
  if (left + width > card.win.innerWidth - MARGIN) left = x - width - OFFSET;
  if (top + height > card.win.innerHeight - MARGIN) top = y - height - OFFSET;
  card.style.left = `${Math.max(MARGIN, left)}px`;
  card.style.top = `${Math.max(MARGIN, top)}px`;
}
