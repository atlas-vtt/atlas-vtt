import { PIN_PLACE_GROUPS, getPinIconDefinition, type PinIconId } from '../types/pinIcons';
import { setPinGlyph, setPinTone } from './pinIconDom';
import { t } from '../i18n';

/** Hover must rest this long before the flyout opens, so sweeping along the palette never flashes it. */
const OPEN_DELAY_MS = 150;
/** Grace period for crossing from the slot to the flyout (and back) without it closing. */
const CLOSE_DELAY_MS = 250;
/** Distance between the slot and the flyout; the flyout's hit area bridges it. */
const ANCHOR_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;
/** Places per row, for arrow key navigation; the stylesheet lays the grid out with the same count. */
const COLUMNS = 8;

/** Keeps a start coordinate between the window margin and `max` less the margin. */
function clamp(start: number, max: number): number {
  return Math.max(VIEWPORT_MARGIN_PX, Math.min(start, max - VIEWPORT_MARGIN_PX));
}

export interface PinPlaceFlyoutOptions {
  /** The palette slot the flyout opens from; hovering it opens the flyout. */
  anchor: HTMLElement;
  selected: PinIconId | null;
  onSelect: (id: PinIconId) => void;
}

export interface PinPlaceFlyout {
  open: (focus?: boolean) => void;
  close: () => void;
  setSelected: (id: PinIconId | null) => void;
  destroy: () => void;
}

/**
 * Panel of place icons, from the world down to a room, that opens above the
 * palette's location slot on hover, or on click and arrow keys.
 */
export function createPinPlaceFlyout(container: HTMLElement, options: PinPlaceFlyoutOptions): PinPlaceFlyout {
  const { anchor, onSelect } = options;
  let selected = options.selected;
  let openTimer: number | null = null;
  let closeTimer: number | null = null;

  const flyout = container.createDiv({ cls: 'pin-place-flyout', attr: { role: 'group', 'aria-label': t('pin.places') } });
  const caption = flyout.createDiv({ cls: 'pin-place-caption', attr: { 'aria-hidden': 'true' } });
  const captionGlyph = caption.createSpan({ cls: 'pin-place-caption-glyph' });
  const captionName = caption.createSpan({ cls: 'pin-place-caption-name' });

  const buttons: HTMLButtonElement[] = [];
  // Rows as laid out on screen: a group's last row may be short, so up and down cannot step by COLUMNS
  const rows: HTMLButtonElement[][] = [];
  for (const [groupIndex, group] of PIN_PLACE_GROUPS.entries()) {
    const section = flyout.createDiv({ cls: 'pin-place-group' });
    const heading = section.createDiv({ cls: 'pin-place-group-name', text: group.name });
    heading.id = `atlas-pin-places-${groupIndex}`;
    const grid = section.createDiv({ cls: 'pin-place-grid', attr: { role: 'radiogroup', 'aria-labelledby': heading.id } });

    for (const place of group.places) {
      const button = grid.createEl('button', {
        cls: 'pin-icon-btn',
        attr: { type: 'button', role: 'radio', 'aria-label': place.name, 'data-icon': place.id },
      });
      setPinTone(button, place.tone);
      setPinGlyph(button, place.id);
      button.addEventListener('click', () => {
        onSelect(place.id);
        close();
        anchor.focus();
      });
      button.addEventListener('pointerenter', () => showCaption(place.id));
      button.addEventListener('focus', () => showCaption(place.id));
      buttons.push(button);
      const lastRow = rows[rows.length - 1];
      if (lastRow && lastRow.length < COLUMNS && lastRow[0]?.parentElement === grid) lastRow.push(button);
      else rows.push([button]);
    }
  }

  /** The place an arrow key leads to from `button`: the neighbour in reading order, or the same column one row up or down. */
  function neighbour(button: HTMLButtonElement, key: string): HTMLButtonElement | undefined {
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      return buttons[buttons.indexOf(button) + (key === 'ArrowLeft' ? -1 : 1)];
    }
    const row = rows.findIndex((candidates) => candidates.includes(button));
    const current = rows[row];
    const next = rows[row + (key === 'ArrowUp' ? -1 : 1)];
    if (!current || !next) return undefined;
    return next[Math.min(current.indexOf(button), next.length - 1)];
  }

  function showCaption(id: PinIconId | null): void {
    const place = getPinIconDefinition(id ?? 'location');
    setPinTone(caption, place.tone);
    setPinGlyph(captionGlyph, place.id);
    captionName.setText(place.name);
  }

  function setSelected(id: PinIconId | null): void {
    selected = id;
    for (const button of buttons) {
      const isSelected = button.dataset.icon === id;
      button.toggleClass('is-selected', isSelected);
      button.setAttribute('aria-checked', String(isSelected));
      // Roving tab stop: Tab enters the grid on the selected place, arrows move within it
      button.tabIndex = isSelected ? 0 : -1;
    }
    if (!buttons.some((button) => button.tabIndex === 0) && buttons[0]) buttons[0].tabIndex = 0;
    showCaption(id);
  }

  function isOpen(): boolean {
    return flyout.hasClass('is-open');
  }

  function clearTimers(): void {
    if (openTimer !== null) window.clearTimeout(openTimer);
    if (closeTimer !== null) window.clearTimeout(closeTimer);
    openTimer = null;
    closeTimer = null;
  }

  /**
   * Opens above the slot, or below it when only that side has room. In a window
   * too short for either it takes the roomier side and stays inside the window.
   */
  function open(focus = false): void {
    clearTimers();
    if (!isOpen()) {
      showCaption(selected);
      const slot = anchor.getBoundingClientRect();
      // Layout size: the bounding rect would include the closed state's scale
      const width = flyout.offsetWidth;
      const height = flyout.offsetHeight;
      const roomAbove = slot.top - ANCHOR_GAP_PX - VIEWPORT_MARGIN_PX;
      const roomBelow = window.innerHeight - slot.bottom - ANCHOR_GAP_PX - VIEWPORT_MARGIN_PX;
      const above = roomAbove >= height || (roomBelow < height && roomAbove >= roomBelow);
      const top = above ? slot.top - ANCHOR_GAP_PX - height : slot.bottom + ANCHOR_GAP_PX;
      const left = slot.left + slot.width / 2 - width / 2;
      flyout.style.left = `${clamp(left, window.innerWidth - width)}px`;
      flyout.style.top = `${clamp(top, window.innerHeight - height)}px`;
      flyout.dataset.side = above ? 'top' : 'bottom';
      flyout.addClass('is-open');
      anchor.setAttribute('aria-expanded', 'true');
    }
    if (focus) buttons.find((button) => button.tabIndex === 0)?.focus();
  }

  function close(): void {
    clearTimers();
    flyout.removeClass('is-open');
    anchor.setAttribute('aria-expanded', 'false');
  }

  const scheduleOpen = (): void => {
    if (closeTimer !== null) window.clearTimeout(closeTimer);
    closeTimer = null;
    if (!isOpen() && openTimer === null) openTimer = window.setTimeout(() => open(), OPEN_DELAY_MS);
  };
  const scheduleClose = (): void => {
    if (openTimer !== null) window.clearTimeout(openTimer);
    openTimer = null;
    if (isOpen() && closeTimer === null) closeTimer = window.setTimeout(close, CLOSE_DELAY_MS);
  };

  const onAnchorKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    open(true);
  };

  const onFlyoutKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      anchor.focus();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const current = buttons.find((button) => button === e.target);
    if (!current) return;
    e.preventDefault();
    e.stopPropagation();
    const target = neighbour(current, e.key);
    if (!target) return;
    buttons.forEach((button) => { button.tabIndex = button === target ? 0 : -1; });
    target.focus();
  };

  const onFlyoutLeave = (): void => {
    scheduleClose();
    showCaption(selected);
  };

  anchor.setAttribute('aria-haspopup', 'true');
  anchor.setAttribute('aria-expanded', 'false');
  anchor.addEventListener('pointerenter', scheduleOpen);
  anchor.addEventListener('pointerleave', scheduleClose);
  anchor.addEventListener('keydown', onAnchorKeydown);
  flyout.addEventListener('pointerenter', scheduleOpen);
  flyout.addEventListener('pointerleave', onFlyoutLeave);
  flyout.addEventListener('keydown', onFlyoutKeydown);
  setSelected(selected);

  return {
    open,
    close,
    setSelected,
    destroy: (): void => {
      clearTimers();
      anchor.removeEventListener('pointerenter', scheduleOpen);
      anchor.removeEventListener('pointerleave', scheduleClose);
      anchor.removeEventListener('keydown', onAnchorKeydown);
      flyout.remove();
    },
  };
}
