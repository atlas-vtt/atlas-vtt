import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasStore } from '../../storeFactory';
import { isModHeld } from '../../keyboard/modKey';
import { levelObjects } from '../../levels/levelObjects';
import { mapTokens } from '../../tokens/offMap';
import type { TokenPointer } from '../pointer/mapLayers';
import type { InteractionController } from './InteractionController';
import type { UIManager } from './UIManager';

export interface TokenPointerDeps {
  store: ViewAtlasStore;
  viewport: Viewport;
  /** The topmost token drawn at a world point. */
  hitTest: (x: number, y: number) => string | null;
  interaction: InteractionController;
  ui: UIManager;
}

/** The tokens as the map's pointer asks them: presses, menus and drags go to the interaction controller, hovers to it and the token UI. */
export function tokenPointer({ store, viewport, hitTest, interaction, ui }: TokenPointerDeps): TokenPointer {
  /** The resource a token of a selection of two or more draws at a point of the canvas, or null. */
  const barOnScreen = (point: { x: number; y: number }): string | null => {
    const { selectedIds, activeTool } = store.getState();
    if (selectedIds.length < 2 || (activeTool !== 'select' && activeTool !== 'move')) return null;
    const key = ui.resourceAt(selectedIds, point);
    return key && interaction.offersSelectionResource(key) ? key : null;
  };
  const hover = (tokenId: string | null, event: FederatedPointerEvent | undefined, shown: boolean): void => {
    interaction.handleViewportTokenHover(tokenId, event);
    ui.setHoverState(shown ? tokenId : null, shown && event ? isModHeld(event) : false);
  };

  return {
    hitTest,
    press: (tokenId, event) => interaction.handleViewportTokenPointerDown(tokenId, event),
    offersMenu: () => !interaction.isPlayerView,
    hover: (tokenId, event) => hover(tokenId, event, true),
    preview: (tokenId, event) => hover(tokenId, event, false),
    barAt: (x, y) => barOnScreen(viewport.toScreen(x, y)),
    pressBar: (key, event) => {
      const opened = interaction.pressSelectionResource(key, { x: event.clientX, y: event.clientY }, () => ui.setSelectionBarActive(null));
      if (!opened) return false;
      ui.setSelectionBarActive(key);
      // Keeps the canvas's default focus from stealing the popover's focus
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    hoverBar: (key) => ui.hoverSelectionBar(key),
    dragSelected: (event) => {
      const state = store.getState();
      const tokens = mapTokens(levelObjects(state));
      const tokenIds = state.selectedIds.filter((id) => tokens[id]);
      if (tokenIds.length > 0) interaction.handleViewportGroupDragStart(tokenIds, event);
    },
    dragging: () => interaction.isDraggingTokens(),
  };
}
