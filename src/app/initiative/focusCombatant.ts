import type { AtlasView } from '../atlas-view';
import type { ViewAtlasState } from '../storeFactory';
import { panToToken } from '../pixi/tokenFocus';
import { addTokenHighlight, showLevelOfToken, whenSpriteShown, type TokenLevelState } from '../pixi/utils/tokenHighlight';
import { mapTokens } from '../tokens/offMap';

/**
 * The selection after a click on a combatant's card, as a click on its token makes it: the token
 * alone, or with Shift added to the selection, and taken out of it where it was in.
 */
export function cardClickSelection(selectedIds: readonly string[], tokenId: string, additive: boolean): string[] {
  if (!additive) return [tokenId];
  return selectedIds.includes(tokenId) ? selectedIds.filter((id) => id !== tokenId) : [...selectedIds, tokenId];
}

/**
 * A click on a combatant's card: selects its token as a click on the map would, so its bars and
 * their controls show, brings it into view at the GM's zoom (`panToToken`) and lets it glow. A token
 * the canvas does not show (the players' view, a peek, out of the players' sight) is not selected,
 * as the canvas itself drops it from the selection: its controls would float over empty map and
 * Delete or the arrow keys act on what nobody sees. A combatant kept beside the map has nowhere to
 * be brought to, and nothing happens. A token on another floor is found there: the view shows its
 * level first, and selects and lights it once its sprite is drawn.
 */
export function focusCombatant(
  view: AtlasView | null,
  state: Pick<ViewAtlasState, 'selectedIds' | 'setSelection' | 'grid'> & TokenLevelState,
  tokenId: string,
  additive: boolean,
): void {
  const token = mapTokens(state.objects)[tokenId];
  if (!token) return;
  // Showing another level clears the selection, so the click selects from none there
  const otherLevel = view !== null && showLevelOfToken(state, tokenId);
  const select = (selectedIds: readonly string[]): void => {
    if (view?.renderer?.canvasShowsToken(tokenId)) state.setSelection(cardClickSelection(selectedIds, tokenId, additive));
  };
  if (!otherLevel) select(state.selectedIds);
  const viewport = view?.renderer?.getViewportInstance?.();
  if (!viewport) return;
  panToToken(viewport, token, state.grid?.size ?? 70);
  if (!view || !otherLevel) {
    addTokenHighlight(view, tokenId);
    return;
  }
  whenSpriteShown(view, tokenId, () => {
    select([]);
    addTokenHighlight(view, tokenId);
  });
}
