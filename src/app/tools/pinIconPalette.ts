import {
  LOCATION_PIN_ICON,
  PIN_PALETTE,
  getPinIconDefinition,
  isPlacePinIcon,
  resolvePinIcon,
  type PinIconDefinition,
  type PinIconId,
} from '../types/pinIcons';
import type { PinLabelKind } from './pinLabels';
import { setPinGlyph, setPinTone } from './pinIconDom';
import { createPinPlaceFlyout } from './pinPlaceFlyout';
import './pin-icon-palette.scss';
import { t } from '../i18n';

export interface PinIconPaletteOptions {
  /** Stored icon of the pin being edited or placed; legacy ids resolve to their current icon. */
  selected: string | undefined;
  onSelect: (icon: PinIconId | PinLabelKind) => void;
}

export interface PinIconPalette {
  destroy: () => void;
}

/**
 * Row of pin icons. Its location slot shows the chosen place (the location
 * marker until one is chosen) and opens the place flyout.
 */
export function createPinIconPalette(container: HTMLElement, options: PinIconPaletteOptions): PinIconPalette {
  let selected = resolvePinIcon(options.selected);
  const selectedPlace = (): PinIconId | null => (isPlacePinIcon(selected) ? selected : null);

  const row = container.createDiv({ cls: 'pin-icon-row', attr: { role: 'radiogroup', 'aria-label': t('pin.iconGroup') } });
  const buttons: HTMLButtonElement[] = [];

  const showSelection = (): void => {
    for (const button of buttons) {
      const isSelected = button.dataset.icon === selected;
      button.toggleClass('is-selected', isSelected);
      button.setAttribute('aria-checked', String(isSelected));
    }
    flyout.setSelected(selectedPlace());
  };

  const select = (icon: PinIconId | PinLabelKind): void => {
    selected = icon;
    showSelection();
    options.onSelect(icon);
  };

  const addButton = (id: string, name: string): HTMLButtonElement => {
    const button = row.createEl('button', {
      cls: 'pin-icon-btn',
      attr: { type: 'button', role: 'radio', 'aria-label': name, 'data-icon': id },
    });
    buttons.push(button);
    return button;
  };

  const showIcon = (button: HTMLButtonElement, icon: PinIconDefinition): void => {
    button.dataset.icon = icon.id;
    button.setAttribute('aria-label', icon.name);
    setPinTone(button, icon.tone);
    setPinGlyph(button, icon.id);
  };

  let placeSlot: HTMLButtonElement | null = null;
  let slotPlace: PinIconId = selectedPlace() ?? LOCATION_PIN_ICON.id;
  for (const slot of PIN_PALETTE) {
    if (slot.kind === 'icon') {
      const button = addButton(slot.icon.id, slot.icon.name);
      showIcon(button, slot.icon);
      button.addEventListener('click', () => select(slot.icon.id));
    } else if (slot.kind === 'label') {
      const button = addButton(slot.id, slot.name);
      button.createSpan({ cls: 'pin-icon-label', text: slot.sample });
      button.addEventListener('click', () => select(slot.id));
    } else {
      placeSlot = addButton(LOCATION_PIN_ICON.id, LOCATION_PIN_ICON.name);
      placeSlot.addClass('pin-place-slot');
      showIcon(placeSlot, getPinIconDefinition(slotPlace));
    }
  }
  if (!placeSlot) throw new Error('[pinIconPalette] The palette has no location slot');
  const slotButton = placeSlot;

  const flyout = createPinPlaceFlyout(container, {
    anchor: slotButton,
    selected: selectedPlace(),
    onSelect: (id) => {
      slotPlace = id;
      showIcon(slotButton, getPinIconDefinition(id));
      select(id);
    },
  });

  // A click picks the place the slot shows and opens the flyout, for pointers that cannot hover
  slotButton.addEventListener('click', () => {
    select(slotPlace);
    flyout.open();
  });

  showSelection();

  return {
    destroy: (): void => {
      flyout.destroy();
      row.remove();
    },
  };
}
