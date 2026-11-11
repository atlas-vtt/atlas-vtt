// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { collectionEnemyImage, isTokenlessEnemy, nextTokenlessEnemy } from '../../src/app/initiative/tokenlessEnemies';
import { mapEnemyImage } from '../../src/app/initiative/mapParty';
import { AssetService } from '../../src/app/services/AssetService';
import type { App } from 'obsidian';
import { combatantColor, turnColor } from '../../src/app/initiative/combatantColor';
import { renderTurnBanner } from '../../src/app/initiative/banner/turnBannerElement';
import { RESOURCE_COLORS } from '../../src/app/resources/resourceColors';
import { turnEntries } from '../../src/app/initiative/turnHolders';
import {
  initiativeScaleOf, MAX_INITIATIVE_SCALE, playerInitiativeList, playersEntryToken, renderPlayerInitiative, type PlayerInitiativeEntry,
} from '../../src/app/services/playerInitiativeList';
import { initiativeCardMenu } from '../../src/app/react/components/initiativeCardMenu';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import type { TokenEntity } from '../../src/app/types';

vi.mock('../../src/app/utils/scrollWithin', () => ({ scrollWithin: () => undefined }));

const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };

const entry = (extra: Partial<InitiativeEntry>): InitiativeEntry => ({
  id: extra.name ?? 'e', name: 'e', initiative: 10, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order: 0, ...extra,
});

describe('enemies without tokens', () => {
  it('are named Enemy 1, Enemy 2, … by the first number no entry has', () => {
    expect(nextTokenlessEnemy([]).name).toBe('Enemy 1');
    expect(nextTokenlessEnemy([{ name: 'Enemy 1' }, { name: 'Enemy 3' }]).name).toBe('Enemy 2');
    const added = nextTokenlessEnemy([]);
    expect(isTokenlessEnemy(added)).toBe(true);
    expect(added.awaitingInitiative).toBe(true);
    // In the palette's red, which the Colour menu shows ticked
    expect(added.color).toBe(RESOURCE_COLORS.find(({ label }) => label === 'Red')?.value);
    expect(isTokenlessEnemy({ partyMemberId: 'ara' })).toBe(false);
    expect(isTokenlessEnemy({ tokenId: 'goblin' })).toBe(false);
  });

  it('start with the picture the collection sets up, read with care, and none without one', () => {
    expect(nextTokenlessEnemy([]).imagePath).toBe('');
    expect(nextTokenlessEnemy([], 'art/goblin.webp').imagePath).toBe('art/goblin.webp');
    expect(collectionEnemyImage({ enemyImagePath: 'art/goblin.webp' })).toBe('art/goblin.webp');
    expect(collectionEnemyImage({})).toBe('');
    expect(collectionEnemyImage(null)).toBe('');
    expect(collectionEnemyImage({ enemyImagePath: 7 as unknown as string })).toBe('');
  });

  it('on a map, take the picture only while its file is there, and none outside every collection', () => {
    const collection = vi.fn((): string | null => 'C');
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({ getCollectionForMap: collection, getCollectionSettings: () => ({ enemyImagePath: 'art/goblin.webp' }) } as unknown as AssetService);
    const there = { vault: { getFileByPath: () => ({}) } } as unknown as App;
    const gone = { vault: { getFileByPath: () => null } } as unknown as App;
    expect(mapEnemyImage(there, 'map.atlasmap')).toBe('art/goblin.webp');
    expect(mapEnemyImage(gone, 'map.atlasmap')).toBe('');
    collection.mockReturnValue(null);
    expect(mapEnemyImage(there, 'map.atlasmap')).toBe('');
    expect(mapEnemyImage(there, null)).toBe('');
    vi.restoreAllMocks();
  });

  it('are shown to the players on the opponents\' side, and take that side\'s turns', () => {
    const enemy = entry({ name: 'Enemy 1' });
    expect(playersEntryToken(enemy, {}, [])).toMatchObject({ side: 'opponents' });
    // An entry whose token is gone is still left out
    expect(playersEntryToken(entry({ tokenId: 'gone' }), {}, [])).toBeNull();
    const held = turnEntries({ kind: 'sides', sides: ['opponents'], round: 1 } as never, { entries: [enemy] }, {});
    expect(held).toEqual([enemy]);
  });

  it('are rolled, never moved, can be hidden from the players and take a colour', () => {
    const noop = (): void => undefined;
    const setColor = vi.fn();
    const menu = initiativeCardMenu(entry({ name: 'Enemy 1' }), undefined, { bySides: false, sides: [], cards: false, fightRuns: false, swapTargets: [] }, {
      roll: noop, moveToFront: noop, moveToBack: noop, edit: noop, updateToken: noop, setSitsOut: noop, swapCard: noop,
      delay: noop, actNow: noop, placeOnMap: noop, remove: noop, setColor, setHiddenFromPlayers: noop,
    });
    const labels = menu.flatMap((item) => (item.type === 'custom' ? [] : [item.label]));
    expect(labels).toContain('Roll Initiative');
    expect(labels).toContain('Hide from Players');
    const colours = menu.find((item): item is Extract<ContextMenuEntry, { type: 'submenu' }> => item.type === 'submenu' && item.label === 'Colour');
    const red = (colours?.children as ContextMenuEntry[]).find((item) => item.type === 'item' && item.label === 'Red');
    if (red?.type !== 'item') throw new Error('no red in the colour menu');
    void red.onClick();
    expect(setColor).toHaveBeenCalledWith('#dc2626');
  });
});

describe('combatant colours', () => {
  it('are offered for opponents and never for the players\' side', () => {
    const noop = (): void => undefined;
    const actions = {
      roll: noop, moveToFront: noop, moveToBack: noop, edit: noop, updateToken: noop, setSitsOut: noop, swapCard: noop,
      delay: noop, actNow: noop, placeOnMap: noop, remove: noop, setColor: noop, setHiddenFromPlayers: noop,
    };
    const mode = { bySides: false, sides: [], cards: false, fightRuns: false, swapTargets: [] };
    const hasColour = (target: InitiativeEntry, token?: TokenEntity): boolean =>
      initiativeCardMenu(target, token, mode, actions).some((item) => item.type === 'submenu' && item.label === 'Colour');
    expect(hasColour(entry({ partyMemberId: 'ara' }))).toBe(false);
    expect(hasColour(entry({ tokenId: 'hero' }), { id: 'hero', vision: { enabled: true } } as TokenEntity)).toBe(false);
    expect(hasColour(entry({ tokenId: 'goblin' }), { id: 'goblin' } as TokenEntity)).toBe(true);
  });

  it('give a turn its flash: the card\'s colour, else the token\'s ring, else the accent', () => {
    expect(turnColor({ color: '#dc2626' }, { ringColor: '#22c55e' })).toBe('#dc2626');
    expect(turnColor({}, { ringColor: '#22c55e' })).toBe('#22c55e');
    expect(turnColor({}, undefined)).toBeNull();
    document.body.empty();
    const banner = renderTurnBanner(document.body, { key: 'k', round: null, title: 'Ara', portrait: null, color: '#22c55e' }, () => null);
    expect(banner.style.getPropertyValue('--atlas-turn-banner-flash')).toBe('#22c55e');
    expect(renderTurnBanner(document.body, { key: 'k', round: null, title: 'Ara', portrait: null }, () => null).style.getPropertyValue('--atlas-turn-banner-flash')).toBe('');
  });

  it('read only as #rrggbb', () => {
    expect(combatantColor({ color: '#DC2626' })).toBe('#DC2626');
    expect(combatantColor({ color: 'red' })).toBeNull();
    expect(combatantColor({})).toBeNull();
  });
});

describe('the players\' list', () => {
  const draw = (look: { pulse?: boolean; showNames?: boolean; turnFlash?: number }, entries: PlayerInitiativeEntry[]): HTMLElement => {
    document.body.empty();
    const list = playerInitiativeList({ entries, isActive: true, round: 1 }, () => ({ hp: null, showRing: false, side: 'opponents', defeated: false }), TURN_ORDER, false);
    renderPlayerInitiative(document.body, list, { showNames: false, portraitSrc: () => 'art.webp', ...look });
    return document.querySelector<HTMLElement>('.atlas-player-initiative')!;
  };

  it('pulses where the GM chose so', () => {
    expect(draw({ pulse: true }, [entry({ tokenId: 'a', imagePath: 'a.webp', isActive: true })]).classList.contains('atlas-player-initiative--pulse')).toBe(true);
    expect(draw({}, [entry({ tokenId: 'a' })]).classList.contains('atlas-player-initiative--pulse')).toBe(false);
  });

  it('flashes the border of who holds a turn that just began, taken up where a redraw left it', () => {
    const panel = draw({ turnFlash: 300 }, [entry({ tokenId: 'a', isActive: true }), entry({ tokenId: 'b', order: 1 })]);
    const flashing = [...panel.querySelectorAll<HTMLElement>('.atlas-player-initiative__card--turn-flash')];
    expect(flashing).toHaveLength(1);
    expect(flashing[0]?.classList.contains('atlas-player-initiative__card--active')).toBe(true);
    expect(flashing[0]?.style.getPropertyValue('--atlas-turn-flash-delay')).toBe('-300ms');
    expect(draw({}, [entry({ tokenId: 'a', isActive: true })]).querySelector('.atlas-player-initiative__card--turn-flash')).toBeNull();
  });

  it('keeps the size between 1 and the largest', () => {
    expect(initiativeScaleOf(1.5)).toBe(1.5);
    expect(initiativeScaleOf(9)).toBe(MAX_INITIATIVE_SCALE);
    expect(initiativeScaleOf(0.2)).toBe(1);
    expect(initiativeScaleOf('big')).toBe(1);
  });

  it('names a card without a portrait, and colours the card the GM coloured', () => {
    const panel = draw({}, [entry({ name: 'Enemy 1', color: '#dc2626' }), entry({ name: 'Goblin', tokenId: 'g', imagePath: 'g.webp', order: 1 })]);
    const names = [...panel.querySelectorAll('.atlas-player-initiative__name')].map((name) => name.textContent);
    expect(names).toEqual(['Enemy 1']);
    const coloured = panel.querySelector<HTMLElement>('.atlas-player-initiative__card--coloured');
    expect(coloured?.style.getPropertyValue('--atlas-combatant-color')).toBe('#dc2626');
    // Its turn flashes in that colour
    expect(coloured?.style.getPropertyValue('--atlas-turn-color')).toBe('#dc2626');
  });
});
