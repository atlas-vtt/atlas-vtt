// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';


import { EVERY_BLOCK } from '../../../fixtures/statblockTemplateFixtures';
import { blockSpec } from '../../../../src/app/statblocks/model/blockCatalogue';
import { boundField, flattenReadingOrder } from '../../../../src/app/statblocks/model/treeQueries';
import { blockEl, blockText, renderSheet, valueOf } from './sheetTestKit';

const VALUES = {
  name: 'Bog Wight',
  image: 'art/wight.png',
  kind: 'Beast',
  level: 3,
  armor: 4,
  vigor: 6,
  vigor_dice: '2d6',
  stats: [1, 2, 3],
  saves: [{ strength: 2 }],
  keywords: ['undead', 'marsh'],
  story: 'A pale shape in the reeds.',
  moves: [{ name: 'Claw', text: 'Deals 1d6 damage.', range: 'close', cost: 1 }],
  stress: 4,
  spells: ['Innate spellcasting:', { '1/day': 'fog cloud' }],
};

describe('StatblockSheet: every block type', () => {
  it('renders each block in a frame with the theme hooks', () => {
    const { container } = renderSheet(EVERY_BLOCK, VALUES);

    for (const block of flattenReadingOrder(EVERY_BLOCK.layout.blocks)) {
      // A script that reads no value has nothing to show on a card; its own test is below.
      if (block.type === 'opaque' || block.type === 'script') continue;
      const el = blockEl(container, block.id);
      expect(el, block.type).not.toBeNull();
      expect(el!.classList.contains('atlas-sb-item')).toBe(true);
      expect(el!.dataset.block).toBe(block.type);
      expect(el!.dataset.type).toBe(blockSpec(block.type).fsType ?? undefined);
      expect(el!.dataset.prop).toBe(boundField(block) || undefined);
      expect(el!.dataset.cls).toBe(block.className || undefined);
    }
  });

  it('renders nothing for a block of a newer Atlas', () => {
    const { container } = renderSheet(EVERY_BLOCK, VALUES);
    expect(blockEl(container, 'b7newer0')).toBeNull();
  });

  it('keeps the classes and attributes the companion theme reads', () => {
    const { container } = renderSheet(EVERY_BLOCK, VALUES, { name: 'Marsh Créature' });
    const root = container.querySelector<HTMLElement>('.atlas-statblock')!;

    expect(root.dataset.template).toBe('marsh-creature');
    expect(root.dataset.layout).toBe('marsh-creature');
    expect(root.querySelector('.atlas-statblock-body')).not.toBeNull();
    expect(blockEl(container, 'a2title0')!.querySelector('h2.atlas-sb-heading')?.textContent).toBe('Bog Wight');
    for (const id of ['a1sect00', 'a5head00', 'b1text00', 'b3entr00', 'b5spell0']) {
      expect(blockEl(container, id)!.querySelector('.atlas-sb-section-heading'), id).not.toBeNull();
    }
  });

  it('never runs or shows a script block\'s code: a script that reads no value shows nothing, and says where it is drawn while edited', () => {
    const { container, unmount } = renderSheet(EVERY_BLOCK, VALUES);
    expect(blockEl(container, 'b6scrip0')).toBeNull();
    expect(container.textContent).not.toContain('return el;');
    unmount();
    const editing = renderSheet(EVERY_BLOCK, VALUES, { mode: 'editing' });
    expect(blockText(editing.container, 'b6scrip0')).toBe('Shown by Fantasy Statblocks');
  });

  it('draws each block type in its own look', () => {
    const { container } = renderSheet(EVERY_BLOCK, VALUES);

    expect(blockText(container, 'a3line00')).toBe('Beast · Level 3');
    expect(blockEl(container, 'a5head00')!.querySelector('.atlas-sb-section-heading--minor')).not.toBeNull();
    expect(blockEl(container, 'a6stat00')!.querySelector('.atlas-sb-labelled--stacked .atlas-sb-label')?.textContent).toBe('Vigor');
    expect(valueOf(container, 'a6stat00')).toBe('6 (2d6)');
    expect(blockEl(container, 'a8pairs0')!.querySelector('.atlas-sb-label')?.textContent).toBe('Saves');
    expect(valueOf(container, 'a8pairs0')).toBe('Strength +2');
    expect([...blockEl(container, 'a9tags00')!.querySelectorAll('.atlas-sb-chip')].map((chip) => chip.textContent)).toEqual(['undead', 'marsh']);
    expect(blockEl(container, 'b0divid0')!.querySelector('hr.atlas-sb-divider')).not.toBeNull();
    expect(blockText(container, 'b2text00')).toBe('Read aloud when the creature appears.');
    expect(blockEl(container, 'b3entr00')!.querySelector('.atlas-sb-trait--heading .atlas-sb-trait-name')?.textContent).toBe('Claw');
    expect(blockText(container, 'b3entr00')).toContain('Range close');
    expect(blockText(container, 'b3entr00')).toContain('Cost 1');
    expect(blockEl(container, 'b4track0')!.querySelectorAll('.atlas-sb-track-box')).toHaveLength(4);
    expect(blockText(container, 'b5spell0')).toContain('Innate spellcasting:');
    expect(blockText(container, 'b5spell0')).toContain('1/day: fog cloud');
    expect(blockEl(container, 'a4image0')!.querySelector('img.atlas-sb-portrait-image')?.getAttribute('src')).toBe('art/wight.png');
  });

  it('writes a table of scores with a column read from a pairs field', () => {
    const { container } = renderSheet(EVERY_BLOCK, VALUES);
    const groups = blockEl(container, 'a7score0')!.querySelectorAll('table.atlas-sb-score-group');

    expect(groups).toHaveLength(3);
    const firstRow = [...groups[0]!.querySelectorAll('tbody tr')[0]!.children].map((cell) => cell.textContent);
    expect(firstRow).toEqual(['Str', '+1', '+2']);
    const dexRow = [...groups[1]!.querySelectorAll('tbody tr')[0]!.children].map((cell) => cell.textContent);
    expect(dexRow).toEqual(['Dex', '+2', '+2']);
  });

  it('folds a collapsible section by its heading', () => {
    const { container } = renderSheet(EVERY_BLOCK, VALUES);
    const toggle = blockEl(container, 'a1sect00')!.querySelector<HTMLButtonElement>('button.atlas-sb-section-toggle')!;

    expect(toggle.textContent).toBe('Bog Wight');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const clip = container.ownerDocument.getElementById(toggle.getAttribute('aria-controls')!);
    expect(clip?.hasAttribute('inert')).toBe(true);
  });
});

describe('StatblockSheet: no size containers', () => {
  it('sets no container on any element', () => {
    const { container } = renderSheet(EVERY_BLOCK, VALUES);
    for (const el of container.querySelectorAll<HTMLElement>('*')) {
      expect(el.getAttribute('style') ?? '').not.toMatch(/container/);
    }
  });

  it('declares no container in its stylesheets', () => {
    const folder = join(__dirname, '../../../../src/app/statblocks/render');
    const sheets = readdirSync(folder).filter((file) => file.endsWith('.scss'));
    expect(sheets.length).toBeGreaterThan(0);
    for (const file of [...sheets.map((sheet) => join(folder, sheet)), join(folder, '../../react/components/statblock/statblock.scss')]) {
      const rules = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(rules, file).not.toMatch(/container-type|container-name|@container|\bcontainer\s*:/);
    }
  });
});
