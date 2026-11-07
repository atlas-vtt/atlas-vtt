/** Marks a card of the feed for a moment (`data-flash`, animated in CSS), anew even while it still shows the last one. */
export function flashCard(card: HTMLElement): void {
  card.removeAttribute('data-flash');
  // Reading the layout restarts the animation the attribute starts.
  void card.offsetWidth;
  card.setAttribute('data-flash', '');
  card.addEventListener('animationend', () => card.removeAttribute('data-flash'), { once: true });
}
