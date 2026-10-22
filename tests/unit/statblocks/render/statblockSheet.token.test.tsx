// @vitest-environment jsdom
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hitPointRolls = vi.hoisted(() => [] as Array<{ formula: string; notePath: string; ability: string | undefined }>);
vi.mock('../../../../src/app/services/statblockHitPoints', () => ({
  rollHitPoints: (_app: unknown, formula: string, notePath: string, _tokens: unknown, ability?: string) => {
    hitPointRolls.push({ formula, notePath, ability });
  },
}));

import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { blockEl, fakeApp, renderSheet, templateOf } from './sheetTestKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token', type: 'image' },
  { key: 'hp', label: 'Hit Points', type: 'number', meaning: 'hit-points' },
  { key: 'hit_dice', label: 'Hit Dice', type: 'dice' },
  { key: 'stress', label: 'Stress', type: 'number' },
  { key: 'traits', label: 'Traits', type: 'entries' },
];

const BLOCKS: TemplateBlock[] = [
  { id: 'image000', type: 'image', field: 'image', shape: 'token' },
  { id: 'hp000000', type: 'stat', field: 'hp', look: 'run-in', rollFrom: 'hit_dice' },
  { id: 'stress00', type: 'track', field: 'stress', resource: 'stress', look: 'boxes', counts: 'up' },
  { id: 'gauge000', type: 'track', field: 'hp', resource: 'hp', look: 'gauge', counts: 'down' },
  { id: 'traits00', type: 'entries', field: 'traits' },
];

const TEMPLATE = templateOf(FIELDS, BLOCKS);
const VALUES = { name: 'Hob', image: 'art/hob.png', hp: 12, hit_dice: '3d8', stress: 6, traits: [{ name: 'Bite', desc: 'Deals 1d4 damage.' }] };

describe('StatblockSheet: tracks', () => {
  it('shows a box per point of the maximum, where the count starts', () => {
    const { container } = renderSheet(TEMPLATE, VALUES);
    const boxes = blockEl(container, 'stress00')!.querySelectorAll('.atlas-sb-track-box');
    expect(boxes).toHaveLength(6);
    expect(blockEl(container, 'stress00')!.querySelectorAll('.is-marked')).toHaveLength(0);
    expect(blockEl(container, 'gauge000')!.querySelector('.atlas-sb-gauge-value')?.textContent).toBe('12 / 12');
  });

  it("shows the token's value", () => {
    const token = { id: 't1', name: 'Hob 1', resources: { stress: { current: 2, max: 6 }, hp: { current: 5, max: 12 } } };
    const { container } = renderSheet(TEMPLATE, VALUES, { token });
    const stress = blockEl(container, 'stress00')!;
    expect(stress.querySelectorAll('.is-marked')).toHaveLength(2);
    expect(blockEl(container, 'gauge000')!.querySelector('.atlas-sb-gauge-value')?.textContent).toBe('5 / 12');
    expect(blockEl(container, 'gauge000')!.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('5');
  });

  it('shows a box track with a large maximum as a gauge', () => {
    const { container } = renderSheet(TEMPLATE, { ...VALUES, stress: 80 });
    expect(blockEl(container, 'stress00')!.querySelector('.atlas-sb-gauge')).not.toBeNull();
  });
});

describe('StatblockSheet: art', () => {
  it("frames the statblock's art as a token", () => {
    const { container } = renderSheet(TEMPLATE, VALUES, { app: fakeApp() });
    const image = blockEl(container, 'image000')!;
    expect(image.querySelector('.atlas-token-portrait img')?.getAttribute('src')).toBe('app://local/art/hob.png');
  });

  it("shows the token's art in place of the statblock's, even where it has none", () => {
    const token = { id: 't1', art: { src: 'app://local/tokens/hob-red.png', ringColor: '#ff0000' } };
    const { container } = renderSheet(TEMPLATE, { ...VALUES, image: '' }, { token });
    expect(blockEl(container, 'image000')!.querySelector('img')?.getAttribute('src')).toBe('app://local/tokens/hob-red.png');
  });
});

describe('StatblockSheet: dice', () => {
  it('rolls dice in the text through the open map, named after the entry', () => {
    const rolls: Array<{ formula: string; source: unknown }> = [];
    const { container } = renderSheet(TEMPLATE, VALUES, { app: fakeApp(rolls), sourcePath: 'Bestiary/Hob.md', token: { id: 't1', name: 'Hob 1' } });

    const link = blockEl(container, 'traits00')!.querySelector<HTMLElement>('.atlas-dice-link')!;
    fireEvent.click(link);
    expect(rolls).toEqual([{
      formula: '1d4',
      source: { type: 'statblock', tokenId: 't1', statblockPath: 'Bestiary/Hob.md', tokenName: 'Hob 1', abilityName: 'Bite' },
    }]);
  });

  it('marks the hit point line and rolls its hit dice into hit points', () => {
    hitPointRolls.length = 0;
    const { container } = renderSheet(TEMPLATE, VALUES, { app: fakeApp(), sourcePath: 'Bestiary/Hob.md' });
    const hp = blockEl(container, 'hp000000')!;
    expect(hp.querySelector('[data-hit-points]')).not.toBeNull();

    const link = hp.querySelector<HTMLElement>('.atlas-dice-link')!;
    expect(link.textContent).toBe('12');
    fireEvent.click(link);
    expect(hitPointRolls).toEqual([{ formula: '3d8', notePath: 'Bestiary/Hob.md', ability: 'Hit Points' }]);
  });
});
