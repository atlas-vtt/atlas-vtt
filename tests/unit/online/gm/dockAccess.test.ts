// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { AccountView } from '../../../../src/app/online/gm/account/accountView.ts';
import { ACCESS_REFUSALS } from '../../../../src/app/online/gm/account/relayAccount.ts';
import { renderClosingRow, renderUpdateRow } from '../../../../src/app/online/gm/dock/closingRow.ts';
import { renderMenu, type MenuActions } from '../../../../src/app/online/gm/dock/ConnectionMenu.ts';
import { panelView } from '../../../../src/app/online/gm/dock/OnlinePanel.ts';
import type { CampaignPick } from '../../../../src/app/online/gm/dock/campaignPicker.ts';
import { menuModel, NO_CAMPAIGNS, type OnlineSnapshot, type SceneFacts } from '../../../../src/app/online/gm/dock/panelModel.ts';
import { closingText, type LostTable } from '../../../../src/app/online/gm/tableEnd.ts';

const MARA = { id: 'acc_mara', handle: 'mara', name: 'Mara' };
const CAN_HOST: AccountView = { kind: 'can-host', account: MARA, access: { plan: 'beta', maxPlayers: 12, endsAt: null } };
const SCENE: SceneFacts = { isShared: true, tokens: {}, selected: [] };
const CLOSES_AT = Date.UTC(2026, 9, 12, 14, 30);

const snapshot = (over: Partial<OnlineSnapshot> = {}): OnlineSnapshot => ({ status: 'idle', link: null, campaignId: null, sharedLeaf: null, sharedName: null, sharedTokens: {}, players: [], playerTokens: [], seats: null, gate: null, rests: [], cardOrder: [], ...over });

function actions(): MenuActions & { openAccountPage: ReturnType<typeof vi.fn<() => void>> } {
  return {
    start: vi.fn(), choose: vi.fn(), search: vi.fn(), openCampaigns: vi.fn(), signIn: vi.fn(), cancelSignIn: vi.fn(), reopenSignIn: vi.fn(), signOut: vi.fn(), retry: vi.fn(), openAccountPage: vi.fn<() => void>(), update: vi.fn(),
    newCode: vi.fn(), setRequireCode: vi.fn(), setAskToJoin: vi.fn(), copyCode: () => Promise.resolve(true), hideImage: vi.fn(),
    stop: vi.fn(), share: vi.fn(), copy: () => Promise.resolve(true), toggleQr: vi.fn(),
  };
}

/** The menu as the GM reads it: its lines of text, and its buttons by their words. */
function menu(over: Partial<OnlineSnapshot>, account: AccountView, campaigns: CampaignPick = NO_CAMPAIGNS): { lines: string[]; buttons: string[]; press(text: string): void; layer: HTMLElement; does: ReturnType<typeof actions> } {
  const layer = document.body.createDiv();
  const does = actions();
  renderMenu(layer, menuModel(snapshot(over), SCENE, account, false, campaigns), does);
  const buttons = [...layer.querySelectorAll('button')];
  return {
    layer,
    does,
    lines: [...layer.querySelectorAll('.atlas-online-title, .atlas-online-help:not(.atlas-online-campaigns__note, [hidden]), .atlas-online-status__text, .atlas-online-closing__text')].map((line) => line.textContent ?? ''),
    buttons: buttons.filter((button) => button.getAttribute('role') !== 'radio').map((button) => button.textContent ?? '').filter((text) => text !== ''),
    press: (text) => buttons.find((button) => button.textContent === text)?.click(),
  };
}

describe('the online menu before a table runs', () => {
  it('asks a signed-out GM to sign in, and offers nothing that takes a key', () => {
    const shown = menu({}, { kind: 'signed-out', notice: null });
    expect(shown.lines).toEqual(['Online play', 'Players see this map in their browsers and move their own tokens.']);
    expect(shown.layer.querySelector('.atlas-online-handle')).toBeNull();
    expect(shown.buttons).toEqual(['Sign in to host']);
    expect(shown.layer.querySelector('input, form')).toBeNull();
  });

  it('says for each reason why the account may not host, and opens the account page, with no field for a key', () => {
    const sentences: Record<string, string> = {
      'no-access': 'Online play is in early access. Redeem an invite key on your account page.',
      'access-ended': 'Your access to online play has ended. See your account page.',
      'access-revoked': 'Your access to online play was withdrawn. See your account page.',
      'account-restricted': 'Your account is restricted and cannot host online tables. See your account page.',
      'terms-not-accepted': 'Accept the current Terms on your account page to host online tables.',
    };
    for (const reason of ACCESS_REFUSALS) {
      const shown = menu({}, { kind: 'no-access', account: MARA, reason });
      expect(shown.lines, reason).toEqual(['Online play', sentences[reason]]);
      expect(shown.layer.querySelector('.atlas-online-title-row .atlas-online-handle')?.textContent, reason).toBe('@mara');
      expect(shown.buttons, reason).toEqual(['Sign out', 'Open account page']);
      expect(shown.layer.querySelector('input, form'), reason).toBeNull();
      shown.press('Open account page');
      expect(shown.does.openAccountPage).toHaveBeenCalledTimes(1);
      expect(shown.does.start).not.toHaveBeenCalled();
    }
    expect(menu({}, { kind: 'no-access', account: MARA, reason: null }).lines[1]).toBe('This account may not host online tables now. See your account page.');
  });

  it('offers Start to an account the relay says may host, with its handle beside the title and no more words', () => {
    const shown = menu({}, CAN_HOST, { list: [{ id: 'c1', name: 'Strahd', activity: 'Played 3d ago', players: 2, art: null, hue: 40 }], chosen: 'c1', query: '' });
    expect(shown.lines).toEqual(['Online play']);
    expect(shown.layer.querySelector('.atlas-online-title-row .atlas-online-handle')?.textContent).toBe('@mara');
    expect(shown.buttons).toEqual(['Sign out', 'Start online table']);
    expect(shown.layer.querySelector('.atlas-online-actions > .atlas-online-button--ghost')?.textContent).toBe('Sign out');
    shown.press('Start online table');
    expect(shown.does.start).toHaveBeenCalledTimes(1);
  });

  it('says that the table is over because the account may not host, with the way to the account page in every state', () => {
    const lost: LostTable = 'no-access';
    const sentence = 'The online table was closed. This account may not host online tables now.';
    // The relay has not said yet what the account may do, or cannot be reached, or the GM was signed out.
    for (const account of [{ kind: 'checking' }, { kind: 'unreachable' }, { kind: 'signed-out', notice: null }, CAN_HOST] as const) {
      const shown = menu({ status: 'refused', lost }, account);
      expect(shown.lines[1], account.kind).toBe(sentence);
      expect(shown.buttons.filter((text) => text === 'Open account page'), account.kind).toHaveLength(1);
      shown.press('Open account page');
      expect(shown.does.openAccountPage).toHaveBeenCalledTimes(1);
    }
    // Once the relay named the reason, its sentence stands beside it, and the page is offered once.
    const named = menu({ status: 'refused', lost }, { kind: 'no-access', account: MARA, reason: 'access-ended' });
    expect(named.lines).toEqual(['Online play', sentence, 'Your access to online play has ended. See your account page.']);
    expect(named.buttons).toEqual(['Sign out', 'Open account page']);
    expect(named.layer.querySelector('[role="alert"]')?.textContent).toBe(sentence);
  });

  it('says that the table is over because the account started another, or because the server closed it', () => {
    const superseded = menu({ status: 'refused', lost: 'superseded' }, CAN_HOST);
    expect(superseded.lines[1]).toBe('The online table was closed. This account started another table.');
    expect(superseded.buttons).toEqual(['Sign out', 'Start online table']);
    expect(menu({ status: 'refused', lost: 'refused' }, CAN_HOST).lines[1]).toBe('The server closed the online table.');
    // Nothing of it once another table starts, or without a lost table.
    expect(menu({ status: 'starting', lost: 'superseded' }, CAN_HOST).layer.querySelector('[role="alert"]')).toBeNull();
    expect(menu({}, CAN_HOST).layer.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('a running table whose account may no longer host', () => {
  const RUNNING = { status: 'online', link: 'https://play.atlas-vtt.dev/#code' } as const;

  it('shows in the menu when it closes, in the GM\'s own time, with the way to the account page', () => {
    const shown = menu({ ...RUNNING, closesAt: CLOSES_AT }, CAN_HOST);
    expect(shown.lines).toContain(closingText(CLOSES_AT));
    expect(shown.layer.querySelector('.atlas-online-closing')?.getAttribute('role')).toBe('status');
    shown.press('Account page');
    expect(shown.does.openAccountPage).toHaveBeenCalledTimes(1);
    // No tooltip of the browser's anywhere in it.
    expect(shown.layer.querySelector('[title]')).toBeNull();
  });

  it('shows nothing of it once the relay took the word back', () => {
    const shown = menu(RUNNING, CAN_HOST);
    expect(shown.layer.querySelector('.atlas-online-closing')).toBeNull();
    expect(shown.buttons).not.toContain('Account page');
  });

  it('shows the same line in the panel, once players are at the table', () => {
    const feedback = { open: false, diagnostics: false, state: 'idle', errorReports: false } as const;
    expect(panelView(snapshot({ ...RUNNING, closesAt: CLOSES_AT }), SCENE, feedback).closing).toBe(closingText(CLOSES_AT));
    expect(panelView(snapshot(RUNNING), SCENE, feedback).closing).toBeNull();
    const layer = document.body.createDiv();
    const open = vi.fn();
    renderClosingRow(layer, closingText(CLOSES_AT, 'en-GB', 'UTC'), { openAccountPage: open, update: vi.fn() });
    expect(layer.textContent).toBe('This table closes on 12 October 2026 at 14:30. Your account’s access to online play ended.Account page');
    layer.querySelector('button')?.click();
    expect(open).toHaveBeenCalledTimes(1);
    layer.empty();
    renderClosingRow(layer, null, { openAccountPage: open, update: vi.fn() });
    expect(layer.childElementCount).toBe(0);
  });
});

describe('the online menu while the relay needs a newer Atlas', () => {
  it('stands Update in for Start, with the reason, and Update opens Atlas\'s page', () => {
    const shown = menu({ outdated: true }, CAN_HOST);
    expect(shown.lines).toContain('Online play needs a newer Atlas.');
    expect(shown.buttons).toContain('Update');
    expect(shown.buttons).not.toContain('Start online table');
    shown.press('Update');
    expect(shown.does.update).toHaveBeenCalledTimes(1);
    expect(menu({}, CAN_HOST).buttons).toContain('Start online table');
  });

  it('asks a GM let in where players sit to update after the session, in the menu and the panel', () => {
    const running = { status: 'online', link: 'https://play.atlas-vtt.dev/#code' } as const;
    expect(menu({ ...running, updateAfter: true }, CAN_HOST).lines).toContain('Update Atlas after this session');
    expect(menu(running, CAN_HOST).lines).not.toContain('Update Atlas after this session');
    const feedback = { open: false, diagnostics: false, state: 'idle', errorReports: false } as const;
    expect(panelView(snapshot({ ...running, updateAfter: true }), SCENE, feedback).updateAfter).toBe(true);
    const layer = document.body.createDiv();
    const update = vi.fn();
    renderUpdateRow(layer, true, { openAccountPage: vi.fn(), update });
    layer.querySelector('button')?.click();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
