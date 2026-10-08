import { useAtlasStore } from '../ViewStoreContext';
import { useAtlasUI } from '../root/AtlasUIContext';
import { SettingsService } from '../../services/SettingsService';
import { useShowDiceRolls } from './useShowDiceRolls';

export interface ShareRolls {
  shown: boolean;
  onToggle: () => void;
}

/**
 * The GM's "Show my rolls to players" switch: the player view setting `showDiceRolls`, read
 * and written in place, so every control showing it follows the others. Null in a player
 * view, where nobody else watches the rolls.
 */
export function useShareRolls(): ShareRolls | null {
  const { app, view } = useAtlasUI();
  const isPlayerView = useAtlasStore((state) => state.isPlayerView) || view?.getViewType?.() === 'atlas-vtt-player';
  const shown = useShowDiceRolls(app ?? undefined);
  const settings = SettingsService.forApp(app ?? undefined);
  if (isPlayerView || !settings) return null;
  return { shown, onToggle: () => settings.setLocalPlayerViewSettings({ showDiceRolls: !shown }) };
}
