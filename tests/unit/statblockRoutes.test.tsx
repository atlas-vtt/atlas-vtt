import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';

/** What the note's YAML reads as, where a test hands a value over that no text could spell out here. */
const parsed = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  return { ...actual, parseYaml: (text: string): unknown => (text.includes('AS HANDED OVER') ? parsed.value : actual.parseYaml(text)) };
});
vi.mock('../../src/app/atlas-view', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));

import FantasyStatblock from '../../src/app/react/components/FantasyStatblock';
import { STATBLOCK_LIMITS } from '../../src/app/creatures/statblockValues';
import { HOSTILE_VALUES, counted, counts, resetCounts } from '../mocks/hostileValues';

const notePath = 'Bestiary/Toad.md';
const LAYOUT = {
  name: 'Every block', id: 'every-block',
  blocks: [
    { type: 'heading', id: 'h', properties: ['name'] },
    { type: 'property', id: 'p', properties: ['senses'], display: 'Senses' },
    { type: 'text', id: 'x', properties: ['lore'] },
    { type: 'saves', id: 'v', properties: ['saves'] },
    { type: 'table', id: 'b', properties: ['stats'], headers: ['STR', 'DEX'], calculate: true },
    { type: 'traits', id: 't', properties: ['actions'], heading: 'Actions' },
    { type: 'spells', id: 's', properties: ['spells'] },
  ],
};

/** A statblock every field of which is the hostile value, under a real name. */
function statblockOf(hostile: () => unknown): Record<string, unknown> {
  return counted({
    statblock: true, name: 'Toad',
    senses: hostile(), lore: hostile(), saves: hostile(), stats: hostile(), actions: hostile(), spells: hostile(),
  });
}

interface Route {
  /** What Fantasy Statblocks' bestiary holds. */
  bestiary?: Array<Record<string, unknown>>;
  /** The note's frontmatter as Obsidian's cache holds it. */
  frontmatter?: Record<string, unknown>;
  /** The note's text in the vault. */
  text?: string;
  /** The note's text where it is not in the vault. */
  noteContent?: string;
}

/** The ways a statblock reaches the renderer, each handing over `statblock` as its parser would. */
const ROUTES: Record<string, (statblock: Record<string, unknown>) => Route> = {
  'the bestiary entry Fantasy Statblocks parsed': (statblock) => ({ bestiary: [counted({ ...statblock, path: notePath })] }),
  'the note\'s frontmatter': (statblock) => ({ frontmatter: statblock }),
  'a statblock fence in the note': (statblock) => {
    parsed.value = statblock;
    return { frontmatter: {}, text: '```statblock\nAS HANDED OVER\n```' };
  },
  'the text of a note that is not in the vault': (statblock) => {
    parsed.value = statblock;
    return { noteContent: '---\nAS HANDED OVER\n---\n' };
  },
};

function show(route: Route): ReturnType<typeof render> {
  Object.assign(window, { FantasyStatblocks: {
    getBestiaryCreatures: () => route.bestiary ?? [],
    hasCreature: () => false,
    isResolved: () => true,
  } });
  const app = {
    workspace: { on: () => ({}), offref: () => undefined },
    vault: {
      getAbstractFileByPath: (path: string) => (path === notePath && route.noteContent === undefined ? new TFile(path) : null),
      cachedRead: async () => route.text ?? '',
    },
    metadataCache: { getFileCache: () => ({ frontmatter: route.frontmatter }), getFirstLinkpathDest: () => null },
    plugins: { plugins: { 'obsidian-5e-statblocks': { manager: {
      getAllLayouts: () => [LAYOUT], getLayout: () => LAYOUT, getDefaultLayout: () => LAYOUT,
    } } } },
  };
  return render(<FantasyStatblock notePath={notePath} noteContent={route.noteContent} app={app as never} />);
}

beforeEach(resetCounts);
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'FantasyStatblocks');
});

describe.each(Object.keys(ROUTES))('a statblock that reaches the renderer by %s', (route) => {
  it.each(Object.keys(HOSTILE_VALUES))('is drawn within one budget where its fields are %s', async (shape) => {
    const { container } = show(ROUTES[route]!(statblockOf(HOSTILE_VALUES[shape]!)));

    // The largest of these values take a while to build on a busy machine.
    await waitFor(() => expect(container.querySelector('.atlas-sb-heading')?.textContent).toBe('Toad'), { timeout: 20_000 });
    // The statblock as handed over is read for bounded copies only: by the reader of its route, and by the renderer.
    expect(counts.reads).toBeLessThanOrEqual(4 * STATBLOCK_LIMITS.values);
    expect(container.querySelectorAll('.atlas-sb-trait').length).toBeLessThanOrEqual(2 * STATBLOCK_LIMITS.entries);
    expect(container.textContent?.length).toBeLessThanOrEqual(2 * STATBLOCK_LIMITS.characters);
  }, 30_000);
});
