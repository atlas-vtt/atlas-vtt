import { tableControlsStore } from '../../../stores/tableControlsStore';
import type { OnlineTable } from './KeysScreen.ts';

/** Whether an online table runs, read where the player window bar's pause and curtain read it (`isOnline`). */
export const tableOnline: OnlineTable = {
  now: () => tableControlsStore.getState().online,
  onChange: (listener) => tableControlsStore.subscribe((state, previous) => {
    if (state.online !== previous.online) listener();
  }),
};
