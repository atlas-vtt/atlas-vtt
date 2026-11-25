import React from 'react';
import type { App } from 'obsidian';
import { DiceColourStrip } from '../react/components/command-palette/DiceColourStrip';
import { useDiceLook } from '../react/hooks/useDiceLook';
import { useDicePreviews } from '../react/hooks/useDicePreviews';
import { SettingsService } from '../services/SettingsService';

/** The dice colour of the appearance choices, the d20s each colour gives on one line; the same setting as the Dice settings'. */
export function DiceColourRow({ app }: { app: App }): React.JSX.Element {
  const look = useDiceLook(app);
  const previews = useDicePreviews(app, look.font);
  return (
    <div className="atlas-appearance-dice">
      <DiceColourStrip value={look.colour} previews={previews} onChange={(colour) => SettingsService.forApp(app)?.setDiceLook({ colour })} />
    </div>
  );
}
