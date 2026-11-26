import type { GmMessage, RollRequestAnswer } from '../protocol/index.ts';
import type { MaskDecoder } from './exploredMaskAlpha.ts';
import type { GmTab } from './floorSource.ts';
import type { LoggedRoll, RollRequest } from './log/TableLog.ts';
import type { MarkSharePorts } from './MarkShare.ts';
import type { RulesSharePorts } from './RulesShare.ts';
import type { SeatSource } from './seatSource.ts';
import type { TokenSharePorts } from './TokenShare.ts';
import type { NotePin } from '../../types';
import type { DoorAskShown } from './doors/PlayerDoorAsks.ts';
import type { AtlasInputs } from './sceneSignal.ts';
import type { MemoryPorts } from './memory/memoryPorts.ts';
import type { PageCovers } from './coveredPages.ts';

/** What the shared scene of an Atlas tab reads of the tab and the table, and how it reaches players. */
export interface SceneSharePorts extends Omit<TokenSharePorts, 'tokenSource' | 'tokenRules' | 'tokenMoves'>, Pick<RulesSharePorts, 'measurement'>, Pick<MarkSharePorts, 'nameOf'> {
  notice(text: string): void;
  /** Atlas as of its last change (`SceneSignal`): its settings for the players' view, pause, Shared vision, the accent. */
  atlas(): AtlasInputs;
  /** The GM's shared tab: its renderer and view while it shows the presented scene, nothing (`HELD_TAB`) while the GM works on another. */
  tab(): GmTab;
  /** Sends a live message (where dragged tokens are now) ahead of other frames, the latest of a key winning; without it drags reach players through the token list only. */
  sendLive?(body: GmMessage, key: string, to?: string): void;
  /** The pages live marks leave out (their book covers the map); without it, none. */
  readonly covers?: PageCovers | undefined;
  /** Who plays and owns which token; without it no player is told which tokens are theirs. */
  seats?: SeatSource | undefined;
  /** Reads a saved explored memory, by which players know what lies on the map of rooms they remember; without it they know it by sight alone. */
  decodeMask?: MaskDecoder | undefined;
  /** What each player's own explored memory is stamped on and kept in; without it a player remembers only what their page saw. */
  playerMemory?: MemoryPorts | undefined;
  /** Takes a roll of the shared tab into the table's log. */
  logRoll?(roll: LoggedRoll): void;
  /** The roll button of the log a player's roll answers, as they may roll it. */
  rollRequest?(from: string, answer: RollRequestAnswer): RollRequest | null;
  /** The log entry that tells who found a readable pin of a map, or null while nobody has. */
  foundPin?(mapPath: string, pinId: string): string | null;
  /** The shared map's pins whenever the GM changed them, so found pins can follow the notes they link now. */
  pinsChanged?(mapPath: string, pins: Readonly<Record<string, NotePin>>): void;
  /** The level of a scene with several that Atlas presents to its player view (the eye); unset is the first. Players without a token on the map see it. */
  presentedLevel?(): string | undefined;
  /** Shows the GM a player's ask to open a door; returns what withdraws it. Without it players' asks are not taken. */
  askDoor?(shown: DoorAskShown): () => void;
}
