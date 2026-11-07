import { Keymap, type App, type HoverParent } from 'obsidian';
import { runInBackground } from '../../../utils/backgroundTask';
import { t } from '../../../i18n';

/** Obsidian follows the links of its own rendered notes (reading view, Live Preview, embeds). */
const OBSIDIAN_LINK_ROOTS = '.markdown-preview-view, .cm-content';

/** The internal link an event happened on, where Obsidian does not handle it itself. */
function internalLinkOf(event: Event): Element | null {
  const target = event.target as Partial<Element> | null;
  const link = typeof target?.closest === 'function' ? target.closest('a.internal-link') : null;
  return link && !link.closest(OBSIDIAN_LINK_ROOTS) ? link : null;
}

function linkTarget(link: Element): string | null {
  return link.getAttribute('data-href') ?? link.getAttribute('href');
}

/**
 * Internal links in Markdown Atlas rendered into `el` behave as in a note:
 * a click opens the note (in a new tab, so a map stays open; Obsidian's
 * modifiers pick another pane) and hovering shows Obsidian's page preview.
 * Elsewhere nothing follows them. Returns the stop.
 */
export function followLinksIn(el: HTMLElement, app: App, sourcePath: string): () => void {
  const hoverParent: HoverParent = { hoverPopover: null };
  const open = (event: MouseEvent): void => {
    if (event.button !== (event.type === 'auxclick' ? 1 : 0)) return;
    const link = internalLinkOf(event);
    const target = link ? linkTarget(link) : null;
    if (!target) return;
    event.preventDefault();
    const pane = Keymap.isModEvent(event) || 'tab';
    runInBackground(app.workspace.openLinkText(target, sourcePath, pane), `Opening ${target}`, t('statblockEditor.linkFailed'));
  };
  const hover = (event: MouseEvent): void => {
    const link = internalLinkOf(event);
    const linktext = link ? linkTarget(link) : null;
    // Once per entry into the link, not again for each element inside it.
    if (!link || !linktext || link.contains(event.relatedTarget as Node | null)) return;
    app.workspace.trigger('hover-link', { event, source: 'preview', hoverParent, targetEl: link, linktext, sourcePath });
  };
  el.addEventListener('click', open);
  el.addEventListener('auxclick', open);
  el.addEventListener('mouseover', hover);
  return () => {
    el.removeEventListener('click', open);
    el.removeEventListener('auxclick', open);
    el.removeEventListener('mouseover', hover);
  };
}
