import { shownJoinCode } from '../../protocol/index.ts';
import { setIcon } from 'obsidian';
import { animatePanelIn, animatePanelOutAndRemove } from '../../../ui/panelMotion';
import { prefersReducedMotion } from '../../../utils/motion';
import atlasIcon from '../assets/atlas-icon.png?inline';
import { COPIED_MS } from './controls.ts';
import { BAR_GAP, copyImage, detachedEl, roomAbove, rowOf, surfaceRise } from './dockDom.ts';
import { qrDrawing, qrMatrix, type QrDrawing } from './qrDrawing.ts';
import { qrImageBlob } from './qrImage.ts';
import { showNotice } from '../../../ui/notice';
import { t } from '../../../i18n';

const SVG = 'http://www.w3.org/2000/svg';
/** The code's side the card aims at, in CSS pixels: large enough to scan across a table. */
const CODE_SIDE = 260;
/** The fewest pixels a module is drawn with where the view leaves less room: with fewer, a screen of one device pixel a pixel no longer shows the rounded modules well enough to read. */
const MIN_MODULE = 4;

/** What the card shows of the running table. */
export interface QrTable {
  readonly link: string;
  /** The join code, while the table asks for one. */
  readonly code: string | null;
}

function svg(parent: Element, tag: string, attrs: Readonly<Record<string, string>>): SVGElement {
  const el = parent.ownerDocument.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  parent.appendChild(el);
  return el;
}

/** The code on its white field: dark on white in both themes, since cameras read an inverted code badly. */
function drawCode(plate: HTMLElement, drawing: QrDrawing): void {
  plate.empty();
  const root = svg(plate, 'svg', { viewBox: `0 0 ${drawing.side} ${drawing.side}`, role: 'img', 'aria-label': t('online.qrLabel'), class: 'atlas-online-qr__code' });
  svg(root, 'path', { d: drawing.modules });
  svg(root, 'path', { d: drawing.finders, 'fill-rule': 'evenodd' });
  const { x, y, side } = drawing.icon;
  svg(root, 'image', { href: atlasIcon, x: String(x), y: String(y), width: String(side), height: String(side) });
}

/**
 * The invite link as a QR code, on a card beside the control: the code with the Atlas icon in its
 * middle and under it one row, with the join code while the table asks for one and a button that
 * copies the code as a picture to send. Nothing else: the link is never written out, and neither the
 * code nor its picture holds the join code.
 *
 * It stands to the right of the open menu or panel, their bottom edges level, outside their flow and
 * clear of the column over them where the cards of newcomers stand (`KnockStack`). So opening or
 * closing it moves no row and no card, and a knock that comes while it is open is neither hidden nor
 * moved. Where the view is too narrow for that, the code is drawn smaller, and at last the card lies
 * over the surface's end, under the newcomers' cards; a press on it closes it there, since it covers
 * its own button.
 *
 * It never takes the keyboard when it opens: focus stays on the button that opened it, and Tab goes
 * from there to the card's own button.
 */
export class InviteQr {
  private readonly root: HTMLElement;
  private readonly container: HTMLElement;
  private readonly changed: () => void;
  private card: HTMLElement | null = null;
  /** The white field inside the card, which holds the drawn code. */
  private plate: HTMLElement | null = null;
  /** The Atlas icon for the copied picture, loaded with the card so a press finds it ready. */
  private icon: HTMLImageElement | null = null;
  private copiedTimer: number | null = null;
  private opened = false;
  private drawing: QrDrawing | null = null;
  private shownLink: string | null = null;
  private shownCode: string | null = null;
  private dockWidth = 0;

  /** `changed` is called when the card opened or closed by itself (its button, Escape, a press), so the control draws anew. */
  constructor(root: HTMLElement, container: HTMLElement, changed: () => void) {
    this.root = root;
    this.container = container;
    this.changed = changed;
    root.addEventListener('keydown', (event) => this.tab(event));
  }

  get isOpen(): boolean {
    return this.opened;
  }

  toggle(): void {
    this.opened = !this.opened;
    this.changed();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.changed();
  }

  /**
   * Follows the table: `table` is null while there is no link or the control is closed, which closes
   * the card. `dockWidth` is the open surface's width.
   */
  update(table: QrTable | null, dockWidth: number): void {
    if (table === null) this.opened = false;
    if (!this.opened || table === null) return this.hide();
    this.dockWidth = dockWidth;
    const fresh = this.card === null;
    const card = this.card ?? this.build();
    if (table.link !== this.shownLink && this.plate !== null) {
      this.drawing = qrDrawing(qrMatrix(table.link));
      this.shownLink = table.link;
      drawCode(this.plate, this.drawing);
    }
    if (fresh || table.code !== this.shownCode) this.writeCode(card, table.code);
    this.fit();
    if (fresh && !prefersReducedMotion(card)) animatePanelIn(card);
  }

  /** Sizes the code to the room beside the control and under the scene tabs, in whole pixels per module. */
  fit(): void {
    const { card, plate, drawing } = this;
    if (card === null || plate === null || drawing === null) return;
    const row = rowOf(this.container);
    const chrome = { width: card.offsetWidth - plate.offsetWidth, height: card.offsetHeight - plate.offsetHeight };
    const rowWidth = row?.clientWidth ?? Infinity;
    const beside = rowWidth - this.dockWidth - BAR_GAP - chrome.width;
    const border = parseFloat(this.root.win.getComputedStyle(this.root).borderLeftWidth) || 0;
    // The card stands level with the surface's bottom edge, above the button.
    const bottom = this.root.getBoundingClientRect().top - surfaceRise(this.root, card);
    const under = row === null ? Infinity : roomAbove(this.container, row, BAR_GAP) - (row.getBoundingClientRect().bottom - bottom) - chrome.height;
    const wanted = Math.round(CODE_SIDE / drawing.size);
    const module = Math.max(MIN_MODULE, Math.min(wanted, Math.floor(Math.min(beside, under) / drawing.side)));
    const side = module * drawing.side;
    const over = side > beside;
    card.toggleClass('is-over', over);
    card.setCssProps({
      '--atlas-online-qr-side': `${side}px`,
      // The control's border as the browser draws it (snapped to device pixels), so the card's edges lie level with the control's.
      '--atlas-online-dock-border': `${border}px`,
      left: over ? `${Math.max(0, rowWidth - side - chrome.width) - border}px` : '',
    });
  }

  dispose(): void {
    this.forget();
    this.card?.remove();
    this.card = null;
  }

  /**
   * The card: the code's plate and, under it, one row: the join code in its middle and, at its end in
   * the card's corner, the button that copies the code as a picture. For a moment after a copy the
   * row says so in the join code's place, as the panel's copy rows do.
   */
  private build(): HTMLElement {
    const card = this.root.createDiv({ cls: 'atlas-online-qr', attr: { role: 'group', 'aria-label': t('online.invite') } });
    this.plate = card.createDiv({ cls: 'atlas-online-qr__plate' });
    const foot = card.createDiv({ cls: 'atlas-online-qr__foot' });
    foot.createDiv({ cls: 'atlas-online-qr__said', attr: { role: 'status' } });
    const copy = foot.createEl('button', { cls: 'atlas-online-icon-button atlas-online-qr__copy', attr: { type: 'button', 'aria-label': t('online.copyImage'), 'data-focus-key': 'qr-copy' } });
    setIcon(copy, 'copy');
    copy.addEventListener('click', () => this.copy(card));
    this.icon = detachedEl(card, 'img', { attr: { src: atlasIcon } });
    // Over the control's end it covers the button that opened it: a press on it closes it. Not one on
    // its own button, by the press's path: the button's icon may be another by the time the press gets here.
    card.addEventListener('click', (event) => {
      if (card.hasClass('is-over') && !event.composedPath().includes(copy)) this.close();
    });
    this.card = card;
    return card;
  }

  /** `Code 483 912` under the code, as the panel writes it; none while the table asks for none. */
  private writeCode(card: HTMLElement, code: string | null): void {
    this.shownCode = code;
    card.querySelector('.atlas-online-qr__join')?.remove();
    const foot = card.querySelector('.atlas-online-qr__foot');
    if (code === null || foot === null) return;
    const line = foot.createDiv({ cls: 'atlas-online-qr__join' });
    line.createSpan({ cls: 'atlas-online-qr__join-label', text: t('online.codeLabel') });
    line.createSpan({ text: shownJoinCode(code) });
  }

  /**
   * Copies the code as a picture, as the card draws it. The clipboard is asked within the press. The
   * press does nothing else: the card stays, and for a moment its row says "Image copied". A clipboard
   * that refused is reported as a failed copy of the link is, and nothing was copied.
   */
  private copy(card: HTMLElement): void {
    const { plate, drawing, icon } = this;
    const code = plate?.querySelector('svg') ?? null;
    if (plate === null || drawing === null || icon === null || code === null) return;
    const style = (el: Element): CSSStyleDeclaration => card.win.getComputedStyle(el);
    const png = qrImageBlob(card, drawing, { dark: style(code).fill, light: style(plate).backgroundColor, icon });
    void copyImage(card, png).then((copied) => {
      if (!copied) showNotice(t('online.imageCopyFailed'));
      else if (this.card === card) this.say(card);
    });
  }

  /** "Image copied" in the row, a tick in the button; both go back by themselves. */
  private say(card: HTMLElement): void {
    const set = (copied: boolean): void => {
      const button = card.querySelector<HTMLElement>('.atlas-online-qr__copy');
      card.querySelector('.atlas-online-qr__foot')?.toggleClass('is-copied', copied);
      card.querySelector('.atlas-online-qr__said')?.setText(copied ? t('online.imageCopied') : '');
      if (button !== null) setIcon(button, copied ? 'check' : 'copy');
    };
    if (this.copiedTimer !== null) card.win.clearTimeout(this.copiedTimer);
    set(true);
    this.copiedTimer = card.win.setTimeout(() => {
      this.copiedTimer = null;
      set(false);
    }, COPIED_MS);
  }

  /**
   * Tab goes from the QR control to the card's button and on to what follows the control, and back
   * the same way: the card hangs at the control's end in the document, where Tab would reach its
   * button only after everything else.
   */
  private tab(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    const copy = this.card?.querySelector<HTMLElement>('.atlas-online-qr__copy') ?? null;
    if (copy === null) return;
    const stops = Array.from(this.root.querySelectorAll<HTMLElement>('button, input, textarea, [tabindex]')).filter((el) => el !== copy && el.tabIndex >= 0 && el.offsetParent !== null && el.closest('[inert], .atlas-panel-leaving') === null && !el.hasAttribute('disabled'));
    const control = stops.findIndex((el) => el.dataset.focusKey === 'qr');
    if (control < 0) return;
    stops.splice(control + 1, 0, copy);
    const from = stops.indexOf(event.target as HTMLElement);
    const to = stops[from + (event.shiftKey ? -1 : 1)];
    if (from < 0 || to === undefined || (stops[from] !== copy && to !== copy)) return;
    event.preventDefault();
    to.focus({ preventScroll: true });
  }

  /** Lets go of what belongs to a card that is no longer shown. */
  private forget(): void {
    if (this.copiedTimer !== null) this.root.win.clearTimeout(this.copiedTimer);
    this.copiedTimer = null;
    this.plate = null;
    this.icon = null;
  }

  private hide(): void {
    const card = this.card;
    if (card === null) return;
    this.card = null;
    this.forget();
    this.drawing = null;
    this.shownLink = null;
    this.shownCode = null;
    if (prefersReducedMotion(card)) card.remove();
    else animatePanelOutAndRemove(card);
  }
}
