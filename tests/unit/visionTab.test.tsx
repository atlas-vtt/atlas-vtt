// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VisionTab } from '../../src/app/react/components/collection-settings/VisionTab';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { newSense, senseKind } from '../../src/app/gameSystems/senseEditing';
import { senseWithRole } from '../../src/app/gameSystems/senseRules';
import { DEFAULT_GRID_DEFAULTS } from '../../src/app/gameSystems/systemRules';
import type { CollectionGridDefaults } from '../../src/app/types/collectionSettingsTypes';
import type { TokenVisionDefaults } from '../../src/app/types/lightingTypes';
import type { SenseDefinition } from '../../src/app/types/senseTypes';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.senses!;
const darkvision = senseWithRole(dnd5e, 'darkvision');
const witchSight: SenseDefinition = { ...newSense('home-1'), name: 'Witch sight' };

interface HarnessProps {
  initial?: TokenVisionDefaults;
  grid?: CollectionGridDefaults;
  senses?: readonly SenseDefinition[];
}

function Harness({ initial, grid = DEFAULT_GRID_DEFAULTS, senses: initialSenses = dnd5e }: HarnessProps): React.ReactElement {
  const [vision, setVision] = useState<TokenVisionDefaults | undefined>(initial);
  const [senses, setSenses] = useState(initialSenses);
  return (
    <>
      <VisionTab gridDefaults={grid} vision={vision} onChange={setVision} senses={senses} onSensesChange={setSenses} />
      <output data-testid="vision">{JSON.stringify(vision ?? null)}</output>
      <output data-testid="senses">{JSON.stringify(senses)}</output>
    </>
  );
}

const saved = (): unknown => JSON.parse(screen.getByTestId('vision').textContent ?? 'null');
const savedSenses = (): SenseDefinition[] => JSON.parse(screen.getByTestId('senses').textContent ?? '[]') as SenseDefinition[];
const field = (name: RegExp | string): HTMLInputElement => screen.getByLabelText(name) as HTMLInputElement;
const definitions = (): HTMLElement => screen.getByRole('list', { name: 'Senses of this game system' });

function choose(label: string, option: string): void {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

afterEach(cleanup);

describe('VisionTab: what new tokens start with', () => {
  it('shows sight range and angle blank with the explanation and the collection\'s unit', () => {
    render(<Harness grid={{ ...DEFAULT_GRID_DEFAULTS, unitType: 'meters' }} />);
    expect(screen.getByText('New tokens start with these values; vision itself stays off until you switch it on for a token.')).toBeTruthy();
    for (const name of [/^Sight range \(m\)/, /^Vision angle/]) expect(field(name).value).toBe('');
    expect(field(/^Sight range/).placeholder).toBe('Unlimited');
    expect(screen.queryByLabelText(/^Darkvision \(/)).toBeNull();
    expect(screen.queryByLabelText(/^Tremorsense \(/)).toBeNull();
    expect(saved()).toBeNull();
  });

  it('adds a default sense from the collection\'s senses and gives it a range', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add sense' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Darkvision/ }));
    expect(saved()).toEqual({ senses: [{ id: darkvision.id }] });
    fireEvent.change(field('Darkvision range'), { target: { value: '60' } });
    expect(saved()).toEqual({ senses: [{ id: darkvision.id, range: 60 }] });
    fireEvent.change(field(/^Vision angle/), { target: { value: '120' } });
    expect(saved()).toEqual({ angle: 120, senses: [{ id: darkvision.id, range: 60 }] });
  });

  it('shows an old default distance as a sense, and saves senses once anything is edited', () => {
    render(<Harness initial={{ range: 30, darkvision: 60 }} />);
    expect(field('Darkvision range').value).toBe('60');
    fireEvent.change(field(/^Sight range/), { target: { value: '' } });
    expect(saved()).toEqual({ senses: [{ id: darkvision.id, range: 60 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Darkvision' }));
    expect(saved()).toBeNull();
  });

  it('shows a default that arrives after it mounted, and keeps it when one field is edited', () => {
    const grid = DEFAULT_GRID_DEFAULTS;
    const changes: Array<TokenVisionDefaults | undefined> = [];
    const tab = (vision: TokenVisionDefaults | undefined): React.ReactElement => (
      <VisionTab gridDefaults={grid} vision={vision} onChange={(v) => changes.push(v)} senses={dnd5e} onSensesChange={() => undefined} />
    );
    const { rerender } = render(tab(undefined));
    rerender(tab({ range: 30, senses: [{ id: darkvision.id, range: 60 }] }));
    expect(field('Darkvision range').value).toBe('60');
    fireEvent.change(field(/^Vision angle/), { target: { value: '90' } });
    expect(changes).toEqual([{ range: 30, angle: 90, senses: [{ id: darkvision.id, range: 60 }] }]);
  });

  it('treats a full turn or an invalid number as nothing', () => {
    render(<Harness />);
    fireEvent.change(field(/^Vision angle/), { target: { value: '360' } });
    expect(saved()).toBeNull();
    fireEvent.change(field(/^Sight range/), { target: { value: '-4' } });
    expect(saved()).toBeNull();
  });
});

describe('VisionTab: the senses of the game system', () => {
  it('lists the senses Atlas ships read-only, each with what it does', () => {
    render(<Harness />);
    const items = within(definitions()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(dnd5e.map((sense) => `${sense.name}${sense.description}`));
    expect(within(definitions()).queryByRole('button')).toBeNull();
    expect(savedSenses()).toEqual(dnd5e);
  });

  it('adds a sense of the collection\'s own, open for editing and asking for a name', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a sense of your own' }));
    const added = savedSenses().at(-1)!;
    expect(savedSenses()).toHaveLength(dnd5e.length + 1);
    expect(added).toMatchObject({ name: '', range: 'required', reveals: 'all' });
    expect(dnd5e.some((sense) => sense.id === added.id)).toBe(false);
    expect(screen.getByText('Give the sense a name.')).toBeTruthy();
    fireEvent.change(field('Name'), { target: { value: 'Witch sight' } });
    expect(savedSenses().at(-1)!.name).toBe('Witch sight');
    expect(screen.queryByText('Give the sense a name.')).toBeNull();
  });

  it('edits a sense of the collection\'s own in plain controls', () => {
    render(<Harness senses={[...dnd5e, witchSight]} />);
    expect(screen.queryByLabelText('Name')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Witch sight' }));
    choose('Range', 'No range');
    choose('In dim light', 'Sees it as bright light');
    choose('In darkness', 'Sees it as bright light');
    choose('Look in darkness', 'In colour');
    for (const name of ['Creatures only', 'Through walls', 'Sees invisible creatures', 'Works while blinded']) {
      fireEvent.click(screen.getByRole('switch', { name }));
    }
    expect(savedSenses().at(-1)).toMatchObject({
      range: 'unlimited', sees: { bright: 'normal', dim: 'as-bright', dark: 'as-bright', magicalDark: 'none' }, look: 'colour',
      reveals: 'creatures', lineOfSight: false, seesInvisible: true, worksWhileBlinded: true,
    });
    expect(savedSenses().slice(0, dnd5e.length)).toEqual(dnd5e);
  });

  it('sets the default range of a sense that needs one', () => {
    render(<Harness senses={[witchSight]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Witch sight' }));
    fireEvent.change(field(/^Default range \(ft\)/), { target: { value: '60' } });
    expect(savedSenses()[0]!.defaultRange).toBe(60);
    fireEvent.change(field(/^Default range/), { target: { value: '' } });
    expect(savedSenses()[0]).not.toHaveProperty('defaultRange');
    choose('Range', 'No range');
    expect(screen.queryByLabelText(/^Default range/)).toBeNull();
  });

  it('offers a sense that only lets sight see invisible creatures, without the light controls', () => {
    render(<Harness senses={[witchSight]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Witch sight' }));
    choose('Kind', 'Lets the token\'s sight see invisible creatures');
    expect(senseKind(savedSenses()[0]!)).toBe('see-invisible');
    for (const name of ['Range', 'In dim light', 'In darkness', 'Look in darkness']) expect(screen.queryByRole('combobox', { name })).toBeNull();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });

  it('says on its row what keeps a sense from being saved, while its fields are closed', () => {
    const nameless: SenseDefinition = newSense('home-2');
    const twin: SenseDefinition = { ...newSense('home-3'), name: 'darkvision' };
    render(<Harness senses={[...dnd5e, witchSight, nameless, twin]} />);
    const rows = within(definitions()).getAllByRole('listitem');
    expect(within(rows.at(-2)!).getByText('Give the sense a name.')).toBeTruthy();
    expect(within(rows.at(-1)!).getByText('Another sense has this name.')).toBeTruthy();
    expect(within(rows.at(-3)!).queryByText(/name\.$/)).toBeNull();
    fireEvent.click(within(rows.at(-2)!).getByRole('button', { name: 'Edit new sense' }));
    expect(screen.getAllByText('Give the sense a name.')).toHaveLength(1);
  });

  it('lets a sense that perceives creatures only show them as outlines', () => {
    render(<Harness senses={[witchSight]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Witch sight' }));
    expect(screen.queryByRole('switch', { name: 'Shows as outlines' })).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Creatures only' }));
    const outlines = screen.getByRole('switch', { name: 'Shows as outlines' });
    expect(outlines.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(outlines);
    expect(savedSenses()[0]).toMatchObject({ reveals: 'creatures', precise: false });
    fireEvent.click(screen.getByRole('switch', { name: 'Shows as outlines' }));
    expect(savedSenses()[0]!.precise).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Shows as outlines' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Creatures only' }));
    expect(savedSenses()[0]).toMatchObject({ reveals: 'all', precise: true });
  });

  it('refuses a name another sense has', () => {
    render(<Harness senses={[...dnd5e, witchSight]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Witch sight' }));
    fireEvent.change(field('Name'), { target: { value: 'Darkvision' } });
    expect(screen.getByText('Another sense has this name.')).toBeTruthy();
    expect(field('Name').getAttribute('aria-invalid')).toBe('true');
  });

  it('removes a sense of its own, also from what new tokens start with', () => {
    render(<Harness senses={[...dnd5e, witchSight]} initial={{ senses: [{ id: witchSight.id, range: 30 }, { id: darkvision.id }] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Witch sight' }));
    expect(savedSenses()).toEqual(dnd5e);
    expect(saved()).toEqual({ senses: [{ id: darkvision.id }] });
  });
});
