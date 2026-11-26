// @vitest-environment jsdom
import { produce } from 'immer';
import { describe, expect, it, vi } from 'vitest';
import { collectionEnemyImage, isTokenlessEnemy, nextTokenlessEnemy } from '../../src/app/initiative/tokenlessEnemies';
import { mapEnemyImage } from '../../src/app/initiative/mapParty';
import { AssetService } from '../../src/app/services/AssetService';
import type { App } from 'obsidian';
import { turnColor } from '../../src/app/initiative/turnColor';
import { renderTurnBanner } from '../../src/app/initiative/banner/turnBannerElement';
import { createInitiativeActions } from '../../src/app/stores/initiativeSlice';
import type { PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import { initiativeScaleOf, MAX_INITIATIVE_SCALE, renderPlayerInitiative } from '../../src/app/services/playerInitiativeView';
import { initiativeCardMenu } from '../../src/app/react/components/initiativeCardMenu';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import { playersListOf } from '../helpers/playersInitiative';
import { NO_RULES } from '../mocks/rulesLookup';

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
    // No colour of its own
    expect('color' in added).toBe(false);
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
    // An entry whose token is gone is still left out
    const listed = playersListOf({ isActive: false, round: 0, entries: [enemy, entry({ name: 'Gone', tokenId: 'gone', order: 1 })] }).combatants;
    expect(listed.map(({ entry: shown, token }) => [shown.name, token.side])).toEqual([['Enemy 1', 'opponents']]);
    // Its side is passed by while it, the side's only combatant, sits the round out
    let state = {
      initiative: { ...createDefaultInitiativeState(), entries: [entry({ name: 'Hero', tokenId: 'hero' }), { ...enemy, order: 1 }] },
      initiativeTrackerOpen: true,
      objects: { tokens: { hero: { id: 'hero', kind: 'token', x: 0, y: 0, imagePath: '', side: 'players' } as TokenEntity } },
    };
    const actions = createInitiativeActions((recipe) => { state = produce(state, recipe); }, () => state, { rules: NO_RULES, random: () => 0 });
    actions.startCombat({ ...TURN_ORDER, mode: 'sides' });
    actions.setInitiativeSitsOut('Enemy 1', true);
    actions.nextTurn();
    expect([state.initiative.round, state.initiative.sides?.active]).toEqual([2, 'players']);
  });

  it('are rolled, never moved, can be hidden from the players, and take no colour', () => {
    const noop = (): void => undefined;
    const menu = initiativeCardMenu(entry({ name: 'Enemy 1' }), undefined, { bySides: false, sides: [], cards: false, fightRuns: false, swapTargets: [] }, {
      roll: noop, moveToFront: noop, moveToBack: noop, edit: noop, updateToken: noop, setSitsOut: noop, swapCard: noop,
      delay: noop, actNow: noop, placeOnMap: noop, remove: noop, setHiddenFromPlayers: noop,
    });
    const labels = menu.flatMap((item) => (item.type === 'custom' ? [] : [item.label]));
    expect(labels).toContain('Roll Initiative');
    expect(labels).toContain('Hide from Players');
    expect(labels).not.toContain('Colour');
  });
});

describe('turn colours', () => {
  it('give a turn its flash: the token\'s ring, else the accent', () => {
    expect(turnColor({ ringColor: '#22c55e' })).toBe('#22c55e');
    expect(turnColor(undefined)).toBeNull();
    document.body.empty();
    const banner = renderTurnBanner(document.body, { key: 'k', round: null, title: 'Ara', portrait: null, color: '#22c55e' }, () => null);
    expect(banner.style.getPropertyValue('--atlas-turn-banner-flash')).toBe('#22c55e');
    expect(renderTurnBanner(document.body, { key: 'k', round: null, title: 'Ara', portrait: null }, () => null).style.getPropertyValue('--atlas-turn-banner-flash')).toBe('');
  });
});

describe('the players\' list', () => {
  const draw = (look: { pulse?: boolean; showNames?: boolean; turnFlash?: number; artViewBox?: (imagePath: string, apply: (viewBox: string) => void) => void }, entries: PlayerInitiativeEntry[]): HTMLElement => {
    document.body.empty();
    const tokens = Object.fromEntries(['a', 'b', 'g'].map((id): [string, TokenEntity] => [id, { id, kind: 'token', x: 0, y: 0, imagePath: '', showRing: false }]));
    const list = playersListOf({ entries, isActive: true, round: 1 }, tokens, { initiative: TURN_ORDER });
    renderPlayerInitiative(document.body, list, { showNames: false, portraitSrc: () => 'art.webp', ...look });
    return document.querySelector<HTMLElement>('.atlas-player-initiative')!;
  };

  it('pulses where the GM chose so', () => {
    expect(draw({ pulse: true }, [entry({ tokenId: 'a', imagePath: 'a.webp', isActive: true })]).classList.contains('atlas-player-initiative--pulse')).toBe(true);
    expect(draw({}, [entry({ tokenId: 'a' })]).classList.contains('atlas-player-initiative--pulse')).toBe(false);
  });

  it('flashes the border of who holds a turn that just began, taken up where a redraw left it', () => {
    const panel = draw({ turnFlash: 300 }, [entry({ tokenId: 'a', isActive: true }), entry({ tokenId: 'b', order: 1 })]);
    const flashing = [...panel.querySelectorAll<HTMLElement>('.atlas-initiative-card--turn-flash')];
    expect(flashing).toHaveLength(1);
    expect(flashing[0]?.classList.contains('atlas-initiative-card--active')).toBe(true);
    expect(flashing[0]?.style.getPropertyValue('--atlas-turn-flash-delay')).toBe('-300ms');
    expect(draw({}, [entry({ tokenId: 'a', isActive: true })]).querySelector('.atlas-initiative-card--turn-flash')).toBeNull();
  });

  it('shows a portrait\'s art without the transparent margins its image has, as the GM\'s card does', () => {
    const asked: string[] = [];
    const panel = draw({ artViewBox: (imagePath, apply) => { asked.push(imagePath); apply('inset(10.00% 20.00% 10.00% 20.00%)'); } }, [entry({ tokenId: 'a', imagePath: 'a.webp' })]);
    expect(asked).toEqual(['a.webp']);
    expect(panel.querySelector<HTMLElement>('.atlas-initiative-card__art img')?.style.getPropertyValue('--atlas-art-view-box')).toBe('inset(10.00% 20.00% 10.00% 20.00%)');
  });

  it('keeps the size between 1 and the largest', () => {
    expect(initiativeScaleOf(1.5)).toBe(1.5);
    expect(initiativeScaleOf(9)).toBe(MAX_INITIATIVE_SCALE);
    expect(initiativeScaleOf(0.2)).toBe(1);
    expect(initiativeScaleOf('big')).toBe(1);
  });

  it('names a card without a portrait, and draws no colour an older file gave it', () => {
    const panel = draw({}, [entry({ name: 'Enemy 1', color: '#dc2626' } as never), entry({ name: 'Goblin', tokenId: 'g', imagePath: 'g.webp', order: 1 })]);
    const names = [...panel.querySelectorAll('.atlas-initiative-card__name')].map((name) => name.textContent);
    expect(names).toEqual(['Enemy 1']);
    expect(panel.querySelector('.atlas-initiative-card--coloured')).toBeNull();
  });
});
