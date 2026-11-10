import type { App } from 'obsidian';
import { isRecord, parsePlayerMessage, type GmMessage, type PlayerPinFound } from '../../protocol/index.ts';
import { viewOf } from '../log/logEntries.ts';
import type { TableLog } from '../log/TableLog.ts';
import { MoveRate } from '../moveCheck.ts';
import type { MapLayerShare } from '../MapLayerShare.ts';
import { FoundTexts } from './FoundTexts.ts';
import type { AssetStoring } from '../assets/assetUses.ts';

/** Pins a player may open: a burst of `FIND_BURST`, then one a second. */
export const FIND_BURST = 5;
export const FINDS_PER_SECOND = 1;

export interface FoundSharePorts {
  readonly app: App;
  send(body: GmMessage, to?: string): void;
  now(): number;
  /** The name a player goes by at the table, or null when they are not at it. */
  nameOf(player: string): string | null;
  /** How players are handed a found note's text and images the store keeps for them. */
  readonly stored?: AssetStoring | undefined;
  /** The shared scene's map layers, while one is shared; null otherwise. */
  layers(): Pick<MapLayerShare, 'readablePin' | 'update'> | null;
}

/**
 * The readable pins players find. A player who opens a pin they see now (checked again here: the pin
 * readable, in the players' picture of the shared scene, the player at the table) finds it the first
 * time: the log tells everyone who found it and holds its note to read (`TableLog.pinFound`). Later
 * opens, by anyone, find the same entry, which goes again to whoever opens it. The GM undoes a find
 * by deleting its entry. A found note's whole text and images are stored for players and named by id
 * in its entry (`FoundTexts`), nothing else.
 */
export class FoundShare {
  private readonly rate = new MoveRate(FIND_BURST, FINDS_PER_SECOND);
  /** Pins being read for a first find, by map and pin: a second open meanwhile finds nothing new. */
  private readonly finding = new Set<string>();
  private readonly texts: FoundTexts;

  constructor(private readonly log: TableLog, private readonly ports: FoundSharePorts) {
    this.texts = new FoundTexts(ports.app, log, ports.stored);
  }

  start(): void {
    this.texts.start();
  }

  stop(): void {
    this.texts.stop();
  }

  /** The found notes' references may go another way now: their notes are read again, and changed entries go out. */
  refreshAssets(): void {
    this.texts.refreshAll();
  }

  /** The log entry that tells who found the pin `pinId` of the map `mapPath`, or null while nobody has. */
  entryOf(mapPath: string, pinId: string): string | null {
    return this.log.entries().find((entry) => entry.kind === 'found' && entry.pin?.map === mapPath && entry.pin.pin === pinId)?.id ?? null;
  }

  /** A player's message: a pin they open; false when it is none, which the others then read. */
  receive(from: string, body: unknown): boolean {
    if (!isRecord(body) || body.t !== 'pin-found') return false;
    const message = parsePlayerMessage(body);
    if (message?.t === 'pin-found' && this.ports.nameOf(from) !== null && this.rate.take(from, this.ports.now())) void this.find(from, message);
    return true;
  }

  private async find(from: string, message: PlayerPinFound): Promise<void> {
    const layers = this.ports.layers();
    const listed = layers?.readablePin(message.scene, message.pin) ?? null;
    if (layers === null || listed === null) return;
    const { map, pin: { id: pin } } = listed;
    const known = this.entryOf(map, pin);
    if (known !== null) return this.sendEntry(known, from);
    const key = `${map}\n${pin}`;
    if (this.finding.has(key)) return;
    this.finding.add(key);
    try {
      const read = await this.texts.read(listed.pin.notePath, map);
      const raced = this.entryOf(map, pin);
      if (raced !== null) return this.sendEntry(raced, from);
      const found = { map, pin, link: listed.pin.notePath };
      const id = read === null ? null : this.log.pinFound(from, read.handout.note, found);
      if (id === null || read === null) return;
      this.texts.keep(id, read, found);
      layers.update();
    } finally {
      this.finding.delete(key);
    }
  }

  /** A found pin's entry to the player who opened it, who may no longer hold it (it left their part of the log). */
  private sendEntry(id: string, to: string): void {
    const entry = this.log.entries().find((logged) => logged.id === id);
    const view = entry === undefined ? null : viewOf(entry, to);
    if (view !== null) this.ports.send({ t: 'log-entry', entry: view }, to);
  }
}
