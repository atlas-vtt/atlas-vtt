// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { updateSettingsRows } from '../../../src/app/updates/updateSettingsRows';
import type { UpdateWatch } from '../../../src/app/updates/UpdateWatch';

function fakeWatch(): { watch: UpdateWatch; set(version: string | null): void; listeners: Set<() => void>; check: ReturnType<typeof vi.fn> } {
  let version: string | null = null;
  const listeners = new Set<() => void>();
  const check = vi.fn(async () => undefined);
  const watch = {
    available: () => version,
    isChecking: () => false,
    onChange: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    check,
  } as unknown as UpdateWatch;
  return { watch, set: (next) => { version = next; listeners.forEach(listener => listener()); }, listeners, check };
}

function renderStatus(watch: UpdateWatch): { name: () => string; text: () => string; isFilled: () => boolean; click: () => void; cleanup: () => void } {
  let name = '';
  const controlEl = document.createElement('div');
  const setting = {
    controlEl,
    setName(next: string) { name = next; return setting; },
  };
  const row = updateSettingsRows({} as never, watch)[0]!;
  const cleanup = row.render(setting as never) as () => void;
  const button = (): HTMLButtonElement => controlEl.querySelector('button')!;
  return { name: () => name, text: () => button().textContent ?? '', isFilled: () => button().classList.contains('btn--default'), click: () => button().click(), cleanup };
}

describe('updates status row', () => {
  it('offers Check now while up to date and Update once a release is out', () => {
    const { watch, set, check } = fakeWatch();
    const row = renderStatus(watch);
    expect(row.name()).toBe('Atlas is up to date');
    expect(row.text()).toBe('Check now');
    expect(row.isFilled()).toBe(false);
    row.click();
    expect(check).toHaveBeenCalledWith({ force: true });

    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    set('0.9.0');
    expect(row.name()).toBe('Atlas 0.9.0 is available');
    expect(row.text()).toBe('Update');
    expect(row.isFilled()).toBe(true);
    row.click();
    expect(open).toHaveBeenCalledWith('obsidian://show-plugin?id=atlas-vtt');
    open.mockRestore();
  });

  it('stops listening when the settings close', () => {
    const { watch, listeners } = fakeWatch();
    renderStatus(watch).cleanup();
    expect(listeners.size).toBe(0);
  });
});
