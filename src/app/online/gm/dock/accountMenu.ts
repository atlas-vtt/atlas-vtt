import type { AccountApi } from '../account/AccountControl.ts';
import type { AccountView } from '../account/accountView.ts';
import type { AccountInfo } from '../account/relayAccount.ts';
import { signInActions, signInPrompt, SIGN_IN_TO_HOST, type SignInActions, type SignInPrompt } from '../account/signInPrompt.ts';
import { openUpdate } from '../../../updates/updateNotice';
import { OUTDATED_TEXT } from '../gmLevel.ts';
import { tableEndText, type LostTable } from '../tableEnd.ts';
import { renderCampaignPicker, type CampaignPick, type CampaignPickerActions } from './campaignPicker.ts';
import { statusLine, textButton } from './controls.ts';
import { NO_CAMPAIGNS } from './panelModel.ts';
import { t } from '../../../i18n';

/** What the menu's sign-in parts do, and the choice of the table's campaign. */
export interface AccountActions extends CampaignPickerActions, SignInActions {
  start(): void;
  /** Opens Atlas's page in Obsidian, where Obsidian installs the update. */
  update(): void;
}

/** The sign-in actions over the account control; starting and the campaign's choice are the dock's own. */
export function accountActions(account: AccountApi): Omit<AccountActions, 'start' | keyof CampaignPickerActions> {
  return { ...signInActions(account), update: () => openUpdate() };
}

const INTRO = t('online.intro');

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

/** The focus key of each sign-in button, by what it does. */
const FOCUS_KEYS: Readonly<Record<keyof SignInActions, string>> = { signIn: 'sign-in', reopenSignIn: 'reopen', cancelSignIn: 'cancel', retry: 'retry', signOut: 'sign-out', openAccountPage: 'account-page' };

/** The shared sign-in in the menu's look: its lines and code under the title, one button in the bottom corners or two side by side. */
function renderSignIn(layer: HTMLElement, head: HTMLElement, prompt: SignInPrompt, actions: AccountActions): void {
  for (const line of prompt.lines) {
    if (line.tone === 'help') help(head, line.text);
    else statusLine(head, { text: line.text, tone: line.tone });
  }
  if (prompt.code !== null) head.createDiv({ cls: 'atlas-online-code', text: prompt.code.text, attr: { 'aria-label': prompt.code.label } });
  const foot = prompt.buttons.length > 1 ? layer.createDiv({ cls: 'atlas-online-actions' }) : layer;
  for (const shown of prompt.buttons) {
    const made = textButton(foot, shown.label, () => actions[shown.action](), shown.kind);
    made.dataset.focusKey = FOCUS_KEYS[shown.action];
    made.addClass('atlas-online-corner-button');
    made.disabled = shown.disabled;
  }
}

/** The menu's foot for a GM who may host: Sign out as a ghost in the bottom-left corner, the row's main action taking the rest. */
function signedInFoot(layer: HTMLElement, actions: AccountActions): HTMLElement {
  const row = layer.createDiv({ cls: 'atlas-online-actions' });
  const out = textButton(row, t('online.signOut'), () => actions.signOut(), 'ghost');
  out.dataset.focusKey = FOCUS_KEYS.signOut;
  out.addClass('atlas-online-corner-button');
  return row;
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
 * The menu before a table runs: the shared sign-in (`signInPrompt`) until the account may host, then the campaign
 * the table plays (`campaigns`) and Start, where Update stands in while the relay needs a newer Atlas (`outdated`).
 * `lost` says how the last table ended when the server ended it; a table closed because the account may not host
 * comes with the way to the account page in every state.
 */
export function renderAccountMenu(layer: HTMLElement, account: AccountView, starting: boolean, lost: LostTable | null, actions: AccountActions, outdated = false, campaigns: CampaignPick = NO_CAMPAIGNS): void {
  const signedIn = account.kind === 'can-host' || account.kind === 'no-access' ? account.account : null;
  const head = intro(layer, lost, account.kind === 'waiting' ? SIGN_IN_TO_HOST : undefined, signedIn);
  if (lost === 'no-access' && account.kind !== 'no-access') button(layer, t('online.account.open'), FOCUS_KEYS.openAccountPage, () => actions.openAccountPage());
  const prompt = signInPrompt(account, { intro: INTRO, unreachable: t('online.account.tablesGoOn') });
  if (prompt !== null) {
    renderSignIn(layer, head, prompt, actions);
    if (prompt.startWaits) startButton(layer, starting, false, actions);
    return;
  }
  if (outdated) return updateFoot(signedInFoot(layer, actions), head, actions);
  renderCampaignPicker(layer, campaigns, actions, starting);
  startButton(signedInFoot(layer, actions), starting, campaigns.chosen !== null, actions);
}
