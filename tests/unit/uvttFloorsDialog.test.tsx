// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UvttFloor } from '../../src/app/import/uvtt/importUvttFloors';
import type { FloorsChoice, FloorsRequest } from '../../src/app/import/uvtt/runUvttGroupImport';
import type { UvttSource } from '../../src/app/import/uvtt/uvttSource';
import { UvttFloorsDialog } from '../../src/app/packages/components/asset-manager/components/UvttFloorsDialog';
import { useFloorsChoice } from '../../src/app/packages/components/asset-manager/hooks/useFloorsChoice';

afterEach(cleanup);

const floor = (fileName: string, name: string): UvttFloor => ({ source: { fileName } as UvttSource, name });

const REQUEST: FloorsRequest = {
  sceneName: 'Inn by the Lake',
  floors: [floor('Inn by the Lake-_00.dd2vtt', 'Level 1'), floor('Inn by the Lake-_01.dd2vtt', 'Level 2'), floor('Inn by the Lake-_02 roof.dd2vtt', 'Roof')],
};

function open(): ReturnType<typeof vi.fn<(choice: FloorsChoice | null) => void>> {
  const onChoose = vi.fn<(choice: FloorsChoice | null) => void>();
  render(<UvttFloorsDialog request={REQUEST} onChoose={onChoose} />);
  return onChoose;
}

const floorNames = (choice: FloorsChoice | null | undefined): [string, string][] => {
  if (choice?.kind !== 'levels') throw new Error('No levels chosen');
  return choice.floors.map((chosen) => [chosen.source.fileName, chosen.name]);
};

describe('the dialog for map files that can be floors', () => {
  it('lists the floors top first, under the scene\'s name, and imports them as suggested', () => {
    const onChoose = open();

    expect(screen.getAllByRole('listitem').map((item) => item.querySelector('.atlas-uvtt-floors__file')?.textContent)).toEqual([
      'Inn by the Lake-_02 roof.dd2vtt', 'Inn by the Lake-_01.dd2vtt', 'Inn by the Lake-_00.dd2vtt',
    ]);
    expect(screen.getByRole('textbox', { name: 'Name of Roof' })).toHaveProperty('value', 'Roof');
    fireEvent.click(screen.getByRole('button', { name: 'Import as one scene' }));

    expect(onChoose.mock.calls[0]![0]).toMatchObject({ kind: 'levels', sceneName: 'Inn by the Lake' });
    expect(floorNames(onChoose.mock.calls[0]![0])).toEqual([
      ['Inn by the Lake-_00.dd2vtt', 'Level 1'], ['Inn by the Lake-_01.dd2vtt', 'Level 2'], ['Inn by the Lake-_02 roof.dd2vtt', 'Roof'],
    ]);
  });

  it('takes the names typed and the order the floors are moved into, an empty name standing for the one suggested', () => {
    const onChoose = open();

    fireEvent.change(screen.getByRole('textbox', { name: 'Name of Level 1' }), { target: { value: 'Cellar' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of Level 2' }), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move Cellar up' }));
    fireEvent.change(screen.getByDisplayValue('Inn by the Lake'), { target: { value: 'The Inn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import as one scene' }));

    expect(onChoose.mock.calls[0]![0]).toMatchObject({ kind: 'levels', sceneName: 'The Inn' });
    expect(floorNames(onChoose.mock.calls[0]![0])).toEqual([
      ['Inn by the Lake-_01.dd2vtt', 'Level 2'], ['Inn by the Lake-_00.dd2vtt', 'Cellar'], ['Inn by the Lake-_02 roof.dd2vtt', 'Roof'],
    ]);
  });

  it('cannot move the top floor up or the bottom floor down', () => {
    open();

    expect(screen.getByRole('button', { name: 'Move Roof up' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Move Level 1 down' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Move Level 2 up' })).toHaveProperty('disabled', false);
  });

  it('imports a scene of each file, or nothing when closed or on Escape', () => {
    const onChoose = open();

    fireEvent.click(screen.getByRole('button', { name: 'Import as 3 scenes' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onChoose.mock.calls).toEqual([[{ kind: 'scenes' }], [null]]);
  });
});

describe('the question an import asks', () => {
  it('waits for the answer, and is cancelled by another question or by closing the asset manager', async () => {
    const { result, rerender } = renderHook(({ isOpen }) => useFloorsChoice(isOpen), { initialProps: { isOpen: true } });

    let first!: Promise<FloorsChoice | null>;
    act(() => { first = result.current.ask(REQUEST); });
    expect(result.current.request).toBe(REQUEST);
    let second!: Promise<FloorsChoice | null>;
    act(() => { second = result.current.ask(REQUEST); });
    await expect(first).resolves.toBeNull();
    act(() => result.current.answer({ kind: 'scenes' }));
    await expect(second).resolves.toEqual({ kind: 'scenes' });
    expect(result.current.request).toBeNull();

    let third!: Promise<FloorsChoice | null>;
    act(() => { third = result.current.ask(REQUEST); });
    rerender({ isOpen: false });
    await expect(third).resolves.toBeNull();
    expect(result.current.request).toBeNull();
  });

  it('is answered as the dialog suggests when the asset manager closed before it was asked', async () => {
    const { result } = renderHook(() => useFloorsChoice(false));

    await expect(result.current.ask(REQUEST)).resolves.toEqual({ kind: 'levels', sceneName: REQUEST.sceneName, floors: REQUEST.floors });
    expect(result.current.request).toBeNull();
  });
});
