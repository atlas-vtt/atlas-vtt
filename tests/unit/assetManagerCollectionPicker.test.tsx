// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AnimatePresence, MotionGlobalConfig } from 'framer-motion';

import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { CollectionPickerDialog } from '../../src/app/packages/components/asset-manager/components/CollectionPickerDialog';
import { collectionsByName } from '../../src/app/packages/components/asset-manager/utils/collectionTransferActions';
import { assetOrganiseEntries } from '../../src/app/packages/components/asset-manager/contextMenus/assetOrganiseEntries';
import type { AssetContextMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/assetContextMenu';
import type { CollectionOption, TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import type { TransferMode } from '../../src/app/services/assetTransfer/transferPlan';

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(() => { cleanup(); document.body.innerHTML = ''; });

const collection = (id: string): CollectionOption => ({ id, name: id }) as CollectionOption;
const EDGE = collection('Audit Edge');
const EMPTY = collection('Audit Empty');
const BOOK_2 = collection('Book 2');
const BOOK_10 = collection('Book 10');
const COLLECTIONS = [BOOK_10, EMPTY, EDGE, BOOK_2];
const ROGUE: TokenAsset = { id: 'rogue', name: 'Rogue', type: 'tokens', imageUrl: '', modifiedAt: 0, folderId: null };

/** The dialog over a card, opened from a button, as ModalLayer keeps it. */
function Harness({ mode = 'move', onConfirm = vi.fn(), onClose }: { mode?: TransferMode; onConfirm?: (target: CollectionOption) => void; onClose?: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider>
      <div role="option" aria-selected="false" tabIndex={-1} data-asset-id="rogue">Rogue</div>
      <button type="button" onClick={() => setOpen(true)}>Opener</button>
      <AnimatePresence>
        {open && (
          <CollectionPickerDialog
            mode={mode} movingWhat="“Rogue”" assetIds={['rogue']} collections={COLLECTIONS} currentCollectionId="Audit Edge"
            onClose={() => { onClose?.(); setOpen(false); }}
            onConfirm={(target) => { onConfirm(target); setOpen(false); }}
          />
        )}
      </AnimatePresence>
    </TooltipProvider>
  );
}

const openDialog = (): void => {
  const opener = screen.getByRole('button', { name: 'Opener' });
  opener.focus();
  fireEvent.click(opener);
};
const action = (name: string): HTMLButtonElement => screen.getByRole('button', { name }) as HTMLButtonElement;
const field = (): HTMLInputElement => screen.getByRole('combobox') as HTMLInputElement;
const optionNames = (): string[] => screen.getAllByRole('option').filter((o) => o.closest('[role="listbox"]')).map((o) => o.textContent ?? '');

describe('Move to collection… and Copy to collection… in the token menu (decision #41)', () => {
  const deps = (targets: CollectionOption[]): AssetContextMenuDeps => ({
    canMoveToFolder: true, folders: [], transferTargets: targets, setIsMoveModalOpen: vi.fn(), pickCollection: vi.fn(),
    selectedAssetIds: ['rogue'], assets: [], availableTags: [],
  }) as unknown as AssetContextMenuDeps;
  const entries = (d: AssetContextMenuDeps): ReturnType<typeof assetOrganiseEntries> => assetOrganiseEntries(ROGUE, [ROGUE], d);

  it('are rows that open the picker, never submenus of every collection', () => {
    const d = deps([EMPTY]);
    const rows = entries(d).filter((e) => 'label' in e && /to collection/.test(String(e.label)));
    expect(rows.map((e) => ('label' in e ? e.label : ''))).toEqual(['Move to collection…', 'Copy to collection…']);
    expect(rows.every((e) => e.type === 'item')).toBe(true);
    for (const row of rows) if ('onClick' in row) row.onClick?.();
    expect(d.pickCollection).toHaveBeenNthCalledWith(1, [ROGUE], 'move');
    expect(d.pickCollection).toHaveBeenNthCalledWith(2, [ROGUE], 'copy');
  });

  it('are left out while there is no other collection to go to', () => {
    expect(entries(deps([])).some((e) => 'label' in e && /to collection/.test(String(e.label)))).toBe(false);
  });
});

describe('the collection picker', () => {
  it('lists every collection by name and opens on the current one, marked, with Move off', () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    openDialog();
    expect(screen.getByRole('heading', { name: 'Move to collection' })).toBeTruthy();
    expect(screen.getByText('Moving “Rogue”')).toBeTruthy();
    expect(document.activeElement).toBe(field());
    expect(action('Move').disabled).toBe(true);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(field());
    expect(optionNames()).toEqual(['Audit Edge(current)', 'Audit Empty', 'Book 2', 'Book 10']);
    expect(screen.getByRole('option', { name: 'Audit Edge (current)' }).getAttribute('aria-selected')).toBe('true');
  });

  it('narrows the list as the field is typed and says when nothing matches', () => {
    render(<Harness />);
    openDialog();
    fireEvent.change(field(), { target: { value: 'book' } });
    expect(optionNames()).toEqual(['Book 2', 'Book 10']);
    fireEvent.change(field(), { target: { value: 'dragons' } });
    expect(screen.queryAllByRole('option').filter((o) => o.closest('[role="listbox"]'))).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toBe('No collections found');
  });

  it('takes a collection with the arrow keys and Enter, then moves to it on Enter', () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    openDialog();
    // Down opens the list on the row after the current collection.
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(field().getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Audit Empty' }).id);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(field().value).toBe('Audit Empty');
    expect(field().getAttribute('aria-expanded')).toBe('false');
    expect(action('Move').disabled).toBe(false);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith(EMPTY);
  });

  it('takes a collection by pointer and copies with Copy in copy mode', () => {
    const onConfirm = vi.fn();
    render(<Harness mode="copy" onConfirm={onConfirm} />);
    openDialog();
    expect(screen.getByRole('heading', { name: 'Copy to collection' })).toBeTruthy();
    expect(screen.getByText('Copying “Rogue”')).toBeTruthy();
    fireEvent.click(field());
    fireEvent.click(screen.getByRole('option', { name: 'Book 10' }));
    fireEvent.click(action('Copy'));
    expect(onConfirm).toHaveBeenCalledWith(BOOK_10);
  });

  it('closes its open list on Escape before the dialog', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openDialog();
    fireEvent.click(field());
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('sorts names as people count ("Book 2" before "Book 10")', () => {
    expect(collectionsByName(COLLECTIONS).map((c) => c.name)).toEqual(['Audit Edge', 'Audit Empty', 'Book 2', 'Book 10']);
  });
});
