/**
 * What a shape drawn with the fog tool leaves. A shape that reveals takes fog away, and the
 * brush paints or wipes plain fog. A rectangle, polygon, lasso, cells or room that hides leaves
 * fog Atlas remembers as one piece (`fogAreaStroke.ts`), which a right-click reveals and hides
 * again. The gesture draws the shape; its outcome shows what will come of it while it is under
 * way and writes it when it ends, as one undo step.
 */
import type { StoreApi } from 'zustand';
import { fogAreaList, MAX_FOG_AREAS, type FogAreaShape } from '../../fog/fogAreas';
import { planHideStroke } from '../../fog/fogAreaStroke';
import { areaAt } from '../../fog/fogBody';
import type { FogCoverage } from '../../fog/fogCoverage';
import { fogStrokeReveals } from '../../fog/fogToolChoices';
import type { ViewAtlasState } from '../../storeFactory';
import { runHistoryTransaction } from '../../stores/history';
import type { StrokeShape } from '../../tools/shapeStroke';
import type { FogOperation, FogOperationInput } from '../../types/fogTypes';
import { viewedFog } from './FogPicture';

/** What a stroke asks of the fog's picture. */
export interface FogStrokeHost {
  /** Shows the fog with what is under way on it; without a stroke, the fog as the scene holds it. */
  showStroke(stroke: FogOperation | readonly FogOperation[] | undefined): void;
  /** A stroke ended without leaving fog: the picture goes back to what the scene holds. */
  showCommitted(): void;
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

/** A remembered piece's shape as plain fog. */
function plainFog(shape: FogAreaShape): FogOperationInput {
  return shape.type === 'lasso' ? { type: 'lasso', isErasing: false, points: [...shape.points] } : { ...shape, isErasing: false };
}

/**
 * Hide and Reveal: the shape is fog, or takes fog away; Alt makes a stroke do the other. The fog's
 * canvas is what the players see, so only what hides is shown on it while it is under way, and
 * the brush, which wipes fog away as it goes. What another shape will reveal shows to the GM
 * alone (`FogRevealPreview`) until it is committed.
 */
export class FogStrokeOutcome {
  /** The fog's canvas shows the stroke under way. */
  private onFog = false;
  /** The remembered piece, hidden, the stroke began in; null outside every one. */
  private startsIn: string | null = null;

  constructor(
    private readonly store: Pick<StoreApi<ViewAtlasState>, 'getState'>,
    private readonly host: FogStrokeHost,
    private readonly reveal: FogRevealPreview,
    /** The level's fog as it is committed; null where it cannot be worked out. */
    private readonly coverage: () => FogCoverage | null,
  ) {}

  /** A stroke begins at the world point `at`. */
  begin(at: { x: number; y: number }): void {
    this.startsIn = areaAt(fogAreaList(viewedFog(this.store.getState())), at, true)?.id ?? null;
  }

  /** Whether the stroke takes fog away; `alt` is whether Alt is held. Its outline is drawn in the revealing colour then. */
  takesAway(alt: boolean): boolean {
    return fogStrokeReveals(this.store.getState().activeTool, alt);
  }

  /** Shows what `shapes`, the stroke so far, will leave. */
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

  /** The stroke ended: `shapes` are written in one undo step, or the picture goes back to the scene's where they leave nothing. */
  commit(shapes: readonly StrokeShape[], alt: boolean): void {
    const isErasing = this.takesAway(alt);
    const startsIn = this.startsIn;
    this.end();
    const [only] = shapes;
    if (!only) this.host.showCommitted();
    else if (isErasing || shapes.some((shape) => shape.type === 'brush')) this.plain(shapes, only, isErasing);
    else if (!this.hide(shapes, startsIn)) this.host.showCommitted();
  }

  /** The stroke was dropped. */
  end(): void {
    this.onFog = false;
    this.startsIn = null;
    this.reveal.clear();
  }

  /** Writes `shapes` as plain fog, or as fog taken away. */
  private plain(shapes: readonly StrokeShape[], only: StrokeShape, isErasing: boolean): void {
    const { addFogOperation, addFogOperations } = this.store.getState();
    if (shapes.length === 1) addFogOperation({ ...only, isErasing });
    else addFogOperations(shapes.map((shape) => ({ ...shape, isErasing })));
  }

  /**
   * Hides `shapes` as fog that is remembered (`planHideStroke`). A level that holds as many
   * pieces as are read takes them as plain fog, so what was drawn is hidden all the same.
   * False where nothing came of it.
   */
  private hide(shapes: readonly StrokeShape[], startsIn: string | null): boolean {
    const areas = fogAreaList(viewedFog(this.store.getState()));
    const plan = planHideStroke(shapes, areas, startsIn, this.coverage()?.shape ?? null);
    let room = MAX_FOG_AREAS - areas.length;
    let changed = false;
    runHistoryTransaction(this.store, () => {
      const { addFogOperations, addFogArea, reshapeFogArea } = this.store.getState();
      const plain = plan.paint.map((points): FogOperationInput => ({ type: 'lasso', isErasing: false, points }));
      if (plan.join) changed = reshapeFogArea(plan.join.id, plan.join.points);
      for (const shape of plan.add) {
        if (room <= 0) plain.push(plainFog(shape));
        else if (addFogArea(shape) !== null) {
          changed = true;
          room--;
        }
      }
      if (plain.length > 0) {
        addFogOperations(plain);
        changed = true;
      }
    });
    return changed;
  }
}
