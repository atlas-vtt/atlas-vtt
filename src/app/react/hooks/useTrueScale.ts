import { useStore } from 'zustand';
import { useAtlasSettings } from '../../keyboard/useMapHotkeys';
import { PlayerWindowService } from '../../services/PlayerWindowService';
import { playerWindowStore } from '../../stores/playerWindowStore';

/**
 * Whether players see their TV at true scale now (`PlayerWindowService.isTrueScale`), followed as the player window
 * opens and closes and as TrueScale is switched or a TV fitted (both settings changes).
 */
export function useTrueScale(): boolean {
  const open = useStore(playerWindowStore, (state) => state.isOpen);
  useAtlasSettings();
  return open && (PlayerWindowService.getInstance()?.isTrueScale() ?? false);
}
