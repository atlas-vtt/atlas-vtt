import { frame, type Variants } from 'framer-motion';

/** `variants` whose exit lets clicks pass through from its first frame, as they would once the element is gone. */
export function passThroughOnExit(variants: Variants): Variants {
  const exit = variants.exit;
  if (!exit || typeof exit === 'function') return variants;
  return { ...variants, exit: { ...exit, pointerEvents: 'none' } };
}

/** The values Motion animates on the compositor, whose end it writes to the element only once the animation is gone. */
const COMPOSITED = ['opacity', 'transform'] as const;

/** Frames `holdShownStyle` waits for the animations to start before it leaves the style to Motion. */
const START_FRAMES = 4;

/** Where the element's running animations end, per property (the last keyframe's value). */
function animationEnds(node: HTMLElement): Map<string, string> {
  const ends = new Map<string, string>();
  for (const animation of node.getAnimations()) {
    if (!(animation.effect instanceof KeyframeEffect)) continue;
    const last = animation.effect.getKeyframes().at(-1);
    for (const [key, value] of Object.entries(last ?? {})) if (typeof value === 'string' || typeof value === 'number') ends.set(key, String(value));
  }
  return ends;
}

/** What `holdShownStyle` gives the element: the start of its hold, and the hold written again at once. */
export interface ShownStyleHold {
  /** The element's `onAnimationStart`. */
  onAnimationStart: () => void;
  /**
   * Writes the end values again where animations towards them run, for after each render: Motion writes its stopped
   * values back into the style after every commit of the element, which showed until the next frame's hold (a window
   * that opened in several commits read its start values in three frames).
   */
  reapply: () => void;
}

/**
 * Keeps the end values of the `shown` variant in the element's own style while animations towards them run. Motion
 * runs opacity and transform as Web Animations (`fill: both`, so the style beneath shows nothing while they run) and,
 * when one ends, cancels it before it renders the end value; until then the style still held where an interrupted
 * animation stopped (a window reopened 90 ms into its exit read 0.05 for a frame after it had faded in). Written after
 * each of Motion's renders, so its own writes of the stopped values never last; an animation heading elsewhere (an
 * exit, which must leave its own value when cut short) is left alone.
 */
export function holdShownStyle(element: () => HTMLElement | null, variants: Variants, shown: string): ShownStyleHold {
  const target = variants[shown];
  const values = !target || typeof target === 'function' ? [] : COMPOSITED.flatMap((key) => {
    const value = target[key];
    return typeof value === 'string' || typeof value === 'number' ? [[key, String(value)] as const] : [];
  });
  /** Writes the end values when the running animations head for them; whether they did, and whether any ran. */
  const write = (node: HTMLElement): { held: boolean; running: boolean } => {
    const ends = animationEnds(node);
    // Written only under the animations, which may start a frame later: written before, the end values would show.
    const held = values.length > 0 && values.every(([key, value]) => ends.get(key) === value);
    if (held) for (const [key, value] of values) node.style.setProperty(key, value);
    return { held, running: ends.size > 0 };
  };
  let started = 0;
  return {
    onAnimationStart: () => {
      const run = ++started;
      let waited = 0;
      const hold = (): void => {
        const node = element();
        if (!node || run !== started || values.length === 0) return;
        const { held, running } = write(node);
        if (held || (!running && waited++ < START_FRAMES)) frame.postRender(hold);
      };
      frame.postRender(hold);
    },
    reapply: () => {
      const node = element();
      if (node) write(node);
    },
  };
}
