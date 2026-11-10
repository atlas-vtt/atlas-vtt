import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { App, TFile } from 'obsidian';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { releaseTemplateSessions } from '../../src/app/statblocks/library/sessionRegistry';
import type { TemplateBlock, TemplateField } from '../../src/app/statblocks/model/templateTypes';
import { MARSH_CREATURE } from '../fixtures/statblockTemplateFixtures';
import { MARSH_ID, MARSH_PATH, marshText } from '../unit/statblocks/library/templateTexts';
import { blockOf, NOTE_PATH, renderPane, type PaneHarness } from '../unit/statblocks/editor/paneKit';
import { centreOf, mouse } from './realMouse';
import { frames, useEditorStyles } from './sidePanesHarness';

vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: () => ({}) } }));
vi.mock('../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    loadedCollections: () => [],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const TOLERANCE = 0.5;
const PANE_WIDTH = 440;
/** Set to write screenshots of every value at rest and edited to `__screenshots__/` beside this file (ignored by git). */
const SHOTS = Boolean(import.meta.env.VITE_PANE_SHOTS);

const ABILITIES = [{ name: 'Keen Senses', desc: 'The creature notices what moves in the reeds.' }];
const CREATURE = {
  statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Marsh Warden', size: 'Medium', type: 'humanoid', level: 3,
  ac: 14, hp: 14, speed: '30 ft.', senses: 'darkvision 60 ft.', description: 'It waits in the reeds.', traits: ABILITIES, actions: ABILITIES,
};
const EMPTY_CREATURE = { statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Marsh Warden' };
const MONSTER = {
  statblock: true, 'atlas-template': 'builtin:5e-2024-monster', name: 'Bog Hag', size: 'Medium', type: 'fey', alignment: 'neutral evil',
  ac: 17, hp: 82, hit_dice: '11d8 + 33', speed: '30 ft.', skillsaves: [{ stealth: 4 }, { perception: 3 }], languages: 'Common, Sylvan',
  senses: 'darkvision 60 ft.', cr: '5',
  spells: ['The hag casts spells using Wisdom (save DC 14).', { 'At will': 'minor illusion, vicious mockery' }, { '1/day each': 'sleep' }],
};
const EMPTY_MONSTER = { statblock: true, 'atlas-template': 'builtin:5e-2024-monster', name: 'Bog Hag' };
const DRAW_STEEL = {
  statblock: true, 'atlas-template': 'builtin:draw-steel-monster', name: 'Bugbear', level: 2, organization: 'Elite', role: 'Brute',
  keywords: ['Goblin', 'Humanoid'], ev: '12', stamina: 40, speed: '6', size: '1L', stability: 1, free_strike: 3,
};
const EMPTY_DRAW_STEEL = { statblock: true, 'atlas-template': 'builtin:draw-steel-monster', name: 'Bugbear' };

/** The Marsh creature with what no built-in has: a dropdown alone in a stat strip, and senses picked with a number each. */
const MOOD: TemplateField = { key: 'mood', label: 'Mood', type: 'choice', options: ['Calm', 'Wary', 'Hungry'] };
const HABITAT: TemplateField = { key: 'habitat', label: 'Habitat', type: 'choice', options: ['Marsh', 'Forest', 'Underdark'] };
const SENSES: TemplateField = {
  key: 'senses', label: 'Senses', type: 'choice', meaning: 'senses',
  options: ['darkvision', 'blindsight', 'tremorsense', 'truesight'], several: true, numbered: true, unit: 'ft.',
};
const STRIP: TemplateBlock = {
  id: 'q1strip0', type: 'row', blocks: [
    { id: 'q2ac0000', type: 'stat', field: 'ac', look: 'stacked' },
    { id: 'q3mood00', type: 'stat', field: 'mood', look: 'stacked' },
    { id: 'q4speed0', type: 'stat', field: 'speed', look: 'stacked' },
  ],
};
const MARSH_FIELDS = [...MARSH_CREATURE.fields.map((field) => (field.key === 'senses' ? SENSES : field)), MOOD, HABITAT];
const MARSH_LAYOUT = {
  ...MARSH_CREATURE.layout,
  blocks: MARSH_CREATURE.layout.blocks.flatMap((block): TemplateBlock[] => {
    if (block.id === 'p7c4f8ne') return [STRIP];
    return block.id === 'p9g7k2jw' ? [{ id: 'q5habita', type: 'stat', field: 'habitat', look: 'run-in' }] : [block];
  }),
};
const MARSH = {
  statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', ac: 13, mood: 'Calm', speed: '30 ft.', habitat: 'Marsh',
  senses: 'darkvision 60 ft., blindsight 10 ft.', languages: ['Common', 'Sylvan'],
};
const EMPTY_MARSH = { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden' };

const apps: App[] = [];
afterEach(async () => {
  cleanup();
  for (const app of apps.splice(0)) {
    await releaseTemplateSessions(app);
    TemplateLibrary.release(app);
  }
  document.querySelectorAll('.atlas-test-pane').forEach((host) => host.remove());
});

async function pane(frontmatter: Record<string, unknown>, width = PANE_WIDTH): Promise<PaneHarness> {
  // Inside the plugin's root and as wide as the panel beside a note: the pane's styles are scoped to it.
  const container = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'atlas-vtt-plugin atlas-test-pane' }));
  container.style.width = `${width}px`;
  const marsh = frontmatter['atlas-template'] === MARSH_ID;
  const files = marsh ? { [NOTE_PATH]: '---\nstatblock: true\n---\n', [MARSH_PATH]: marshText({ fields: MARSH_FIELDS, layout: MARSH_LAYOUT }) } : undefined;
  const harness = await renderPane({ frontmatter, container, ...(files && { files }) });
  apps.push(harness.app);
  if (marsh) {
    vi.mocked(harness.app.metadataCache.getFileCache).mockImplementation((file: TFile) => (
      file.path === NOTE_PATH ? { frontmatter: { statblock: true, 'atlas-template': MARSH_ID } } : null));
  }
  await vi.waitFor(() => expect(container.querySelector('.atlas-sb-pane-value')).not.toBeNull());
  await frames(2);
  return harness;
}

interface Box { left: number; top: number; width: number; height: number }

const boxOf = (rect: DOMRect): Box => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });

/** Every block of the card, by id. */
function blockBoxes(card: Element): Map<string, Box> {
  return new Map([...card.querySelectorAll('[data-block-id]')].map((block) => [block.getAttribute('data-block-id') ?? '', boxOf(block.getBoundingClientRect())]));
}

/** The boxes a node lays out: its own, or its children's where it has none (`display: contents`). */
function laidOut(node: Node): DOMRect[] {
  if (node instanceof Element) {
    return node.getClientRects().length > 0 ? [node.getBoundingClientRect()] : [...node.childNodes].flatMap(laidOut);
  }
  if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return [];
  const range = document.createRange();
  range.selectNodeContents(node);
  return [range.getBoundingClientRect()];
}

/** Where a block's values stand: the slot while edited; at rest, where the values it holds stand. */
function slotBox(block: Element): Box | null {
  const slot = block.querySelector('.atlas-sb-pane-slot');
  if (!slot) return null;
  const rects = laidOut(slot);
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  return { left, top, width: Math.max(...rects.map((rect) => rect.right)) - left, height: Math.max(...rects.map((rect) => rect.bottom)) - top };
}

function expectSameBox(after: Box, before: Box, what: string, sides: ReadonlyArray<keyof Box> = ['left', 'top', 'width', 'height']): void {
  for (const side of sides) {
    expect(Math.abs(after[side] - before[side]), `${what} ${side}: ${before[side]} → ${after[side]}`).toBeLessThanOrEqual(TOLERANCE);
  }
}

async function shoot(name: string): Promise<void> {
  if (!SHOTS) return;
  const card = document.querySelector('.atlas-test-pane .atlas-sb-pane-card') ?? document.querySelector('.atlas-test-pane')!;
  await page.screenshot({ element: card, path: `__screenshots__/pane-input/${name}.png` });
}

const cardOf = (harness: PaneHarness): Element => harness.result.container.querySelector('.atlas-statblock')!;

async function clickValue(block: Element): Promise<void> {
  const target = block.querySelector('.atlas-sb-value') ?? block;
  const rect = target.getBoundingClientRect();
  await act(async () => {
    await mouse.click(rect.left + Math.min(rect.width / 2, 6), rect.top + rect.height / 2);
    await frames(2);
  });
}

/** Escape closes a dropdown's list first, then leaves the value. */
async function leave(card: Element): Promise<void> {
  for (let press = 0; press < 3 && card.querySelector('.atlas-sb-pane-editing'); press++) {
    await act(async () => {
      await userEvent.keyboard('{Escape}');
      await frames(2);
    });
  }
  expect(card.querySelector('.atlas-sb-pane-editing')).toBeNull();
}

/** Clicks each value of the card in turn and checks that no block moves or changes size. */
async function clickEveryValue(harness: PaneHarness, name: string): Promise<string[]> {
  const card = cardOf(harness);
  const ids = [...card.querySelectorAll('.atlas-sb-pane-value[data-block-id]')]
    // An ability is typed in fields of its own (`EntryInlineEditor`), never in the list's place.
    .filter((block) => !block.matches('[data-block="entries"]'))
    .map((block) => block.getAttribute('data-block-id')!);
  const visited: string[] = [];
  for (const id of ids) {
    const block = card.querySelector(`[data-block-id="${id}"]`)!;
    const before = blockBoxes(card);
    const restSlot = slotBox(block);
    await shoot(`${name}-${id}-rest`);
    await clickValue(block);
    expect(block.classList.contains('atlas-sb-pane-editing'), `${id} is edited`).toBe(true);
    await shoot(`${name}-${id}-editing`);
    const after = blockBoxes(card);
    for (const [other, box] of before) expectSameBox(after.get(other)!, box, `${name}: editing ${id}, block ${other}`);
    const editingSlot = slotBox(block);
    // Text at rest is measured by its glyphs' height, the inputs by their line's: their width and place compare.
    // A line of several values gets an input for each, and a list a chip with its remove button for each item:
    // they may need more room than the text did, never less.
    if (restSlot && editingSlot) {
      const inputs = block.querySelectorAll('.atlas-sb-pane-editor :is(input, textarea)').length;
      const chips = block.querySelector('.atlas-sb-pane-editor .atlas-sb-pane-chip') !== null;
      // Paragraphs, a table or a list span their block at rest as the slot does: the block's box holds them.
      if (block.querySelector('.atlas-sb-pane-slot--blocks')) expectSameBox(editingSlot, restSlot, `${name}: ${id}'s value`, ['left']);
      else if (inputs === 1 && !chips) expectSameBox(editingSlot, restSlot, `${name}: ${id}'s value`, ['left', 'width']);
      else {
        expectSameBox(editingSlot, restSlot, `${name}: ${id}'s values`, ['left']);
        expect(editingSlot.width, `${name}: ${id}'s values keep their width`).toBeGreaterThanOrEqual(restSlot.width - TOLERANCE);
      }
    }
    await leave(card);
    visited.push(id);
  }
  return visited;
}

/** Selects what the focused field holds and types `text` over it. */
async function typeOver(text: string): Promise<void> {
  await act(async () => {
    await userEvent.keyboard('{Control>}a{/Control}{Meta>}a{/Meta}');
    await userEvent.keyboard(text);
    await frames(2);
  });
}

/**
 * Values edited in place keep their place (§7.6): clicking a value swaps its
 * text for an input in the same box, so neither the value nor any block
 * around it moves or changes size, filled or empty, for every kind of value;
 * the field grows only when what is typed needs more room.
 */
describe('a value edited in place', () => {
  useEditorStyles();

  for (const [name, frontmatter] of Object.entries({
    creature: CREATURE, 'empty-creature': EMPTY_CREATURE, monster: MONSTER, 'empty-monster': EMPTY_MONSTER,
    'draw-steel': DRAW_STEEL, 'empty-draw-steel': EMPTY_DRAW_STEEL, marsh: MARSH, 'empty-marsh': EMPTY_MARSH,
  })) {
    it(`changes no box when clicked: ${name}`, async () => {
      const harness = await pane(frontmatter);
      const visited = await clickEveryValue(harness, name);
      expect(visited.length).toBeGreaterThan(3);
    });
  }

  it('hangs a lone dropdown\'s mark past its end, and leaves it out where the next value follows at once', async () => {
    const harness = await pane(MARSH);
    const card = cardOf(harness);
    const habitat = blockOf(harness.result.container, 'q5habita');
    await clickValue(habitat);
    const input = habitat.querySelector<HTMLInputElement>('input')!;
    const chevron = habitat.querySelector('.atlas-sb-pane-choice__chevron')!.getBoundingClientRect();
    expect(chevron.width).toBeGreaterThan(0);
    expect(chevron.left).toBeGreaterThanOrEqual(input.getBoundingClientRect().right);
    expect(chevron.right).toBeLessThanOrEqual(habitat.getBoundingClientRect().right);
    expect(Math.abs((chevron.top + chevron.bottom) / 2 - centreOf(input).y)).toBeLessThanOrEqual(1);
    await leave(card);

    const mood = blockOf(harness.result.container, 'q3mood00');
    await clickValue(mood);
    expect(mood.querySelector('.atlas-sb-pane-choice__chevron')!.getBoundingClientRect().width).toBe(0);
    expect(document.querySelector('.atlas-sb-pane-options')).not.toBeNull();
  });

  it('grows with a long value, and never gets smaller than the value it stood in for', async () => {
    const harness = await pane(CREATURE);
    const card = cardOf(harness);
    const speed = blockOf(harness.result.container, 'gcspeed0');
    const senses = blockOf(harness.result.container, 'gcsenses');
    for (const block of [speed, senses]) {
      const rest = slotBox(block)!;
      await clickValue(block);
      const input = block.querySelector<HTMLInputElement>('input')!;
      await typeOver('30 ft., climb 30 ft., swim 40 ft.');
      expect(input.value).toBe('30 ft., climb 30 ft., swim 40 ft.');
      const grown = slotBox(block)!;
      expect(grown.width).toBeGreaterThan(rest.width + 20);
      // All of it shows: the input is as wide as its text.
      expect(input.scrollWidth).toBeLessThanOrEqual(input.clientWidth + 1);
      await typeOver('5');
      expectSameBox(slotBox(block)!, rest, 'emptied', ['left', 'width']);
      await leave(card);
    }
  });

  it('grows a long text downwards, and keeps the card\'s other blocks where they were above it', async () => {
    const harness = await pane(CREATURE);
    const description = blockOf(harness.result.container, 'header-description');
    const rest = description.getBoundingClientRect();
    await clickValue(description);
    expect(description.getBoundingClientRect().height).toBeCloseTo(rest.height, 0);
    await typeOver('It waits in the reeds.\nIt waits in the reeds a while longer, until something wades close enough to grab.');
    const grown = description.getBoundingClientRect();
    expect(grown.top).toBeCloseTo(rest.top, 0);
    expect(grown.width).toBeCloseTo(rest.width, 0);
    expect(grown.height).toBeGreaterThan(rest.height * 2);
    await shoot('creature-header-description-typed');
  });
});

/** The ability being typed (§6.3): its name, then its text, in one row of two framed fields. */
describe('an ability being typed', () => {
  useEditorStyles();

  async function abilityEditor(width = PANE_WIDTH): Promise<{ editor: HTMLElement; name: HTMLInputElement; text: HTMLElement }> {
    const harness = await pane(CREATURE, width);
    const ability = blockOf(harness.result.container, 'gctraits').querySelector<HTMLElement>('[data-item-key]')!;
    await act(async () => {
      await mouse.click(centreOf(ability).x, centreOf(ability).y);
      await frames(2);
    });
    const editor = document.querySelector<HTMLElement>('.atlas-sb-pane-entry-editor')!;
    return {
      editor,
      name: editor.querySelector<HTMLInputElement>('[data-entry-part="name"]')!,
      text: editor.querySelector<HTMLElement>('[data-entry-part="text"]')!,
    };
  }

  it('puts the name before the text in one row, top-aligned, as high as each other and a gap apart', async () => {
    const { editor, name, text } = await abilityEditor();
    await shoot('ability-row');
    expect(document.activeElement).toBe(name);
    const row = editor.getBoundingClientRect();
    const nameBox = name.getBoundingClientRect();
    const textBox = text.getBoundingClientRect();
    expect(Math.abs(nameBox.top - textBox.top)).toBeLessThanOrEqual(TOLERANCE);
    expect(nameBox.left).toBeCloseTo(row.left, 1);
    // The gap equals the fields' padding (8 px).
    expect(textBox.left - nameBox.right).toBeCloseTo(8, 1);
    expect(getComputedStyle(name).paddingLeft).toBe('8px');
    expect(textBox.right).toBeCloseTo(row.right, 1);
    expect(textBox.height).toBeGreaterThanOrEqual(nameBox.height - TOLERANCE);
    // The pointer over the ability washes no part of it: each field has its own hover border.
    await act(async () => {
      await mouse.hover(centreOf(name).x, centreOf(name).y);
      await frames(2);
    });
    expect(getComputedStyle(name.parentElement!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    // The name keeps the card's run-in look.
    expect(getComputedStyle(name).fontStyle).toBe('italic');
    expect(Number(getComputedStyle(name).fontWeight)).toBeGreaterThanOrEqual(600);
    // A text of one line, or none yet, is as high as the name.
    await act(async () => {
      text.focus();
      await userEvent.keyboard('{Control>}a{/Control}{Meta>}a{/Meta}{Backspace}');
      await frames(2);
    });
    expect(text.textContent).toBe('');
    expect(Math.abs(name.getBoundingClientRect().height - text.getBoundingClientRect().height)).toBeLessThanOrEqual(TOLERANCE);
  });

  it('grows the name with what is typed and never cuts it off, the text going under it once it leaves no room, and the text downwards', async () => {
    const { editor, name, text } = await abilityEditor();
    const row = editor.getBoundingClientRect();
    const start = name.getBoundingClientRect().width;
    await typeOver('Keen Senses and Uncanny Reflexes');
    const long = name.getBoundingClientRect();
    expect(name.value).toBe('Keen Senses and Uncanny Reflexes');
    expect(long.width).toBeGreaterThan(start);
    expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth + 1);
    expect(long.width).toBeLessThanOrEqual(row.width + TOLERANCE);
    expect(text.getBoundingClientRect().top).toBeGreaterThanOrEqual(long.bottom);

    const before = text.getBoundingClientRect().height;
    const line = Number.parseFloat(getComputedStyle(text).lineHeight);
    await act(async () => {
      text.focus();
      await userEvent.keyboard('{Control>}a{/Control}{Meta>}a{/Meta}');
      await userEvent.keyboard('The creature notices what moves in the reeds, what breathes under the water and what waits on the far bank.');
      await frames(2);
    });
    const grown = text.getBoundingClientRect();
    expect(grown.height).toBeGreaterThanOrEqual(before + line - TOLERANCE);
    expect(grown.right).toBeCloseTo(row.right, 1);
    expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth);
    await shoot('ability-row-typed');
  });

  it('puts the text under the name only where the row is too narrow for both', async () => {
    const { editor, name, text } = await abilityEditor(240);
    await shoot('ability-row-narrow');
    const row = editor.getBoundingClientRect();
    const nameBox = name.getBoundingClientRect();
    const textBox = text.getBoundingClientRect();
    expect(textBox.top).toBeCloseTo(nameBox.bottom + 8, 1);
    expect(textBox.left).toBeCloseTo(row.left, 1);
    expect(textBox.right).toBeCloseTo(row.right, 1);
    // Alone in its row, the name shows all of itself.
    expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth);
  });
});
