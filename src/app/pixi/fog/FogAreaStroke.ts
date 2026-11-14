/**
 * A shape drawn in the fog tool's Areas mode (`fogAreaStroke.ts`): a new area fitted to its
 * neighbours, or, begun inside an area, added to that area or (Alt) taken away from the areas
 * it covers. While it is drawn the outlines that will come of it show in the areas' own style;
 * when it ends they are the scene's, in one undo step.
 */
import { Graphics } from 'pixi.js';
import type { StoreApi } from 'zustand';
import { areaIsHidden, fogAreaList, MAX_FOG_AREAS, type FogArea, type FogAreaShape } from '../../fog/fogAreas';
import { areaAtPoint, planAreaStroke, type AreaStrokePlan } from '../../fog/fogAreaStroke';
import { t } from '../../i18n';
import type { ViewAtlasState } from '../../storeFactory';
import { runHistoryTransaction } from '../../stores/history';
import type { StrokeShape } from '../../tools/shapeStroke';
import type { Point } from '../../types/visionTypes';
import { showNotice } from '../../ui/notice';
import { canvasBadgeTheme } from '../utils/canvasBadgeColors';
import { drawAreaOutlines, type AreaOutline } from './fogAreaOutlines';
import { viewedFog } from './FogPicture';
import { fogPreviewOf, type FogStrokeHost, type FogStrokeOutcome } from './fogStrokeOutcome';

function cornersOf(shape: FogAreaShape): readonly Point[] {
  if (shape.type === 'lasso') return shape.points;
  const { x, y, width, height } = shape;
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

/** A new area as a stroke the fog's picture shows: hidden, as it will be. */
function strokeOf(shape: FogAreaShape): StrokeShape {
  return shape.type === 'lasso' ? { type: 'lasso', points: [...shape.points] } : { ...shape };
}

export class FogAreaStroke implements FogStrokeOutcome {
  /** The outlines that will come of the stroke under way. */
  readonly view = new Graphics();
  /** The area the stroke began in; null outside every area. */
  private startsIn: string | null = null;
  private outlines: AreaOutline[] = [];
  private accent = 0;

  constructor(
    private readonly store: Pick<StoreApi<ViewAtlasState>, 'getState'>,
    private readonly host: FogStrokeHost,
    /** Screen pixels per world pixel. */
    private readonly zoom: () => number,
  ) {
    this.view.eventMode = 'none';
  }

  begin(at: Point): void {
    this.startsIn = areaAtPoint(this.areas(), at)?.id ?? null;
    this.accent = canvasBadgeTheme().accent;
  }

  takesAway(alt: boolean): boolean {
    return this.plan([], alt).kind === 'trim';
  }

  preview(shapes: readonly StrokeShape[], alt: boolean): void {
    const plan = this.plan(shapes, alt);
    // Only a new area changes the fog: it shows hidden, as it will be. Adding to an area or taking from one leaves the picture alone.
    if (plan.kind === 'new') {
      const strokes = plan.add.map((shape) => fogPreviewOf(strokeOf(shape), false));
      this.host.showStroke(strokes.length > 1 ? strokes : strokes[0]);
    }
    const areas = this.areas();
    this.outlines = [
      ...plan.add.map((shape) => ({ outline: cornersOf(shape), dashed: false })),
      ...plan.reshape.map(({ id, points }) => ({ outline: points, dashed: areas.some((area) => area.id === id && !areaIsHidden(area)) })),
    ];
    this.draw();
  }

  commit(shapes: readonly StrokeShape[], alt: boolean): void {
    const plan = this.plan(shapes, alt);
    this.end();
    let changed = false;
    let full = false;
    runHistoryTransaction(this.store, () => {
      const { addFogArea, updateFogArea } = this.store.getState();
      for (const shape of plan.add) {
        if (addFogArea(shape) !== null) changed = true;
        else if (this.areas().length >= MAX_FOG_AREAS) full = true;
      }
      for (const { id, points } of plan.reshape) changed = updateFogArea(id, { points }) || changed;
    });
    if (full) showNotice(t('fog.areasFull'));
    else if (plan.refused > 0) showNotice(t(plan.kind === 'join' ? 'fog.areaJoinRefused' : 'fog.areaTrimRefused'));
    // Nothing came of it: the picture goes back to the scene's.
    if (!changed) this.host.showCommitted();
  }

  end(): void {
    this.startsIn = null;
    if (this.outlines.length === 0) return;
    this.outlines = [];
    this.view.clear();
  }

  /** The map was zoomed: the outlines are drawn as wide on screen as before. */
  rescale(): void {
    if (this.outlines.length > 0) this.draw();
  }

  destroy(): void {
    if (!this.view.destroyed) this.view.destroy();
  }

  private areas(): readonly FogArea[] {
    return fogAreaList(viewedFog(this.store.getState()));
  }

  private plan(shapes: readonly StrokeShape[], alt: boolean): AreaStrokePlan {
    return planAreaStroke(shapes, this.areas(), this.startsIn, alt);
  }

  private draw(): void {
    drawAreaOutlines(this.view, this.outlines, this.zoom(), this.accent);
  }
}
