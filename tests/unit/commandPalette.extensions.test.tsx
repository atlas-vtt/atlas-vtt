import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

const { ui } = vi.hoisted(() => ({ ui: { view: {} as unknown } }));

vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app: {}, view: ui.view }),
}));
vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));

import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { CommandPalette } from '../../src/app/react/components/CommandPalette';
import { paletteSlot } from '../../src/app/extensions/slots';
import type { PaletteSection } from '../../src/api/types/ui';

function renderPalette(isOpen = true): { onClose: ReturnType<typeof vi.fn>; rerender: (open: boolean) => void } {
  const store = create(() => ({ isPlayerView: false }));
  const onClose = vi.fn();
  const view = (open: boolean): React.ReactElement => (
    <ViewStoreProvider store={store as never}><CommandPalette isOpen={open} onClose={onClose} /></ViewStoreProvider>
  );
  const { rerender } = render(view(isOpen));
  return { onClose, rerender: (open) => rerender(view(open)) };
}

const option = (label: string): HTMLElement | null => screen.queryByRole('button', { name: new RegExp(`^${label}`) });

const headers = (): Array<string | null> =>
  Array.from(document.querySelectorAll('.atlas-command-palette-section-header')).map((el) => el.textContent);

function section(overrides: Partial<PaletteSection> = {}): PaletteSection {
  return {
    id: 'notes', title: 'Extra tools',
    commands: () => [{ id: 'open', icon: 'network', label: 'Quick notes', keywords: ['host'], run: vi.fn() }],
    ...overrides,
  };
}

function add(paletteSection: PaletteSection): () => void {
  let remove = (): void => undefined;
  act(() => { remove = paletteSlot.add('ext', paletteSection); });
  return () => act(() => { remove(); });
}

describe('Extension sections in the command palette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ui.view = { viewId: 'view-1' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    expect(paletteSlot.list()).toHaveLength(0);
  });

  it('has no extra section while nothing is registered', () => {
    renderPalette();
    expect(headers()).not.toContain('Extra tools');
    expect(headers()).toContain('Tools');
  });

  it('lists a section\'s commands under its title, after Atlas\'s own, and runs one then closes', () => {
    const run = vi.fn();
    const remove = add(section({ commands: () => [{ id: 'open', icon: 'network', label: 'Quick notes', run }] }));
    const { onClose } = renderPalette();
    expect(headers().at(-1)).toBe('Extra tools');
    fireEvent.click(option('Quick notes')!);
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    remove();
  });

  it('passes the view context to the section and finds a command by its keywords', () => {
    const commands = vi.fn(() => [{ id: 'open', icon: 'network', label: 'Quick notes', keywords: ['host'], run: vi.fn() }]);
    const remove = add(section({ commands }));
    renderPalette();
    expect(commands).toHaveBeenCalledWith({ viewId: 'view-1', kind: 'map', isPlayerView: false });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'host' } });
    expect(option('Quick notes')).not.toBeNull();
    remove();
  });

  it('asks for commands only while the palette is open, and again after invalidate', () => {
    let label = 'First';
    const remove = add(section({ commands: () => [{ id: 'c', icon: 'x', label, run: vi.fn() }] }));
    const { rerender } = renderPalette(false);
    expect(option('First')).toBeNull();
    rerender(true);
    expect(option('First')).not.toBeNull();
    label = 'Second';
    act(() => { paletteSlot.invalidate(); });
    expect(option('Second')).not.toBeNull();
    remove();
  });

  it('shows nothing of a section whose commands throw, and keeps Atlas\'s own', () => {
    const remove = add(section({ commands: () => { throw new Error('boom'); } }));
    renderPalette();
    expect(headers()).not.toContain('Extra tools');
    expect(headers()).toContain('Tools');
    remove();
  });

  it('skips malformed commands, logs them, and keeps the valid ones', () => {
    const run = vi.fn();
    const remove = add(section({
      commands: () => [
        null, { id: 'nolabel', run }, { label: 'No id', run }, { id: 'norun', label: 'No run' },
        { id: 'ok', icon: 'x', label: 'Quick notes', run },
      ] as never,
    }));
    renderPalette();
    expect(option('Quick notes')).not.toBeNull();
    expect(option('No id')).toBeNull();
    expect(option('No run')).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('malformed'), null);
    remove();
  });

  it('skips a command whose keywords are not a list of text, and keeps the palette working', () => {
    const run = vi.fn();
    const remove = add(section({
      commands: () => [
        { id: 'num', icon: 'x', label: 'Number keywords', keywords: 5, run },
        { id: 'nul', icon: 'x', label: 'Null keyword', keywords: [null], run },
        { id: 'ok', icon: 'x', label: 'Quick notes', keywords: ['host'], run },
      ] as never,
    }));
    expect(() => renderPalette()).not.toThrow();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'host' } });
    expect(option('Quick notes')).not.toBeNull();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'keyword' } });
    expect(option('Number keywords')).toBeNull();
    expect(option('Null keyword')).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('malformed'), expect.objectContaining({ id: 'num' }));
    remove();
  });

  it('reads each field of a command once, so a getter cannot answer differently later', () => {
    const reads: number[] = [];
    const fresh = (): object => {
      const at = reads.push(0) - 1;
      return { id: 'ok', icon: 'x', run: vi.fn(), keywords: ['host'], get label(): string { reads[at] += 1; return reads[at] === 1 ? 'Quick notes' : (5 as never); } };
    };
    const remove = add(section({ commands: () => [fresh()] as never }));
    expect(() => renderPalette()).not.toThrow();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'host' } });
    expect(option('Quick notes')).not.toBeNull();
    expect(reads.every((count) => count === 1)).toBe(true);
    remove();
  });

  it('shows nothing, without throwing, when commands returns no list', () => {
    const remove = add(section({ commands: () => 5 as never }));
    expect(() => renderPalette()).not.toThrow();
    expect(headers()).not.toContain('Extra tools');
    remove();
  });

  it('still closes when a command throws', () => {
    const remove = add(section({ commands: () => [{ id: 'c', icon: 'x', label: 'Quick notes', run: () => { throw new Error('boom'); } }] }));
    const { onClose } = renderPalette();
    fireEvent.click(option('Quick notes')!);
    expect(onClose).toHaveBeenCalledOnce();
    remove();
  });

  it('is gone once the section is removed', () => {
    const remove = add(section());
    renderPalette();
    expect(option('Quick notes')).not.toBeNull();
    remove();
    expect(option('Quick notes')).toBeNull();
  });
});
