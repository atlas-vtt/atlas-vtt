import type { Viewport } from 'pixi-viewport';
import { firstLinkTarget, flightOnLevel, levelLinkList, linkHeading, MAX_LEVEL_LINKS, MAX_LINK_CORNERS } from '../../levels/levelLinks';
import { flightRows, type FlightEnds } from '../../levels/stairFlights';
import { everyLevelObjects, levelObjects } from '../../levels/levelObjects';
import { hasLevels, viewedLevelId } from '../../levels/sceneLevels';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { LevelLink } from '../../types/sceneLevelTypes';
import { areaHandlePoint } from '../../vision/polygonArea';
import { PolygonAreaEditor } from '../areas/PolygonAreaEditor';
import { snapToWallEnd } from '../lighting/wallEnds';
import { levelLinkOverlay } from './levelLinkOverlay';

export interface LevelLinkEditorDeps {
  viewport: Viewport;
  /** The map's canvas: a pointer cancelled on it, or its window losing focus, ends a drag that will get no release. */
  canvas: HTMLCanvasElement;
  store: ViewAtlasStore;
  /** Stairs were begun on a map that holds `MAX_LEVEL_LINKS`: none are begun, and the GM is told. */
  onFull: () => void;
}

/** The stairs of the level a view shows. */
function shownLinks(state: ViewAtlasState): LevelLink[] {
  return levelLinkList(levelObjects(state).levelLinks);
}

/** Whether the GM sees stairs at all: in the GM's view of a loaded scene with several levels. */
function stairsShown(state: ViewAtlasState): boolean {
  return hasLevels(state.levels) && state.isGMView && !state.isPlayerView && !state.isMapLoading;
}

/** Stairs' popover needs the stairs on the level shown and the stairs tool in the GM's view of a loaded scene. */
export function mayEditLevelLink(state: ViewAtlasState, linkId: string): boolean {
  return stairsShown(state) && state.activeTool === 'stairs' && shownLinks(state).some((link) => link.id === linkId);
}

/**
 * The stairs tool (`PolygonAreaEditor`): stairs drawn corner by corner on the level shown, joining it
 * to the level above (else below) at first; their popover sets where they lead. Corners snap to
 * wall ends close by (Alt places freely). Outside the tool the GM still sees the stairs of the level
 * shown, faintly; nothing of them shows in the players' view. A scene that loses its levels, or the
 * players' view, puts the tool back to moving.
 */
export class LevelLinkEditor extends PolygonAreaEditor<LevelLink> {
  private readonly stopFollowing: () => void;
  /** The stairs show at rest too, so a theme switched in Obsidian redraws them in its colours. */
  private readonly themeWatch: MutationObserver;

  constructor(deps: LevelLinkEditorDeps) {
    const { viewport, canvas, store } = deps;
    const heading = (link: LevelLink): ReturnType<typeof linkHeading> => {
      const state = store.getState();
      const from = viewedLevelId(state);
      return from === null ? 'none' : linkHeading(link, from, state.levels);
    };
    const flight = (link: LevelLink): FlightEnds | null => {
      const state = store.getState();
      const from = viewedLevelId(state);
      return from === null ? null : flightOnLevel(link, from, state.levels);
    };
    super({
      viewport,
      canvas,
      store,
      overlay: levelLinkOverlay(viewport, heading, flight),
      handleOf: (link) => areaHandlePoint(link.polygon),
      areas: {
        list: shownLinks,
        selected: (state) => state.levelLinkPopover,
        changed: (state, previous) => levelObjects(state).levelLinks !== levelObjects(previous).levelLinks || state.levels !== previous.levels,
        select: (id) => (id ? store.getState().openLevelLinkPopover(id) : store.getState().closeLevelLinkPopover()),
        create: (polygon) => {
          const state = store.getState();
          const from = viewedLevelId(state);
          const to = from === null ? null : firstLinkTarget(from, state.levels);
          if (from === null || to === null) return;
          state.openLevelLinkPopover(state.addLevelLink({ polygon, levels: [from, to] }));
        },
        reshape: (id, polygon) => {
          // Walked stairs keep their foot, and as many rows as they are cells long.
          const state = store.getState();
          const flight = levelLinkList(everyLevelObjects(state).levelLinks).find((link) => link.id === id)?.flight;
          state.updateLevelLink(id, { polygon, ...(flight && { flight: { ...flight, rows: flightRows(polygon, flight.foot, state.grid?.size ?? 0) } }) });
        },
        remove: (id) => store.getState().deleteLevelLink(id),
        mayBegin: () => {
          // The map's limit counts the stairs of every level.
          if (levelLinkList(everyLevelObjects(store.getState()).levelLinks).length < MAX_LEVEL_LINKS) return true;
          deps.onFull();
          return false;
        },
        maxCorners: MAX_LINK_CORNERS,
        snap: (point, { altKey }) => (altKey ? point : snapToWallEnd(point, levelObjects(store.getState()).walls, viewport.scale.x)),
      },
    });
    this.stopFollowing = store.subscribe((state, previous) => this.follow(state, previous));
    this.follow(store.getState(), null);
    this.themeWatch = new MutationObserver(() => this.draw());
    this.themeWatch.observe(canvas.ownerDocument.body, { attributes: true, attributeFilter: ['class'] });
  }

  /** The tool, the view and the scene decide whether the stairs show and are edited; a popover that can no longer be used closes. */
  private follow(state: ViewAtlasState, previous: ViewAtlasState | null): void {
    const shown = stairsShown(state);
    if (state.activeTool === 'stairs' && !hasLevels(state.levels)) {
      state.setActiveTool('move');
      return;
    }
    const wasShown = previous ? this.view.visible : !shown;
    this.view.visible = shown;
    const activeChanged = this.setActive(shown && state.activeTool === 'stairs');
    if (state.levelLinkPopover && !mayEditLevelLink(state, state.levelLinkPopover)) state.closeLevelLinkPopover();
    if (!activeChanged && wasShown !== shown) this.afterVisibilityChange();
    else if (!activeChanged && previous && (state.viewedLevel !== previous.viewedLevel || state.isGMView !== previous.isGMView)) this.draw();
  }

  /** The stairs of the level shown: edited with the tool, at rest without it. */
  protected override overlayAreas(): readonly LevelLink[] {
    return this.view.visible ? shownLinks(this.deps.store.getState()) : [];
  }

  /** The popover goes with the editor: a renderer built anew over the same store must not find it open. */
  override destroy(): void {
    if (this.deps.store.getState().levelLinkPopover !== null) this.deps.store.getState().closeLevelLinkPopover();
    this.themeWatch.disconnect();
    this.stopFollowing();
    super.destroy();
  }
}
