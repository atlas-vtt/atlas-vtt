import type { App } from 'obsidian';
import { isRecord, parsePlayerMessage, type GmMessage, type PlayerPinFound, type PlayerSignFound } from '../../protocol/index.ts';
import { viewOf } from '../log/logEntries.ts';
import type { TableLog } from '../log/TableLog.ts';
import { MoveRate } from '../moveCheck.ts';
import type { MapLayerShare } from '../MapLayerShare.ts';
import { FoundTexts } from './FoundTexts.ts';
import type { AssetStoring } from '../assets/assetUses.ts';
import type { NotePin } from '../../../types';
import { isReadablePin } from './ReadablePins.ts';
import { foundPinKey } from './foundPinKey.ts';
import type { WorldMapSign } from '../book/worldMapGate.ts';

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
  /** The readable pin of the world map players know as `alias` (`WorldMapSigns.sign`), or null. */
  sign?(alias: string): WorldMapSign | null;
  /** A pin was found: who shows found pins shows it so. */
  found?(): void;
}

/** A pin a player opens, as the GM has it: the scene file it is saved in, its id there and the note it links. */
interface OpenedPin {
  readonly map: string;
  readonly pin: string;
  readonly link: string;
}

/**
 * The readable pins players find. A player who opens a pin they see now (checked again here: the pin
 * readable, in the players' picture of the shared scene, the player at the table), or a sign of the
 * world map they were handed, finds it the first time: the log tells everyone who found it and holds its note to read (`TableLog.pinFound`). Later
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

  /** The log entries that tell who found pins, by `foundPinKey`: the first of each. */
  foundPins(): Map<string, string> {
    const found = new Map<string, string>();
    for (const entry of this.log.entries()) {
      if (entry.kind !== 'found' || entry.pin === undefined) continue;
      const key = foundPinKey(entry.pin.map, entry.pin.pin);
      if (!found.has(key)) found.set(key, entry.id);
    }
    return found;
  }

  /**
   * The pins of the shared map `mapPath` as the GM has them now: a found pin pointed at another note
   * or heading hands players that one from now on, in the same entry; where players may not read what
   * it links (the readable rule), the entry keeps the text it has and follows no note.
   */
  followPins(mapPath: string, pins: Readonly<Record<string, NotePin>>): void {
    for (const entry of this.log.entries()) {
      if (entry.kind !== 'found' || entry.pin?.map !== mapPath) continue;
      const pin = pins[entry.pin.pin];
      if (pin !== undefined && pin.notePath !== entry.pin.link) this.texts.relink(entry, { ...entry.pin, link: pin.notePath }, isReadablePin(pin));
    }
  }

  /** A player's message: a pin or sign they open; false when it is none, which the others then read. */
  receive(from: string, body: unknown): boolean {
    if (!isRecord(body) || (body.t !== 'pin-found' && body.t !== 'sign-found')) return false;
    const message = parsePlayerMessage(body);
    if ((message?.t === 'pin-found' || message?.t === 'sign-found') && this.ports.nameOf(from) !== null && this.rate.take(from, this.ports.now())) void this.find(from, message);
    return true;
  }

  /** The pin a player opens, while they may open it; null for any other. */
  private opened(message: PlayerPinFound | PlayerSignFound): OpenedPin | null {
    if (message.t === 'sign-found') return this.ports.sign?.(message.sign) ?? null;
    const listed = this.ports.layers()?.readablePin(message.scene, message.pin) ?? null;
    return listed === null ? null : { map: listed.map, pin: listed.pin.id, link: listed.pin.notePath };
  }

  private async find(from: string, message: PlayerPinFound | PlayerSignFound): Promise<void> {
    const opened = this.opened(message);
    if (opened === null) return;
    const { map, pin, link } = opened;
    const known = this.entryOf(map, pin);
    if (known !== null) return this.sendEntry(known, from);
    const key = foundPinKey(map, pin);
    if (this.finding.has(key)) return;
    this.finding.add(key);
    try {
      const read = await this.texts.read(link, map);
      const raced = this.entryOf(map, pin);
      if (raced !== null) return this.sendEntry(raced, from);
      const found = { map, pin, link };
      const id = read === null ? null : this.log.pinFound(from, read.handout.note, found);
      if (id === null || read === null) return;
      this.texts.keep(id, read, found);
      this.ports.layers()?.update();
      this.ports.found?.();
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
