import { renderClosingRow, renderUpdateRow, type ClosingRowActions } from './closingRow.ts';
import { inviteRow, surfaceHeader } from './controls.ts';
import type { MenuEntry } from './dockMenu.ts';
import { renderFeedback, type FeedbackActions, type FeedbackView } from './feedbackForm.ts';
import { gateEntries, gateRowsOf, renderCodeRow, renderPausedRow, type GateRowActions, type GateRows } from './gateRows.ts';
import { renderImageRow, type ImageRowActions } from './imageRow.ts';
import { closingOf, groupsOf, seatsNoteOf, selectionBarOf, statusOf, type OnlinePlayer, type OnlineSnapshot, type PlayerGroup, type SceneFacts, type SelectionBar, type Tone } from './panelModel.ts';
import { renderPlayerList, type ListActions } from './playerList.ts';
import { addPlayerRow, confirmPrompt, forgetGonePlayerPrompt, linkEntries, namePrompt, openPrompt, renderPlayerPrompt, type AddPlayerActions, type LinkActions } from './prompts.ts';
import { renderSelectionBar, type SelectionActions } from './selectionBar.ts';

/** The panel's width; it never grows wider than the row it hangs from. */
export const PANEL_WIDTH = 340;

/** What the panel shows. */
export interface PanelView {
  /** The name of the table's campaign, else "Online table". */
  readonly title: string;
  readonly status: { readonly text: string; readonly tone: Tone };
  /** Said in the header while the table is full. */
  readonly seatsNote: string | null;
  readonly link: string | null;
  /** The invite link's QR card is open. */
  readonly qr: boolean;
  /** The table's gates: the join code, the two switches, a pause. */
  readonly gate: GateRows | null;
  /** Players are shown an image over the map. */
  readonly imageShown: boolean;
  /** The table closes because its account may no longer host: the line that says when; null otherwise. */
  readonly closing: string | null;
  /** The relay let this Atlas in although it needs a newer one. */
  readonly updateAfter: boolean;
  readonly groups: readonly PlayerGroup[];
  readonly players: readonly OnlinePlayer[];
  readonly bar: SelectionBar | null;
  readonly feedback: FeedbackView;
}

/** What the panel shows of a snapshot, the map views, the feedback form and whether the QR card is open. */
export function panelView(snapshot: OnlineSnapshot, scene: SceneFacts, feedback: FeedbackView, qr = false, title = 'Online table'): PanelView {
  const groups = groupsOf(snapshot, scene);
  const players = groups.flatMap((group) => (group.player === null ? [] : [group.player]));
  return { title, status: statusOf(snapshot), seatsNote: seatsNoteOf(snapshot), link: snapshot.link, qr, gate: gateRowsOf(snapshot.gate), imageShown: snapshot.imageShown === true, closing: closingOf(snapshot), updateAfter: snapshot.updateAfter === true, groups, players, bar: selectionBarOf(snapshot, scene), feedback };
}

/** The campaign's players as the panel changes them, once the GM has answered. */
export interface CampaignActions {
  renamePlayer(playerId: string, name: string): void;
  removeFromCampaign(playerId: string): void;
}

export interface PanelActions extends Omit<ListActions, 'askRename' | 'askRemoveFromCampaign' | 'playerPrompt'>, CampaignActions, AddPlayerActions, LinkActions, SelectionActions, FeedbackActions, GateRowActions, ImageRowActions, ClosingRowActions {
  close(): void;
  stop(): void;
  copy(): Promise<boolean>;
  toggleQr(): void;
}

/** The control focused before a redraw, by its `data-focus-key`, and the list's scroll position. */
interface Kept {
  readonly focus: string | null;
  readonly scroll: number;
}

function keep(layer: HTMLElement): Kept {
  const active = layer.doc.activeElement;
  const focus = active !== null && layer.contains(active) ? active.getAttribute('data-focus-key') : null;
  return { focus, scroll: layer.querySelector('.atlas-online-list')?.scrollTop ?? 0 };
}

function restore(layer: HTMLElement, kept: Kept): void {
  const list = layer.querySelector('.atlas-online-list');
  if (list !== null) list.scrollTop = kept.scroll;
  if (kept.focus !== null) layer.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(kept.focus)}"]`)?.focus({ preventScroll: true });
}

/** The status in words where it needs the GM's eye: the table full, connecting, refused. */
function statusInWords(view: PanelView): string | null {
  if (view.seatsNote !== null) return view.seatsNote;
  return view.status.tone === 'green' ? null : view.status.text;
}

/** The list's questions, each in place of the player's row: renaming a player and removing one from the campaign. */
function listActions(layer: HTMLElement, actions: PanelActions, redraw: () => void): ListActions {
  return {
    ...actions,
    askRename: (player) => openPrompt(layer, namePrompt('rename', `Rename ${player.name}`, 'Rename', player.name, (name) => {
      actions.renamePlayer(player.id, name);
      return true;
    }, player.id), redraw),
    askRemoveFromCampaign: (player) => openPrompt(layer, confirmPrompt('remove-player', `Remove ${player.name} from the campaign`, 'Remove {name} from the campaign?', 'Remove', () => actions.removeFromCampaign(player.id), { player, warning: true }), redraw),
    playerPrompt: (parent, playerId) => renderPlayerPrompt(parent, layer, playerId, redraw),
  };
}

/**
 * The online panel: the working surface while players are at the table. A header with the title, the
 * status as a dot, "…" (Send feedback, the gates' New code and two switches), Stop and
 * Close; the line of a table that closes for want of access; the line of a pause; the line of a shown image; Copy invite link (with
 * its menu) and the join code; the players with their tokens and Add player, or in its place the question or field the GM is answering
 * (Stop, a new link, a new player's name and code; renaming and removing stand in the player's row); the bar for the selected tokens
 * or to show this map; the feedback form while open. Redrawn whole on every change, keeping focus and the list's scroll position.
 */
export function renderPanel(layer: HTMLElement, view: PanelView, actions: PanelActions): void {
  const kept = keep(layer);
  const hadBar = layer.querySelector('.atlas-online-selection') !== null;
  const redraw = (): void => renderPanel(layer, view, actions);
  layer.empty();
  layer.addClass('atlas-online-panel');
  forgetGonePlayerPrompt(layer, view.players.map((player) => player.id));
  const entries: MenuEntry[] = [
    { title: view.feedback.open ? 'Close feedback' : 'Send feedback', icon: 'message-square', run: () => actions.toggleFeedback() },
    ...gateEntries(view.gate, actions),
  ];
  const stop = (): void => openPrompt(layer, confirmPrompt('stop', 'Stop the table', 'Stop for everyone?', 'Stop table', () => actions.stop(), { warning: true }), redraw);
  surfaceHeader(layer, view.title, view.status, statusInWords(view), entries, stop, () => actions.close());
  renderClosingRow(layer, view.closing, actions);
  renderUpdateRow(layer, view.updateAfter, actions);
  renderPausedRow(layer, view.gate, actions);
  renderImageRow(layer, view.imageShown, actions);
  if (view.link !== null) inviteRow(layer, () => actions.copy(), { open: view.qr, toggle: () => actions.toggleQr() }, linkEntries(layer, actions, redraw));
  renderCodeRow(layer, view.gate, actions);
  renderPlayerList(layer, view.groups, view.players, listActions(layer, actions, redraw));
  addPlayerRow(layer, actions, redraw);
  if (view.bar !== null) renderSelectionBar(layer, view.bar, view.players, actions, !hadBar);
  if (view.feedback.open) renderFeedback(layer, view.feedback, actions);
  restore(layer, kept);
}
