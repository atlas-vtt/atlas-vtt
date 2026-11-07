// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuEntry } from '../../../../src/app/online/gm/dock/dockMenu.ts';
import { renderMenu, type MenuActions } from '../../../../src/app/online/gm/dock/ConnectionMenu.ts';
import { renderPanel, panelView, type PanelActions } from '../../../../src/app/online/gm/dock/OnlinePanel.ts';
import { menuModel, type OnlineSnapshot, type SceneFacts } from '../../../../src/app/online/gm/dock/panelModel.ts';
import { renderKnocks } from '../../../../src/app/online/gm/dock/knockStack.ts';

const menus = vi.hoisted(() => ({ opened: [] as (readonly MenuEntry[])[] }));
vi.mock('../../../../src/app/online/gm/dock/dockMenu.ts', () => ({ openMenuBelow: (entries: readonly MenuEntry[]) => menus.opened.push(entries) }));

const ANA = { id: 'a'.repeat(20), name: 'Ana', online: true };
const SCENE: SceneFacts = { isShared: true, tokens: {}, selected: [] };
const feedback = { open: false, diagnostics: false, state: 'idle', errorReports: false } as const;

const snapshot = (over: Partial<OnlineSnapshot> = {}): OnlineSnapshot => ({ status: 'online', link: 'https://play.atlas-vtt.dev/#code', campaignId: null, sharedLeaf: null, sharedName: null, sharedTokens: {}, players: [ANA], playerTokens: [], seats: null, gate: null, rests: [], cardOrder: [], ...over });

function actions(): PanelActions {
  return {
    selectToken: vi.fn(), assign: vi.fn(), release: vi.fn(), unmark: vi.fn(), mark: vi.fn(), kick: vi.fn(), selected: () => [], imageSrc: (path) => path,
    copyPlayerCode: vi.fn(() => Promise.resolve(true)), newPlayerCode: vi.fn(), renamePlayer: vi.fn(), removeFromCampaign: vi.fn(), addPlayer: vi.fn(() => ({ id: 'd'.repeat(20), name: 'Dora', code: '731904' })), newLink: vi.fn(),
    start: vi.fn(), choose: vi.fn(), search: vi.fn(), openCampaigns: vi.fn(), stop: vi.fn(), share: vi.fn(), copy: () => Promise.resolve(true), toggleQr: vi.fn(), close: vi.fn(), hideImage: vi.fn(), openAccountPage: vi.fn(),
    newCode: vi.fn(), copyCode: vi.fn(), setRequireCode: vi.fn(), setAskToJoin: vi.fn(),
    toggleFeedback: vi.fn(), feedbackText: () => '', setFeedbackText: vi.fn(), setFeedbackDiagnostics: vi.fn(), sendFeedback: vi.fn(), setErrorReports: vi.fn(),
  } as unknown as PanelActions;
}

function panel(): { layer: HTMLElement; does: PanelActions; redraw(players?: OnlineSnapshot['players']): void } {
  const layer = document.body.createDiv();
  const does = actions();
  const redraw = (players: OnlineSnapshot['players'] = [ANA]): void => renderPanel(layer, panelView(snapshot({ players }), SCENE, feedback), does);
  redraw();
  return { layer, does, redraw };
}

const press = (layer: HTMLElement, text: string): void => {
  const button = [...layer.querySelectorAll('button')].find((candidate) => candidate.textContent === text);
  if (button === undefined) throw new Error(`no button "${text}"`);
  button.click();
};

const rowOf = (entries: readonly MenuEntry[], title: string): MenuEntry => {
  const entry = entries.find((candidate) => candidate.title === title);
  if (entry === undefined) throw new Error(`no row "${title}"`);
  return entry;
};

beforeEach(() => {
  // jsdom has no CSS.escape, which the panel's focus keeping needs.
  (globalThis as { CSS?: unknown }).CSS ??= { escape: (value: string) => value };
  menus.opened.length = 0;
  document.body.empty();
});

describe('removing a player from the campaign', () => {
  it('asks first, and only the confirmation removes them', () => {
    const { layer, does } = panel();
    layer.querySelector<HTMLButtonElement>('.atlas-online-player__more')?.click();
    rowOf(menus.opened.at(-1)!, 'Remove from campaign').run();
    expect(does.removeFromCampaign).not.toHaveBeenCalled();
    expect(layer.querySelector('.atlas-online-confirm__text')?.textContent).toBe('Remove Ana from the campaign?');
    press(layer, 'Cancel');
    expect(layer.querySelector('.atlas-online-confirm')).toBeNull();
    expect(does.removeFromCampaign).not.toHaveBeenCalled();
    rowOf(menus.opened.at(-1)!, 'Remove from campaign').run();
    press(layer, 'Remove');
    expect(does.removeFromCampaign).toHaveBeenCalledWith(ANA.id);
    expect(layer.querySelector('.atlas-online-confirm')).toBeNull();
  });

  it('keeps the question over a redraw the table causes', () => {
    const { layer, redraw } = panel();
    layer.querySelector<HTMLButtonElement>('.atlas-online-player__more')?.click();
    rowOf(menus.opened.at(-1)!, 'Remove from campaign').run();
    redraw();
    expect(layer.querySelectorAll('.atlas-online-confirm')).toHaveLength(1);
  });

  it('asks in place of the player\'s row, where the GM clicked', () => {
    const { layer } = panel();
    layer.querySelector<HTMLButtonElement>('.atlas-online-player__more')?.click();
    rowOf(menus.opened.at(-1)!, 'Remove from campaign').run();
    const question = layer.querySelector('.atlas-online-confirm');
    expect(question?.closest('.atlas-online-group')).not.toBeNull();
    expect(question?.classList.contains('atlas-online-player-prompt')).toBe(true);
    expect(layer.querySelector('.atlas-online-player')).toBeNull();
    press(layer, 'Cancel');
    expect(layer.querySelector('.atlas-online-player')).not.toBeNull();
  });

  it('goes with a player who leaves while it is open', () => {
    const { layer, redraw } = panel();
    layer.querySelector<HTMLButtonElement>('.atlas-online-player__more')?.click();
    rowOf(menus.opened.at(-1)!, 'Remove from campaign').run();
    redraw([]);
    expect(layer.querySelector('.atlas-online-confirm')).toBeNull();
    redraw();
    expect(layer.querySelector('.atlas-online-confirm')).toBeNull();
    expect(layer.querySelector('.atlas-online-player')).not.toBeNull();
  });
});

describe('renaming a player', () => {
  it('asks for the name with the old one in the field, and sends the new one', () => {
    const { layer, does } = panel();
    layer.querySelector<HTMLButtonElement>('.atlas-online-player__more')?.click();
    rowOf(menus.opened.at(-1)!, 'Rename…').run();
    const field = layer.querySelector<HTMLInputElement>('input.atlas-online-prompt__input');
    expect(field?.value).toBe('Ana');
    expect(field?.closest('.atlas-online-group')).not.toBeNull();
    field!.value = '  Anna ';
    field!.dispatchEvent(new Event('input'));
    press(layer, 'Rename');
    expect(does.renamePlayer).toHaveBeenCalledWith(ANA.id, 'Anna');
    expect(layer.querySelector('.atlas-online-prompt')).toBeNull();
  });

  it('sends nothing for a name that is empty', () => {
    const { layer, does } = panel();
    layer.querySelector<HTMLButtonElement>('.atlas-online-player__more')?.click();
    rowOf(menus.opened.at(-1)!, 'Rename…').run();
    const field = layer.querySelector<HTMLInputElement>('input.atlas-online-prompt__input')!;
    field.value = '   ';
    field.dispatchEvent(new Event('input'));
    press(layer, 'Rename');
    expect(does.renamePlayer).not.toHaveBeenCalled();
  });
});

describe('adding a player', () => {
  it('asks for a name, then shows that player\'s code once with a way to copy it', async () => {
    const { layer, does } = panel();
    press(layer, 'Add player');
    const field = layer.querySelector<HTMLInputElement>('input.atlas-online-prompt__input')!;
    expect(field.value).toBe('');
    field.value = 'Dora';
    field.dispatchEvent(new Event('input'));
    press(layer, 'Add');
    expect(does.addPlayer).toHaveBeenCalledWith('Dora');
    expect(layer.querySelector('.atlas-online-code-row')?.textContent).toContain('731 904');
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    layer.querySelector<HTMLButtonElement>('.atlas-online-code-row')?.click();
    await Promise.resolve();
    expect(write).toHaveBeenCalledWith('731 904');
    press(layer, 'Done');
    expect(layer.textContent).not.toContain('731');
  });

  it('keeps the name field open while no player could be added', () => {
    const { layer, does } = panel();
    vi.mocked(does.addPlayer).mockReturnValue(null);
    press(layer, 'Add player');
    const field = layer.querySelector<HTMLInputElement>('input.atlas-online-prompt__input')!;
    field.value = 'Dora';
    field.dispatchEvent(new Event('input'));
    press(layer, 'Add');
    expect(layer.querySelector('input.atlas-online-prompt__input')).not.toBeNull();
  });
});

describe('adding the first player', () => {
  it('can be done from the menu a campaign without players opens to, with the code shown once', () => {
    const layer = document.body.createDiv();
    const does = actions() as unknown as MenuActions;
    renderMenu(layer, menuModel(snapshot({ players: [] }), SCENE, { kind: 'signed-out', notice: null }), does);
    expect(layer.querySelector('.atlas-online-list')).toBeNull();
    press(layer, 'Add player');
    const field = layer.querySelector<HTMLInputElement>('input.atlas-online-prompt__input')!;
    field.value = 'Dora';
    field.dispatchEvent(new Event('input'));
    press(layer, 'Add');
    expect(does.addPlayer).toHaveBeenCalledWith('Dora');
    expect(layer.querySelector('.atlas-online-code-row')?.textContent).toContain('731 904');
    press(layer, 'Done');
    expect(layer.textContent).not.toContain('731');
  });
});

describe('the link', () => {
  it('has a menu with New link that asks first in the panel', () => {
    const { layer, does } = panel();
    layer.querySelector<HTMLButtonElement>('.atlas-online-invite__more')?.click();
    expect(menus.opened.at(-1)!.map((entry) => entry.title)).toEqual(['New link']);
    rowOf(menus.opened.at(-1)!, 'New link').run();
    expect(does.newLink).not.toHaveBeenCalled();
    expect(layer.querySelector('.atlas-online-confirm__text')?.textContent).toBe('The old link stops working. Players need the new one.');
    press(layer, 'New link');
    expect(does.newLink).toHaveBeenCalledTimes(1);
  });

  it('is the same in the menu before anyone joined', () => {
    const layer = document.body.createDiv();
    const does = actions() as unknown as MenuActions;
    renderMenu(layer, menuModel(snapshot({ players: [] }), SCENE, { kind: 'signed-out', notice: null }), does);
    layer.querySelector<HTMLButtonElement>('.atlas-online-invite__more')?.click();
    rowOf(menus.opened.at(-1)!, 'New link').run();
    expect(does.newLink).not.toHaveBeenCalled();
    press(layer, 'New link');
    expect(does.newLink).toHaveBeenCalledTimes(1);
  });
});

describe('a newcomer\'s card', () => {
  it('admits them as a new player', () => {
    const parent = document.body.createDiv();
    renderKnocks(parent, [{ id: 'm'.repeat(20), name: 'Mira', answered: false, full: false, armed: true }], { admit: vi.fn(), decline: vi.fn() });
    expect([...parent.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Decline', 'Admit']);
  });
});

describe('stopping the table', () => {
  const header = (layer: HTMLElement): (string | null)[] => [...layer.querySelectorAll('.atlas-online-header button')].map((button) => button.getAttribute('aria-label'));

  it('is a button of its own between "…" and Close, and asks first while players are at the table', () => {
    const { layer, does } = panel();
    expect(header(layer)).toEqual(['More', 'Stop table', 'Close']);
    expect(menus.opened).toHaveLength(0);
    layer.querySelector<HTMLButtonElement>('.atlas-online-header__stop')?.click();
    expect(does.stop).not.toHaveBeenCalled();
    expect(layer.querySelector('.atlas-online-add-player')).toBeNull();
    expect(layer.querySelector('.atlas-online-list')?.nextElementSibling?.matches('.atlas-online-confirm')).toBe(true);
    press(layer, 'Stop table');
    expect(does.stop).toHaveBeenCalledTimes(1);
  });

  it('stops at once from the menu, where nobody is at the table yet; "…" shows only with something in it', () => {
    const layer = document.body.createDiv();
    const does = actions();
    renderMenu(layer, menuModel(snapshot({ players: [] }), SCENE, { kind: 'signed-out' }), does as unknown as MenuActions);
    expect(header(layer)).toEqual(['Stop table']);
    layer.querySelector<HTMLButtonElement>('.atlas-online-header__stop')?.click();
    expect(does.stop).toHaveBeenCalledTimes(1);
  });
});
