import { PIN_PLACE_GROUPS, getPinIconDefinition, type PinIconId, type PinPlaceGroup } from '../types/pinIcons';
import { setPinGlyph, setPinTone } from './pinIconDom';
import { placeNeighbour } from './pinPlaceRows';
import { createPinPlaceSearch, type PinPlaceSearch, type PinPlaceSearchTexts } from './pinPlaceSearch';
import './pin-icon-palette.scss';
import { t } from '../i18n';

/** Hover must rest this long before the flyout opens, so sweeping along the palette never flashes it. */
const OPEN_DELAY_MS = 150;
/** Grace period for crossing from the slot to the flyout (and back) without it closing. */
const CLOSE_DELAY_MS = 250;
/** Distance between the slot and the flyout; the flyout's hit area bridges it. */
const ANCHOR_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;

/** Keeps a start coordinate between the window margin and `max` less the margin. */
function clamp(start: number, max: number): number {
  return Math.max(VIEWPORT_MARGIN_PX, Math.min(start, max - VIEWPORT_MARGIN_PX));
}

export interface PinPlaceFlyoutOptions {
  /** The palette slot the flyout opens from; hovering it opens the flyout. */
  anchor: HTMLElement;
  selected: PinIconId | null;
  onSelect: (id: PinIconId) => void;
  /** The icons offered, in groups; unset, the places. */
  groups?: readonly PinPlaceGroup[];
  /** What the flyout is called; unset, "Places". */
  label?: string;
  /** Unset, every icon shows in its own tone; false shows them all in the text's colour (they take a colour elsewhere). */
  tones?: boolean;
  /**
   * Unset, the flyout opens while the pointer rests on the anchor and closes when it leaves. False
   * leaves opening to whoever owns the anchor (`toggle`): it then closes by a pick, Escape or a
   * press outside it.
   */
  hover?: boolean;
  /** How far from the anchor the flyout opens, pixels, asked each time it opens; unset, the palette's gap. */
  gap?: () => number;
  /** A field that searches the icons by name; unset, none. */
  search?: PinPlaceSearchTexts;
  /** Told when the flyout opened or closed. */
  onOpenChange?: (open: boolean) => void;
}

export interface PinPlaceFlyout {
  open: (focus?: boolean) => void;
  close: () => void;
  /** Opens the closed flyout with the focus in it, and closes the open one. */
  toggle: () => void;
  setSelected: (id: PinIconId | null) => void;
  destroy: () => void;
}

/**
 * Panel of pin icons in groups (unless told otherwise the places, from the world down to a room)
 * that opens above its anchor, the palette's location slot: on hover, or on click and arrow keys.
 */
export function createPinPlaceFlyout(container: HTMLElement, options: PinPlaceFlyoutOptions): PinPlaceFlyout {
  const { anchor, onSelect } = options;
  const groups = options.groups ?? PIN_PLACE_GROUPS;
  const tones = options.tones ?? true;
  const hover = options.hover ?? true;
  const doc = anchor.ownerDocument;
  let selected = options.selected;
  let openTimer: number | null = null;
  let closeTimer: number | null = null;
  let search: PinPlaceSearch | null = null;

  const flyout = container.createDiv({ cls: 'pin-place-flyout', attr: { role: 'group', 'aria-label': options.label ?? t('pin.places') } });
  const caption = flyout.createDiv({ cls: 'pin-place-caption', attr: { 'aria-hidden': 'true' } });
  const captionGlyph = caption.createSpan({ cls: 'pin-place-caption-glyph' });
  const captionName = caption.createSpan({ cls: 'pin-place-caption-name' });
  const searchField = options.search ? flyout.createDiv({ cls: 'pin-place-search-field' }) : null;
  // An `atlas-` class makes it one of Atlas' scroll areas where it scrolls: its scrollbar lies over the icons and takes no room.
  const list = flyout.createDiv({ cls: 'pin-place-groups atlas-pin-place-groups' });

  const pick = (id: PinIconId): void => {
    onSelect(id);
    close();
    anchor.focus();
  };

  const buttons: HTMLButtonElement[] = [];
  const named: { button: HTMLButtonElement; name: string }[] = [];
  const sections: HTMLElement[] = [];
  for (const [groupIndex, group] of groups.entries()) {
    const section = list.createDiv({ cls: 'pin-place-group' });
    const heading = section.createDiv({ cls: 'pin-place-group-name', text: group.name });
    heading.id = `atlas-pin-places-${groupIndex}`;
    const grid = section.createDiv({ cls: 'pin-place-grid', attr: { role: 'radiogroup', 'aria-labelledby': heading.id } });
    sections.push(section);

    for (const place of group.places) {
      const button = grid.createEl('button', {
        cls: 'pin-icon-btn',
        attr: { type: 'button', role: 'radio', 'aria-label': place.name, 'data-icon': place.id },
      });
      if (tones) setPinTone(button, place.tone);
      setPinGlyph(button, place.id);
      button.addEventListener('click', () => pick(place.id));
      button.addEventListener('pointerenter', () => showCaption(place.id));
      button.addEventListener('focus', () => showCaption(place.id));
      buttons.push(button);
      named.push({ button, name: place.name });
    }
  }

  const shownButtons = (): HTMLButtonElement[] => buttons.filter((button) => !button.hidden);

  function focusButton(target: HTMLButtonElement): void {
    buttons.forEach((button) => { button.tabIndex = button === target ? 0 : -1; });
    target.focus();
  }

  function showCaption(id: PinIconId | null): void {
    const place = id ? getPinIconDefinition(id) : groups[0]?.places[0];
    if (!place) return;
    if (tones) setPinTone(caption, place.tone);
    setPinGlyph(captionGlyph, place.id);
    captionName.setText(place.name);
  }

  if (options.search && searchField) {
    search = createPinPlaceSearch(searchField, list, {
      texts: options.search,
      buttons: named,
      sections,
      onPick: (button) => button.click(),
      onClose: () => {
        close();
        anchor.focus();
      },
      onDown: () => {
        const first = shownButtons()[0];
        if (first) focusButton(first);
      },
    });
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
      const gap = options.gap?.() ?? ANCHOR_GAP_PX;
      const roomAbove = slot.top - gap - VIEWPORT_MARGIN_PX;
      // The anchor's own window: a map in a popout has one of its own.
      const view = doc.defaultView ?? window;
      const roomBelow = view.innerHeight - slot.bottom - gap - VIEWPORT_MARGIN_PX;
      const above = roomAbove >= height || (roomBelow < height && roomAbove >= roomBelow);
      const top = above ? slot.top - gap - height : slot.bottom + gap;
      const left = slot.left + slot.width / 2 - width / 2;
      flyout.style.left = `${clamp(left, view.innerWidth - width)}px`;
      flyout.style.top = `${clamp(top, view.innerHeight - height)}px`;
      // A search leaves fewer icons: the panel keeps the size it opened with, so it stays where it hangs.
      if (search) flyout.style.height = `${height}px`;
      flyout.dataset.side = above ? 'top' : 'bottom';
      flyout.addClass('is-open');
      anchor.setAttribute('aria-expanded', 'true');
      if (!hover) doc.addEventListener('pointerdown', onPressOutside, true);
      options.onOpenChange?.(true);
    }
    if (!focus) return;
    if (search) search.focus();
    else buttons.find((button) => button.tabIndex === 0)?.focus();
  }

  function close(): void {
    clearTimers();
    if (!isOpen()) return;
    flyout.removeClass('is-open');
    anchor.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', onPressOutside, true);
    search?.clear();
    flyout.style.removeProperty('height');
    options.onOpenChange?.(false);
  }

  /** A press anywhere but in the flyout or on its anchor (whose own press toggles it). */
  function onPressOutside(e: PointerEvent): void {
    const target = e.target as Node | null;
    if (target && (flyout.contains(target) || anchor.contains(target))) return;
    close();
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
    if (search?.owns(e.target)) return;
    // A name typed on an icon is meant for the search.
    if (search && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.stopPropagation();
      search.focus();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const current = buttons.find((button) => button === e.target);
    if (!current) return;
    e.preventDefault();
    e.stopPropagation();
    const target = placeNeighbour(shownButtons(), current, e.key);
    if (target) focusButton(target);
    else if (search && e.key === 'ArrowUp') search.focus();
  };

  const onFlyoutLeave = (): void => {
    scheduleClose();
    showCaption(selected);
  };

  anchor.setAttribute('aria-haspopup', 'true');
  anchor.setAttribute('aria-expanded', 'false');
  if (hover) {
    anchor.addEventListener('pointerenter', scheduleOpen);
    anchor.addEventListener('pointerleave', scheduleClose);
    flyout.addEventListener('pointerenter', scheduleOpen);
  }
  anchor.addEventListener('keydown', onAnchorKeydown);
  flyout.addEventListener('pointerleave', hover ? onFlyoutLeave : () => showCaption(selected));
  flyout.addEventListener('keydown', onFlyoutKeydown);
  setSelected(selected);

  return {
    open,
    close,
    toggle: (): void => (isOpen() ? close() : open(true)),
    setSelected,
    destroy: (): void => {
      close();
      anchor.removeEventListener('pointerenter', scheduleOpen);
      anchor.removeEventListener('pointerleave', scheduleClose);
      anchor.removeEventListener('keydown', onAnchorKeydown);
      flyout.remove();
    },
  };
}
