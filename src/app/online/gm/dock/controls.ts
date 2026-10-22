import { setIcon } from 'obsidian';
import { openMenuBelow, type MenuEntry } from './dockMenu.ts';
import type { Tone } from './panelModel.ts';

/** How long a control says that it copied. */
export const COPIED_MS = 1200;

export type ButtonKind = 'plain' | 'cta' | 'warning' | 'ghost';

const KIND_CLASSES: Readonly<Record<ButtonKind, readonly string[]>> = { plain: [], cta: ['mod-cta'], warning: ['mod-warning'], ghost: ['atlas-online-button--ghost'] };

/**
 * A text button in Obsidian's look: `cta` for the main action, `warning` for one that ends something,
 * `ghost` for a secondary one that shows a fill only under the pointer or a press.
 */
export function textButton(parent: HTMLElement, text: string, onClick: (event: MouseEvent) => void, kind: ButtonKind = 'plain'): HTMLButtonElement {
  const cls = ['atlas-online-button', ...KIND_CLASSES[kind]];
  const button = parent.createEl('button', { cls, text, attr: { type: 'button' } });
  button.addEventListener('click', onClick);
  return button;
}

/** A dot in a status colour and the status in words. */
export function statusLine(parent: HTMLElement, status: { readonly text: string; readonly tone: Tone }, cls = 'atlas-online-status'): HTMLElement {
  const line = parent.createDiv({ cls: `${cls} atlas-online-tone--${status.tone}` });
  line.createSpan({ cls: 'atlas-online-status__dot', attr: { 'aria-hidden': 'true' } });
  line.createSpan({ cls: 'atlas-online-status__text', text: status.text });
  return line;
}

/** A row that copies something: its icon and words at rest, and what it says for a moment after a copy. */
export interface CopyRow {
  readonly icon: string;
  readonly text: string;
  readonly copied: string;
  readonly focusKey: string;
}

/**
 * A row of the panel that copies: its icon and the words on the rows' text edge, a ghost at rest. For
 * a moment after a copy the row says so with a tick.
 */
export function copyRow(parent: HTMLElement, row: CopyRow, copy: () => Promise<boolean>): HTMLButtonElement {
  const button = parent.createEl('button', { cls: 'atlas-online-invite', attr: { type: 'button', 'data-focus-key': row.focusKey } });
  const icon = button.createSpan({ cls: 'atlas-online-invite__icon', attr: { 'aria-hidden': 'true' } });
  const text = button.createSpan({ text: row.text });
  setIcon(icon, row.icon);
  let timer: number | null = null;
  button.addEventListener('click', () => {
    void copy().then((copied) => {
      if (!copied) return;
      setIcon(icon, 'check');
      text.setText(row.copied);
      button.addClass('is-copied');
      if (timer !== null) button.win.clearTimeout(timer);
      timer = button.win.setTimeout(() => {
        setIcon(icon, row.icon);
        text.setText(row.text);
        button.removeClass('is-copied');
      }, COPIED_MS);
    });
  });
  return button;
}

/** The invite row's QR control: whether its card is open, and the press that opens or closes it. */
export interface QrToggle {
  readonly open: boolean;
  toggle(): void;
}

/** The name of the control that shows the invite link as a code to scan. */
const QR_LABEL = 'QR code';

/**
 * "Copy invite link": the link itself is never shown. At the row's end a ghost button opens the link
 * as a QR code, and beside it "…" opens the link's menu (`linkEntries`); the menu's button shows with
 * the row's hover or focus, while its menu is open, and always where nothing hovers. Returns the row's element.
 */
export function inviteRow(parent: HTMLElement, copy: () => Promise<boolean>, qr: QrToggle, linkEntries: readonly MenuEntry[]): HTMLElement {
  const row = parent.createDiv({ cls: 'atlas-online-invite-row' });
  copyRow(row, { icon: 'link', text: 'Copy invite link', copied: 'Link copied', focusKey: 'copy' }, copy);
  const button = row.createEl('button', { cls: ['atlas-online-icon-button', 'atlas-online-invite__qr', ...(qr.open ? ['is-open'] : [])], attr: { type: 'button', 'aria-label': QR_LABEL, 'aria-expanded': String(qr.open), 'data-focus-key': 'qr' } });
  setIcon(button, 'qr-code');
  button.addEventListener('click', () => qr.toggle());
  const more = row.createEl('button', { cls: 'atlas-online-icon-button atlas-online-invite__more', attr: { type: 'button', 'aria-label': 'Link options', 'aria-haspopup': 'menu', 'data-focus-key': 'link-more' } });
  setIcon(more, 'more-horizontal');
  more.addEventListener('click', () => openMenuBelow(linkEntries, more));
  return row;
}

/** The surface's header: its title, the status as a dot (in words only while it needs attention), "…" where it holds something, Stop and, where given, Close. */
export function surfaceHeader(layer: HTMLElement, title: string, status: { readonly text: string; readonly tone: Tone }, statusInWords: string | null, entries: readonly MenuEntry[], stop: () => void, close: (() => void) | null): HTMLElement {
  const header = layer.createDiv({ cls: 'atlas-online-header' });
  header.createDiv({ cls: 'atlas-online-title', text: title, attr: { id: `${layer.id}-title` } });
  const line = header.createDiv({ cls: `atlas-online-header__status atlas-online-tone--${status.tone}` });
  line.createSpan({ cls: 'atlas-online-status__dot', attr: { 'aria-hidden': 'true' } });
  line.createSpan({ cls: statusInWords === null ? 'atlas-online-sr-only' : 'atlas-online-status__text', text: statusInWords ?? status.text });
  if (entries.length > 0) {
    const more = header.createEl('button', { cls: 'atlas-online-icon-button atlas-online-header__more', attr: { type: 'button', 'aria-label': 'More', 'aria-haspopup': 'menu', 'data-focus-key': 'more' } });
    setIcon(more, 'more-horizontal');
    more.addEventListener('click', () => openMenuBelow(entries, more));
  }
  const stopButton = header.createEl('button', { cls: 'atlas-online-icon-button atlas-online-header__stop', attr: { type: 'button', 'aria-label': 'Stop table', 'data-focus-key': 'stop' } });
  setIcon(stopButton, 'power');
  stopButton.addEventListener('click', stop);
  if (close !== null) {
    const button = header.createEl('button', { cls: 'atlas-online-close', attr: { type: 'button', 'aria-label': 'Close', 'data-focus-key': 'close' } });
    setIcon(button, 'x');
    button.addEventListener('click', close);
  }
  return header;
}
