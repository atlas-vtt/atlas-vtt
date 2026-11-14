// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarkdownPostProcessor, MarkdownPostProcessorContext } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { StatblockFenceChild } from '../../../../src/app/statblocks/render/statblockFence';
import { registerStatblockLinkPreview } from '../../../../src/app/statblocks/render/statblockLinkPreview';
import { addNote, creatureVault, type CreatureVault } from '../../../mocks/creatureVault';
import { MARSH_PATH, marshText } from '../library/templateTexts';
import { NATIVE, WARDEN, noteText, sheetOf, unloadFantasyStatblocks } from './linkedStatblockKit';

/** Where Obsidian renders a note: a link's hover popover, a note's own view, or a leaf shown in a popover (Hover Editor). */
type Host = 'popover' | 'view' | 'popover-leaf';

interface Section {
  el: HTMLElement;
  children: StatblockFenceChild[];
}

let current: CreatureVault;
const loaded: StatblockFenceChild[] = [];

beforeEach(() => {
  current = creatureVault();
  current.files.set(MARSH_PATH, marshText());
  addNote(current, WARDEN, NATIVE);
});

afterEach(async () => {
  for (const child of loaded.splice(0)) child.onunload();
  await act(async () => { await Promise.resolve(); });
  TemplateLibrary.release(current.app);
  unloadFantasyStatblocks();
  document.body.empty();
});

function registeredProcessor(): MarkdownPostProcessor {
  const registerMarkdownPostProcessor = vi.fn();
  registerStatblockLinkPreview({ app: current.app, registerMarkdownPostProcessor });
  return registerMarkdownPostProcessor.mock.calls[0]![0] as MarkdownPostProcessor;
}

/** The renderer's sizer inside `host`; sections are processed before they are attached to it, as Obsidian does. */
function sizerIn(host: Host): HTMLElement {
  const outer = document.body.createDiv(host === 'view' ? 'workspace-leaf' : 'popover hover-popover');
  const inner = host === 'popover-leaf' ? outer.createDiv('workspace-leaf') : outer;
  return inner.createDiv('markdown-preview-sizer');
}

/** Processes one section of the note at `path` as Obsidian renders it in `host`. */
function processSection(path: string, { host = 'popover', frontmatterSection = true }: { host?: Host; frontmatterSection?: boolean } = {}): Section {
  const el = createDiv();
  if (frontmatterSection) el.createEl('pre', { cls: 'frontmatter' });
  else el.createEl('p', { text: 'Body' });
  const text = current.files.get(path) ?? '';
  const children: StatblockFenceChild[] = [];
  const ctx = {
    docId: 'doc',
    sourcePath: path,
    frontmatter: current.frontmatter[path],
    containerEl: sizerIn(host),
    addChild: (child: unknown) => { if (child instanceof StatblockFenceChild) children.push(child); },
    getSectionInfo: () => ({ text, lineStart: 0, lineEnd: 0 }),
  } as unknown as MarkdownPostProcessorContext;
  void registeredProcessor()(el, ctx);
  loaded.push(...children);
  return { el, children };
}

describe('the link preview of a native statblock note', () => {
  it('draws the card under the properties of the note\'s hover preview', async () => {
    const { el, children } = processSection(WARDEN);
    expect(children).toHaveLength(1);
    act(() => children[0]!.onload());
    await waitFor(() => expect(sheetOf(el)?.textContent).toContain('Marsh Warden'));
    expect(el.lastElementChild?.previousElementSibling?.matches('pre.frontmatter')).toBe(true);
  });

  it('leaves the note\'s own view and a leaf shown in a popover to the note panel', () => {
    expect(processSection(WARDEN, { host: 'view' }).children).toHaveLength(0);
    expect(processSection(WARDEN, { host: 'popover-leaf' }).children).toHaveLength(0);
  });

  it('draws once per preview: only the frontmatter section is looked at', () => {
    expect(processSection(WARDEN, { frontmatterSection: false }).children).toHaveLength(0);
  });

  it('leaves every note that is no native statblock as Obsidian renders it', () => {
    addNote(current, 'Notes/Plain.md', { tags: ['npc'] });
    addNote(current, 'Bestiary/Goblin FS.md', { statblock: true, name: 'Goblin' });
    expect(processSection('Notes/Plain.md').children).toHaveLength(0);
    expect(processSection('Bestiary/Goblin FS.md').children).toHaveLength(0);
  });

  it('leaves a note with its own atlas-statblock fence to that fence', () => {
    current.files.set(WARDEN, noteText(NATIVE, '```atlas-statblock\n```\n'));
    expect(processSection(WARDEN).children).toHaveLength(0);
  });
});
