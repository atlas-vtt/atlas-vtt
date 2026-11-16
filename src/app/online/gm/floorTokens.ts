import type { RollSceneLookup, ShownRollToken } from '../../services/playerRollSource';
import { hasLevels, resolveLevel } from '../../levels/sceneLevels';
import type { SceneStore } from './atlasView.ts';
import type { FloorShare } from './FloorShare.ts';
import type { Floor } from './playerFloors.ts';
import type { SceneDiceParts } from './SceneDice.ts';
import type { SceneSharePorts } from './sceneSharePorts.ts';

/** The key of a floor's share: its level id, '' for a scene of one floor. */
export const floorKey = (floor: Floor): string => floor ?? '';

export interface FloorTokensDeps {
  readonly store: SceneStore;
  readonly ports: Pick<SceneSharePorts, 'randomId' | 'seats'>;
  /** The floors shared now, by `floorKey`. */
  readonly floors: ReadonlyMap<string, FloorShare>;
  /** The share of the floor a player stands on. */
  shareOf(player: string): FloorShare | undefined;
  /** Whether every player of the scene stands on one floor. */
  together(): boolean;
}

/**
 * The tokens of the shared scene across its floors: the ids players know them by (the same on every
 * floor, so a token that takes the stairs keeps its id), and what the scene's rolls and the books
 * read of the lists and pictures of each floor.
 */
export class FloorTokens {
  readonly aliases = new Map<string, string>();

  constructor(private readonly deps: FloorTokensDeps) {}

  /** The random id players know a token by. */
  alias(tokenId: string): string {
    let alias = this.aliases.get(tokenId);
    if (alias === undefined) {
      alias = this.deps.ports.randomId();
      this.aliases.set(tokenId, alias);
    }
    return alias;
  }

  /** The share whose last scene is `scene`. */
  shareOfScene(scene: string): FloorShare | undefined {
    return [...this.deps.floors.values()].find((share) => share.sceneId === scene);
  }

  /** What the scene's dice read of the floors' lists: each player's of their own floor. */
  diceParts(): SceneDiceParts {
    return {
      alias: (tokenId) => this.alias(tokenId),
      listedScene: (player) => this.deps.shareOf(player)?.tokens.listedScene ?? null,
      listedToken: (player, alias) => this.deps.shareOf(player)?.tokens.listedToken(alias),
      listedAlias: (tokenId) => [...this.deps.floors.values()].map((share) => share.tokens.listedAlias(tokenId)).find((alias) => alias !== undefined),
      shownToken: (mapPath, tokenId) => this.shownToken(mapPath, tokenId),
    };
  }

  /** The tokens among `tokenIds` the players of each token's floor see now, as their frame names them: what the books read. */
  shown(mapPath: string, tokenIds: readonly string[]): ReadonlyMap<string, ShownRollToken> {
    const byFloor = new Map<string, string[]>();
    for (const tokenId of tokenIds) {
      const key = this.floorKeyOf(tokenId);
      if (key !== null) byFloor.set(key, [...(byFloor.get(key) ?? []), tokenId]);
    }
    return new Map([...byFloor].flatMap(([key, ids]) => [...(this.deps.floors.get(key)?.shown(mapPath, ids) ?? [])]));
  }

  /**
   * A token as the players' frame shows it, for a roll that names it. Every player hears a roll, so
   * while players stand on several floors only a player's own token is named (the party knows its own).
   */
  private shownToken(mapPath: string, tokenId: string): ReturnType<RollSceneLookup['shownToken']> {
    const token = this.deps.store.getState().objects.tokens[tokenId];
    const key = this.floorKeyOf(tokenId);
    if (token === undefined || key === null || (!this.deps.together() && this.deps.ports.seats?.ownerOf(tokenId, token) === undefined)) return null;
    const share = this.deps.floors.get(key);
    // Only a token of a list players were sent
    return share?.tokens.listedScene === null ? null : share?.shown(mapPath, [tokenId]).get(tokenId) ?? null;
  }

  /** The key of the floor a token stands on, or null for a token the scene does not have. */
  private floorKeyOf(tokenId: string): string | null {
    const { objects, levels } = this.deps.store.getState();
    const token = objects.tokens[tokenId];
    if (token === undefined) return null;
    return floorKey(hasLevels(levels) ? resolveLevel(levels, token.level) : null);
  }
}
