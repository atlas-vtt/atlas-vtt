import { createStore, type StoreApi } from 'zustand/vanilla';

/** A player's ask to open a door, as the GM's map shows it. */
export interface DoorAsk {
  /** Unique among the asks: the door's wall id and who asks. */
  readonly key: string;
  /** The name the asking player goes by at the table (their token's name where it is not known). */
  readonly who: string;
  /** The map the door is on. */
  readonly mapPath: string;
  /** The level the door is on; null in a scene of one level. */
  readonly level: string | null;
  /** The door's middle, in world pixels. */
  readonly at: { readonly x: number; readonly y: number };
  /** Opens the door (`true`) or keeps it shut, and tells the player. */
  answer(open: boolean): void;
  /** Brings the GM to the door: its tab, scene, level, and the camera on it. */
  reveal(): void;
}

export interface DoorAskState {
  readonly asks: readonly DoorAsk[];
}

/** The asks waiting for the GM's answer, one table per Obsidian window as the online table is one. */
export const doorAskStore: StoreApi<DoorAskState> = createStore<DoorAskState>(() => ({ asks: [] }));

/** Shows an ask (replacing an earlier one of the same key); returns what takes it away again. */
export function addDoorAsk(ask: DoorAsk): () => void {
  doorAskStore.setState(({ asks }) => ({ asks: [...asks.filter((other) => other.key !== ask.key), ask] }));
  return () => doorAskStore.setState(({ asks }) => ({ asks: asks.filter((other) => other !== ask) }));
}
