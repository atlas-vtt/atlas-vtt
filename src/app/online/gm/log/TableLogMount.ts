import { GM_AUTHOR, type RollEntry } from '../../protocol/index.ts';
import { mountLogSurface, type LogActions, type LogState, type LogSurfaceMount, type Portrait, type RollFace, type SpeakerOption } from '../../tableLog/index.ts';
import type { FoundEntry, ImageEntry, LogSpeaker } from '../../protocol/index.ts';
import type { SceneStore } from '../atlasView.ts';
import { detached } from '../dock/dockDom.ts';
import { openThroughAtlas, takeOverDiceLog } from './diceLogTakeover.ts';
import { t } from '../../../i18n';

/** Atlas's own interface layer in a map view, in which its dice log stands. */
const ATLAS_UI = '.atlas-ui';
/** The place in Atlas's top bar row directly below the scene tabs, where the unread tab stands. */
const BELOW_TABS = '.atlas-top-bar-start__below';
const OFFLINE_TEXT = t('online.log.offline');

export interface TableLogMountDeps {
  readonly state: LogState;
  readonly actions: LogActions;
  /** Whether the table is online: what the GM types reaches the players. */
  canSend(): boolean;
  rollFace(entry: RollEntry): RollFace | null;
  /** Whom the GM may speak as, by the scene's state. */
  speakers(state: ReturnType<SceneStore['getState']>): readonly SpeakerOption[];
  speakerPortrait(speaker: LogSpeaker): Portrait | null;
  /** An image the GM showed, from the vault. */
  imageSrc(entry: ImageEntry): string | null;
  /** Opens the note a player found, in Obsidian. */
  openFound(entry: FoundEntry): void;
  /** The log opened over the place of the view's other surfaces, which make way. */
  opened(): void;
}

/**
 * The table's log on one Atlas map view (the shared tab's): its host element in Atlas's interface
 * layer, where Atlas's dice log would open, and the takeover of that log's switch. While closed it
 * shows a tab that counts what came in, directly below the scene tabs. The panel's state belongs to
 * the table and outlives the mount.
 */
export class TableLogMount {
  private readonly container: HTMLElement;
  private readonly store: SceneStore;
  private readonly deps: TableLogMountDeps;
  private readonly host: HTMLElement;
  private readonly tabHost: HTMLElement;
  private readonly surface: LogSurfaceMount;
  private readonly stopTakeover: () => void;
  private readonly stopSpeakers: () => void;
  private open = false;

  constructor(container: HTMLElement, store: SceneStore, deps: TableLogMountDeps) {
    this.container = container;
    this.store = store;
    this.deps = deps;
    // Made in the view's own document (a popout's too).
    this.host = detached(container, { cls: 'atlas-online-log-host atlas-vtt-plugin' });
    this.tabHost = detached(container, { cls: 'atlas-online-log-tab-host' });
    this.surface = mountLogSurface(this.host, this.tabHost);
    this.place();
    this.stopTakeover = takeOverDiceLog(store, () => this.setOpen(!this.open));
    // The speaker menu follows the scene's tokens and selection while the log is open.
    let speakers = deps.speakers(store.getState());
    this.stopSpeakers = store.subscribe((state) => {
      const next = deps.speakers(state);
      if (next === speakers) return;
      speakers = next;
      if (this.open) this.draw();
    });
    this.draw();
  }

  /** The window the view stands in: a view moved to another window gets a new mount. */
  get win(): Window {
    return this.container.win;
  }

  /** Closes the log: another surface opened over its place. */
  close(): void {
    this.setOpen(false);
  }

  /** Stands in Atlas's interface layer, the tab below the scene tabs, again if Atlas rebuilt it. */
  place(): void {
    const layer = this.container.querySelector<HTMLElement>(ATLAS_UI) ?? this.container;
    if (this.host.parentElement !== layer) layer.append(this.host);
    const belowTabs = layer.querySelector<HTMLElement>(BELOW_TABS);
    if (belowTabs === null) this.tabHost.remove();
    else if (this.tabHost.parentElement !== belowTabs) belowTabs.append(this.tabHost);
  }

  /** Draws anew: the table went offline or came back. */
  update(): void {
    this.place();
    this.draw();
  }

  dispose(): void {
    this.stopTakeover();
    this.stopSpeakers();
    this.deps.state.setOpen(false);
    this.surface.unmount();
    this.host.remove();
    this.tabHost.remove();
  }

  private setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.deps.state.setOpen(open);
    if (open) this.deps.opened();
    this.update();
  }

  private draw(): void {
    const { state, actions } = this.deps;
    this.surface.show({
      state,
      actions,
      self: GM_AUTHOR,
      moderator: true,
      canSend: this.deps.canSend(),
      offlineText: OFFLINE_TEXT,
      rollFace: (entry) => this.deps.rollFace(entry),
      speakers: this.deps.speakers(this.store.getState()),
      speakerPortrait: (speaker) => this.deps.speakerPortrait(speaker),
      imageSrc: (entry) => this.deps.imageSrc(entry),
      openFound: (entry) => this.deps.openFound(entry),
      open: this.open,
      // Through Atlas's own switch, as a press of Enter opens it.
      onOpen: () => void (openThroughAtlas(this.store) || this.setOpen(true)),
      onClose: () => this.setOpen(false),
    });
  }
}
