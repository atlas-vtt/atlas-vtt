import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { DEFAULT_DICE_LOOK, type DiceLook } from '../../dice3d/diceLook';
import { SettingsService } from '../../services/SettingsService';

/** The dice look from Atlas' settings, kept current as it changes. */
export function useDiceLook(app: App | undefined): DiceLook {
  const settings = SettingsService.forApp(app);
  const [look, setLook] = useState<DiceLook>(() => settings?.get('diceLook') ?? { ...DEFAULT_DICE_LOOK });

  useEffect(() => {
    if (!settings) return;
    const update = (): void => {
      const next = settings.get('diceLook');
      setLook((prev) => (prev.colour === next.colour && prev.font === next.font ? prev : next));
    };
    update();
    return settings.onChange(update);
  }, [settings]);

  return look;
}

/** The class that sets the dice font for the numbers inside an element. */
export function diceFontClass(look: DiceLook): string | false {
  return look.font === 'scifi' && 'atlas-dice-font--scifi';
}
