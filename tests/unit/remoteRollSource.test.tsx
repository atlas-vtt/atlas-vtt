/**
 * Atlas #319 in a remote view: the player window names a roll's token, with its portrait and ability, only when the
 * roll's origin is a token the shown scene shows. A remote view is a player view that knows no roll's origin, so a
 * roll it is fed, for its log or to throw, names no token, shows no portrait or ability, and looks nothing up in the
 * vault; who rolled it stays.
 */
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteViewDice, withoutRollSource } from '../../src/app/remote-view/RemoteViewDice';
import { RemoteOwnRolls } from '../../src/app/remote-view/RemoteOwnRolls';
import { DiceRollLog } from '../../src/app/react/components/dice-log/DiceRollLog';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { DiceRollResult } from '../../src/app/tools/diceRolling';
import { createInMemoryApp } from '../mocks/inMemoryVault';

Element.prototype.scrollTo = vi.fn();

const SOURCE: NonNullable<DiceRollResult['source']> = {
  type: 'statblock', tokenId: 'goblin', statblockPath: 'Bestiary/Goblin Boss.md', tokenName: 'Goblin Boss', tokenImagePath: 'tokens/goblin.webp', abilityName: 'Ambush',
};

const roll = (id: string, overrides: Partial<DiceRollResult> = {}): DiceRollResult => ({
  id, timestamp: 0, formula: '1d20+2', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 2, total: 15, crit: null, source: SOURCE,
  ...overrides,
});

function setup() {
  const { app } = createInMemoryApp({ files: { 'tokens/goblin.webp': '' } });
  new SettingsService(app).setDiceDisplay('card');
  const store = createViewAtlasStore(app, 'remote-source', undefined, false, { remote: true });
  const dice = new RemoteViewDice(store);
  const shown = render(
    <AtlasUIContext.Provider value={{ app, view: { viewId: 'remote-source', serviceManager: { getEventBus: () => undefined }, containerEl: { doc: document, win: window } } as never, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store as never}>
        <DiceRollLog isOpen onClose={() => undefined} />
        <RemoteOwnRolls />
      </ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  const resourcePath = vi.spyOn(app.vault, 'getResourcePath');
  return { store, dice, shown, resourcePath };
}

describe("a remote view's rolls name no token (#319)", () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('keeps only where a roll came from, and only a known kind', () => {
    expect(withoutRollSource(roll('a')).source).toEqual({ type: 'statblock' });
    expect(withoutRollSource(roll('a', { source: { type: 'toolbar' } })).source).toEqual({ type: 'toolbar' });
    expect(withoutRollSource(roll('a', { source: { type: 'spell', tokenName: 'Goblin Boss' } as never }))).not.toHaveProperty('source');
    const plain = roll('a', { source: undefined });
    expect(withoutRollSource(plain)).toBe(plain);
  });

  it("the log it is fed keeps the roll and who rolled it, but not the token's name, portrait or ability", () => {
    const { store, dice, shown } = setup();
    act(() => dice.setDiceLog([roll('a'), roll('b', { rolledBy: 'Anna' })]));
    const log = store.getState().remoteView!.diceLog;
    expect(log.map((entry) => entry.source)).toEqual([{ type: 'statblock' }, { type: 'statblock' }]);
    expect(Object.isFrozen(log[0]!.source)).toBe(true);
    const text = shown.container.textContent ?? '';
    expect(text).toContain('1d20+2');
    expect(text).toContain('Anna');
    expect(text).not.toContain('Goblin');
    expect(text).not.toContain('Ambush');
    expect(shown.container.querySelector('img')).toBeNull();
  });

  it("a roll it throws shows its total and who rolled it, never the token's name, portrait or ability, and reads no vault image", () => {
    const { dice, shown, resourcePath } = setup();
    act(() => dice.throwRoll(roll('r1', { rolledBy: 'Anna' })));
    const card = shown.container.querySelector('.atlas-dice-toast');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('Anna');
    expect(card!.textContent).toContain('15');
    expect(card!.textContent).not.toContain('Goblin');
    expect(card!.textContent).not.toContain('Ambush');
    expect(card!.querySelector('.atlas-dice-toast__avatar')).toBeNull();
    expect(resourcePath).not.toHaveBeenCalled();
  });
});
