/**
 * What a shape drawn with the fog tool leaves: plain fog, or fog taken away. The gesture draws
 * the shape; its outcome shows what will come of it while it is under way and writes it when it
 * ends, as one undo step.
 */
import type { StoreApi } from 'zustand';
import { fogStrokeErases } from '../../fog/fogToolChoices';
import type { ViewAtlasState } from '../../storeFactory';
import type { StrokeShape } from '../../tools/shapeStroke';
import type { FogOperation } from '../../types/fogTypes';

/** What a stroke asks of the fog's picture. */
export interface FogStrokeHost {
  /** Shows the fog with what is under way on it; without a stroke, the fog as the scene holds it. */
  showStroke(stroke: FogOperation | readonly FogOperation[] | undefined): void;
  /** A stroke ended without leaving fog: the picture goes back to what the scene holds. */
  showCommitted(): void;
}

/** Where a shape that will erase shows before it does: to the GM alone, off the fog's canvas. */
export interface FogRevealPreview {
  show(shapes: readonly StrokeShape[]): void;
  clear(): void;
}

/** A shape as the fog shows it before it is the scene's. */
export function fogPreviewOf(shape: StrokeShape, isErasing: boolean): FogOperation {
  return { id: '__preview__', kind: 'fog', timestamp: Date.now(), isErasing, ...shape };
}

/**
 * Fog and Eraser: the shape is fog, or takes fog away; Alt makes a stroke do the other. The fog's
 * canvas is what the players see, so only what adds fog is shown on it while it is under way, and
 * the brush, which wipes fog away as it goes. What another shape will erase shows to the GM
 * alone (`FogRevealPreview`) until it is committed.
 */
export class FogStrokeOutcome {
  /** The fog's canvas shows the stroke under way. */
  private onFog = false;

  constructor(
    private readonly store: Pick<StoreApi<ViewAtlasState>, 'getState'>,
    private readonly host: FogStrokeHost,
    private readonly reveal: FogRevealPreview,
  ) {}

  /** Whether the stroke takes fog away; `alt` is whether Alt is held. Its outline is drawn in the erasing colour then. */
  takesAway(alt: boolean): boolean {
    return fogStrokeErases(this.store.getState().activeTool, alt);
  }

  /** Shows what `shapes`, the stroke so far, will leave. */
  preview(shapes: readonly StrokeShape[], alt: boolean): void {
    const erases = this.takesAway(alt);
    if (erases && !shapes.some((shape) => shape.type === 'brush')) {
      this.reveal.show(shapes);
      // Alt went down on a shape that was adding fog: what the canvas showed of it goes.
      if (this.onFog) this.host.showStroke(undefined);
      this.onFog = false;
      return;
    }
    this.reveal.clear();
    const strokes = shapes.map((shape) => fogPreviewOf(shape, erases));
    this.onFog = strokes.length > 0;
    this.host.showStroke(strokes.length > 1 ? strokes : strokes[0]);
  }

  /** The stroke ended: `shapes` are written in one undo step, or the picture goes back to the scene's where they leave nothing. */
  commit(shapes: readonly StrokeShape[], alt: boolean): void {
    const isErasing = this.takesAway(alt);
    this.end();
    const { addFogOperation, addFogOperations } = this.store.getState();
    const [only] = shapes;
    if (!only) this.host.showCommitted();
    else if (shapes.length === 1) addFogOperation({ ...only, isErasing });
    else addFogOperations(shapes.map((shape) => ({ ...shape, isErasing })));
  }

  /** The stroke ended or was dropped: nothing of its preview stays. */
  end(): void {
    this.onFog = false;
    this.reveal.clear();
  }
}
