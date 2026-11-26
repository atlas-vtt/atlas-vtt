// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemReviewDialog } from '../../../src/app/packages/components/asset-manager/collection-transfer/ItemReviewDialog';
import type { ItemReview } from '../../../src/app/services/itemBundle/itemImport';

afterEach(cleanup);

const review = (overrides: Partial<ItemReview> = {}): ItemReview => ({
  kind: 'statblock-template', name: 'Marsh creature', version: 2, creator: 'Mara', outcome: 'new', localName: 'Marsh creature',
  installedVersion: null, diceSet: null, ...overrides,
});

describe('the item review', () => {
  it('says what the item is, who shared it, and adds it on confirm', () => {
    const onConfirm = vi.fn();
    render(<ItemReviewDialog review={review({ diceSet: { name: 'Boons', outcome: 'new' }, notes: 'Wetter.' })} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Add statblock template' })).toBeTruthy();
    expect(screen.getByText('Version 2 · by Mara')).toBeTruthy();
    expect(screen.getByText('It brings the dice set Boons.')).toBeTruthy();
    expect(screen.getByText('Wetter.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('tells an update, a copy beside a changed item and an item already in the library', () => {
    const { rerender } = render(<ItemReviewDialog review={review({ kind: 'system-preset', outcome: 'update', installedVersion: 1 })} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Add game system' })).toBeTruthy();
    expect(screen.getByText('Your copy is updated from version 1 to version 2.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy();

    rerender(<ItemReviewDialog review={review({ kind: 'dice-set', outcome: 'copy', installedVersion: 1, localName: 'Boons (Mara)' })} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('You changed your copy, so this version comes in beside it as Boons (Mara).')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add copy' })).toBeTruthy();

    rerender(<ItemReviewDialog review={review({ outcome: 'reuse' })} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Already in your library.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('cancels from its close button', () => {
    const onCancel = vi.fn();
    render(<ItemReviewDialog review={review({ creator: undefined })} onConfirm={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByText('Version 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
