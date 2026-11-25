import React from 'react';
import type { App } from 'obsidian';
import type { LookService } from './lookService';
import { LookCards } from './LookCards';
import { AccentColourRow } from './AccentColourRow';
import { IvyColourRow } from './IvyColourRow';
import { DiceColourRow } from './DiceColourRow';
import { GlassRow } from './GlassRow';
import { SquareCornersRow } from './SquareCornersRow';
import { ToolbarOnHoverRow } from './ToolbarOnHoverRow';
import { CompanionSettings } from './CompanionSettings';
import './appearance-choices.scss';

interface AppearanceChoicesProps {
  app: App;
  looks: LookService;
}

/** The look; the dice colour; the switches (the look's transparency, square corners, the toolbar shown on hover) with the settings other plugins add; the accent colour and the Medieval look's ivy colour: one view, shown by the welcome wizard's Make it yours page and the palette's Appearance settings. */
export function AppearanceChoices({ app, looks }: AppearanceChoicesProps): React.JSX.Element {
  return (
    <div className="atlas-appearance-choices">
      <LookCards looks={looks} />
      <DiceColourRow app={app} />
      <div className="atlas-appearance-switches">
        <GlassRow looks={looks} />
        <SquareCornersRow looks={looks} />
        <ToolbarOnHoverRow app={app} />
        <CompanionSettings />
      </div>
      <div className="atlas-appearance-colours">
        <AccentColourRow app={app} />
        <IvyColourRow looks={looks} />
      </div>
    </div>
  );
}
