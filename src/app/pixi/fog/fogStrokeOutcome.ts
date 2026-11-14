/**
 * What a shape drawn with the fog tool leaves: plain fog (hidden or revealed) here, an area in
 * Areas mode (`FogAreaStroke`). The gesture draws the shape; its outcome shows what will come of
 * it while it is under way and writes it when it ends, as one undo step.
 */
import type { StoreApi } from 'zustand';
import { fogStrokeReveals } from '../../fog/fogToolChoices';
import type { ViewAtlasState } from '../../storeFactory';
import type { StrokeShape } from '../../tools/shapeStroke';
import type { FogOperation } from '../../types/fogTypes';

/** What a stroke asks of the fog's picture. */
export interface FogStrokeHost {
  /** Shows the fog with what is under way on it; without a shape that is an area yet, the fog as the scene holds it. */
  showStroke(stroke: FogOperation | readonly FogOperation[] | undefined): void;
  /** A stroke ended without leaving fog: the picture goes back to what the scene holds. */
  showCommitted(): void;
}

export interface FogStrokeOutcome {
  /** A stroke begins at the world point `at`. */
  begin(at: { x: number; y: number }): void;
  /** Whether the stroke takes fog, or ground from areas, away; `alt` is whether Alt is held. Its outline is drawn in the revealing colour then. */
  takesAway(alt: boolean): boolean;
  /** Shows what `shapes`, the stroke so far, will leave. */
  preview(shapes: readonly StrokeShape[], alt: boolean): void;
  /** The stroke ended: `shapes` are written in one undo step, or the picture goes back to the scene's where they leave nothing. */
  commit(shapes: readonly StrokeShape[], alt: boolean): void;
  /** The stroke was dropped. */
  end(): void;
}

/** Where a shape that will reveal shows before it does: to the GM alone, off the fog's canvas. */
export interface FogRevealPreview {
  show(shapes: readonly StrokeShape[]): void;
  clear(): void;
}

/** A shape as the fog shows it before it is the scene's. */
export function fogPreviewOf(shape: StrokeShape, isErasing: boolean): FogOperation {
  return { id: '__preview__', kind: 'fog', timestamp: Date.now(), isErasing, ...shape };
}

/**
 * Hide and Reveal: the shape is fog, or takes fog away; Alt makes a stroke do the other. The fog's
 * canvas is what the players see, so only what hides is shown on it while it is under way, and
 * the brush, which wipes fog away as it goes. What another shape will reveal shows to the GM
 * alone (`FogRevealPreview`) until it is committed.
 */
export class PlainFogStroke implements FogStrokeOutcome {
  /** The fog's canvas shows the stroke under way. */
  private onFog = false;

  constructor(
    private readonly store: Pick<StoreApi<ViewAtlasState>, 'getState'>,
    private readonly host: FogStrokeHost,
    private readonly reveal: FogRevealPreview,
  ) {}

  begin(): void {
    // Plain fog is the same wherever it starts.
  }

  takesAway(alt: boolean): boolean {
    return fogStrokeReveals(this.store.getState().activeTool, alt);
  }

  preview(shapes: readonly StrokeShape[], alt: boolean): void {
    const reveals = this.takesAway(alt);
    if (reveals && !shapes.some((shape) => shape.type === 'brush')) {
      this.reveal.show(shapes);
      // Alt went down on a shape that was hiding: what the canvas showed of it goes.
      if (this.onFog) this.host.showStroke(undefined);
      this.onFog = false;
      return;
    }
    this.reveal.clear();
    const strokes = shapes.map((shape) => fogPreviewOf(shape, reveals));
    this.onFog = strokes.length > 0;
    this.host.showStroke(strokes.length > 1 ? strokes : strokes[0]);
  }

  commit(shapes: readonly StrokeShape[], alt: boolean): void {
    const isErasing = this.takesAway(alt);
    this.end();
    const { addFogOperation, addFogOperations } = this.store.getState();
    const [only] = shapes;
    if (!only) this.host.showCommitted();
    else if (shapes.length === 1) addFogOperation({ ...only, isErasing });
    else addFogOperations(shapes.map((shape) => ({ ...shape, isErasing })));
  }

  end(): void {
    this.onFog = false;
    this.reveal.clear();
  }
}
