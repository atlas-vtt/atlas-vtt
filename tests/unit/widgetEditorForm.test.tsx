// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WidgetEditorForm, type WidgetDraft } from '../../src/app/react/components/command-palette/WidgetEditorForm';

afterEach(cleanup);

function submitNew(canShareWithCollection: boolean, initial?: Partial<WidgetDraft>): WidgetDraft {
  const onSubmit = vi.fn<(draft: WidgetDraft) => void>();
  render(
    <WidgetEditorForm
      {...(initial ? { initial } : {})}
      canShareWithCollection={canShareWithCollection}
      submitLabel="Add widget"
      onSubmit={onSubmit}
      onCancel={() => undefined}
    />,
  );
  fireEvent.change(screen.getByPlaceholderText('Widget name'), { target: { value: 'Fear' } });
  fireEvent.submit(screen.getByPlaceholderText('Widget name').closest('form')!);
  return onSubmit.mock.calls[0]![0];
}

describe('WidgetEditorForm scope', () => {
  it('switches new widgets on in their own scene', () => {
    expect(submitNew(true).scope).toBe('scene');
  });

  it('shows a new widget in every scene once the toggle is switched on', () => {
    const onSubmit = vi.fn<(draft: WidgetDraft) => void>();
    render(
      <WidgetEditorForm canShareWithCollection submitLabel="Add widget" onSubmit={onSubmit} onCancel={() => undefined} />,
    );
    const toggle = screen.getByRole('switch', { name: 'Show in every scene' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    fireEvent.change(screen.getByPlaceholderText('Widget name'), { target: { value: 'Fear' } });
    fireEvent.submit(toggle.closest('form')!);
    expect(onSubmit.mock.calls[0]![0].scope).toBe('collection');
  });

  it('keeps widgets of scenes outside a collection on their scene', () => {
    expect(submitNew(false).scope).toBe('scene');
  });

  it('keeps the scope of an existing widget', () => {
    expect(submitNew(true, { type: 'counter', label: 'Torches' }).scope).toBe('scene');
    cleanup();
    expect(submitNew(true, { type: 'counter', label: 'Fear', scope: 'collection' }).scope).toBe('collection');
  });
});
