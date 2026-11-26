import { afterEach, beforeEach, expect, it } from 'vitest';
import { followPlayerWindowWithPlayMode, restorePlayMode, setPlayMode } from '../../src/app/services/tableControls';
import { playerWindowStore } from '../../src/app/stores/playerWindowStore';
import { tableControlsStore } from '../../src/app/stores/tableControlsStore';

let stop: () => void;
const mode = (): string => tableControlsStore.getState().playMode;
const window = (isOpen: boolean): void => playerWindowStore.setState({ isOpen });
const table = (online: boolean): void => tableControlsStore.setState({ online });

beforeEach(() => {
  window(false);
  tableControlsStore.setState({ online: false, playMode: 'table' });
  stop = followPlayerWindowWithPlayMode();
  // Ending a table clears a choice made before it, so each test starts unchosen
  table(true);
  table(false);
});
afterEach(() => stop());

it('starts a table with remote control while the player window is open, token control while it is not', () => {
  window(true);
  expect(mode()).toBe('remote');
  window(false);
  expect(mode()).toBe('table');
});

it('keeps what the GM chose before the table, and lets the window choose again once that table ends', () => {
  window(true);
  setPlayMode('table');
  window(false);
  window(true);
  expect(mode()).toBe('table');
  table(true);
  table(false);
  expect(mode()).toBe('remote');
});

it('leaves a running table\'s mode alone when the window opens or closes', () => {
  table(true);
  window(true);
  expect(mode()).toBe('table');
});

it('keeps a saved table\'s mode while it comes back', () => {
  restorePlayMode('remote');
  window(true);
  window(false);
  expect(mode()).toBe('remote');
});
