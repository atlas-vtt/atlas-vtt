import React, { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { customAccent, onAccentChange, setAccent } from './accentColour';
import { LOOK_CLASS } from './atlasLook';
import { ColourSwatches } from './ColourSwatches';
import { cssColorToHexNumber, hexColorOf, resolveCssColor } from '../pixi/utils/colorUtils';
import { SettingChoiceRow } from '../react/components/command-palette/SettingRows';
import { t } from '../i18n';

/** Where the colour picker opens while no colour is picked and the look's accent cannot be read. */
const PICKER_START = '#808080';

/**
 * The accent of the GM's own theme, by theme name, as last seen while no accent colour was picked: once one is,
 * Obsidian's colour stands over the theme's on `body` and the theme's can no longer be read there.
 */
const themeAccents = new Map<string, string>();

interface AccentState {
  accent: string;
  theme: string;
}

/** The accent setting and the theme it is shown over, followed while the row shows. */
function useAccentState(app: App): AccentState {
  const subscribe = useCallback((changed: () => void): (() => void) => {
    const stop = onAccentChange(app, changed);
    // A theme switch, or a look switch, which Atlas announces the same way.
    const ref = app.workspace.on('css-change', changed);
    return (): void => { stop(); app.workspace.offref(ref); };
  }, [app]);
  const snapshot = useSyncExternalStore(subscribe, () => `${customAccent(app)}\n${app.customCss?.theme ?? ''}`);
  const [accent = '', theme = ''] = snapshot.split('\n');
  return { accent, theme };
}

/** The accent colour of the appearance choices: the look's own, a preset or a colour of the GM's, one setting with Obsidian's. */
export function AccentColourRow({ app }: { app: App }): React.JSX.Element {
  const { accent, theme } = useAccentState(app);
  const group = useRef<HTMLDivElement>(null);

  // Remembers the GM's theme's accent while it shows, so the look's own swatch can show it under a picked colour too.
  useEffect(() => {
    const body = group.current?.ownerDocument.body;
    if (accent !== '' || !body || body.classList.contains(LOOK_CLASS)) return;
    const shown = (body.ownerDocument.defaultView ?? window).getComputedStyle(body).getPropertyValue('--interactive-accent').trim();
    if (shown) themeAccents.set(theme, shown);
  }, [accent, theme]);

  const rememberedTheme = accent !== '' ? themeAccents.get(theme) : undefined;

  return (
    <SettingChoiceRow label={t('appearance.accent')} hint={t('appearance.accentHint')}>
      <ColourSwatches
        label={t('appearance.accent')}
        value={accent}
        base={{
          label: t('appearance.accentOwn'),
          className: `atlas-accent-swatch--own${accent !== '' && !rememberedTheme ? ' atlas-accent-swatch--unknown' : ''}`,
          style: rememberedTheme ? { '--atlas-theme-accent': rememberedTheme } as React.CSSProperties : undefined,
        }}
        onChange={(hex) => setAccent(app, hex)}
        pickerStart={shownAccentHex}
        groupRef={group}
      />
    </SettingChoiceRow>
  );
}

/** The accent `doc` shows now as `#rrggbb`: the Atlas look's own, else the theme's; grey where none can be read. */
function shownAccentHex(doc: Document): string {
  const style = (doc.defaultView ?? window).getComputedStyle(doc.body);
  const shown = style.getPropertyValue('--atlas-look-accent').trim() || style.getPropertyValue('--interactive-accent').trim();
  if (!shown) return PICKER_START;
  return hexColorOf(cssColorToHexNumber(shown.startsWith('#') ? shown : resolveCssColor(shown)));
}
