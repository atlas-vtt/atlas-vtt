import type { EventSystem, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from '../../../src/app/utils/typedEmitter';
import { TokenRenderer } from '../../../src/app/pixi/token-renderer';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';
import { RESET_CURSOR, type PointerDriver } from './pointerOutcome';
import type { PointerWorld } from './pointerWorld';

/** What today's renderer keeps to itself, and the table replaces with the world's fakes. */
interface Inside {
  showsGmView: () => boolean;
  selectionBarAt: () => string | null;
  startTokenGroupDrag: () => void;
  onCanvasPointerLeave: () => void;
  onCanvasDoubleClick: () => void;
  interactionController: {
    isPlayerView: boolean;
    handleViewportTokenPointerDown: (id: string, e: FederatedPointerEvent) => void;
    handleViewportTokenHover: (id: string | null) => void;
    pressSelectionResource: () => boolean;
  };
  uiManager: {
    setHoverState: (id: string | null) => void;
    hoverSelectionBar: (key: string | null) => void;
    setSelectionBarActive: () => void;
  };
}

/** The map's pointer as `TokenRenderer` dispatches it, with every other layer the world's fake. */
export function tokenRendererPointer(world: PointerWorld): PointerDriver & { destroy(): void } {
  const restoreGraphics = stubJsdomGraphics();
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events });
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `pointer-table-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const grid = { getOptions: () => ({ type: 'square', size: 70, offsetX: 0, offsetY: 0 }) } as unknown as GridSystem;
  const renderer = new TokenRenderer(app, viewport, grid, () => {}, store, new EventEmitter(), 'pointer-table');
  const f = world.layers();

  renderer.setMeasureHandlers(f.measure);
  renderer.setPinHitTestProvider(f.pins.hitTest);
  renderer.setPinClickHandler(f.pins.press);
  renderer.setPinHoverHandler(f.pins.hover);
  renderer.setDoorClickHandler(f.doors.click, f.doors.pressAt);
  renderer.setDoorMenuHandlers({ hitTest: f.doors.menuHitTest, open: f.doors.openMenu });
  renderer.setLightHandlers(f.lights);
  renderer.setAnnotationHandlers(f.annotations);
  renderer.setStairsTool(f.stairs);
  renderer.setWallPointerDownHandler(f.walls.pointerDown);
  renderer.setWallPointerMoveHandler(f.walls.pointerMove);
  renderer.setWallPointerUpHandler(f.walls.pointerUp, f.walls.pointerCancel);
  renderer.setWallDoubleClickHandler(f.walls.doubleClick);
  renderer.setWallContextMenuHandler(f.walls.openMenu, f.walls.menuAt);
  renderer.setWallCursorProvider(f.walls.cursorAt);
  renderer.setAudioPointerDownHandler(f.sounds.pointerDown);
  renderer.setHexLinkHandlers(f.hexLinks);
  renderer.setMapFeatureHandlers(f.mapFeatures);
  renderer.setFogMenuHandlers(f.fog);
  renderer.setGroupFrameHitTest(f.groupFrame);
  renderer.setPlacementGuard(() => world.current.placing ?? false);

  // The tokens themselves: hit tests of their sprites, and what their interaction controller does with a press
  const inside = renderer as unknown as Inside;
  renderer.hitTestTokens = f.tokens.hitTest;
  inside.showsGmView = () => world.current.gmView ?? true;
  inside.selectionBarAt = f.tokens.barAt;
  inside.startTokenGroupDrag = f.tokens.groupDrag;
  inside.interactionController.handleViewportTokenPointerDown = f.tokens.press;
  inside.interactionController.handleViewportTokenHover = f.tokens.hover;
  inside.interactionController.pressSelectionResource = f.tokens.pressBar;
  inside.uiManager.setHoverState = f.tokens.uiHover;
  inside.uiManager.hoverSelectionBar = f.tokens.hoverBar;
  inside.uiManager.setSelectionBarActive = () => undefined;

  return {
    arrange: (w) => {
      store.setState({ activeTool: w.current.tool as never, selectedIds: [...(w.current.selected ?? [])] });
      inside.interactionController.isPlayerView = w.current.playerView ?? false;
      viewport.cursor = RESET_CURSOR;
    },
    press: (e) => viewport.emit('pointerdown', e),
    release: (e) => viewport.emit('pointerup', e),
    move: (e) => viewport.emit('pointermove', e),
    cancel: (e) => viewport.emit('pointercancel', e),
    doubleClick: () => inside.onCanvasDoubleClick(),
    leave: () => inside.onCanvasPointerLeave(),
    menuAt: (x, y) => renderer.menuAt(x, y),
    tapActsAt: (x, y) => renderer.tapActsAt(x, y),
    pressActsAt: (x, y) => renderer.pressActsAt(x, y),
    cursor: () => String(viewport.cursor),
    selectionCleared: (w) => (w.current.selected?.length ?? 0) > 0 && store.getState().selectedIds.length === 0,
    destroy: () => {
      renderer.destroy();
      viewport.destroy();
      restoreGraphics();
    },
  };
}
