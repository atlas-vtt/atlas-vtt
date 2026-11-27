import type { App, TFile } from 'obsidian';
import { subscribePlayerTokens } from '../../../characters/playerTokens';
import { screenStatblocks } from '../../../react/components/dm-screen/screenStatblocks';
import { toTokenVitals } from '../../../services/statblockVitalsSync';
import { captureRollContext } from '../../../tools/diceRollOrigins';
import { MAX_GM_SCREEN_MESSAGE, type DeviceMessage, type GmScreenMessage, type StatblockEntry, type StatblocksFight } from '../../protocol/index.ts';
import type { GmScreen, GmScreenOutlet } from '../screens.ts';
import { drawnTree } from './drawnTree.ts';
import { fightArt, fightOf } from './fightList.ts';
import type { FrontScene, FrontScenes } from './frontScene.ts';
import type { PortraitShelf } from './PortraitShelf.ts';
import type { DrawnStatblockProps } from './StatblockDrawing.ts';
import { listedStatblocks, type ListedStatblock } from './statblockList.ts';
import { ScreenIds } from './screenIds.ts';
import { pressRoll, sentRolls, type SentDrawing } from './statblockRolls.ts';

/** How soon after a change of the scene the list is read again; a token dragged changes it on every step. */
export const LIST_MS = 200;

/** A statblock drawn for the devices that show it. */
export interface Drawing {
  draw(props: DrawnStatblockProps): void;
  dispose(): void;
}

/** What the Statblocks screen needs: the vault, the session's outlet, the map in front, the pictures, and a way to draw. */
export interface StatblocksPorts {
  readonly app: App;
  readonly outlet: GmScreenOutlet;
  readonly scenes: FrontScenes;
  readonly portraits: PortraitShelf;
  /** Draws a statblock as the DM screen does; `settled` is handed what holds it each time it has settled. */
  readonly drawing: (settled: (element: HTMLElement) => void) => Drawing;
}

interface Shown {
  readonly drawing: Drawing;
  readonly viewers: Set<string>;
  /** What the drawn props were made of, so a scene change that leaves them alone draws nothing. */
  drawnKey: string;
  /** The statblock as last read, and its JSON. */
  message: GmScreenMessage | null;
  json: string;
  /** The drawing its devices were sent, which a press on one of its rolls names. */
  sent: SentDrawing | undefined;
}

const utf8Length = (text: string): number => new TextEncoder().encode(text).length;

/**
 * The Statblocks screen on Atlas's side: the statblocks of the map the GM has in front, in the DM screen's order,
 * sent to every device when they change, and the statblock a device opens, drawn as the DM screen draws it
 * (`StatblockDrawing`) and sent as a tree (`drawnTree`) whenever its drawing changes, until the device leaves it.
 * Pictures go by hash, and only to the device that asks. Nothing is sent twice to a device that has it.
 */
export class StatblocksScreen implements GmScreen {
  readonly takes = ['statblock-view', 'portrait-ask', 'statblock-roll'] as const;
  private readonly load = `s${Date.now().toString(36)}`;
  private readonly statblockIds = new ScreenIds(`${this.load}-`);
  private readonly combatantKeys = new ScreenIds(`${this.load}-c`);
  /** Drawings are numbered across the screen, so a number never names two drawings in one load. */
  private drawings = 0;
  private listed = new Map<string, ListedStatblock>();
  private list: GmScreenMessage | null = null;
  private readonly views = new Map<string, string>();
  private readonly shown = new Map<string, Shown>();
  private readonly sentList = new Map<string, string>();
  private readonly sentTree = new Map<string, string>();
  private scene: FrontScene | null = null;
  private stopScene: (() => void) | null = null;
  private readonly stops: (() => void)[];
  private timer: number | null = null;
  private runs = 0;

  /** Nothing is read before a device opens: the map in front is looked for when the list is. */
  constructor(private readonly ports: StatblocksPorts) {
    this.stops = [ports.scenes.watch(() => this.schedule()), subscribePlayerTokens(() => this.schedule())];
  }

  opened(device: string): void {
    this.sentList.delete(device);
    this.sentTree.delete(device);
    if (this.list) this.sendList(device);
    const viewed = this.views.get(device);
    const shown = viewed === undefined ? undefined : this.shown.get(viewed);
    if (shown) this.sendTree(device, shown);
    this.schedule();
  }

  message(device: string, message: DeviceMessage): void {
    if (message.t === 'portrait-ask') {
      const portrait = this.ports.portraits.portrait(message.hash);
      if (portrait) this.ports.outlet.send(portrait, device);
    } else if (message.t === 'statblock-view') this.view(device, message.id);
    else if (message.t === 'statblock-roll') {
      const shown = message.statblock === this.views.get(device) ? this.shown.get(message.statblock) : undefined;
      const mapInFront = this.list?.t === 'statblocks' && this.list.map;
      this.ports.outlet.send({ t: 'statblock-roll-answer', id: message.id, refused: pressRoll(shown?.sent, message, mapInFront) }, device);
    }
  }

  closed(device: string): void {
    this.leave(device);
    this.sentList.delete(device);
    this.sentTree.delete(device);
  }

  dispose(): void {
    for (const stop of this.stops) stop();
    this.stopScene?.();
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.runs += 1;
    for (const shown of this.shown.values()) shown.drawing.dispose();
    this.shown.clear();
    this.views.clear();
  }

  /** The map in front, whose changes are followed from now on. */
  private follow(): FrontScene | null {
    const scene = this.ports.scenes.current();
    if (scene?.viewId !== this.scene?.viewId) {
      this.stopScene?.();
      this.scene = scene;
      this.stopScene = scene ? scene.subscribe(() => this.schedule()) : null;
    }
    return this.scene;
  }

  private schedule(): void {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      // With no device to show it to, the list waits: the next device that opens reads it anew.
      if (this.ports.outlet.devices.length > 0) void this.refresh();
    }, LIST_MS);
  }

  private async refresh(): Promise<void> {
    const run = (this.runs += 1);
    const scene = this.follow();
    const state = scene?.state();
    if (state?.isMapLoading) return;
    if (!scene || !state?.mapPath || !state.mapLoaded) return this.publish(null, []);
    try {
      const statblocks = await screenStatblocks(this.ports.app, state.objects.tokens);
      if (run !== this.runs) return;
      const definitions = scene.definitions();
      const listed = listedStatblocks(this.ports.app, statblocks, state, definitions);
      const art = fightArt(state);
      const [portraits, fightPortraits] = await Promise.all([Promise.all(listed.map((entry) => this.portraitOf(entry.art))), Promise.all(art.map((path) => this.portraitOf(path)))]);
      if (run !== this.runs) return;
      const fightPortrait = new Map(art.map((path, index) => [path, fightPortraits[index] ?? null]));
      const listedPaths = new Set(listed.map((entry) => entry.path));
      const fight = fightOf(state, {
        rules: scene.rules(), definitions,
        keyOf: (entryId) => this.combatantKeys.of(entryId),
        statblockOf: (path) => (listedPaths.has(path) ? this.idOf(path) : null),
        portraitOf: (path) => fightPortrait.get(path) ?? null,
      });
      this.publish(scene, listed, portraits, fight);
    } catch (error) {
      console.error('[Atlas] Could not read the statblocks of the map for a GM screen device:', error);
    }
  }

  private async portraitOf(path: string | null): Promise<string | null> {
    const file = path === null ? null : this.ports.app.vault.getFileByPath(path);
    return file ? this.ports.portraits.hashOf(file) : null;
  }

  private idOf(path: string): string {
    return this.statblockIds.of(path);
  }

  private publish(scene: FrontScene | null, listed: readonly ListedStatblock[], portraits: readonly (string | null)[] = [], fight: StatblocksFight | null = null): void {
    this.listed = new Map(listed.map((entry) => [this.idOf(entry.path), entry]));
    const entries = listed.map((entry, index): StatblockEntry => ({
      id: this.idOf(entry.path), name: entry.name, portrait: portraits[index] ?? null, count: entry.tokens.length, turn: entry.turn, fight: entry.fight, player: entry.player,
    }));
    this.list = { t: 'statblocks', map: scene !== null, entries, ...(fight && { fight }) };
    for (const device of this.ports.outlet.devices) this.sendList(device);
    for (const [id, shown] of this.shown) {
      const entry = this.listed.get(id);
      if (entry && scene) this.draw(shown, scene, entry);
      else this.gone(id, shown);
    }
    // A device that asked before the first list was read is shown its statblock now.
    for (const [device, id] of this.views) if (!this.shown.get(id)?.viewers.has(device)) this.show(device, id);
  }

  private sendList(device: string): void {
    const json = JSON.stringify(this.list);
    if (this.list === null || this.sentList.get(device) === json) return;
    this.sentList.set(device, json);
    this.ports.outlet.send(this.list, device);
  }

  /** The statblock left the map in front: its devices are told, and it is drawn no more. */
  private gone(id: string, shown: Shown): void {
    for (const device of shown.viewers) {
      this.views.delete(device);
      this.sentTree.delete(device);
      this.ports.outlet.send({ t: 'statblock-gone', id, reason: 'gone' }, device);
    }
    shown.drawing.dispose();
    this.shown.delete(id);
  }

  private view(device: string, id: string | null): void {
    if (id !== null && id === this.views.get(device)) {
      const shown = this.shown.get(id);
      if (shown) this.sendTree(device, shown);
      return;
    }
    this.leave(device);
    if (id === null) return;
    this.views.set(device, id);
    // Until the map's list is first read, the device waits for it (`publish`).
    if (this.list !== null) this.show(device, id);
  }

  private show(device: string, id: string): void {
    const entry = this.listed.get(id);
    if (!entry || !this.scene) {
      this.views.delete(device);
      this.ports.outlet.send({ t: 'statblock-gone', id, reason: 'gone' }, device);
      return;
    }
    let shown = this.shown.get(id);
    if (!shown) {
      const made: Shown = { drawing: this.ports.drawing((element) => void this.read(id, made, element)), viewers: new Set(), drawnKey: '', message: null, json: '', sent: undefined };
      shown = made;
      this.shown.set(id, shown);
      this.draw(shown, this.scene, entry);
    }
    shown.viewers.add(device);
    this.sendTree(device, shown);
  }

  /** The device shows no statblock now: nothing more goes to it, and a statblock nobody shows is drawn no more. */
  private leave(device: string): void {
    const id = this.views.get(device);
    this.views.delete(device);
    this.sentTree.delete(device);
    const shown = id === undefined ? undefined : this.shown.get(id);
    if (!shown || id === undefined) return;
    shown.viewers.delete(device);
    if (shown.viewers.size > 0) return;
    shown.drawing.dispose();
    this.shown.delete(id);
  }

  private draw(shown: Shown, scene: FrontScene, entry: ListedStatblock): void {
    const tokens = entry.tokens.map(toTokenVitals);
    const definitions = scene.definitions();
    const originContext = captureRollContext(scene.viewId, scene.state(), entry.tokens.map((token) => token.id));
    const key = JSON.stringify([entry.path, scene.viewId, tokens, definitions, originContext]);
    if (key === shown.drawnKey) return;
    shown.drawnKey = key;
    shown.drawing.draw({
      path: entry.path,
      tokens,
      viewId: scene.viewId,
      originContext,
      tokenActions: { definitions, onUpdateToken: (id, updates) => scene.updateToken(id, updates), onLocateToken: (id) => scene.locateToken(id) },
    });
  }

  /** Reads a settled drawing: its pictures first, which go by the hashes reading their files gives, then its tree. */
  private async read(id: string, shown: Shown, element: HTMLElement): Promise<void> {
    const { portraits } = this.ports;
    const fileOf = (image: Element): TFile | null => portraits.fileOfSource(image.getAttribute('src') ?? '');
    await Promise.all([...element.querySelectorAll('img')].flatMap((image) => {
      const file = fileOf(image);
      return file ? [portraits.hashOf(file)] : [];
    }));
    if (this.shown.get(id) !== shown) return;
    const tree = drawnTree(element, (image) => {
      const file = fileOf(image);
      return file ? portraits.knownHash(file) ?? null : null;
    });
    const same = shown.message?.t === 'statblock' && JSON.stringify(shown.message.nodes) === JSON.stringify(tree.nodes);
    const drawing = same && shown.sent ? shown.sent.drawing : (this.drawings += 1);
    const message: GmScreenMessage = { t: 'statblock', id, nodes: tree.nodes, cut: tree.cut, drawing };
    const json = JSON.stringify(message);
    // Within its limits a tree fits one message; should it not, the device is told so rather than sent nothing.
    shown.message = utf8Length(json) <= MAX_GM_SCREEN_MESSAGE ? message : { t: 'statblock-gone', id, reason: 'too-large' };
    shown.json = JSON.stringify(shown.message);
    // The links of a drawing read again stand for the same rolls, though the DM screen may have drawn them anew.
    shown.sent = shown.message.t === 'statblock' ? { drawing, rolls: sentRolls(tree.rolls) } : undefined;
    for (const device of shown.viewers) this.sendTree(device, shown);
  }

  private sendTree(device: string, shown: Shown): void {
    if (shown.message === null || this.sentTree.get(device) === shown.json) return;
    this.sentTree.set(device, shown.json);
    this.ports.outlet.send(shown.message, device);
  }
}
