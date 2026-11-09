import { createToggleSwitch } from '../ui/toggleSwitchElement';
import { t } from '../i18n';

let nextId = 0;

/**
 * The pin panel's "Show name" row: Atlas' switch and its text, which toggles it too. `shown` reads
 * the choice and `toggle` changes it; the row draws itself again after each change, focus kept.
 */
export function createPinNameSwitch(parent: HTMLElement, shown: () => boolean, toggle: () => void): HTMLElement {
  const row = parent.createDiv({ cls: 'pin-name-row' });
  const labelId = `atlas-pin-name-${++nextId}`;
  const draw = (focus: boolean): void => {
    row.empty();
    const change = (): void => {
      toggle();
      draw(true);
    };
    const control = createToggleSwitch(row, { value: shown(), labelledBy: labelId, onChange: change });
    row.createSpan({ cls: 'pin-name-row__text', text: t('pinMenu.showName'), attr: { id: labelId } }).addEventListener('click', change);
    if (focus) control.focus();
  };
  draw(false);
  return row;
}
