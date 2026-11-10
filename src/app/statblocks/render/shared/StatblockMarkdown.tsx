import React, { useEffect, useMemo, useRef } from 'react';
import { Component, MarkdownRenderer, type App } from 'obsidian';
import { linkDiceIn } from '../../../services/statblockDiceLinks';
import { decodeStatblockLinks, statblockLinksAsText } from '../../../services/statblockLinks';
import { runInBackground } from '../../../utils/backgroundTask';
import { DiceText } from './DiceText';
import { inlineMarkdown } from './inlineMarkdown';
import { followLinksIn } from './linkEvents';
import { boundedText } from '../../../creatures/statblockValues';

interface MarkdownTextProps {
  /** Raw text, which may contain markdown and wiki links */
  text: string;
  app?: App | undefined;
  sourcePath?: string | undefined;
  /** Render markdown; when false the text is shown as it reads, links as the words they show */
  markdown?: boolean | undefined;
  /** Dice notation rolls on a click; off for text that names rather than describes (an ability's name). */
  dice?: boolean | undefined;
  className?: string | undefined;
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
  dice = true,
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
    runInBackground(MarkdownRenderer.render(app, inlineMarkdown(decodeStatblockLinks(text)), el, sourcePath, component), 'Rendering statblock markdown');

    // Obsidian wraps single-line markdown in a <p>; unwrap so it stays inline.
    const paragraphs = el.querySelectorAll('p');
    if (paragraphs.length === 1) {
      paragraphs[0]!.replaceWith(...Array.from(paragraphs[0]!.childNodes));
    }

    // Safe to rewrite: this subtree is Obsidian's markdown output, which this
    // effect rebuilds from scratch on every run. React never owns these nodes.
    if (dice) linkDiceIn(el);
    const stopLinks = followLinksIn(el, app, sourcePath);

    return () => {
      stopLinks();
      component.unload();
      el.replaceChildren();
    };
  }, [text, app, sourcePath, markdown, dice]);

  if (shownAsRead) {
    return (
      <span className={className}>
        {dice ? <DiceText text={asRead} /> : asRead}
      </span>
    );
  }

  return <span ref={ref} className={className} />;
}

export default StatblockMarkdown;
