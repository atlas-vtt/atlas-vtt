import type { GmMessage, RollRequestAnswer } from '../protocol/index.ts';
import type { DiceSource } from './atlasDice.ts';
import type { AtlasPlayerSettings, LightingSource } from './atlasLighting.ts';
import type { MapLayerSource } from './atlasMapLayers.ts';
import type { GmRuler } from './dragRulers.ts';
import type { LoggedRoll, RollRequest } from './log/TableLog.ts';
import type { MarkSharePorts } from './MarkShare.ts';
import type { RemoteDrag } from '../marks/index.ts';
import type { RulesSharePorts } from './RulesShare.ts';
import type { SeatSource } from './seatSource.ts';
import type { TokenSharePorts } from './TokenShare.ts';

/** What the shared scene of an Atlas tab reads of the tab and the table, and how it reaches players. */
export interface SceneSharePorts extends TokenSharePorts, RulesSharePorts, Pick<MarkSharePorts, 'gmMarks' | 'showPlayerMarks' | 'showPlayerCursors' | 'nameOf'> {
  notice(text: string): void;
  /** Sends a live message (where dragged tokens are now) ahead of other frames, the latest of a key winning; without it drags reach players through the token list only. */
  sendLive?(body: GmMessage, key: string, to?: string): void;
  /** What the GM's own drag ruler measures now, or null while it shows none; without it players see none of the GM's. */
  gmDragRuler?(): GmRuler | null;
  /** Draws the rulers of the players' drags for the GM. */
  showPlayerDrags?(drags: readonly RemoteDrag[]): void;
  /** Where the GM's canvas draws these tokens now (the GM's own drag runs ahead of the store there). */
  drawnPlaces?(tokenIds: readonly string[]): ReadonlyMap<string, { readonly x: number; readonly y: number }>;
  /** Who plays and owns which token; without it no player is told which tokens are theirs. */
  seats?: SeatSource | undefined;
  /** Where the GM's lighting reads its rules and measurement, or null while it cannot be read. */
  lightingSource(): LightingSource | null;
  /** The Atlas settings that decide what players get. */
  atlasSettings(): AtlasPlayerSettings;
  /** The shared tab's dice; without them players cannot roll and see no rolls. */
  dice?(): DiceSource | null;
  /** The shared tab's grid, doors, sensed tokens and collection; without it players get none of the map's layers. */
  mapLayers?(): MapLayerSource | null;
  /** Takes a roll of the shared tab into the table's log. */
  logRoll?(roll: LoggedRoll): void;
  /** The roll button of the log a player's roll answers, as they may roll it. */
  rollRequest?(from: string, answer: RollRequestAnswer): RollRequest | null;
  /** The log entry that tells who found a readable pin of a map, or null while nobody has. */
  foundPin?(mapPath: string, pinId: string): string | null;
  /** Whether the GM's renderer draws the level its view shows now (its map and sight); without it, it always does. */
  rendererCurrent?(): boolean;
  /** The level of a scene with several that Atlas presents to its player view (the eye); unset is the first. Players without a token on the map see it. */
  presentedLevel?(): string | undefined;
}
