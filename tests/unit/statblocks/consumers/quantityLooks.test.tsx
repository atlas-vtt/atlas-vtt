// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatblockTokenResources } from '../../../../src/app/react/components/statblock/StatblockTokenResources';
import { fsQuantityLook, PLAIN_QUANTITY_LOOK, templateQuantityLook } from '../../../../src/app/resources/quantityLooks';
import { tokenQuantities } from '../../../../src/app/resources/statblockQuantities';
import { FATE_NPC } from '../../../../src/app/statblocks/presets/fate';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { HP, STRESS } from '../../../mocks/resourceFixtures';
import { blockEl, renderSheet, templateOf } from '../render/sheetTestKit';

afterEach(cleanup);

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'vitality', label: 'Vitality', type: 'number', meaning: 'hit-points' },
  { key: 'hit_dice', label: 'Hit Dice', type: 'dice' },
  { key: 'stress', label: 'Stress', type: 'number' },
  { key: 'mana', label: 'Mana', type: 'number' },
];
const BLOCKS: TemplateBlock[] = [
  { id: 'vital000', type: 'stat', field: 'vitality', look: 'run-in', rollFrom: 'hit_dice' },
  { id: 'hp000000', type: 'track', field: 'vitality', resource: 'hp', label: 'Wounds', look: 'boxes', counts: 'down' },
  { id: 'stress00', type: 'track', field: 'stress', look: 'boxes', counts: 'up' },
  { id: 'mana0000', type: 'track', field: 'mana', label: 'Mana points', look: 'gauge', counts: 'down' },
];
const TEMPLATE = templateOf(FIELDS, BLOCKS);

describe('what a native template draws of its quantities', () => {
  it('takes its tracks from Track blocks drawn as boxes, and their labels', () => {
    const look = templateQuantityLook(TEMPLATE);
    expect([...look.tracks].sort()).toEqual(['hp', 'stress', 'vitality']);
    expect(Object.fromEntries(look.labels)).toEqual({ vitality: 'Wounds', stress: 'Stress', mana: 'Mana points' });
  });

  it('names the entries of a Scores field after its slots', () => {
    expect(Object.fromEntries(templateQuantityLook(FATE_NPC.template).labels)).toMatchObject({ 'stress.0': 'Physical', 'stress.1': 'Mental' });
  });

  it('lists the quantities as the template draws them on the DM screen', () => {
    const token = { resources: { hp: { current: 6, max: 8 } } };
    expect(tokenQuantities({ vitality: 8, stress: 3, mana: 5 }, templateQuantityLook(TEMPLATE), token, [HP])).toEqual([
      { key: 'hp', label: 'HP', value: { current: 6, max: 8 }, fills: false, boxes: true },
      { key: 'stress', label: 'Stress', value: { current: 0, max: 3 }, fills: true, boxes: true },
      { key: 'mana', label: 'Mana points', value: { current: 5, max: 5 }, fills: false, boxes: false },
    ]);
  });

  it('lists Fate stress tracks of a native statblock under their slots', () => {
    expect(tokenQuantities({ stress: [3, 2] }, templateQuantityLook(FATE_NPC.template), {}, [HP]).map((q) => [q.label, q.boxes]))
      .toEqual([['Physical stress', true], ['Mental stress', true]]);
  });

  it('reads a Fantasy Statblocks layout as before: Daggerheart tracks, labels from its blocks', () => {
    const daggerheart = fsQuantityLook({ id: 'daggerheart-adversary', name: 'Daggerheart Adversary', blocks: [] });
    expect([...daggerheart.tracks]).toEqual(['hp', 'stress']);
    const labelled = fsQuantityLook({ id: 'basic', name: 'Basic', blocks: [
      { id: 'mana', type: 'property', properties: ['mana'], display: 'Mana:' },
      { id: 'group', type: 'group', properties: [], nested: [{ id: 'stress', type: 'table', properties: ['stress'], headers: ['Physical'] }] },
    ] });
    expect(Object.fromEntries(labelled.labels)).toEqual({ mana: 'Mana', 'stress.0': 'Physical' });
    expect(labelled.tracks.size).toBe(0);
  });

  it('draws a native statblock\'s tracks as boxes in the DM screen\'s token rows', () => {
    const tokens = [{ id: 't1', name: 'Hob', instanceNumber: 1, resources: { hp: { current: 6, max: 8 }, stress: { current: 1, max: 3 } } }];
    render(<StatblockTokenResources monster={{ name: 'Hob', vitality: 8, stress: 3 }} look={templateQuantityLook(TEMPLATE)} tokens={tokens}
      definitions={[HP, STRESS]} onLocateToken={vi.fn()} onUpdateToken={vi.fn()} />);
    const entry = screen.getByRole('group', { name: 'Hob #1' });
    expect(within(entry).getAllByRole('checkbox')).toHaveLength(11);
    expect(within(entry).queryByRole('meter')).toBeNull();
  });

  it('shows gauges where the statblock draws no tracks', () => {
    expect(tokenQuantities({ hp: 4 }, PLAIN_QUANTITY_LOOK, { resources: { hp: { current: 2, max: 4 } } }, [HP]).map((q) => q.boxes)).toEqual([false]);
  });
});

describe('hit points under the key a template means', () => {
  it('marks the Stat bound to the hit-points field for the hit point roll, whatever its key', () => {
    const { container } = renderSheet(TEMPLATE, { name: 'Hob', vitality: 8, hit_dice: '2d6' });
    expect(blockEl(container, 'vital000')?.querySelector('[data-hit-points]')).not.toBeNull();
  });
});
