import { useCallback, useEffect, useRef } from 'react';
import type { App } from 'obsidian';
import { StatblockPreviewWindow } from '../../../../services/StatblockPreviewWindow';
import type { LibraryTemplate } from '../../../../statblocks/model/resolvedTypes';
import type { TokenVitals } from '../../../../services/statblockVitalsSync';
import { useStableCallback } from '../../../../react/hooks/useStableCallback';
import { isModHeld, isModKey } from '../../../../keyboard/modKey';

/** The statblock a token card opens. */
export interface StatblockPreviewTarget {
  /** Names the card: while the pointer stays on it, the window only follows. */
  key: string;
  notePath: string;
  /** The token's art, as on the map; a token in a list has no values to mirror. */
  token: TokenVitals;
}

export interface ModHoverStatblockPreviewOptions {
  app: App;
  /** The scrolling pane that holds the token cards. */
  container: HTMLElement | null;
  cardSelector: string;
  /** What a card opens, or null for a card without a statblock. */
  targetOf: (card: HTMLElement) => StatblockPreviewTarget | null;
  /** Reads a note that may not be in the vault, e.g. inside a collection being imported; undefined when the vault has it. */
  noteText?: ((path: string) => Promise<string | undefined>) | undefined;
  /** Templates that come with the notes `noteText` reads (a bundle's own); keep the array while unchanged. */
  bundleTemplates?: readonly LibraryTemplate[] | undefined;
  /** Set while Mod belongs to something else, such as a selection. */
  suspended?: boolean | undefined;
}

const OVER_MODAL = 'atlas-statblock-preview-window--over-modal';

/** The card under the pointer and where the pointer is on it. */
interface Hover {
  card: HTMLElement;
  x: number;
  y: number;
}

/**
 * Opens the statblock of the token card under the pointer while Mod (Cmd on
 * macOS, Ctrl elsewhere) is held, in the window a token on the map opens: at the
 * pointer, kept inside the screen, open until Mod is released. It listens on
 * the pane rather than on every card, so memoized and virtualised cards stay put.
 */
export function useModHoverStatblockPreview(options: ModHoverStatblockPreviewOptions): void {
  const { container, cardSelector, suspended = false } = options;
  const hover = useRef<Hover | null>(null);
  const open = useRef<{ key: string; preview: StatblockPreviewWindow } | null>(null);
  // Counts up whenever what should be shown changes, so a note read for an earlier card is dropped.
  const request = useRef(0);

  const hide = useCallback((): void => {
    request.current += 1;
    open.current?.preview.hide();
    open.current = null;
  }, []);

  const show = useStableCallback(({ card, x, y }: Hover): void => {
    if (suspended) return;
    const target = options.targetOf(card);
    if (!target) return;
    if (open.current?.key === target.key) {
      open.current.preview.setPosition(x, y);
      return;
    }

    hide();
    const openWindow = (text?: string): void => {
      const outsideNote = text === undefined ? undefined : { text, templates: options.bundleTemplates };
      const preview = new StatblockPreviewWindow(options.app, target.notePath, target.token, null, { x, y }, outsideNote);
      preview.element?.addClass(OVER_MODAL);
      open.current = { key: target.key, preview };
    };
    if (!options.noteText) {
      openWindow();
      return;
    }
    const current = request.current;
    void options.noteText(target.notePath).then((text) => {
      if (current === request.current) openWindow(text);
    });
  });

  useEffect(() => {
    if (!container) return undefined;

    const onMouseMove = (event: MouseEvent): void => {
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(cardSelector) : null;
      const entered = card !== hover.current?.card;
      hover.current = card && { card, x: event.clientX, y: event.clientY };
      if (entered && hover.current && isModHeld(event)) show(hover.current);
    };
    const onMouseLeave = (): void => {
      hover.current = null;
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isModKey(event)) hide();
      else if (!event.repeat && hover.current?.card.isConnected) show(hover.current);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (isModKey(event)) hide();
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    // A window that loses focus with Mod held never reports its release.
    window.addEventListener('blur', hide);
    return (): void => {
      hide();
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', hide);
    };
  }, [container, cardSelector, show, hide]);

  useEffect(() => {
    if (suspended) hide();
  }, [suspended, hide]);
}
