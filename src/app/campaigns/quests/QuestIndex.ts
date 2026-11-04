import { TFile, TFolder, type App, type EventRef, type Events, type TAbstractFile } from 'obsidian';
import { isWithin } from '../../services/recordFiles/recordLayout';
import { questsOfCampaign, type QuestCampaign } from './questCampaigns';
import { byQuestOrder, readQuest } from './questProperties';
import type { Quest } from './questTypes';

/** Whether two readings of a note are the same quest: every field equal (rewards by value). */
function sameQuest(a: Quest | undefined, b: Quest | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.path === b.path && a.title === b.title && a.campaign === b.campaign && a.id === b.id && a.kind === b.kind && a.status === b.status
    && a.experience === b.experience && a.created === b.created && a.modified === b.modified
    && a.rewards.length === b.rewards.length && a.rewards.every((reward, n) => reward === b.rewards[n]);
}

/**
 * The vault's quest notes, read from Obsidian's metadata cache and kept current: a note loaded or made, a note's
 * frontmatter or text edited (in Obsidian, by hand, by a sync tool), a note renamed, moved or
 * deleted, or a folder holding notes renamed or deleted. A quest that did not change keeps its
 * object, and listeners hear of a change only when a quest is another (written anew, added or
 * gone). One per app, opened by the plugin and released when it unloads.
 */
export class QuestIndex {
  private static readonly instances = new WeakMap<App, QuestIndex>();

  static open(app: App): QuestIndex {
    let index = QuestIndex.instances.get(app);
    if (!index) {
      index = new QuestIndex(app);
      QuestIndex.instances.set(app, index);
    }
    return index;
  }

  /** The app's quests once the plugin opened them; undefined before. */
  static forApp(app: App | undefined): QuestIndex | undefined {
    return app ? QuestIndex.instances.get(app) : undefined;
  }

  static release(app: App): void {
    QuestIndex.instances.get(app)?.destroy();
    QuestIndex.instances.delete(app);
  }

  private readonly quests = new Map<string, Quest>();
  /** Notes the metadata cache had not read yet when they were looked at: read once it says it has. */
  private readonly unread = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly stops: (() => void)[] = [];
  private sorted: readonly Quest[] | null = null;

  private constructor(private readonly app: App) {
    this.listen(app.metadataCache, 'changed', (file) => this.reread(file));
    this.listen(app.metadataCache, 'deleted', (file) => this.forget(file));
    this.listen(app.metadataCache, 'resolved', () => this.readUnread());
    // While Obsidian starts, the vault reports every note it loads as created, after the plugin is loaded; a note whose
    // metadata Obsidian cached in an earlier session is not reported as changed, so this is where those quests come in.
    this.listen(app.vault, 'create', (file) => this.reread(file));
    this.listen(app.vault, 'rename', (file, oldPath) => this.renamed(file, oldPath));
    this.listen(app.vault, 'delete', (file) => this.forget(file));
    this.scan();
  }

  /** Every quest of the vault: main quests, then side quests, each by title; the same array while nothing changed. */
  all(): readonly Quest[] {
    return (this.sorted ??= [...this.quests.values()].sort(byQuestOrder));
  }

  /** The quests that belong to `campaign`, `campaigns` being every campaign of the vault (`campaignOfQuest`). */
  of(campaign: QuestCampaign, campaigns: readonly QuestCampaign[]): Quest[] {
    return questsOfCampaign(this.all(), campaign, campaigns);
  }

  get(path: string): Quest | undefined {
    return this.quests.get(path);
  }

  /** Calls `listener` whenever a quest changed, was added or is gone; returns what stops it. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  destroy(): void {
    for (const stop of this.stops) stop();
    this.stops.length = 0;
    this.listeners.clear();
  }

  private listen(source: Events, name: string, callback: (...data: unknown[]) => unknown): void {
    const ref: EventRef = source.on(name, callback);
    this.stops.push(() => source.offref(ref));
  }

  /** Reads every note of the vault once. */
  private scan(): void {
    let changed = false;
    for (const file of this.app.vault.getMarkdownFiles()) changed = this.read(file) || changed;
    if (changed) this.tell();
  }

  /** The metadata cache has read every note: those it had not read when they were looked at are read now. */
  private readUnread(): void {
    if (this.unread.size === 0) return;
    const paths = [...this.unread];
    this.unread.clear();
    let changed = false;
    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) changed = this.read(file) || changed;
    }
    if (changed) this.tell();
  }

  private reread(file: unknown): void {
    if (file instanceof TFile && this.read(file)) this.tell();
  }

  /**
   * Reads one note; true when its quest is another now. A note the cache has not read yet keeps
   * what was known of it (`carried`, under its new path after a move) until the cache has.
   */
  private read(file: TFile, carried?: Quest): boolean {
    if (file.extension !== 'md') return false;
    const cache = this.app.metadataCache.getFileCache(file);
    const known = carried ?? this.quests.get(file.path);
    let quest: Quest | undefined;
    if (cache === null) {
      this.unread.add(file.path);
      quest = known === undefined ? undefined : { ...known, path: file.path, title: file.basename };
    } else {
      this.unread.delete(file.path);
      quest = readQuest({ path: file.path, basename: file.basename, created: file.stat.ctime, modified: file.stat.mtime }, cache.frontmatter) ?? undefined;
    }
    const before = this.quests.get(file.path);
    if (sameQuest(before, quest)) return false;
    if (quest === undefined) this.quests.delete(file.path);
    else this.quests.set(file.path, quest);
    return true;
  }

  private forget(file: unknown): void {
    if (!(file instanceof TFile || file instanceof TFolder)) return;
    const gone = [...this.quests.keys()].filter((path) => isWithin(path, file.path));
    for (const path of gone) this.quests.delete(path);
    for (const path of [...this.unread]) if (isWithin(path, file.path)) this.unread.delete(path);
    if (gone.length > 0) this.tell();
  }

  /** A note or folder moved: what was known under its old path is read again where it is now, and kept should the cache not know it there yet. */
  private renamed(file: unknown, oldPath: unknown): void {
    if (typeof oldPath !== 'string' || !(file instanceof TFile || file instanceof TFolder)) return;
    const moved = new Map<string, Quest>();
    for (const [path, quest] of this.quests) if (isWithin(path, oldPath)) moved.set(file.path + path.slice(oldPath.length), quest);
    for (const path of [...this.unread]) if (isWithin(path, oldPath)) this.unread.delete(path);
    for (const path of [...this.quests.keys()]) if (isWithin(path, oldPath)) this.quests.delete(path);
    let changed = moved.size > 0;
    for (const now of this.filesAt(file)) changed = this.read(now, moved.get(now.path)) || changed;
    if (changed) this.tell();
  }

  /** A note, or every note inside a folder. */
  private filesAt(file: TAbstractFile): TFile[] {
    if (file instanceof TFile) return [file];
    return this.app.vault.getMarkdownFiles().filter((note) => isWithin(note.path, file.path));
  }

  private tell(): void {
    this.sorted = null;
    for (const listener of [...this.listeners]) listener();
  }
}
