import type { AccountApi } from '../account/AccountControl.ts';
import { accessText, noticeText, UNREACHABLE_TEXT, type AccountView } from '../account/accountView.ts';
import type { AccountInfo } from '../account/relayAccount.ts';
import { openUpdate } from '../../../updates/updateNotice';
import { OUTDATED_TEXT } from '../gmLevel.ts';
import { tableEndText, type LostTable } from '../tableEnd.ts';
import { renderCampaignPicker, type CampaignPick, type CampaignPickerActions } from './campaignPicker.ts';
import { statusLine, textButton } from './controls.ts';
import { NO_CAMPAIGNS } from './panelModel.ts';

/** What the menu's sign-in parts do, and the choice of the table's campaign. */
export interface AccountActions extends CampaignPickerActions {
  start(): void;
  signIn(): void;
  cancelSignIn(): void;
  reopenSignIn(): void;
  signOut(): void;
  /** Asks the relay again (after it could not be reached). */
  retry(): void;
  /** Opens the account page of the website: invite keys are redeemed there, and it says what the account may host. */
  openAccountPage(): void;
  /** Opens Atlas's page in Obsidian, where Obsidian installs the update. */
  update(): void;
}

/** The sign-in actions over the account control; starting and the campaign's choice are the dock's own. */
export function accountActions(account: AccountApi): Omit<AccountActions, 'start' | keyof CampaignPickerActions> {
  return {
    signIn: () => void account.signIn(),
    cancelSignIn: () => account.cancelSignIn(),
    reopenSignIn: () => account.reopenSignIn(),
    signOut: () => void account.signOut(),
    retry: () => void account.refresh(true),
    openAccountPage: () => account.openAccountPage(),
    update: () => openUpdate(),
  };
}

const INTRO = 'Players see this map in their browsers and move their own tokens.';

/** A code as the approve page shows it: two groups of four. */
export const shownCode = (code: string): string => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

/** The menu's title, with the signed-in account's handle at its end, and, after a table the server ended, the line that says how. */
function intro(layer: HTMLElement, lost: LostTable | null, title = 'Online play', account: AccountInfo | null = null): HTMLElement {
  const head = layer.createDiv({ cls: 'atlas-online-text-block' });
  const row = head.createDiv({ cls: 'atlas-online-title-row' });
  row.createDiv({ cls: 'atlas-online-title', text: title });
  if (account !== null) row.createDiv({ cls: 'atlas-online-handle', text: `@${account.handle}` });
  if (lost !== null) statusLine(head, { text: tableEndText(lost), tone: 'red' }).setAttribute('role', 'alert');
  return head;
}

function help(parent: HTMLElement, text: string): void {
  parent.createDiv({ cls: 'atlas-online-help', text });
}

function button(layer: HTMLElement, text: string, focusKey: string, onClick: () => void, kind: 'plain' | 'cta' = 'plain', corner = false): HTMLButtonElement {
  const made = textButton(layer, text, onClick, kind);
  made.dataset.focusKey = focusKey;
  if (corner) made.addClass('atlas-online-corner-button');
  return made;
}

/** The menu's foot for a signed-in GM: Sign out as a ghost in the bottom-left corner, the row's main action taking the rest. */
function signedInFoot(layer: HTMLElement, actions: AccountActions): HTMLElement {
  const row = layer.createDiv({ cls: 'atlas-online-actions' });
  const out = textButton(row, 'Sign out', () => actions.signOut(), 'ghost');
  out.dataset.focusKey = 'sign-out';
  out.addClass('atlas-online-corner-button');
  return row;
}

function accountPageButton(layer: HTMLElement, actions: AccountActions, kind: 'plain' | 'cta' = 'plain', corner = false): void {
  button(layer, 'Open account page', 'account-page', () => actions.openAccountPage(), kind, corner);
}

/** In the place of Start while the relay needs a newer Atlas: the reason, and the way to the update. */
function updateFoot(layer: HTMLElement, head: HTMLElement, actions: AccountActions): void {
  statusLine(head, { text: OUTDATED_TEXT, tone: 'red' });
  button(layer, 'Update', 'update', () => actions.update(), 'cta', true);
}

/** Start online table: the menu's last control, in its bottom corners. */
function startButton(layer: HTMLElement, starting: boolean, enabled: boolean, actions: AccountActions): void {
  const start = button(layer, starting ? 'Starting…' : 'Start online table', 'start', () => actions.start(), 'cta', true);
  start.disabled = !enabled || starting;
}

/**
 * The menu before a table runs: signed out, waiting for the browser,
 * checking the account, unreachable, signed in without access (the relay's reason, and the way to the
 * account page), or able to host: the campaign the table plays (`campaigns`), and Start, where Update stands in while the relay needs a newer Atlas (`outdated`). `lost` says how the last table ended when the server ended it; a
 * table closed because the account may not host comes with the way to the account page in every state.
 */
export function renderAccountMenu(layer: HTMLElement, account: AccountView, starting: boolean, lost: LostTable | null, actions: AccountActions, outdated = false, campaigns: CampaignPick = NO_CAMPAIGNS): void {
  const signedIn = account.kind === 'can-host' || account.kind === 'no-access' ? account.account : null;
  const head = intro(layer, lost, account.kind === 'waiting' ? 'Sign in to host' : undefined, signedIn);
  if (lost === 'no-access' && account.kind !== 'no-access') accountPageButton(layer, actions);
  switch (account.kind) {
    case 'signed-out': {
      // The one sentence about what this is; the button says how to begin.
      help(head, INTRO);
      const notice = noticeText(account.notice);
      if (notice !== null) statusLine(head, { text: notice, tone: account.notice === 'server' ? 'amber' : 'red' });
      button(layer, 'Sign in to host', 'sign-in', () => actions.signIn(), 'cta', true);
      return;
    }
    case 'waiting': {
      if (account.userCode === null) {
        statusLine(head, { text: 'Opening your browser…', tone: 'amber' });
      } else {
        help(head, 'Approve this code in your browser. Atlas waits here.');
        head.createDiv({ cls: 'atlas-online-code', text: shownCode(account.userCode), attr: { 'aria-label': `Code ${account.userCode.split('').join(' ')}` } });
      }
      const row = layer.createDiv({ cls: 'atlas-online-actions' });
      button(row, 'Open again', 'reopen', () => actions.reopenSignIn(), 'plain', true).disabled = account.userCode === null;
      button(row, 'Cancel', 'cancel', () => actions.cancelSignIn(), 'plain', true);
      return;
    }
    case 'checking':
      statusLine(head, { text: 'Checking your account…', tone: 'muted' });
      return startButton(layer, starting, false, actions);
    case 'unreachable':
      statusLine(head, { text: UNREACHABLE_TEXT, tone: 'red' });
      help(head, 'Running tables are unaffected.');
      button(layer, 'Try again', 'retry', () => actions.retry(), 'plain', true);
      return;
    case 'no-access':
      help(head, accessText(account.reason));
      return accountPageButton(signedInFoot(layer, actions), actions, 'cta', true);
    case 'can-host':
      if (outdated) return updateFoot(signedInFoot(layer, actions), head, actions);
      renderCampaignPicker(layer, campaigns, actions, starting);
      return startButton(signedInFoot(layer, actions), starting, campaigns.chosen !== null, actions);
  }
}
