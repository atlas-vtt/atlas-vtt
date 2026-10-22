import { setIcon } from 'obsidian';
import { createTokenPortrait } from '../../../packages/components/shared/tokenPortraitElement';
import { openMenuBelow, type MenuEntry } from './dockMenu.ts';
import type { GroupPlayer, OnlinePlayer, PlayerGroup, TokenRow } from './panelModel.ts';

/** What the list's rows and menus do. */
export interface ListActions {
  /** Selects the token on the shared map. */
  selectToken(tokenId: string): void;
  assign(tokenIds: readonly string[], playerId: string): void;
  release(tokenIds: readonly string[]): void;
  unmark(tokenIds: readonly string[]): void;
  /** Takes the player off this table; their code still lets them back. */
  kick(playerId: string): void;
  /** Copies the player's code as people read it; false while there is none or the clipboard refused. */
  copyPlayerCode(playerId: string): Promise<boolean>;
  newPlayerCode(playerId: string): void;
  /** Asks the GM for the player's new name. */
  askRename(player: OnlinePlayer): void;
  /** Asks the GM whether the player leaves the campaign. */
  askRemoveFromCampaign(player: OnlinePlayer): void;
  /** Draws the open question about the player into `parent`, where their row would be; false while there is none. */
  playerPrompt(parent: HTMLElement, playerId: string): boolean;
  /** The tokens selected on the shared map, for "Assign selected tokens here". */
  selected(): readonly string[];
  /** The URL the vault serves an image path at. */
  imageSrc(imagePath: string): string;
}

/** The player's picture, with a dot for whether they are here: the token they play, or their initial in their colour. */
function avatar(parent: HTMLElement, player: GroupPlayer, face: TokenRow | null, actions: ListActions): void {
  const presence = player.online ? 'atlas-online-tone--green' : 'atlas-online-tone--muted';
  if (face === null) {
    parent.createSpan({ cls: `atlas-online-avatar atlas-online-colour-${player.colour} ${presence}`, text: player.initial, attr: { 'aria-hidden': 'true' } });
    return;
  }
  const picture = parent.createSpan({ cls: `atlas-online-avatar atlas-online-avatar--token ${presence}`, attr: { 'aria-hidden': 'true' } });
  createTokenPortrait(picture, { src: actions.imageSrc(face.imagePath), alt: '', showRing: face.showRing, ringColor: face.ringColor ?? undefined, cls: 'atlas-online-avatar__portrait' });
}

/** A mark beside a name for a token the players do not see. */
function hiddenMark(parent: HTMLElement): void {
  setIcon(parent.createSpan({ cls: 'atlas-online-token__hidden', attr: { 'aria-label': 'Hidden from players' } }), 'eye-off');
}

/**
 * The release rows of a player's menu. The token a player is shown by has no row of its own, so the
 * menu releases it alone (their next token then shows them), and all their tokens where they have more.
 */
function releaseEntries(face: TokenRow | null, tokens: readonly TokenRow[], actions: ListActions): MenuEntry[] {
  const releasing = (title: string, owned: readonly TokenRow[]): MenuEntry =>
    ({ title, icon: 'undo-2', disabled: owned.length === 0, run: () => actions.release(owned.map((token) => token.tokenId)) });
  if (face === null) return [releasing('Release all', [])];
  const one = releasing(`Release ${face.label}`, [face]);
  return tokens.length === 0 ? [one] : [one, releasing('Release all', [face, ...tokens])];
}

/**
 * A player's row: their picture (its dot says whether they are here), the name they chose, and their
 * menu, a ghost button that shows while the pointer is over the row or focus is in it. A player who
 * plays a token is shown by it (`face`) and has no row for it besides: pressing the picture or the
 * name selects that token on the map, as its own row did, and their menu releases it alone.
 */
function playerRow(list: HTMLElement, player: GroupPlayer, face: TokenRow | null, tokens: readonly TokenRow[], actions: ListActions): void {
  if (actions.playerPrompt(list, player.id)) return;
  const row = list.createDiv({ cls: ['atlas-online-player', ...(player.online ? [] : ['is-away'])] });
  const main = face === null
    ? row.createDiv({ cls: 'atlas-online-player__main' })
    : row.createEl('button', { cls: 'atlas-online-player__main', attr: { type: 'button', 'data-focus-key': `face:${face.tokenId}` } });
  avatar(main, player, face, actions);
  main.createSpan({ cls: 'atlas-online-player__name', text: player.name });
  if (face?.hidden) hiddenMark(main);
  main.createSpan({ cls: 'atlas-online-sr-only', text: `${player.online ? 'Online' : 'Away'}${face === null ? '' : `, plays ${face.label}`}` });
  if (face !== null) main.addEventListener('click', () => actions.selectToken(face.tokenId));
  const more = row.createEl('button', { cls: 'atlas-online-icon-button atlas-online-player__more', attr: { type: 'button', 'aria-label': `${player.name}: options`, 'aria-haspopup': 'menu', 'data-focus-key': `player:${player.id}` } });
  setIcon(more, 'more-horizontal');
  more.addEventListener('click', () => {
    const selected = actions.selected();
    openMenuBelow([
      { title: 'Assign selected tokens here', icon: 'user-plus', disabled: selected.length === 0, run: () => actions.assign(selected, player.id) },
      ...releaseEntries(face, tokens, actions),
      { title: 'Copy code', icon: 'copy', apart: true, run: () => void actions.copyPlayerCode(player.id) },
      { title: 'New code', icon: 'refresh-cw', run: () => actions.newPlayerCode(player.id) },
      { title: 'Rename…', icon: 'pencil', run: () => actions.askRename(player) },
      { title: 'Remove from table', icon: 'user-x', warning: true, apart: true, run: () => actions.kick(player.id) },
      { title: 'Remove from campaign', icon: 'user-minus', warning: true, run: () => actions.askRemoveFromCampaign(player) },
    ], more);
  });
}

/** A player as a menu row names them: away players say so. */
export const playerTitle = (player: OnlinePlayer): string => (player.online ? player.name : `${player.name} (away)`);

/**
 * Who plays the token, inside its row at the right. Only the GM gives tokens to players, so on a token
 * nobody plays it always shows as Assign; a player's name shows with the row's hover or focus (always
 * on touch screens).
 */
function ownerPicker(row: HTMLElement, token: TokenRow, players: readonly OnlinePlayer[], actions: ListActions): void {
  const owner = token.owner;
  const picker = row.createEl('button', {
    cls: `atlas-online-owner ${owner === null ? 'atlas-online-owner--free' : `atlas-online-colour-${owner.colour}`}`,
    attr: { type: 'button', 'aria-haspopup': 'menu', 'aria-label': `${token.label}: ${owner === null ? 'free, assign to a player' : `played by ${owner.name}`}`, 'data-focus-key': `chip:${token.tokenId}` },
  });
  if (owner !== null) picker.createSpan({ cls: 'atlas-online-owner__dot', attr: { 'aria-hidden': 'true' } });
  picker.createSpan({ cls: 'atlas-online-owner__text', text: owner?.name ?? 'Assign' });
  setIcon(picker.createSpan({ cls: 'atlas-online-chevron' }), 'chevron-down');
  picker.addEventListener('click', () => {
    openMenuBelow([
      ...players.map((player) => ({ title: playerTitle(player), checked: owner?.id === player.id, run: () => actions.assign([token.tokenId], player.id) })),
      { title: 'Release', icon: 'undo-2', disabled: owner === null, apart: players.length > 0, run: () => actions.release([token.tokenId]) },
      { title: 'Not a player token', icon: 'shield', run: () => actions.unmark([token.tokenId]) },
    ], picker);
  });
}

/** A token's row: pressing it selects the token on the map; its owner picker sits inside, at the right. */
function tokenRow(list: HTMLElement, token: TokenRow, players: readonly OnlinePlayer[], actions: ListActions): void {
  const row = list.createDiv({ cls: 'atlas-online-token' });
  const main = row.createEl('button', { cls: 'atlas-online-token__main', attr: { type: 'button', 'data-focus-key': `token:${token.tokenId}` } });
  createTokenPortrait(main, { src: actions.imageSrc(token.imagePath), alt: '', showRing: token.showRing, ringColor: token.ringColor ?? undefined, cls: 'atlas-online-token__portrait' });
  main.createSpan({ cls: 'atlas-online-token__name', text: token.label });
  if (token.hidden) hiddenMark(main);
  main.addEventListener('click', () => actions.selectToken(token.tokenId));
  ownerPicker(row, token, players, actions);
}

/** The players, each shown by the token they play and with their further tokens, then the free player tokens. */
export function renderPlayerList(parent: HTMLElement, groups: readonly PlayerGroup[], players: readonly OnlinePlayer[], actions: ListActions): HTMLElement {
  const list = parent.createDiv({ cls: 'atlas-online-list', attr: { 'data-scroll-key': 'list' } });
  for (const group of groups) {
    if (group.player === null && group.tokens.length === 0) continue;
    const block = list.createDiv({ cls: 'atlas-online-group' });
    if (group.player !== null) playerRow(block, group.player, group.face, group.tokens, actions);
    else block.createDiv({ cls: 'atlas-online-group-label', text: 'Not assigned' });
    for (const token of group.tokens) tokenRow(block, token, players, actions);
  }
  return list;
}
