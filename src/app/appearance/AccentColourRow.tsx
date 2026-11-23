import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import type { App } from 'obsidian';
import { ACCENT_PRESETS, customAccent, onAccentChange, presetOfAccent, setAccent } from './accentColour';
import { LOOK_CLASS } from './atlasLook';
import { LabelTooltip } from '../packages/components/primitives/tooltip';
import { cssColorToHexNumber, hexColorOf, resolveCssColor } from '../pixi/utils/colorUtils';
import { SettingChoiceRow } from '../react/components/command-palette/SettingRows';
import { t } from '../i18n';
import './accent-colour.scss';

const OWN = 'own';
const CUSTOM = 'custom';
/** Every swatch in order: the look's own, the presets by id, then the GM's own colour. */
const CHOICES: readonly string[] = [OWN, ...ACCENT_PRESETS.map((preset) => preset.id), CUSTOM];
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

/** The Appearance page's accent colour: the look's own, a preset or a colour of the GM's, one setting with Obsidian's. */
export function AccentColourRow({ app }: { app: App }): React.JSX.Element {
  const { accent, theme } = useAccentState(app);
  const chosen = accent === '' ? OWN : presetOfAccent(accent)?.id ?? CUSTOM;
  const swatches = useRef(new Map<string, HTMLElement>());
  const picker = useRef<HTMLInputElement>(null);
  // Where the picker opens while the look's own accent is in use: that accent, read as the picker opens.
  const [pickerStart, setPickerStart] = useState(PICKER_START);

  // Remembers the GM's theme's accent while it shows, so the look's own swatch can show it under a picked colour too.
  useEffect(() => {
    const body = swatches.current.get(OWN)?.ownerDocument.body;
    if (accent !== '' || !body || body.classList.contains(LOOK_CLASS)) return;
    const shown = (body.ownerDocument.defaultView ?? window).getComputedStyle(body).getPropertyValue('--interactive-accent').trim();
    if (shown) themeAccents.set(theme, shown);
  }, [accent, theme]);

  const pick = (choice: string): void => {
    if (choice === OWN) setAccent(app, '');
    else if (choice !== CUSTOM) setAccent(app, ACCENT_PRESETS.find((preset) => preset.id === choice)?.hex ?? '');
  };

  const openCustom = (): void => {
    const input = picker.current;
    if (!input) return;
    if (accent === '') flushSync(() => setPickerStart(shownAccentHex(input.ownerDocument)));
    openPicker(input);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    // From the swatch with focus, which is the chosen one unless the keys went on to Custom.
    const focused = CHOICES.findIndex((choice) => swatches.current.get(choice) === event.target);
    const next = choiceAfterKey(event.key, focused >= 0 ? focused : CHOICES.indexOf(chosen));
    if (!next) return;
    event.preventDefault();
    // Moving onto Custom only offers it: Enter or Space opens the picker.
    pick(next);
    swatches.current.get(next)?.focus();
  };

  const swatchRef = (choice: string): ((element: HTMLElement | null) => void) => (element: HTMLElement | null): void => {
    if (element) swatches.current.set(choice, element);
    else swatches.current.delete(choice);
  };

  const rememberedTheme = accent !== '' ? themeAccents.get(theme) : undefined;
  const ownStyle = rememberedTheme ? { '--atlas-theme-accent': rememberedTheme } as React.CSSProperties : undefined;

  return (
    <SettingChoiceRow label={t('appearance.accent')} hint={t('appearance.accentHint')}>
      <div className="atlas-accent-swatches" role="radiogroup" aria-label={t('appearance.accent')} onKeyDown={onKeyDown}>
        <Swatch
          label={t('appearance.accentOwn')}
          chosen={chosen === OWN}
          className={`atlas-accent-swatch--own${accent !== '' && !rememberedTheme ? ' atlas-accent-swatch--unknown' : ''}`}
          style={ownStyle}
          swatchRef={swatchRef(OWN)}
          onPick={() => pick(OWN)}
        />
        {ACCENT_PRESETS.map((preset) => (
          <Swatch
            key={preset.id}
            label={t(preset.labelKey)}
            chosen={chosen === preset.id}
            style={{ background: preset.hex }}
            swatchRef={swatchRef(preset.id)}
            onPick={() => pick(preset.id)}
          />
        ))}
        <span className="atlas-accent-custom-wrap">
          <Swatch
            label={t('appearance.accentCustom')}
            chosen={chosen === CUSTOM}
            className="atlas-accent-swatch--custom"
            style={chosen === CUSTOM ? { background: accent } : undefined}
            swatchRef={swatchRef(CUSTOM)}
            onPick={openCustom}
          />
          <input
            ref={picker}
            type="color"
            className="atlas-accent-picker"
            tabIndex={-1}
            aria-hidden="true"
            value={accent || pickerStart}
            onChange={(event) => setAccent(app, event.target.value)}
          />
        </span>
      </div>
    </SettingChoiceRow>
  );
}

interface SwatchProps {
  label: string;
  chosen: boolean;
  className?: string;
  style?: React.CSSProperties | undefined;
  swatchRef: (element: HTMLElement | null) => void;
  onPick: () => void;
}

function Swatch({ label, chosen, className, style, swatchRef, onPick }: SwatchProps): React.JSX.Element {
  return (
    <LabelTooltip label={label}>
      <button
        ref={swatchRef}
        type="button"
        role="radio"
        aria-checked={chosen}
        aria-label={label}
        tabIndex={chosen ? 0 : -1}
        className={`atlas-accent-swatch${className ? ` ${className}` : ''}`}
        style={style}
        onClick={onPick}
      />
    </LabelTooltip>
  );
}

/** The accent `doc` shows now as `#rrggbb`: the Atlas look's own, else the theme's; grey where none can be read. */
function shownAccentHex(doc: Document): string {
  const style = (doc.defaultView ?? window).getComputedStyle(doc.body);
  const shown = style.getPropertyValue('--atlas-look-accent').trim() || style.getPropertyValue('--interactive-accent').trim();
  if (!shown) return PICKER_START;
  return hexColorOf(cssColorToHexNumber(shown.startsWith('#') ? shown : resolveCssColor(shown)));
}

/** Opens the colour picker of the custom swatch, as a click on it would. */
function openPicker(input: HTMLInputElement | null): void {
  if (!input) return;
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return;
    } catch {
      // A picker that may not open from here (no user gesture) falls back to a click.
    }
  }
  input.click();
}

/** The swatch an arrow, Home or End key moves to, round the ends; null for any other key. */
function choiceAfterKey(key: string, at: number): string | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return CHOICES[(at + 1) % CHOICES.length]!;
    case 'ArrowLeft':
    case 'ArrowUp':
      return CHOICES[(at + CHOICES.length - 1) % CHOICES.length]!;
    case 'Home':
      return CHOICES[0]!;
    case 'End':
      return CHOICES[CHOICES.length - 1]!;
    default:
      return null;
  }
}
