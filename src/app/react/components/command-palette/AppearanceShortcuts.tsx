import React from 'react';
import { Dices, PanelBottom } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { t } from '../../../i18n';

interface AppearanceShortcutsProps {
  /** Starts the toolbar editor and closes the palette; absent where the toolbar cannot be changed (the player view). */
  onCustomizeToolbar: (() => void) | undefined;
  onDiceSettings: () => void;
}

/** The Appearance page's ways to what else changes how Atlas looks: the toolbar's tools and the dice. */
export function AppearanceShortcuts({ onCustomizeToolbar, onDiceSettings }: AppearanceShortcutsProps): React.JSX.Element {
  return (
    <>
      {onCustomizeToolbar && (
        <Button variant="ghost" size="sm" onClick={onCustomizeToolbar}>
          <PanelBottom />
          {t('toolbarEdit.customize')}
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onDiceSettings}>
        <Dices />
        {t('diceSettings.command')}
      </Button>
    </>
  );
}
