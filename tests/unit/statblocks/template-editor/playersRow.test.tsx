import { cleanup, fireEvent, renderHook, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import type { App } from 'obsidian';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { withOnlinePlay } from '../../../mocks/experimentalFeatures';
import { FakeSession, sampleTemplate } from './editorKit';
import { mountEditor, tileOptions } from './sidePanesKit';

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('../../../../src/app/statblocks/editor/template-editor/options/usePlayersRow', async (original) => ({
  ...await original<typeof import('../../../../src/app/statblocks/editor/template-editor/options/usePlayersRow')>(),
  usePlayersRow: (): boolean => flag.on,
}));

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
beforeEach(() => { flag.on = false; });
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const EXTRA_FIELDS: TemplateField[] = [
  { key: 'major', label: 'Major', type: 'number' },
  { key: 'severe', label: 'Severe', type: 'number' },
  { key: 'spells', label: 'Spells', type: 'spells' },
];
const EXTRA_BLOCKS: TemplateBlock[] = [
  { id: 'metric01', type: 'metric', heading: 'Thresholds', fields: ['major', 'severe'] },
];

function richTemplate(): StatblockTemplate {
  const sample = sampleTemplate();
  return { ...sample, fields: [...sample.fields, ...EXTRA_FIELDS], layout: { ...sample.layout, blocks: [...sample.layout.blocks, ...EXTRA_BLOCKS] } };
}

const players = (options: HTMLElement): HTMLElement | null => within(options).queryByRole('combobox', { name: 'Players' });

function choose(container: HTMLElement, option: string): void {
  fireEvent.click(within(container).getByRole('combobox', { name: 'Players' }));
  fireEvent.click(within(container).getByRole('option', { name: option }));
}

describe('the Players row of a tile\'s Options', () => {
  it('is not there while online play is off, on a Value or a Metric', () => {
    const { frame } = mountEditor(new FakeSession(richTemplate()));
    fireEvent.click(frame('stat-ac1'));
    expect(players(tileOptions())).toBeNull();
    expect(document.body.textContent).not.toContain('Players');
    fireEvent.click(frame('metric01'));
    expect(players(tileOptions())).toBeNull();
  });

  it('sets what players may do with a value, the default first, in one step, storing only the exception', () => {
    flag.on = true;
    const session = new FakeSession(richTemplate());
    const { frame } = mountEditor(session);
    fireEvent.click(frame('stat-ac1'));
    const options = tileOptions();
    expect(players(options)!.textContent).toContain('Can edit');
    fireEvent.click(players(options)!);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Can edit', 'Can see', 'Hidden']);
    fireEvent.click(screen.getByRole('option', { name: 'Hidden' }));
    const steps = session.steps;
    expect(session.template.players).toEqual({ ac: 'hidden' });
    choose(tileOptions(), 'Can edit');
    expect(session.template.players).toBeUndefined();
    expect(session.steps).toBe(steps + 1);
  });

  it('gives a Metric Options that set all its numbers at once', () => {
    flag.on = true;
    const session = new FakeSession(richTemplate());
    const { frame } = mountEditor(session);
    fireEvent.click(frame('metric01'));
    choose(tileOptions(), 'Can see');
    expect(session.template.players).toEqual({ major: 'read', severe: 'read' });
  });
});

describe('whether the Players row shows', () => {
  it('follows the GM\'s online play switch', async () => {
    const { usePlayersRow } = await vi.importActual<typeof import('../../../../src/app/statblocks/editor/template-editor/options/usePlayersRow')>('../../../../src/app/statblocks/editor/template-editor/options/usePlayersRow');
    const off = {} as App;
    expect(renderHook(() => usePlayersRow(off)).result.current).toBe(false);
    const on = withOnlinePlay({} as App);
    expect(renderHook(() => usePlayersRow(on)).result.current).toBe(true);
  });
});
