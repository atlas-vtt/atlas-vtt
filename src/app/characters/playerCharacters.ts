import type { TokenAsset } from '../services/AssetService';

/** What a placed token carries that names the library token it was placed from. */
export interface PlacedTokenSource {
  assetId?: string;
  imagePath: string;
}

/** Whether the library token is one of the players' characters. */
export const isPlayerCharacter = (asset: Pick<TokenAsset, 'playerCharacter'>): boolean => asset.playerCharacter === true;

/**
 * The library token a placed token was placed from: the one its `assetId` names, else (a token
 * placed before tokens carried one, or whose record was copied under a new id) the one whose art it
 * shows. Null when no library token is known for it.
 */
export function libraryTokenOf(token: PlacedTokenSource, tokens: readonly TokenAsset[]): TokenAsset | null {
  if (token.assetId !== undefined) {
    const named = tokens.find((asset) => asset.id === token.assetId);
    if (named) return named;
  }
  return tokens.find((asset) => asset.imagePath === token.imagePath) ?? null;
}

/** The first made of several library tokens (then by id): the one a character's forms are named after. */
const oldestFirst = (a: TokenAsset, b: TokenAsset): number => a.createdAt - b.createdAt || a.id.localeCompare(b.id);

/**
 * The player character a library token stands for: every player character linking one statblock
 * note is one character, its forms (a druid's other shapes, other art), named by the first of them
 * made, whose values all its tokens share. A player character without a note is a character of its
 * own; any other token is none (null). Never changes while that first token keeps its note.
 */
export function characterOf(record: TokenAsset, tokens: readonly TokenAsset[]): TokenAsset | null {
  if (!isPlayerCharacter(record)) return null;
  if (!record.statblockPath) return record;
  return playerCharactersLinking(tokens, record.statblockPath).sort(oldestFirst)[0] ?? record;
}

/** The character whose statblock is the note at `notePath` (`characterOf`); null where no player character links it. */
export function characterOfNote(tokens: readonly TokenAsset[], notePath: string): TokenAsset | null {
  return playerCharactersLinking(tokens, notePath).sort(oldestFirst)[0] ?? null;
}

/**
 * The player characters whose statblock is the note at `notePath`: the library tokens marked as the
 * players' characters that link the note, by name (then id), so every caller names them in one order.
 */
export function playerCharactersLinking(tokens: readonly TokenAsset[], notePath: string): TokenAsset[] {
  return tokens
    .filter((asset) => isPlayerCharacter(asset) && asset.statblockPath === notePath)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
