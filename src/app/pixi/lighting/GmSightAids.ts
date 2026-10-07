import { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { tokenVisionOn } from '../../lighting/sceneLightingOptions';
import type { ViewAtlasStore } from '../../storeFactory';
import type { SightRules } from '../../vision/sightRules';
import type { MapBounds } from '../../vision/visibility';
import { restingTokenUIScale } from '../token-renderer/tokenSizing';
import { destroyTree } from '../utils/destroyTree';
import type { TokenPerception } from '../../vision/tokenPerception';
import { PlayerSightMarks } from './PlayerSightMarks';
import { SenseRangeRings } from './SenseRangeRings';
import { sightMarks } from './sightMarks';

/** Above the lighting layer (90), the outlines of sensed tokens (95) and a light's range rings (96), below the token UI (100). */
export const SIGHT_AIDS_Z_INDEX = 97;

export interface GmSightAidsDeps {
  viewport: Viewport;
  store: ViewAtlasStore;
  measurement: () => MeasurementSettings;
  bounds: () => MapBounds | null;
  rules: () => SightRules;
  /** How the players perceive each token; undefined on an unlit scene. */
  perception: () => TokenPerception | undefined;
  /** The window the canvas is in. */
  frames: () => Window;
}

/**
 * What tells the GM how the rules of sight apply, on a lit scene in GM view: the ranges of the
 * selected vision tokens (`SenseRangeRings`) and a mark on every token the players do not see
 * (`PlayerSightMarks`). Both follow the store and the players' sight in one update per frame,
 * however many changes arrive: a dragged token asks once a frame, and nothing is worked out
 * while nothing changes. They are one GM overlay (`GmOverlays`): never in the players' view or
 * a picture.
 */
export class GmSightAids {
  readonly view = new Container({ label: 'gm-sight-aids', zIndex: SIGHT_AIDS_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  readonly rings: SenseRangeRings;
  readonly marks = new PlayerSightMarks();
  private suppressed = false;
  /** The update that waits for a frame, with the window it was asked of: the canvas may be in another by then (a popout). */
  private frame: { id: number; from: Window } | null = null;
  private readonly cleanups: Array<() => void> = [];

  constructor(private readonly deps: GmSightAidsDeps) {
    const { viewport, store } = deps;
    // With token vision off no token's sight counts, so its ranges say nothing.
    this.rings = new SenseRangeRings({ ...deps, shown: () => this.shown() && tokenVisionOn(deps.store.getState().lighting) });
    this.view.addChild(this.rings.view, this.marks.view);
    viewport.addChild(this.view);
    this.cleanups.push(store.subscribe((state, previous) => {
      if (
        state.objects.tokens !== previous.objects.tokens || state.selectedIds !== previous.selectedIds || state.lighting !== previous.lighting
        || state.heldTokens !== previous.heldTokens || state.grid !== previous.grid || state.isMapLoading !== previous.isMapLoading
      ) this.schedule();
    }));
    // The badges take the theme's colours, like the pins.
    const theme = new MutationObserver(() => this.schedule());
    theme.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    this.cleanups.push(() => theme.disconnect());
    this.schedule();
  }

  /** Shows nothing while the canvas shows the players' view. */
  setSuppressed(on: boolean): void {
    // The players' view hides the layer (`playerLightingLayers`); the GM's has it back here.
    this.view.visible = !on;
    if (this.suppressed === on) return;
    this.suppressed = on;
    this.update();
  }

  /** Something the aids show may have changed (the players' sight did): looked at once, in the next frame. */
  schedule(): void {
    if (this.frame !== null) return;
    const from = this.deps.frames();
    const id = from.requestAnimationFrame(() => {
      this.frame = null;
      this.update();
    });
    this.frame = { id, from };
  }

  update(): void {
    const { store, measurement, perception } = this.deps;
    const state = store.getState();
    const perceived = this.shown() ? perception() : undefined;
    const { cellSize } = unitScaleOf(measurement(), state.grid);
    this.marks.sync(perceived ? sightMarks(state.objects.tokens, perceived, cellSize) : [], restingTokenUIScale(cellSize));
    this.rings.draw();
  }

  /** A lit, loaded scene in the GM's view. */
  private shown(): boolean {
    const state = this.deps.store.getState();
    return !this.suppressed && state.lighting.enabled && !state.isMapLoading;
  }

  destroy(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.frame?.from.cancelAnimationFrame(this.frame.id);
    this.frame = null;
    this.rings.destroy();
    this.marks.destroy();
    destroyTree(this.view);
  }
}
