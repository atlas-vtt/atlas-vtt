import { TFile, type App, type EventRef, type TAbstractFile } from 'obsidian';
import type { SceneSound } from '../sound/soundTypes';
import { runInBackground } from '../utils/backgroundTask';
import { workSlices } from '../utils/workSlices';
import { sceneSoundOfText } from './sceneSound';

const SCENE_EXTENSION = 'atlasmap';

/** A scene that links moods, as its file says. */
export interface LinkingScene {
  path: string;
  /** When the file last changed: of several scenes linking a mood, the latest speaks for it. */
  mtime: number;
  sound: SceneSound;
}

interface Read {
  size: number;
  mtime: number;
  sound: SceneSound | null;
}

/**
 * Which scenes link which moods. A scene keeps its links in its own file (`sound`, `sceneSound.ts`),
 * so this reads every scene file of the vault once, parsing only those that hold the key, keeps what
 * it read by path, size and time, and reads again what the vault reports changed. One per app,
 * released when the plugin unloads.
 */
export class SceneMoodLinks {
  private static readonly instances = new WeakMap<App, SceneMoodLinks>();

  static forApp(app: App): SceneMoodLinks {
    let links = SceneMoodLinks.instances.get(app);
    if (!links) {
      links = new SceneMoodLinks(app);
      SceneMoodLinks.instances.set(app, links);
    }
    return links;
  }

  static release(app: App): void {
    SceneMoodLinks.instances.get(app)?.destroy();
    SceneMoodLinks.instances.delete(app);
  }

  private readonly reads = new Map<string, Read>();
  private readonly listeners = new Set<() => void>();
  private readonly refs: EventRef[] = [];
  private shown: readonly LinkingScene[] = [];
  private started = false;
  private destroyed = false;

  private constructor(private readonly app: App) {}

  /** The scenes that link a mood, the latest first, read in the background from the first ask on. */
  scenes(): readonly LinkingScene[] {
    this.start();
    return this.shown;
  }

  onChange(listener: () => void): () => void {
    this.start();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    const { vault } = this.app;
    this.refs.push(
      vault.on('modify', (file) => this.reread(file)),
      vault.on('create', (file) => this.reread(file)),
      vault.on('delete', (file) => this.forget(file.path)),
      vault.on('rename', (file, from) => {
        this.forget(from);
        this.reread(file);
      }),
    );
    runInBackground(this.readAll(), 'Reading which scenes link moods');
  }

  private async readAll(): Promise<void> {
    const pause = workSlices();
    for (const file of this.app.vault.getFiles()) {
      if (this.destroyed) return;
      if (file.extension === SCENE_EXTENSION) await this.read(file);
      await pause();
    }
    this.publish();
  }

  private reread(file: TAbstractFile): void {
    if (!(file instanceof TFile) || file.extension !== SCENE_EXTENSION || !this.started) return;
    runInBackground(this.read(file).then(() => this.publish()), 'Reading a scene\'s mood links');
  }

  private async read(file: TFile): Promise<void> {
    const known = this.reads.get(file.path);
    if (known?.size === file.stat.size && known.mtime === file.stat.mtime) return;
    const sound = sceneSoundOfText(await this.app.vault.cachedRead(file));
    if (!this.destroyed) this.reads.set(file.path, { size: file.stat.size, mtime: file.stat.mtime, sound });
  }

  private forget(path: string): void {
    if (this.reads.delete(path)) this.publish();
  }

  private publish(): void {
    if (this.destroyed) return;
    this.shown = [...this.reads].flatMap(([path, { mtime, sound }]) => (sound ? [{ path, mtime, sound }] : [])).sort((a, b) => b.mtime - a.mtime);
    for (const listener of [...this.listeners]) listener();
  }

  private destroy(): void {
    this.destroyed = true;
    for (const ref of this.refs) this.app.vault.offref(ref);
    this.listeners.clear();
  }
}

/** Of the scenes linking moods, the one that speaks for each mood: a scene that plays it before one that plays it in fights, the latest first. */
export function sceneOfMood(scenes: readonly LinkingScene[]): ReadonlyMap<string, string> {
  const chosen = new Map<string, string>();
  for (const { path, sound } of scenes) if (sound.mood && !chosen.has(sound.mood)) chosen.set(sound.mood, path);
  for (const { path, sound } of scenes) if (sound.combatMood && !chosen.has(sound.combatMood)) chosen.set(sound.combatMood, path);
  return chosen;
}
