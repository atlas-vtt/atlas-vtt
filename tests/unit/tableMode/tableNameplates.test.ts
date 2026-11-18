// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import 'pixi.js/events';
import { TokenUIRenderer } from '../../../src/app/pixi/TokenUIRenderer';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import type { Character } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

/** A token with a name and nothing else to show: its UI has content exactly while its nameplate shows. */
const scout: Character = { id: 'scout', kind: 'character', name: 'Scout', imagePath: 'scout.png', x: 0, y: 0 };

function tokenUI(): TokenUIRenderer {
  stubJsdomGraphics();
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `table-nameplates-${Math.random()}`);
  store.setState({ persistenceEnabled: false, tokenSettings: { ...store.getState().tokenSettings, showNameplates: true } });
  const ui = new TokenUIRenderer(store);
  ui.resourceDefsProvider = () => [];
  return ui;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('token names on the canvas', () => {
  it('show in session view as the GM\'s map shows them, whatever the players\' setting', () => {
    const ui = tokenUI();
    try {
      ui.tableNameplates = () => undefined;
      ui.update(scout, 70);
      expect(ui.showsContent).toBe(true);
      ui.setPlayersView(true);
      expect(ui.showsContent).toBe(true);
    } finally { ui.destroy(); }
  });

  it('follow the player view\'s Show nameplates in Table mode, as in the player window', () => {
    const ui = tokenUI();
    let playersSeeNames = false;
    try {
      ui.tableNameplates = () => playersSeeNames;
      ui.update(scout, 70);
      // The GM's own view is never the table's
      expect(ui.showsContent).toBe(true);
      ui.setPlayersView(true);
      expect(ui.showsContent).toBe(false);
      playersSeeNames = true;
      ui.setPlayersView(false);
      ui.setPlayersView(true);
      expect(ui.showsContent).toBe(true);
    } finally { ui.destroy(); }
  });
});
