import type { NotePin } from '../types';

/** Tokens affected by a resize, rotation or drag gesture. */
export interface TokenGestureEventDetail {
  tokenIds: string[];
}

/** A pin interaction the note pin tool should act on. */
export interface PinActionEventDetail {
  action: 'open' | 'edit';
  pin: NotePin;
  /** The view store whose map holds the pin, so only that view's tool acts on it. */
  store: object;
}

/** Asks the active renderer to convert a world position to client coordinates. */
export interface ViewportPositionRequestDetail {
  worldX?: number;
  worldY?: number;
  callback: (clientX: number, clientY: number) => void;
}

declare global {
  /** Custom events Atlas VTT dispatches on `window` to coordinate its PIXI layers. */
  interface WindowEventMap {
    'atlas-token-resize-started': CustomEvent<TokenGestureEventDetail>;
    'atlas-token-resize-ended': CustomEvent<TokenGestureEventDetail>;
    'atlas-token-rotation-started': CustomEvent<TokenGestureEventDetail>;
    'atlas-token-rotation-ended': CustomEvent<TokenGestureEventDetail>;
    'atlas-token-size-changing': CustomEvent<TokenGestureEventDetail>;
    'atlas-tokens-resize-update': CustomEvent<TokenGestureEventDetail>;
    'atlas-tokens-rotation-update': CustomEvent<TokenGestureEventDetail>;
    'atlas-tokens-drag-update': CustomEvent<TokenGestureEventDetail>;
    'atlas-pin-action': CustomEvent<PinActionEventDetail>;
    'get-viewport-position': CustomEvent<ViewportPositionRequestDetail>;
  }
}
