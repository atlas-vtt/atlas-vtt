import React, { useEffect, useMemo, useRef } from 'react';
import { Component, Keymap, MarkdownRenderer, type App } from 'obsidian';
import { diceLinkProps, linkDiceIn, splitDiceSegments } from '../../../services/statblockDiceLinks';
import { decodeStatblockLinks, statblockLinksAsText } from '../../../services/statblockLinks';
import { runInBackground } from '../../../utils/backgroundTask';
import { boundedText } from '../../../creatures/statblockValues';

interface MarkdownTextProps {
  /** Raw text, which may contain markdown and wiki links */
  text: string;
  app?: App | undefined;
  sourcePath?: string | undefined;
  /** Render markdown; when false the text is shown as it reads, links as the words they show */
  markdown?: boolean | undefined;
  className?: string | undefined;
}

/** Obsidian follows the links of its own rendered notes (reading view, Live Preview, embeds). */
const OBSIDIAN_LINK_ROOTS = '.markdown-preview-view, .cm-content';

/** Text with dice notation rendered as clickable spans. */
function DiceText({ text }: { text: string }): React.JSX.Element {
  const segments = useMemo(() => splitDiceSegments(text), [text]);
  return (
    <>
      {segments.map((segment, index) =>
        segment.dice ? (
          <span key={index} {...diceLinkProps(segment.text)}>
            {segment.text}
          </span>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ),
      )}
    </>
  );
}

/**
 * Statblock text. Markdown is delegated to Obsidian so wiki links, formatting
 * and embeds behave exactly as they do elsewhere in the vault.
 */
export function StatblockMarkdown({
  text: given,
  app,
  sourcePath = '',
  markdown = true,
  className,
}: MarkdownTextProps): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  // Blocks join texts (a list of saves, the parts of a subheading); what reads the text on has the limit of one.
  const text = boundedText(given);
  const shownAsRead = !markdown || !app;
  const asRead = useMemo(() => (shownAsRead ? statblockLinksAsText(text) : ''), [shownAsRead, text]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !markdown || !app) return;

    el.replaceChildren();
    const component = new Component();
    runInBackground(MarkdownRenderer.render(app, decodeStatblockLinks(text), el, sourcePath, component), 'Rendering statblock markdown');

    // Obsidian wraps single-line markdown in a <p>; unwrap so it stays inline.
    const paragraphs = el.querySelectorAll('p');
    if (paragraphs.length === 1) {
      paragraphs[0]!.replaceWith(...Array.from(paragraphs[0]!.childNodes));
    }

    // Safe to rewrite: this subtree is Obsidian's markdown output, which this
    // effect rebuilds from scratch on every run. React never owns these nodes.
    linkDiceIn(el);

    // Elsewhere nothing follows them. A new tab keeps the map open; Obsidian's modifiers pick another pane.
    const openLink = (event: MouseEvent): void => {
      if (event.button !== (event.type === 'auxclick' ? 1 : 0)) return;
      const link = (event.target as Element | null)?.closest?.('a.internal-link');
      if (!link || link.closest(OBSIDIAN_LINK_ROOTS)) return;
      const target = link.getAttribute('data-href') ?? link.getAttribute('href');
      if (!target) return;
      event.preventDefault();
      const pane = Keymap.isModEvent(event) || 'tab';
      runInBackground(app.workspace.openLinkText(target, sourcePath, pane), `Opening ${target}`, 'Could not open the linked note');
    };
    el.addEventListener('click', openLink);
    el.addEventListener('auxclick', openLink);

    return () => {
      el.removeEventListener('click', openLink);
      el.removeEventListener('auxclick', openLink);
      component.unload();
      el.replaceChildren();
    };
  }, [text, app, sourcePath, markdown]);

  if (shownAsRead) {
    return (
      <span className={className}>
        <DiceText text={asRead} />
      </span>
    );
  }

  return <span ref={ref} className={className} />;
}

export default StatblockMarkdown;
