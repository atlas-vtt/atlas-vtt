import { setIcon } from 'obsidian';
import { showNotice } from '../../../ui/notice';
import { shownJoinCode } from '../../protocol/index.ts';
import { COPIED_MS } from './controls.ts';
import { copyText } from './dockDom.ts';
import { t } from '../../../i18n';

/** How long a code stays readable after the press that showed or copied it. */
export const CODE_SHOWN_MS = 10_000;

/** What stands in a hidden code's place: no digit of it is in the page until the GM asks. */
const HIDDEN = '••• •••';

/**
 * Codes the GM showed, each with the moment it hides again. Kept by the code itself and outside any
 * element, so the surface's redraws keep a shown code shown and a new code starts hidden.
 */
const shownUntil = new Map<string, number>();

function isShown(code: string): boolean {
  const until = shownUntil.get(code);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  shownUntil.delete(code);
  return false;
}

/** A code that stays hidden on a shared screen. */
export interface SecretCode {
  readonly code: string;
  readonly focusKey: string;
  /** Whose code it is, for a screen reader: the player's name. */
  readonly owner?: string;
  /** An icon and the word "Code" before it, for a row of its own. */
  readonly labelled?: boolean;
}

/**
 * A code drawn blurred, so a GM who streams the table never shows it: the first press shows it for
 * `CODE_SHOWN_MS`, a press while it shows copies it (as people read it, `482 193`) and keeps it shown.
 */
export function secretCode(parent: HTMLElement, secret: SecretCode, cls: readonly string[]): HTMLButtonElement {
  const spoken = shownJoinCode(secret.code);
  const labelled = secret.labelled === true;
  const button = parent.createEl('button', { cls: ['atlas-online-secret', ...cls], attr: { type: 'button', 'data-focus-key': secret.focusKey } });
  const icon = labelled ? button.createSpan({ cls: 'atlas-online-invite__icon', attr: { 'aria-hidden': 'true' } }) : null;
  // Hidden while the row says that it copied: the copied line says the whole of it.
  if (labelled) button.createSpan({ cls: 'atlas-online-secret__label', text: t('online.codeWord') });
  const digits = button.createSpan({ cls: 'atlas-online-secret__digits', attr: { 'aria-hidden': 'true' } });
  let hideTimer: number | null = null;
  let copiedTimer: number | null = null;

  const paint = (): void => {
    const shown = isShown(secret.code);
    button.toggleClass('is-shown', shown);
    button.removeClass('is-copied');
    if (icon !== null) setIcon(icon, 'key-round');
    digits.setText(shown ? spoken : HIDDEN);
    const action = shown ? t('online.copyShownCode', { code: spoken }) : t('online.showCode');
    button.setAttribute('aria-label', secret.owner === undefined ? action : `${secret.owner}: ${action}`);
  };
  const showFor = (ms: number): void => {
    if (hideTimer !== null) button.win.clearTimeout(hideTimer);
    hideTimer = button.win.setTimeout(paint, ms);
  };

  button.addEventListener('click', () => {
    const shown = isShown(secret.code);
    shownUntil.set(secret.code, Date.now() + CODE_SHOWN_MS);
    showFor(CODE_SHOWN_MS);
    if (!shown) {
      paint();
      return;
    }
    void copyText(button, spoken).then((copied) => {
      if (!copied) {
        showNotice(t('online.codeCopyFailed'));
        return;
      }
      button.addClass('is-copied');
      if (icon !== null) setIcon(icon, 'check');
      digits.setText(t(labelled ? 'online.codeCopied' : 'online.copied'));
      if (copiedTimer !== null) button.win.clearTimeout(copiedTimer);
      copiedTimer = button.win.setTimeout(paint, COPIED_MS);
    });
  });

  paint();
  if (isShown(secret.code)) showFor((shownUntil.get(secret.code) ?? 0) - Date.now());
  return button;
}
