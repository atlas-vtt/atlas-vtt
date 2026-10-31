import { normalizePath, type App } from 'obsidian';
import type { GmMessage } from '../../protocol/index.ts';
import { setLootRecipientSource } from '../../../loot/lootRecipients';
import type { ArmedCards } from '../armedCards.ts';
import { companionTimers } from '../companionTimers.ts';
import type { Ownership } from '../ownership.ts';
import type { VaultImage } from '../TokenShare.ts';
import type { BookScene } from './bookScene.ts';
import { BookShare } from './BookShare.ts';
import type { AssetStoring } from '../assets/assetUses.ts';
import { StoredQuests } from './storedQuests.ts';
import { writeCharacterValue } from './characterValues.ts';
import type { ResourceWrites } from './resourceWrites.ts';
import { gatedQuestAsset, gatedQuests, onQuestsChange } from './questGate.ts';
import { gatedRests } from './restGate.ts';
import { gatedStatblocks } from './statblockGate.ts';
import { gatedWorldMap, onWorldMapChange } from './worldMapGate.ts';
import { showNotice } from '../../../ui/notice';
import type { BookShelf } from './BookShelf.ts';

export interface TableBookPorts {
  readonly app: App;
  /** The books kept on this device. */
  readonly shelf: BookShelf;
  readonly ownership: Ownership;
  send(body: GmMessage, to: string): void;
  /** The shared scene as the books read it, or null while none is shown. */
  scene(): BookScene | null;
  readImage(path: string): Promise<VaultImage | null>;
  /** How players are handed assets the store keeps for them; without it they are handed none. */
  readonly stored?: AssetStoring | undefined;
  randomId(): string;
  /** Where players' edits of their tokens in the shared scene are written; null while no scene is shared. */
  tokenWrites(): ResourceWrites | null;
  /** The arming clock of the cards over the online control. */
  readonly cards: ArmedCards;
  /** The rest requests' cards changed. */
  cardsChanged(): void;
}

/** A running table's books, and what they hang on while it runs. */
export interface TableBook {
  readonly share: BookShare;
  /** References the books hand out may go another way now (the store refused ids): they are made again. */
  refreshAssets(): void;
  start(): void;
  stop(): void;
}

/**
 * The books of a running table in Obsidian: read from the vault and the table's ownership, told at
 * once when tokens change hands or the world map or the quests may be others, and named to the
 * loot roller as the people an item can be handed to for as long as the table runs. A player's edit
 * of a resource goes to their token in the shared scene, else to the values the played campaign
 * keeps of their character; their character's statblock is read and written through the statblock
 * gate, and followed while its note or a template changes.
 */
export function tableBook(ports: TableBookPorts): TableBook {
  const { app, ownership } = ports;
  const timers = companionTimers();
  const storedQuests = new StoredQuests(ports.stored, gatedQuestAsset);
  const share = new BookShare({
    send: (body, to) => ports.send(body, to),
    now: () => timers.now(),
    setTimer: (run, ms) => timers.setTimer(run, ms),
    clearTimer: (timer) => timers.clearTimer(timer),
    clock: () => Date.now(),
    randomId: () => ports.randomId(),
    scene: () => ports.scene(),
    players: () => ownership.list(),
    ownerOf: (tokenId, token) => ownership.ownerOf(tokenId, token),
    readImage: (path) => ports.readImage(path),
    stored: ports.stored,
    stat: (path) => {
      const file = app.vault.getFileByPath(normalizePath(path));
      return file === null ? null : { mtime: file.stat.mtime, size: file.stat.size };
    },
    worldMap: () => gatedWorldMap(),
    notice: (text) => showNotice(text),
    quests: async () => storedQuests.of(await gatedQuests()),
    editResource: (edit, answer) => {
      if (edit.kind === 'character') {
        const taken = writeCharacterValue(app, edit);
        return taken === null ? answer(null) : answer(taken.current, edit.max === undefined ? undefined : taken.max);
      }
      const writes = ports.tokenWrites();
      if (writes === null) answer(null);
      else writes.write(edit, answer);
    },
    libraryStatblock: (placed) => gatedStatblocks.libraryStatblock(placed),
    readStatblock: (path) => gatedStatblocks.read(path),
    writeStatblock: (path, patches) => gatedStatblocks.write(path, patches),
    statblockPanelWidth: () => gatedStatblocks.panelWidth?.(),
    rests: gatedRests,
    cards: ports.cards,
    cardsChanged: () => ports.cardsChanged(),
  }, ports.shelf);
  let stops: (() => void)[] = [];
  return {
    share,
    refreshAssets: () => {
      storedQuests.clear();
      share.refreshAssets();
    },
    start: () => {
      if (stops.length > 0) return;
      stops = [
        ownership.onChange(() => share.update()),
        onWorldMapChange(() => share.worldMapChanged()),
        onQuestsChange(() => share.questsChanged()),
        gatedStatblocks.onChange((path) => share.statblockChanged(path)),
        () => setLootRecipientSource(null),
        () => share.stop(),
      ];
      share.start();
      setLootRecipientSource(share);
    },
    stop: () => {
      for (const stop of stops) stop();
      stops = [];
    },
  };
}
