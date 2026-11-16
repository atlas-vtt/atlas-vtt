import type { App, MarkdownPostProcessor, MarkdownPostProcessorContext, Plugin } from 'obsidian';
import { findStatblockFences } from '../fs/statblockFences';
import { STATBLOCK_FENCE_LANGUAGE, frontmatterSource } from '../notes/statblockSource';
import { isPlainRecord } from '../values/fieldValueOf';
import { StatblockFenceChild } from './statblockFence';

/** The info string of the note's own `atlas-statblock` fence, which draws the card itself. */
const OWN_FENCE_INFO = new RegExp(`^[ \\t]*${STATBLOCK_FENCE_LANGUAGE}[ \\t]*$`);

/**
 * Whether a section is drawn in a link's hover preview (Obsidian's page
 * preview): never a note's own view, an embed in a note, or a leaf shown in a
 * popover, where the note panel draws the card beside the note.
 */
function inLinkPreview(ctx: MarkdownPostProcessorContext): boolean {
  const host = ctx.containerEl;
  return host !== undefined && host.closest('.hover-popover') !== null && host.closest('.workspace-leaf') === null;
}

/**
 * Draws a native statblock note's card in its link preview, under its
 * properties: the note is frontmatter alone, so the preview showed nothing
 * else. Only the frontmatter section of a native note is looked at, so every
 * other note and section stays as Obsidian renders it.
 */
export function statblockLinkPreviewProcessor(app: App): MarkdownPostProcessor {
  return (el, ctx) => {
    const frontmatter: unknown = ctx.frontmatter;
    if (frontmatterSource(isPlainRecord(frontmatter) ? frontmatter : null)?.kind !== 'atlas') return;
    // Obsidian renders the frontmatter as a section of its own whose first child is the hidden `pre.frontmatter`.
    if (!el.firstElementChild?.matches('pre.frontmatter') || !inLinkPreview(ctx)) return;
    if (findStatblockFences(ctx.getSectionInfo(el)?.text ?? '', OWN_FENCE_INFO).length > 0) return;
    ctx.addChild(new StatblockFenceChild(el.createDiv(), app, ctx.sourcePath));
  };
}

/** Registers the link preview's card; Obsidian removes the processor when the plugin unloads. */
export function registerStatblockLinkPreview(plugin: Pick<Plugin, 'app' | 'registerMarkdownPostProcessor'>): void {
  plugin.registerMarkdownPostProcessor(statblockLinkPreviewProcessor(plugin.app));
}
