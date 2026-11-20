import { useEffect, useRef, type RefObject } from 'react';
import type { ViewAtlasState } from '../../../storeFactory';
import { useAtlasStore } from '../../ViewStoreContext';

/** How long a hidden toolbar shows after the tool changes. */
export const PEEK_MS = 1000;

const PEEK = 'data-peek';
const PEEKING = ['.atlas-main-toolbar', '.atlas-bottom-toolbar-row__options'];

type ToolState = Pick<ViewAtlasState, 'activeTool' | 'measureTool' | 'drawTool' | 'lightingTool'>;

/** The tool as the toolbar shows it: the active tool and, where a key cycles its modes, the mode. */
export function toolFace({ activeTool, measureTool, drawTool, lightingTool }: ToolState): string {
  if (activeTool === 'measure') return `measure:${measureTool.mode}`;
  if (activeTool === 'draw') return `draw:${drawTool.mode}`;
  if (activeTool === 'wall') return `wall:${lightingTool.mode}`;
  return activeTool;
}

/**
 * While the bars hide, the toolbar shows for a moment (`data-peek`) whenever the tool changes, by
 * a hotkey or any other way, so cycling through tools shows which one is picked.
 */
export function useToolbarPeek(rootRef: RefObject<HTMLElement | null>, on: boolean): void {
  const face = useAtlasStore(toolFace);
  // A tool picked in the palette: the toolbar stays hidden under it, where the palette took its place.
  const paletteOpen = useAtlasStore(state => state.isCommandPaletteOpen);
  const lastFace = useRef(face);

  useEffect(() => {
    const root = rootRef.current;
    if (face === lastFace.current) return undefined;
    lastFace.current = face;
    if (!root || !on || paletteOpen) return undefined;
    const peeking = PEEKING.flatMap(selector => root.querySelector(selector) ?? []);
    for (const element of peeking) element.setAttribute(PEEK, '');
    const timer = root.win.setTimeout(() => {
      for (const element of peeking) element.removeAttribute(PEEK);
    }, PEEK_MS);
    return () => {
      root.win.clearTimeout(timer);
      for (const element of peeking) element.removeAttribute(PEEK);
    };
  }, [rootRef, on, face, paletteOpen]);
}
