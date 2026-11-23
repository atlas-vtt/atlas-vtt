// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';

const state = vi.hoisted(() => ({
  objects: { tokens: {} as Record<string, unknown> },
  tokenSettings: { showInstanceBadges: true },
  selectedIds: [] as string[],
  conditionsShownEntry: null as string | null,
  showCombatantConditions: (): void => undefined,
  hideCombatantConditions: (): void => undefined,
}));
const view = vi.hoisted(() => ({ trueScale: false }));

const CONDITIONS: ConditionDefinition[] = ['Blinded', 'Charmed', 'Frightened', 'Poisoned', 'Prone'].map((name) => ({ id: name.toLowerCase(), name, color: '#aa3300' }));
const ALL = CONDITIONS.map(({ id }) => id);

vi.mock('../../src/app/react/root/AtlasUIContext', async () => ({
  AtlasUIContext: (await import('react')).createContext(null), useAtlasUI: () => ({ app: null, view: null }) }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (s: typeof state) => unknown) => selector(state),
  useViewStoreHook: () => ({ getState: () => state, subscribe: () => () => undefined }),
}));
vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn() }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../src/app/react/hooks/useMapConditions', () => ({ useMapConditions: () => CONDITIONS }));
vi.mock('../../src/app/react/hooks/useTrueScale', () => ({ useTrueScale: () => view.trueScale }));

import { InitiativeCard } from '../../src/app/react/components/InitiativeCard';
import { entryTokenOf, playerInitiativeList, renderPlayerInitiative, type PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import { sharedConditions } from '../../src/app/online/gm/tokenUI';
import { parseCondition } from '../../src/app/online/protocol/tokenUI';
import { resolveActiveConditions } from '../../src/app/utils/activeConditions';
import type { TokenEntity } from '../../src/app/types';

const entry: InitiativeEntry = { id: 'e', tokenId: 't', name: 'Troll', initiative: 12, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order: 0 };
const troll = (extra: Partial<TokenEntity> = {}): TokenEntity => ({ id: 't', kind: 'character', name: 'Troll', imagePath: '', x: 0, y: 0, conditions: ALL.slice(0, 2), ...extra } as TokenEntity);

/** The names the GM's card shows its conditions by, the count last. */
function gmCard(token: TokenEntity | undefined, cardEntry: InitiativeEntry = entry): string[] {
  state.objects.tokens = token ? { t: token } : {};
  const { container, unmount } = render(<InitiativeCard entry={cardEntry} isHoveredForPreview={false} onContextMenu={vi.fn()} onHover={vi.fn()} />);
  const names = [...container.querySelectorAll('.atlas-initiative-card__conditions [role="listitem"]')].map((item) => item.getAttribute('aria-label') ?? '');
  unmount();
  return names;
}

afterEach(() => { view.trueScale = false; state.conditionsShownEntry = null; document.body.empty(); });

describe('conditions on the GM\'s initiative cards', () => {
  it('stay on the token of a combatant on the map, which shows them', () => {
    expect(gmCard(troll())).toEqual([]);
  });

  it('show on a combatant kept beside the map, and on one without a token', () => {
    expect(gmCard(troll({ offMap: true }))).toEqual(['Blinded', 'Charmed']);
    expect(gmCard(undefined, { ...entry, tokenId: undefined, conditions: ['prone'] })).toEqual(['Prone']);
  });

  it('show on every card while players see the TV at true scale, three and a count naming the rest', () => {
    view.trueScale = true;
    expect(gmCard(troll({ conditions: ALL }))).toEqual(['Blinded', 'Charmed', 'Frightened', 'Poisoned and Prone']);
  });
});

describe('the tooltip a hovered card opens', () => {
  it('names every condition its combatant is under, also those its card leaves to the token', () => {
    state.conditionsShownEntry = 'e';
    state.objects.tokens = { t: troll({ conditions: ALL }) };
    const { unmount } = render(<InitiativeCard entry={entry} isHoveredForPreview={false} onContextMenu={vi.fn()} onHover={vi.fn()} />);
    const rows = [...document.querySelectorAll('.tooltip-content .atlas-initiative-conditions-tip__name')].map((name) => name.textContent);
    expect(rows).toEqual(['Blinded', 'Charmed', 'Frightened', 'Poisoned', 'Prone']);
    unmount();
  });

  it('stays shut while the statblock preview shows, and for a combatant without conditions', () => {
    state.conditionsShownEntry = 'e';
    state.objects.tokens = { t: troll() };
    const preview = render(<InitiativeCard entry={entry} isHoveredForPreview onContextMenu={vi.fn()} onHover={vi.fn()} />);
    expect(document.querySelector('.atlas-initiative-conditions-tip')).toBeNull();
    preview.unmount();
    state.objects.tokens = { t: troll({ conditions: [] }) };
    render(<InitiativeCard entry={entry} isHoveredForPreview={false} onContextMenu={vi.fn()} onHover={vi.fn()} />).unmount();
    expect(document.querySelector('.atlas-initiative-conditions-tip')).toBeNull();
  });
});

describe('conditions on the players\' initiative cards', () => {
  /** The names the players' card of `token` (none: an enemy added by name) shows its conditions by. */
  function playersCard(token: TokenEntity | undefined, trueScale = false, conditionsShown?: string): string[] {
    document.body.empty();
    const listed: PlayerInitiativeEntry = { name: 'Troll', initiative: 12, imagePath: '', order: 0, isActive: true, ...(token && { tokenId: 't' }) };
    const shown = { ...entryTokenOf(token, [], CONDITIONS), conditions: resolveActiveConditions(token ?? { conditions: ['prone'] }, CONDITIONS) };
    const list = playerInitiativeList({ entries: [listed], isActive: true, round: 1 }, () => shown, { mode: 'turn-order', roll: '1d20', firstSide: 'players' }, false);
    renderPlayerInitiative(document.body, list, { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, trueScale, conditionsShown });
    return [...document.querySelectorAll('.atlas-initiative-card__conditions [role="listitem"]')].map((item) => item.getAttribute('aria-label') ?? '');
  }

  it('follow the GM\'s: none for a token on the map, unless at true scale; a token beside the map or none shows them', () => {
    expect(playersCard(troll())).toEqual([]);
    expect(playersCard(troll(), true)).toEqual(['Blinded', 'Charmed']);
    expect(playersCard(troll({ offMap: true }))).toEqual(['Blinded', 'Charmed']);
    expect(playersCard(undefined)).toEqual(['Prone']);
  });

  it('name them all beside the list while the GM hovers the combatant in the tracker', () => {
    const tip = (): string[] => [...document.querySelectorAll('.atlas-player-initiative__conditions-tip .atlas-initiative-conditions-tip__name')].map((name) => name.textContent ?? '');
    playersCard(troll(), false, 't');
    expect(tip()).toEqual(['Blinded', 'Charmed']);
    playersCard(troll(), false, 'someone else');
    expect(tip()).toEqual([]);
    playersCard(troll({ conditions: [] }), false, 't');
    expect(tip()).toEqual([]);
  });
});

describe('condition names sent to online players', () => {
  it('name each badge without its number, and an older page reads badges without names', () => {
    const valued: ConditionDefinition = { id: 'frightened', name: ' Frightened ', color: '#aa3300', valued: true };
    const [shared] = sharedConditions(resolveActiveConditions({ conditions: ['frightened'], conditionValues: { frightened: 2 } }, [valued]), new Map([['frightened', valued.name]]));
    expect(shared).toEqual({ colour: '#aa3300', glyph: { kind: 'text', text: 'F' }, value: 2, name: 'Frightened' });
    expect(parseCondition(shared)).toEqual(shared);
    expect(parseCondition({ ...shared, name: 'x'.repeat(81) })).toEqual({ colour: '#aa3300', glyph: { kind: 'text', text: 'F' }, value: 2 });
  });
});
