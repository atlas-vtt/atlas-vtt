import type { StoreApi } from 'zustand';
import { CanvasAudience } from '../../src/app/pixi/audience/CanvasAudience';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { EventEmitter } from '../../src/app/utils/typedEmitter';

/** A map view's audience as its renderer makes it (`CanvasAudience`), with the lighting's peek key in the test's hand. */
export interface ViewAudience {
  audience: CanvasAudience;
  /** Whether the test holds the peek key now. */
  peeking(): boolean;
  /** Holds or lets go of the peek key, as the lighting's session view does: the audience is told at once. */
  peek(held: boolean): void;
}

/** The audience of a view over `store`; `eventBus` is the view's, which tells of the command palette's player mode. */
export function viewAudience(store: Pick<StoreApi<ViewAtlasState>, 'getState' | 'subscribe'>, eventBus: Pick<EventEmitter, 'on' | 'off'> = new EventEmitter()): ViewAudience {
  let held = false;
  const audience = new CanvasAudience({ store, eventBus, peeking: () => held });
  return {
    audience,
    peeking: () => held,
    peek: (next) => {
      held = next;
      audience.refresh();
    },
  };
}
