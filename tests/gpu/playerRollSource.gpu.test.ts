import '../setup/obsidianDom';
import { EventEmitter } from 'eventemitter3';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { DiceRollDisplay } from '../../src/app/react/components/dice/DiceRollDisplay';
import type { PreparedDiceRoll } from '../../src/app/react/components/dice/diceSourcePresentation';
import { PlayerRollScene } from '../../src/app/services/PlayerRollScene';
import { rollForPlayers, type ShownRollToken } from '../../src/app/services/playerRollSource';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { DiceRollOrigin } from '../../src/app/types/diceRollOrigin';
import type { DiceRollResult } from '../../src/app/types/diceTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// The GM's lookup asks the statblock's note for a picture; the browser cannot load that service, and no note has one here.
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({
  TokenStatblockLinkService: { getInstance: () => ({ readStatblockImage: (): null => null }) },
}));

/**
 * What the player window shows of a roll, in a real browser with real dice: the result
 * card and the 3D panel. A roll players may not name shows its numbers and nothing of
 * who rolled it or what for; the GM's window shows the same roll whole.
 */

const MAP = 'maps/cave.atlasmap';
const CANARIES = ['canary-token', 'Canary Statblock', 'Canary Name', 'canary-raw.webp', 'Canary Ability'];
const RAW: DiceRollResult = {
  id: 'roll-1', timestamp: 0, formula: '1d20+4', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 4, total: 17,
  source: {
    type: 'statblock', tokenId: 'canary-token', statblockPath: 'Bestiary/Canary Statblock.md', tokenName: 'Canary Name',
    tokenImagePath: 'tokens/canary-raw.webp', abilityName: 'Canary Ability',
  },
};
const ORIGIN: DiceRollOrigin = { viewId: 'view-1', mapPath: MAP, tokenId: 'canary-token' };
const MAP_ART: ShownRollToken = { name: 'Canary Name', imagePath: 'tokens/map-art.webp', showRing: true, ringColor: '#aa0000' };

interface Display {
  host: HTMLElement;
  bus: EventEmitter;
  root: Root;
}

const mounted: Display[] = [];

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

function appShowing(display: 'card' | 'full'): App {
  const { app } = createInMemoryApp({ files: { 'tokens/canary-raw.webp': '', 'tokens/map-art.webp': '' } });
  new SettingsService(app).setDiceDisplay(display);
  return app;
}

/** A roll display, the player window's when `prepare` is given and the GM's otherwise. */
function mount(app: App, prepare?: (result: DiceRollResult, origin: DiceRollOrigin | undefined) => PreparedDiceRoll): Display {
  const host = document.body.createDiv();
  const bus = new EventEmitter();
  const root = createRoot(host);
  const context = { app, view: null, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
  act(() => root.render(createElement(AtlasUIContext.Provider, { value: context },
    createElement(DiceRollDisplay, { eventBus: bus as never, container: host, muted: true, ...(prepare ? { prepare } : {}) }))));
  const display = { host, bus, root };
  mounted.push(display);
  return display;
}

/** The player window's preparation for a scene that shows `shown` for the rolled token, or nothing. */
function playerPrepare(app: App, shown: ShownRollToken | null, showNames: boolean) {
  const scene = new PlayerRollScene();
  scene.present({ viewId: 'view-1', mapPath: MAP, shownTokens: () => new Map(shown ? [['canary-token', shown]] : []) });
  return (result: DiceRollResult, origin: DiceRollOrigin | undefined): PreparedDiceRoll => rollForPlayers(result, origin, scene, {
    showNames, imageSrc: (path) => (app.vault.getAbstractFileByPath(path) ? `app://vault/${path}` : null),
  });
}

function roll(display: Display): void {
  act(() => { display.bus.emit('dice-rolled', RAW, ORIGIN); });
}

const shownTotal = (host: HTMLElement): Promise<string | null | undefined> =>
  expect.poll(() => host.querySelector('.atlas-dice-roll__count, .atlas-dice-toast__total')?.textContent, { timeout: 20_000 }).toBe('17').then(() => '17');

describe('a roll in the player window, drawn by the browser', () => {
  it.each(['card', 'full'] as const)('shows only the numbers of a roll it may not name (%s)', async (mode) => {
    const app = appShowing(mode);
    const player = mount(app, playerPrepare(app, null, true));
    const gm = mount(app);
    roll(player);
    roll(gm);

    await shownTotal(player.host);
    // The card writes the formula; landed dice write the die and the modifier
    expect(player.host.textContent).toContain(mode === 'card' ? '1d20+4' : '13 + 4');
    for (const canary of CANARIES) expect(player.host.innerHTML).not.toContain(canary);
    expect(player.host.querySelector('img')).toBeNull();

    // The GM's window shows the same roll whole
    await shownTotal(gm.host);
    expect(gm.host.innerHTML).toContain('Canary Name');
    expect(gm.host.innerHTML).toContain('Canary Ability');
    expect(gm.host.querySelector('img')?.getAttribute('src')).toContain('canary-raw.webp');
  });

  it.each(['card', 'full'] as const)('shows the map art and the ability, no name, while nameplates are off (%s)', async (mode) => {
    const app = appShowing(mode);
    const player = mount(app, playerPrepare(app, MAP_ART, false));
    roll(player);

    await shownTotal(player.host);
    const img = player.host.querySelector('img');
    expect(img?.getAttribute('src')).toBe('app://vault/tokens/map-art.webp');
    expect(img?.getAttribute('alt')).toBe('');
    expect(player.host.textContent).toContain('Canary Ability');
    for (const canary of CANARIES.filter((c) => c !== 'Canary Ability')) expect(player.host.innerHTML).not.toContain(canary);
  });
});
