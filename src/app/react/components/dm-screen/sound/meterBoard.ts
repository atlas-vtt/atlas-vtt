import { faderPosition } from './faderScale';

/** How fast a meter falls, in shares of its height per second. A rise is at once. */
const FALL_PER_SECOND = 0.5;
/** Below this a change cannot be seen. */
const STILL = 0.002;
/** The lowest the bars on a mood's tile go: flat, but there. */
const BARS_FLOOR = 0.15;
/** Each bar of a tile takes the level at its own height, and falls at its own pace. */
const BARS = [{ height: 1.1, fall: 0.5 }, { height: 1.6, fall: 0.8 }, { height: 1.3, fall: 0.4 }, { height: 1, fall: 1.1 }] as const;

/** A linear level as a share of a fader's scale, so a meter's top and a thumb read alike. */
export function meterShare(level: number): number {
  if (level <= 0) return 0;
  return faderPosition(20 * Math.log10(level));
}

interface Fill {
  element: HTMLElement;
  strip: string;
  /** Scales the strip's level; a meter's is 1. */
  height: number;
  fall: number;
  floor: number;
  shown: number;
}

/**
 * The elements levels are drawn on, each written straight with a transform: the frame loop reads the
 * levels and this writes only what moved, so a meter never makes React do anything.
 */
export class MeterBoard {
  private readonly fills = new Set<Fill>();
  private readonly levels = new Map<string, number>();
  private changed: (() => void) | null = null;

  /** Told when a fill comes, for whoever draws only once. */
  onChange(listener: (() => void) | null): void {
    this.changed = listener;
  }

  add(element: HTMLElement, strip: string): () => void {
    return this.keep([{ element, strip, height: 1, fall: FALL_PER_SECOND, floor: 0, shown: -1 }]);
  }

  /** The bars on a mood's tile, which follow the whole mix. */
  addBars(bars: readonly HTMLElement[]): () => void {
    return this.keep(bars.map((element, index) => {
      const shape = BARS[index % BARS.length] ?? BARS[0];
      return { element, strip: 'master', height: shape.height, fall: shape.fall, floor: BARS_FLOOR, shown: -1 };
    }));
  }

  /** Draws the levels `read` gives, `seconds` after the last time. */
  draw(read: (into: Map<string, number>) => void, seconds: number): void {
    read(this.levels);
    for (const fill of this.fills) {
      const level = meterShare(this.levels.get(fill.strip) ?? 0) * fill.height;
      const next = Math.min(1, Math.max(fill.floor, level, fill.shown - fill.fall * seconds));
      if (Math.abs(next - fill.shown) < STILL) continue;
      fill.shown = next;
      fill.element.style.transform = `scaleY(${next.toFixed(3)})`;
    }
  }

  private keep(fills: readonly Fill[]): () => void {
    for (const fill of fills) this.fills.add(fill);
    this.changed?.();
    return () => {
      for (const fill of fills) this.fills.delete(fill);
    };
  }
}
