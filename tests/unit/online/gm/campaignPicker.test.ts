// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { CampaignChoice } from '../../../../src/app/online/gm/campaignChoices.ts';
import { campaignPick, matchesQuery, renderCampaignPicker, type CampaignPickerActions } from '../../../../src/app/online/gm/dock/campaignPicker.ts';
import { tableTitle, type OnlineSnapshot } from '../../../../src/app/online/gm/dock/panelModel.ts';

const choice = (id: string, over: Partial<CampaignChoice> = {}): CampaignChoice => ({ id, name: id.toUpperCase(), activity: 'Played 3d ago', players: 0, art: null, hue: 120, ...over });
const STRAHD = choice('strahd', { name: 'Curse of Strahd', players: 4 });
const CAVES = choice('caves', { name: 'Blue Mouth Caves', players: 1 });
const LIST = [STRAHD, CAVES];

function actions(): CampaignPickerActions & { [K in keyof CampaignPickerActions]: ReturnType<typeof vi.fn> } {
  return { choose: vi.fn(), search: vi.fn(), start: vi.fn(), openCampaigns: vi.fn() };
}

/** The picker with the caves picked, unless a test picks another. */
function picker(list: readonly CampaignChoice[] | null, picked: string | null = 'caves', query = ''): { layer: HTMLElement; rows: HTMLButtonElement[]; field: HTMLInputElement | null; does: ReturnType<typeof actions> } {
  const layer = document.body.createDiv();
  const does = actions();
  renderCampaignPicker(layer, campaignPick(list, picked, query), does);
  return { layer, rows: [...layer.querySelectorAll<HTMLButtonElement>('[role="radio"]')], field: layer.querySelector('input'), does };
}

function type(field: HTMLInputElement | null, text: string): void {
  if (field === null) throw new Error('no search field');
  field.value = text;
  field.dispatchEvent(new Event('input'));
}

const key = (target: Element | null | undefined, name: string): void => void target?.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));

describe('the campaign a table starts on', () => {
  it('is the one the GM picked while it is there, else the one played last', () => {
    expect(campaignPick(LIST, 'caves').chosen).toBe('caves');
    expect(campaignPick(LIST, 'gone').chosen).toBe('strahd');
    expect(campaignPick(LIST, null).chosen).toBe('strahd');
    expect(campaignPick([STRAHD, choice('other')], null).chosen).toBe('strahd');
    expect(campaignPick([], null).chosen).toBeNull();
    expect(campaignPick(null, 'strahd').chosen).toBeNull();
  });

  it('shows each campaign with its name, when it was played and its players, the chosen one checked', () => {
    const { rows } = picker(LIST);
    expect(rows.map((row) => row.querySelector('.atlas-online-campaign__name bdi')?.textContent)).toEqual(['Curse of Strahd', 'Blue Mouth Caves']);
    expect(rows.map((row) => row.querySelector('.atlas-online-campaign__meta')?.textContent)).toEqual(['Played 3d ago · 4 players', 'Played 3d ago · 1 player']);
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    // One tab stop, as a radio group has.
    expect(rows.map((row) => row.tabIndex)).toEqual([-1, 0]);
  });

  it('shows the world map, or the campaign\'s own tint where it has none', () => {
    const { rows } = picker([choice('a', { art: 'app://map.webp' }), choice('b')]);
    expect(rows[0]?.querySelector('img')?.getAttribute('src')).toBe('app://map.webp');
    expect(rows[1]?.querySelector('img')).toBeNull();
    expect(rows[1]?.querySelector('.campaign-emblem')).not.toBeNull();
  });

  it('is chosen by a click or the arrow keys, and Enter or a double click starts the table', () => {
    const { rows, does } = picker(LIST);
    rows[0]?.click();
    expect(does.choose).toHaveBeenLastCalledWith('strahd');
    rows[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(does.choose).toHaveBeenLastCalledWith('strahd');
    // The redrawn menu gives focus to the campaign chosen now.
    expect(rows[1]?.dataset.focusKey).toBe('campaign-strahd');
    rows[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(does.choose).toHaveBeenLastCalledWith('caves');
    rows[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    rows[0]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(does.start).toHaveBeenCalledTimes(2);
  });

  it('finds campaigns by any part of their name, without case or accents', () => {
    expect(matchesQuery('Curse of Strahd', 'strahd')).toBe(true);
    expect(matchesQuery('Éldritch Moon', ' eldr ')).toBe(true);
    expect(matchesQuery('Curse of Strahd', 'caves')).toBe(false);
    expect(matchesQuery('Anything', '')).toBe(true);
  });

  it('shows only what the search finds, and the first found takes the place of a chosen one it hides', () => {
    const { rows, field, does, layer } = picker(LIST);
    const none = layer.querySelector<HTMLElement>('.atlas-online-campaigns__none');
    expect(none?.hidden).toBe(true);
    type(field, 'curse');
    expect(does.search).toHaveBeenLastCalledWith('curse');
    expect(rows.map((row) => row.hidden)).toEqual([false, true]);
    expect(does.choose).toHaveBeenLastCalledWith('strahd');
    type(field, 'nothing');
    expect(rows.every((row) => row.hidden)).toBe(true);
    expect(none?.hidden).toBe(false);
  });

  it('keeps the chosen campaign while the search finds it', () => {
    const { rows, field, does } = picker([STRAHD, CAVES, choice('cavern', { name: 'Caverns Deep' })]);
    type(field, 'cave');
    expect(rows.map((row) => row.hidden)).toEqual([true, false, false]);
    expect(does.choose).not.toHaveBeenCalled();
  });

  it('draws again with what was typed, and the arrow keys skip what it hides', () => {
    const { rows, field, does } = picker([STRAHD, CAVES, choice('cavern', { name: 'Caverns Deep' })], 'cavern', 'cave');
    expect(field?.value).toBe('cave');
    expect(rows[0]?.hidden).toBe(true);
    key(rows[2], 'Home');
    expect(does.choose).toHaveBeenLastCalledWith('caves');
    key(rows[1], 'ArrowUp');
    expect(document.activeElement).toBe(field);
  });

  it('starts from the search with Enter while it finds something, and goes down into the list', () => {
    const { rows, field, does } = picker(LIST);
    key(field, 'ArrowDown');
    expect(document.activeElement).toBe(rows[1]);
    key(field, 'Enter');
    expect(does.start).toHaveBeenCalledTimes(1);
    type(field, 'nothing');
    key(field, 'Enter');
    expect(does.start).toHaveBeenCalledTimes(1);
  });

  it('clears the search with its button', () => {
    const { rows, field, does, layer } = picker(LIST, null, 'curse');
    const clear = layer.querySelector<HTMLButtonElement>('.atlas-online-campaigns__search-clear');
    expect(clear?.hidden).toBe(false);
    clear?.click();
    expect(field?.value).toBe('');
    expect(does.search).toHaveBeenLastCalledWith('');
    expect(rows.some((row) => row.hidden)).toBe(false);
    expect(clear?.hidden).toBe(true);
  });

  it('offers the dashboard to a vault without campaigns, and waits for them while they are read', () => {
    const empty = picker([]);
    expect(empty.rows).toHaveLength(0);
    empty.layer.querySelector<HTMLButtonElement>('.atlas-online-button')?.click();
    expect(empty.does.openCampaigns).toHaveBeenCalledTimes(1);
    expect(picker(null).layer.textContent).toContain('Reading your campaigns');
  });

  it('names a running table by its campaign', () => {
    const running = { campaignId: 'strahd' } as OnlineSnapshot;
    expect(tableTitle(running, campaignPick(LIST, null))).toBe('Curse of Strahd');
    expect(tableTitle({ campaignId: null } as OnlineSnapshot, campaignPick(LIST, null))).toBe('Online table');
  });
});
