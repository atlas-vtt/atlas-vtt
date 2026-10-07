import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { onCustomLooksChange } from '../../dice3d/customLooks';
import { diceLookChoices, type DiceLookChoice } from '../../dice3d/diceLookChoices';
import { SettingsService } from '../../services/SettingsService';

export interface DiceLookChoiceState {
  /** The stored choice: an extension look's full id, or empty for Atlas's own. */
  value: string;
  choices: DiceLookChoice[];
}

/** The dice look chosen and every look to choose from, kept current as settings and registered looks change. */
export function useDiceLookChoice(app: App | undefined): DiceLookChoiceState {
  const settings = SettingsService.forApp(app);
  const [state, setState] = useState<DiceLookChoiceState>(() => readChoice(settings));

  useEffect(() => {
    const update = (): void => setState(readChoice(settings));
    update();
    const stops = [onCustomLooksChange(update), settings?.onChange(update)];
    return (): void => stops.forEach((stop) => stop?.());
  }, [settings]);

  return state;
}

function readChoice(settings: SettingsService | undefined): DiceLookChoiceState {
  const value = settings?.getDiceLookId() ?? '';
  return { value, choices: diceLookChoices(value) };
}
