// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { MenuEntry } from '../../../../src/app/online/gm/dock/dockMenu.ts';
import { groupsOf, type OnlineSnapshot, type SceneFacts } from '../../../../src/app/online/gm/dock/panelModel.ts';
import { renderPlayerList, type ListActions } from '../../../../src/app/online/gm/dock/playerList.ts';

const menus = vi.hoisted(() => ({ opened: [] as (readonly MenuEntry[])[] }));
vi.mock('../../../../src/app/online/gm/dock/dockMenu.ts', () => ({ openMenuBelow: (entries: readonly MenuEntry[]) => menus.opened.push(entries) }));

const ANA = { id: 'a'.repeat(20), name: 'Ana', online: true };
const BEN = { id: 'b'.repeat(20), name: 'Ben', online: false };

const SCENE: SceneFacts = {
  isShared: true,
  selected: [],
  tokens: {
    cleric: { id: 'cleric', imagePath: 'art/cleric.png', showRing: true, ringColor: '#aa0000' },
    wolf: { id: 'wolf', imagePath: 'art/wolf.png' },
    bear: { id: 'bear', imagePath: 'art/bear.png' },
  } as unknown as SceneFacts['tokens'],
};

const snapshot = (over: Partial<OnlineSnapshot>): OnlineSnapshot => ({ status: 'online', link: null, campaignId: null, sharedLeaf: null, sharedName: null, sharedTokens: {}, players: [], playerTokens: [], seats: null, gate: null, rests: [], cardOrder: [], ...over });

function actions(): ListActions & { selectToken: ReturnType<typeof vi.fn<(id: string) => void>> } {
  return { selectToken: vi.fn<(id: string) => void>(), assign: vi.fn(), release: vi.fn(), unmark: vi.fn(), kick: vi.fn(), copyPlayerCode: vi.fn(() => Promise.resolve(true)), newPlayerCode: vi.fn(), askRename: vi.fn(), askRemoveFromCampaign: vi.fn(), playerPrompt: () => false, selected: () => [], imageSrc: (path) => `app://vault/${path}` };
}

function list(over: Partial<OnlineSnapshot>): { el: HTMLElement; does: ReturnType<typeof actions> } {
  const does = actions();
  const shot = snapshot(over);
  const el = renderPlayerList(document.body.createDiv(), groupsOf(shot, SCENE), shot.players, does);
  return { el, does };
}

/** What the GM reads in a row, without what only a screen reader hears. */
const shown = (row: Element): string => [...row.querySelectorAll('.atlas-online-player__name, .atlas-online-token__name')].map((part) => part.textContent ?? '').join(' | ');

describe('the players of an online table', () => {
  it('shows a player who plays a token as one entry: the token as their picture, under the name they chose', () => {
    const { el } = list({ players: [ANA], playerTokens: [{ tokenId: 'cleric', label: 'Cleric', ownerId: ANA.id }] });
    expect(el.querySelectorAll('.atlas-online-player')).toHaveLength(1);
    expect(el.querySelectorAll('.atlas-online-token')).toHaveLength(0);
    const row = el.querySelector('.atlas-online-player');
    expect(shown(row!)).toBe('Ana');
    const picture = row?.querySelector('.atlas-online-avatar');
    expect(picture?.querySelector('img')?.getAttribute('src')).toBe('app://vault/art/cleric.png');
    expect(picture?.textContent).toBe('');
    expect(picture?.classList.contains('atlas-online-tone--green')).toBe(true);
    // Which token it is stays said for a screen reader.
    expect(row?.querySelector('.atlas-online-sr-only')?.textContent).toBe('Online, plays Cleric');
  });

  it('keeps the initial for a player without a token, and says who is away', () => {
    const { el } = list({ players: [BEN], playerTokens: [] });
    const picture = el.querySelector('.atlas-online-player .atlas-online-avatar');
    expect(picture?.textContent).toBe('B');
    expect(picture?.querySelector('img')).toBeNull();
    expect(picture?.classList.contains('atlas-online-tone--muted')).toBe(true);
    expect(el.querySelector('.atlas-online-sr-only')?.textContent).toBe('Away');
  });

  it('lists a player\'s further tokens under them, and the tokens nobody plays under Not assigned', () => {
    const { el } = list({ players: [ANA], playerTokens: [{ tokenId: 'cleric', label: 'Cleric', ownerId: ANA.id }, { tokenId: 'wolf', label: 'Wolf', ownerId: ANA.id }, { tokenId: 'bear', label: 'Bear', ownerId: null }] });
    const groups = [...el.querySelectorAll('.atlas-online-group')];
    expect(groups).toHaveLength(2);
    expect([...groups[0]!.querySelectorAll('.atlas-online-token__name')].map((name) => name.textContent)).toEqual(['Wolf']);
    expect(groups[1]?.querySelector('.atlas-online-group-label')?.textContent).toBe('Not assigned');
    expect([...groups[1]!.querySelectorAll('.atlas-online-token__name')].map((name) => name.textContent)).toEqual(['Bear']);
  });

  it('selects the player\'s token on the map when their picture or name is pressed', () => {
    const { el, does } = list({ players: [ANA], playerTokens: [{ tokenId: 'cleric', label: 'Cleric', ownerId: ANA.id }] });
    el.querySelector<HTMLButtonElement>('.atlas-online-player__main')?.click();
    expect(does.selectToken).toHaveBeenCalledWith('cleric');
  });

  describe('the player\'s menu', () => {
    /** The rows of the menu the player's options button opens. */
    function menuOf(el: HTMLElement): readonly MenuEntry[] {
      menus.opened.length = 0;
      el.querySelector<HTMLButtonElement>('.atlas-online-player__more')?.click();
      const entries = menus.opened.at(-1);
      if (entries === undefined) throw new Error('no menu opened');
      return entries;
    }
    const titles = (entries: readonly MenuEntry[]): string[] => entries.map((entry) => entry.title);
    const run = (entries: readonly MenuEntry[], title: string): void => entries.find((entry) => entry.title === title)?.run();

    it('releases the token the player is shown by alone, and keeps their other tokens', () => {
      const { el, does } = list({ players: [ANA], playerTokens: [{ tokenId: 'cleric', label: 'Cleric', ownerId: ANA.id }, { tokenId: 'wolf', label: 'Wolf', ownerId: ANA.id }] });
      const entries = menuOf(el);
      expect(titles(entries)).toEqual(['Assign selected tokens here', 'Release Cleric', 'Release all', 'Copy code', 'New code', 'Rename…', 'Remove from table', 'Remove from campaign']);
      run(entries, 'Release Cleric');
      expect(does.release).toHaveBeenCalledWith(['cleric']);
      run(entries, 'Release all');
      expect(does.release).toHaveBeenLastCalledWith(['cleric', 'wolf']);
    });

    it('offers one release for a player with one token, and none to run for a player without', () => {
      const one = menuOf(list({ players: [ANA], playerTokens: [{ tokenId: 'cleric', label: 'Cleric', ownerId: ANA.id }] }).el);
      expect(titles(one)).toEqual(['Assign selected tokens here', 'Release Cleric', 'Copy code', 'New code', 'Rename…', 'Remove from table', 'Remove from campaign']);
      const none = menuOf(list({ players: [BEN], playerTokens: [] }).el);
      expect(none.find((entry) => entry.title === 'Release all')?.disabled).toBe(true);
    });
  });
});

describe('a player of the campaign', () => {
  const menuOf = (el: HTMLElement): readonly MenuEntry[] => {
    menus.opened.length = 0;
    el.querySelector<HTMLButtonElement>('.atlas-online-player__more')?.click();
    return menus.opened.at(-1) ?? [];
  };
  const run = (entries: readonly MenuEntry[], title: string): void => entries.find((entry) => entry.title === title)?.run();

  it('has a menu that copies the code, makes a new one, renames and removes, each for that player', () => {
    const { el, does } = list({ players: [ANA, BEN] });
    const entries = menuOf(el);
    run(entries, 'Copy code');
    run(entries, 'New code');
    run(entries, 'Rename…');
    run(entries, 'Remove from table');
    run(entries, 'Remove from campaign');
    expect(does.copyPlayerCode).toHaveBeenCalledWith(ANA.id);
    expect(does.newPlayerCode).toHaveBeenCalledWith(ANA.id);
    expect(does.askRename).toHaveBeenCalledWith(expect.objectContaining({ id: ANA.id, name: 'Ana' }));
    expect(does.kick).toHaveBeenCalledWith(ANA.id);
    expect(does.askRemoveFromCampaign).toHaveBeenCalledWith(expect.objectContaining({ id: ANA.id, name: 'Ana' }));
  });

  it('ends the menu with the rows that take the player away, each apart from what comes before', () => {
    const entries = menuOf(list({ players: [ANA] }).el);
    expect(entries.slice(-2).map((entry) => [entry.title, entry.warning])).toEqual([['Remove from table', true], ['Remove from campaign', true]]);
    expect(entries.find((entry) => entry.title === 'Remove from table')?.apart).toBe(true);
    expect(entries.find((entry) => entry.title === 'Copy code')?.apart).toBe(true);
  });

  it('never has a code in the list: no digits, no field', () => {
    const { el } = list({ players: [ANA, BEN], playerTokens: [{ tokenId: 'cleric', label: 'Cleric', ownerId: ANA.id }] });
    expect(el.textContent).not.toMatch(/\d/);
    expect(el.querySelector('input')).toBeNull();
  });
});

describe('a player whose token is released alone', () => {
  it('is shown by their next token, which has no row of its own any more', () => {
    const before = groupsOf(snapshot({ players: [ANA], playerTokens: [{ tokenId: 'cleric', label: 'Cleric', ownerId: ANA.id }, { tokenId: 'wolf', label: 'Wolf', ownerId: ANA.id }, { tokenId: 'bear', label: 'Bear', ownerId: ANA.id }] }), SCENE);
    expect(before[0]?.face?.tokenId).toBe('cleric');
    const after = groupsOf(snapshot({ players: [ANA], playerTokens: [{ tokenId: 'cleric', label: 'Cleric', ownerId: null }, { tokenId: 'wolf', label: 'Wolf', ownerId: ANA.id }, { tokenId: 'bear', label: 'Bear', ownerId: ANA.id }] }), SCENE);
    expect(after[0]?.face?.tokenId).toBe('wolf');
    expect(after[0]?.tokens.map((token) => token.tokenId)).toEqual(['bear']);
    expect(after[1]?.player).toBeNull();
    expect(after[1]?.tokens.map((token) => token.tokenId)).toEqual(['cleric']);
  });
});
