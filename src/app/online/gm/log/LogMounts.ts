import { LogState, type LogActions, type Portrait, type RollFace } from '../../tableLog/index.ts';
import { GM_AUTHOR, type ChatRefusal, type LogSpeaker, type RollEntry } from '../../protocol/index.ts';
import type { WorkspaceLeaf } from 'obsidian';
import { sceneStoreOf } from '../atlasView.ts';
import type { OnlineTable } from '../OnlineTable.ts';
import { faceOf, seesWhole, viewOf, type GmLogEntry } from './logEntries.ts';
import { gmSpeakerList } from './gmSpeakers.ts';
import { TableLogMount } from './TableLogMount.ts';

/** What the mounts read of the GM's side of online play. */
export interface LogMountsDeps {
  table(): OnlineTable | null;
  /** A vault image as a URL the panel can show. */
  imageSrc(path: string): string;
  /** The table's log opened on a view: that view's control makes way. */
  opened(leaf: WorkspaceLeaf): void;
  /** Opens a note by its link, as from the note `sourcePath` (a found note, from the map its pin is on). */
  openNote(link: string, sourcePath: string): void;
}

/** A map view's container element; Obsidian's `View.containerEl`. */
function containerOf(leaf: WorkspaceLeaf): HTMLElement | null {
  const view: unknown = leaf.view;
  return typeof view === 'object' && view !== null && 'containerEl' in view && view.containerEl !== null && typeof view.containerEl === 'object' ? (view.containerEl as HTMLElement) : null;
}

/**
 * The GM's actions on a table's log, as the panel calls them; what is not taken is told above the
 * GM's field (`refused`), as players are told. A roll that cannot be made now (no shared map) is
 * told as a roll that does not work.
 */
function gmActions(table: OnlineTable, refused: (reason: ChatRefusal) => void): LogActions {
  const { log } = table;
  const told = (refusal: ChatRefusal | 'unavailable' | null): void => {
    if (refusal !== null) refused(refusal === 'unavailable' ? 'roll' : refusal);
  };
  return {
    say: (draft) => void log.say(draft).then(told),
    roll: (draft) => void table.rollFromLog(draft).then(told),
    edit: (id, text) => told(log.edit(id, text)),
    remove: (id) => log.remove(id),
    react: (id, emoji, on) => log.react(id, emoji, on),
    clear: () => log.clear(),
  };
}

/**
 * The table's log on the GM's screen: while a table runs, the tab players see live shows it where
 * Atlas's dice log opens (`TableLogMount`); every other tab keeps Atlas's own. One `LogState` per
 * table holds what the panel shows and what is unread, also while the shared tab changes or is gone.
 */
export class LogMounts {
  private readonly deps: LogMountsDeps;
  private table: OnlineTable | null = null;
  private state: LogState | null = null;
  private mount: { readonly leaf: WorkspaceLeaf; readonly view: object; readonly on: TableLogMount } | null = null;
  private readonly speakers: ReturnType<typeof gmSpeakerList>;

  constructor(deps: LogMountsDeps) {
    this.deps = deps;
    this.speakers = gmSpeakerList((path) => deps.imageSrc(path));
  }

  /** Follows the running table and its shared tab: called when either may have changed. */
  sync(): void {
    const table = this.deps.table();
    if (table !== this.table) {
      this.unmount();
      this.table = table;
      this.state = table === null ? null : new LogState(() => GM_AUTHOR);
      this.logChanged();
    }
    const leaf = table?.sharedTab ?? null;
    const container = leaf === null ? null : containerOf(leaf);
    const store = leaf === null ? null : sceneStoreOf(leaf);
    if (table === null || this.state === null || leaf === null || container === null || store === null) return this.unmount();
    // A view moved into another window keeps its object; its mount listens in the old window.
    if (this.mount !== null && this.mount.view === leaf.view && this.mount.on.win === container.win) return this.mount.on.place();
    this.unmount();
    const state = this.state;
    const on = new TableLogMount(container, store, {
      state,
      actions: gmActions(table, (reason) => state.receive({ t: 'chat-refused', reason })),
      speakers: (scene) => this.speakers(scene),
      speakerPortrait: (speaker) => this.speakerPortrait(table, speaker),
      imageSrc: (entry) => {
        const path = (entry as GmLogEntry).imageFile;
        return path === undefined ? null : this.deps.imageSrc(path);
      },
      openFound: (entry) => {
        const pin = (entry as GmLogEntry).pin;
        if (pin !== undefined) this.deps.openNote(pin.link, pin.map);
      },
      canSend: () => table.status === 'online',
      rollFace: (entry) => this.rollFace(entry),
      opened: () => this.deps.opened(leaf),
    });
    this.mount = { leaf, view: leaf.view, on };
  }

  /** The table went offline or came back: the panel says whether what is typed is sent. */
  refresh(): void {
    this.mount?.on.update();
  }

  /** The table's log changed: the panel's state takes its entries, as the GM sees them, and who is at the table. */
  logChanged(): void {
    const table = this.table;
    if (table === null || this.state === null) return;
    // What only the GM's log has (a roll's token, the GM's unseen rolls) stays on entries the GM sees whole.
    this.state.replace(table.log.entries().flatMap((entry) => (entry.hidden === true || seesWhole(entry, GM_AUTHOR) ? [entry] : viewOf(entry, GM_AUTHOR) ?? [])));
    this.state.setPeople(table.log.people());
  }

  /** Closes the log on a view: its control opened over the log's place. */
  close(leaf: WorkspaceLeaf): void {
    if (this.mount?.leaf === leaf) this.mount.on.close();
  }

  dispose(): void {
    this.unmount();
    this.table = null;
    this.state = null;
  }

  private unmount(): void {
    this.mount?.on.dispose();
    this.mount = null;
  }

  /** A speaker's portrait on the GM's screen: the artwork the log names by its hash, from the vault. */
  private speakerPortrait(table: OnlineTable, speaker: LogSpeaker): Portrait | null {
    const path = speaker.art === null ? undefined : table.log.artFile(speaker.art.hash);
    return path === undefined ? null : { src: this.deps.imageSrc(path), showRing: speaker.ring !== null, ...(speaker.ring !== null && { ringColor: speaker.ring }) };
  }

  private rollFace(entry: RollEntry): RollFace | null {
    const face = faceOf(entry);
    return face === undefined ? null : { name: face.name, portrait: face.image === null ? null : { src: this.deps.imageSrc(face.image) } };
  }
}
