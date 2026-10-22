// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourcesTab } from '../../src/app/react/components/collection-settings/ResourcesTab';
import { HP_RESOURCE, isDraftResourceKey } from '../../src/app/resources/resourceDefinitions';
import { RESOURCE_COLORS } from '../../src/app/resources/resourceColors';
import { slottedResources } from '../../src/app/resources/resourceSlots';
import { STARTER_TOKENS } from '../../src/app/services/starterTokens';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';

const STR: ResourceDefinition = { ...HP_RESOURCE, key: 'str', name: 'STR', field: 'stats.0', color: '#dc2626', defeatedWhenSpent: false };

/** The tab with its list held as the collection settings dialog holds it. */
function Editor({ initial, onChange = vi.fn(), fields = ['hp', 'stats.0', 'ammo'] }: {
  initial: ResourceDefinition[];
  onChange?: (resources: ResourceDefinition[]) => void;
  fields?: string[];
}): React.ReactElement {
  const [resources, setResources] = useState(initial);
  return <ResourcesTab resources={resources} fieldSuggestions={fields.map((path) => ({ path }))} onChange={(next) => { setResources(next); onChange(next); }} />;
}
const sockets = (): HTMLElement[] => within(screen.getByRole('group', { name: 'Resource sockets' })).getAllByRole('button');
const socket = (name: string | RegExp): HTMLElement => within(screen.getByRole('group', { name: 'Resource sockets' })).getByRole('button', { name });
const places = (resources: readonly ResourceDefinition[]): Array<[string, number]> => slottedResources(resources).map(({ definition, slot }) => [definition.name, slot]);
const last = (onChange: ReturnType<typeof vi.fn>): ResourceDefinition[] => onChange.mock.calls.at(-1)![0] as ResourceDefinition[];

afterEach(cleanup);

describe('ResourcesTab', () => {
  it('shows the sockets around a real token: the fighter\'s art in Atlas\' own ring', () => {
    render(<Editor initial={[{ ...HP_RESOURCE }]} />);
    const rig = screen.getByRole('group', { name: 'Resource sockets' });
    expect(rig.querySelector('.atlas-token-portrait .atlas-token-ring')).not.toBeNull();
    expect(rig.querySelector<HTMLImageElement>('.atlas-token-portrait img')!.src).toBe(STARTER_TOKENS.find(({ name }) => name === 'Fighter')!.image);
    // The picture is decoration: it has no name of its own and is not announced
    expect(rig.querySelector('.atlas-csm-token-art')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows a token with six sockets, the filled ones named and none of them numbered', () => {
    render(<Editor initial={[{ ...HP_RESOURCE }, STR]} />);
    expect(sockets()).toHaveLength(6);
    expect(socket('HP: bar below the token')).toBeTruthy();
    expect(socket('STR: bar below the token')).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Resource sockets' })).getAllByRole('button', { name: /^Empty socket/ })).toHaveLength(4);
    expect(screen.getByRole('group', { name: 'Resource sockets' }).textContent).not.toMatch(/\d/);
    expect(screen.queryByRole('button', { name: /add resource/i })).toBeNull();
  });

  it('puts a new resource into whichever socket is clicked, leaving the others empty', () => {
    const onChange = vi.fn();
    render(<Editor initial={[{ ...HP_RESOURCE }]} onChange={onChange} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Resource sockets' })).getAllByRole('button', { name: 'Empty socket: wheel on the left' })[1]!);
    const added = last(onChange).find((resource) => resource.key !== 'hp')!;
    expect(added).toMatchObject({ slot: 5, direction: 'drains', visibleToPlayers: false });
    expect(isDraftResourceKey(added.key)).toBe(true);
    expect(places(last(onChange))).toEqual([['HP', 0], ['', 5]]);
    // Its card is open, ready for the name
    expect(screen.getByRole('textbox', { name: 'Name' })).toBe(document.activeElement);
  });

  it('opens a fan of round buttons on the selected socket that set how the resource behaves', async () => {
    const onChange = vi.fn();
    render(<Editor initial={[{ ...HP_RESOURCE }, STR]} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /^Drains/ })).toBeNull();
    fireEvent.click(socket('STR: bar below the token'));
    expect(socket('STR: bar below the token').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /^Drains/ }));
    expect(last(onChange).find((r) => r.key === 'str')!.direction).toBe('fills');
    fireEvent.click(screen.getByRole('button', { name: 'Hidden from players' }));
    expect(last(onChange).find((r) => r.key === 'str')!.visibleToPlayers).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Does not defeat the token' }));
    expect(last(onChange).find((r) => r.key === 'str')!.defeatedWhenSpent).toBe(true);
    // The colour is one of the curated ones, picked in the card; no free colour picker
    fireEvent.click(screen.getByRole('button', { name: 'Teal' }));
    expect(last(onChange).find((r) => r.key === 'str')!.color).toBe('#14b8a6');
    expect(document.querySelector('input[type="color"]')).toBeNull();
    // HP was never touched
    expect(last(onChange).find((r) => r.key === 'hp')).toEqual({ ...HP_RESOURCE, slot: 0 });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(last(onChange).map((r) => r.key)).toEqual(['hp']);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull());
  });

  it('edits name and statblock field in the card, keeping the key when the resource is renamed', () => {
    const onChange = vi.fn();
    render(<Editor initial={[{ ...HP_RESOURCE }]} onChange={onChange} />);
    fireEvent.click(socket('HP: bar below the token'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Hit Protection' } });
    expect(last(onChange)[0]).toMatchObject({ key: 'hp', name: 'Hit Protection' });
    expect(socket('Hit Protection: bar below the token')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Statblock field' }), { target: { value: 'resources.hp' } });
    expect(last(onChange)[0]!.field).toBe('resources.hp');
  });

  it('offers the fields found in the collection\'s statblocks, narrowed by what is typed', () => {
    const onChange = vi.fn();
    render(<Editor initial={[{ ...HP_RESOURCE }]} onChange={onChange} fields={['hp', 'stats.0', 'stats.1', 'ammo']} />);
    fireEvent.click(socket('HP: bar below the token'));
    const found = (): string[] => within(screen.getByRole('group', { name: 'Fields in this collection\'s statblocks' })).getAllByRole('button').map((chip) => chip.textContent ?? '');
    expect(found()).toEqual(['hp', 'stats.0', 'stats.1', 'ammo']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Statblock field' }), { target: { value: 'stat' } });
    expect(found()).toEqual(['stats.0', 'stats.1']);
    fireEvent.click(screen.getByRole('button', { name: 'stats.1' }));
    expect(last(onChange)[0]!.field).toBe('stats.1');
  });

  it('closes the selection on Escape without closing the dialog around it', async () => {
    const onDialogKey = vi.fn();
    render(<div onKeyDown={onDialogKey} role="presentation"><Editor initial={[{ ...HP_RESOURCE }]} /></div>);
    fireEvent.click(socket('HP: bar below the token'));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull());
    expect(onDialogKey).not.toHaveBeenCalled();
    fireEvent.keyDown(socket('HP: bar below the token'), { key: 'Escape' });
    expect(onDialogKey).toHaveBeenCalledOnce();
  });

  it('drops a new resource that was left without name and field, and keeps one that was begun', () => {
    const onChange = vi.fn();
    render(<Editor initial={[{ ...HP_RESOURCE }]} onChange={onChange} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Resource sockets' })).getAllByRole('button', { name: 'Empty socket: wheel on the right' })[1]!);
    expect(last(onChange)).toHaveLength(2);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Escape' });
    expect(last(onChange).map((r) => r.key)).toEqual(['hp']);

    fireEvent.click(within(screen.getByRole('group', { name: 'Resource sockets' })).getAllByRole('button', { name: 'Empty socket: wheel on the right' })[0]!);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Ammo' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Escape' });
    expect(places(last(onChange))).toEqual([['HP', 0], ['Ammo', 2]]);
    // Still without its field: marked, so it is found again
    expect(socket('Ammo: wheel on the right').getAttribute('aria-invalid')).toBe('true');
  });

  it('moves a resource dragged onto an empty socket, and swaps two dragged onto each other', () => {
    const onChange = vi.fn();
    render(<Editor initial={[{ ...HP_RESOURCE }, STR]} onChange={onChange} />);
    const emptyLeft = within(screen.getByRole('group', { name: 'Resource sockets' })).getAllByRole('button', { name: 'Empty socket: wheel on the left' })[0]!;
    fireEvent.pointerDown(socket('STR: bar below the token'), { button: 0 });
    fireEvent.pointerEnter(emptyLeft);
    fireEvent.pointerUp(emptyLeft);
    expect(places(last(onChange))).toEqual([['HP', 0], ['STR', 4]]);

    fireEvent.pointerDown(socket('HP: bar below the token'), { button: 0 });
    fireEvent.pointerEnter(socket('STR: wheel on the left'));
    fireEvent.pointerUp(socket('STR: wheel on the left'));
    expect(places(last(onChange))).toEqual([['STR', 0], ['HP', 4]]);
    // A drag selects nothing
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('cycles how a resource counts through drains, fills and static, and a static one cannot defeat', () => {
    const onChange = vi.fn();
    render(<Editor initial={[{ ...HP_RESOURCE }]} onChange={onChange} />);
    fireEvent.click(socket('HP: bar below the token'));
    fireEvent.click(screen.getByRole('button', { name: /^Drains/ }));
    expect(last(onChange)[0]!.direction).toBe('fills');
    fireEvent.click(screen.getByRole('button', { name: /^Fills/ }));
    expect(last(onChange)[0]).toMatchObject({ direction: 'static' });
    // HP defeated its token; a static value never does
    expect(last(onChange)[0]).not.toHaveProperty('defeatedWhenSpent', true);
    expect(screen.getByRole('button', { name: 'A static value never defeats the token' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /^Static/ }));
    expect(last(onChange)[0]!.direction).toBe('drains');
  });

  it('shows which of the curated colours a resource has, and gives a new resource one that is still free', () => {
    const onChange = vi.fn();
    render(<Editor initial={[{ ...HP_RESOURCE }]} onChange={onChange} />);
    fireEvent.click(socket('HP: bar below the token'));
    const swatches = within(screen.getByRole('group', { name: 'Colour' })).getAllByRole('button');
    expect(swatches).toHaveLength(20);
    expect(swatches.filter((swatch) => swatch.getAttribute('aria-pressed') === 'true').map((swatch) => swatch.getAttribute('aria-label'))).toEqual(['Green']);
    fireEvent.click(within(screen.getByRole('group', { name: 'Resource sockets' })).getAllByRole('button', { name: 'Empty socket: wheel on the right' })[0]!);
    const added = last(onChange).find((resource) => resource.key !== 'hp')!;
    expect(added.color).not.toBe(HP_RESOURCE.color);
    expect(RESOURCE_COLORS.map(({ value }) => value)).toContain(added.color);
  });
});
