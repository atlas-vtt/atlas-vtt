import React, { useEffect, useState } from 'react';
import { render } from '@testing-library/react';
import type { RecoveryButton } from '../../src/app/recovery/recoveryTypes';
import { ADVENTURER, BUTTONS, CONDITIONS, RESOURCES } from '../fixtures/recoveryFixtures';
import { RecoveryEditor } from '../../src/app/statblocks/editor/rests/RecoveryEditor';
import { DASHBOARD_THEME } from './dashboardTheme';

/** Obsidian's buttons, inputs and scrollbars as the plugin meets them. */
export const RECOVERY_THEME = DASHBOARD_THEME;

/** The width the template editor's card column has at a common panel width. */
const COLUMN_WIDTH = 520;

/** What the harness hands back: the buttons after every edit. */
export interface RecoveryHarness {
  buttons: () => readonly RecoveryButton[];
}

/**
 * The recovery buttons as the template editor shows them where the card stands, a column of the
 * card's width. `onEscapeOut`: an Escape the editor leaves alone, as whatever listens beyond it hears it.
 */
export function mountRecoveryEditor(theme: 'light' | 'dark', initial: readonly RecoveryButton[] = BUTTONS, onEscapeOut: () => void = () => undefined): RecoveryHarness {
  document.body.className = `theme-${theme}`;
  let latest = initial;
  function Column(): React.ReactElement {
    const [buttons, setButtons] = useState(initial);
    useEffect(() => {
      const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onEscapeOut(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, []);
    return (
      <div className="atlas-vtt-plugin" style={{ width: COLUMN_WIDTH, padding: 16 }}>
        <section className="atlas-rc-pane atlas-te-rests">
          <RecoveryEditor template={ADVENTURER} name="Adventurer" buttons={buttons} resources={RESOURCES} conditions={CONDITIONS}
            onButtonsChange={(next) => { latest = next; setButtons(next); }} />
        </section>
      </div>
    );
  }
  render(<Column />);
  return { buttons: () => latest };
}
