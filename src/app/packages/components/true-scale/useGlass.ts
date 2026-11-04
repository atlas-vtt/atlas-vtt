import { useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';
import type { AtlasView } from '../../../atlas-view';
import { GlassOutline, type GlassLook } from '../../../pixi/glassOutline';
import type { PlayerCameraState } from '../../../types/playerCamera';
import { frameSourceOf, presentTab } from '../../../services/PlayerWindowPresenter';
import { PlayerWindowService } from '../../../services/PlayerWindowService';
import { SettingsService } from '../../../services/SettingsService';
import { playerWindowStore } from '../../../stores/playerWindowStore';
import { observeResize } from '../../../utils/observeResize';
import { showNotice } from '../../../ui/notice';
import { t } from '../../../i18n';
import { trackGlassDrag } from './glassDrag';
import { glassDragSteps } from './glassSession';
import { chipPlace, measureChipRoom, readGlass, type Glass } from './glassState';
import { savedFrames, type SavedFrames } from './savedFrames';

/** What the chip shows. */
export interface GlassShown {
  look: GlassLook;
  pinned: boolean;
  /** The glass stands on a frame saved on this map: its bookmark takes that frame back. */
  saved: boolean;
}

/** The chip of the saved frame under the pointer. */
export interface SavedFrameControls {
  /** The frame's index; null while no chip shows. */
  shown: number | null;
  show: () => void;
  remove: () => void;
  pointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  hover: (over: boolean) => void;
}

export interface GlassControls {
  shown: GlassShown | null;
  /** Pins players where the glass is, or lets them follow the GM again. */
  togglePin: () => void;
  /** Saves the frame players see as one of the scene's frames, or takes back the saved frame they see. */
  save: () => void;
  /** Shows players this map framed where the ghost stands. */
  bring: () => void;
  /** A press on the chip, which may become a drag of the glass. */
  pointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  saved: SavedFrameControls;
}

interface Actions {
  togglePin(): void;
  save(): void;
  bring(): void;
  pointerDown(event: PointerEvent): void;
  saved: SavedFrames;
}

/**
 * The glass of `view`'s map while the player window is open: draws it (`GlassOutline`), keeps
 * the chip in `chipRef` on its top edge and runs what the chip does, and the same for the frames
 * the GM saved on the map and the chip in `savedRef` (`savedFrames`). The chips are placed with
 * `translate` on the map's own frame clock, so they follow pan and zoom in the frame the canvas
 * shows them (pixi-viewport's `moveCenter` and `setZoom` announce nothing).
 */
export function useGlass(view: AtlasView, chipRef: React.RefObject<HTMLElement | null>, savedRef: React.RefObject<HTMLElement | null>): GlassControls {
  const [shown, setShown] = useState<GlassShown | null>(null);
  const [savedShown, setSavedShown] = useState<number | null>(null);
  const actions = useRef<Actions | null>(null);
  const placeAgain = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const chip = chipRef.current;
    const savedChip = savedRef.current;
    const renderer = view.serviceManager?.getRendererService?.();
    const app = renderer?.getApp();
    const viewport = renderer?.getViewport();
    const orchestrator = renderer?.getRenderer();
    const service = PlayerWindowService.getInstance();
    const canvas = app?.canvas;
    const pane = chip?.offsetParent ?? chip?.parentElement;
    if (!chip || !savedChip || !app || !viewport || !orchestrator || !service || !canvas || !pane) return undefined;

    const outline = new GlassOutline(app, viewport, (overlay) => orchestrator.addDmScreenOverlay(overlay));
    const tabId = (): string | null => view.tabMetaStore.getState().activeTabId;
    /** Where a ghost placed by hand stands, until another map is viewed or players come here; null: in the middle of the GM's view. */
    let ghostAt: { x: number; y: number } | null = null;
    let glass: Glass | null = null;
    let dragging: (() => void) | null = null;

    let room = measureChipRoom(pane, canvas);

    const toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return viewport.toWorld(clientX - rect.left, clientY - rect.top);
    };
    const present = (id: string, camera: PlayerCameraState): void => void presentTab(view.app, view, id, { camera });
    const saved = savedFrames({
      store: view.atlasStore,
      service,
      tabId,
      outline,
      chip: savedChip,
      canvas,
      room: () => room,
      toWorld,
      trueSize: () => (service.isTrueScale() ? service.playerViewWorldSize(frameSourceOf(view)) : null),
      present: (camera) => {
        const id = tabId();
        if (id) present(id, camera);
      },
      setShown: setSavedShown,
    });
    const place = (): void => {
      saved.place();
      if (!glass) return;
      const pinned = glass.look === 'live' && service.isFrozen();
      const at = chipPlace(outline.screenRect(glass.frame), { width: chip.offsetWidth, height: chip.offsetHeight }, room, !pinned);
      chip.style.translate = `${at.x}px ${at.y}px`;
    };
    const show = (): void => {
      outline.setGlass(glass?.frame ?? null, glass?.look);
      const next = glass ? { look: glass.look, pinned: service.isFrozen(), saved: glass.look === 'live' && saved.indexOf(glass.frame) >= 0 } : null;
      setShown((now) => (now?.look === next?.look && now?.pinned === next?.pinned && now?.saved === next?.saved ? now : next));
      place();
    };
    /** Reads the glass anew: after anything but the GM's camera moving. */
    const refresh = (): void => {
      saved.refresh();
      glass = readGlass(service, tabId(), {
        // Sized on this map, which players do not see: its grid decides true scale
        size: () => service.playerViewWorldSize(frameSourceOf(view)),
        centre: () => ghostAt ?? viewport.center,
      });
      if (playerWindowStore.getState().shownTabId === tabId()) ghostAt = null;
      show();
    };
    /**
     * The GM's camera or the ghost moved: a ghost not placed by hand stays in the middle of the
     * view. `redraw` false where the outline redrew itself, on the viewport's own events.
     */
    const follow = (redraw: boolean): void => {
      if (glass?.look === 'ghost') {
        const { x, y } = ghostAt ?? viewport.center;
        glass = { look: 'ghost', frame: { ...glass.frame, centerX: x, centerY: y } };
        outline.setGlass(glass.frame, 'ghost');
      } else if (redraw) {
        outline.redraw();
      }
      place();
    };
    const keyOf = (): string => `${viewport.x},${viewport.y},${viewport.scale.x},${viewport.screenWidth},${viewport.screenHeight}`;
    let cameraKey = '';
    /** The camera the outline last redrew itself for, on the viewport's own events. */
    let heardKey = '';
    const tick = (): void => {
      const key = keyOf();
      if (key === cameraKey) return;
      cameraKey = key;
      follow(key !== heardKey);
    };
    /** A ghost placed by hand keeps its place on the map through the GM's pans and zooms; the next tick follows them. */
    const onViewportMoved = (): void => {
      heardKey = keyOf();
    };

    actions.current = {
      togglePin: () => {
        if (service.isFrozen()) service.unfreezeCamera();
        else service.freezeCamera();
      },
      save: () => {
        const id = tabId();
        const frame = id ? service.glassOf(id) : null;
        const camera = frame ? service.playerCameraAt(frame.centerX, frame.centerY) : null;
        if (!frame || !camera) return;
        const map = view.atlasStore.getState();
        const index = saved.indexOf(frame);
        if (index >= 0) {
          map.removePlayerFrame(index);
          return;
        }
        // The rectangle players see, whose shape is the TV's: the camera's own is the GM's pane
        map.addPlayerFrame({ ...frame, scale: camera.scale });
        const count = view.atlasStore.getState().playerFrames.length;
        if (count > map.playerFrames.length) showNotice(t('glass.frameSaved', { number: count }));
      },
      bring: () => {
        const id = tabId();
        const camera = glass?.look === 'ghost' ? service.playerCameraAt(glass.frame.centerX, glass.frame.centerY) : null;
        if (id && camera) void presentTab(view.app, view, id, { camera });
      },
      pointerDown: (event) => {
        const id = tabId();
        if (event.button !== 0 || !id || !glass) return;
        dragging?.();
        const steps = glassDragSteps({
          service,
          tabId: id,
          outline,
          glass: () => glass,
          grid: () => view.atlasStore.getState().grid,
          toWorld,
          ghostPlace: () => ghostAt,
          moveGhost: (centre) => {
            ghostAt = centre;
            follow(true);
          },
        });
        const stop = trackGlassDrag(chip, event, {
          ...steps,
          end: () => { dragging = null; steps.end(); },
          cancel: () => { dragging = null; steps.cancel(); },
        });
        dragging = stop;
      },
      saved,
    };
    placeAgain.current = place;

    const settings = SettingsService.forApp(view.app);
    const cssRef = view.app.workspace?.on('css-change', outline.redraw);
    const unsubscribers = [
      playerWindowStore.subscribe(refresh),
      service.onPlayersCameraChange(refresh),
      view.tabMetaStore.subscribe((state, previous) => {
        if (state.activeTabId === previous.activeTabId) return;
        ghostAt = null;
        refresh();
      }),
      view.atlasStore.subscribe((state, previous) => {
        if (state.mapPath !== previous.mapPath) ghostAt = null;
        if (state.mapPath !== previous.mapPath || state.grid !== previous.grid || state.mapLoaded !== previous.mapLoaded || state.playerFrames !== previous.playerFrames) refresh();
      }),
      settings?.onChange(refresh) ?? ((): void => undefined),
      observeResize([pane, canvas, chip, savedChip], () => { room = measureChipRoom(pane, canvas); saved.measure(); place(); }),
    ];
    viewport.on('moved', onViewportMoved);
    viewport.on('zoomed', onViewportMoved);
    const ticker = app.ticker;
    ticker?.add(tick);
    refresh();

    return () => {
      dragging?.();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (cssRef) view.app.workspace.offref(cssRef);
      viewport.off('moved', onViewportMoved);
      viewport.off('zoomed', onViewportMoved);
      // A view that closes destroys its PIXI app, and with it this ticker, before the UI unmounts
      if (ticker && app.ticker === ticker) ticker.remove(tick);
      saved.destroy();
      outline.destroy();
      actions.current = null;
      placeAgain.current = null;
    };
  }, [view, chipRef, savedRef]);

  // The chips change size with what they show, after their place was worked out
  useLayoutEffect(() => placeAgain.current?.(), [shown, savedShown]);

  return {
    shown,
    togglePin: () => actions.current?.togglePin(),
    save: () => actions.current?.save(),
    bring: () => actions.current?.bring(),
    pointerDown: (event) => actions.current?.pointerDown(event.nativeEvent),
    saved: {
      shown: savedShown,
      show: () => actions.current?.saved.show(),
      remove: () => actions.current?.saved.remove(),
      pointerDown: (event) => actions.current?.saved.pointerDown(event.nativeEvent),
      hover: (over) => actions.current?.saved.hoverChip(over),
    },
  };
}
