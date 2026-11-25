import { animate, type AnimationPlaybackControls, type ValueAnimationTransition } from 'framer-motion';
import { UPDATE_PRIORITY, type Ticker } from 'pixi.js';

/** Motion stopped exporting its driver type in v14; the transition option still takes one. */
type Driver = NonNullable<ValueAnimationTransition<number>['driver']>;

/**
 * A Motion driver that steps animations from a PIXI ticker, ahead of the render.
 * Motion's own frame loop is a separate requestAnimationFrame callback that can run
 * after PIXI rendered the frame, so some frames would show the previous value (judder).
 */
function tickerDriver(ticker: Ticker): Driver {
  return (update) => {
    const step = (): void => update(ticker.lastTime);
    return {
      start: () => ticker.add(step, undefined, UPDATE_PRIORITY.HIGH),
      stop: () => ticker.remove(step),
      now: () => ticker.lastTime,
    };
  };
}

/** Animates a number with Motion in step with `ticker`'s frames; `onUpdate` receives every value. */
export function animateOnTicker(
  ticker: Ticker,
  from: number,
  to: number,
  transition: Omit<ValueAnimationTransition<number>, 'driver'>,
): AnimationPlaybackControls {
  return animate(from, to, { ...transition, driver: tickerDriver(ticker) });
}
