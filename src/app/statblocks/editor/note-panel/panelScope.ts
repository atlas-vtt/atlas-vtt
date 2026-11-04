/**
 * The panel's keys (spec §8.5, §8.6): an Obsidian scope pushed only while
 * focus is inside the panel, in its chrome, or in a menu the panel opened
 * (portaled elsewhere in the document, marked with the panel's surface id),
 * so every other Obsidian hotkey keeps working. Mod+Z and Mod+Shift+Z undo
 * and redo in the note's own history (through the writer): the panel changes
 * only the note's values. Mod+B and Mod+I format the text field being typed
 * in, as they format a note, and never reach the note's editor beside it.
 */

import { Scope, type App } from 'obsidian';
import { OWNER_ATTRIBUTE } from '../interaction/chrome';
import type { InlineMark } from '../markdown-typing/markdownMarks';
import { toggleMarkIn } from '../markdown-typing/markIn';
import { t } from '../../../i18n';

export interface PanelScopeHost {
  /** The panel's element; null while hidden. */
  host: () => HTMLElement | null;
  /** The note's own undo or redo; false where its view cannot (Reading view). */
  noteHistory: (kind: 'undo' | 'redo') => boolean;
  /** Says what happened in the panel's live region. */
  say: (text: string) => void;
  /** The note's name, for what is said. */
  noteName: () => string;
}

/** Whether `node` lies in the panel, or in a menu the panel's surface opened. */
export function ownedBy(host: HTMLElement, node: EventTarget | null): boolean {
  const element = node as Partial<Element> | null;
  if (typeof element?.closest !== 'function') return false;
  if (host.contains(element as Element)) return true;
  const surface = host.querySelector('[data-atlas-surface]')?.getAttribute('data-atlas-surface');
  const owner = element.closest(`[${OWNER_ATTRIBUTE}]`)?.getAttribute(OWNER_ATTRIBUTE);
  return surface !== undefined && surface !== null && owner === surface;
}

export class PanelScope {
  private readonly scope: Scope;
  private pushed = false;
  private stopWatching: (() => void) | null = null;

  constructor(private readonly app: App, private readonly panel: PanelScopeHost) {
    this.scope = new Scope(app.scope);
    this.scope.register(['Mod'], 'z', () => this.historyKey('undo'));
    this.scope.register(['Mod', 'Shift'], 'z', () => this.historyKey('redo'));
    this.scope.register(['Mod'], 'b', () => this.markKey('**'));
    this.scope.register(['Mod'], 'i', () => this.markKey('*'));
  }

  /** Follows focus on the panel's host: pushed on focus inside, popped once focus is neither there nor in its menus. */
  watch(host: HTMLElement): () => void {
    const doc = host.doc;
    const onFocusIn = (event: FocusEvent): void => {
      if (ownedBy(host, event.target)) this.push();
      else this.pop();
    };
    doc.addEventListener('focusin', onFocusIn, true);
    this.stopWatching = () => doc.removeEventListener('focusin', onFocusIn, true);
    return () => {
      this.stopWatching?.();
      this.stopWatching = null;
      this.pop();
    };
  }

  pop(): void {
    if (!this.pushed) return;
    this.pushed = false;
    this.app.keymap.popScope(this.scope);
  }

  private push(): void {
    if (this.pushed) return;
    this.pushed = true;
    this.app.keymap.pushScope(this.scope);
  }

  /** Mod+B and Mod+I: the field focused in the panel takes the mark; nothing else does (the note's editor would bold its own text). */
  private markKey(mark: InlineMark): false | undefined {
    const host = this.panel.host();
    const active = host?.doc.activeElement ?? null;
    return host && ownedBy(host, active) && toggleMarkIn(active, mark) ? false : undefined;
  }

  /** Mod+Z and Mod+Shift+Z: a text field of the panel keeps its own undo; else the note's history takes the key. */
  private historyKey(kind: 'undo' | 'redo'): boolean {
    const host = this.panel.host();
    const active = host?.doc.activeElement;
    const typing = active && (active.instanceOf(HTMLInputElement) || active.instanceOf(HTMLTextAreaElement) || (active.instanceOf(HTMLElement) && active.isContentEditable));
    if (typing && host?.contains(active)) return true;
    const name = this.panel.noteName();
    const done = kind === 'undo' ? t('statblockEditor.undidIn', { name }) : t('statblockEditor.redidIn', { name });
    const needEdit = kind === 'undo' ? t('statblockEditor.switchToUndo', { name }) : t('statblockEditor.switchToRedo', { name });
    this.panel.say(this.panel.noteHistory(kind) ? done : needEdit);
    return false;
  }
}
