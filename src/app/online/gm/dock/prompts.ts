import { playerName, shownJoinCode } from '../../protocol/index.ts';
import { copyRow, textButton } from './controls.ts';
import { copyText } from './dockDom.ts';
import type { MenuEntry } from './dockMenu.ts';
import type { AddedPlayer } from './panelModel.ts';

/**
 * A question or a field the GM answers before anything happens: in place of the player's row where it
 * is about one (`playerId`), else in place of the Add player row, so the surface keeps its height. Kept
 * apart from the DOM, which every redraw replaces, so a change at the table never takes it away; only
 * the player leaving does.
 */
export type Prompt = ConfirmPrompt | NamePrompt | CodePrompt;

/** `name` is a player's own text; it stands where `text` says `{name}`, in a box of its own. */
interface ConfirmPrompt {
  readonly kind: 'confirm';
  readonly key: string;
  readonly label: string;
  readonly playerId: string | null;
  readonly name: string | null;
  readonly text: string;
  readonly confirm: string;
  readonly warning: boolean;
  readonly run: () => void;
}

/** `run` says whether the answer was taken; the field stays open while it was not. */
interface NamePrompt {
  readonly kind: 'name';
  readonly key: string;
  readonly label: string;
  readonly playerId: string | null;
  readonly confirm: string;
  draft: string;
  readonly run: (name: string) => boolean;
}

interface CodePrompt {
  readonly kind: 'code';
  readonly player: AddedPlayer;
}

const prompts = new WeakMap<HTMLElement, Prompt>();

export interface AddPlayerActions {
  /** Adds a player to the campaign; null where it could not (the GM is told why). */
  addPlayer(name: string): AddedPlayer | null;
}

export interface LinkActions {
  /** Gives the campaign a new link. */
  newLink(): void;
}

const focusKeyOf = (prompt: Prompt): string => (prompt.kind === 'code' ? 'prompt-done' : `${prompt.key}-${prompt.kind === 'name' ? 'name' : 'confirm'}`);

/** Shows `prompt` on `layer` and puts focus where the answer starts. */
export function openPrompt(layer: HTMLElement, prompt: Prompt, redraw: () => void): void {
  prompts.set(layer, prompt);
  redraw();
  const key = focusKeyOf(prompt);
  Array.from(layer.querySelectorAll<HTMLElement>('[data-focus-key]')).find((el) => el.dataset.focusKey === key)?.focus({ preventScroll: true });
}

/** `options.player` is the player the question is about: it then stands in their row, and goes with them. */
export function confirmPrompt(key: string, label: string, text: string, confirm: string, run: () => void, options: { readonly player?: { readonly id: string; readonly name: string }; readonly warning?: boolean } = {}): Prompt {
  return { kind: 'confirm', key, label, playerId: options.player?.id ?? null, name: options.player?.name ?? null, text, confirm, warning: options.warning === true, run };
}

export function namePrompt(key: string, label: string, confirm: string, draft: string, run: (name: string) => boolean, playerId: string | null = null): Prompt {
  return { kind: 'name', key, label, playerId, confirm, draft, run };
}

export const codePrompt = (player: AddedPlayer): Prompt => ({ kind: 'code', player });

/** "Add player": a name, then the new player's code, shown once. A question not about a player (Stop, a new link) stands here instead. */
export function addPlayerRow(layer: HTMLElement, actions: AddPlayerActions, redraw: () => void): void {
  if (renderPrompt(layer, redraw)) return;
  const ask = (): void => openPrompt(layer, namePrompt('add-player', 'Add a player', 'Add', '', (name) => {
    const added = actions.addPlayer(name);
    if (added !== null) openPrompt(layer, codePrompt(added), redraw);
    return false;
  }), redraw);
  const row = layer.createDiv({ cls: 'atlas-online-add-player' });
  textButton(row, 'Add player', ask, 'ghost').dataset.focusKey = 'add-player';
}

/** The "New link" row of a link's menu: it asks first, since the old link stops working. */
export function linkEntries(layer: HTMLElement, actions: LinkActions, redraw: () => void): MenuEntry[] {
  const ask = (): void => openPrompt(layer, confirmPrompt('new-link', 'New link', 'The old link stops working. Players need the new one.', 'New link', () => actions.newLink()), redraw);
  return [{ title: 'New link', icon: 'link', run: ask }];
}

const playerOf = (prompt: Prompt): string | null => (prompt.kind === 'code' ? null : prompt.playerId);

const closer = (layer: HTMLElement, redraw: () => void) => (): void => {
  prompts.delete(layer);
  redraw();
};

/** Draws the prompt `layer` shows that is about no player, if any; one about a player stands in their row instead. */
function renderPrompt(layer: HTMLElement, redraw: () => void): boolean {
  const prompt = prompts.get(layer);
  if (prompt === undefined || playerOf(prompt) !== null) return false;
  const close = closer(layer, redraw);
  if (prompt.kind === 'confirm') confirmRow(layer, prompt, close, false);
  else if (prompt.kind === 'name') nameRow(layer, prompt, close, false);
  else codeRows(layer, prompt.player, close);
  return true;
}

/** Draws the prompt about `playerId` into `parent`, in place of their row; false where `layer` has none about them. */
export function renderPlayerPrompt(parent: HTMLElement, layer: HTMLElement, playerId: string, redraw: () => void): boolean {
  const prompt = prompts.get(layer);
  if (prompt === undefined || prompt.kind === 'code' || prompt.playerId !== playerId) return false;
  const close = closer(layer, redraw);
  if (prompt.kind === 'confirm') confirmRow(parent, prompt, close, true);
  else nameRow(parent, prompt, close, true);
  return true;
}

/** Drops a prompt about a player who is no longer in the list: there is nobody left to ask about. */
export function forgetGonePlayerPrompt(layer: HTMLElement, playerIds: readonly string[]): void {
  const prompt = prompts.get(layer);
  const playerId = prompt === undefined ? null : playerOf(prompt);
  if (playerId !== null && !playerIds.includes(playerId)) prompts.delete(layer);
}

/** A prompt in a player's row keeps the row's height and stays clear of the panel's corner. */
function promptRow(parent: HTMLElement, cls: string, label: string, inRow: boolean): HTMLElement {
  return parent.createDiv({ cls: inRow ? [cls, 'atlas-online-player-prompt'] : cls, attr: { role: 'group', 'aria-label': label } });
}

function confirmRow(parent: HTMLElement, prompt: ConfirmPrompt, close: () => void, inRow: boolean): void {
  const row = promptRow(parent, 'atlas-online-confirm', prompt.label, inRow);
  const text = row.createSpan({ cls: 'atlas-online-confirm__text' });
  const [before, after] = prompt.name === null ? [prompt.text, ''] : prompt.text.split('{name}');
  text.appendText(before ?? '');
  if (prompt.name !== null) text.createEl('bdi', { text: prompt.name });
  text.appendText(after ?? '');
  textButton(row, 'Cancel', close, 'ghost').dataset.focusKey = `${prompt.key}-cancel`;
  const answer = textButton(row, prompt.confirm, () => {
    close();
    prompt.run();
  }, prompt.warning ? 'warning' : 'plain');
  answer.dataset.focusKey = `${prompt.key}-confirm`;
  if (!inRow) answer.addClass('atlas-online-corner-button');
}

function nameRow(parent: HTMLElement, prompt: NamePrompt, close: () => void, inRow: boolean): void {
  const row = promptRow(parent, 'atlas-online-prompt', prompt.label, inRow);
  const field = row.createEl('input', { cls: 'atlas-online-prompt__input', attr: { type: 'text', 'aria-label': 'Name', 'data-focus-key': `${prompt.key}-name` } });
  field.value = prompt.draft;
  textButton(row, 'Cancel', close, 'ghost').dataset.focusKey = `${prompt.key}-cancel`;
  const submit = (): void => {
    const name = playerName(field.value);
    if (name !== null && prompt.run(name)) close();
  };
  const answer = textButton(row, prompt.confirm, submit, 'cta');
  answer.dataset.focusKey = `${prompt.key}-confirm`;
  if (!inRow) answer.addClass('atlas-online-corner-button');
  answer.disabled = playerName(field.value) === null;
  field.addEventListener('input', () => {
    prompt.draft = field.value;
    answer.disabled = playerName(field.value) === null;
  });
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) submit();
  });
}

/** A new player's code, shown once, with the way to copy it. */
function codeRows(layer: HTMLElement, player: AddedPlayer, close: () => void): void {
  const block = layer.createDiv({ cls: 'atlas-online-prompt atlas-online-prompt--code', attr: { role: 'group', 'aria-label': 'Code of the new player' } });
  const label = block.createDiv({ cls: 'atlas-online-group-label' });
  label.createEl('bdi', { text: player.name });
  label.appendText(' joins with');
  const shown = shownJoinCode(player.code);
  copyRow(block, { icon: 'key-round', text: `Code ${shown}`, copied: 'Code copied', focusKey: 'prompt-copy' }, () => copyText(layer, shown)).addClass('atlas-online-code-row');
  const done = textButton(block, 'Done', close, 'cta');
  done.dataset.focusKey = 'prompt-done';
  done.addClass('atlas-online-corner-button');
}
