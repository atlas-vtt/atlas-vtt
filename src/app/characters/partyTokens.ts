import type { TokenEntity } from '../types';
import { PLAYER_SIGHT_POLICY } from '../vision/tokenSightPolicy';
import { isPlayersToken } from './playerTokens';

/**
 * Whether the token is one of the party's, which committed fog never takes from the players: not hidden,
 * and with vision on (the players' sight is theirs) or known as a player's (a player character of the
 * library, a token a campaign's player was given). It stays in their picture and theirs to move under
 * fog, marked by a ring above it (`FoggedPartyRings`), as the initiative list counts it on the players'
 * side (`sideOf`). The GM hides a token to take it from the players.
 */
export function fogSparesToken(token: TokenEntity): boolean {
  return PLAYER_SIGHT_POLICY.alwaysSeen(token) || (token.isHidden !== true && isPlayersToken(token));
}
