import type { App } from 'obsidian';
import type { DiceTool } from '../../tools/DiceTool';
import { isSecretRollEffective } from '../../tools/secretRoll';
import { useSecretRoll } from './useSecretRoll';
import { useShowDiceRolls } from './useShowDiceRolls';

/** Whether the tray's secret roll switch does anything right now: it is on and players are shown rolls. */
export function useSecretRollEffective(diceTool: DiceTool | null, app: App | undefined): boolean {
  const secretRoll = useSecretRoll(diceTool);
  const showDiceRolls = useShowDiceRolls(app);
  return isSecretRollEffective(secretRoll, showDiceRolls);
}
