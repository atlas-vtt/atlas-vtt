// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';


import { FIVE_E_2024, MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { blockEl, blockText, renderSheet, valueOf } from './sheetTestKit';

/** A shambling mound as the SRD notes in the Dolmenwood vault hold it. */
const MOUND = {
  name: 'Shambling Mound',
  size: 'Large',
  type: 'plant',
  alignment: 'unaligned',
  ac: 15,
  hp: 110,
  hit_dice: '13d10 + 39',
  speed: '20 ft., swim 20 ft.',
  stats: [18, 8, 16, 5, 10, 5],
  saves: [{ strength: 7 }],
  skillsaves: [{ stealth: 3 }],
  damage_resistances: 'cold, fire',
  damage_immunities: 'lightning',
  condition_immunities: 'blinded, deafened, exhaustion',
  senses: 'blindsight 60 ft. (blind beyond this radius), passive Perception 10',
  cr: '5',
  traits: [{ name: 'Lightning Absorption', desc: 'Whenever the mound is subjected to Lightning damage, it regains Hit Points.' }],
  actions: [{ name: 'Slam', desc: 'Melee Attack Roll: +7, reach 5 ft. Hit: 13 (2d8 + 4) Bludgeoning damage.' }],
};

const CR_TABLES = { xp: { '5': '1,800' }, pb: { '5': '+3' } };

describe('StatblockSheet: 5E 2024', () => {
  it('writes the line under the name from its pattern', () => {
    const { container } = renderSheet(FIVE_E_2024, MOUND);
    expect(blockText(container, 'b5line00')).toBe('Large plant, unaligned');
    expect(blockText(container, 'b5title0')).toBe('Shambling Mound');
  });

  it('derives the initiative from Dexterity where the note has none', () => {
    const { container } = renderSheet(FIVE_E_2024, MOUND);
    expect(valueOf(container, 'b5init00')).toBe('-1 (9)');
    expect(blockEl(container, 'b5init00')!.dataset.state).toBe('fallback');
  });

  it('shows the initiative the note holds', () => {
    const { container } = renderSheet(FIVE_E_2024, { ...MOUND, initiative: 3 });
    expect(valueOf(container, 'b5init00')).toBe('+3 (13)');
    expect(blockEl(container, 'b5init00')!.dataset.state).toBeUndefined();
  });

  it('joins both immunities on one line, and shows it while either has a value', () => {
    const both = renderSheet(FIVE_E_2024, MOUND);
    expect(valueOf(both.container, 'b5immu00')).toBe('lightning; blinded, deafened, exhaustion');
    expect(blockEl(both.container, 'b5immu00')!.querySelector('.atlas-sb-label')?.textContent).toBe('Immunities');
    both.unmount();

    const conditions = renderSheet(FIVE_E_2024, { ...MOUND, damage_immunities: '' });
    expect(valueOf(conditions.container, 'b5immu00')).toBe('blinded, deafened, exhaustion');
    conditions.unmount();

    const none = renderSheet(FIVE_E_2024, { ...MOUND, damage_immunities: '', condition_immunities: null });
    expect(blockEl(none.container, 'b5immu00')).toBeNull();
  });

  it('reads XP and the proficiency bonus of a rating from the lookup tables', () => {
    const tables = renderSheet(FIVE_E_2024, MOUND, { lookups: CR_TABLES });
    expect(valueOf(tables.container, 'b5cr0000')).toBe('5 (XP 1,800; PB +3)');
    tables.unmount();

    const own = renderSheet(FIVE_E_2024, { ...MOUND, cr: 0 });
    expect(valueOf(own.container, 'b5cr0000')).toBe('0 (XP 10; PB +2)');
    own.unmount();

    // The abridged tables have no proficiency bonus for 1/8: the optional part goes whole.
    const partial = renderSheet(FIVE_E_2024, { ...MOUND, cr: '1/8' });
    expect(valueOf(partial.container, 'b5cr0000')).toBe('1/8');
  });

  it('hides blocks whose fields are empty and shows a fallback that is text', () => {
    const { container } = renderSheet(FIVE_E_2024, MOUND);
    for (const id of ['b5vuln00', 'b5gear00', 'b5bonus0', 'b5react0', 'b5legen0', 'b5image0']) {
      expect(blockEl(container, id), id).toBeNull();
    }
    expect(valueOf(container, 'b5lang00')).toBe('None');
  });

  it('marks the hit point line, whose dice roll hit points', () => {
    const { container } = renderSheet(FIVE_E_2024, MOUND);
    const hp = blockEl(container, 'b5hp0000')!;
    expect(hp.querySelector('[data-hit-points]')).not.toBeNull();
    expect(valueOf(container, 'b5hp0000')).toBe('110 (13d10 + 39)');
    expect(hp.querySelector('.atlas-dice-link')?.getAttribute('data-formula')).toBe('13d10+39');
  });

  it('writes the ability table: modifiers, and saves from the note where it has them', () => {
    const { container } = renderSheet(FIVE_E_2024, MOUND);
    const rows = [...blockEl(container, 'b5stats0')!.querySelectorAll('tbody tr')]
      .map((row) => [...row.children].map((cell) => cell.textContent).join(' '));
    expect(rows).toEqual(['Str 18 +4 +7', 'Int 5 -3 -3', 'Dex 8 -1 -1', 'Wis 10 +0 +0', 'Con 16 +3 +3', 'Cha 5 -3 -3']);
    expect([...blockEl(container, 'b5stats0')!.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual(['Mod', 'Save', 'Mod', 'Save', 'Mod', 'Save']);
  });

  it('signs the skills', () => {
    const { container } = renderSheet(FIVE_E_2024, MOUND);
    expect(valueOf(container, 'b5skill0')).toBe('Stealth +3');
  });

  it('writes entries with their names run in', () => {
    const { container } = renderSheet(FIVE_E_2024, MOUND);
    const action = blockEl(container, 'b5actio0')!;
    expect(action.querySelector('.atlas-sb-section-heading')?.textContent).toBe('Actions');
    expect(action.querySelector('.atlas-sb-trait--run-in .atlas-sb-trait-name')?.textContent).toBe('Slam');
    expect(action.querySelectorAll('.atlas-dice-link').length).toBeGreaterThan(0);
  });
});

describe('StatblockSheet: §5.4 Marsh creature', () => {
  it('writes ability scores as a row with a modifier row under them', () => {
    const { container } = renderSheet(MARSH_CREATURE, { name: 'Bog Hag', stats: [12, 14, 10, 13, 11, 9] });
    const scores = blockEl(container, 's0j3m5oq')!;
    expect([...scores.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
    expect([...scores.querySelectorAll('td.atlas-sb-sheet-table__cell')].map((cell) => cell.textContent)).toEqual(['12', '14', '10', '13', '11', '9']);
    expect([...scores.querySelectorAll('td.atlas-sb-sheet-table__worked')].map((cell) => cell.textContent)).toEqual(['+1', '+2', '+0', '+1', '+0', '-1']);
  });

  it('shows a fallback for an empty list and a rating with its XP', () => {
    const { container } = renderSheet(MARSH_CREATURE, { name: 'Bog Hag', cr: '1/2' });
    expect(valueOf(container, 'p3p1t6za')).toBe('—');
    expect(valueOf(container, 'p4s7v2cb')).toBe('1/2 (100 XP)');
  });
});
