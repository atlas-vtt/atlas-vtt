import type { BookQuest, GmMessage } from '../../protocol/index.ts';
import type { PlacedTokenSource } from '../../../characters/playerCharacters';
import type { ResolvedStatblock } from '../../../statblocks/model/resolvedTypes';
import type { NotePatch } from '../../../statblocks/notes/patchTypes';
import type { ScaleImage } from '../assetVariants.ts';
import type { Timers } from '../companionTimers.ts';
import type { KnownPlayer, OwnedToken } from '../ownership.ts';
import type { VaultImage } from '../TokenShare.ts';
import type { BookScene } from './bookScene.ts';
import type { QuestAsset } from './questGate.ts';
import type { ResourceEdit } from './resourceEdit.ts';
import type { ResourceAnswer } from './resourceWrites.ts';
import type { StatblockWriteOutcome } from './statblockGate.ts';
import type { FileStat, WorldMapTree } from './worldMap.ts';

/** What the players' books (`BookShare`) ask of Atlas and the table: everything that reaches beyond them. */
export interface BookSharePorts extends Timers {
  send(body: GmMessage, to: string): void;
  /** The GM's clock, which notes and items are stamped with. */
  clock(): number;
  /** A new item's id: 24 hex characters from the cryptographic source. */
  randomId(): string;
  /** The shared scene as the books read it, or null while none is shown: the books then stay as they were. */
  scene(): BookScene | null;
  /** Everyone the table knows, and who of them is connected. */
  players(): readonly KnownPlayer[];
  /** The owner of a token of the shared scene (`Ownership.ownerOf`). */
  ownerOf(tokenId: string, token: OwnedToken | undefined): string | undefined;
  readImage(path: string): Promise<VaultImage | null>;
  /** The file at a vault path as it is now, or null when there is none. */
  stat(path: string): FileStat | null;
  /** The world map players may be shown now with the maps it leads into, or null for none. */
  worldMap(): Promise<WorldMapTree | null>;
  /** The quests of the campaign being played, as players read them: the same for every character. */
  quests(): Promise<readonly BookQuest[]>;
  /** What a quest's whole text or image is served from, by hash, while the quests last answered name it. */
  questAsset(hash: string): QuestAsset | undefined;
  /** Writes a checked edit of a player's own resource into Atlas, and answers what the resource holds then (null when it was not taken), at once or later. */
  editResource(edit: ResourceEdit, answer: ResourceAnswer): void;
  /** The statblock note the library token a placed token came from links, or null for none. */
  libraryStatblock(placed: PlacedTokenSource): string | null;
  /** A character's statblock note as Atlas's resolver reads it now, or null where it defines none. */
  readStatblock(path: string): Promise<ResolvedStatblock | null>;
  /** Writes a checked edit of a player's own statblock into its note, through Atlas's note writer. */
  writeStatblock(path: string, patches: readonly NotePatch[]): Promise<StatblockWriteOutcome>;
  /** Scales an image for a player who asks for a longest side; without it players get originals only. */
  scaleImage?: ScaleImage | undefined;
}
