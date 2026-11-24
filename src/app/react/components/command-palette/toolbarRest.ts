/**
 * Where the toolbar stands once it has shown or hidden (Show toolbar on hover, `chrome-auto-hide.scss`), read while it
 * is still moving there: the palette above it moves to its place at once and on its own spring, instead of following
 * every frame of the toolbar's translate, scale and fade.
 */

interface Box {
  left: number;
  top: number;
  width: number;
  bottom: number;
}

function px(value: string, at: number): number {
  const part = value.split(' ')[at];
  return part === undefined ? 0 : Number.parseFloat(part) || 0;
}

/** The toolbar's box in the viewport without the translate and scale it shows and hides with. */
export function restingToolbarBox(toolbar: HTMLElement): Box {
  const rect = toolbar.getBoundingClientRect();
  const style = toolbar.win.getComputedStyle(toolbar);
  const scale = style.scale === 'none' ? 1 : px(style.scale, 0) || 1;
  const translate = style.translate === 'none' ? '' : style.translate;
  // A point at `o` from the box's corner moves to corner + o + scale × (p − corner − o) + translate.
  const left = rect.left - px(style.transformOrigin, 0) * (1 - scale) - px(translate, 0);
  const top = rect.top - px(style.transformOrigin, 1) * (1 - scale) - px(translate, 1);
  return { left, top, width: rect.width / scale, bottom: top + rect.height / scale };
}

function runningTransition(toolbar: HTMLElement, property: string): CSSTransition | undefined {
  if (typeof toolbar.getAnimations !== 'function') return undefined;
  return toolbar.getAnimations().find((animation): animation is CSSTransition =>
    'transitionProperty' in animation && (animation as CSSTransition).transitionProperty === property);
}

/** Whether the toolbar is hidden, or will be once its hide ends: `visibility` changes only at the end of one. */
export function toolbarWillBeHidden(toolbar: HTMLElement): boolean {
  const effect = runningTransition(toolbar, 'visibility')?.effect;
  const keyframes = effect && 'getKeyframes' in effect ? (effect as KeyframeEffect).getKeyframes() : undefined;
  const end = keyframes?.[keyframes.length - 1]?.visibility;
  return (typeof end === 'string' ? end : toolbar.win.getComputedStyle(toolbar).visibility) === 'hidden';
}

/** Seconds until the toolbar starts to move: a hide waits a moment for the pointer to come back. */
export function toolbarMoveDelay(toolbar: HTMLElement): number {
  const move = runningTransition(toolbar, 'translate');
  if (!move) return 0;
  const delay = Number(move.effect?.getTiming().delay ?? 0);
  const elapsed = typeof move.currentTime === 'number' ? move.currentTime : 0;
  return Math.max(0, delay - elapsed) / 1000;
}
