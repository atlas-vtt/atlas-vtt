import type { StoreApi } from 'zustand';
import type { ContextMenuEntry } from '../../root/ContextMenuContext';
import { chosenSpeed, speedKindOf, type StatedSpeed } from '../../../creatures/statblockSpeeds';
import { formatGameUnits } from '../../../grid/measurementFormat';
import { t } from '../../../i18n';
import { levelObjects } from '../../../levels/levelObjects';
import type { TokenMovement } from '../../../pixi/token-renderer/tokenMovement';
import type { ViewAtlasState } from '../../../storeFactory';
import { mapTokens } from '../../../tokens/offMap';

/** A speed's row: its name as the statblock writes it, capitalised; the speed that names no kind is walking. */
function speedLabel(speed: StatedSpeed): string {
  const name = speed.name?.trim() ?? '';
  return name === '' ? t('token.movementWalk') : name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * "Movement ▸" for the tokens `tokenIds` (the selection, or the token clicked alone): one row per
 * speed the clicked token's statblock states, its first on top, the one it moves by ticked. A row
 * is offered only where every one of the tokens states that speed, and picking it sets it for
 * all of them in one store write, so one undo step. None where the collection names no movement
 * steps or measures in range bands (a speed changes nothing there), for a token that moves by a
 * speed of its own, and where fewer than two speeds are left to pick from.
 */
export function tokenMovementSubmenu(
  store: Pick<StoreApi<ViewAtlasState>, 'getState'>,
  tokenId: string,
  tokenIds: readonly string[],
  movement: Pick<TokenMovement, 'rules' | 'settings' | 'choicesOf'>,
): ContextMenuEntry | null {
  const settings = movement.settings();
  if (settings.mode === 'abstract' || movement.rules().steps.length === 0) return null;
  const tokens = mapTokens(levelObjects(store.getState()));
  const clicked = tokens[tokenId];
  if (!clicked) return null;
  const choices = movement.choicesOf(clicked);
  const others = tokenIds.flatMap((id) => (id === tokenId ? [] : [new Set(movement.choicesOf(tokens[id] ?? {}).map((speed) => speedKindOf(speed.name)))]));
  // The first row clears the pick, which every token with speeds to pick from can take; a later one needs the speed by name.
  const offered = choices.filter((choice, index) => others.every((kinds) => (index === 0 ? kinds.size > 0 : kinds.has(speedKindOf(choice.name)))));
  if (offered.length < 2 || offered[0] !== choices[0]) return null;

  const current = chosenSpeed(choices, clicked.speedKind);
  const children: ContextMenuEntry[] = offered.map((choice, index) => ({
    type: 'item',
    label: speedLabel(choice),
    detail: formatGameUnits(choice.speed, settings),
    checked: choice === current,
    onClick: () => store.getState().updateTokens(
      tokenIds.map((id) => ({ id, changes: { speedKind: index === 0 ? undefined : choice.name ?? undefined } })),
    ),
  }));
  return { type: 'submenu', label: t('token.movement'), icon: 'footprints', children };
}
