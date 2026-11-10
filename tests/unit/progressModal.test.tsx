// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProgressModal } from '../../src/app/packages/components/primitives/ProgressModal';

afterEach(cleanup);

it('shows progress while working and the prompt choices instead once it needs the user', () => {
  const { rerender } = render(<ProgressModal title="Importing collection" message="Writing 3 of 9 files…" fraction={0.3} />);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('30');
  expect(screen.queryByRole('button')).toBeNull();

  const cancel = vi.fn();
  const update = vi.fn();
  rerender(
    <ProgressModal
      title="Importing collection"
      message="This vault already has &quot;5e&quot;."
      fraction={0}
      prompt={{ actions: [{ label: 'Cancel', onSelect: cancel }, { label: 'Update', onSelect: update, isPrimary: true }], onDismiss: cancel }}
    />,
  );
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('This vault already has "5e".');
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(update).toHaveBeenCalledOnce();
});

it('dismisses the prompt on Escape wherever focus is, without passing the key on', () => {
  const onDismiss = vi.fn();
  const underneath = vi.fn();
  document.addEventListener('keydown', underneath);
  render(<ProgressModal title="Importing collection" message="Done" fraction={1} prompt={{ actions: [{ label: 'Close', onSelect: onDismiss }], onDismiss }} />);
  fireEvent.keyDown(document.body, { key: 'Escape' });
  document.removeEventListener('keydown', underneath);
  expect(onDismiss).toHaveBeenCalledOnce();
  expect(underneath).not.toHaveBeenCalled();
});
