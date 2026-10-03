/**
 * Whether the dice tray's Secret roll switch does anything: players only see rolls while
 * "Show dice rolls" is on, so with it off the switch has no effect.
 */
export function isSecretRollEffective(secretRoll: boolean, showDiceRolls: boolean): boolean {
  return secretRoll && showDiceRolls;
}
