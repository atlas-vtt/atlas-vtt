// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/dom';
import { deleteConfirmation } from '../../src/app/packages/components/asset-manager/utils/deleteConfirmation';
import type { AnyAsset } from '../../src/app/packages/components/asset-manager/types';
import { confirmAction } from '../../src/app/ui/confirmDialog';

const token = (name: string): AnyAsset => ({ id: name, name, type: 'tokens', imageUrl: '', modifiedAt: 0 });
const scene = (name: string): AnyAsset => ({ id: name, name, type: 'scenes', imageUrl: '', modifiedAt: 0 }) as AnyAsset;

describe('the confirmation of a deletion in the asset manager', () => {
  it('names one asset in its title and says what goes with it', () => {
    const options = deleteConfirmation([token('Goblin')], null);
    expect(options.title).toBe('Delete “Goblin”?');
    expect(options.list).toBeUndefined();
    expect(options.message).toEqual(['It goes to the trash.', 'The token’s art file goes with it.']);
    expect(options.confirmLabel).toBe('Delete');
  });

  it('names the first three of many and counts the rest, with what goes with each kind', () => {
    const assets = [token('Goblin'), token('Orc'), scene('Cave'), token('Wolf'), scene('Keep')];
    const options = deleteConfirmation(assets, null);
    expect(options.title).toBe('Delete 5 items?');
    expect(options.list).toEqual(['Goblin', 'Orc', 'Cave', 'and 2 more']);
    expect(options.message).toEqual([
      'These 5 items go to the trash:',
      'The art files of the 3 tokens go with them.',
      'The map files and snapshots of the 2 scenes go with them.',
    ]);
    expect(options.confirmLabel).toBe('Delete 5 items');
  });
});

describe('the confirmation dialog', () => {
  afterEach(() => document.querySelectorAll('.atlas-text-dialog-backdrop').forEach((element) => element.remove()));

  it('lists the names under its first paragraph and closes as cancelled from its close button', async () => {
    const result = confirmAction({ title: 'Delete 2 items?', message: ['These go:', 'And more.'], list: ['A', 'B'], confirmLabel: 'Delete', destructive: true });
    expect(screen.getByRole('dialog', { name: 'Delete 2 items?' })).toBeTruthy();
    const paragraphs = [...document.querySelectorAll('.atlas-text-dialog__body > *')].map((element) => element.tagName);
    expect(paragraphs).toEqual(['P', 'UL', 'P']);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await expect(result).resolves.toBe(false);
    expect(document.querySelector('.atlas-text-dialog-backdrop')).toBeNull();
  });

  it('opens a deletion with focus on Cancel, so Enter cancels and only a deliberate press deletes (decision #18)', async () => {
    const result = confirmAction({ title: 'Delete Rogue?', message: ['Gone for good.'], confirmLabel: 'Delete', destructive: true });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    await expect(result).resolves.toBe(false);
  });

  it('opens a confirmation that destroys nothing with focus on its action', async () => {
    const result = confirmAction({ title: 'Apply?', message: ['Applies the preset.'], confirmLabel: 'Apply' });
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(document.activeElement).toBe(apply);
    fireEvent.click(apply);
    await expect(result).resolves.toBe(true);
  });

  it('keeps Tab inside and lets no key reach the window behind it', async () => {
    const heard = vi.fn();
    const behind = (event: KeyboardEvent): void => heard(event.key);
    document.addEventListener('keydown', behind);
    try {
      const result = confirmAction({ title: 'Delete Rogue?', message: ['Gone.'], confirmLabel: 'Delete', destructive: true });
      const cancel = screen.getByRole('button', { name: 'Cancel' });
      const del = screen.getByRole('button', { name: 'Delete' });
      const close = screen.getByRole('button', { name: 'Close' });
      fireEvent.keyDown(cancel, { key: 'Tab' });
      expect(document.activeElement).toBe(del);
      fireEvent.keyDown(del, { key: 'Tab' });
      expect(document.activeElement).toBe(close);
      fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(del);
      // A press on the dialog's text keeps focus in it: the frame takes it, and Tab goes on from there.
      const frame = screen.getByRole('dialog');
      frame.focus();
      fireEvent.keyDown(frame, { key: 'Tab' });
      expect(document.activeElement).toBe(close);
      for (const key of ['2', 'a', 'Delete', 'Enter']) fireEvent.keyDown(close, { key });
      expect(heard).not.toHaveBeenCalled();
      fireEvent.keyDown(close, { key: 'Escape' });
      await expect(result).resolves.toBe(false);
      expect(heard).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', behind);
    }
  });
});
