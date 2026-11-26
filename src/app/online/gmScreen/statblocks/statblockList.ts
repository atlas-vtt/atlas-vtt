import { TFile, type App } from 'obsidian';
import { bestiaryLookup, type BestiaryLookup } from '../../../creatures/linkedCreature';
import { turnHolders } from '../../../initiative/turnHolders';
import { fightStatblockPaths, playerStatblockPaths, statblocksForScreen } from '../../../react/components/dm-screen/fightStatblocks';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import { noteBasename } from '../../../services/FantasyStatblocksService';
import type { TokenEntity } from '../../../types';
import { MAX_STATBLOCK_ENTRIES } from '../../protocol/index.ts';
import type { FrontSceneState } from './frontScene.ts';

/** The longest name a list entry carries (the protocol's limit). */
const MAX_NAME = 200;

/** A statblock of the map in front as the list shows it, before it is given its id and portrait. */
export interface ListedStatblock {
  readonly path: string;
  readonly tokens: readonly TokenEntity[];
  readonly name: string;
  /** The art its tokens share, as the DM screen shows it on the statblock (`useTokenPortrait`); null where they differ or have none. */
  readonly art: string | null;
  readonly turn: boolean;
  readonly fight: boolean;
  readonly player: boolean;
}

const clipped = (name: string): string => name.trim().slice(0, MAX_NAME);

/** A statblock's name: its note's `name`, else its bestiary creature's, else the note's own name. */
function statblockName(app: App, bestiary: BestiaryLookup, path: string): string {
  const file = app.vault.getAbstractFileByPath(path);
  const named: unknown = file instanceof TFile ? app.metadataCache.getFileCache(file)?.frontmatter?.name : undefined;
  if (typeof named === 'string' && named.trim() !== '') return clipped(named);
  const creature: unknown = bestiary.byPath.get(path)?.name;
  return clipped(typeof creature === 'string' && creature.trim() !== '' ? creature : noteBasename(path));
}

function sharedArt(tokens: readonly TokenEntity[]): string | null {
  const arts = new Set(tokens.flatMap((token) => (token.imagePath ? [token.imagePath] : [])));
  return arts.size === 1 ? [...arts][0] ?? null : null;
}

/**
 * The DM screen's statblocks of the map in front, in the order it shows them with every one listed (`all`: a
 * fight's combatants first, in turn order), each with whether it fights, is a player character's or has the turn
 * (as the map's turn marker: by sides a combatant the map's resource `definitions` call defeated holds none).
 * The device chooses among them as the DM screen's switch does (`statblocksForScreen`).
 */
export function listedStatblocks(
  app: App,
  shown: ReadonlyMap<string, TokenEntity[]>,
  state: FrontSceneState,
  definitions: readonly ResourceDefinition[],
): ListedStatblock[] {
  const { tokens } = state.objects;
  const fightPaths = state.initiative.isActive ? fightStatblockPaths(state.initiative.entries, tokens).filter((path) => shown.has(path)) : [];
  const players = playerStatblockPaths(tokens);
  const turn = new Set(turnHolders(state.initiative, tokens, definitions));
  const fighting = new Set(fightPaths);
  const bestiary = bestiaryLookup(app);
  return statblocksForScreen(shown, fightPaths, 'all', players).slice(0, MAX_STATBLOCK_ENTRIES).map(([path, pathTokens]) => ({
    path,
    tokens: pathTokens,
    name: statblockName(app, bestiary, path),
    art: sharedArt(pathTokens),
    turn: pathTokens.some((token) => turn.has(token.id)),
    fight: fighting.has(path),
    player: players.has(path),
  }));
}
